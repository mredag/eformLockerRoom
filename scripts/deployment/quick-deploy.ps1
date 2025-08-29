#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Quick deployment script for eForm Locker System
.DESCRIPTION
    Simplified version that just does: git add, commit, push, pull on Pi, restart services
.PARAMETER Message
    Commit message (optional)
.EXAMPLE
    .\scripts\deployment\quick-deploy.ps1 "fix: update UI"
#>

param(
    [string]$Message = "chore: quick deployment update"
)

# Configuration
$PI_HOST = "pi@pi-eform-locker"
$PI_PROJECT_PATH = "/home/pi/eform-locker"

# Colors
$GREEN = "`e[32m"
$RED = "`e[31m"
$BLUE = "`e[34m"
$RESET = "`e[0m"

function Write-Step {
    param([string]$Text)
    Write-Host "$BLUE🚀 $Text$RESET"
}

function Write-Success {
    param([string]$Text)
    Write-Host "$GREEN✅ $Text$RESET"
}

function Write-Error {
    param([string]$Text)
    Write-Host "$RED❌ $Text$RESET"
}

try {
    Write-Step "Quick Deployment Started"
    
    # Step 1: Git operations
    Write-Host "📝 Adding and committing changes..."
    git add .
    git commit -m $Message
    
    Write-Host "🚀 Pushing to remote..."
    git push origin main
    
    Write-Success "Local Git operations completed"
    
    # Step 2: Deploy to Pi
    Write-Host "📥 Pulling changes on Pi and restarting services..."
    
    $deployCommand = @"
cd $PI_PROJECT_PATH && 
git pull origin main && 
./scripts/start-all-clean.sh
"@
    
    ssh $PI_HOST $deployCommand
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "🎉 Deployment completed successfully!"
        Write-Host ""
        Write-Host "📊 Access Points:"
        Write-Host "  • Admin Panel: http://192.168.1.8:3001"
        Write-Host "  • Kiosk UI:    http://192.168.1.8:3002"
        Write-Host "  • Gateway API: http://192.168.1.8:3000"
    } else {
        Write-Error "Deployment failed on Pi"
        exit 1
    }
    
} catch {
    Write-Error "Deployment failed: $($_.Exception.Message)"
    exit 1
}