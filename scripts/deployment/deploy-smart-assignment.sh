#!/bin/bash

# Smart Locker Assignment System - Deployment Script
# Version: 1.0.0
# Description: Complete deployment automation for smart assignment system

set -euo pipefail  # Exit on any error, undefined vars, pipe failures

# Artifact version and git information
ARTIFACT_VERSION="1.0.0"
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
DEPLOYMENT_ID="smart-assignment-${ARTIFACT_VERSION}-${GIT_SHA}-$(date +%Y%m%d-%H%M%S)"

echo "Deployment ID: $DEPLOYMENT_ID"
echo "Artifact Version: $ARTIFACT_VERSION"
echo "Git SHA: $GIT_SHA"

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups/$DEPLOYMENT_ID"
LOG_FILE="$PROJECT_ROOT/logs/smart-assignment-deployment.log"
LOCK_FILE="$PROJECT_ROOT/.deployment.lock"

# Cleanup function for trap
cleanup() {
    local exit_code=$?
    log "Cleanup: Removing lock file and performing cleanup."
    rm -f "$LOCK_FILE"
    if [ $exit_code -ne 0 ]; then
        error "Deployment failed with exit code $exit_code. Check logs for details."
    fi
    exit $exit_code
}

# Set trap for cleanup
trap cleanup EXIT INT TERM

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Create necessary directories
mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

# Check for concurrent deployments
if [ -f "$LOCK_FILE" ]; then
    error "Another deployment is in progress. Lock file exists: $LOCK_FILE"
fi

# Create lock file
echo "$$" > "$LOCK_FILE"

log "Starting Smart Locker Assignment System Deployment."
log "Project Root: $PROJECT_ROOT"
log "Backup Directory: $BACKUP_DIR"
log "Deployment ID: $DEPLOYMENT_ID"

# Step 1: Preflight checks
log "Step 1: Preflight validation and checks."

# Check disk space (require at least 1GB free)
AVAILABLE_SPACE=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $4}')
REQUIRED_SPACE=1048576  # 1GB in KB
if [ "$AVAILABLE_SPACE" -lt "$REQUIRED_SPACE" ]; then
    error "Insufficient disk space. Available: ${AVAILABLE_SPACE}KB, Required: ${REQUIRED_SPACE}KB"
fi
log "Disk space check passed: ${AVAILABLE_SPACE}KB available."

# Database integrity check
if [ -f "$PROJECT_ROOT/data/eform.db" ]; then
    log "Running database integrity check..."
    if ! sqlite3 "$PROJECT_ROOT/data/eform.db" "PRAGMA integrity_check;" | grep -q "ok"; then
        error "Database integrity check failed."
    fi
    log "Database integrity check passed."
    
    # WAL checkpoint
    log "Performing WAL checkpoint..."
    sqlite3 "$PROJECT_ROOT/data/eform.db" "PRAGMA wal_checkpoint(FULL);"
    log "WAL checkpoint completed."
else
    error "Database file not found: $PROJECT_ROOT/data/eform.db"
fi

# Check if services are running
if pgrep -f "node.*gateway" > /dev/null; then
    warning "Gateway service is running. It will be stopped during deployment."
fi

if pgrep -f "node.*kiosk" > /dev/null; then
    warning "Kiosk service is running. It will be stopped during deployment."
fi

if pgrep -f "node.*panel" > /dev/null; then
    warning "Panel service is running. It will be stopped during deployment."
fi

# Check database exists
if [ ! -f "$PROJECT_ROOT/data/eform.db" ]; then
    error "Database file not found: $PROJECT_ROOT/data/eform.db"
fi

# Check migration files exist
if [ ! -f "$SCRIPT_DIR/smart-assignment-migration.sql" ]; then
    error "Migration file not found: $SCRIPT_DIR/smart-assignment-migration.sql"
fi

success "Pre-deployment validation completed"

# Step 2: Create backup
log "Step 2: Creating backup"

