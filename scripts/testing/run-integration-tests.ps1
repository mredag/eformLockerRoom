#!/usr/bin/env pwsh

# Integration Test Runner for Eform Locker System
# This script runs integration tests for multi-room operations and system validation

param(
    [switch]$Verbose = $false,
    [switch]$Coverage = $false,
    [string]$Filter = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Colors for output
$Green = "Green"
$Red = "Red"
$Yellow = "Yellow"
$Blue = "Blue"

function Write-TestHeader {
    param([string]$Message)
    Write-Host "`n=== $Message ===" -ForegroundColor $Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor $Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor $Red
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor $Yellow
}

function Run-IntegrationTests {
    param(
        [string]$WorkspacePath,
        [string]$TestPattern,
        [string]$Description
    )
    
    Write-TestHeader "Running $Description"
    
    try {
        Push-Location $WorkspacePath
        
        $testCommand = "npx vitest --run"
        if ($Coverage) {
            $testCommand += " --coverage"
        }
        if ($Filter) {
            $testCommand += " --grep `"$Filter`""
        }
        $testCommand += " $TestPattern"
        
        if ($Verbose) {
            Write-Host "Executing: $testCommand" -ForegroundColor $Yellow
        }
        
        $result = Invoke-Expression $testCommand
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "$Description completed successfully"
            return $true
        } else {
            Write-Error "$Description failed with exit code $LASTEXITCODE"
            if ($Verbose) {
                Write-Host $result -ForegroundColor $Red
            }
            return $false
        }
    }
    catch {
        Write-Error "$Description failed with exception: $($_.Exception.Message)"
        return $false
    }
    finally {
        Pop-Location
    }
}

function Test-Prerequisites {
    Write-TestHeader "Checking Prerequisites"
    
    # Check if Node.js is available
    try {
        $nodeVersion = node --version
        Write-Success "Node.js version: $nodeVersion"
    }
    catch {
        Write-Error "Node.js is not installed or not in PATH"
        return $false
    }
    
    # Check if npm is available
    try {
        $npmVersion = npm --version
        Write-Success "npm version: $npmVersion"
    }
    catch {
        Write-Error "npm is not installed or not in PATH"
        return $false
    }
    
    # Check if dependencies are installed
    if (-not (Test-Path "node_modules")) {
        Write-Warning "Dependencies not found. Installing..."
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to install dependencies"
            return $false
        }
    }
    
    return $true
}

function Main {
    Write-Host "Eform Locker System - Integration Test Runner" -ForegroundColor $Blue
    Write-Host "=============================================" -ForegroundColor $Blue
    
    if (-not (Test-Prerequisites)) {
        Write-Error "Prerequisites check failed"
        exit 1
    }
    
    $testResults = @()
    
    # Test 1: Multi-Service Integration (Gateway)
    $result1 = Run-IntegrationTests -WorkspacePath "app/gateway" -TestPattern "src/__tests__/integration/*.test.ts" -Description "Gateway Multi-Service Integration"
    $testResults += @{ Name = "Gateway Integration"; Success = $result1 }
    
    # Test 2: VIP Workflow Integration (Panel)
    $result2 = Run-IntegrationTests -WorkspacePath "app/panel" -TestPattern "src/__tests__/integration/*.test.ts" -Description "Panel VIP Workflow Integration"
    $testResults += @{ Name = "Panel VIP Integration"; Success = $result2 }
    
    # Test 3: End-to-End User Flows (Kiosk)
    $result3 = Run-IntegrationTests -WorkspacePath "app/kiosk" -TestPattern "src/__tests__/e2e/*.test.ts" -Description "Kiosk End-to-End Flows"
    $testResults += @{ Name = "Kiosk E2E"; Success = $result3 }
    
    # Test 4: Hardware Integration (Kiosk)
    $result4 = Run-IntegrationTests -WorkspacePath "app/kiosk" -TestPattern "src/__tests__/integration/*.test.ts" -Description "Hardware Integration"
    $testResults += @{ Name = "Hardware Integration"; Success = $result4 }
    
    # Test 5: System Resilience (Gateway)
    $result5 = Run-IntegrationTests -WorkspacePath "app/gateway" -TestPattern "src/__tests__/failure-scenarios/*.test.ts" -Description "System Resilience"
    $testResults += @{ Name = "System Resilience"; Success = $result5 }
    
    # Summary
    Write-TestHeader "Integration Test Summary"
    
    $successCount = 0
    $totalCount = $testResults.Count
    
    foreach ($result in $testResults) {
        if ($result.Success) {
            Write-Success $result.Name
            $successCount++
        } else {
            Write-Error $result.Name
        }
    }
    
    Write-Host "`nResults: $successCount/$totalCount tests passed" -ForegroundColor $(if ($successCount -eq $totalCount) { $Green } else { $Yellow })
    
    if ($successCount -eq $totalCount) {
        Write-Success "All integration tests passed!"
        exit 0
    } else {
        Write-Error "Some integration tests failed. Please review the results above."
        exit 1
    }
}

# Run the main function
Main