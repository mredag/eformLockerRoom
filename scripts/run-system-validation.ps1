#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Comprehensive System Validation Test Runner
    
.DESCRIPTION
    Runs complete system validation and performance testing for the Eform Locker System.
    This script validates all requirements and performs acceptance testing.
    
.PARAMETER TestType
    Type of validation to run: all, unit, integration, performance, hardware, security
    
.PARAMETER Verbose
    Enable verbose output
    
.PARAMETER GenerateReport
    Generate detailed test report
#>

param(
    [Parameter()]
    [ValidateSet("all", "unit", "integration", "performance", "hardware", "security")]
    [string]$TestType = "all",
    
    [Parameter()]
    [switch]$Verbose,
    
    [Parameter()]
    [switch]$GenerateReport
)

# Configuration
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Test configuration
$TestConfig = @{
    timeout = 300000  # 5 minutes
    retries = 2
    parallel = $true
}

# Colors for output
$Colors = @{
    Success = "Green"
    Error = "Red"
    Warning = "Yellow"
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
    Write-ColorOutput "=" * 80 -Color "Header"
    Write-ColorOutput " $Title" -Color "Header"
    Write-ColorOutput "=" * 80 -Color "Header"
    Write-Host ""
}

function Test-Prerequisites {
    Write-ColorOutput "🔍 Checking prerequisites..." -Color "Info"
    
    # Check Node.js version
    try {
        $nodeVersion = node --version
        if ($nodeVersion -match "v(\d+)\.") {
            $majorVersion = [int]$matches[1]
            if ($majorVersion -lt 18) {
                throw "Node.js version $nodeVersion is too old. Requires v18 or higher."
            }
        }
        Write-ColorOutput "✅ Node.js: $nodeVersion" -Color "Success"
    }
    catch {
        Write-ColorOutput "❌ Node.js not found or version check failed: $_" -Color "Error"
        return $false
    }
    
    # Check if dependencies are installed
    if (-not (Test-Path "node_modules")) {
        Write-ColorOutput "📦 Installing dependencies..." -Color "Info"
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-ColorOutput "❌ Failed to install dependencies" -Color "Error"
            return $false
        }
    }
    
    # Check database migrations
    Write-ColorOutput "🗄️ Checking database schema..." -Color "Info"
    if (Test-Path "migrations") {
        $migrationFiles = Get-ChildItem "migrations/*.sql" | Measure-Object
        Write-ColorOutput "✅ Found $($migrationFiles.Count) migration files" -Color "Success"
    }
    
    # Check test files exist
    $testPaths = @(
        "app/gateway/src/__tests__/validation/system-validation.test.ts",
        "app/gateway/src/__tests__/validation/comprehensive-system-validation.test.ts",
        "app/panel/src/__tests__/performance/panel-performance.test.ts",
        "app/kiosk/src/__tests__/validation/hardware-integration-validation.test.ts"
    )
    
    foreach ($testPath in $testPaths) {
        if (Test-Path $testPath) {
            Write-ColorOutput "✅ Test file: $testPath" -Color "Success"
        } else {
            Write-ColorOutput "⚠️ Missing test file: $testPath" -Color "Warning"
        }
    }
    
    return $true
}

function Invoke-TestSuite {
    param(
        [string]$SuiteName,
        [string]$TestPattern,
        [string]$Description
    )
    
    Write-Header $SuiteName
    Write-ColorOutput $Description -Color "Info"
    Write-Host ""
    
    $startTime = Get-Date
    
    try {
        if ($Verbose) {
            $verboseFlag = "--reporter=verbose"
        } else {
            $verboseFlag = "--reporter=default"
        }
        
        $testCommand = "npx vitest run $TestPattern $verboseFlag --timeout=$($TestConfig.timeout)"
        
        Write-ColorOutput "🧪 Running: $testCommand" -Color "Info"
        
        $result = Invoke-Expression $testCommand
        $exitCode = $LASTEXITCODE
        
        $endTime = Get-Date
        $duration = ($endTime - $startTime).TotalSeconds
        
        if ($exitCode -eq 0) {
            Write-ColorOutput "✅ $SuiteName completed successfully in $([math]::Round($duration, 2))s" -Color "Success"
            return @{
                Name = $SuiteName
                Status = "PASSED"
                Duration = $duration
                Output = $result
            }
        } else {
            Write-ColorOutput "❌ $SuiteName failed after $([math]::Round($duration, 2))s" -Color "Error"
            return @{
                Name = $SuiteName
                Status = "FAILED"
                Duration = $duration
                Output = $result
                ExitCode = $exitCode
            }
        }
    }
    catch {
        $endTime = Get-Date
        $duration = ($endTime - $startTime).TotalSeconds
        
        Write-ColorOutput "💥 $SuiteName crashed: $_" -Color "Error"
        return @{
            Name = $SuiteName
            Status = "CRASHED"
            Duration = $duration
            Error = $_.Exception.Message
        }
    }
}

