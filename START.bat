@echo off
title Antigravity - Unified Stock Dashboard

echo.
echo  ====================================================
echo   ANTIGRAVITY - Unified Stock Trading Dashboard
echo  ====================================================
echo.

:: 1. Clean up any stale instances on ports 8000 and 5173 or old uvicorn/vite instances
echo [1/4] Checking ports and cleaning up any stale instances...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports = @(8000, 5173); foreach ($p in $ports) { $procs = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($pidVal in $procs) { if ($pidVal -and $pidVal -gt 0) { Stop-Process -Id $pidVal -Force -ErrorAction SilentlyContinue } } }; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*uvicorn main:app*' -or $_.CommandLine -like '*vite*' -or ($_.Name -match 'python' -and $_.CommandLine -like '*Antigravity*backend*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

:: 2. Start Backend API
echo [2/4] Starting Backend API (FastAPI)...
start "Antigravity Backend" cmd /k "cd /d "%~dp0backend" && ..\venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

:: 3. Actively wait for Backend to become ready
echo [3/4] Waiting for Backend to be online (http://127.0.0.1:8000)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$maxRetries = 40; $ready = $false; for ($i = 0; $i -lt $maxRetries; $i++) { try { $res = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/' -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop; if ($res.StatusCode -eq 200) { $ready = $true; break } } catch { Start-Sleep -Milliseconds 500 } }; if (-not $ready) { Write-Host 'Backend startup timed out.' -ForegroundColor Red } else { Write-Host 'Backend is online!' -ForegroundColor Green }"

:: 4. Start Frontend
echo [4/4] Starting Frontend (React + Vite)...
start "Antigravity Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

:: Wait for Vite dev server to respond
powershell -NoProfile -ExecutionPolicy Bypass -Command "$maxRetries = 30; $ready = $false; for ($i = 0; $i -lt $maxRetries; $i++) { try { $res = Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop; if ($res.StatusCode -eq 200) { $ready = $true; break } } catch { Start-Sleep -Milliseconds 500 } }; if ($ready) { Write-Host 'Frontend is online!' -ForegroundColor Green }"

:: Open the browser automatically
echo.
echo  Opening browser at http://localhost:5173 ...
echo  Login with:  username=admin  /  password=admin
echo.
start http://localhost:5173

echo  ====================================================
echo  Both servers started successfully!
echo  Backend API: http://127.0.0.1:8000
echo  Frontend:    http://localhost:5173
echo  API Docs:    http://127.0.0.1:8000/docs
echo  ====================================================
echo.
echo  To stop all servers cleanly, run STOP.bat or close the server windows.
echo.
pause
