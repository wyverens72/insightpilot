import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import research
from .analysis import summarize
from .brief import generate_brief
from .db import get_reviews, initialize
from .importer import MAX_BYTES, ImportProblem, import_csv
from .research_routes import router as research_router

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


def create_app(database_path=None):
    path = str(
        database_path or os.getenv("DATABASE_PATH", ROOT / "data" / "insightpilot.db")
    )

    @asynccontextmanager
    async def lifespan(app):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        initialize(path)
        research.initialize_research(path)
        yield

    app = FastAPI(title="InsightPilot API", version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    app.include_router(research_router(path, app))

    @app.get("/api/health")
    def health():
        return {
            "status": "ok",
            "ai_configured": bool(
                os.getenv("OPENAI_API_KEY") or app.state.research_key
            ),
        }

    def filtered(source, sentiment, q):
        return get_reviews(path, source, sentiment, q)

    @app.get("/api/dashboard")
    def dashboard(
        source: Optional[str] = None,
        sentiment: Optional[str] = None,
        q: Optional[str] = Query(None, max_length=200),
    ):
        reviews = filtered(source, sentiment, q)
        return {
            **summarize(reviews),
            "available_sources": summarize(get_reviews(path))["sources"],
        }

    @app.get("/api/reviews")
    def reviews(
        source: Optional[str] = None,
        sentiment: Optional[str] = None,
        q: Optional[str] = Query(None, max_length=200),
        page: int = Query(1, ge=1),
        page_size: int = Query(12, ge=1, le=100),
    ):
        rows = filtered(source, sentiment, q)
        return {
            "items": rows[(page - 1) * page_size : page * page_size],
            "total": len(rows),
            "page": page,
            "page_size": page_size,
        }

    @app.post("/api/import")
    async def upload(file: UploadFile = File(...)):
        try:
            content = await file.read(MAX_BYTES + 1)
            return import_csv(path, content)
        except ImportProblem as exc:
            raise HTTPException(422, str(exc)) from exc
        finally:
            await file.close()

    @app.post("/api/demo")
    def demo():
        return import_csv(path, (ROOT / "sample-data" / "reviews.csv").read_bytes())

    @app.post("/api/brief")
    def brief(
        source: Optional[str] = None,
        sentiment: Optional[str] = None,
        q: Optional[str] = Query(None, max_length=200),
        demo: bool = False,
    ):
        rows = filtered(source, sentiment, q)
        if not rows:
            raise HTTPException(
                422, "Import reviews or broaden your filters before generating a brief."
            )
        if demo:
            from .brief import local_brief

            return local_brief(
                rows, "Local mode selected. No reviews were sent to an AI provider."
            )
        return generate_brief(rows, key=app.state.research_key)

    dist = ROOT / "frontend" / "dist"
    if dist.exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/")
        def index():
            return FileResponse(dist / "index.html")

    return app


app = create_app()
