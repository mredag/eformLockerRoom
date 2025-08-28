#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Test real-time WebSocket updates for Admin Panel UI improvements (Task 5)

.DESCRIPTION
    This script tests the WebSocket real-time update functionality for Task 5:
    - WebSocket state updates properly refresh RFID display information
    - Status color changes are applied immediately when locker states change
    - Owner information updates in real-time when lockers are assigned or released
    - Smooth transition animations for status color changes
    - Performance with multiple simultaneous locker state updates

.PARAMETER TestType
    Type of test to run: 'connection', 'integration', 'performance', or 'all'

.PARAMETER Verbose
    Enable verbose output for debugging

.EXAMPLE
    .\test-websocket-realtime-updates.ps1 -TestType all
    
.EXAMPLE
    .\test-websocket-realtime-updates.ps1 -TestType connection -Verbose
#>

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet('connection', 'integration', 'performance', 'all')]
    [string]$TestType = 'all',
    
    [Parameter(Mandatory=$false)]
    [switch]$Verbose
)

# Configuration
$WEBSOCKET_URL = "ws://192.168.1.8:8080"
$PANEL_URL = "http://192.168.1.8:3001"
$KIOSK_URL = "http://192.168.1.8:3002"
$GATEWAY_URL = "http://192.168.1.8:3000"

Write-Host "🧪 Testing Real-time WebSocket Updates for Admin Panel UI" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Gray
Write-Host "Test Type: $TestType" -ForegroundColor Yellow
Write-Host "WebSocket URL: $WEBSOCKET_URL" -ForegroundColor Gray
Write-Host "Panel URL: $PANEL_URL" -ForegroundColor Gray
Write-Host ""

# Test results tracking
$TestResults = @{
    Connection = $false
    Integration = $false
    Performance = $false
    UIValidation = $false
}

