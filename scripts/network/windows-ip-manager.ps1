#!/usr/bin/env powershell
# Windows IP Management System
# Automatically discovers Pi IP and updates development environment

param(
    [string]$Action = "discover",
    [switch]$UpdateBookmarks,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"

# Configuration
$KNOWN_IP_RANGES = @("192.168.1.", "192.168.0.", "10.0.0.")
$PI_HOSTNAME = "pi-eform-locker"
$PROJECT_ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$CONFIG_FILE = Join-Path $PROJECT_ROOT "config\windows-pi-config.json"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
    
    if ($Verbose) {
        $logFile = Join-Path $PROJECT_ROOT "logs\windows-ip-manager.log"
        $logMessage | Out-File -FilePath $logFile -Append -Encoding UTF8
    }
}

function Test-PiConnection {
    param([string]$IP)
    
    try {
        # Test ping first
        if (-not (Test-Connection -ComputerName $IP -Count 1 -Quiet)) {
            return $false
        }
        
        # Test SSH connection
        $result = ssh -o ConnectTimeout=3 -o BatchMode=yes "pi@$IP" "hostname && test -d /home/pi/eform-locker && echo 'EFORM_PI_FOUND'" 2>$null
        return $result -match "EFORM_PI_FOUND"
    }
    catch {
        return $false
    }
}

function Find-PiIP {
    Write-Log "🔍 Scanning network for eForm Pi..." "INFO"
    
    # First check stored configuration
    $storedConfig = Get-StoredConfig
    if ($storedConfig.lastKnownIP) {
        Write-Log "Testing last known IP: $($storedConfig.lastKnownIP)" "INFO"
        if (Test-PiConnection $storedConfig.lastKnownIP) {
            Write-Log "✅ Found Pi at stored IP: $($storedConfig.lastKnownIP)" "SUCCESS"
            return $storedConfig.lastKnownIP
        }
    }
    
    # Scan common IP ranges
    foreach ($range in $KNOWN_IP_RANGES) {
        Write-Log "Scanning range: ${range}x" "INFO"
        
        for ($i = 1; $i -le 50; $i++) {
            $ip = "$range$i"
            
            if ($Verbose) {
                Write-Host "Testing $ip..." -NoNewline
            }
            
            if (Test-PiConnection $ip) {
                Write-Log "✅ Found eForm Pi at: $ip" "SUCCESS"
                return $ip
            }
            
            if ($Verbose) {
                Write-Host " ❌"
            }
        }
    }
    
    Write-Log "❌ No eForm Pi found on network" "ERROR"
    return $null
}

function Get-StoredConfig {
    try {
        if (Test-Path $CONFIG_FILE) {
            return Get-Content $CONFIG_FILE | ConvertFrom-Json
        }
    }
    catch {
        Write-Log "⚠️  Error reading stored config: $($_.Exception.Message)" "WARN"
    }
    
    return @{
        lastKnownIP = $null
        lastUpdate = $null
        discoveryHistory = @()
    }
}

function Save-Config {
    param($Config)
    
    try {
        $configDir = Split-Path $CONFIG_FILE -Parent
        if (-not (Test-Path $configDir)) {
            New-Item -ItemType Directory -Path $configDir -Force | Out-Null
        }
        
        $Config | ConvertTo-Json -Depth 10 | Out-File -FilePath $CONFIG_FILE -Encoding UTF8
        Write-Log "✅ Configuration saved" "SUCCESS"
    }
    catch {
        Write-Log "❌ Error saving config: $($_.Exception.Message)" "ERROR"
    }
}

function Update-Configuration {
    param([string]$CurrentIP, [string]$PreviousIP = $null)
    
    $config = Get-StoredConfig
    
    # Update configuration
    $config.lastKnownIP = $CurrentIP
    $config.lastUpdate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    
    if ($PreviousIP -and $PreviousIP -ne $CurrentIP) {
        $historyEntry = @{
            from = $PreviousIP
            to = $CurrentIP
            timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        }
        
        $config.discoveryHistory += $historyEntry
        
        # Keep only last 10 entries
        if ($config.discoveryHistory.Count -gt 10) {
            $config.discoveryHistory = $config.discoveryHistory[-10..-1]
        }
    }
    
    Save-Config $config
    return $config
}

function Generate-AccessInfo {
    param([string]$IP)
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $accessInfo = "# eForm Pi Access Information`n"
    $accessInfo += "Generated: $timestamp`n"
    $accessInfo += "IP Address: $IP`n`n"
    $accessInfo += "## Web Interfaces`n"
    $accessInfo += "Admin Panel:  http://$IP`:3001`n"
    $accessInfo += "Kiosk UI:     http://$IP`:3002`n"
    $accessInfo += "Gateway API:  http://$IP`:3000`n`n"
    $accessInfo += "## SSH Access`n"
    $accessInfo += "ssh pi@$IP`n`n"
    $accessInfo += "## Health Checks (PowerShell)`n"
    $accessInfo += "Invoke-WebRequest -Uri `"http://$IP`:3000/health`" -UseBasicParsing`n"
    $accessInfo += "Invoke-WebRequest -Uri `"http://$IP`:3001/health`" -UseBasicParsing`n"
    $accessInfo += "Invoke-WebRequest -Uri `"http://$IP`:3002/health`" -UseBasicParsing`n`n"
    $accessInfo += "## API Testing (PowerShell)`n"
    $accessInfo += "# Open locker`n"
    $accessInfo += "`$body = '{`"locker_id`": 5, `"staff_user`": `"test`", `"reason`": `"testing`"}'`n"
    $accessInfo += "Invoke-RestMethod -Uri `"http://$IP`:3002/api/locker/open`" -Method POST -ContentType `"application/json`" -Body `$body`n`n"
    $accessInfo += "# Activate relay`n"
    $accessInfo += "`$body = '{`"relay_number`": 3, `"staff_user`": `"test`", `"reason`": `"testing`"}'`n"
    $accessInfo += "Invoke-RestMethod -Uri `"http://$IP`:3001/api/relay/activate`" -Method POST -ContentType `"application/json`" -Body `$body`n`n"
    $accessInfo += "## Update IP Discovery`n"
    $accessInfo += ".\scripts\network\windows-ip-manager.ps1 -Action discover -Verbose`n"
    $accessInfo += ".\scripts\network\windows-ip-manager.ps1 -Action status`n"
    
    $infoFile = Join-Path $PROJECT_ROOT "CURRENT_PI_ACCESS.md"
    $accessInfo | Out-File -FilePath $infoFile -Encoding UTF8
    Write-Log "✅ Generated access info file: CURRENT_PI_ACCESS.md" "SUCCESS"
}

