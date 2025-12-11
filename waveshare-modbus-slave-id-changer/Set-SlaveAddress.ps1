# Waveshare Modbus Slave ID Changer - PowerShell Wrapper
# Quick script for setting slave addresses

param(
    [Parameter(Mandatory=$false)]
    [string]$Port,
    
    [Parameter(Mandatory=$false)]
    [int]$NewAddress,
    
    [Parameter(Mandatory=$false)]
    [int]$CurrentAddress = 0,
    
    [switch]$Broadcast,
    [switch]$Scan,
    [switch]$Interactive
)

$ErrorActionPreference = "Stop"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Waveshare Modbus Slave ID Changer" -ForegroundColor Cyan
Write-Host "  For 16CH and 32CH Relay Cards" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check if node_modules exists
if (-not (Test-Path "$scriptPath\node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    Push-Location $scriptPath
    npm install
    Pop-Location
    Write-Host ""
}

# Interactive mode
if ($Interactive -or (-not $Port -and -not $Scan)) {
    Push-Location $scriptPath
    node index.js
    Pop-Location
    exit
}

# Scan mode
if ($Scan) {
    if (-not $Port) {
        Write-Host "Available COM ports:" -ForegroundColor Yellow
        Get-WmiObject Win32_SerialPort | ForEach-Object {
            Write-Host "  $($_.DeviceID) - $($_.Description)" -ForegroundColor White
        }
        Write-Host ""
        $Port = Read-Host "Enter COM port"
    }
    
    Push-Location $scriptPath
    node index.js scan --port $Port
    Pop-Location
    exit
}

# Set address mode
if ($NewAddress) {
    if (-not $Port) {
        Write-Host "Available COM ports:" -ForegroundColor Yellow
        Get-WmiObject Win32_SerialPort | ForEach-Object {
            Write-Host "  $($_.DeviceID) - $($_.Description)" -ForegroundColor White
        }
        Write-Host ""
        $Port = Read-Host "Enter COM port"
    }
    
    if ($Broadcast -or $CurrentAddress -eq 0) {
        Write-Host ""
        Write-Host "⚠️  WARNING: Using BROADCAST mode!" -ForegroundColor Yellow
        Write-Host "   This will affect ALL connected devices." -ForegroundColor Yellow
        Write-Host "   Make sure only ONE card is connected!" -ForegroundColor Yellow
        Write-Host ""
        
        $confirm = Read-Host "Are you sure only ONE card is connected? (yes/no)"
        if ($confirm -ne "yes") {
            Write-Host "Operation cancelled." -ForegroundColor Red
            exit
        }
        
        Push-Location $scriptPath
        node index.js set --port $Port --broadcast --new $NewAddress
        Pop-Location
    } else {
        Push-Location $scriptPath
        node index.js set --port $Port --current $CurrentAddress --new $NewAddress
        Pop-Location
    }
    exit
}

# Show help
Write-Host "Usage:" -ForegroundColor Yellow
Write-Host "  .\Set-SlaveAddress.ps1 -Interactive" -ForegroundColor White
Write-Host "      Run interactive mode (recommended)" -ForegroundColor Gray
Write-Host ""
Write-Host "  .\Set-SlaveAddress.ps1 -Scan -Port COM3" -ForegroundColor White
Write-Host "      Scan for devices on COM3" -ForegroundColor Gray
Write-Host ""
Write-Host "  .\Set-SlaveAddress.ps1 -Port COM3 -NewAddress 2 -Broadcast" -ForegroundColor White
Write-Host "      Set slave address to 2 using broadcast (single card only!)" -ForegroundColor Gray
Write-Host ""
Write-Host "  .\Set-SlaveAddress.ps1 -Port COM3 -CurrentAddress 1 -NewAddress 2" -ForegroundColor White
Write-Host "      Change address from 1 to 2" -ForegroundColor Gray
Write-Host ""

Write-Host "Examples for your 32CH card setup:" -ForegroundColor Cyan
Write-Host "  # First card (connect alone, set to address 1):" -ForegroundColor Gray
Write-Host "  .\Set-SlaveAddress.ps1 -Port COM3 -NewAddress 1 -Broadcast" -ForegroundColor White
Write-Host ""
Write-Host "  # Second card (connect alone, set to address 2):" -ForegroundColor Gray
Write-Host "  .\Set-SlaveAddress.ps1 -Port COM3 -NewAddress 2 -Broadcast" -ForegroundColor White
