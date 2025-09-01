Write-Host "🔍 Discovering eForm Pi..." -ForegroundColor Blue

$ips = @("192.168.1.8", "192.168.1.10", "192.168.1.20", "192.168.1.30", "192.168.1.40")
$found = $null

foreach ($ip in $ips) {
    Write-Host "Testing $ip..." -NoNewline
    
    $ping = Test-Connection -ComputerName $ip -Count 1 -Quiet -TimeoutSeconds 2
    if ($ping) {
        try {
            $test = ssh "pi@$ip" "test -d /home/pi/eform-locker; echo OK" 2>$null
            if ($test -eq "OK") {
                Write-Host " ✅ Found!" -ForegroundColor Green
                $found = $ip
                break
            }
        } catch {
            # SSH failed
        }
        Write-Host " ❌ No eForm" -ForegroundColor Red
    } else {
        Write-Host " ❌ No ping" -ForegroundColor Red
    }
}

Write-Host ""
if ($found -ne $null) {
    Write-Host "✅ eForm Pi found at: $found" -ForegroundColor Green
    Write-Host "🌐 Admin Panel: http://$found:3001" -ForegroundColor Yellow
    Write-Host "🌐 Kiosk UI: http://$found:3002" -ForegroundColor Yellow
    Write-Host "🔧 SSH: ssh pi@$found" -ForegroundColor Yellow
}

if ($found -eq $null) {
    Write-Host "❌ No eForm Pi found" -ForegroundColor Red
    Write-Host "💡 Check your router for Pi's current IP" -ForegroundColor Yellow
}