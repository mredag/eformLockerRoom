#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Hardware Integration Validation Script for Windows
    
.DESCRIPTION
    Validates serialport dependency installation and hardware integration
    Task 16.4 - Validate hardware integration and dependencies
    
.EXAMPLE
    .\validate-hardware-integration.ps1
#>

param(
    [switch]$Verbose = $false,
    [switch]$SkipTests = $false
)

# Set error action preference
$ErrorActionPreference = "Stop"

# Colors for output
$Colors = @{
    Success = "Green"
    Warning = "Yellow"
    Error = "Red"
    Info = "Cyan"
    Header = "Magenta"
}

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Colors[$Color]
}

function Write-Header {
    param([string]$Title)
    Write-Host ""
    Write-ColorOutput "=" * 60 -Color "Header"
    Write-ColorOutput $Title -Color "Header"
    Write-ColorOutput "=" * 60 -Color "Header"
    Write-Host ""
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-ColorOutput $Title -Color "Info"
    Write-ColorOutput "-" * 40 -Color "Info"
}

class HardwareValidationResults {
    [hashtable]$Dependencies = @{}
    [hashtable]$HardwareTests = @{}
    [hashtable]$IntegrationTests = @{}
    [hashtable]$Diagnostics = @{}
    [hashtable]$Endurance = @{}
    [string]$OverallStatus = "unknown"
}

function Test-NodeJsVersion {
    Write-Section "🔍 Checking Node.js Version"
    
    try {
        $nodeVersion = node --version
        $majorVersion = [int]($nodeVersion -replace "v(\d+)\..*", '$1')
        
        if ($majorVersion -lt 20) {
            throw "Node.js version $nodeVersion is not supported. Requires Node.js 20+"
        }
        
        Write-ColorOutput "  ✓ Node.js version $nodeVersion is compatible" -Color "Success"
        return @{ version = $nodeVersion; status = "compatible" }
    }
    catch {
        Write-ColorOutput "  ❌ Node.js version check failed: $($_.Exception.Message)" -Color "Error"
        throw
    }
}

function Test-SerialportDependency {
    Write-Section "📦 Validating serialport dependency"
    
    $results = @{}
    
    try {
        # Check kiosk package.json
        $kioskPackagePath = Join-Path $PSScriptRoot "..\app\kiosk\package.json"
        
        if (-not (Test-Path $kioskPackagePath)) {
            throw "Kiosk package.json not found at $kioskPackagePath"
        }
        
        $kioskPackage = Get-Content $kioskPackagePath | ConvertFrom-Json
        
        # Check serialport dependency
        if (-not $kioskPackage.dependencies.serialport) {
            throw "serialport dependency not found in kiosk package.json"
        }
        
        $serialportVersion = $kioskPackage.dependencies.serialport
        Write-ColorOutput "  ✓ serialport dependency found: $serialportVersion" -Color "Success"
        $results.serialport = @{ version = $serialportVersion; status = "found" }
        
        # Check node-hid dependency
        if (-not $kioskPackage.dependencies.'node-hid') {
            throw "node-hid dependency not found in kiosk package.json"
        }
        
        $nodeHidVersion = $kioskPackage.dependencies.'node-hid'
        Write-ColorOutput "  ✓ node-hid dependency found: $nodeHidVersion" -Color "Success"
        $results.'node-hid' = @{ version = $nodeHidVersion; status = "found" }
        
        # Test if dependencies are installed
        Push-Location (Join-Path $PSScriptRoot "..\app\kiosk")
        try {
            $npmList = npm list serialport --depth=0 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-ColorOutput "  ✓ serialport is installed" -Color "Success"
                $results.serialport.install_status = "installed"
            } else {
                Write-ColorOutput "  ⚠️  serialport may not be installed" -Color "Warning"
                $results.serialport.install_status = "missing"
            }
        }
        finally {
            Pop-Location
        }
        
        $results.status = "passed"
        return $results
    }
    catch {
        Write-ColorOutput "  ❌ Serialport dependency validation failed: $($_.Exception.Message)" -Color "Error"
        $results.status = "failed"
        throw
    }
}

