@echo off
title Quick Set Slave Address
echo.
echo ============================================================
echo   Quick Slave Address Configuration
echo   WARNING: Only connect ONE card at a time!
echo ============================================================
echo.

set /p PORT="Enter COM port (e.g., COM3): "
set /p NEWADDR="Enter NEW slave address (1-247): "

echo.
echo You are about to set slave address to %NEWADDR% using broadcast mode.
echo This will affect ALL connected devices!
echo.
set /p CONFIRM="Are you sure only ONE card is connected? (yes/no): "

if /i "%CONFIRM%"=="yes" (
    echo.
    echo Setting slave address to %NEWADDR%...
    node index.js set --port %PORT% --broadcast --new %NEWADDR%
) else (
    echo Operation cancelled.
)

echo.
pause
