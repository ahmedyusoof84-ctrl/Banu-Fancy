@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 22 or 24, then try again.
  pause
  exit /b 1
)
node scripts/launch.js
if errorlevel 1 pause
