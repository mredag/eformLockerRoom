# Deploy Status Display Fix to Raspberry Pi
Write-Host "🚀 Deploying status display fix to Raspberry Pi..." -ForegroundColor Green

# Commit changes
Write-Host "📝 Committing changes..." -ForegroundColor Yellow
git add .
git commit -m "Fix locker card status display and color coding

Add missing CSS classes for opening and error status
Fix duplicate lines in StatusTranslationService calls
Update real-time card updates to properly change CSS classes
Ensure proper border color updates for all status changes"

# Push to repository
Write-Host "📤 Pushing to repository..." -ForegroundColor Yellow
git push origin main

# Deploy to Pi
Write-Host "🔄 Deploying to Raspberry Pi..." -ForegroundColor Yellow
ssh pi@pi-eform-locker "cd /home/pi/eform-locker; git pull origin main"

Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "🔧 Next steps:" -ForegroundColor Cyan
Write-Host "1. SSH to Pi: ssh pi@pi-eform-locker"
Write-Host "2. Restart services: sudo killall node; ./scripts/start-all-clean.sh"
Write-Host "3. Test admin panel: http://192.168.1.8:3001/lockers"
Write-Host ""
Write-Host "🧪 Test the status display:" -ForegroundColor Cyan
Write-Host "- Open test-status-display.html in browser to verify translations"
Write-Host "- Check locker cards show proper colors and Turkish status text"