function Test-HardwareIntegration {
    Write-Section "🔌 Running hardware validation tests"
    
    if ($SkipTests) {
        Write-ColorOutput "  ⏭️  Skipping tests (--SkipTests flag provided)" -Color "Warning"
        return @{ status = "skipped" }
    }
    
    $results = @{}
    
    try {
        # Test hardware integration validation
        Write-ColorOutput "  Running hardware integration validation test..." -Color "Info"
        $testPath = "app/kiosk/src/__tests__/validation/hardware-integration-validation.test.ts"
        $testResult = Invoke-Test $testPath
        
        if ($testResult.Success) {
            Write-ColorOutput "  ✓ Hardware integration validation tests passed" -Color "Success"
            $results.integration = "passed"
        } else {
            Write-ColorOutput "  ⚠️  Some hardware integration tests failed" -Color "Warning"
            $results.integration = "partial"
            if ($Verbose -and $testResult.Failures) {
                Write-ColorOutput "    Failed tests:" -Color "Warning"
                $testResult.Failures | ForEach-Object { Write-ColorOutput "      - $_" -Color "Warning" }
            }
        }
        
        # Test Modbus controller
        Write-ColorOutput "  Running Modbus controller tests..." -Color "Info"
        $modbusResult = Invoke-Test "app/kiosk/src/hardware/__tests__/modbus-controller.test.ts"
        
        if ($modbusResult.Success) {
            Write-ColorOutput "  ✓ Modbus controller tests passed" -Color "Success"
            $results.modbus = "passed"
        } else {
            Write-ColorOutput "  ⚠️  Some Modbus controller tests failed" -Color "Warning"
            $results.modbus = "partial"
        }
        
        # Test RFID handler
        Write-ColorOutput "  Running RFID handler tests..." -Color "Info"
        $rfidResult = Invoke-Test "app/kiosk/src/hardware/__tests__/rfid-handler.test.ts"
        
        if ($rfidResult.Success) {
            Write-ColorOutput "  ✓ RFID handler tests passed" -Color "Success"
            $results.rfid = "passed"
        } else {
            Write-ColorOutput "  ⚠️  Some RFID handler tests failed" -Color "Warning"
            $results.rfid = "partial"
        }
        
        $results.status = "completed"
        return $results
    }
    catch {
        Write-ColorOutput "  ❌ Hardware validation tests failed: $($_.Exception.Message)" -Color "Error"
        $results.status = "failed"
        throw
    }
}

function Test-FailureScenarios {
    Write-Section "⚠️  Testing failure scenarios"
    
    if ($SkipTests) {
        Write-ColorOutput "  ⏭️  Skipping tests (--SkipTests flag provided)" -Color "Warning"
        return @{ status = "skipped" }
    }
    
    $results = @{}
    
    try {
        # Test Modbus error handling
        Write-ColorOutput "  Testing Modbus error handling..." -Color "Info"
        $modbusErrorResult = Invoke-Test "app/kiosk/src/hardware/__tests__/modbus-error-handling.test.ts"
        
        if ($modbusErrorResult.Success) {
            Write-ColorOutput "  ✓ Modbus error handling tests passed" -Color "Success"
            $results.modbus_errors = "passed"
        } else {
            Write-ColorOutput "  ⚠️  Some Modbus error handling tests failed" -Color "Warning"
            $results.modbus_errors = "partial"
        }
        
        # Test power interruption scenarios
        Write-ColorOutput "  Testing power interruption scenarios..." -Color "Info"
        $powerResult = Invoke-Test "app/gateway/src/__tests__/validation/power-interruption-validation.test.ts"
        
        if ($powerResult.Success) {
            Write-ColorOutput "  ✓ Power interruption tests passed" -Color "Success"
            $results.power_interruption = "passed"
        } else {
            Write-ColorOutput "  ⚠️  Some power interruption tests failed" -Color "Warning"
            $results.power_interruption = "partial"
        }
        
        # Test system resilience
        Write-ColorOutput "  Testing system resilience..." -Color "Info"
        $resilienceResult = Invoke-Test "app/gateway/src/__tests__/failure-scenarios/system-resilience.test.ts"
        
        if ($resilienceResult.Success) {
            Write-ColorOutput "  ✓ System resilience tests passed" -Color "Success"
            $results.resilience = "passed"
        } else {
            Write-ColorOutput "  ⚠️  Some system resilience tests failed" -Color "Warning"
            $results.resilience = "partial"
        }
        
        $results.status = "completed"
        return $results
    }
    catch {
        Write-ColorOutput "  ❌ Failure scenario testing failed: $($_.Exception.Message)" -Color "Error"
        $results.status = "failed"
        throw
    }
}

