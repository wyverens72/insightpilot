#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -x .venv/bin/python || ! -f frontend/dist/index.html ]]; then
  echo "Run ./scripts/setup.sh first."
  exit 1
fi
exec .venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port "${PORT:-8000}"
