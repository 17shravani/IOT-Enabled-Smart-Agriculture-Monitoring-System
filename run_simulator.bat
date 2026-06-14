@echo off
title AgriNexus AI Startup Gateway
echo =============================================================
echo               AGRINEXUS AI STARTUP GATEWAY
echo =============================================================
echo.

:: Check for Python installation
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not added to your system PATH.
    echo Please install Python 3.9+ and try again.
    pause
    exit /b 1
)

:: Create virtual environment if it doesn't exist
if not exist "venv" (
    echo [SYSTEM] Virtual environment 'venv' not found. Creating one now...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
      )
)

:: Activate Virtual Environment
echo [SYSTEM] Activating Python virtual environment...
call venv\Scripts\activate

:: Install dependencies
echo [SYSTEM] Verifying packages installation...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install required packages.
    pause
    exit /b 1
)

:: Run Gateway Server
echo.
echo =============================================================
echo   AgriNexus AI Gateway server is starting on:
echo   URL: http://127.0.0.1:5000
echo   (Press Ctrl+C to stop the gateway server)
echo =============================================================
echo.

:: Automatically open browser
start http://127.0.0.1:5000

:: Run the FastAPI app
python apps/dashboard/main.py

pause
