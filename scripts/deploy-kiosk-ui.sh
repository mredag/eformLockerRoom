#!/bin/bash

# Kiosk UI Deployment Script for Raspberry Pi
# This script deploys the optimized kiosk UI to production

set -e

echo "🚀 Starting Kiosk UI Deployment..."

# Configuration
BACKUP_DIR="/home/pi/backups/kiosk-ui"
SERVICE_NAME="kiosk"
LOG_FILE="/home/pi/logs/deployment.log"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"
mkdir -p "/home/pi/logs"

# Function to log messages
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to backup current UI
backup_current_ui() {
    log "📦 Creating backup of current UI..."
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_PATH="$BACKUP_DIR/ui_backup_$TIMESTAMP"
    
    mkdir -p "$BACKUP_PATH"
    
    if [ -d "app/kiosk/src/ui" ]; then
        cp -r app/kiosk/src/ui "$BACKUP_PATH/"
        log "✅ Backup created at $BACKUP_PATH"
    else
        log "⚠️  No existing UI found to backup"
    fi
}

# Function to stop services
stop_services() {
    log "🛑 Stopping kiosk service..."
    
    # Kill any running node processes for kiosk
    pkill -f "node.*kiosk" || true
    
    # Wait for processes to stop
    sleep 3
    
    log "✅ Services stopped"
}

# Function to deploy new UI
deploy_ui() {
    log "📋 Deploying optimized kiosk UI..."
    
    # Build the kiosk service
    log "🔨 Building kiosk service..."
    npm run build:kiosk
    
    if [ $? -eq 0 ]; then
        log "✅ Build completed successfully"
    else
        log "❌ Build failed"
        exit 1
    fi
}

# Function to start services
start_services() {
    log "🚀 Starting kiosk service..."
    
    # Start kiosk service in background
    nohup npm run start:kiosk > /home/pi/logs/kiosk.log 2>&1 &
    
    # Wait for service to start
    sleep 5
    
    # Check if service is running
    if pgrep -f "node.*kiosk" > /dev/null; then
        log "✅ Kiosk service started successfully"
    else
        log "❌ Failed to start kiosk service"
        exit 1
    fi
}

# Function to verify deployment
verify_deployment() {
    log "🔍 Verifying deployment..."
    
    # Check if kiosk service is responding
    if curl -f http://localhost:3002/health > /dev/null 2>&1; then
        log "✅ Kiosk service health check passed"
    else
        log "❌ Kiosk service health check failed"
        return 1
    fi
    
    # Check if UI files exist
    if [ -f "app/kiosk/src/ui/static/app-simple.js" ] && [ -f "app/kiosk/src/ui/static/styles-simple.css" ]; then
        log "✅ Optimized UI files found"
    else
        log "❌ Optimized UI files missing"
        return 1
    fi
    
    log "✅ Deployment verification completed"
}

# Function to rollback if needed
rollback() {
    log "🔄 Rolling back to previous version..."
    
    # Find latest backup
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR" | head -n1)
    
    if [ -n "$LATEST_BACKUP" ]; then
        log "📦 Restoring from backup: $LATEST_BACKUP"
        
        # Stop services
        stop_services
        
        # Restore backup
        rm -rf app/kiosk/src/ui
        cp -r "$BACKUP_DIR/$LATEST_BACKUP/ui" app/kiosk/src/ui/
        
        # Rebuild and restart
        npm run build:kiosk
        start_services
        
        log "✅ Rollback completed"
    else
        log "❌ No backup found for rollback"
        exit 1
    fi
}

# Main deployment process
main() {
    log "🚀 Starting Kiosk UI Deployment Process"
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ]; then
        log "❌ Not in project root directory"
        exit 1
    fi
    
    # Create backup
    backup_current_ui
    
    # Stop services
    stop_services
    
    # Deploy new UI
    deploy_ui
    
    # Start services
    start_services
    
    # Verify deployment
    if verify_deployment; then
        log "🎉 Deployment completed successfully!"
        log "📊 Access kiosk at: http://$(hostname -I | awk '{print $1}'):3002"
    else
        log "❌ Deployment verification failed, initiating rollback..."
        rollback
        exit 1
    fi
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "rollback")
        rollback
        ;;
    "verify")
        verify_deployment
        ;;
    *)
        echo "Usage: $0 [deploy|rollback|verify]"
        echo "  deploy  - Deploy the optimized kiosk UI (default)"
        echo "  rollback - Rollback to previous version"
        echo "  verify  - Verify current deployment"
        exit 1
        ;;
esac