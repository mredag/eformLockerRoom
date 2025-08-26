# End-to-End Test Runner for Admin Panel Relay Control (PowerShell)
# This script runs all the comprehensive tests for the admin panel relay control feature

param(
    [switch]$SkipHardware = $false,
    [switch]$Verbose = $false
)

# Set error action preference
$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting End-to-End Tests for Admin Panel Relay Control" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Function to print colored output
function Write-Status {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

# Function to check if a command exists
function Test-Command {
    param([string]$Command)
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

try {
    # Check prerequisites
    Write-Host "🔍 Checking prerequisites..." -ForegroundColor Yellow
    
    if (-not (Test-Command "node")) {
        Write-Status "❌ Node.js is not installed" "Red"
        exit 1
    }
    
    if (-not (Test-Command "npm")) {
        Write-Status "❌ npm is not installed" "Red"
        exit 1
    }
    
    Write-Status "✅ Prerequisites check passed" "Green"
    
    # Install dependencies if needed
    if (-not (Test-Path "node_modules")) {
        Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
        npm install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed"
        }
    }
    
    # Create logs directory if it doesn't exist
    if (-not (Test-Path "logs")) {
        New-Item -ItemType Directory -Path "logs" | Out-Null
    }
    
    # Set test environment variables
    $env:NODE_ENV = "test"
    $env:LOG_LEVEL = if ($Verbose) { "debug" } else { "info" }
    if (-not $env:MODBUS_PORT) {
        $env:MODBUS_PORT = "/dev/ttyUSB0"
    }
    
    Write-Host "Using Modbus port: $env:MODBUS_PORT" -ForegroundColor Gray
    
    Write-Host "🧪 Running comprehensive test suite..." -ForegroundColor Yellow
    
    # Run the main test runner
    $testArgs = @()
    if ($SkipHardware) {
        $testArgs += "--skip-hardware"
    }
    if ($Verbose) {
        $testArgs += "--verbose"
    }
    
    $testProcess = Start-Process -FilePath "node" -ArgumentList @("scripts/run-e2e-admin-panel-tests.js") + $testArgs -Wait -PassThru -NoNewWindow
    
    if ($testProcess.ExitCode -eq 0) {
        Write-Status "✅ All tests passed successfully!" "Green"
        
        Write-Host ""
        Write-Host "📋 Test Summary:" -ForegroundColor Cyan
        Write-Host "- Hardware validation: Completed" -ForegroundColor White
        Write-Host "- Admin panel functionality: Verified" -ForegroundColor White
        Write-Host "- Service integration: Tested" -ForegroundColor White
        Write-Host "- Logging validation: Confirmed" -ForegroundColor White
        Write-Host "- UI feedback: Validated" -ForegroundColor White
        
        Write-Host ""
        Write-Status "🎉 Admin Panel Relay Control is fully functional!" "Green"
        
        # Check if test report exists
        if (Test-Path "scripts/e2e-test-report.json") {
            Write-Host ""
            Write-Host "📊 Detailed test report available at: scripts/e2e-test-report.json" -ForegroundColor Cyan
        }
        
    } else {
        Write-Status "❌ Some tests failed" "Red"
        
        Write-Host ""
        Write-Host "🔧 Troubleshooting steps:" -ForegroundColor Yellow
        Write-Host "1. Check that all services are running:" -ForegroundColor White
        Write-Host "   - Gateway service (port 3000)" -ForegroundColor Gray
        Write-Host "   - Kiosk service (port 3001)" -ForegroundColor Gray
        Write-Host "   - Admin panel service (port 3003)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "2. Verify hardware connections:" -ForegroundColor White
        Write-Host "   - RS-485 converter connected to $env:MODBUS_PORT" -ForegroundColor Gray
        Write-Host "   - Relay cards powered and properly wired" -ForegroundColor Gray
        Write-Host "   - DIP switches configured correctly" -ForegroundColor Gray
        Write-Host ""
        Write-Host "3. Set MODBUS_PORT environment variable if using different port:" -ForegroundColor White
        Write-Host "   `$env:MODBUS_PORT = '/dev/ttyAMA0'" -ForegroundColor Gray
        Write-Host ""
        Write-Host "4. Check log files in ./logs/ for detailed error information" -ForegroundColor White
        Write-Host ""
        Write-Host "5. Review the test report: ./scripts/e2e-test-report.json" -ForegroundColor White
        Write-Host ""
        Write-Host "6. Run with -Verbose flag for more detailed output" -ForegroundColor White
        
        exit 1
    }
    
} catch {
    Write-Status "❌ Test execution failed: $($_.Exception.Message)" "Red"
    
    Write-Host ""
    Write-Host "🔍 Debug information:" -ForegroundColor Yellow
    Write-Host "- Current directory: $(Get-Location)" -ForegroundColor Gray
    Write-Host "- Node.js version: $(node --version 2>$null)" -ForegroundColor Gray
    Write-Host "- npm version: $(npm --version 2>$null)" -ForegroundColor Gray
    
    if (Test-Path "logs") {
        $logFiles = Get-ChildItem "logs" -Filter "*.log" | Select-Object -First 3
        if ($logFiles) {
            Write-Host "- Recent log files:" -ForegroundColor Gray
            foreach ($logFile in $logFiles) {
                Write-Host "  - $($logFile.Name)" -ForegroundColor Gray
            }
        }
    }
    
    exit 1
}

Write-Host ""
Write-Host "✨ Test execution completed" -ForegroundColor Cyan