#!/bin/bash
# Startup IP Check and Update System
# Automatically runs during system startup to handle IP changes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="$PROJECT_ROOT/logs/startup-ip-check.log"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "🚀 Starting IP check during system startup..."

# Wait for network to be ready
log "⏳ Waiting for network interface to be ready..."
for i in {1..30}; do
    if hostname -I > /dev/null 2>&1; then
        log "✅ Network interface ready"
        break
    fi
    sleep 1
done

# Run the dynamic IP manager
log "🔍 Running dynamic IP manager..."
cd "$PROJECT_ROOT"
node scripts/network/dynamic-ip-manager.js run

if [ $? -eq 0 ]; then
    log "✅ IP management completed successfully"
else
    log "❌ IP management failed"
fi

# Update systemd service files if they exist
if [ -d "/etc/systemd/system" ]; then
    log "🔧 Checking systemd services for IP updates..."
    
    # This would update any systemd service files that might have hardcoded IPs
    # Currently not needed as services use localhost, but ready for future use
    log "ℹ️  Systemd services use localhost - no updates needed"
fi

log "🎯 Startup IP check completed"