#!/usr/bin/env pwsh
# Deploy to Pi - 192.168.1.11
# Quick deployment script for the updated IP address

param(
    [string]$PiIP = "192.168.1.11",
    [string]$PiUser = "pi",
    [switch]$SkipBuild,
    [switch]$RestartServices
)

Write-Host "🚀 Deploying to Pi - $PiIP" -ForegroundColor Cyan

# Step 1: Build locally (unless skipped)
if (-not $SkipBuild) {
    Write-Host "`n1️⃣ Building locally..." -ForegroundColor Green
    try {
        npm run build
        Write-Host "✅ Local build completed" -ForegroundColor Green
    } catch {
        Write-Host "❌ Local build failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`n1️⃣ Skipping local build..." -ForegroundColor Yellow
}

# Step 2: Push to Git
Write-Host "`n2️⃣ Pushing to Git..." -ForegroundColor Green
try {
    git add .
    git status
    $commitMsg = Read-Host "Enter commit message (or press Enter for default)"
    if ([string]::IsNullOrWhiteSpace($commitMsg)) {
        $commitMsg = "deploy: update for Pi IP 192.168.1.11"
    }
    git commit -m $commitMsg
    git push origin main
    Write-Host "✅ Pushed to Git" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Git push failed or no changes to commit" -ForegroundColor Yellow
}

# Step 3: Deploy to Pi
Write-Host "`n3️⃣ Deploying to Pi..." -ForegroundColor Green
$deployCommand = @"
cd /home/pi/eform-locker
git pull origin main
npm run build
echo '✅ Deployment completed'
"@

ssh "$PiUser@$PiIP" $deployCommand

# Step 4: Restart services if requested
if ($RestartServices) {
    Write-Host "`n4️⃣ Restarting services..." -ForegroundColor Green
    $restartCommand = @"
cd /home/pi/eform-locker
sudo pkill -f 'node.*' 2>/dev/null || true
sleep 3
./scripts/start-all-clean.sh &
sleep 5
echo '✅ Services restarted'
"@
    
    ssh "$PiUser@$PiIP" $restartCommand
} else {
    Write-Host "`n4️⃣ Skipping service restart..." -ForegroundColor Yellow
    Write-Host "   To restart manually: ssh $PiUser@$PiIP 'cd /home/pi/eform-locker && ./scripts/start-all-clean.sh'" -ForegroundColor White
}

# Step 5: Health check
Write-Host "`n5️⃣ Health check..." -ForegroundColor Green
Start-Sleep -Seconds 5

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

Write-Host "`n🎉 Deployment completed!" -ForegroundColor Cyan
Write-Host "📋 Access URLs:" -ForegroundColor Yellow
Write-Host "   - Gateway: http://$PiIP:3000" -ForegroundColor White
Write-Host "   - Panel:   http://$PiIP:3001" -ForegroundColor White  
Write-Host "   - Kiosk:   http://$PiIP:3002" -ForegroundColor White

Write-Host "`n🔧 Test commands:" -ForegroundColor Yellow
Write-Host "   node test-pi-connection-192-168-1-11.js" -ForegroundColor White
Write-Host "   ssh $PiUser@$PiIP 'cd /home/pi/eform-locker && node scripts/test-basic-relay-control.js'" -ForegroundColor White