function Invoke-AllValidationTests {
    $testSuites = @()
    
    # Unit Tests
    if ($TestType -eq "all" -or $TestType -eq "unit") {
        $testSuites += @{
            Name = "Unit Tests - Core Services"
            Pattern = "shared/services/__tests__/**/*.test.ts"
            Description = "Testing core business logic and services"
        }
        
        $testSuites += @{
            Name = "Unit Tests - Database Layer"
            Pattern = "shared/database/__tests__/**/*.test.ts"
            Description = "Testing database operations and repositories"
        }
    }
    
    # Integration Tests
    if ($TestType -eq "all" -or $TestType -eq "integration") {
        $testSuites += @{
            Name = "Integration Tests - Multi-Service"
            Pattern = "app/gateway/src/__tests__/integration/**/*.test.ts"
            Description = "Testing service integration and coordination"
        }
        
        $testSuites += @{
            Name = "Integration Tests - VIP Workflows"
            Pattern = "app/panel/src/__tests__/integration/**/*.test.ts"
            Description = "Testing VIP management workflows"
        }
        
        $testSuites += @{
            Name = "Integration Tests - User Flows"
            Pattern = "app/kiosk/src/__tests__/e2e/**/*.test.ts"
            Description = "Testing complete user journeys"
        }
    }
    
    # Performance Tests
    if ($TestType -eq "all" -or $TestType -eq "performance") {
        $testSuites += @{
            Name = "Performance Tests - Panel"
            Pattern = "app/panel/src/__tests__/performance/**/*.test.ts"
            Description = "Testing panel performance with 500 lockers and 3 kiosks"
        }
        
        $testSuites += @{
            Name = "Performance Tests - System Load"
            Pattern = "app/gateway/src/__tests__/validation/system-validation.test.ts"
            Description = "Testing system under realistic load"
        }
    }
    
    # Hardware Tests
    if ($TestType -eq "all" -or $TestType -eq "hardware") {
        $testSuites += @{
            Name = "Hardware Integration - Modbus"
            Pattern = "app/kiosk/src/__tests__/validation/hardware-integration-validation.test.ts"
            Description = "Testing Modbus relay control and RS485 communication"
        }
        
        $testSuites += @{
            Name = "Hardware Integration - RFID"
            Pattern = "app/kiosk/src/__tests__/integration/rfid-qr-integration.test.ts"
            Description = "Testing RFID reader integration"
        }
        
        $testSuites += @{
            Name = "Hardware Endurance - Soak Testing"
            Pattern = "app/kiosk/src/__tests__/soak/hardware-endurance.test.ts"
            Description = "Testing 1000-cycle hardware endurance"
        }
    }
    
    # Security Tests
    if ($TestType -eq "all" -or $TestType -eq "security") {
        $testSuites += @{
            Name = "Security Validation - Authentication"
            Pattern = "app/panel/src/__tests__/auth-*.test.ts"
            Description = "Testing authentication and authorization"
        }
        
        $testSuites += @{
            Name = "Security Validation - Rate Limiting"
            Pattern = "shared/services/__tests__/rate-limiter.test.ts"
            Description = "Testing rate limiting and security measures"
        }
        
        $testSuites += @{
            Name = "Security Validation - Input Validation"
            Pattern = "shared/services/__tests__/security-validation.test.ts"
            Description = "Testing input sanitization and validation"
        }
    }
    
    # Comprehensive System Validation
    if ($TestType -eq "all") {
        $testSuites += @{
            Name = "Comprehensive System Validation"
            Pattern = "app/gateway/src/__tests__/validation/comprehensive-system-validation.test.ts"
            Description = "Complete system acceptance testing against all requirements"
        }
    }
    
    return $testSuites
}

