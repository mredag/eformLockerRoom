# eForm Locker Pi Management Script
param(
    [Parameter(Position=0)]
    [string]$Command = "help"
)

$PI_HOST = "pi@192.168.1.8"  # Update this IP if Pi changes

function Show-Help {
    Write-Host ""
    Write-Host "eForm Locker Pi Management Commands" -ForegroundColor Magenta
    Write-Host "===================================" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "Usage: .\scripts\deployment\pi-manager.ps1 [command]" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Available commands:" -ForegroundColor Yellow
    Write-Host "  status    - Show system status dashboard" -ForegroundColor White
    Write-Host "  health    - Run health check" -ForegroundColor White
    Write-Host "  restart   - Restart all services" -ForegroundColor White
    Write-Host "  start     - Start all services" -ForegroundColor White
    Write-Host "  stop      - Stop all services" -ForegroundColor White
    Write-Host "  logs      - View recent logs" -ForegroundColor White
    Write-Host "  services  - Show service status" -ForegroundColor White
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  .\scripts\deployment\pi-manager.ps1 status" -ForegroundColor Gray
    Write-Host "  .\scripts\deployment\pi-manager.ps1 health" -ForegroundColor Gray
    Write-Host "  .\scripts\deployment\pi-manager.ps1 restart" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Web Interfaces:" -ForegroundColor Yellow
    Write-Host "  Admin Panel:   http://192.168.1.8:3001" -ForegroundColor Gray
    Write-Host "  Kiosk UI:      http://192.168.1.8:3002" -ForegroundColor Gray
    Write-Host "  Gateway API:   http://192.168.1.8:3000" -ForegroundColor Gray
    Write-Host ""
}

switch ($Command.ToLower()) {
    "status" {
        Write-Host "Getting system status..." -ForegroundColor Blue
        ssh $PI_HOST "/home/pi/eform-status.sh"
    }
    
    "health" {
        Write-Host "Running health check..." -ForegroundColor Blue
        ssh $PI_HOST "cd /home/pi/eform-locker; bash scripts/deployment/health-check.sh"
    }
    
    "restart" {
        Write-Host "Restarting services..." -ForegroundColor Yellow
        ssh $PI_HOST "sudo systemctl restart eform-locker"
        Start-Sleep -Seconds 5
        Write-Host "Checking health after restart..." -ForegroundColor Blue
        ssh $PI_HOST "cd /home/pi/eform-locker; bash scripts/deployment/health-check.sh"
    }
    
    "start" {
        Write-Host "Starting services..." -ForegroundColor Green
        ssh $PI_HOST "sudo systemctl start eform-locker"
        Start-Sleep -Seconds 5
        ssh $PI_HOST "cd /home/pi/eform-locker; bash scripts/deployment/health-check.sh"
    }
    
    "stop" {
        Write-Host "Stopping services..." -ForegroundColor Red
        ssh $PI_HOST "sudo systemctl stop eform-locker"
    }
    
    "logs" {
        Write-Host "Recent Gateway logs:" -ForegroundColor Blue
        ssh $PI_HOST "tail -10 /home/pi/eform-locker/logs/gateway.log"
        Write-Host ""
        Write-Host "Recent Kiosk logs:" -ForegroundColor Blue
        ssh $PI_HOST "tail -10 /home/pi/eform-locker/logs/kiosk.log"
        Write-Host ""
        Write-Host "Recent Panel logs:" -ForegroundColor Blue
        ssh $PI_HOST "tail -10 /home/pi/eform-locker/logs/panel.log"
    }
    
    "services" {
        Write-Host "Service Status:" -ForegroundColor Blue
        ssh $PI_HOST "sudo systemctl status eform-locker --no-pager -l | head -15"
    }
    
    default {
        Show-Help
    }
}