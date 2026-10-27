#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v python3 >/dev/null || { echo "Install Python 3.9 or newer first."; exit 1; }
command -v npm >/dev/null || { echo "Install Node.js 22.12 or newer first."; exit 1; }
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
(cd frontend && npm ci && npm run build)
printf '\nSetup complete. Run ./scripts/start.sh and open http://127.0.0.1:8000\n'
