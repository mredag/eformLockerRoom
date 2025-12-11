# Waveshare Modbus Slave ID Changer - Executable Builder
# PowerShell version with automatic Python installation

param(
    [switch]$AutoInstall,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Write-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $Message" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Blue
}

function Test-PythonInstalled {
    try {
        $version = python --version 2>$null
        if ($version -match "Python (\d+)\.(\d+)") {
            $major = [int]$matches[1]
            $minor = [int]$matches[2]
            if ($major -ge 3 -and ($major -gt 3 -or $minor -ge 7)) {
                return @{ Installed = $true; Version = $version.Trim() }
            }
        }
        return @{ Installed = $false; Reason = "Python version too old (need 3.7+)" }
    }
    catch {
        return @{ Installed = $false; Reason = "Python not found in PATH" }
    }
}

function Install-Python {
    Write-Header "Installing Python Automatically"
    
    Write-Info "Downloading Python 3.11.9 installer..."
    
    # Create temp directory
    $tempDir = Join-Path $env:TEMP "python-installer"
    if (-not (Test-Path $tempDir)) {
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    }
    
    $installerPath = Join-Path $tempDir "python-3.11.9-amd64.exe"
    $downloadUrl = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"
    
    try {
        # Download with progress
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile($downloadUrl, $installerPath)
        Write-Success "Python installer downloaded successfully"
    }
    catch {
        Write-Error "Failed to download Python installer: $($_.Exception.Message)"
        Write-Info "Please check your internet connection and try again"
        return $false
    }
    
    if (-not (Test-Path $installerPath)) {
        Write-Error "Installer file not found after download"
        return $false
    }
    
    Write-Info "Installing Python (this may take a few minutes)..."
    Write-Info "- Adding Python to PATH"
    Write-Info "- Installing pip package manager"
    Write-Info "- Setting up for all users"
    
    # Install Python silently
    $installArgs = @(
        "/quiet",
        "InstallAllUsers=1",
        "PrependPath=1",
        "Include_test=0",
        "Include_doc=0", 
        "Include_dev=0",
        "Include_debug=0",
        "Include_launcher=1",
        "InstallLauncherAllUsers=1"
    )
    
    try {
        $process = Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -PassThru
        
        if ($process.ExitCode -eq 0) {
            Write-Success "Python installation completed"
        }
        else {
            Write-Error "Python installation failed with exit code: $($process.ExitCode)"
            return $false
        }
    }
    catch {
        Write-Error "Failed to run Python installer: $($_.Exception.Message)"
        return $false
    }
    finally {
        # Clean up installer
        Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
        Remove-Item $tempDir -Force -Recurse -ErrorAction SilentlyContinue
    }
    
    Write-Info "Refreshing environment variables..."
    
    # Refresh PATH for current session
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    
    # Test installation
    Start-Sleep -Seconds 3
    $pythonTest = Test-PythonInstalled
    
    if ($pythonTest.Installed) {
        Write-Success "Python is now ready! Version: $($pythonTest.Version)"
        return $true
    }
    else {
        Write-Warning "Python installation completed but may need a restart"
        Write-Info "Please try one of these options:"
        Write-Info "1. Restart your computer and run this script again"
        Write-Info "2. Open a new PowerShell window and run this script"
        Write-Info "3. Log out and log back in"
        return $false
    }
}

function Build-Executable {
    Write-Header "Building Portable Executable"
    
    # Check if source file exists
    if (-not (Test-Path "modbus_slave_changer.py")) {
        Write-Error "Source file 'modbus_slave_changer.py' not found"
        Write-Info "Make sure you're running this script from the 'portable' folder"
        return $false
    }
    
    Write-Info "Installing required Python packages..."
    
    try {
        # Install required packages
        python -m pip install --upgrade pip
        python -m pip install pyserial pyinstaller
        Write-Success "Python packages installed"
    }
    catch {
        Write-Error "Failed to install Python packages: $($_.Exception.Message)"
        return $false
    }
    
    Write-Info "Building executable with PyInstaller..."
    
    try {
        # Build executable
        python -m PyInstaller --onefile --console --name "WaveshareModbusSlaveChanger" modbus_slave_changer.py
        
        $exePath = "dist\WaveshareModbusSlaveChanger.exe"
        
        if (Test-Path $exePath) {
            $fileSize = (Get-Item $exePath).Length
            $fileSizeMB = [math]::Round($fileSize / 1MB, 1)
            
            Write-Success "BUILD SUCCESSFUL!"
            Write-Success "Executable created: $exePath"
            Write-Success "File size: $fileSizeMB MB"
            Write-Info ""
            Write-Info "You can now copy this .exe file to any Windows computer"
            Write-Info "and run it without installing Python or any dependencies."
            
            return $true
        }
        else {
            Write-Error "Build completed but executable not found"
            return $false
        }
    }
    catch {
        Write-Error "Build failed: $($_.Exception.Message)"
        return $false
    }
}

# Main execution
Write-Header "Waveshare Modbus Slave ID Changer - Builder"

Write-Info "This script will create a portable executable that requires no installation."

# Check Python installation
$pythonStatus = Test-PythonInstalled

if ($pythonStatus.Installed) {
    Write-Success "Python is available: $($pythonStatus.Version)"
}
else {
    Write-Warning "Python issue: $($pythonStatus.Reason)"
    
    if ($AutoInstall -or $Force) {
        $installChoice = "y"
    }
    else {
        Write-Host ""
        Write-Host "Options:" -ForegroundColor Yellow
        Write-Host "  1. Auto-install Python (recommended)" -ForegroundColor White
        Write-Host "  2. Manual installation" -ForegroundColor White
        Write-Host "  3. Cancel" -ForegroundColor White
        Write-Host ""
        
        do {
            $choice = Read-Host "Enter your choice (1-3)"
        } while ($choice -notin @("1", "2", "3"))
        
        switch ($choice) {
            "1" { $installChoice = "y" }
            "2" { 
                Write-Info "Please install Python manually:"
                Write-Info "1. Go to https://python.org/downloads/"
                Write-Info "2. Download Python 3.7 or newer"
                Write-Info "3. During installation, CHECK 'Add Python to PATH'"
                Write-Info "4. Complete installation and restart this script"
                Start-Process "https://python.org/downloads/"
                exit 1
            }
            "3" { 
                Write-Info "Operation cancelled"
                exit 1
            }
        }
    }
    
    if ($installChoice -eq "y") {
        if (-not (Install-Python)) {
            Write-Error "Python installation failed. Please install manually."
            exit 1
        }
    }
}

# Build the executable
if (Build-Executable) {
    Write-Header "Build Complete!"
    Write-Success "Your portable executable is ready to use!"
}
else {
    Write-Error "Build failed. Please check the errors above."
    exit 1
}