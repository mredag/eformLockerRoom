# Multi-Pi Management Script for eForm Locker System
# Manages multiple Raspberry Pi units across different locations

param(
    [Parameter(Position=0)]
    [ValidateSet("status", "health", "restart", "stop", "start", "logs", "services", "discover", "help")]
    [string]$Command = "help",
    
    [Parameter(Position=1)]
    [string]$Location = "all"
)

# Configuration - Add your Pi locations here
$PI_LOCATIONS = @{
    "mens" = @{
        "ip" = "192.168.1.8"
        "hostname" = "pi-eform-mens"
        "description" = "Men's Locker Room"
    }
    "womens" = @{
        "ip" = "192.168.1.8"
        "hostname" = "pi-eform-womens"
        "description" = "Women's Locker Room"
    }
    "staff" = @{
        "ip" = "192.168.1.8"
        "hostname" = "pi-eform-staff"
        "description" = "Staff Area"
    }
    "vip" = @{
        "ip" = "192.168.1.8"
        "hostname" = "pi-eform-vip"
        "description" = "VIP Area"
    }
}

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

# Test SSH connection to Pi
function Test-PiConnection($ip, $hostname) {
    try {
        $result = ssh "pi@$ip" "echo 'connected'" 2>$null
        if ($result -eq "connected") {
            return $true
        }
    }
    catch {
        return $false
    }
    return $false
}

# Execute command on Pi
function Invoke-PiCommand($ip, $command) {
    try {
        ssh "pi@$ip" $command
        return $LASTEXITCODE -eq 0
    }
    catch {
        Write-Error "Failed to execute command on $ip"
        return $false
    }
}

