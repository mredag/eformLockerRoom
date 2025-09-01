@echo off
echo 🔍 Discovering eForm Pi...

set "ips=192.168.1.8 192.168.1.10 192.168.1.20 192.168.1.30 192.168.1.40"
set "found="

for %%i in (%ips%) do (
    echo Testing %%i...
    ping -n 1 -w 1000 %%i >nul 2>&1
    if !errorlevel! equ 0 (
        ssh pi@%%i "test -d /home/pi/eform-locker && echo OK" 2>nul | findstr "OK" >nul
        if !errorlevel! equ 0 (
            echo ✅ Found eForm Pi at %%i
            set "found=%%i"
            goto :found
        ) else (
            echo ❌ No eForm project at %%i
        )
    ) else (
        echo ❌ No response from %%i
    )
)

:found
if defined found (
    echo.
    echo ✅ eForm Pi discovered at: %found%
    echo 🌐 Admin Panel: http://%found%:3001
    echo 🌐 Kiosk UI: http://%found%:3002
    echo 🔧 SSH: ssh pi@%found%
) else (
    echo.
    echo ❌ No eForm Pi found on network
    echo 💡 Check your router's DHCP client list
)

pause