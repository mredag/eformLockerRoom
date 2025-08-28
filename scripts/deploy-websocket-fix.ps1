# Deploy WebSocket fix to Raspberry Pi (PowerShell version)
# This script deploys the WebSocket connection fixes to the Pi

Write-Host "🚀 Deploying WebSocket connection fix to Raspberry Pi..." -ForegroundColor Green

try {
    Write-Host "📡 Connecting to Raspberry Pi and deploying..." -ForegroundColor Yellow
    
    # Execute deployment commands on Pi via SSH
    $deployCommands = @"
cd /home/pi/eform-locker && 
echo '📥 Pulling latest changes...' && 
git pull origin main && 
echo '🛑 Stopping Panel service...' && 
sudo pkill -f 'node.*panel' || echo 'Panel service not running' && 
echo '⏳ Waiting for service to stop...' && 
sleep 3 && 
echo '🚀 Starting Panel service with WebSocket support...' && 
nohup npm run start:panel > logs/panel.log 2>&1 & 
echo '⏳ Waiting for service to start...' && 
sleep 5 && 
echo '🔍 Checking service status...' && 
if curl -s http://localhost:3001/health > /dev/null; then 
    echo '✅ Panel service is running'; 
else 
    echo '❌ Panel service failed to start'; 
    echo '📋 Last 10 lines of log:'; 
    tail -10 logs/panel.log; 
    exit 1; 
fi && 
echo '🔌 Testing WebSocket server...' && 
if nc -z localhost 8080; then 
    echo '✅ WebSocket server is listening on port 8080'; 
else 
    echo '❌ WebSocket server is not responding on port 8080'; 
    echo '📋 Checking if port is in use:'; 
    netstat -tlnp | grep :8080 || echo 'Port 8080 is not in use'; 
fi && 
echo '🎉 Deployment completed!' && 
echo '🌐 Admin Panel: http://192.168.1.8:3001/lockers' && 
echo '🔌 WebSocket: ws://192.168.1.8:8080'
"@

    $result = ssh pi@pi-eform-locker $deployCommands
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Deployment completed successfully!" -ForegroundColor Green
    } else {
        Write-Host "❌ Deployment encountered issues" -ForegroundColor Red
        Write-Host $result
    }
    
} catch {
    Write-Host "❌ Deployment failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "💡 Make sure you can SSH to pi@pi-eform-locker without password" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🧪 To test the WebSocket connection:" -ForegroundColor Cyan
Write-Host "node scripts/test-websocket-connection.js" -ForegroundColor White
Write-Host ""
Write-Host "🌐 Open the admin panel to verify no more WebSocket errors:" -ForegroundColor Cyan
Write-Host "http://192.168.1.8:3001/lockers" -ForegroundColor White