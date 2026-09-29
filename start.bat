@echo off
REM Starts backend (8000) and frontend (5173). Requires Python 3.11+ and Node 18+.
cd /d "%~dp0"
pip install -r requirements.txt
if not exist frontend\node_modules (cd frontend && call npm install && cd ..)
start "HeatShield backend" cmd /k "cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
cd frontend
call npm run dev