function Update-BookmarkFile {
    param([string]$IP)
    
    if (-not $UpdateBookmarks) {
        return
    }
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $bookmarkContent = "# eForm Pi Bookmarks - Updated $timestamp`n`n"
    $bookmarkContent += "Admin Panel: http://$IP`:3001`n"
    $bookmarkContent += "Kiosk Interface: http://$IP`:3002`n"
    $bookmarkContent += "Gateway API: http://$IP`:3000`n"
    $bookmarkContent += "Relay Control: http://$IP`:3001/relay`n"
    $bookmarkContent += "Locker Management: http://$IP`:3001/lockers`n`n"
    $bookmarkContent += "SSH: ssh pi@$IP`n"
    
    $bookmarkFile = Join-Path $PROJECT_ROOT "PI_BOOKMARKS.md"
    $bookmarkContent | Out-File -FilePath $bookmarkFile -Encoding UTF8
    Write-Log "✅ Updated bookmark file" "SUCCESS"
}

function Show-Status {
    $config = Get-StoredConfig
    $currentIP = Find-PiIP
    
    Write-Host "📊 eForm Pi Network Status" -ForegroundColor Blue
    Write-Host "=========================" -ForegroundColor Blue
    Write-Host ""
    
    if ($currentIP) {
        Write-Host "✅ Current IP: $currentIP" -ForegroundColor Green
        Write-Host "🌐 Web Interfaces:" -ForegroundColor Yellow
        Write-Host "   Admin Panel:  http://$currentIP`:3001" -ForegroundColor Gray
        Write-Host "   Kiosk UI:     http://$currentIP`:3002" -ForegroundColor Gray
        Write-Host "   Gateway API:  http://$currentIP`:3000" -ForegroundColor Gray
    } else {
        Write-Host "❌ Pi not found on network" -ForegroundColor Red
    }
    
    if ($config.lastKnownIP) {
        Write-Host ""
        Write-Host "📋 Last Known IP: $($config.lastKnownIP)" -ForegroundColor Gray
        Write-Host "🕒 Last Update: $($config.lastUpdate)" -ForegroundColor Gray
        
        if ($config.discoveryHistory -and $config.discoveryHistory.Count -gt 0) {
            Write-Host ""
            Write-Host "📈 Recent IP Changes:" -ForegroundColor Yellow
            $config.discoveryHistory | ForEach-Object {
                Write-Host "   $($_.from) → $($_.to) at $($_.timestamp)" -ForegroundColor Gray
            }
        }
    }
}

# Main execution
switch ($Action.ToLower()) {
    "discover" {
        Write-Log "🚀 Starting Pi IP discovery..." "INFO"
        
        $config = Get-StoredConfig
        $previousIP = $config.lastKnownIP
        $currentIP = Find-PiIP
        
        if ($currentIP) {
            $hasChanged = $previousIP -and $previousIP -ne $currentIP
            
            if ($hasChanged) {
                Write-Log "🔄 IP change detected: $previousIP → $currentIP" "INFO"
            } elseif (-not $previousIP) {
                Write-Log "🎯 First discovery: $currentIP" "INFO"
            } else {
                Write-Log "✅ IP unchanged: $currentIP" "INFO"
            }
            
            Update-Configuration -CurrentIP $currentIP -PreviousIP $previousIP
            Generate-AccessInfo -IP $currentIP
            Update-BookmarkFile -IP $currentIP
            
            Write-Host ""
            Write-Host "🎉 Pi discovered successfully!" -ForegroundColor Green
            Write-Host "🌐 Access your system at: http://$currentIP`:3001" -ForegroundColor Blue
        } else {
            Write-Log "❌ Pi discovery failed" "ERROR"
            exit 1
        }
    }
    
    "status" {
        Show-Status
    }
    
    "test" {
        $config = Get-StoredConfig
        if ($config.lastKnownIP) {
            Write-Log "🧪 Testing connection to $($config.lastKnownIP)..." "INFO"
            if (Test-PiConnection $config.lastKnownIP) {
                Write-Host "✅ Connection successful" -ForegroundColor Green
            } else {
                Write-Host "❌ Connection failed" -ForegroundColor Red
            }
        } else {
            Write-Host "⚠️  No stored IP address. Run discovery first." -ForegroundColor Yellow
        }
    }
    
    default {
        Write-Host "Usage: windows-ip-manager.ps1 -Action [discover|status|test] [-UpdateBookmarks] [-Verbose]" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Examples:" -ForegroundColor Gray
        Write-Host "  .\scripts\network\windows-ip-manager.ps1 -Action discover -Verbose" -ForegroundColor Gray
        Write-Host "  .\scripts\network\windows-ip-manager.ps1 -Action status" -ForegroundColor Gray
        Write-Host "  .\scripts\network\windows-ip-manager.ps1 -Action test" -ForegroundColor Gray
    }
}