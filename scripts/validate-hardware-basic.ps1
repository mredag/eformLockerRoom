#!/usr/bin/env pwsh

Write-Host "Hardware Integration Validation" -ForegroundColor Magenta
Write-Host "================================" -ForegroundColor Magenta
Write-Host ""

$success = $true

# Check Node.js version
Write-Host "1. Checking Node.js Version..." -ForegroundColor Cyan
try {
    $nodeVersion = node --version
    Write-Host "   Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "   ERROR: Node.js not found" -ForegroundColor Red
    $success = $false
}

# Check serialport dependency
Write-Host "`n2. Checking serialport dependency..." -ForegroundColor Cyan
$kioskPackagePath = Join-Path $PSScriptRoot "..\app\kiosk\package.json"

if (Test-Path $kioskPackagePath) {
    $kioskPackage = Get-Content $kioskPackagePath | ConvertFrom-Json
    
    if ($kioskPackage.dependencies.serialport) {
        Write-Host "   serialport: $($kioskPackage.dependencies.serialport)" -ForegroundColor Green
    } else {
        Write-Host "   ERROR: serialport dependency not found" -ForegroundColor Red
        $success = $false
    }
    
    if ($kioskPackage.dependencies.'node-hid') {
        Write-Host "   node-hid: $($kioskPackage.dependencies.'node-hid')" -ForegroundColor Green
    } else {
        Write-Host "   ERROR: node-hid dependency not found" -ForegroundColor Red
        $success = $false
    }
} else {
    Write-Host "   ERROR: Kiosk package.json not found" -ForegroundColor Red
    $success = $false
}

# Check hardware files
Write-Host "`n3. Checking hardware implementation files..." -ForegroundColor Cyan

$files = @(
    "app\kiosk\src\hardware\modbus-controller.ts",
    "app\kiosk\src\hardware\rfid-handler.ts", 
    "app\kiosk\src\hardware\rs485-diagnostics.ts",
    "shared\services\hardware-soak-tester.ts",
    "shared\services\health-monitor.ts"
)

foreach ($file in $files) {
    $fullPath = Join-Path $PSScriptRoot "..\$file"
    if (Test-Path $fullPath) {
        Write-Host "   FOUND: $file" -ForegroundColor Green
    } else {
        Write-Host "   MISSING: $file" -ForegroundColor Red
        $success = $false
    }
}

# Check test files
Write-Host "`n4. Checking test files..." -ForegroundColor Cyan

$testFiles = @(
    "app\kiosk\src\__tests__\validation\hardware-integration-validation.test.ts",
    "app\kiosk\src\__tests__\soak\hardware-endurance.test.ts"
)

foreach ($file in $testFiles) {
    $fullPath = Join-Path $PSScriptRoot "..\$file"
    if (Test-Path $fullPath) {
        Write-Host "   FOUND: $file" -ForegroundColor Green
    } else {
        Write-Host "   MISSING: $file" -ForegroundColor Red
    }
}

# Check diagnostic tools
Write-Host "`n5. Checking diagnostic tools..." -ForegroundColor Cyan

$diagnosticFiles = @(
    "scripts\hardware-diagnostics.js",
    "scripts\validate-hardware-integration.js"
)

foreach ($file in $diagnosticFiles) {
    $fullPath = Join-Path $PSScriptRoot "..\$file"
    if (Test-Path $fullPath) {
        Write-Host "   FOUND: $file" -ForegroundColor Green
    } else {
        Write-Host "   MISSING: $file" -ForegroundColor Red
    }
}

# Summary
Write-Host "`n================================" -ForegroundColor Magenta
if ($success) {
    Write-Host "VALIDATION PASSED" -ForegroundColor Green
    Write-Host "Hardware integration is ready for installation" -ForegroundColor Green
    exit 0
} else {
    Write-Host "VALIDATION FAILED" -ForegroundColor Red
    Write-Host "Critical issues must be resolved before installation" -ForegroundColor Red
    exit 1
}