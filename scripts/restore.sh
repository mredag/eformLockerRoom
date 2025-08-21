#!/bin/bash

# Eform Locker System Restore Script
# Restores system from backup files

set -e

# Configuration
INSTALL_DIR="/opt/eform"
DATA_DIR="/opt/eform/data"
CONFIG_DIR="/opt/eform/config"
BACKUP_DIR="/opt/eform/backups"
LOG_FILE="/var/log/eform/restore.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# List available backups
list_backups() {
    echo "=============================================="
    echo "  Available Backups"
    echo "=============================================="
    echo
    
    for backup_type in daily weekly monthly; do
        local backup_dir="$BACKUP_DIR/$backup_type"
        if [[ -d "$backup_dir" ]] && [[ $(find "$backup_dir" -name "*.tar.gz" | wc -l) -gt 0 ]]; then
            echo "$backup_type backups:"
            find "$backup_dir" -name "*.tar.gz" -printf '%T@ %p\n' | sort -rn | while read timestamp filepath; do
                local date=$(date -d "@$timestamp" "+%Y-%m-%d %H:%M:%S")
                local size=$(du -h "$filepath" | cut -f1)
                echo "  $(basename "$filepath") - $date ($size)"
            done
            echo
        fi
    done
}

# Verify backup file
verify_backup() {
    local backup_file="$1"
    
    log_info "Verifying backup file..."
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    if ! tar -tzf "$backup_file" >/dev/null 2>&1; then
        log_error "Backup file is corrupted or invalid"
        return 1
    fi
    
    log_success "Backup file verified"
    return 0
}

# Stop all services
stop_services() {
    log_info "Stopping Eform services..."
    
    local services=("eform-agent" "eform-panel" "eform-kiosk" "eform-gateway")
    
    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service"; then
            systemctl stop "$service"
            log_info "Stopped $service"
        fi
    done
    
    # Wait for services to fully stop
    sleep 5
    
    log_success "All services stopped"
}

