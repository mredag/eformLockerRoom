# Start Eform Locker Services on Windows (Development Mode)
# This script starts all services for local development and testing

Write-Host "🚀 Starting Eform Locker System (Windows Development Mode)" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green

# Set development environment variables
$env:NODE_ENV = "development"
$env:KIOSK_ID = "kiosk-dev-1"
$env:ZONE = "development"
$env:GATEWAY_URL = "http://127.0.0.1:3000"
$env:MODBUS_PORT = "COM1"  # Will be ignored in test mode
$env:RFID_READER_TYPE = "keyboard"
$env:EFORM_DB_PATH = ".\data\eform-dev.db"

Write-Host "🔧 Environment Configuration:" -ForegroundColor Yellow
Write-Host "   - NODE_ENV: $env:NODE_ENV"
Write-Host "   - KIOSK_ID: $env:KIOSK_ID"
Write-Host "   - Database: $env:EFORM_DB_PATH"
Write-Host "   - Hardware: Test mode (no real hardware required)"

# Create data directory if it doesn't exist
if (!(Test-Path "data")) {
    New-Item -ItemType Directory -Path "data" -Force | Out-Null
    Write-Host "📁 Created data directory" -ForegroundColor Green
}

# Create logs directory if it doesn't exist
if (!(Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs" -Force | Out-Null
    Write-Host "📁 Created logs directory" -ForegroundColor Green
}

# Stop any existing Node.js processes (optional)
Write-Host "🛑 Stopping any existing services..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "*eform*" -or $_.CommandLine -like "*gateway*" -or $_.CommandLine -like "*kiosk*" -or $_.CommandLine -like "*panel*" } | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Seconds 2

# Function to start a service in a new PowerShell window
function Start-ServiceWindow {
    param(
        [string]$ServiceName,
        [string]$Command,
        [int]$Port,
        [string]$LogFile
    )
    
    $windowTitle = "Eform $ServiceName (Port $Port)"
    $startCommand = "cd '$PWD'; $Command 2>&1 | Tee-Object -FilePath '$LogFile'"
    
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "& { `$Host.UI.RawUI.WindowTitle = '$windowTitle'; $startCommand }" -WindowStyle Normal
    
    Write-Host "   ✅ $ServiceName started in new window (Port $Port)" -ForegroundColor Green
    Write-Host "      Log: $LogFile" -ForegroundColor Gray
}

# Start services in separate windows
Write-Host "🚀 Starting services in separate windows..." -ForegroundColor Yellow

# Start Gateway (Port 3000)
Start-ServiceWindow -ServiceName "Gateway" -Command "npm run start:gateway" -Port 3000 -LogFile "logs\gateway-dev.log"
Start-Sleep -Seconds 3

# Start Kiosk (Port 3002) 
Start-ServiceWindow -ServiceName "Kiosk" -Command "npm run start:kiosk" -Port 3002 -LogFile "logs\kiosk-dev.log"
Start-Sleep -Seconds 3

# Start Panel (Port 3001)
Start-ServiceWindow -ServiceName "Panel" -Command "npm run start:panel" -Port 3001 -LogFile "logs\panel-dev.log"
Start-Sleep -Seconds 3

# Wait a bit for services to start
Write-Host "⏳ Waiting for services to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Check service health
Write-Host "🔍 Checking service health..." -ForegroundColor Yellow

try {
    $gatewayHealth = Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 5 -ErrorAction SilentlyContinue
    if ($gatewayHealth.status) {
        Write-Host "   ✅ Gateway: $($gatewayHealth.status)" -ForegroundColor Green
    }
} catch {
    Write-Host "   ⚠️  Gateway: Not responding (may still be starting)" -ForegroundColor Yellow
}

try {
    $kioskHealth = Invoke-RestMethod -Uri "http://localhost:3002/health" -TimeoutSec 5 -ErrorAction SilentlyContinue
    if ($kioskHealth.status) {
        Write-Host "   ✅ Kiosk: $($kioskHealth.status)" -ForegroundColor Green
    }
} catch {
    Write-Host "   ⚠️  Kiosk: Not responding (may still be starting)" -ForegroundColor Yellow
}

try {
    $panelResponse = Invoke-WebRequest -Uri "http://localhost:3001" -TimeoutSec 5 -ErrorAction SilentlyContinue
    if ($panelResponse.StatusCode -eq 200) {
        Write-Host "   ✅ Panel: Running" -ForegroundColor Green
    }
} catch {
    Write-Host "   ⚠️  Panel: Not responding (may still be starting)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 Development services started!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Access URLs:" -ForegroundColor Cyan
Write-Host "   - Gateway API: http://localhost:3000" -ForegroundColor White
Write-Host "   - Kiosk UI: http://localhost:3002" -ForegroundColor White
Write-Host "   - Admin Panel: http://localhost:3001" -ForegroundColor White
Write-Host ""
Write-Host "📊 Health Checks:" -ForegroundColor Cyan
Write-Host "   - Gateway: http://localhost:3000/health" -ForegroundColor White
Write-Host "   - Kiosk: http://localhost:3002/health" -ForegroundColor White
Write-Host ""
Write-Host "📋 Development Features:" -ForegroundColor Cyan
Write-Host "   - Hardware simulation (no real relay cards needed)" -ForegroundColor White
Write-Host "   - Keyboard RFID simulation" -ForegroundColor White
Write-Host "   - Separate database (eform-dev.db)" -ForegroundColor White
Write-Host "   - Debug logging enabled" -ForegroundColor White
Write-Host ""
Write-Host "🛑 To stop all services:" -ForegroundColor Red
Write-Host "   Close the PowerShell windows or run: Get-Process node | Stop-Process" -ForegroundColor White
Write-Host ""
Write-Host "📝 Logs are saved to the logs/ directory" -ForegroundColor Gray

# Keep this window open
Write-Host ""
Write-Host "Press any key to close this window..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")