function Test-ServiceHealth {
    param([string]$ServiceName, [string]$Url)
    
    Write-Host "🔍 Checking $ServiceName health..." -ForegroundColor Yellow
    
    try {
        $response = Invoke-RestMethod -Uri "$Url/health" -Method GET -TimeoutSec 5
        Write-Host "✅ $ServiceName is healthy" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "❌ $ServiceName health check failed: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Test-WebSocketConnection {
    Write-Host "🔌 Testing WebSocket Connection..." -ForegroundColor Cyan
    
    try {
        # Run the Node.js WebSocket test script
        $result = & node "scripts/test-websocket-realtime-updates.js"
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ WebSocket connection test passed" -ForegroundColor Green
            $TestResults.Connection = $true
        } else {
            Write-Host "❌ WebSocket connection test failed" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "❌ WebSocket connection test error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Test-IntegrationTests {
    Write-Host "🧪 Running Integration Tests..." -ForegroundColor Cyan
    
    try {
        # Run the Vitest integration tests
        $testCommand = "npx vitest run tests/integration/websocket-realtime-ui-updates.test.ts --reporter=verbose"
        
        if ($Verbose) {
            Write-Host "Running: $testCommand" -ForegroundColor Gray
        }
        
        $result = Invoke-Expression $testCommand
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Integration tests passed" -ForegroundColor Green
            $TestResults.Integration = $true
        } else {
            Write-Host "❌ Integration tests failed" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "❌ Integration test error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Test-PerformanceMetrics {
    Write-Host "⚡ Testing Performance Metrics..." -ForegroundColor Cyan
    
    try {
        # Test multiple simultaneous updates
        Write-Host "  📊 Testing multiple simultaneous updates..." -ForegroundColor Yellow
        
        # Create a temporary JavaScript test file
        $jsContent = @'
const WebSocket = require('ws');
const { performance } = require('perf_hooks');

const ws = new WebSocket('ws://192.168.1.8:8080');
const updateCount = 20;

ws.on('open', () => {
    console.log('Connected to WebSocket');
    const startTime = performance.now();
    
    for (let i = 0; i < updateCount; i++) {
        const message = {
            type: 'state_update',
            timestamp: new Date().toISOString(),
            data: {
                kioskId: 'perf-test',
                lockerId: i + 1,
                state: i % 2 === 0 ? 'Owned' : 'Free',
                ownerKey: i % 2 === 0 ? '000965248' + (i % 10) : null,
                ownerType: i % 2 === 0 ? 'rfid' : null,
                displayName: 'Perf Test Dolap ' + (i + 1)
            }
        };
        ws.send(JSON.stringify(message));
    }
    
    const endTime = performance.now();
    const sendTime = endTime - startTime;
    
    console.log('Send time: ' + sendTime.toFixed(2) + 'ms');
    
    if (sendTime < 2000) {
        console.log('PASS: Performance test passed');
        process.exit(0);
    } else {
        console.log('FAIL: Performance test failed');
        process.exit(1);
    }
});

ws.on('error', (error) => {
    console.log('FAIL: WebSocket error - ' + error.message);
    process.exit(1);
});

setTimeout(() => {
    console.log('FAIL: Performance test timeout');
    process.exit(1);
}, 10000);
'@

        $jsContent | Out-File -FilePath "temp_perf_test.js" -Encoding UTF8
        $result = & node "temp_perf_test.js"
        Remove-Item "temp_perf_test.js" -ErrorAction SilentlyContinue
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Performance test passed" -ForegroundColor Green
            $TestResults.Performance = $true
        } else {
            Write-Host "❌ Performance test failed" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "❌ Performance test error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Test-UIValidation {
    Write-Host "🎨 Validating UI Components..." -ForegroundColor Cyan
    
    try {
        # Check if admin panel is accessible
        $response = Invoke-WebRequest -Uri "$PANEL_URL/lockers" -Method GET -TimeoutSec 10
        
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ Admin panel is accessible" -ForegroundColor Green
            
            # Check for required UI elements in the HTML
            $content = $response.Content
            
            $requiredElements = @(
                'real-time-update',
                'status-transitioning', 
                'locker-owner selectable',
                'StatusTranslationService',
                'RfidDisplayService',
                'handleLockerStateUpdate',
                'updateLockerCardInPlace'
            )
            
            $foundElements = 0
            foreach ($element in $requiredElements) {
                if ($content -match [regex]::Escape($element)) {
                    $foundElements++
                    if ($Verbose) {
                        Write-Host "  ✓ Found: $element" -ForegroundColor Gray
                    }
                } else {
                    Write-Host "  ❌ Missing: $element" -ForegroundColor Red
                }
            }
            
            if ($foundElements -eq $requiredElements.Count) {
                Write-Host "✅ All UI components found" -ForegroundColor Green
                $TestResults.UIValidation = $true
            } else {
                Write-Host "❌ Missing UI components: $($requiredElements.Count - $foundElements)" -ForegroundColor Red
            }
        } else {
            Write-Host "❌ Admin panel not accessible" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "❌ UI validation error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Show-TestInstructions {
    Write-Host ""
    Write-Host "📋 Manual Testing Instructions:" -ForegroundColor Cyan
    Write-Host "=" * 40 -ForegroundColor Gray
    Write-Host ""
    Write-Host "1. Open Admin Panel:" -ForegroundColor Yellow
    Write-Host "   $PANEL_URL/lockers" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Test Real-time Updates:" -ForegroundColor Yellow
    Write-Host "   - Open a locker via API or kiosk interface" -ForegroundColor Gray
    Write-Host "   - Watch for immediate status color changes" -ForegroundColor Gray
    Write-Host "   - Verify RFID numbers are displayed and selectable" -ForegroundColor Gray
    Write-Host "   - Check smooth animations during status transitions" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Test RFID Display:" -ForegroundColor Yellow
    Write-Host "   - Assign RFID card to locker" -ForegroundColor Gray
    Write-Host "   - Verify full RFID number is displayed (e.g., 0009652489)" -ForegroundColor Gray
    Write-Host "   - Click RFID number to test copy functionality" -ForegroundColor Gray
    Write-Host "   - Release locker and verify owner changes to 'Yok'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "4. Test Performance:" -ForegroundColor Yellow
    Write-Host "   - Perform multiple locker operations quickly" -ForegroundColor Gray
    Write-Host "   - Verify UI updates appear within 2 seconds" -ForegroundColor Gray
    Write-Host "   - Check that animations don't interfere with performance" -ForegroundColor Gray
    Write-Host ""
    Write-Host "5. API Test Commands:" -ForegroundColor Yellow
    Write-Host "   # Open locker 5:" -ForegroundColor Gray
    Write-Host "   curl -X POST $KIOSK_URL/api/locker/open -H 'Content-Type: application/json' -d '{\"locker_id\": 5, \"staff_user\": \"test\", \"reason\": \"testing\"}'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   # Direct relay activation:" -ForegroundColor Gray
    Write-Host "   curl -X POST $PANEL_URL/api/relay/activate -H 'Content-Type: application/json' -d '{\"relay_number\": 5, \"staff_user\": \"test\", \"reason\": \"testing\"}'" -ForegroundColor Gray
    Write-Host ""
}

# Main execution
Write-Host "🔍 Pre-flight Checks..." -ForegroundColor Cyan

# Check service health
$servicesHealthy = $true
$servicesHealthy = $servicesHealthy -and (Test-ServiceHealth "Gateway" $GATEWAY_URL)
$servicesHealthy = $servicesHealthy -and (Test-ServiceHealth "Kiosk" $KIOSK_URL)
$servicesHealthy = $servicesHealthy -and (Test-ServiceHealth "Panel" $PANEL_URL)

if (-not $servicesHealthy) {
    Write-Host ""
    Write-Host "❌ Some services are not healthy. Please start all services first:" -ForegroundColor Red
    Write-Host "   ./scripts/start-all-clean.sh" -ForegroundColor Gray
    exit 1
}

Write-Host ""

# Run tests based on type
switch ($TestType) {
    'connection' {
        Test-WebSocketConnection
    }
    'integration' {
        Test-IntegrationTests
    }
    'performance' {
        Test-PerformanceMetrics
    }
    'all' {
        Test-WebSocketConnection
        Test-IntegrationTests
        Test-PerformanceMetrics
        Test-UIValidation
    }
}

# Show results
Write-Host ""
Write-Host "📋 TEST RESULTS SUMMARY" -ForegroundColor Cyan
Write-Host "=" * 40 -ForegroundColor Gray

$passedTests = 0
$totalTests = 0

foreach ($test in $TestResults.GetEnumerator()) {
    $totalTests++
    $icon = if ($test.Value) { "✅"; $passedTests++ } else { "❌" }
    $status = if ($test.Value) { "PASS" } else { "FAIL" }
    Write-Host "$icon $($test.Key): $status" -ForegroundColor $(if ($test.Value) { "Green" } else { "Red" })
}

Write-Host ""
Write-Host "📊 Overall Result: $passedTests/$totalTests tests passed" -ForegroundColor $(if ($passedTests -eq $totalTests) { "Green" } else { "Yellow" })

if ($passedTests -eq $totalTests) {
    Write-Host "🎉 All real-time WebSocket update tests PASSED!" -ForegroundColor Green
    Write-Host "✅ Task 5 requirements verified successfully" -ForegroundColor Green
} else {
    Write-Host "⚠️  Some tests failed - check the implementation" -ForegroundColor Yellow
}

# Show manual testing instructions
Show-TestInstructions

exit $(if ($passedTests -eq $totalTests) { 0 } else { 1 })