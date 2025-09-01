# Smart eForm Locker Pi Management Script with Auto-Discovery
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
$NETWORK_BASE = "192.168.1"

# Colors for output
function Write-Info($message) { Write-Host "ℹ️  $message" -ForegroundColor Blue }
function Write-Success($message) { Write-Host "✅ $message" -ForegroundColor Green }
function Write-Warning($message) { Write-Host "⚠️  $message" -ForegroundColor Yellow }
function Write-Error($message) { Write-Host "❌ $message" -ForegroundColor Red }
function Write-Header($message) { 
    Write-Host ""
    Write-Host "🚀 $message" -ForegroundColor Magenta
    Write-Host ("=" * ($message.Length + 3))
}

# Test if Pi is reachable and has eForm services
function Test-EformPi($ip) {
    try {
        # Test SSH connection
        $sshTest = ssh "pi@$ip" "echo 'connected'" 2>$null
        if ($sshTest -ne "connected") {
            return $false
        }
        
        # Test if eForm project exists
        $projectTest = ssh "pi@$ip" "test -d /home/pi/eform-locker; echo 'exists'" 2>$null
        if ($projectTest -ne "exists") {
            return $false
        }
        
        return $true
    }
    catch {
        return $false
    }
}

# Discover eForm Pi on network
function Find-EformPi {
    Write-Header "🔍 Discovering eForm Pi"
    
    # If force IP is provided, use it
    if ($ForceIP) {
        Write-Info "Using forced IP: $ForceIP"
        if (Test-EformPi $ForceIP) {
            Write-Success "Found eForm Pi at $ForceIP"
            return $ForceIP
        } else {
            Write-Error "No eForm Pi found at forced IP $ForceIP"
            return $null
        }
    }
    
    # Try default IP first
    Write-Info "Checking default IP: $DEFAULT_IP"
    if (Test-EformPi $DEFAULT_IP) {
        Write-Success "Found eForm Pi at default IP: $DEFAULT_IP"
        return $DEFAULT_IP
    }
    
    # Try known IPs
    Write-Info "Checking known IP addresses..."
    foreach ($ip in $KNOWN_IPS) {
        if ($ip -eq $DEFAULT_IP) { continue } # Already checked
        
        Write-Host "  Checking $ip..." -NoNewline
        if (Test-Connection -ComputerName $ip -Count 1 -Quiet -TimeoutSeconds 2) {
            if (Test-EformPi $ip) {
                Write-Host " ✅ Found!" -ForegroundColor Green
                Write-Success "Found eForm Pi at: $ip"
                return $ip
            } else {
                Write-Host " ❌ Not eForm Pi" -ForegroundColor Red
            }
        } else {
            Write-Host " ❌ No response" -ForegroundColor Red
        }
    }
    
    # Scan network range (limited scan)
    Write-Info "Scanning network range $NETWORK_BASE.1-50..."
    for ($i = 1; $i -le 50; $i++) {
        $ip = "$NETWORK_BASE.$i"
        if ($KNOWN_IPS -contains $ip) { continue } # Already checked
        
        if ($i % 10 -eq 0) { Write-Host "  Scanned up to $ip..." }
        
        if (Test-Connection -ComputerName $ip -Count 1 -Quiet -TimeoutSeconds 1) {
            if (Test-EformPi $ip) {
                Write-Success "Found eForm Pi at: $ip"
                return $ip
            }
        }
    }
    
    Write-Error "No eForm Pi found on network!"
    Write-Warning "Try using -ForceIP parameter if you know the IP address"
    return $null
}

# Execute command on discovered Pi
function Invoke-PiCommand($ip, $command, $description) {
    Write-Header $description
    Write-Info "Executing on Pi at $ip"
    Write-Host ("-" * 50)
    
    try {
        ssh "pi@$ip" $command
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Command completed successfully"
        } else {
            Write-Warning "Command completed with warnings (exit code: $LASTEXITCODE)"
        }
    }
    catch {
        Write-Error "Failed to execute command: $_"
    }
}

