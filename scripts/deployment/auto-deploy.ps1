#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Automated deployment script for eForm Locker System
.DESCRIPTION
    Automatically commits changes, pushes to Git, pulls to Raspberry Pi, and restarts services
.PARAMETER Message
    Custom commit message (optional)
.PARAMETER SkipTests
    Skip running tests after deployment
.PARAMETER Force
    Force push even if there are no changes
.EXAMPLE
    .\scripts\deployment\auto-deploy.ps1 -Message "feat: add new feature"
.EXAMPLE
    .\scripts\deployment\auto-deploy.ps1 -SkipTests
#>

param(
    [string]$Message = "",
    [switch]$SkipTests = $false,
    [switch]$Force = $false
)

# Configuration
$PI_HOST = "pi@pi-eform-locker"
$PI_PROJECT_PATH = "/home/pi/eform-locker"
$BRANCH = "main"

# Colors for output
$RED = "`e[31m"
$GREEN = "`e[32m"
$YELLOW = "`e[33m"
$BLUE = "`e[34m"
$RESET = "`e[0m"

function Write-ColorOutput {
    param([string]$Text, [string]$Color = $RESET)
    Write-Host "$Color$Text$RESET"
}

function Write-Step {
    param([string]$Step)
    Write-ColorOutput "🚀 $Step" $BLUE
    Write-Host "=" * 50
}

function Write-Success {
    param([string]$Message)
    Write-ColorOutput "✅ $Message" $GREEN
}

function Write-Warning {
    param([string]$Message)
    Write-ColorOutput "⚠️  $Message" $YELLOW
}

function Write-Error {
    param([string]$Message)
    Write-ColorOutput "❌ $Message" $RED
}

function Test-GitStatus {
    $status = git status --porcelain
    return $status.Length -gt 0
}

function Get-AutoCommitMessage {
    $changedFiles = git diff --name-only HEAD
    $addedFiles = git ls-files --others --exclude-standard
    
    if ($changedFiles -or $addedFiles) {
        $fileTypes = @()
        
        # Analyze changed files
        foreach ($file in ($changedFiles + $addedFiles)) {
            if ($file -match "\.ts$|\.js$") { $fileTypes += "code" }
            elseif ($file -match "\.html$|\.css$") { $fileTypes += "ui" }
            elseif ($file -match "\.md$") { $fileTypes += "docs" }
            elseif ($file -match "\.json$|\.yml$|\.yaml$") { $fileTypes += "config" }
            elseif ($file -match "test|spec") { $fileTypes += "tests" }
        }
        
        $uniqueTypes = $fileTypes | Sort-Object -Unique
        $typeString = $uniqueTypes -join ", "
        
        return "chore: automated deployment - update $typeString files"
    }
    
    return "chore: automated deployment"
}

function Invoke-PreDeploymentChecks {
    Write-Step "Pre-deployment Checks"
    
    # Check if we're in a git repository
    if (-not (Test-Path ".git")) {
        Write-Error "Not in a Git repository!"
        exit 1
    }
    
    # Check if we're on the correct branch
    $currentBranch = git branch --show-current
    if ($currentBranch -ne $BRANCH) {
        Write-Warning "Currently on branch '$currentBranch', expected '$BRANCH'"
        $continue = Read-Host "Continue anyway? (y/N)"
        if ($continue -ne "y" -and $continue -ne "Y") {
            Write-Error "Deployment cancelled"
            exit 1
        }
    }
    
    # Check for uncommitted changes
    if (-not (Test-GitStatus) -and -not $Force) {
        Write-Warning "No changes detected"
        $continue = Read-Host "Force deployment anyway? (y/N)"
        if ($continue -ne "y" -and $continue -ne "Y") {
            Write-Error "Deployment cancelled - no changes to deploy"
            exit 0
        }
    }
    
    Write-Success "Pre-deployment checks passed"
}

function Invoke-LocalCommitAndPush {
    Write-Step "Local Git Operations"
    
    try {
        # Add all changes
        Write-Host "📝 Adding changes..."
        git add .
        
        # Check if there are changes to commit
        $staged = git diff --cached --name-only
        if (-not $staged -and -not $Force) {
            Write-Warning "No staged changes to commit"
            return $false
        }
        
        # Generate commit message
        $commitMessage = if ($Message) { $Message } else { Get-AutoCommitMessage }
        
        Write-Host "💬 Commit message: $commitMessage"
        
        # Commit changes
        Write-Host "📦 Committing changes..."
        git commit -m $commitMessage
        
        if ($LASTEXITCODE -ne 0 -and -not $Force) {
            Write-Error "Git commit failed"
            return $false
        }
        
        # Push to remote
        Write-Host "🚀 Pushing to remote..."
        git push origin $BRANCH
        
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Git push failed"
            return $false
        }
        
        Write-Success "Local Git operations completed"
        return $true
        
    } catch {
        Write-Error "Git operations failed: $($_.Exception.Message)"
        return $false
    }
}

