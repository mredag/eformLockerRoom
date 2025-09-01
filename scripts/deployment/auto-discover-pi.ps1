# Auto-Discovery Pi Manager for eForm Locker System
param(
    [Parameter(Position=0)]
    [string]$Command = "help",
    
    [Parameter()]
    [string]$ForceIP = ""
)

# Configuration
$DEFAULT_HOSTNAME = "pi-eform-locker"
$DEFAULT_IP = "192.168.1.8"
$KNOWN_IPS = @("192.168.1.8", "192.168.1.10", "192.168.1.20", "192.168.1.30", "192.168.1.40")

Write-Host "🔍 eForm Pi Auto-Discovery Manager" -ForegroundColor Magenta
Write-Host "=================================" -ForegroundColor Magenta

# Test if Pi is reachable and has eForm services
function Test-EformPi {
    param([string]$ip)
    
    try {
        # Test SSH connection
        $sshTest = ssh "pi@$ip" "echo connected" 2>$null
        if ($sshTest -ne "connected") {
            return $false
        }
        
        # Test if eForm project exists
        $projectTest = ssh "pi@$ip" "test -d /home/pi/eform-locker; echo exists" 2>$null
        if ($projectTest -ne "exists") {
            return $false
        }
        
        return $true
    }
    catch {
        return $false
    }
}

# Find eForm Pi on network
function Find-EformPi {
    Write-Host ""
    Write-Host "🔍 Discovering eForm Pi..." -ForegroundColor Blue
    
    # If force IP is provided, use it
    if ($ForceIP) {
        Write-Host "ℹ️  Using forced IP: $ForceIP" -ForegroundColor Blue
        if (Test-EformPi $ForceIP) {
            Write-Host "✅ Found eForm Pi at $ForceIP" -ForegroundColor Green
            return $ForceIP
        } else {
            Write-Host "❌ No eForm Pi found at forced IP $ForceIP" -ForegroundColor Red
            return $null
        }
    }
    
    # Try default IP first
    Write-Host "ℹ️  Checking default IP: $DEFAULT_IP" -ForegroundColor Blue
    if (Test-EformPi $DEFAULT_IP) {
        Write-Host "✅ Found eForm Pi at default IP: $DEFAULT_IP" -ForegroundColor Green
        return $DEFAULT_IP
    }
    
    # Try known IPs
    Write-Host "ℹ️  Checking known IP addresses..." -ForegroundColor Blue
    foreach ($ip in $KNOWN_IPS) {
        if ($ip -eq $DEFAULT_IP) { continue } # Already checked
        
        Write-Host "  Checking $ip..." -NoNewline
        if (Test-Connection -ComputerName $ip -Count 1 -Quiet -TimeoutSeconds 2) {
            if (Test-EformPi $ip) {
                Write-Host " ✅ Found!" -ForegroundColor Green
                return $ip
            } else {
                Write-Host " ❌ Not eForm Pi" -ForegroundColor Red
            }
        } else {
            Write-Host " ❌ No response" -ForegroundColor Red
        }
    }
    
    Write-Host "❌ No eForm Pi found on network!" -ForegroundColor Red
    Write-Host "⚠️  Try using -ForceIP parameter if you know the IP address" -ForegroundColor Yellow
    return $null
}

# Execute command on Pi
function Invoke-PiCommand {
    param([string]$ip, [string]$command, [string]$description)
    
    Write-Host ""
    Write-Host "🚀 $description" -ForegroundColor Magenta
    Write-Host "ℹ️  Executing on Pi at $ip" -ForegroundColor Blue
    Write-Host ("-" * 50)
    
    try {
        ssh "pi@$ip" $command
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Command completed successfully" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Command completed with warnings (exit code: $LASTEXITCODE)" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "❌ Failed to execute command: $_" -ForegroundColor Red
    }
}

