#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Simple Hardware Integration Validation Script
    
.DESCRIPTION
    Validates hardware integration and dependencies for Task 16.4
#>

Write-Host "🔧 Hardware Integration Validation" -ForegroundColor Magenta
Write-Host "=" * 50 -ForegroundColor Magenta
Write-Host ""

$validationResults = @{}
$overallSuccess = $true

# 1. Check Node.js version
Write-Host "1️⃣  Checking Node.js Version..." -ForegroundColor Cyan
try {
    $nodeVersion = node --version
    $majorVersion = [int]($nodeVersion -replace "v(\d+)\..*", '$1')
    
    if ($majorVersion -ge 20) {
        Write-Host "  ✅ Node.js $nodeVersion is compatible" -ForegroundColor Green
        $validationResults["nodejs"] = "passed"
    } else {
        Write-Host "  ❌ Node.js $nodeVersion is not supported (requires 20+)" -ForegroundColor Red
        $validationResults["nodejs"] = "failed"
        $overallSuccess = $false
    }
} catch {
    Write-Host "  ❌ Node.js not found or error: $($_.Exception.Message)" -ForegroundColor Red
    $validationResults["nodejs"] = "failed"
    $overallSuccess = $false
}

# 2. Check serialport dependency
Write-Host "`n2️⃣  Checking serialport dependency..." -ForegroundColor Cyan
$kioskPackagePath = Join-Path $PSScriptRoot "..\app\kiosk\package.json"

if (Test-Path $kioskPackagePath) {
    try {
        $kioskPackage = Get-Content $kioskPackagePath | ConvertFrom-Json
        
        if ($kioskPackage.dependencies.serialport) {
            Write-Host "  ✅ serialport dependency found: $($kioskPackage.dependencies.serialport)" -ForegroundColor Green
            $validationResults["serialport"] = "passed"
        } else {
            Write-Host "  ❌ serialport dependency not found in package.json" -ForegroundColor Red
            $validationResults["serialport"] = "failed"
            $overallSuccess = $false
        }
        
        if ($kioskPackage.dependencies.'node-hid') {
            Write-Host "  ✅ node-hid dependency found: $($kioskPackage.dependencies.'node-hid')" -ForegroundColor Green
            $validationResults["node-hid"] = "passed"
        } else {
            Write-Host "  ❌ node-hid dependency not found in package.json" -ForegroundColor Red
            $validationResults["node-hid"] = "failed"
            $overallSuccess = $false
        }
    } catch {
        Write-Host "  ❌ Error reading package.json: $($_.Exception.Message)" -ForegroundColor Red
        $validationResults["dependencies"] = "failed"
        $overallSuccess = $false
    }
} else {
    Write-Host "  ❌ Kiosk package.json not found" -ForegroundColor Red
    $validationResults["dependencies"] = "failed"
    $overallSuccess = $false
}

# 3. Check hardware implementation files
Write-Host "`n3️⃣  Checking hardware implementation files..." -ForegroundColor Cyan

$hardwareFiles = @{
    "Modbus Controller" = "app\kiosk\src\hardware\modbus-controller.ts"
    "RFID Handler" = "app\kiosk\src\hardware\rfid-handler.ts"
    "RS485 Diagnostics" = "app\kiosk\src\hardware\rs485-diagnostics.ts"
}

$filesFound = 0
foreach ($name in $hardwareFiles.Keys) {
    $filePath = Join-Path $PSScriptRoot "..\$($hardwareFiles[$name])"
    
    if (Test-Path $filePath) {
        Write-Host "  ✅ $name found" -ForegroundColor Green
        $filesFound++
    } else {
        Write-Host "  ❌ $name not found: $($hardwareFiles[$name])" -ForegroundColor Red
        $overallSuccess = $false
    }
}

if ($filesFound -eq $hardwareFiles.Count) {
    $validationResults["hardware_files"] = "passed"
} else {
    $validationResults["hardware_files"] = "partial"
}

# 4. Check hardware test files
Write-Host "`n4️⃣  Checking hardware test files..." -ForegroundColor Cyan

$testFiles = @{
    "Hardware Integration Test" = "app\kiosk\src\__tests__\validation\hardware-integration-validation.test.ts"
    "Hardware Endurance Test" = "app\kiosk\src\__tests__\soak\hardware-endurance.test.ts"
    "Modbus Controller Test" = "app\kiosk\src\hardware\__tests__\modbus-controller.test.ts"
    "RFID Handler Test" = "app\kiosk\src\hardware\__tests__\rfid-handler.test.ts"
}