# Discover Pis on network
function Find-EformPis {
    Write-Header "Discovering eForm Pis on Network"
    
    $discovered = @()
    $network_base = "192.168.1"
    
    Write-Info "Scanning network $network_base.0/24 for eForm Pis..."
    
    # Check known locations first
    foreach ($location in $PI_LOCATIONS.Keys) {
        $pi = $PI_LOCATIONS[$location]
        $ip = $pi.ip
        
        Write-Host "Checking $($pi.description) ($ip)..." -NoNewline
        
        if (Test-Connection -ComputerName $ip -Count 1 -Quiet -TimeoutSeconds 2) {
            if (Test-PiConnection $ip $pi.hostname) {
                Write-Host " ✅ Online" -ForegroundColor Green
                $discovered += @{
                    "location" = $location
                    "ip" = $ip
                    "hostname" = $pi.hostname
                    "description" = $pi.description
                    "status" = "online"
                }
            } else {
                Write-Host " ⚠️  Ping OK, SSH Failed" -ForegroundColor Yellow
            }
        } else {
            Write-Host " ❌ Offline" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Success "Discovery complete. Found $($discovered.Count) eForm Pis."
    return $discovered
}

# Get Pi list based on location filter
function Get-TargetPis($locationFilter) {
    if ($locationFilter -eq "all") {
        return $PI_LOCATIONS.Keys
    } elseif ($PI_LOCATIONS.ContainsKey($locationFilter)) {
        return @($locationFilter)
    } else {
        Write-Error "Unknown location: $locationFilter"
        Write-Info "Available locations: $($PI_LOCATIONS.Keys -join ', ')"
        return @()
    }
}

# Execute command on multiple Pis
function Invoke-MultiPiCommand($locations, $command, $description) {
    Write-Header $description
    
    $results = @()
    
    foreach ($location in $locations) {
        $pi = $PI_LOCATIONS[$location]
        $ip = $pi.ip
        $desc = $pi.description
        
        Write-Host ""
        Write-Info "$desc ($ip):"
        Write-Host ("─" * 50)
        
        if (Test-PiConnection $ip $pi.hostname) {
            $success = Invoke-PiCommand $ip $command
            $results += @{
                "location" = $location
                "ip" = $ip
                "success" = $success
            }
        } else {
            Write-Error "Cannot connect to $desc ($ip)"
            $results += @{
                "location" = $location
                "ip" = $ip
                "success" = $false
            }
        }
    }
    
    # Summary
    Write-Host ""
    Write-Header "Command Summary"
    $successful = ($results | Where-Object { $_.success }).Count
    $total = $results.Count
    
    if ($successful -eq $total) {
        Write-Success "All $total Pis completed successfully"
    } else {
        Write-Warning "$successful of $total Pis completed successfully"
    }
    
    return $results
}

# Main command execution
switch ($Command.ToLower()) {
    "discover" {
        Find-EformPis
    }
    
    "status" {
        $targets = Get-TargetPis $Location
        if ($targets.Count -gt 0) {
            Invoke-MultiPiCommand $targets "/home/pi/eform-status.sh" "System Status for $Location"
        }
    }
    
    "health" {
        $targets = Get-TargetPis $Location
        if ($targets.Count -gt 0) {
            Invoke-MultiPiCommand $targets "cd /home/pi/eform-locker; bash scripts/deployment/health-check.sh" "Health Check for $Location"
        }
    }
    
    "restart" {
        $targets = Get-TargetPis $Location
        if ($targets.Count -gt 0) {
            Write-Warning "This will restart eForm services on $($targets.Count) Pi(s)"
            $confirm = Read-Host "Continue? (y/N)"
            if ($confirm -eq 'y' -or $confirm -eq 'Y') {
                Invoke-MultiPiCommand $targets "sudo systemctl restart eform-locker" "Restarting Services for $Location"
            } else {
                Write-Info "Operation cancelled"
            }
        }
    }
    
    "start" {
        $targets = Get-TargetPis $Location
        if ($targets.Count -gt 0) {
            Invoke-MultiPiCommand $targets "sudo systemctl start eform-locker" "Starting Services for $Location"
        }
    }
    
    "stop" {
        $targets = Get-TargetPis $Location
        if ($targets.Count -gt 0) {
            Write-Warning "This will stop eForm services on $($targets.Count) Pi(s)"
            $confirm = Read-Host "Continue? (y/N)"
            if ($confirm -eq 'y' -or $confirm -eq 'Y') {
                Invoke-MultiPiCommand $targets "sudo systemctl stop eform-locker" "Stopping Services for $Location"
            } else {
                Write-Info "Operation cancelled"
            }
        }
    }
    
    "logs" {
        $targets = Get-TargetPis $Location
        if ($targets.Count -gt 0) {
            Invoke-MultiPiCommand $targets "tail -20 /home/pi/eform-locker/logs/*.log" "Recent Logs for $Location"
        }
    }
    
    "services" {
        $targets = Get-TargetPis $Location
        if ($targets.Count -gt 0) {
            Invoke-MultiPiCommand $targets "sudo systemctl status eform-locker --no-pager -l | head -15" "Service Status for $Location"
        }
    }
    
    "help" {
        Write-Header "Multi-Pi Management for eForm Locker System"
        Write-Host ""
        Write-Host "Usage: .\scripts\deployment\manage-all-pis.ps1 [command] [location]" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Commands:" -ForegroundColor Yellow
        Write-Host "  discover  - Find all eForm Pis on network" -ForegroundColor White
        Write-Host "  status    - Show system status" -ForegroundColor White
        Write-Host "  health    - Run health checks" -ForegroundColor White
        Write-Host "  restart   - Restart services" -ForegroundColor White
        Write-Host "  start     - Start services" -ForegroundColor White
        Write-Host "  stop      - Stop services" -ForegroundColor White
        Write-Host "  logs      - View recent logs" -ForegroundColor White
        Write-Host "  services  - Show service status" -ForegroundColor White
        Write-Host ""
        Write-Host "Locations:" -ForegroundColor Yellow
        foreach ($location in $PI_LOCATIONS.Keys) {
            $pi = $PI_LOCATIONS[$location]
            Write-Host "  $location" -NoNewline -ForegroundColor White
            Write-Host " - $($pi.description) ($($pi.ip))" -ForegroundColor Gray
        }
        Write-Host "  all       - All locations" -ForegroundColor White
        Write-Host ""
        Write-Host "Examples:" -ForegroundColor Yellow
        Write-Host "  .\scripts\deployment\manage-all-pis.ps1 discover" -ForegroundColor Gray
        Write-Host "  .\scripts\deployment\manage-all-pis.ps1 status all" -ForegroundColor Gray
        Write-Host "  .\scripts\deployment\manage-all-pis.ps1 health womens" -ForegroundColor Gray
        Write-Host "  .\scripts\deployment\manage-all-pis.ps1 restart mens" -ForegroundColor Gray
        Write-Host ""
    }
    
    default {
        Write-Error "Unknown command: $Command"
        Write-Info "Use 'help' to see available commands"
    }
}