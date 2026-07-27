@echo off
title Antigravity - Unified Stock Dashboard

echo.
echo  ====================================================
echo   ANTIGRAVITY - Unified Stock Trading Dashboard
echo  ====================================================
echo.

:: Start Backend
echo [1/2] Starting Backend API (FastAPI)...
start "Antigravity Backend" cmd /k "cd /d "%~dp0backend" && ..\venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

:: Wait 3 seconds for backend to initialize
timeout /t 3 /nobreak >nul

:: Start Frontend
echo [2/2] Starting Frontend (React + Vite)...
start "Antigravity Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

:: Wait 3 seconds for frontend to start
timeout /t 3 /nobreak >nul

:: Open the browser automatically
echo.
echo  Opening browser at http://localhost:5173 ...
echo  Login with:  username=admin  /  password=admin
echo.
start http://localhost:5173

echo  Both servers started successfully!
echo  Backend API: http://127.0.0.1:8000
echo  Frontend:    http://localhost:5173
echo  API Docs:    http://127.0.0.1:8000/docs
echo.
echo  Close the two server windows to stop the application.
pause