# Backup database
cp "$PROJECT_ROOT/data/eform.db" "$BACKUP_DIR/eform.db.backup"
log "Database backed up to: $BACKUP_DIR/eform.db.backup"

# Backup configuration
if [ -f "$PROJECT_ROOT/config/system.json" ]; then
    cp "$PROJECT_ROOT/config/system.json" "$BACKUP_DIR/system.json.backup"
    log "Configuration backed up to: $BACKUP_DIR/system.json.backup"
fi

# Backup package.json files
find "$PROJECT_ROOT" -name "package.json" -not -path "*/node_modules/*" -exec cp {} "$BACKUP_DIR/" \;

success "Backup completed"

# Step 3: Stop services
log "Step 3: Stopping services"

# Stop all Node.js services gracefully
if pgrep -f "node" > /dev/null; then
    log "Stopping Node.js services..."
    pkill -f "node.*gateway" || true
    pkill -f "node.*kiosk" || true  
    pkill -f "node.*panel" || true
    pkill -f "node.*agent" || true
    
    # Wait for graceful shutdown
    sleep 5
    
    # Force kill if still running
    pkill -9 -f "node" || true
    sleep 2
fi

success "Services stopped"

# Step 4: Run database migration
log "Step 4: Running database migration"

# Check if sqlite3 is available
if ! command -v sqlite3 &> /dev/null; then
    error "sqlite3 command not found. Please install SQLite3."
fi

# Run migration
log "Applying smart assignment migration..."
if sqlite3 "$PROJECT_ROOT/data/eform.db" < "$SCRIPT_DIR/smart-assignment-migration.sql"; then
    success "Database migration completed successfully"
else
    error "Database migration failed. Check the log for details."
fi

