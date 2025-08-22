# Node.js 20 LTS Upgrade Script for Windows
# This script upgrades Node.js from v18 to v20 LTS on Windows

Write-Host "🚀 Starting Node.js 20 LTS upgrade..." -ForegroundColor Green

# Check current Node.js version
$currentVersion = node --version
Write-Host "📋 Current Node.js version: $currentVersion" -ForegroundColor Cyan

# Check if already on Node.js 20
if ($currentVersion -match "^v20\.") {
    Write-Host "✅ Already running Node.js 20 LTS" -ForegroundColor Green
    exit 0
}

# Backup current Node.js version info
Write-Host "💾 Backing up current environment info..." -ForegroundColor Yellow
node --version | Out-File -FilePath "$env:TEMP\nodejs-backup-version.txt"
npm --version | Out-File -FilePath "$env:TEMP\npm-backup-version.txt"

# Stop all eForm services (if running as services)
Write-Host "🛑 Stopping eForm services..." -ForegroundColor Yellow
try {
    Stop-Service -Name "eform-gateway" -ErrorAction SilentlyContinue
    Stop-Service -Name "eform-kiosk" -ErrorAction SilentlyContinue
    Stop-Service -Name "eform-panel" -ErrorAction SilentlyContinue
} catch {
    Write-Host "⚠️  Services may not be installed as Windows services" -ForegroundColor Yellow
}

# Download and install Node.js 20 LTS
Write-Host "📦 Installing Node.js 20 LTS..." -ForegroundColor Cyan

# Check if winget is available
if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "Using winget to install Node.js 20 LTS..." -ForegroundColor Cyan
    winget install OpenJS.NodeJS.LTS
} elseif (Get-Command choco -ErrorAction SilentlyContinue) {
    Write-Host "Using Chocolatey to install Node.js 20 LTS..." -ForegroundColor Cyan
    choco install nodejs-lts -y
} else {
    Write-Host "❌ Neither winget nor Chocolatey found." -ForegroundColor Red
    Write-Host "Please install Node.js 20 LTS manually from https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "Or install winget/Chocolatey first." -ForegroundColor Yellow
    exit 1
}

# Refresh environment variables
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Verify installation
$newVersion = node --version
Write-Host "✅ New Node.js version: $newVersion" -ForegroundColor Green

# Verify it's Node.js 20
if (-not ($newVersion -match "^v20\.")) {
    Write-Host "❌ Failed to install Node.js 20. Current version: $newVersion" -ForegroundColor Red
    exit 1
}

# Update npm to latest compatible version
Write-Host "📦 Updating npm..." -ForegroundColor Cyan
npm install -g npm@latest

# Verify npm version
$npmVersion = npm --version
Write-Host "✅ npm version: $npmVersion" -ForegroundColor Green

# Reinstall node_modules to ensure compatibility
Write-Host "🔄 Reinstalling dependencies..." -ForegroundColor Cyan

# Find eForm installation directory
$eformPath = $null
if (Test-Path "C:\opt\eform-locker-system") {
    $eformPath = "C:\opt\eform-locker-system"
} elseif (Test-Path "$env:USERPROFILE\eform-locker-system") {
    $eformPath = "$env:USERPROFILE\eform-locker-system"
} elseif (Test-Path ".\package.json") {
    $eformPath = "."
} else {
    Write-Host "❌ Could not find eForm installation directory" -ForegroundColor Red
    exit 1
}

Set-Location $eformPath

# Clean and reinstall dependencies
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force "node_modules"
}
if (Test-Path "package-lock.json") {
    Remove-Item -Force "package-lock.json"
}

npm install

# Run quick validation
Write-Host "🧪 Running validation tests..." -ForegroundColor Cyan
try {
    npm run validate:nodejs
} catch {
    Write-Host "⚠️  Some validation checks failed. Please check the system manually." -ForegroundColor Yellow
}

# Start services (if they were running as services)
Write-Host "🚀 Starting eForm services..." -ForegroundColor Green
try {
    Start-Service -Name "eform-gateway" -ErrorAction SilentlyContinue
    Start-Service -Name "eform-kiosk" -ErrorAction SilentlyContinue
    Start-Service -Name "eform-panel" -ErrorAction SilentlyContinue
} catch {
    Write-Host "⚠️  Services may need to be started manually" -ForegroundColor Yellow
}

Write-Host "✅ Node.js 20 LTS upgrade completed successfully!" -ForegroundColor Green
Write-Host "📋 Previous version: $currentVersion" -ForegroundColor Cyan
Write-Host "📋 New version: $newVersion" -ForegroundColor Cyan
Write-Host ""
Write-Host "🔍 Next steps:" -ForegroundColor Yellow
Write-Host "1. Monitor system logs for any issues"
Write-Host "2. Run full integration tests"
Write-Host "3. Test hardware communication"
Write-Host "4. Verify all features are working correctly"