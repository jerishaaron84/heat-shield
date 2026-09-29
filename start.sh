#!/usr/bin/env bash
# Starts backend (8000) and frontend (5173). Requires Python 3.11+ and Node 18+.
set -e
cd "$(dirname "$0")"
pip install -r requirements.txt
[ -d frontend/node_modules ] || (cd frontend && npm install)
(cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000) &
BACK=$!
trap "kill $BACK" EXIT
cd frontend && npm run dev