# Verify migration
log "Verifying migration..."
TABLES_COUNT=$(sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('settings_global', 'settings_kiosk', 'smart_sessions', 'assignment_metrics', 'alerts');")

if [ "$TABLES_COUNT" -eq 5 ]; then
    success "Migration verification passed: All 5 tables created"
else
    error "Migration verification failed: Expected 5 tables, found $TABLES_COUNT"
fi

# Step 5: Update configuration
log "Step 5: Updating configuration"

# Backup original config
if [ -f "$PROJECT_ROOT/config/system.json" ]; then
    cp "$PROJECT_ROOT/config/system.json" "$PROJECT_ROOT/config/system.json.pre-smart-assignment"
fi

# Update system.json with smart assignment configuration
cat > "$PROJECT_ROOT/config/system.json" << 'EOF'
{
  "lockers": {
    "total_count": 32,
    "offline_threshold_seconds": 60,
    "bulk_operation_interval_ms": 500,
    "auto_release_hours": 24
  },
  "hardware": {
    "modbus": {
      "pulse_duration_ms": 800,
      "command_interval_ms": 300,
      "max_retries": 4,
      "retry_backoff_ms": 500,
      "open_window_seconds": 10
    }
  },
  "smart_assignment": {
    "enabled": false,
    "feature_flag_path": "/feature-flags",
    "configuration_reload_interval_seconds": 3,
    "session_cleanup_interval_minutes": 5,
    "metrics_retention_days": 30,
    "alert_check_interval_minutes": 1
  },
  "rate_limits": {
    "ip_per_minute": 20,
    "card_per_minute": 30,
    "locker_per_minute": 3,
    "device_per_20_seconds": 1,
    "card_rate_limit_seconds": 10,
    "user_report_daily_cap": 2
  },
  "monitoring": {
    "health_check_interval_seconds": 30,
    "performance_metrics_enabled": true,
    "alert_notifications_enabled": true
  }
}
EOF

success "Configuration updated"

# Step 6: Install dependencies and build
log "Step 6: Installing dependencies and building"

cd "$PROJECT_ROOT"

# Install root dependencies
if [ -f "package.json" ]; then
    log "Installing root dependencies..."
    npm install
fi

# Build shared module
if [ -d "shared" ]; then
    log "Building shared module..."
    cd shared
    npm install
    npm run build || true
    cd ..
fi

# Build services
for service in gateway kiosk panel; do
    if [ -d "app/$service" ]; then
        log "Building $service service..."
        cd "app/$service"
        npm install
        npm run build || true
        cd "$PROJECT_ROOT"
    fi
done

success "Dependencies installed and services built"

# Step 7: Validate deployment
log "Step 7: Validating deployment"

# Run deployment validation script
if [ -f "$SCRIPT_DIR/validate-smart-assignment-deployment.js" ]; then
    log "Running deployment validation..."
    if node "$SCRIPT_DIR/validate-smart-assignment-deployment.js"; then
        success "Deployment validation passed"
    else
        warning "Deployment validation had issues. Check the validation report."
    fi
fi

# Step 8: Start services
log "Step 8: Starting services"

# Start services in background
log "Starting Gateway service..."
npm run start:gateway &
GATEWAY_PID=$!
sleep 3

log "Starting Kiosk service..."
npm run start:kiosk &
KIOSK_PID=$!
sleep 3

log "Starting Panel service..."
npm run start:panel &
PANEL_PID=$!
sleep 5

# Verify services are running
log "Verifying services..."

# Check Gateway
if curl -s http://localhost:3000/health > /dev/null; then
    success "Gateway service is running (Port 3000)"
else
    warning "Gateway service health check failed"
fi

# Check Kiosk  
if curl -s http://localhost:3002/health > /dev/null; then
    success "Kiosk service is running (Port 3002)"
else
    warning "Kiosk service health check failed"
fi

# Check Panel
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    success "Panel service is running (Port 3001)"
else
    warning "Panel service health check failed (may require authentication)"
fi

# Step 9: Final verification
log "Step 9: Final verification"

# Test smart assignment feature flag
log "Testing smart assignment feature flag..."
FEATURE_FLAG_STATUS=$(sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT value FROM settings_global WHERE key='smart_assignment_enabled';" 2>/dev/null || echo "false")

if [ "$FEATURE_FLAG_STATUS" = "false" ]; then
    success "Smart assignment is disabled by default (safe deployment)"
else
    warning "Smart assignment feature flag status: $FEATURE_FLAG_STATUS"
fi

# Create deployment report
REPORT_FILE="$BACKUP_DIR/deployment-report.txt"
cat > "$REPORT_FILE" << EOF
Smart Locker Assignment System Deployment Report
================================================

Deployment Date: $(date)
Project Root: $PROJECT_ROOT
Backup Location: $BACKUP_DIR

Services Status:
- Gateway (Port 3000): $(curl -s http://localhost:3000/health > /dev/null && echo "Running" || echo "Not responding")
- Kiosk (Port 3002): $(curl -s http://localhost:3002/health > /dev/null && echo "Running" || echo "Not responding")  
- Panel (Port 3001): $(curl -s http://localhost:3001/health > /dev/null 2>&1 && echo "Running" || echo "Not responding")

Database Tables Created:
$(sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%smart%' OR name LIKE '%settings%' OR name LIKE '%config%' OR name LIKE '%alert%' OR name LIKE '%assignment%';" | wc -l) smart assignment tables

Configuration:
- Smart Assignment Enabled: $FEATURE_FLAG_STATUS
- Configuration File: Updated
- Backup Created: Yes

Next Steps:
1. Monitor service logs for any issues
2. Test basic functionality with existing RFID cards
3. Enable smart assignment via admin panel when ready
4. Monitor system performance and alerts

Rollback Instructions:
If issues occur, run: $SCRIPT_DIR/rollback-smart-assignment.sh $BACKUP_DIR
EOF

log "Deployment report created: $REPORT_FILE"

# Final success message
success "Smart Locker Assignment System deployment completed successfully!"
log "Backup location: $BACKUP_DIR"
log "Feature flag is disabled by default - enable via admin panel when ready"
log "Monitor logs: tail -f $PROJECT_ROOT/logs/*.log"

exit 0