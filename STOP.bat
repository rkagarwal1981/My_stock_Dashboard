@echo off
title Stop Antigravity Servers

echo.
echo  ====================================================
echo   ANTIGRAVITY - Stopping Servers
echo  ====================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports = @(8000, 5173); foreach ($p in $ports) { $procs = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($pidVal in $procs) { if ($pidVal -and $pidVal -gt 0) { Stop-Process -Id $pidVal -Force -ErrorAction SilentlyContinue } } }; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*uvicorn main:app*' -or $_.CommandLine -like '*vite*' -or ($_.Name -match 'python' -and $_.CommandLine -like '*Antigravity*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Write-Host 'Antigravity backend and frontend stopped successfully.' -ForegroundColor Green"

echo.
echo  All Antigravity servers have been stopped.
echo.
ping 127.0.0.1 -n 2 >nul
