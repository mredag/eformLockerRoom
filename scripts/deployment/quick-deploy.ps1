param(
    [string]$Message = "chore: quick deployment update"
)

$PI_HOST = "pi@pi-eform-locker"
$PI_PROJECT_PATH = "/home/pi/eform-locker"

Write-Host "Quick Deployment Started" -ForegroundColor Blue

try {
    Write-Host "Adding and committing changes..."
    git add .
    git commit -m $Message
    
    Write-Host "Pushing to remote..."
    git push origin main
    
    Write-Host "Local Git operations completed" -ForegroundColor Green
    
    Write-Host "Pulling changes on Pi and restarting services..."
    
    $deployCommand = "cd $PI_PROJECT_PATH && git pull origin main && ./scripts/start-all-clean.sh"
    ssh $PI_HOST $deployCommand
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Deployment completed successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Access Points:"
        Write-Host "  Admin Panel: http://192.168.1.8:3001"
        Write-Host "  Kiosk UI:    http://192.168.1.8:3002"
        Write-Host "  Gateway API: http://192.168.1.8:3000"
    } else {
        Write-Host "Deployment failed on Pi" -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Host "Deployment failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}