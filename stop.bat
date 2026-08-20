@echo off
chcp 65001 >nul
echo Останавливаю backend (:4000) и frontend (:5173/:5174)...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000" ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5174" ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo Готово. (Postgres в Docker не останавливался — при необходимости: docker compose stop postgres)
timeout /t 2 >nul
