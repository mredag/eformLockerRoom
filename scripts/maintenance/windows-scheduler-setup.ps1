# Windows Task Scheduler Setup for Repository Maintenance
# Run this once to set up automated maintenance on Windows

param(
    [string]$RepoPath = (Get-Location).Path
)

Write-Host "🔧 Setting up Windows Task Scheduler for Repository Maintenance" -ForegroundColor Cyan
Write-Host "Repository Path: $RepoPath" -ForegroundColor Yellow

# Create maintenance script
$MaintenanceScript = @"
# Daily Repository Maintenance Script
Set-Location '$RepoPath'

# Run daily cleanup
Write-Host "Running daily cleanup..." -ForegroundColor Green
bash scripts/maintenance/daily-cleanup.sh

# Log the execution
`$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path "logs/windows-maintenance.log" -Value "`$timestamp - Daily maintenance completed"
"@

$ScriptPath = "$RepoPath\scripts\maintenance\windows-daily-maintenance.ps1"
$MaintenanceScript | Out-File -FilePath $ScriptPath -Encoding UTF8

Write-Host "✅ Created maintenance script: $ScriptPath" -ForegroundColor Green

# Create scheduled task
$TaskName = "eForm-Repository-Maintenance"
$Action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-ExecutionPolicy Bypass -File `"$ScriptPath`""
$Trigger = New-ScheduledTaskTrigger -Daily -At "02:00AM"
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

try {
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Daily repository maintenance for eForm Locker System" -Force
    Write-Host "✅ Scheduled task '$TaskName' created successfully!" -ForegroundColor Green
    Write-Host "   Runs daily at 2:00 AM" -ForegroundColor Yellow
} catch {
    Write-Host "❌ Failed to create scheduled task: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "💡 Try running PowerShell as Administrator" -ForegroundColor Yellow
}

# Create manual maintenance shortcut
$ManualScript = @"
# Manual Repository Maintenance
Set-Location '$RepoPath'

Write-Host "🧹 Running manual repository maintenance..." -ForegroundColor Cyan

# Health check
Write-Host "📊 Checking repository health..." -ForegroundColor Yellow
bash scripts/maintenance/repository-health-check.sh

# Cleanup
Write-Host "🗑️ Running cleanup..." -ForegroundColor Yellow  
bash scripts/maintenance/daily-cleanup.sh

# Organization check
Write-Host "📁 Checking file organization..." -ForegroundColor Yellow
node scripts/maintenance/file-organization-checker.js

Write-Host "✅ Manual maintenance completed!" -ForegroundColor Green
Read-Host "Press Enter to continue..."
"@

$ManualScriptPath = "$RepoPath\scripts\maintenance\manual-maintenance.ps1"
$ManualScript | Out-File -FilePath $ManualScriptPath -Encoding UTF8

Write-Host "✅ Created manual maintenance script: $ManualScriptPath" -ForegroundColor Green

Write-Host ""
Write-Host "🎯 Setup Complete!" -ForegroundColor Green
Write-Host "📅 Automatic: Task runs daily at 2:00 AM" -ForegroundColor Yellow
Write-Host "🔧 Manual: Run scripts\maintenance\manual-maintenance.ps1" -ForegroundColor Yellow
Write-Host "📊 Dashboard: bash scripts/maintenance/maintenance-dashboard.sh" -ForegroundColor Yellow