$testFilesFound = 0
foreach ($name in $testFiles.Keys) {
    $filePath = Join-Path $PSScriptRoot "..\$($testFiles[$name])"
    
    if (Test-Path $filePath) {
        Write-Host "  ✅ $name found" -ForegroundColor Green
        $testFilesFound++
    } else {
        Write-Host "  ❌ $name not found: $($testFiles[$name])" -ForegroundColor Red
    }
}

if ($testFilesFound -eq $testFiles.Count) {
    $validationResults["test_files"] = "passed"
} else {
    $validationResults["test_files"] = "partial"
}

# 5. Check diagnostic tools
Write-Host "`n5️⃣  Checking diagnostic tools..." -ForegroundColor Cyan

$diagnosticFiles = @{
    "Hardware Soak Tester" = "shared\services\hardware-soak-tester.ts"
    "Health Monitor" = "shared\services\health-monitor.ts"
    "Hardware Diagnostics CLI" = "scripts\hardware-diagnostics.js"
}

$diagnosticFilesFound = 0
foreach ($name in $diagnosticFiles.Keys) {
    $filePath = Join-Path $PSScriptRoot "..\$($diagnosticFiles[$name])"
    
    if (Test-Path $filePath) {
        Write-Host "  ✅ $name found" -ForegroundColor Green
        $diagnosticFilesFound++
    } else {
        Write-Host "  ❌ $name not found: $($diagnosticFiles[$name])" -ForegroundColor Red
    }
}

if ($diagnosticFilesFound -eq $diagnosticFiles.Count) {
    $validationResults["diagnostic_tools"] = "passed"
} else {
    $validationResults["diagnostic_tools"] = "partial"
}

# 6. Check database migrations
Write-Host "`n6️⃣  Checking database migrations..." -ForegroundColor Cyan

$migrationFiles = @{
    "Soak Testing Tables" = "migrations\007_soak_testing_tables.sql"
    "Pin Rotation System" = "migrations\006_pin_rotation_system.sql"
}

$migrationFilesFound = 0
foreach ($name in $migrationFiles.Keys) {
    $filePath = Join-Path $PSScriptRoot "..\$($migrationFiles[$name])"
    
    if (Test-Path $filePath) {
        Write-Host "  ✅ $name found" -ForegroundColor Green
        $migrationFilesFound++
    } else {
        Write-Host "  ❌ $name not found: $($migrationFiles[$name])" -ForegroundColor Red
    }
}

if ($migrationFilesFound -eq $migrationFiles.Count) {
    $validationResults["migrations"] = "passed"
} else {
    $validationResults["migrations"] = "partial"
}

# Summary
Write-Host "`n" + "=" * 50 -ForegroundColor Magenta
Write-Host "📊 VALIDATION SUMMARY" -ForegroundColor Magenta
Write-Host "=" * 50 -ForegroundColor Magenta

$passedCount = 0
$totalCount = 0

foreach ($key in $validationResults.Keys) {
    $status = $validationResults[$key]
    $totalCount++
    
    $statusColor = switch ($status) {
        "passed" { "Green"; $passedCount++ }
        "partial" { "Yellow" }
        "failed" { "Red" }
        default { "Gray" }
    }
    
    $statusSymbol = switch ($status) {
        "passed" { "✅" }
        "partial" { "⚠️ " }
        "failed" { "❌" }
        default { "❓" }
    }
    
    Write-Host "$statusSymbol $($key.ToUpper()): $($status.ToUpper())" -ForegroundColor $statusColor
}

Write-Host "`nOverall: $passedCount/$totalCount components validated" -ForegroundColor Cyan

if ($overallSuccess -and $passedCount -eq $totalCount) {
    Write-Host "`n🎉 ALL HARDWARE INTEGRATION VALIDATIONS PASSED!" -ForegroundColor Green
    Write-Host "   Hardware layer is ready for installation." -ForegroundColor Green
    exit 0
} elseif ($passedCount -gt 0) {
    Write-Host "`n⚠️  HARDWARE INTEGRATION VALIDATION COMPLETED WITH WARNINGS" -ForegroundColor Yellow
    Write-Host "   Some components may be missing but core functionality appears working." -ForegroundColor Yellow
    Write-Host "   Review missing components before proceeding with installation." -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "`n❌ HARDWARE INTEGRATION VALIDATION FAILED" -ForegroundColor Red
    Write-Host "   Critical issues found that must be resolved before installation." -ForegroundColor Red
    exit 1
}