@echo off
title Build Portable Executable
echo.
echo ============================================================
echo   Waveshare Modbus Slave ID Changer - Builder
echo ============================================================
echo.
echo This will create a portable .exe file that works on any PC
echo without requiring Python installation.
echo.

:: Try PowerShell version first (better features)
echo Checking PowerShell availability...
powershell -Command "Get-Host" >nul 2>&1
if not errorlevel 1 (
    echo Using PowerShell builder (recommended)...
    powershell -ExecutionPolicy Bypass -File "Build-Executable.ps1"
    goto end
)

:: Fall back to batch version
echo PowerShell not available, using batch builder...
call build_executable.bat

:end
echo.
echo Build process completed.
pause