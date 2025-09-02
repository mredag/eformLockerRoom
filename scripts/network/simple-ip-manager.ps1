#!/usr/bin/env powershell
# Simple IP Management for eForm Pi
param(
    [string]$Action = "discover"
)

$PROJECT_ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$CONFIG_FILE = Join-Path $PROJECT_ROOT "config\pi-ip-config.json"

function Test-PiConnection {
    param([string]$IP)
    
    try {
        if (-not (Test-Connection -ComputerName $IP -Count 1 -Quiet)) {
            return $false
        }
        
        $result = ssh -o ConnectTimeout=3 -o BatchMode=yes "pi@$IP" "test -d /home/pi/eform-locker && echo 'FOUND'" 2>$null
        return $result -eq "FOUND"
    }
    catch {
        return $false
    }
}

function Find-PiIP {
    Write-Host "Scanning for eForm Pi..." -ForegroundColor Blue
    
    # Check stored IP first
    if (Test-Path $CONFIG_FILE) {
        try {
            $config = Get-Content $CONFIG_FILE | ConvertFrom-Json
            if ($config.lastKnownIP) {
                Write-Host "Testing stored IP: $($config.lastKnownIP)" -ForegroundColor Yellow
                if (Test-PiConnection $config.lastKnownIP) {
                    Write-Host "Found Pi at stored IP: $($config.lastKnownIP)" -ForegroundColor Green
                    return $config.lastKnownIP
                }
            }
        }
        catch {
            Write-Host "Could not read stored config" -ForegroundColor Yellow
        }
    }
    
    # Scan network
    $ranges = @("192.168.1.", "192.168.0.", "10.0.0.")
    
    foreach ($range in $ranges) {
        Write-Host "Scanning $range*" -ForegroundColor Yellow
        
        for ($i = 1; $i -le 50; $i++) {
            $ip = "$range$i"
            
            if (Test-PiConnection $ip) {
                Write-Host "Found eForm Pi at: $ip" -ForegroundColor Green
                return $ip
            }
        }
    }
    
    Write-Host "No eForm Pi found" -ForegroundColor Red
    return $null
}

function Save-IPConfig {
    param([string]$IP)
    
    $config = @{
        lastKnownIP = $IP
        lastUpdate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        discoveredAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    }
    
    $configDir = Split-Path $CONFIG_FILE -Parent
    if (-not (Test-Path $configDir)) {
        New-Item -ItemType Directory -Path $configDir -Force | Out-Null
    }
    
    $config | ConvertTo-Json | Out-File -FilePath $CONFIG_FILE -Encoding UTF8
    Write-Host "Configuration saved" -ForegroundColor Green
}

function Generate-AccessInfo {
    param([string]$IP)
    
    $content = @"
# eForm Pi Access Information
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
IP Address: $IP

## Web Interfaces
Admin Panel:  http://$IP`:3001
Kiosk UI:     http://$IP`:3002
Gateway API:  http://$IP`:3000

## SSH Access
ssh pi@$IP

## Quick Health Check
Invoke-WebRequest -Uri "http://$IP`:3000/health" -UseBasicParsing
Invoke-WebRequest -Uri "http://$IP`:3001/health" -UseBasicParsing  
Invoke-WebRequest -Uri "http://$IP`:3002/health" -UseBasicParsing

## API Test Commands
# Open locker 5
`$body = '{"locker_id": 5, "staff_user": "test", "reason": "testing"}'
Invoke-RestMethod -Uri "http://$IP`:3002/api/locker/open" -Method POST -ContentType "application/json" -Body `$body

# Activate relay 3
`$body = '{"relay_number": 3, "staff_user": "test", "reason": "testing"}'  
Invoke-RestMethod -Uri "http://$IP`:3001/api/relay/activate" -Method POST -ContentType "application/json" -Body `$body
"@
    
    $infoFile = Join-Path $PROJECT_ROOT "CURRENT_PI_ACCESS.md"
    $content | Out-File -FilePath $infoFile -Encoding UTF8
    Write-Host "Access info saved to: CURRENT_PI_ACCESS.md" -ForegroundColor Green
}

# Main execution
switch ($Action.ToLower()) {
    "discover" {
        $ip = Find-PiIP
        
        if ($ip) {
            Save-IPConfig -IP $ip
            Generate-AccessInfo -IP $ip
            
            Write-Host ""
            Write-Host "SUCCESS! Pi discovered at: $ip" -ForegroundColor Green
            Write-Host "Admin Panel: http://$ip`:3001" -ForegroundColor Blue
            Write-Host "Kiosk UI: http://$ip`:3002" -ForegroundColor Blue
            Write-Host "Gateway API: http://$ip`:3000" -ForegroundColor Blue
        } else {
            Write-Host "FAILED: Could not find eForm Pi" -ForegroundColor Red
            exit 1
        }
    }
    
    "status" {
        if (Test-Path $CONFIG_FILE) {
            $config = Get-Content $CONFIG_FILE | ConvertFrom-Json
            Write-Host "Last Known IP: $($config.lastKnownIP)" -ForegroundColor Blue
            Write-Host "Last Update: $($config.lastUpdate)" -ForegroundColor Gray
            
            if (Test-PiConnection $config.lastKnownIP) {
                Write-Host "Status: ONLINE" -ForegroundColor Green
            } else {
                Write-Host "Status: OFFLINE or IP changed" -ForegroundColor Red
            }
        } else {
            Write-Host "No stored configuration. Run discovery first." -ForegroundColor Yellow
        }
    }
    
    "test" {
        if (Test-Path $CONFIG_FILE) {
            $config = Get-Content $CONFIG_FILE | ConvertFrom-Json
            Write-Host "Testing connection to $($config.lastKnownIP)..." -ForegroundColor Yellow
            
            if (Test-PiConnection $config.lastKnownIP) {
                Write-Host "Connection: SUCCESS" -ForegroundColor Green
            } else {
                Write-Host "Connection: FAILED" -ForegroundColor Red
            }
        } else {
            Write-Host "No stored IP. Run discovery first." -ForegroundColor Yellow
        }
    }
    
    default {
        Write-Host "Usage: simple-ip-manager.ps1 [discover|status|test]" -ForegroundColor Yellow
    }
}