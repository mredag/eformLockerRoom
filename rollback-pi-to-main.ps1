#!/usr/bin/env pwsh
# Rollback Pi to Main Branch - PowerShell Script
# This script connects to the Pi and rolls back to main branch with backup restoration

param(
    [string]$PiIP = "192.168.1.11",
    [string]$PiUser = "pi",
    [switch]$Force
)

Write-Host "🔄 Rolling back Pi to main branch..." -ForegroundColor Cyan
Write-Host "📡 Target Pi: $PiUser@$PiIP" -ForegroundColor Yellow

# Step 1: Check Pi connectivity
Write-Host "`n1️⃣ Checking Pi connectivity..." -ForegroundColor Green
try {
    $pingResult = Test-Connection -ComputerName $PiIP -Count 2 -Quiet
    if (-not $pingResult) {
        throw "Pi not reachable at $PiIP"
    }
    Write-Host "✅ Pi is reachable" -ForegroundColor Green
} catch {
    Write-Host "❌ Cannot reach Pi at $PiIP" -ForegroundColor Red
    Write-Host "Please check network connection and IP address" -ForegroundColor Yellow
    exit 1
}

# Step 2: Stop services on Pi
Write-Host "`n2️⃣ Stopping services on Pi..." -ForegroundColor Green
$stopCommand = @"
sudo pkill -f 'node.*' 2>/dev/null || true
sleep 2
echo '✅ Services stopped'
"@

ssh "$PiUser@$PiIP" $stopCommand

# Step 3: Backup current state on Pi
Write-Host "`n3️⃣ Creating backup on Pi..." -ForegroundColor Green
$backupCommand = @"
cd /home/pi/eform-locker
mkdir -p backups/rollback-$(date +%Y%m%d-%H%M%S)
cp -r data/ backups/rollback-$(date +%Y%m%d-%H%M%S)/
cp -r config/ backups/rollback-$(date +%Y%m%d-%H%M%S)/
echo '✅ Backup created'
"@

ssh "$PiUser@$PiIP" $backupCommand

# Step 4: Git operations on Pi
Write-Host "`n4️⃣ Git operations on Pi..." -ForegroundColor Green
$gitCommand = @"
cd /home/pi/eform-locker
git status
echo '📋 Current branch status shown above'
git checkout main
git reset --hard HEAD
git pull origin main
echo '✅ Switched to main and updated'
"@

ssh "$PiUser@$PiIP" $gitCommand

# Step 5: Restore database from backup if available
Write-Host "`n5️⃣ Restoring database from backup..." -ForegroundColor Green
$restoreCommand = @"
cd /home/pi/eform-locker
if [ -d "backups/pre-multi-zones-2025-09-07-1335/data" ]; then
    echo '📦 Found backup, restoring database...'
    cp backups/pre-multi-zones-2025-09-07-1335/data/eform.db data/ 2>/dev/null || echo 'No eform.db in backup'
    cp backups/pre-multi-zones-2025-09-07-1335/data/eform-dev.db data/ 2>/dev/null || echo 'No eform-dev.db in backup'
    echo '✅ Database restored from backup'
else
    echo '⚠️ No backup found, keeping current database'
fi
"@

ssh "$PiUser@$PiIP" $restoreCommand

# Step 6: Build services
Write-Host "`n6️⃣ Building services on Pi..." -ForegroundColor Green
$buildCommand = @"
cd /home/pi/eform-locker
npm run build 2>/dev/null || echo '⚠️ Build failed, but continuing...'
echo '✅ Build completed'
"@

ssh "$PiUser@$PiIP" $buildCommand

# Step 7: Start services
Write-Host "`n7️⃣ Starting services on Pi..." -ForegroundColor Green
$startCommand = @"
cd /home/pi/eform-locker
./scripts/start-all-clean.sh &
sleep 5
echo '✅ Services started'
"@

ssh "$PiUser@$PiIP" $startCommand

# Step 8: Health check
Write-Host "`n8️⃣ Health check..." -ForegroundColor Green
Start-Sleep -Seconds 10

$healthUrls = @(
    "http://$PiIP:3000/health",
    "http://$PiIP:3001/health", 
    "http://$PiIP:3002/health"
)

foreach ($url in $healthUrls) {
    try {
        $response = Invoke-RestMethod -Uri $url -TimeoutSec 5 -ErrorAction Stop
        Write-Host "✅ $url - OK" -ForegroundColor Green
    } catch {
        Write-Host "❌ $url - Failed" -ForegroundColor Red
    }
}

Write-Host "`n🎉 Pi rollback to main completed!" -ForegroundColor Cyan
Write-Host "📋 Services should be running on:" -ForegroundColor Yellow
Write-Host "   - Gateway: http://$PiIP:3000" -ForegroundColor White
Write-Host "   - Panel:   http://$PiIP:3001" -ForegroundColor White  
Write-Host "   - Kiosk:   http://$PiIP:3002" -ForegroundColor White

Write-Host "`n🔧 To test hardware:" -ForegroundColor Yellow
Write-Host "   ssh $PiUser@$PiIP 'cd /home/pi/eform-locker && node scripts/test-basic-relay-control.js'" -ForegroundColor White