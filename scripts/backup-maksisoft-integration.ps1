#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Creates a backup of the current state before Maksisoft integration deployment
    
.DESCRIPTION
    This script creates a complete backup of all files that will be modified
    by the Maksisoft integration, allowing for easy rollback if needed.
    
.EXAMPLE
    .\scripts\backup-maksisoft-integration.ps1
#>

param(
    [string]$BackupDir = "backups/pre-maksisoft-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
)

Write-Host "🔄 Creating Maksisoft Integration Backup..." -ForegroundColor Cyan
Write-Host "Backup Directory: $BackupDir" -ForegroundColor Yellow

# Create backup directory
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

# List of all files that will be modified/added by Maksisoft integration
$filesToBackup = @(
    # Core implementation files
    "app/panel/src/services/maksi.ts",
    "app/panel/src/services/maksi-types.ts", 
    "app/panel/src/routes/maksi-routes.ts",
    "app/panel/src/middleware/rate-limit.ts",
    "app/panel/src/views/lockers.html",
    "app/panel/src/index.ts",
    ".env.example",
    
    # Test files
    "app/panel/src/__tests__/maksi-data-mapping.test.ts",
    "app/panel/src/__tests__/maksi-service.test.ts",
    "app/panel/src/__tests__/maksi-rate-limiter.test.ts",
    "app/panel/src/__tests__/maksi-routes.test.ts",
    "app/panel/src/__tests__/maksi-integration.test.ts",
    "app/panel/src/__tests__/maksi-modal-display.test.ts",
    "app/panel/src/__tests__/maksi-mvp-validation.test.ts",
    "app/panel/src/__tests__/maksi-manual-validation.js",
    "app/panel/src/__tests__/maksi-test-summary.md",
    "app/panel/src/__tests__/MAKSISOFT_MVP_VALIDATION_REPORT.md",
    
    # Configuration and documentation
    "app/panel/src/services/maksi-config.md",
    ".kiro/panel-maksisoft-integration.md",
    ".kiro/steering/maksisoft-spec-help.md",
    ".kiro/specs/maksisoft-integration/requirements.md",
    ".kiro/specs/maksisoft-integration/design.md", 
    ".kiro/specs/maksisoft-integration/tasks.md",
    
    # Scripts and validation
    "scripts/validate-maksisoft-mvp.js"
)

# Create manifest of current state
$manifest = @{
    BackupDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    GitCommit = (git rev-parse HEAD 2>$null)
    GitBranch = (git branch --show-current 2>$null)
    FilesBackedUp = @()
    NewFiles = @()
    ModifiedFiles = @()
}

Write-Host "`n📋 Analyzing files..." -ForegroundColor Green

foreach ($file in $filesToBackup) {
    if (Test-Path $file) {
        # File exists - backup it
        $backupPath = Join-Path $BackupDir $file
        $backupDir = Split-Path $backupPath -Parent
        
        # Create directory structure
        if (!(Test-Path $backupDir)) {
            New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        }
        
        # Copy file
        Copy-Item $file $backupPath -Force
        $manifest.FilesBackedUp += $file
        $manifest.ModifiedFiles += $file
        
        Write-Host "  ✅ Backed up: $file" -ForegroundColor Green
    } else {
        # File doesn't exist - will be new
        $manifest.NewFiles += $file
        Write-Host "  📄 New file: $file" -ForegroundColor Yellow
    }
}

# Save manifest
$manifestPath = Join-Path $BackupDir "backup-manifest.json"
$manifest | ConvertTo-Json -Depth 3 | Set-Content $manifestPath

# Create rollback script content
$rollbackContent = @'
#!/usr/bin/env pwsh

Write-Host "Rolling back Maksisoft Integration..." -ForegroundColor Red

# Remove new files that were added
$newFiles = @(
    "app/panel/src/services/maksi.ts",
    "app/panel/src/services/maksi-types.ts", 
    "app/panel/src/routes/maksi-routes.ts",
    "app/panel/src/middleware/rate-limit.ts",
    "app/panel/src/services/maksi-config.md"
)

foreach ($file in $newFiles) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "  Removed: $file" -ForegroundColor Red
    }
}

Write-Host "Rollback completed!" -ForegroundColor Green
'@

$rollbackPath = Join-Path $BackupDir "rollback-maksisoft.ps1"
$rollbackContent | Set-Content $rollbackPath

# Create Git stash as additional backup
Write-Host "`n💾 Creating Git stash backup..." -ForegroundColor Cyan
$stashName = "pre-maksisoft-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
git add . 2>$null
$stashResult = git stash push -m $stashName 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ Git stash created: $stashName" -ForegroundColor Green
    $manifest.GitStash = $stashName
} else {
    Write-Host "  ⚠️  Git stash failed (no changes to stash)" -ForegroundColor Yellow
}

# Update manifest with stash info
$manifest | ConvertTo-Json -Depth 3 | Set-Content $manifestPath

# Summary
Write-Host "`n📊 Backup Summary:" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan
Write-Host "Backup Directory: $BackupDir" -ForegroundColor White
Write-Host "Files Backed Up: $($manifest.FilesBackedUp.Count)" -ForegroundColor Green
Write-Host "New Files: $($manifest.NewFiles.Count)" -ForegroundColor Yellow
Write-Host "Git Commit: $($manifest.GitCommit)" -ForegroundColor White
Write-Host "Git Branch: $($manifest.GitBranch)" -ForegroundColor White
if ($manifest.GitStash) {
    Write-Host "Git Stash: $($manifest.GitStash)" -ForegroundColor Green
}

Write-Host "`n🛡️  Rollback Options:" -ForegroundColor Cyan
Write-Host "1. Run rollback script: .\$rollbackPath" -ForegroundColor White
if ($manifest.GitStash) {
    Write-Host "2. Git stash pop: git stash pop stash@{0}" -ForegroundColor White
}
Write-Host "3. Manual restore from: $BackupDir" -ForegroundColor White

Write-Host "`n✅ Backup completed successfully!" -ForegroundColor Green
Write-Host "You can now safely push to main." -ForegroundColor Green

# Return backup info for scripting
return @{
    BackupDir = $BackupDir
    RollbackScript = $rollbackPath
    Manifest = $manifest
}