function Invoke-RemoteDeployment {
    Write-Step "Remote Deployment to Raspberry Pi"
    
    try {
        # Test SSH connection
        Write-Host "🔗 Testing SSH connection..."
        $sshTest = ssh -o ConnectTimeout=10 $PI_HOST "echo 'SSH connection successful'"
        
        if ($LASTEXITCODE -ne 0) {
            Write-Error "SSH connection failed"
            return $false
        }
        
        Write-Success "SSH connection established"
        
        # Pull latest changes
        Write-Host "📥 Pulling latest changes on Pi..."
        $pullResult = ssh $PI_HOST "cd $PI_PROJECT_PATH && git pull origin $BRANCH"
        
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Git pull failed on Pi"
            Write-Host $pullResult
            return $false
        }
        
        Write-Success "Changes pulled successfully"
        
        # Restart services
        Write-Host "🔄 Restarting services..."
        $restartResult = ssh $PI_HOST "cd $PI_PROJECT_PATH && ./scripts/start-all-clean.sh"
        
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Service restart may have issues"
            Write-Host $restartResult
        } else {
            Write-Success "Services restarted successfully"
        }
        
        return $true
        
    } catch {
        Write-Error "Remote deployment failed: $($_.Exception.Message)"
        return $false
    }
}

function Invoke-PostDeploymentTests {
    if ($SkipTests) {
        Write-Warning "Skipping post-deployment tests"
        return $true
    }
    
    Write-Step "Post-deployment Validation"
    
    try {
        # Test service health
        Write-Host "🏥 Testing service health..."
        
        $services = @(
            @{ Name = "Gateway"; Port = 3000 }
            @{ Name = "Panel"; Port = 3001 }
            @{ Name = "Kiosk"; Port = 3002 }
        )
        
        $allHealthy = $true
        
        foreach ($service in $services) {
            Write-Host "  Testing $($service.Name) (port $($service.Port))..."
            
            $healthCheck = ssh $PI_HOST "curl -s -f http://localhost:$($service.Port)/health || echo 'FAILED'"
            
            if ($healthCheck -match "FAILED" -or $LASTEXITCODE -ne 0) {
                Write-Warning "$($service.Name) health check failed"
                $allHealthy = $false
            } else {
                Write-Success "$($service.Name) is healthy"
            }
        }
        
        if (-not $allHealthy) {
            Write-Warning "Some services may have issues"
            return $false
        }
        
        # Test layout service if available
        Write-Host "🧪 Testing layout service..."
        $layoutTest = ssh $PI_HOST "cd $PI_PROJECT_PATH && timeout 30 node scripts/test-layout-service.js 2>/dev/null || echo 'LAYOUT_TEST_FAILED'"
        
        if ($layoutTest -match "LAYOUT_TEST_FAILED") {
            Write-Warning "Layout service test failed or timed out"
        } else {
            Write-Success "Layout service test passed"
        }
        
        Write-Success "Post-deployment validation completed"
        return $true
        
    } catch {
        Write-Error "Post-deployment tests failed: $($_.Exception.Message)"
        return $false
    }
}

function Show-DeploymentSummary {
    param([bool]$Success)
    
    Write-Step "Deployment Summary"
    
    if ($Success) {
        Write-Success "🎉 Deployment completed successfully!"
        Write-Host ""
        Write-Host "📊 Access Points:"
        Write-Host "  • Admin Panel:    http://192.168.1.8:3001"
        Write-Host "  • Kiosk UI:       http://192.168.1.8:3002"
        Write-Host "  • Gateway API:    http://192.168.1.8:3000"
        Write-Host "  • Hardware Config: http://192.168.1.8:3001/hardware-config"
        Write-Host ""
        Write-Host "📝 Monitor logs with:"
        Write-Host "  ssh $PI_HOST 'cd $PI_PROJECT_PATH && tail -f logs/*.log'"
    } else {
        Write-Error "❌ Deployment failed!"
        Write-Host ""
        Write-Host "🔧 Troubleshooting:"
        Write-Host "  • Check SSH connection: ssh $PI_HOST"
        Write-Host "  • Check Pi logs: ssh $PI_HOST 'cd $PI_PROJECT_PATH && tail -20 logs/*.log'"
        Write-Host "  • Manual restart: ssh $PI_HOST 'cd $PI_PROJECT_PATH && ./scripts/start-all-clean.sh'"
    }
}

# Main execution
function Main {
    $startTime = Get-Date
    
    Write-ColorOutput "🚀 eForm Locker System - Automated Deployment" $BLUE
    Write-Host "=" * 60
    Write-Host "Start time: $($startTime.ToString('yyyy-MM-dd HH:mm:ss'))"
    Write-Host ""
    
    # Execute deployment steps
    Invoke-PreDeploymentChecks
    
    $gitSuccess = Invoke-LocalCommitAndPush
    if (-not $gitSuccess) {
        Show-DeploymentSummary $false
        exit 1
    }
    
    $deploySuccess = Invoke-RemoteDeployment
    if (-not $deploySuccess) {
        Show-DeploymentSummary $false
        exit 1
    }
    
    $testSuccess = Invoke-PostDeploymentTests
    
    $endTime = Get-Date
    $duration = $endTime - $startTime
    
    Write-Host ""
    Write-Host "End time: $($endTime.ToString('yyyy-MM-dd HH:mm:ss'))"
    Write-Host "Duration: $($duration.ToString('mm\:ss'))"
    
    Show-DeploymentSummary ($gitSuccess -and $deploySuccess -and $testSuccess)
    
    if ($gitSuccess -and $deploySuccess -and $testSuccess) {
        exit 0
    } else {
        exit 1
    }
}

# Run main function
Main