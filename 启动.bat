@echo off
chcp 936 >nul
cd /d "%~dp0"
echo ===================================================
echo   漫画编辑器 Manga Editor Desu 本地服务
echo   正在打开浏览器: http://localhost:8000
echo   (请保持此黑色窗口开启，关闭则服务停止)
echo ===================================================
start http://localhost:8000
python 99_server.py
pause
