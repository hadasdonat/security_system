@echo off
echo ==========================================
echo           STARTING SENTRY OS
echo ==========================================
echo.

echo [1/3] Starting Ollama with Moondream AI...
start "Ollama - SENTRY OS" cmd /c "ollama run moondream"

echo [2/3] Starting SENTRY Python Backend Server...
start "Python Backend - SENTRY OS" cmd /c "python serve.py"

echo.
echo Waiting 3 seconds for services to boot...
timeout /t 3 /nobreak > nul

echo [3/3] Launching SENTRY OS Web Interface...
start http://localhost:8000/index.html

echo.
echo ==========================================
echo          SENTRY OS IS ONLINE
echo ==========================================
echo Keep the newly opened terminal windows running in the background.
echo You may close this window.
pause
