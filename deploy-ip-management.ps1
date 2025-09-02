#!/usr/bin/env powershell
# Deploy IP Management System to Pi

$PI_IP = "192.168.1.11"
$PI_HOST = "pi@$PI_IP"

Write-Host "🚀 Deploying IP Management System to Pi..." -ForegroundColor Blue

# Create network directory on Pi
Write-Host "📁 Creating network directory..." -ForegroundColor Yellow
ssh $PI_HOST "mkdir -p /home/pi/eform-locker/scripts/network"

# Copy IP management files
Write-Host "📤 Copying IP management files..." -ForegroundColor Yellow
scp "scripts/network/dynamic-ip-manager.js" "$PI_HOST`:/home/pi/eform-locker/scripts/network/"
scp "scripts/network/startup-ip-check.sh" "$PI_HOST`:/home/pi/eform-locker/scripts/network/"
scp "scripts/network/install-ip-management.sh" "$PI_HOST`:/home/pi/eform-locker/scripts/network/"

# Make scripts executable
Write-Host "🔧 Making scripts executable..." -ForegroundColor Yellow
ssh $PI_HOST "chmod +x /home/pi/eform-locker/scripts/network/*.sh"
ssh $PI_HOST "chmod +x /home/pi/eform-locker/scripts/network/*.js"

# Test the IP manager
Write-Host "🧪 Testing IP manager on Pi..." -ForegroundColor Yellow
ssh $PI_HOST "cd /home/pi/eform-locker && node scripts/network/dynamic-ip-manager.js run"

Write-Host "✅ IP Management System deployed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Blue
Write-Host "1. Install the system: ssh $PI_HOST 'cd /home/pi/eform-locker && ./scripts/network/install-ip-management.sh'" -ForegroundColor Gray
Write-Host "2. Test locally: .\scripts\network\simple-ip-manager.ps1 status" -ForegroundColor Gray