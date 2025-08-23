# Fix Kiosk Startup Issues
# This script helps diagnose and fix common kiosk startup problems

Write-Host "🔧 Eform Locker - Kiosk Startup Fix Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Check Node.js version
Write-Host "📋 Checking Node.js version..." -ForegroundColor Yellow
node --version
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: Not in the project root directory" -ForegroundColor Red
    Write-Host "Please run this script from the eform-locker project root" -ForegroundColor Red
    exit 1
}

# Check if kiosk directory exists
if (-not (Test-Path "app/kiosk")) {
    Write-Host "❌ Error: app/kiosk directory not found" -ForegroundColor Red
    exit 1
}

Write-Host "🧹 Cleaning old build artifacts..." -ForegroundColor Yellow
if (Test-Path "app/kiosk/dist") {
    Remove-Item -Recurse -Force "app/kiosk/dist"
}
if (Test-Path "app/kiosk/node_modules/.cache") {
    Remove-Item -Recurse -Force "app/kiosk/node_modules/.cache"
}
Write-Host "✅ Cleaned build artifacts" -ForegroundColor Green

Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
Set-Location "app/kiosk"
npm install
Write-Host "✅ Dependencies installed" -ForegroundColor Green

Write-Host "🔨 Building kiosk service..." -ForegroundColor Yellow
npm run build
Write-Host "✅ Build completed" -ForegroundColor Green

# Check if dist/index.js exists
if (-not (Test-Path "dist/index.js")) {
    Write-Host "❌ Error: Build failed - dist/index.js not found" -ForegroundColor Red
    exit 1
}

Write-Host "🔍 Checking build output..." -ForegroundColor Yellow
Get-ChildItem "dist/" | Format-Table
Write-Host ""

# Test the built file for syntax errors
Write-Host "🧪 Testing built file for syntax errors..." -ForegroundColor Yellow
$syntaxCheck = node -c "dist/index.js" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ No syntax errors found" -ForegroundColor Green
} else {
    Write-Host "❌ Syntax errors found in built file" -ForegroundColor Red
    Write-Host $syntaxCheck -ForegroundColor Red
    exit 1
}

Write-Host "✅ Kiosk startup fix completed!" -ForegroundColor Green
Write-Host ""
Write-Host "To start the kiosk service:" -ForegroundColor Cyan
Write-Host "  cd app/kiosk" -ForegroundColor White
Write-Host "  npm start" -ForegroundColor White
Write-Host ""
Write-Host "If you still get errors on Raspberry Pi, check:" -ForegroundColor Cyan
Write-Host "  1. Serial port permissions: sudo usermod -a -G dialout `$USER" -ForegroundColor White
Write-Host "  2. USB device permissions: ls -la /dev/ttyUSB*" -ForegroundColor White
Write-Host "  3. Environment variables: echo `$MODBUS_PORT" -ForegroundColor White

# Return to original directory
Set-Location ".."