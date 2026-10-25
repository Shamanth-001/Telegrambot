@echo off
REM StreamBreaker local download worker (Radarr/Sonarr -> Telegram channel -> hub).
REM Runs natively so the file paths Radarr/Sonarr report match this PC.
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo Creating virtual environment...
    python -m venv .venv
    .venv\Scripts\python -m pip install -r requirements.txt
)
.venv\Scripts\python request_processor.py
pause
