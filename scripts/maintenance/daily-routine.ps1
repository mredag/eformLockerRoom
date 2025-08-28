# Daily Repository Maintenance Routine
# Run this manually each day or when working with Kiro

param(
    [switch]$Quick,
    [switch]$Full,
    [switch]$DryRun
)

Write-Host "🧹 Daily Repository Maintenance Routine" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

$startTime = Get-Date

if ($Quick) {
    Write-Host "⚡ Quick maintenance mode" -ForegroundColor Yellow
    
    # Quick cleanup only
    Write-Host "🗑️ Running quick cleanup..." -ForegroundColor Green
    bash scripts/maintenance/daily-cleanup.sh
    
} elseif ($Full) {
    Write-Host "🔍 Full maintenance mode" -ForegroundColor Yellow
    
    # Full maintenance suite
    Write-Host "🏥 Health check..." -ForegroundColor Green
    bash scripts/maintenance/repository-health-check.sh
    
    Write-Host "🗑️ Cleanup..." -ForegroundColor Green
    bash scripts/maintenance/daily-cleanup.sh
    
    Write-Host "📁 Organization check..." -ForegroundColor Green
    node scripts/maintenance/file-organization-checker.js
    
    if (!$DryRun) {
        Write-Host "🤖 Automated maintenance..." -ForegroundColor Green
        node scripts/maintenance/automated-maintenance.js --schedule=manual
    }
    
} else {
    Write-Host "📊 Standard maintenance mode" -ForegroundColor Yellow
    
    # Standard daily routine
    Write-Host "📈 Dashboard..." -ForegroundColor Green
    bash scripts/maintenance/maintenance-dashboard.sh
    
    Write-Host "🗑️ Cleanup..." -ForegroundColor Green
    bash scripts/maintenance/daily-cleanup.sh
}

$endTime = Get-Date
$duration = $endTime - $startTime

Write-Host ""
Write-Host "✅ Maintenance completed in $($duration.TotalSeconds) seconds" -ForegroundColor Green

# Show current status
Write-Host ""
Write-Host "📊 Current Repository Status:" -ForegroundColor Cyan
$totalFiles = (Get-ChildItem -Recurse -File | Where-Object { $_.FullName -notmatch "node_modules|\.git" }).Count
$tempFiles = (Get-ChildItem -Recurse -File -Include "*.tmp", "*.temp", "*.bak" | Where-Object { $_.FullName -notmatch "node_modules" }).Count
$largeFiles = (Get-ChildItem -Recurse -File | Where-Object { $_.Length -gt 10MB -and $_.FullName -notmatch "node_modules|data" }).Count

Write-Host "  Total files: $totalFiles" -ForegroundColor White
Write-Host "  Temporary files: $tempFiles" -ForegroundColor $(if ($tempFiles -eq 0) { "Green" } else { "Yellow" })
Write-Host "  Large files: $largeFiles" -ForegroundColor $(if ($largeFiles -eq 0) { "Green" } else { "Yellow" })

if ($tempFiles -eq 0 -and $largeFiles -eq 0) {
    Write-Host "  Status: ✅ Clean" -ForegroundColor Green
} elseif ($tempFiles -lt 5 -and $largeFiles -lt 3) {
    Write-Host "  Status: ⚠️ Needs attention" -ForegroundColor Yellow
} else {
    Write-Host "  Status: ❌ Requires cleanup" -ForegroundColor Red
}

Write-Host ""
Write-Host "💡 Usage examples:" -ForegroundColor Cyan
Write-Host "  .\scripts\maintenance\daily-routine.ps1 -Quick    # Quick cleanup only" -ForegroundColor Gray
Write-Host "  .\scripts\maintenance\daily-routine.ps1 -Full     # Complete maintenance" -ForegroundColor Gray
Write-Host "  .\scripts\maintenance\daily-routine.ps1 -DryRun   # Test mode" -ForegroundColor Gray