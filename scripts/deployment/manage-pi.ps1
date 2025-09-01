# eForm Locker Pi Management Script
# This script provides easy commands to manage the Raspberry Pi from Windows

param(
    [Parameter(Position=0)]
    [ValidateSet("status", "health", "restart", "stop", "start", "logs", "services", "help")]
    [string]$Command = "help"
)

# Configuration
$PI_HOST = "pi@pi-eform-locker"
$PI_PROJECT_PATH = "/home/pi/eform-locker"

# Colors for output
function Write-Info($message) {
    Write-Host "ℹ️  $message" -ForegroundColor Blue
}

function Write-Success($message) {
    Write-Host "✅ $message" -ForegroundColor Green
}

function Write-Warning($message) {
    Write-Host "⚠️  $message" -ForegroundColor Yellow
}

function Write-Error($message) {
    Write-Host "❌ $message" -ForegroundColor Red
}

function Write-Header($message) {
    Write-Host ""
    Write-Host "🚀 $message" -ForegroundColor Magenta
    Write-Host ("=" * ($message.Length + 3))
}

# Test SSH connection
function Test-SSHConnection {
    try {
        $result = ssh $PI_HOST "echo 'connected'" 2>$null
        if ($result -eq "connected") {
            return $true
        }
    }
    catch {
        return $false
    }
    return $false
}

# Execute SSH command
function Invoke-SSHCommand($command) {
    try {
        ssh $PI_HOST $command
        return $LASTEXITCODE -eq 0
    }
    catch {
        Write-Error "Failed to execute command on Pi"
        return $false
    }
}
# Main co
mmand execution
switch ($Command.ToLower()) {
    "status" {
        Write-Header "eForm Locker System Status"
        if (Test-SSHConnection) {
            Invoke-SSHCommand "/home/pi/eform-status.sh"
        } else {
            Write-Error "Cannot connect to Pi. Check SSH connection."
        }
    }
    
    "health" {
        Write-Header "System Health Check"
        if (Test-SSHConnection) {
            Invoke-SSHCommand "cd $PI_PROJECT_PATH; bash scripts/deployment/health-check.sh"
        } else {
            Write-Error "Cannot connect to Pi. Check SSH connection."
        }
    }
    
    "restart" {
        Write-Header "Restarting eForm Services"
        Write-Info "Restarting services on Pi..."
        if (Test-SSHConnection) {
            $success = Invoke-SSHCommand "sudo systemctl restart eform-locker"
            if ($success) {
                Write-Success "Services restarted successfully"
                Start-Sleep -Seconds 5
                Write-Info "Checking health after restart..."
                Invoke-SSHCommand "cd $PI_PROJECT_PATH; bash scripts/deployment/health-check.sh"
            } else {
                Write-Error "Failed to restart services"
            }
        } else {
            Write-Error "Cannot connect to Pi. Check SSH connection."
        }
    }
    
    "stop" {
        Write-Header "Stopping eForm Services"
        Write-Warning "Stopping all eForm services..."
        if (Test-SSHConnection) {
            $success = Invoke-SSHCommand "sudo systemctl stop eform-locker"
            if ($success) {
                Write-Success "Services stopped successfully"
            } else {
                Write-Error "Failed to stop services"
            }
        } else {
            Write-Error "Cannot connect to Pi. Check SSH connection."
        }
    }
    
    "start" {
        Write-Header "Starting eForm Services"
        Write-Info "Starting eForm services..."
        if (Test-SSHConnection) {
            $success = Invoke-SSHCommand "sudo systemctl start eform-locker"
            if ($success) {
                Write-Success "Services started successfully"
                Start-Sleep -Seconds 5
                Write-Info "Checking health after start..."
                Invoke-SSHCommand "cd $PI_PROJECT_PATH; bash scripts/deployment/health-check.sh"
            } else {
                Write-Error "Failed to start services"
            }
        } else {
            Write-Error "Cannot connect to Pi. Check SSH connection."
        }
    } 
   
    "logs" {
        Write-Header "Service Logs"
        if (Test-SSHConnection) {
            Write-Info "Recent Gateway logs:"
            Invoke-SSHCommand "tail -10 $PI_PROJECT_PATH/logs/gateway.log"
            Write-Host ""
            Write-Info "Recent Kiosk logs:"
            Invoke-SSHCommand "tail -10 $PI_PROJECT_PATH/logs/kiosk.log"
            Write-Host ""
            Write-Info "Recent Panel logs:"
            Invoke-SSHCommand "tail -10 $PI_PROJECT_PATH/logs/panel.log"
        } else {
            Write-Error "Cannot connect to Pi. Check SSH connection."
        }
    }
    
    "services" {
        Write-Header "Systemd Services Status"
        if (Test-SSHConnection) {
            Write-Info "eForm Locker Service:"
            Invoke-SSHCommand "sudo systemctl status eform-locker --no-pager -l | head -15"
            Write-Host ""
            Write-Info "Hardware Init Service:"
            Invoke-SSHCommand "sudo systemctl status eform-hardware-init --no-pager | head -10"
            Write-Host ""
            Write-Info "Monitor Service:"
            Invoke-SSHCommand "sudo systemctl status eform-monitor --no-pager | head -10"
        } else {
            Write-Error "Cannot connect to Pi. Check SSH connection."
        }
    }
    
    "help" {
        Write-Header "eForm Locker Pi Management Commands"
        Write-Host ""
        Write-Host "Usage: .\scripts\deployment\manage-pi.ps1 [command]" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Available commands:" -ForegroundColor Yellow
        Write-Host "  status    - Show complete system status dashboard" -ForegroundColor White
        Write-Host "  health    - Run health check on all services" -ForegroundColor White
        Write-Host "  restart   - Restart all eForm services" -ForegroundColor White
        Write-Host "  start     - Start all eForm services" -ForegroundColor White
        Write-Host "  stop      - Stop all eForm services" -ForegroundColor White
        Write-Host "  logs      - View recent service logs" -ForegroundColor White
        Write-Host "  services  - Show systemd service status" -ForegroundColor White
        Write-Host "  help      - Show this help message" -ForegroundColor White
        Write-Host ""
        Write-Host "Examples:" -ForegroundColor Yellow
        Write-Host "  .\scripts\deployment\manage-pi.ps1 status" -ForegroundColor Gray
        Write-Host "  .\scripts\deployment\manage-pi.ps1 health" -ForegroundColor Gray
        Write-Host "  .\scripts\deployment\manage-pi.ps1 restart" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Web Interfaces:" -ForegroundColor Yellow
        Write-Host "  Admin Panel:   http://192.168.1.8:3001" -ForegroundColor Gray
        Write-Host "  Kiosk UI:      http://192.168.1.8:3002" -ForegroundColor Gray
        Write-Host "  Gateway API:   http://192.168.1.8:3000" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Direct SSH:" -ForegroundColor Yellow
        Write-Host "  ssh pi@pi-eform-locker" -ForegroundColor Gray
        Write-Host ""
    }
    
    default {
        Write-Error "Unknown command: $Command"
        Write-Info "Use help to see available commands"
    }
}