function Show-Help {
    Write-Header "Smart eForm Locker Pi Management"
    Write-Host ""
    Write-Host "Usage: .\scripts\deployment\smart-pi-manager.ps1 [command] [-ForceIP ip]" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor Yellow
    Write-Host "  discover  - Find eForm Pi on network" -ForegroundColor White
    Write-Host "  status    - Show system status dashboard" -ForegroundColor White
    Write-Host "  health    - Run health check" -ForegroundColor White
    Write-Host "  restart   - Restart all services" -ForegroundColor White
    Write-Host "  start     - Start all services" -ForegroundColor White
    Write-Host "  stop      - Stop all services" -ForegroundColor White
    Write-Host "  logs      - View recent logs" -ForegroundColor White
    Write-Host "  services  - Show service status" -ForegroundColor White
    Write-Host ""
    Write-Host "Parameters:" -ForegroundColor Yellow
    Write-Host "  -ForceIP  - Use specific IP address (skip discovery)" -ForegroundColor White
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  .\scripts\deployment\smart-pi-manager.ps1 discover" -ForegroundColor Gray
    Write-Host "  .\scripts\deployment\smart-pi-manager.ps1 status" -ForegroundColor Gray
    Write-Host "  .\scripts\deployment\smart-pi-manager.ps1 restart -ForceIP 192.168.1.15" -ForegroundColor Gray
    Write-Host ""
}

# Main execution
switch ($Command.ToLower()) {
    "discover" {
        $discoveredIP = Find-EformPi
        if ($discoveredIP) {
            Write-Host ""
            Write-Success "eForm Pi discovered at: $discoveredIP"
            Write-Host ""
            Write-Host "Web Interfaces:" -ForegroundColor Yellow
            Write-Host "  Admin Panel:   http://$discoveredIP:3001" -ForegroundColor Gray
            Write-Host "  Kiosk UI:      http://$discoveredIP:3002" -ForegroundColor Gray
            Write-Host "  Gateway API:   http://$discoveredIP:3000" -ForegroundColor Gray
            Write-Host ""
            Write-Host "SSH Access:" -ForegroundColor Yellow
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
            Write-Warning "This will restart eForm services on Pi at $piIP"
            $confirm = Read-Host "Continue? (y/N)"
            if ($confirm -eq 'y' -or $confirm -eq 'Y') {
                Invoke-PiCommand $piIP "sudo systemctl restart eform-locker" "Restarting Services"
                Start-Sleep -Seconds 5
                Invoke-PiCommand $piIP "cd /home/pi/eform-locker; bash scripts/maintenance/health-check-kiosk.sh" "Post-Restart Health Check"
            } else {
                Write-Info "Operation cancelled"
            }
        }
    }
    
    "start" {
        $piIP = Find-EformPi
        if ($piIP) {
            Invoke-PiCommand $piIP "sudo systemctl start eform-locker" "Starting Services"
            Start-Sleep -Seconds 5
            Invoke-PiCommand $piIP "cd /home/pi/eform-locker; bash scripts/maintenance/health-check-kiosk.sh" "Post-Start Health Check"
        }
    }
    
    "stop" {
        $piIP = Find-EformPi
        if ($piIP) {
            Write-Warning "This will stop eForm services on Pi at $piIP"
            $confirm = Read-Host "Continue? (y/N)"
            if ($confirm -eq 'y' -or $confirm -eq 'Y') {
                Invoke-PiCommand $piIP "sudo systemctl stop eform-locker" "Stopping Services"
            } else {
                Write-Info "Operation cancelled"
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
            Invoke-PiCommand $piIP "sudo systemctl status eform-locker --no-pager -l | head -15" "Service Status"
        }
    }
    
    default {
        Show-Help
    }
}