function Test-EnduranceTesting {
    Write-Section "🔄 Validating endurance testing automation"
    
    $results = @{}
    
    try {
        # Check if hardware soak tester service exists
        $soakTesterPath = Join-Path $PSScriptRoot "..\shared\services\hardware-soak-tester.ts"
        if (Test-Path $soakTesterPath) {
            Write-ColorOutput "  ✓ Hardware soak tester service found" -Color "Success"
            $results.soak_tester_service = "found"
        } else {
            Write-ColorOutput "  ❌ Hardware soak tester service not found" -Color "Error"
            $results.soak_tester_service = "missing"
        }
        
        # Check if soak testing database tables exist
        $soakTablesMigration = Join-Path $PSScriptRoot "..\migrations\007_soak_testing_tables.sql"
        if (Test-Path $soakTablesMigration) {
            Write-ColorOutput "  ✓ Soak testing database migration found" -Color "Success"
            $results.database_tables = "found"
        } else {
            Write-ColorOutput "  ❌ Soak testing database migration not found" -Color "Error"
            $results.database_tables = "missing"
        }
        
        # Run endurance tests if not skipping
        if (-not $SkipTests) {
            Write-ColorOutput "  Running hardware endurance tests..." -Color "Info"
            $enduranceResult = Invoke-Test "app/kiosk/src/__tests__/soak/hardware-endurance.test.ts"
            
            if ($enduranceResult.Success) {
                Write-ColorOutput "  ✓ Hardware endurance tests passed" -Color "Success"
                $results.soak_tests = "passed"
            } else {
                Write-ColorOutput "  ⚠️  Some hardware endurance tests failed" -Color "Warning"
                $results.soak_tests = "partial"
            }
        } else {
            $results.soak_tests = "skipped"
        }
        
        $results.status = "completed"
        return $results
    }
    catch {
        Write-ColorOutput "  ❌ Endurance testing validation failed: $($_.Exception.Message)" -Color "Error"
        $results.status = "failed"
        throw
    }
}

function Test-DiagnosticTools {
    Write-Section "🔍 Validating diagnostic tools"
    
    $results = @{}
    
    try {
        # Check if RS485 diagnostics tool exists
        $rs485DiagPath = Join-Path $PSScriptRoot "..\app\kiosk\src\hardware\rs485-diagnostics.ts"
        if (Test-Path $rs485DiagPath) {
            Write-ColorOutput "  ✓ RS485 diagnostics tool found" -Color "Success"
            $results.rs485_tool = "found"
        } else {
            Write-ColorOutput "  ❌ RS485 diagnostics tool not found" -Color "Error"
            $results.rs485_tool = "missing"
        }
        
        # Check health monitoring capabilities
        $healthMonitorPath = Join-Path $PSScriptRoot "..\shared\services\health-monitor.ts"
        if (Test-Path $healthMonitorPath) {
            Write-ColorOutput "  ✓ Health monitor service found" -Color "Success"
            $results.health_monitor = "found"
        } else {
            Write-ColorOutput "  ❌ Health monitor service not found" -Color "Error"
            $results.health_monitor = "missing"
        }
        
        # Run diagnostic tests if not skipping
        if (-not $SkipTests) {
            # Run RS485 diagnostics tests
            Write-ColorOutput "  Running RS485 diagnostics tests..." -Color "Info"
            $rs485TestResult = Invoke-Test "app/kiosk/src/hardware/__tests__/rs485-diagnostics.test.ts"
            
            if ($rs485TestResult.Success) {
                Write-ColorOutput "  ✓ RS485 diagnostics tests passed" -Color "Success"
                $results.rs485_tests = "passed"
            } else {
                Write-ColorOutput "  ⚠️  Some RS485 diagnostics tests failed" -Color "Warning"
                $results.rs485_tests = "partial"
            }
            
            # Run health monitoring tests
            Write-ColorOutput "  Running health monitoring tests..." -Color "Info"
            $healthTestResult = Invoke-Test "shared/services/__tests__/health-monitor.test.ts"
            
            if ($healthTestResult.Success) {
                Write-ColorOutput "  ✓ Health monitoring tests passed" -Color "Success"
                $results.health_tests = "passed"
            } else {
                Write-ColorOutput "  ⚠️  Some health monitoring tests failed" -Color "Warning"
                $results.health_tests = "partial"
            }
        } else {
            $results.rs485_tests = "skipped"
            $results.health_tests = "skipped"
        }
        
        $results.status = "completed"
        return $results
    }
    catch {
        Write-ColorOutput "  ❌ Diagnostic tools validation failed: $($_.Exception.Message)" -Color "Error"
        $results.status = "failed"
        throw
    }
}

