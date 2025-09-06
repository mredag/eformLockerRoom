# Fix Database Duplicates - Consolidate to Single Database
# This script removes duplicate database files and creates proper symlinks

Write-Host "Database Consolidation Script" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan

# Stop any running services first
Write-Host "`nStopping any running Node.js services..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# Main database location
$mainDb = ".\data\eform.db"
$mainDbDir = ".\data"

# Ensure main database directory exists
if (!(Test-Path $mainDbDir)) {
    New-Item -ItemType Directory -Path $mainDbDir -Force
    Write-Host "Created main database directory: $mainDbDir" -ForegroundColor Green
}

# Service database locations to clean up
$serviceDbs = @(
    ".\app\gateway\data\eform.db",
    ".\app\kiosk\data\eform.db", 
    ".\app\panel\data\eform.db",
    ".\app\data\eform.db"
)

Write-Host "`nCleaning up duplicate database files..." -ForegroundColor Yellow

foreach ($serviceDb in $serviceDbs) {
    if (Test-Path $serviceDb) {
        $size = (Get-Item $serviceDb).Length
        Write-Host "  Found: $serviceDb ($([math]::Round($size/1KB, 1)) KB)" -ForegroundColor Red
        
        # Remove the duplicate
        Remove-Item $serviceDb -Force
        Write-Host "  Removed: $serviceDb" -ForegroundColor Green
        
        # Also remove WAL and SHM files
        $walFile = $serviceDb -replace "\.db$", ".db-wal"
        $shmFile = $serviceDb -replace "\.db$", ".db-shm"
        
        if (Test-Path $walFile) { Remove-Item $walFile -Force }
        if (Test-Path $shmFile) { Remove-Item $shmFile -Force }
    }
}

# Clean up test databases
Write-Host "`nCleaning up test database files..." -ForegroundColor Yellow
$testDbs = Get-ChildItem -Path ".\data" -Name "*test*.db" -ErrorAction SilentlyContinue
foreach ($testDb in $testDbs) {
    $fullPath = ".\data\$testDb"
    Write-Host "  Removing test DB: $fullPath" -ForegroundColor Red
    Remove-Item $fullPath -Force
}

# Clean up shared test databases
if (Test-Path ".\shared\data\test") {
    Write-Host "  Removing shared test databases..." -ForegroundColor Red
    Remove-Item ".\shared\data\test\*" -Force -Recurse -ErrorAction SilentlyContinue
}

Write-Host "`nDatabase consolidation complete!" -ForegroundColor Green
Write-Host "All services will now use: $mainDb" -ForegroundColor Green

# Show final database status
if (Test-Path $mainDb) {
    $size = (Get-Item $mainDb).Length
    Write-Host "`nMain database: $([math]::Round($size/1KB, 1)) KB" -ForegroundColor Cyan
} else {
    Write-Host "`nMain database not found - will be created on first service start" -ForegroundColor Yellow
}

Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Update service configurations to use absolute paths" -ForegroundColor White
Write-Host "2. Start services from project root directory" -ForegroundColor White
Write-Host "3. Verify all services connect to same database" -ForegroundColor White

Write-Host "`nDatabase cleanup complete!" -ForegroundColor Green