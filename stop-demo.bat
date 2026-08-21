@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo Stopping demo processes on ports 4001 and 5173 only...
echo.

call :StopListeningPort 4001
call :StopListeningPort 5173

echo.
echo Demo processes stopped.
endlocal
exit /b 0

:StopListeningPort
set "PORT=%~1"
set "SEEN="
set "FOUND="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  echo !SEEN! | findstr /c:"[%%P]" >nul
  if errorlevel 1 (
    set "SEEN=!SEEN![%%P]"
    set "FOUND=1"
    echo Port %PORT%: stopping PID %%P
    taskkill /PID %%P /T /F >nul 2>&1
    if errorlevel 1 (
      echo Port %PORT%: failed to stop PID %%P
    ) else (
      echo Port %PORT%: stopped PID %%P
    )
  )
)
if not defined FOUND (
  echo Port %PORT%: free ^(no LISTENING process^)
)
goto :eof
