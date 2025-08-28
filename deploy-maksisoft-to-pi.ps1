# Deploy Maksisoft Integration to Raspberry Pi
# This script deploys the Maksisoft integration to your Pi

Write-Host "🚀 Deploying Maksisoft Integration to Raspberry Pi..." -ForegroundColor Green
Write-Host ""

# Step 1: Deploy code to Pi
Write-Host "📦 Step 1: Deploying code to Pi..." -ForegroundColor Yellow
$result = ssh pi@pi-eform-locker "cd /home/pi/eform-locker && git pull origin main"
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Code deployed successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to deploy code" -ForegroundColor Red
    exit 1
}

# Step 2: Build panel service on Pi
Write-Host "🔨 Step 2: Building panel service..." -ForegroundColor Yellow
$result = ssh pi@pi-eform-locker "cd /home/pi/eform-locker && npm run build:panel"
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Panel service built successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to build panel service" -ForegroundColor Red
    exit 1
}

# Step 3: Copy environment file to Pi
Write-Host "⚙️ Step 3: Copying environment configuration..." -ForegroundColor Yellow
$result = scp .env pi@pi-eform-locker:/home/pi/eform-locker/.env
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Environment file copied successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to copy environment file" -ForegroundColor Red
    exit 1
}

# Step 4: Restart services on Pi
Write-Host "🔄 Step 4: Restarting services..." -ForegroundColor Yellow
$result = ssh pi@pi-eform-locker "cd /home/pi/eform-locker && ./scripts/start-all-clean.sh"
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Services restarted successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to restart services" -ForegroundColor Red
    exit 1
}

# Step 5: Test the integration
Write-Host "🧪 Step 5: Testing Maksisoft integration..." -ForegroundColor Yellow
Start-Sleep -Seconds 5  # Wait for services to start

try {
    # Test the status endpoint
    $statusResponse = Invoke-RestMethod -Uri "http://192.168.1.8:3001/api/maksi/status" -Method Get -TimeoutSec 10
    if ($statusResponse.enabled) {
        Write-Host "✅ Maksisoft integration is enabled" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Maksisoft integration is disabled" -ForegroundColor Yellow
    }
    
    # Test the search endpoint
    $searchResponse = Invoke-RestMethod -Uri "http://192.168.1.8:3001/api/maksi/search-by-rfid?rfid=0006851540" -Method Get -TimeoutSec 10
    if ($searchResponse.success) {
        Write-Host "✅ Maksisoft search is working - found $($searchResponse.hits.Count) records" -ForegroundColor Green
    } else {
        Write-Host "❌ Maksisoft search failed: $($searchResponse.error)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "⚠️ Could not test integration - services may still be starting" -ForegroundColor Yellow
    Write-Host "   Try testing manually in a few minutes" -ForegroundColor Gray
}

Write-Host ""
Write-Host "🎉 Deployment Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Open admin panel: http://192.168.1.8:3001/lockers" -ForegroundColor White
Write-Host "2. Look for 'Maksisoft' buttons on locker cards" -ForegroundColor White
Write-Host "3. Click a button to test member search" -ForegroundColor White
Write-Host ""
Write-Host "🔧 Manual Testing Commands:" -ForegroundColor Cyan
Write-Host "curl http://192.168.1.8:3001/api/maksi/status" -ForegroundColor Gray
Write-Host "curl 'http://192.168.1.8:3001/api/maksi/search-by-rfid?rfid=0006851540'" -ForegroundColor Gray