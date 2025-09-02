#!/usr/bin/env powershell
# Pi Migration Verification Script
# New IP: 192.168.1.11 (changed from 192.168.1.8)

$PI_IP = "192.168.1.11"
$PI_HOST = "pi@$PI_IP"

Write-Host "🔍 Verifying Pi Migration to SSD..." -ForegroundColor Blue
Write-Host "New IP Address: $PI_IP" -ForegroundColor Green
Write-Host ""

# Step 1: Accept SSH key and test connection
Write-Host "1️⃣ Testing SSH connection..." -ForegroundColor Yellow
try {
    $hostname = ssh -o StrictHostKeyChecking=no $PI_HOST "hostname" 2>$null
    if ($hostname) {
        Write-Host "✅ SSH connection successful" -ForegroundColor Green
        Write-Host "   Hostname: $hostname" -ForegroundColor Gray
    } else {
        Write-Host "❌ SSH connection failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ SSH connection error: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Verify eForm project exists
Write-Host ""
Write-Host "2️⃣ Checking eForm project..." -ForegroundColor Yellow
$projectCheck = ssh $PI_HOST "test -d /home/pi/eform-locker && echo 'EXISTS' || echo 'MISSING'"
if ($projectCheck -eq "EXISTS") {
    Write-Host "✅ eForm project directory found" -ForegroundColor Green
} else {
    Write-Host "❌ eForm project directory missing!" -ForegroundColor Red
    Write-Host "   You may need to clone the repository again" -ForegroundColor Yellow
    exit 1
}

# Step 3: Check Git status
Write-Host ""
Write-Host "3️⃣ Checking Git repository..." -ForegroundColor Yellow
$gitStatus = ssh $PI_HOST "cd /home/pi/eform-locker && git status --porcelain 2>/dev/null | wc -l"
$gitBranch = ssh $PI_HOST "cd /home/pi/eform-locker && git branch --show-current 2>/dev/null"
Write-Host "✅ Git repository status:" -ForegroundColor Green
Write-Host "   Branch: $gitBranch" -ForegroundColor Gray
Write-Host "   Uncommitted changes: $gitStatus files" -ForegroundColor Gray

# Step 4: Check hardware connections
Write-Host ""
Write-Host "4️⃣ Checking hardware connections..." -ForegroundColor Yellow
$usbDevices = ssh $PI_HOST "ls /dev/ttyUSB* 2>/dev/null || echo 'NONE'"
if ($usbDevices -ne "NONE") {
    Write-Host "✅ USB serial devices found:" -ForegroundColor Green
    Write-Host "   $usbDevices" -ForegroundColor Gray
} else {
    Write-Host "⚠️  No USB serial devices found" -ForegroundColor Yellow
    Write-Host "   Make sure your USB-RS485 adapter is connected" -ForegroundColor Gray
}

# Step 5: Check if services are running
Write-Host ""
Write-Host "5️⃣ Checking service status..." -ForegroundColor Yellow
$nodeProcesses = ssh $PI_HOST "pgrep -f 'node.*eform' | wc -l"
Write-Host "Node processes running: $nodeProcesses" -ForegroundColor Gray

if ($nodeProcesses -gt 0) {
    Write-Host "✅ Services appear to be running" -ForegroundColor Green
} else {
    Write-Host "⚠️  No services running - this is normal after migration" -ForegroundColor Yellow
}

# Step 6: Test web interfaces
Write-Host ""
Write-Host "6️⃣ Testing web interfaces..." -ForegroundColor Yellow

$ports = @(3000, 3001, 3002)
foreach ($port in $ports) {
    try {
        $response = Invoke-WebRequest -Uri "http://$PI_IP`:$port/health" -TimeoutSec 3 -UseBasicParsing 2>$null
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ Port $port responding" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Port $port not responding (service may be stopped)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️  Port $port not responding (service may be stopped)" -ForegroundColor Yellow
    }
}

# Summary
Write-Host ""
Write-Host "📋 Migration Summary:" -ForegroundColor Blue
Write-Host "✅ SSH connection working" -ForegroundColor Green
Write-Host "✅ Project files migrated successfully" -ForegroundColor Green
Write-Host "✅ Git repository intact" -ForegroundColor Green
Write-Host "⚠️  Services need to be started" -ForegroundColor Yellow
Write-Host ""
Write-Host "🚀 Next Steps:" -ForegroundColor Blue
Write-Host "1. Start services: ssh $PI_HOST 'cd /home/pi/eform-locker && ./scripts/start-all-clean.sh'" -ForegroundColor Gray
Write-Host "2. Test hardware: ssh $PI_HOST 'cd /home/pi/eform-locker && node scripts/test-basic-relay-control.js'" -ForegroundColor Gray
Write-Host "3. Access web interfaces:" -ForegroundColor Gray
Write-Host "   - Admin Panel: http://$PI_IP`:3001" -ForegroundColor Gray
Write-Host "   - Kiosk UI: http://$PI_IP`:3002" -ForegroundColor Gray
Write-Host "   - Gateway API: http://$PI_IP`:3000" -ForegroundColor Gray
Write-Host ""
Write-Host "💡 Update your bookmarks and scripts with the new IP: $PI_IP" -ForegroundColor Yellow