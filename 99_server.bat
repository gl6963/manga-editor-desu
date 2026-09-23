@echo off
cd /d "%~dp0"
echo Starting Manga Editor Desu local server...
echo URL: http://localhost:8000
start http://localhost:8000
python 99_server.py
pause
