# eForm Locker Rollback Deployment Script
# Rolls back Pi to pre-hardware-wizard implementation

param(
    [string]$PiHost = "pi@192.168.1.11"
)

Write-Host ""
Write-Host "🔄 eForm Locker Rollback Deployment" -ForegroundColor Magenta
Write-Host "====================================" -ForegroundColor Magenta
Write-Host ""

# Step 1: Stop services
Write-Host "1️⃣ Stopping services on Pi..." -ForegroundColor Yellow
ssh $PiHost "sudo pkill -f 'node.*eform' || true"
ssh $PiHost "sudo systemctl stop eform-locker || true"
Start-Sleep -Seconds 3

# Step 2: Backup current state
Write-Host "2️⃣ Creating backup of current Pi state..." -ForegroundColor Yellow
$BackupName = "backup-before-rollback-$(Get-Date -Format 'yyyy-MM-dd-HHmm')"
ssh $PiHost "cd /home/pi/eform-locker; git branch $BackupName || true"

# Step 3: Pull rollback changes
Write-Host "3️⃣ Pulling rollback from main branch..." -ForegroundColor Yellow
ssh $PiHost "cd /home/pi/eform-locker; git fetch origin"
ssh $PiHost "cd /home/pi/eform-locker; git reset --hard origin/main"

# Step 4: Clean build artifacts
Write-Host "4️⃣ Cleaning build artifacts..." -ForegroundColor Yellow
ssh $PiHost "cd /home/pi/eform-locker; rm -rf app/*/dist node_modules/@eform"

# Step 5: Install dependencies
Write-Host "5️⃣ Installing dependencies..." -ForegroundColor Yellow
ssh $PiHost "cd /home/pi/eform-locker; npm install"

# Step 6: Build services
Write-Host "6️⃣ Building services..." -ForegroundColor Yellow
ssh $PiHost "cd /home/pi/eform-locker; npm run build:gateway"
ssh $PiHost "cd /home/pi/eform-locker; npm run build:kiosk"
ssh $PiHost "cd /home/pi/eform-locker; npm run build:panel"

# Step 7: Verify database integrity
Write-Host "7️⃣ Verifying database integrity..." -ForegroundColor Yellow
ssh $PiHost "cd /home/pi/eform-locker; sqlite3 data/eform.db 'PRAGMA integrity_check;'"

# Step 8: Start services
Write-Host "8️⃣ Starting services..." -ForegroundColor Green
ssh $PiHost "cd /home/pi/eform-locker; ./scripts/start-all-clean.sh"
Start-Sleep -Seconds 10

# Step 9: Health check
Write-Host "9️⃣ Running health check..." -ForegroundColor Blue
ssh $PiHost "cd /home/pi/eform-locker && bash scripts/deployment/health-check.sh"

# Step 10: Test hardware
Write-Host "🔟 Testing hardware connectivity..." -ForegroundColor Blue
ssh $PiHost "cd /home/pi/eform-locker; node scripts/test-basic-relay-control.js"

Write-Host ""
Write-Host "✅ Rollback deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Web Interfaces:" -ForegroundColor Cyan
Write-Host "   Admin Panel: http://192.168.1.11:3001" -ForegroundColor White
Write-Host "   Kiosk UI:    http://192.168.1.11:3002" -ForegroundColor White
Write-Host "   Gateway API: http://192.168.1.11:3000" -ForegroundColor White
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Cyan
Write-Host "   - Test RFID functionality" -ForegroundColor White
Write-Host "   - Verify locker operations" -ForegroundColor White
Write-Host "   - Check admin panel access" -ForegroundColor White
Write-Host ""