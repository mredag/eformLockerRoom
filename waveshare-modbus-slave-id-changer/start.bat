@echo off
title Waveshare Modbus Slave ID Changer
echo.
echo ============================================================
echo   Waveshare Modbus Slave ID Changer
echo   For 16CH and 32CH Relay Cards
echo ============================================================
echo.

:: Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

:: Run the tool
node index.js

pause