# Main execution
switch ($Command.ToLower()) {
    "discover" {
        $discoveredIP = Find-EformPi
        if ($discoveredIP) {
            Write-Host ""
            Write-Host "✅ eForm Pi discovered at: $discoveredIP" -ForegroundColor Green
            Write-Host ""
            Write-Host "🌐 Web Interfaces:" -ForegroundColor Yellow
            Write-Host "  Admin Panel:   http://$discoveredIP:3001" -ForegroundColor Gray
            Write-Host "  Kiosk UI:      http://$discoveredIP:3002" -ForegroundColor Gray
            Write-Host "  Gateway API:   http://$discoveredIP:3000" -ForegroundColor Gray
            Write-Host ""
            Write-Host "🔧 SSH Access:" -ForegroundColor Yellow
            Write-Host "  ssh pi@$discoveredIP" -ForegroundColor Gray
        }
    }
    
    "status" {
        $piIP = Find-EformPi
        if ($piIP) {
            Invoke-PiCommand $piIP "/home/pi/eform-status.sh" "System Status"
        }
    }
    
    "health" {
        $piIP = Find-EformPi
        if ($piIP) {
            Invoke-PiCommand $piIP "cd /home/pi/eform-locker; bash scripts/maintenance/health-check-kiosk.sh" "Health Check"
        }
    }
    
    "restart" {
        $piIP = Find-EformPi
        if ($piIP) {
            Write-Host "⚠️  This will restart eForm services on Pi at $piIP" -ForegroundColor Yellow
            $confirm = Read-Host "Continue? (y/N)"
            if ($confirm -eq 'y' -or $confirm -eq 'Y') {
                Invoke-PiCommand $piIP "sudo systemctl restart eform-locker" "Restarting Services"
                Start-Sleep -Seconds 5
                Invoke-PiCommand $piIP "cd /home/pi/eform-locker; bash scripts/maintenance/health-check-kiosk.sh" "Post-Restart Health Check"
            } else {
                Write-Host "ℹ️  Operation cancelled" -ForegroundColor Blue
            }
        }
    }
    
    "start" {
        $piIP = Find-EformPi
        if ($piIP) {
            Invoke-PiCommand $piIP "sudo systemctl start eform-locker" "Starting Services"
        }
    }
    
    "stop" {
        $piIP = Find-EformPi
        if ($piIP) {
            Write-Host "⚠️  This will stop eForm services on Pi at $piIP" -ForegroundColor Yellow
            $confirm = Read-Host "Continue? (y/N)"
            if ($confirm -eq 'y' -or $confirm -eq 'Y') {
                Invoke-PiCommand $piIP "sudo systemctl stop eform-locker" "Stopping Services"
            } else {
                Write-Host "ℹ️  Operation cancelled" -ForegroundColor Blue
            }
        }
    }
    
    "logs" {
        $piIP = Find-EformPi
        if ($piIP) {
            Invoke-PiCommand $piIP "tail -20 /home/pi/eform-locker/logs/*.log" "Recent Logs"
        }
    }
    
    "services" {
        $piIP = Find-EformPi
        if ($piIP) {
            Invoke-PiCommand $piIP "sudo systemctl status eform-locker --no-pager -l" "Service Status"
        }
    }
    
    default {
        Write-Host ""
        Write-Host "📋 Usage: .\scripts\deployment\auto-discover-pi.ps1 [command] [-ForceIP ip]" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "🎯 Commands:" -ForegroundColor Yellow
        Write-Host "  discover  - Find eForm Pi on network" -ForegroundColor White
        Write-Host "  status    - Show system status dashboard" -ForegroundColor White
        Write-Host "  health    - Run health check" -ForegroundColor White
        Write-Host "  restart   - Restart all services" -ForegroundColor White
        Write-Host "  start     - Start all services" -ForegroundColor White
        Write-Host "  stop      - Stop all services" -ForegroundColor White
        Write-Host "  logs      - View recent logs" -ForegroundColor White
        Write-Host "  services  - Show service status" -ForegroundColor White
        Write-Host ""
        Write-Host "⚙️  Parameters:" -ForegroundColor Yellow
        Write-Host "  -ForceIP  - Use specific IP address (skip discovery)" -ForegroundColor White
        Write-Host ""
        Write-Host "💡 Examples:" -ForegroundColor Yellow
        Write-Host "  .\scripts\deployment\auto-discover-pi.ps1 discover" -ForegroundColor Gray
        Write-Host "  .\scripts\deployment\auto-discover-pi.ps1 status" -ForegroundColor Gray
        Write-Host "  .\scripts\deployment\auto-discover-pi.ps1 restart -ForceIP 192.168.1.15" -ForegroundColor Gray
        Write-Host ""
    }
}