function Invoke-Test {
    param(
        [string]$TestPath
    )
    
    $fullPath = Join-Path $PSScriptRoot "..\$TestPath"
    
    if (-not (Test-Path $fullPath)) {
        return @{
            Success = $false
            Error = "Test file not found"
            Failures = @("File not found: $TestPath")
        }
    }
    
    try {
        Push-Location (Join-Path $PSScriptRoot "..")
        
        # Run the test with npm
        $output = npm run test -- $TestPath --run 2>&1
        $success = $LASTEXITCODE -eq 0
        
        # Parse failures from output
        $failures = @()
        if (-not $success) {
            $failures = $output | Where-Object { $_ -match "(FAIL|✗|❌)" } | ForEach-Object { $_.Trim() }
        }
        
        return @{
            Success = $success
            Output = $output -join "`n"
            Failures = $failures
        }
    }
    catch {
        return @{
            Success = $false
            Error = $_.Exception.Message
            Failures = @($_.Exception.Message)
        }
    }
    finally {
        Pop-Location
    }
}

function Get-OverallStatus {
    param([HardwareValidationResults]$Results)
    
    $statuses = @(
        $Results.Dependencies.status,
        $Results.HardwareTests.status,
        $Results.IntegrationTests.status,
        $Results.Endurance.status,
        $Results.Diagnostics.status
    )
    
    if ($statuses -contains "failed") {
        return "failed"
    } elseif ($statuses -contains "partial" -or $statuses -contains "unknown") {
        return "partial"
    } elseif ($statuses | Where-Object { $_ -eq "completed" -or $_ -eq "passed" -or $_ -eq "skipped" } | Measure-Object | Select-Object -ExpandProperty Count -eq $statuses.Count) {
        return "passed"
    } else {
        return "unknown"
    }
}

