#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
.venv/bin/ruff check backend
.venv/bin/ruff format --check backend
(cd backend && ../.venv/bin/python -m pytest -q)
(cd frontend && npm test && npm run build)
