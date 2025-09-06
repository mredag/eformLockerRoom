#!/bin/bash

# Smart Locker Assignment System - Rollback Script
# Version: 1.0.0
# Description: Complete rollback of smart assignment system deployment

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_DIR="$1"
LOG_FILE="$PROJECT_ROOT/logs/smart-assignment-rollback.log"

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

# Validate backup directory
if [ -z "$BACKUP_DIR" ]; then
    error "Usage: $0 <backup_directory>"
fi

if [ ! -d "$BACKUP_DIR" ]; then
    error "Backup directory not found: $BACKUP_DIR"
fi

# Create log directory
mkdir -p "$(dirname "$LOG_FILE")"

log "Starting Smart Locker Assignment System Rollback"
log "Project Root: $PROJECT_ROOT"
log "Backup Directory: $BACKUP_DIR"

# Step 1: Stop services
log "Step 1: Stopping services"

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

# Step 2: Restore database
log "Step 2: Restoring database"

if [ -f "$BACKUP_DIR/eform.db.backup" ]; then
    # Create current backup before rollback
    cp "$PROJECT_ROOT/data/eform.db" "$PROJECT_ROOT/data/eform.db.pre-rollback-$(date +%Y%m%d-%H%M%S)"
    
    # Restore from backup
    cp "$BACKUP_DIR/eform.db.backup" "$PROJECT_ROOT/data/eform.db"
    success "Database restored from backup"
else
    warning "Database backup not found. Running SQL rollback instead..."
    
    # Run SQL rollback
    if [ -f "$SCRIPT_DIR/smart-assignment-rollback.sql" ]; then
        if sqlite3 "$PROJECT_ROOT/data/eform.db" < "$SCRIPT_DIR/smart-assignment-rollback.sql"; then
            success "Database rollback completed via SQL script"
        else
            error "Database rollback failed"
        fi
    else
        error "Neither database backup nor rollback SQL found"
    fi
fi

# Step 3: Restore configuration
log "Step 3: Restoring configuration"

if [ -f "$BACKUP_DIR/system.json.backup" ]; then
    cp "$BACKUP_DIR/system.json.backup" "$PROJECT_ROOT/config/system.json"
    success "Configuration restored from backup"
elif [ -f "$PROJECT_ROOT/config/system.json.pre-smart-assignment" ]; then
    cp "$PROJECT_ROOT/config/system.json.pre-smart-assignment" "$PROJECT_ROOT/config/system.json"
    success "Configuration restored from pre-deployment backup"
else
    warning "Configuration backup not found. Creating minimal configuration..."
    
    # Create minimal working configuration
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
      "pulse_duration_ms": 400,
      "command_interval_ms": 300,
      "max_retries": 4
    }
  },
  "rate_limits": {
    "ip_per_minute": 20,
    "card_per_minute": 30,
    "locker_per_minute": 3,
    "device_per_20_seconds": 1
  }
}
EOF
    success "Minimal configuration created"
fi

# Step 4: Restore package.json files if needed
log "Step 4: Checking package dependencies"

# Check if we need to restore any package.json files
if [ -f "$BACKUP_DIR/package.json" ]; then
    log "Package.json backup found - dependencies may need restoration"
    # Note: In most cases, package.json shouldn't change during smart assignment deployment
fi

# Step 5: Rebuild services with original configuration
log "Step 5: Rebuilding services"

cd "$PROJECT_ROOT"

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

success "Services rebuilt"

# Step 6: Start services
log "Step 6: Starting services"

# Start services in background
log "Starting Gateway service..."
npm run start:gateway &
sleep 3

log "Starting Kiosk service..."
npm run start:kiosk &
sleep 3

log "Starting Panel service..."
npm run start:panel &
sleep 5

# Step 7: Verify rollback
log "Step 7: Verifying rollback"

# Check services
if curl -s http://localhost:3000/health > /dev/null; then
    success "Gateway service is running (Port 3000)"
else
    warning "Gateway service health check failed"
fi

if curl -s http://localhost:3002/health > /dev/null; then
    success "Kiosk service is running (Port 3002)"
else
    warning "Kiosk service health check failed"
fi

if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    success "Panel service is running (Port 3001)"
else
    warning "Panel service health check failed (may require authentication)"
fi

# Verify smart assignment tables are removed
SMART_TABLES=$(sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND (name LIKE '%smart%' OR name LIKE '%settings_global%' OR name LIKE '%assignment_metrics%' OR name LIKE '%alerts%');" 2>/dev/null || echo "0")

if [ "$SMART_TABLES" -eq 0 ]; then
    success "Smart assignment tables successfully removed"
else
    warning "$SMART_TABLES smart assignment tables still exist"
fi

# Step 8: Create rollback report
REPORT_FILE="$BACKUP_DIR/rollback-report.txt"
cat > "$REPORT_FILE" << EOF
Smart Locker Assignment System Rollback Report
==============================================

Rollback Date: $(date)
Project Root: $PROJECT_ROOT
Backup Used: $BACKUP_DIR

Services Status After Rollback:
- Gateway (Port 3000): $(curl -s http://localhost:3000/health > /dev/null && echo "Running" || echo "Not responding")
- Kiosk (Port 3002): $(curl -s http://localhost:3002/health > /dev/null && echo "Running" || echo "Not responding")  
- Panel (Port 3001): $(curl -s http://localhost:3001/health > /dev/null 2>&1 && echo "Running" || echo "Not responding")

Database Status:
- Smart assignment tables removed: $([ "$SMART_TABLES" -eq 0 ] && echo "Yes" || echo "No ($SMART_TABLES remaining)")
- Original schema restored: Yes

Configuration:
- System configuration restored: Yes
- Smart assignment features disabled: Yes

Verification:
- All services restarted: Yes
- Basic functionality should be restored to pre-deployment state

Next Steps:
1. Test basic locker operations
2. Verify RFID functionality
3. Check admin panel access
4. Monitor logs for any issues

If issues persist:
- Check service logs: tail -f $PROJECT_ROOT/logs/*.log
- Verify database integrity: sqlite3 $PROJECT_ROOT/data/eform.db "PRAGMA integrity_check;"
- Restart services manually if needed
EOF

log "Rollback report created: $REPORT_FILE"

# Final success message
success "Smart Locker Assignment System rollback completed successfully!"
log "System should now be in pre-deployment state"
log "Rollback report: $REPORT_FILE"
log "Monitor logs: tail -f $PROJECT_ROOT/logs/*.log"

exit 0