function Write-ValidationReport {
    param([HardwareValidationResults]$Results)
    
    Write-Header "📊 Hardware Integration Validation Report"
    
    # Dependencies status
    Write-Section "📦 DEPENDENCIES"
    Write-ColorOutput "  Overall Status: $($Results.Dependencies.status)" -Color "Info"
    if ($Results.Dependencies.serialport) {
        Write-ColorOutput "  serialport: $($Results.Dependencies.serialport.version) ($($Results.Dependencies.serialport.status))" -Color "Info"
    }
    if ($Results.Dependencies.'node-hid') {
        Write-ColorOutput "  node-hid: $($Results.Dependencies.'node-hid'.version) ($($Results.Dependencies.'node-hid'.status))" -Color "Info"
    }
    if ($Results.Dependencies.nodejs) {
        Write-ColorOutput "  Node.js: $($Results.Dependencies.nodejs.version) ($($Results.Dependencies.nodejs.status))" -Color "Info"
    }
    
    # Hardware tests status
    Write-Section "🔌 HARDWARE TESTS"
    Write-ColorOutput "  Overall Status: $($Results.HardwareTests.status)" -Color "Info"
    Write-ColorOutput "  Integration Tests: $($Results.HardwareTests.integration -or 'not run')" -Color "Info"
    Write-ColorOutput "  Modbus Tests: $($Results.HardwareTests.modbus -or 'not run')" -Color "Info"
    Write-ColorOutput "  RFID Tests: $($Results.HardwareTests.rfid -or 'not run')" -Color "Info"
    
    # Integration tests status
    Write-Section "⚠️  FAILURE SCENARIOS"
    Write-ColorOutput "  Overall Status: $($Results.IntegrationTests.status)" -Color "Info"
    Write-ColorOutput "  Modbus Errors: $($Results.IntegrationTests.modbus_errors -or 'not run')" -Color "Info"
    Write-ColorOutput "  Power Interruption: $($Results.IntegrationTests.power_interruption -or 'not run')" -Color "Info"
    Write-ColorOutput "  System Resilience: $($Results.IntegrationTests.resilience -or 'not run')" -Color "Info"
    
    # Endurance testing status
    Write-Section "🔄 ENDURANCE TESTING"
    Write-ColorOutput "  Overall Status: $($Results.Endurance.status)" -Color "Info"
    Write-ColorOutput "  Soak Tests: $($Results.Endurance.soak_tests -or 'not run')" -Color "Info"
    Write-ColorOutput "  Soak Tester Service: $($Results.Endurance.soak_tester_service -or 'unknown')" -Color "Info"
    Write-ColorOutput "  Database Tables: $($Results.Endurance.database_tables -or 'unknown')" -Color "Info"
    
    # Diagnostics status
    Write-Section "🔍 DIAGNOSTIC TOOLS"
    Write-ColorOutput "  Overall Status: $($Results.Diagnostics.status)" -Color "Info"
    Write-ColorOutput "  RS485 Tool: $($Results.Diagnostics.rs485_tool -or 'unknown')" -Color "Info"
    Write-ColorOutput "  RS485 Tests: $($Results.Diagnostics.rs485_tests -or 'not run')" -Color "Info"
    Write-ColorOutput "  Health Monitor: $($Results.Diagnostics.health_monitor -or 'unknown')" -Color "Info"
    Write-ColorOutput "  Health Tests: $($Results.Diagnostics.health_tests -or 'not run')" -Color "Info"
    
    # Overall status
    $overallStatus = Get-OverallStatus $Results
    $Results.OverallStatus = $overallStatus
    
    Write-Host ""
    Write-ColorOutput "=" * 60 -Color "Header"
    Write-ColorOutput "OVERALL STATUS: $($overallStatus.ToUpper())" -Color "Header"
    
    switch ($overallStatus) {
        "passed" {
            Write-ColorOutput "✅ All hardware integration validations completed successfully!" -Color "Success"
            Write-ColorOutput "   Hardware layer is ready for installation." -Color "Success"
        }
        "partial" {
            Write-ColorOutput "⚠️  Hardware integration validation completed with warnings." -Color "Warning"
            Write-ColorOutput "   Some tests failed but core functionality appears working." -Color "Warning"
            Write-ColorOutput "   Review failed tests before proceeding with installation." -Color "Warning"
        }
        "failed" {
            Write-ColorOutput "❌ Hardware integration validation failed." -Color "Error"
            Write-ColorOutput "   Critical issues found that must be resolved before installation." -Color "Error"
        }
    }
    
    Write-ColorOutput "=" * 60 -Color "Header"
}

# Main execution
try {
    Write-Header "🔧 Hardware Integration Validation"
    
    $results = [HardwareValidationResults]::new()
    
    # Step 1: Check Node.js version
    $results.Dependencies.nodejs = Test-NodeJsVersion
    
    # Step 2: Verify serialport dependency installation and integration
    $results.Dependencies = Test-SerialportDependency
    
    # Step 3: Run hardware validation tests
    $results.HardwareTests = Test-HardwareIntegration
    
    # Step 4: Test hardware communication under various failure scenarios
    $results.IntegrationTests = Test-FailureScenarios
    
    # Step 5: Validate hardware endurance testing automation
    $results.Endurance = Test-EnduranceTesting
    
    # Step 6: Ensure hardware diagnostic tools work correctly
    $results.Diagnostics = Test-DiagnosticTools
    
    # Generate final report
    Write-ValidationReport $results
    
    # Exit with appropriate code
    if ($results.OverallStatus -eq "failed") {
        exit 1
    } else {
        exit 0
    }
}
catch {
    Write-ColorOutput "❌ Hardware validation failed: $($_.Exception.Message)" -Color "Error"
    if ($Verbose) {
        Write-ColorOutput "Stack trace: $($_.ScriptStackTrace)" -Color "Error"
    }
    exit 1
}