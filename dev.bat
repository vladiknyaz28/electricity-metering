@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   Electricity Metering — dev
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:4000
echo ============================================
echo.

echo [1/3] PostgreSQL (Docker)...
docker compose up -d postgres
if errorlevel 1 (
  echo.
  echo Не удалось запустить postgres. Проверьте, что Docker Desktop запущен.
  echo Без БД backend не поднимется.
  pause
)

echo [2/3] Backend...
start "EM Backend" cmd /k "npm run dev:backend"

echo [3/3] Frontend...
start "EM Frontend" cmd /k "npm run dev:frontend"

echo.
echo Окна Backend и Frontend открыты. Остановка: stop.bat или Ctrl+C в каждом окне.
timeout /t 3 >nul