function New-TestReport {
    param([array]$Results)
    
    $reportPath = "test-results/system-validation-report-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
    $htmlReportPath = "test-results/system-validation-report-$(Get-Date -Format 'yyyyMMdd-HHmmss').html"
    
    # Ensure directory exists
    if (-not (Test-Path "test-results")) {
        New-Item -ItemType Directory -Path "test-results" -Force | Out-Null
    }
    
    # Generate JSON report
    $report = @{
        timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
        test_type = $TestType
        total_suites = $Results.Count
        passed = ($Results | Where-Object { $_.Status -eq "PASSED" }).Count
        failed = ($Results | Where-Object { $_.Status -eq "FAILED" }).Count
        crashed = ($Results | Where-Object { $_.Status -eq "CRASHED" }).Count
        total_duration = ($Results | Measure-Object -Property Duration -Sum).Sum
        results = $Results
    }
    
    $report | ConvertTo-Json -Depth 10 | Out-File -FilePath $reportPath -Encoding UTF8
    
    # Generate HTML report
    $html = @"
<!DOCTYPE html>
<html>
<head>
    <title>Eform Locker System - Validation Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: #ecf0f1; padding: 15px; border-radius: 5px; text-align: center; }
        .metric.passed { background: #d5f4e6; }
        .metric.failed { background: #ffeaa7; }
        .metric.crashed { background: #fab1a0; }
        .suite { margin: 10px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .suite.passed { border-left: 5px solid #00b894; }
        .suite.failed { border-left: 5px solid #e17055; }
        .suite.crashed { border-left: 5px solid #d63031; }
        .duration { color: #636e72; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧪 Eform Locker System - Validation Report</h1>
        <p>Generated: $($report.timestamp) | Test Type: $($report.test_type.ToUpper())</p>
    </div>
    
    <div class="summary">
        <div class="metric passed">
            <h3>$($report.passed)</h3>
            <p>Passed</p>
        </div>
        <div class="metric failed">
            <h3>$($report.failed)</h3>
            <p>Failed</p>
        </div>
        <div class="metric crashed">
            <h3>$($report.crashed)</h3>
            <p>Crashed</p>
        </div>
        <div class="metric">
            <h3>$([math]::Round($report.total_duration, 1))s</h3>
            <p>Total Duration</p>
        </div>
    </div>
    
    <h2>Test Results</h2>
"@
    
    foreach ($result in $Results) {
        $statusClass = $result.Status.ToLower()
        $statusIcon = switch ($result.Status) {
            "PASSED" { "✅" }
            "FAILED" { "❌" }
            "CRASHED" { "💥" }
        }
        
        $html += @"
    <div class="suite $statusClass">
        <h3>$statusIcon $($result.Name)</h3>
        <p class="duration">Duration: $([math]::Round($result.Duration, 2))s</p>
        $(if ($result.Error) { "<p><strong>Error:</strong> $($result.Error)</p>" })
    </div>
"@
    }
    
    $html += @"
</body>
</html>
"@
    
    $html | Out-File -FilePath $htmlReportPath -Encoding UTF8
    
    Write-ColorOutput "📊 Reports generated:" -Color "Info"
    Write-ColorOutput "   JSON: $reportPath" -Color "Info"
    Write-ColorOutput "   HTML: $htmlReportPath" -Color "Info"
}

# Main execution
function Main {
    Write-Header "Eform Locker System - Comprehensive Validation"
    
    Write-ColorOutput "🎯 Test Type: $($TestType.ToUpper())" -Color "Info"
    Write-ColorOutput "📝 Verbose: $($Verbose.ToString())" -Color "Info"
    Write-ColorOutput "📊 Generate Report: $($GenerateReport.ToString())" -Color "Info"
    Write-Host ""
    
    # Check prerequisites
    if (-not (Test-Prerequisites)) {
        Write-ColorOutput "❌ Prerequisites check failed. Aborting." -Color "Error"
        exit 1
    }
    
    # Get test suites
    $testSuites = Invoke-AllValidationTests
    Write-ColorOutput "🧪 Found $($testSuites.Count) test suites to run" -Color "Info"
    
    # Run tests
    $results = @()
    $totalStartTime = Get-Date
    
    foreach ($suite in $testSuites) {
        $result = Invoke-TestSuite -SuiteName $suite.Name -TestPattern $suite.Pattern -Description $suite.Description
        $results += $result
    }
    
    $totalEndTime = Get-Date
    $totalDuration = ($totalEndTime - $totalStartTime).TotalSeconds
    
    # Summary
    Write-Header "Validation Summary"
    
    $passed = ($results | Where-Object { $_.Status -eq "PASSED" }).Count
    $failed = ($results | Where-Object { $_.Status -eq "FAILED" }).Count
    $crashed = ($results | Where-Object { $_.Status -eq "CRASHED" }).Count
    
    Write-ColorOutput "📊 Test Results:" -Color "Info"
    Write-ColorOutput "   ✅ Passed: $passed" -Color "Success"
    Write-ColorOutput "   ❌ Failed: $failed" -Color "Error"
    Write-ColorOutput "   💥 Crashed: $crashed" -Color "Error"
    Write-ColorOutput "   ⏱️ Total Duration: $([math]::Round($totalDuration, 2))s" -Color "Info"
    Write-Host ""
    
    # Generate report if requested
    if ($GenerateReport) {
        New-TestReport -Results $results
    }
    
    # Final status
    if ($failed -eq 0 -and $crashed -eq 0) {
        Write-ColorOutput "🎉 ALL VALIDATION TESTS PASSED!" -Color "Success"
        Write-ColorOutput "✅ System is ready for deployment" -Color "Success"
        exit 0
    } else {
        Write-ColorOutput "❌ VALIDATION FAILED" -Color "Error"
        Write-ColorOutput "🔧 Please fix failing tests before deployment" -Color "Warning"
        exit 1
    }
}

# Run main function
Main