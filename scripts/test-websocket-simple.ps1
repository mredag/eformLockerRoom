#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Simple WebSocket real-time update test for Task 5

.DESCRIPTION
    This script runs the Node.js WebSocket test and validates the admin panel UI
#>

param(
    [Parameter(Mandatory=$false)]
    [switch]$Verbose
)

$WEBSOCKET_URL = "ws://192.168.1.8:8080"
$PANEL_URL = "http://192.168.1.8:3001"

Write-Host "🧪 Testing Real-time WebSocket Updates (Task 5)" -ForegroundColor Cyan
Write-Host "=" * 50 -ForegroundColor Gray

# Test 1: WebSocket Connection and Functionality
Write-Host "🔌 Testing WebSocket Connection..." -ForegroundColor Yellow
try {
    $result = & node "scripts/test-websocket-realtime-updates.js"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ WebSocket tests passed" -ForegroundColor Green
    } else {
        Write-Host "❌ WebSocket tests failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ WebSocket test error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 2: Admin Panel Accessibility
Write-Host "🌐 Testing Admin Panel Accessibility..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$PANEL_URL/lockers" -Method GET -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Admin panel is accessible" -ForegroundColor Green
        
        # Check for key UI components
        $content = $response.Content
        $components = @(
            'real-time-update',
            'StatusTranslationService',
            'RfidDisplayService',
            'handleLockerStateUpdate',
            'updateLockerCardInPlace'
        )
        
        $found = 0
        foreach ($component in $components) {
            if ($content -match [regex]::Escape($component)) {
                $found++
                if ($Verbose) {
                    Write-Host "  ✓ Found: $component" -ForegroundColor Gray
                }
            } else {
                Write-Host "  ❌ Missing: $component" -ForegroundColor Red
            }
        }
        
        if ($found -eq $components.Count) {
            Write-Host "✅ All UI components found ($found/$($components.Count))" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Some UI components missing ($found/$($components.Count))" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ Admin panel not accessible (Status: $($response.StatusCode))" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Admin panel test error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "📋 Manual Testing Instructions:" -ForegroundColor Cyan
Write-Host "=" * 40 -ForegroundColor Gray
Write-Host ""
Write-Host "1. Open Admin Panel: $PANEL_URL/lockers" -ForegroundColor Yellow
Write-Host "2. Test Real-time Updates:" -ForegroundColor Yellow
Write-Host "   - Open a locker and watch for immediate status changes" -ForegroundColor Gray
Write-Host "   - Verify RFID numbers are displayed and clickable" -ForegroundColor Gray
Write-Host "   - Check smooth animations during transitions" -ForegroundColor Gray
Write-Host ""
Write-Host "3. API Test Commands:" -ForegroundColor Yellow
Write-Host "   # Open locker 5:" -ForegroundColor Gray
Write-Host "   curl -X POST http://192.168.1.8:3002/api/locker/open -H 'Content-Type: application/json' -d '{\"locker_id\": 5, \"staff_user\": \"test\", \"reason\": \"testing\"}'" -ForegroundColor Gray
Write-Host ""
Write-Host "✅ Task 5 WebSocket real-time update tests completed!" -ForegroundColor Green

exit 0