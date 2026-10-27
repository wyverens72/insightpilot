"""Research endpoints keep jobs and selected evidence separate from imported reviews."""

import os
import threading
from typing import List

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field, SecretStr

from . import research
from .web_reader import WebProblem


class DiscoverRequest(BaseModel):
    url: str = Field(min_length=3, max_length=2000)
    name: str = Field(default="", max_length=100)
    use_ai: bool = False


class AnalyzeRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    source_ids: List[str] = Field(min_length=1, max_length=9)
    use_ai: bool = False


class KeyRequest(BaseModel):
    key: SecretStr


def router(path, app):
    api = APIRouter(prefix="/api/research", tags=["Public research"])
    gate = threading.BoundedSemaphore(2)
    lock = threading.Lock()
    app.state.research_key = None

    def run(function, *args):
        try:
            function(*args)
        finally:
            gate.release()

    @api.get("")
    def history():
        return research.history(path)

    @api.post("/settings")
    def configure(body: KeyRequest):
        key = body.key.get_secret_value().strip()
        if len(key) < 20 or len(key) > 512 or any(c.isspace() for c in key):
            raise HTTPException(
                422,
                "Enter a valid API key. It is kept only until this server restarts.",
            )
        app.state.research_key = key
        return {"configured": True}

    @api.post("/discover", status_code=202)
    def discover(body: DiscoverRequest, background: BackgroundTasks):
        with lock:
            if not gate.acquire(blocking=False):
                raise HTTPException(
                    429,
                    "Two research tasks are already running. Wait for one to finish.",
                )
            try:
                doc = research.create(path, body.url, body.name.strip())
            except WebProblem as exc:
                gate.release()
                raise HTTPException(422, str(exc)) from exc
            background.add_task(
                run,
                research.discover,
                path,
                doc["id"],
                (app.state.research_key or os.getenv("OPENAI_API_KEY"))
                if body.use_ai
                else None,
            )
        return doc

    @api.get("/{research_id}")
    def detail(research_id: str):
        doc = research.get(path, research_id)
        if not doc:
            raise HTTPException(404, "This research session was not found.")
        return doc

    @api.post("/{research_id}/analyze", status_code=202)
    def analyze(research_id: str, body: AnalyzeRequest, background: BackgroundTasks):
        with lock:
            doc = research.get(path, research_id, internal=True)
            if not doc:
                raise HTTPException(404, "This research session was not found.")
            if doc["status"] not in ("ready", "complete"):
                raise HTTPException(
                    409, "Wait for source discovery to finish before analyzing."
                )
            available = {
                s["id"] for s in doc["sources"] if s["status"] != "unavailable"
            }
            if not set(body.source_ids) <= available or not body.name.strip():
                raise HTTPException(
                    422, "Select available sources and confirm the product name."
                )
            key = app.state.research_key or os.getenv("OPENAI_API_KEY")
            if body.use_ai and not key:
                raise HTTPException(
                    422, "Configure an OpenAI key or choose the local source digest."
                )
            if not gate.acquire(blocking=False):
                raise HTTPException(
                    429,
                    "Two research tasks are already running. Wait for one to finish.",
                )
            doc.update(
                status="analyzing",
                name=body.name.strip(),
                error=None,
                report=None,
                selected_ids=body.source_ids,
            )
            research.save(path, doc)
            background.add_task(
                run,
                research.analyze,
                path,
                research_id,
                body.source_ids,
                body.name.strip(),
                key if body.use_ai else None,
                body.use_ai,
            )
        return research.get(path, research_id)

    return api
