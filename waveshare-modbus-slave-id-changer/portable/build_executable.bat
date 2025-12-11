@echo off
title Building Portable Executable
echo.
echo ============================================================
echo   Building Waveshare Modbus Slave ID Changer
echo   Portable Executable (No Installation Required)
echo ============================================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo Python is not installed or not in PATH
    echo.
    echo Options:
    echo   1. Auto-install Python (recommended)
    echo   2. Manual installation
    echo   3. Cancel
    echo.
    set /p choice="Enter your choice (1-3): "
    
    if "%choice%"=="1" goto auto_install
    if "%choice%"=="2" goto manual_install
    if "%choice%"=="3" goto cancel
    
    echo Invalid choice. Exiting.
    goto cancel
)

goto python_ready

:auto_install
echo.
echo ============================================================
echo   Auto-Installing Python
echo ============================================================
echo.
echo Downloading Python installer...

:: Create temp directory
if not exist "temp" mkdir temp

:: Download Python installer (latest 3.11.x which is stable)
echo Downloading Python 3.11.9 installer...
powershell -Command "& {Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe' -OutFile 'temp\python-installer.exe'}"

if not exist "temp\python-installer.exe" (
    echo Failed to download Python installer.
    echo Please check your internet connection and try again.
    goto manual_install
)

echo.
echo Installing Python (this may take a few minutes)...
echo - Adding Python to PATH
echo - Installing pip package manager
echo - Setting up for all users
echo.

:: Install Python silently with all required options
"temp\python-installer.exe" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0 Include_doc=0 Include_dev=0 Include_debug=0 Include_launcher=1 InstallLauncherAllUsers=1

:: Wait for installation to complete
timeout /t 10 /nobreak >nul

:: Clean up installer
del "temp\python-installer.exe" >nul 2>&1
rmdir "temp" >nul 2>&1

echo.
echo Python installation completed.
echo Refreshing environment variables...

:: Refresh PATH for current session
call refreshenv >nul 2>&1

:: Alternative method to refresh PATH
for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "SysPath=%%b"
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "UserPath=%%b"
set "PATH=%SysPath%;%UserPath%"

:: Test Python installation
echo Testing Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo Python installation may need a system restart to work properly.
    echo Please restart your computer and run this script again.
    echo.
    echo Alternatively, you can:
    echo 1. Close this window
    echo 2. Open a new Command Prompt
    echo 3. Run this script again
    echo.
    pause
    exit /b 1
)

echo Python is now ready!
goto python_ready

:manual_install
echo.
echo ============================================================
echo   Manual Python Installation
echo ============================================================
echo.
echo Please follow these steps:
echo.
echo 1. Go to https://python.org/downloads/
echo 2. Download Python 3.7 or newer
echo 3. During installation, CHECK "Add Python to PATH"
echo 4. Complete the installation
echo 5. Restart this script
echo.
echo Opening Python download page...
start https://python.org/downloads/
echo.
pause
exit /b 1

:cancel
echo Operation cancelled.
pause
exit /b 1

:python_ready
echo Python is available. Continuing with build...

:: Install required packages
echo Installing required packages...
python -m pip install --upgrade pip
python -m pip install pyserial pyinstaller

:: Build executable
echo.
echo Building executable...
python -m PyInstaller --onefile --console --name "WaveshareModbusSlaveChanger" modbus_slave_changer.py

:: Check if build was successful
if exist "dist\WaveshareModbusSlaveChanger.exe" (
    echo.
    echo ============================================================
    echo   BUILD SUCCESSFUL!
    echo ============================================================
    echo.
    echo Executable created: dist\WaveshareModbusSlaveChanger.exe
    echo.
    echo You can now copy this .exe file to any Windows computer
    echo and run it without installing Python or any dependencies.
    echo.
    echo File size: 
    dir "dist\WaveshareModbusSlaveChanger.exe" | findstr "WaveshareModbusSlaveChanger.exe"
    echo.
) else (
    echo.
    echo BUILD FAILED!
    echo Check the output above for errors.
)

pause