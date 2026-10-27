import csv
import io

import pytest
from fastapi.testclient import TestClient

from app.analysis import classify
from app.importer import MAX_BYTES
from app.main import create_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with TestClient(create_app(tmp_path / "test.db")) as instance:
        yield instance


def upload(client, text):
    return client.post(
        "/api/import", files={"file": ("reviews.csv", text.encode(), "text/csv")}
    )


def test_empty_workspace_and_brief_guard(client):
    assert client.get("/api/health").json() == {"status": "ok", "ai_configured": False}
    assert client.get("/api/dashboard").json()["total"] == 0
    assert client.post("/api/brief").status_code == 422


def test_import_metrics_filters_and_duplicate_detection(client):
    data = 'text,rating,date,source\n"Great support, helpful team",5,2026-10-20,G2\n"Slow report export",2,2026-09-20,App Store\n"Search is adequate",3,2026-10-10,G2\n'
    result = upload(client, data).json()
    assert result == {"imported": 3, "duplicates": 0, "rejected": 0, "errors": []}
    assert upload(client, data).json()["duplicates"] == 3
    dashboard = client.get("/api/dashboard").json()
    assert dashboard["total"] == 3
    assert dashboard["average_rating"] == 3.33
    assert dashboard["positive_share"] == 33
    assert dashboard["sentiments"] == {"positive": 1, "neutral": 1, "negative": 1}
    assert dashboard["trend"][0]["month"] == "2026-09"
    assert client.get("/api/dashboard?source=G2").json()["total"] == 2
    assert (
        client.get("/api/reviews?sentiment=negative").json()["items"][0]["rating"] == 2
    )
    assert client.get("/api/reviews?q=HELPFUL").json()["total"] == 1
    assert client.get("/api/reviews?q=%27%20OR%201%3D1--").json()["total"] == 0
    assert (
        client.get("/api/reviews?page=2&page_size=2").json()["items"][0]["date"]
        == "2026-09-20"
    )
    assert client.get("/api/reviews?page=0").status_code == 422


def test_partial_import_and_validation(client):
    result = upload(
        client,
        "text,rating,date,source\nGood review,4,2026-10-20,G2\nBad rating,7,2026-10-20,G2\nBad date,2,yesterday,G2\nx,3,2026-10-20,G2\n",
    ).json()
    assert result["imported"] == 1
    assert result["rejected"] == 3
    assert [e["row"] for e in result["errors"]] == [3, 4, 5]
    assert upload(client, "review,rating\nhello,5").status_code == 422
    assert upload(client, "text,text\na,b").status_code == 422
    assert upload(client, "text\n").status_code == 422
    assert upload(client, "text,rating\nExtra,3,field").json()["rejected"] == 1
    assert (
        client.post("/api/import", files={"file": ("bad.csv", b"\xff\xfe")}).status_code
        == 422
    )
    assert (
        client.post(
            "/api/import", files={"file": ("large.csv", b"x" * (MAX_BYTES + 1))}
        ).status_code
        == 422
    )
    assert upload(client, "text\n" + "\n".join(["Review"] * 5001)).status_code == 422
    assert client.get("/api/dashboard").json()["total"] == 1


def test_optional_columns_bom_and_rating_priority(client):
    assert upload(client, '\ufefftext\n"Great easy onboarding"').json()["imported"] == 1
    item = client.get("/api/reviews").json()["items"][0]
    assert item["source"] == "CSV import"
    assert item["rating"] is None
    assert item["sentiment"] == "positive"
    assert classify("Great support but a terrible crash", 2)[0] == "negative"
    assert classify("The setup is confusing")[0] == "negative"
    assert classify("An ordinary Tuesday")[1] == ["Other"]


def test_demo_is_repeatable_and_brief_uses_filtered_evidence(client):
    assert client.post("/api/demo").json()["imported"] == 36
    assert client.post("/api/demo").json()["duplicates"] == 36
    response = client.post("/api/brief?sentiment=negative&demo=true").json()
    assert response["mode"] == "demo"
    assert (
        response["review_count"]
        == client.get("/api/dashboard?sentiment=negative").json()["total"]
    )
    assert "Review #" in response["content"]
    assert "No reviews were sent" in response["notice"]


def test_persistence_across_app_restarts(tmp_path):
    path = tmp_path / "persistent.db"
    with TestClient(create_app(path)) as client:
        assert upload(client, "text\nA useful review").json()["imported"] == 1
    with TestClient(create_app(path)) as client:
        assert client.get("/api/dashboard").json()["total"] == 1


def test_ai_failure_falls_back_without_exposing_secrets(client, monkeypatch):
    import httpx

    monkeypatch.setenv("OPENAI_API_KEY", "private-test-key")
    original_post = httpx.Client.post

    def fail(self, url, **kwargs):
        if url != "https://api.openai.com/v1/responses":
            return original_post(self, url, **kwargs)
        raise httpx.ConnectError("private-test-key")

    monkeypatch.setattr(httpx.Client, "post", fail)
    upload(client, "text,rating\nGreat support,5")
    response = client.post("/api/brief").json()
    assert response["mode"] == "demo"
    assert "unavailable" in response["notice"]
    assert "private-test-key" not in str(response)


def test_ai_response_and_payload(client, monkeypatch):
    import httpx

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    original_post = httpx.Client.post

    def fake_post(self, url, **kwargs):
        if url != "https://api.openai.com/v1/responses":
            return original_post(self, url, **kwargs)
        assert url == "https://api.openai.com/v1/responses"
        assert kwargs["json"]["store"] is False
        assert "untrusted" in kwargs["json"]["instructions"]
        return httpx.Response(
            200,
            request=httpx.Request("POST", url),
            json={
                "status": "completed",
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": "## Findings\nSupport is valued [Review #1].",
                            }
                        ],
                    }
                ],
            },
        )

    monkeypatch.setattr(httpx.Client, "post", fake_post)
    upload(client, "text,rating\nGreat support,5")
    result = client.post("/api/brief").json()
    assert result["mode"] == "ai"
    assert "Support is valued" in result["content"]


def test_csv_quoted_multiline(client):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["text", "rating"])
    writer.writerow(["Great support,\nand an easy setup.", 5])
    assert upload(client, buffer.getvalue()).json()["imported"] == 1
    assert "\n" in client.get("/api/reviews").json()["items"][0]["text"]
