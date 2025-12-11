# Create Fully Portable Version with Embedded Python
# This creates a folder with everything needed - no installation required

param(
    [string]$OutputDir = "WaveshareModbusChanger-Portable"
)

$ErrorActionPreference = "Stop"

Write-Host "Creating fully portable version..." -ForegroundColor Cyan

# Create output directory
if (Test-Path $OutputDir) {
    Remove-Item $OutputDir -Recurse -Force
}
New-Item -ItemType Directory -Path $OutputDir | Out-Null

Write-Host "Downloading portable Python..." -ForegroundColor Yellow

# Download Python embeddable package
$pythonUrl = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip"
$pythonZip = "python-embed.zip"

try {
    Invoke-WebRequest -Uri $pythonUrl -OutFile $pythonZip
    Expand-Archive -Path $pythonZip -DestinationPath "$OutputDir\python"
    Remove-Item $pythonZip
    Write-Host "✅ Python downloaded and extracted" -ForegroundColor Green
}
catch {
    Write-Host "❌ Failed to download Python: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Copy our script
Copy-Item "modbus_slave_changer.py" "$OutputDir\"

# Create requirements and install script
@"
pyserial==3.5
"@ | Out-File "$OutputDir\requirements.txt" -Encoding ASCII

# Create launcher script
@"
@echo off
title Waveshare Modbus Slave ID Changer
cd /d "%~dp0"

echo Installing dependencies (first run only)...
python\python.exe -m pip install --target . -r requirements.txt >nul 2>&1

echo Starting Waveshare Modbus Slave ID Changer...
python\python.exe modbus_slave_changer.py
pause
"@ | Out-File "$OutputDir\START.bat" -Encoding ASCII

Write-Host "✅ Fully portable version created in: $OutputDir" -ForegroundColor Green
Write-Host "📁 Copy this entire folder to any Windows PC and run START.bat" -ForegroundColor Cyan