# Start all services
start_services() {
    log_info "Starting Eform services..."
    
    # Start in dependency order
    systemctl start eform-gateway
    sleep 3
    
    systemctl start eform-agent
    sleep 2
    
    systemctl start eform-kiosk
    systemctl start eform-panel
    
    # Wait for services to start
    sleep 5
    
    # Verify services are running
    local services=("eform-gateway" "eform-kiosk" "eform-panel" "eform-agent")
    local failed_services=()
    
    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service"; then
            log_success "$service started successfully"
        else
            log_error "$service failed to start"
            failed_services+=("$service")
        fi
    done
    
    if [[ ${#failed_services[@]} -gt 0 ]]; then
        log_error "Some services failed to start: ${failed_services[*]}"
        return 1
    fi
    
    log_success "All services started successfully"
}

# Create pre-restore backup
create_pre_restore_backup() {
    log_info "Creating pre-restore backup..."
    
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="$BACKUP_DIR/pre_restore_$timestamp.tar.gz"
    local temp_dir=$(mktemp -d)
    
    # Backup current database
    if [[ -f "$DATA_DIR/eform.db" ]]; then
        sqlite3 "$DATA_DIR/eform.db" ".backup '$temp_dir/eform.db'"
    fi
    
    # Backup current configuration
    if [[ -d "$CONFIG_DIR" ]]; then
        cp -r "$CONFIG_DIR" "$temp_dir/"
    fi
    
    # Create backup archive
    tar -czf "$backup_file" -C "$temp_dir" .
    
    # Cleanup
    rm -rf "$temp_dir"
    
    log_success "Pre-restore backup created: $(basename "$backup_file")"
    echo "$backup_file"
}

# Restore database
restore_database() {
    local temp_dir="$1"
    
    if [[ -f "$temp_dir/eform.db" ]]; then
        log_info "Restoring database..."
        
        # Backup current database if it exists
        if [[ -f "$DATA_DIR/eform.db" ]]; then
            mv "$DATA_DIR/eform.db" "$DATA_DIR/eform.db.backup.$(date +%s)"
        fi
        
        # Restore database
        cp "$temp_dir/eform.db" "$DATA_DIR/"
        chown eform:eform "$DATA_DIR/eform.db"
        chmod 640 "$DATA_DIR/eform.db"
        
        # Verify database integrity
        if sqlite3 "$DATA_DIR/eform.db" "PRAGMA integrity_check;" | grep -q "ok"; then
            log_success "Database restored and verified"
        else
            log_error "Database integrity check failed after restore"
            return 1
        fi
    else
        log_warning "No database found in backup"
    fi
}

# Restore configuration
restore_configuration() {
    local temp_dir="$1"
    
    if [[ -d "$temp_dir/config" ]]; then
        log_info "Restoring configuration..."
        
        # Backup current configuration
        if [[ -d "$CONFIG_DIR" ]]; then
            mv "$CONFIG_DIR" "$CONFIG_DIR.backup.$(date +%s)"
        fi
        
        # Restore configuration
        cp -r "$temp_dir/config" "$CONFIG_DIR"
        chown -R eform:eform "$CONFIG_DIR"
        chmod -R 640 "$CONFIG_DIR"/*
        
        log_success "Configuration restored"
    else
        log_warning "No configuration found in backup"
    fi
}

# Restore logs
restore_logs() {
    local temp_dir="$1"
    
    if [[ -d "$temp_dir/logs" ]]; then
        log_info "Restoring logs..."
        
        # Create logs directory if it doesn't exist
        mkdir -p /var/log/eform
        
        # Restore logs
        cp "$temp_dir/logs"/* /var/log/eform/ 2>/dev/null || true
        chown -R eform:eform /var/log/eform
        chmod -R 644 /var/log/eform/*
        
        log_success "Logs restored"
    else
        log_info "No logs found in backup"
    fi
}

# Perform full restore
perform_restore() {
    local backup_file="$1"
    local interactive="${2:-true}"
    
    # Verify backup file
    if ! verify_backup "$backup_file"; then
        exit 1
    fi
    
    # Interactive confirmation
    if [[ "$interactive" == "true" ]]; then
        echo
        log_warning "This will restore from backup and overwrite current data!"
        echo "Backup file: $backup_file"
        echo "Backup size: $(du -h "$backup_file" | cut -f1)"
        echo "Backup date: $(stat -c %y "$backup_file" | cut -d' ' -f1-2)"
        echo
        read -p "Are you sure you want to continue? (yes/no): " confirm
        
        if [[ "$confirm" != "yes" ]]; then
            log_info "Restore cancelled by user"
            exit 0
        fi
    fi
    
    log_info "Starting restore process..."
    
    # Create pre-restore backup
    local pre_restore_backup=$(create_pre_restore_backup)
    
    # Stop services
    stop_services
    
    # Extract backup to temporary directory
    local temp_dir=$(mktemp -d)
    log_info "Extracting backup..."
    tar -xzf "$backup_file" -C "$temp_dir"
    
    # Restore components
    restore_database "$temp_dir"
    restore_configuration "$temp_dir"
    restore_logs "$temp_dir"
    
    # Cleanup temporary directory
    rm -rf "$temp_dir"
    
    # Start services
    if start_services; then
        log_success "Restore completed successfully!"
        log_info "Pre-restore backup saved: $(basename "$pre_restore_backup")"
        
        # Run health check
        sleep 10
        if curl -f http://localhost:3000/health >/dev/null 2>&1; then
            log_success "System health check passed"
        else
            log_warning "System health check failed - please verify manually"
        fi
    else
        log_error "Failed to start services after restore"
        log_info "You may need to restore from pre-restore backup: $(basename "$pre_restore_backup")"
        exit 1
    fi
}

# Interactive restore menu
interactive_restore() {
    echo "=============================================="
    echo "  Eform System Restore"
    echo "=============================================="
    echo
    
    list_backups
    
    echo "Enter the full path to the backup file you want to restore:"
    read -p "Backup file: " backup_file
    
    if [[ -z "$backup_file" ]]; then
        log_error "No backup file specified"
        exit 1
    fi
    
    perform_restore "$backup_file" true
}

# Usage information
usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo
    echo "Commands:"
    echo "  restore <backup_file>    Restore from specific backup file"
    echo "  interactive              Interactive restore menu"
    echo "  list                     List available backups"
    echo "  help                     Show this help"
    echo
    echo "Options:"
    echo "  --no-confirm            Skip interactive confirmation"
    echo
    echo "Examples:"
    echo "  $0 interactive"
    echo "  $0 list"
    echo "  $0 restore /opt/eform/backups/daily/eform_backup_daily_20231201_020000.tar.gz"
    echo "  $0 restore /path/to/backup.tar.gz --no-confirm"
}

# Main script logic
main() {
    local command="${1:-interactive}"
    
    case "$command" in
        "restore")
            if [[ -z "$2" ]]; then
                log_error "Backup file path required"
                usage
                exit 1
            fi
            local interactive="true"
            if [[ "$3" == "--no-confirm" ]]; then
                interactive="false"
            fi
            check_root
            perform_restore "$2" "$interactive"
            ;;
        "interactive")
            check_root
            interactive_restore
            ;;
        "list")
            list_backups
            ;;
        "help"|"-h"|"--help")
            usage
            ;;
        *)
            log_error "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"