# Simple Pi Discovery Script
param(
    [string]$Command = "discover"
)

$KNOWN_IPS = @("192.168.1.8", "192.168.1.8", "192.168.1.8", "192.168.1.8", "192.168.1.8")

Write-Host "🔍 Finding eForm Pi..." -ForegroundColor Blue

function Test-EformPi {
    param([string]$ip)
    try {
        $result = ssh "pi@$ip" "test -d /home/pi/eform-locker; echo found" 2>$null
        return $result -eq "found"
    }
    catch {
        return $false
    }
}

$foundIP = $null

foreach ($ip in $KNOWN_IPS) {
    Write-Host "Checking $ip..." -NoNewline
    
    if (Test-Connection -ComputerName $ip -Count 1 -Quiet -TimeoutSeconds 2) {
        if (Test-EformPi $ip) {
            Write-Host " ✅ Found eForm Pi!" -ForegroundColor Green
            $foundIP = $ip
            break
        }
        else {
            Write-Host " ❌ Not eForm Pi" -ForegroundColor Red
        }
    }
    else {
        Write-Host " ❌ No response" -ForegroundColor Red
    }
}

if ($foundIP) {
    Write-Host ""
    Write-Host "✅ eForm Pi discovered at: $foundIP" -ForegroundColor Green
    Write-Host ""
    Write-Host "🌐 Web Interfaces:" -ForegroundColor Yellow
    Write-Host "  Admin Panel:   http://$foundIP:3001" -ForegroundColor Gray
    Write-Host "  Kiosk UI:      http://$foundIP:3002" -ForegroundColor Gray
    Write-Host "  Gateway API:   http://$foundIP:3000" -ForegroundColor Gray
    Write-Host ""
    Write-Host "🔧 SSH Access:" -ForegroundColor Yellow
    Write-Host "  ssh pi@$foundIP" -ForegroundColor Gray
    Write-Host ""
    
    # Update the original pi-manager script with discovered IP
    Write-Host "💡 To use with original pi-manager:" -ForegroundColor Yellow
    Write-Host "  Update PI_HOST in pi-manager.ps1 to: pi@$foundIP" -ForegroundColor Gray
}
else {
    Write-Host ""
    Write-Host "❌ No eForm Pi found on known addresses" -ForegroundColor Red
    Write-Host "⚠️  Your Pi might have a different IP address" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "💡 Solutions:" -ForegroundColor Yellow
    Write-Host "  1. Check your router's DHCP client list" -ForegroundColor Gray
    Write-Host "  2. Use: nmap -sn 192.168.1.8/24 | grep -B2 'Raspberry Pi'" -ForegroundColor Gray
    Write-Host "  3. Connect monitor/keyboard to Pi and run: hostname -I" -ForegroundColor Gray
}