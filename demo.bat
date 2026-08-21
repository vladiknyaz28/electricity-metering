@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "apps\backend\package.json" (
  echo ERROR: apps\backend\package.json not found.
  pause
  exit /b 1
)

if not exist "apps\frontend\package.json" (
  echo ERROR: apps\frontend\package.json not found.
  pause
  exit /b 1
)

if not exist "apps\frontend\node_modules\.bin\vite.cmd" (
  echo ERROR: apps\frontend\node_modules\.bin\vite.cmd not found.
  echo Run npm install in the monorepo root first.
  pause
  exit /b 1
)

netstat -ano | findstr ":5433" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo ERROR: PostgreSQL is not listening on localhost:5433.
  echo In Docker Desktop, start container: db
  pause
  exit /b 1
)

netstat -ano | findstr ":4001" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo ERROR: Port 4001 is already in use.
  echo Run stop-demo.bat first, then try again.
  pause
  exit /b 1
)

netstat -ano | findstr ":5173" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo ERROR: Port 5173 is already in use.
  echo Run stop-demo.bat first, then try again.
  pause
  exit /b 1
)

echo Starting demo backend...
set "DATABASE_URL=postgresql://electricity:electricity@localhost:5433/electricity_metering_demo?schema=public"
set "PORT=4001"
start "EnergyKontur Demo Backend" /D "%~dp0apps\backend" cmd /k npm run start:dev

timeout /t 4 /nobreak >nul

echo Starting demo frontend...
set "VITE_API_BASE_URL=http://localhost:4001"
start "EnergyKontur Demo Frontend" /D "%~dp0apps\frontend" cmd /k npm run dev -- --mode demo --port 5173

timeout /t 3 /nobreak >nul
start "" "http://localhost:5173/"
exit /b 0