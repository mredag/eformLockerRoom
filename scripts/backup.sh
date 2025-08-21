#!/bin/bash

# Eform Locker System Backup Script
# Creates backups of database and configuration files

set -e

# Configuration
INSTALL_DIR="/opt/eform"
DATA_DIR="/opt/eform/data"
CONFIG_DIR="/opt/eform/config"
BACKUP_DIR="/opt/eform/backups"
LOG_FILE="/var/log/eform/backup.log"

# Retention settings
DAILY_RETENTION=7
WEEKLY_RETENTION=4
MONTHLY_RETENTION=12

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

# Create backup directories
create_backup_dirs() {
    mkdir -p "$BACKUP_DIR"/{daily,weekly,monthly}
    mkdir -p "$(dirname "$LOG_FILE")"
}

# Get backup filename with timestamp
get_backup_filename() {
    local backup_type="$1"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    echo "eform_backup_${backup_type}_${timestamp}.tar.gz"
}

# Create database backup
backup_database() {
    local backup_file="$1"
    local temp_dir=$(mktemp -d)
    
    log_info "Creating database backup..."
    
    # Create SQLite backup using .backup command
    sqlite3 "$DATA_DIR/eform.db" ".backup '$temp_dir/eform.db'"
    
    # Verify backup integrity
    if sqlite3 "$temp_dir/eform.db" "PRAGMA integrity_check;" | grep -q "ok"; then
        log_success "Database backup verified"
    else
        log_error "Database backup verification failed"
        rm -rf "$temp_dir"
        return 1
    fi
    
    # Add database to backup archive
    tar -czf "$backup_file" -C "$temp_dir" eform.db
    
    # Cleanup
    rm -rf "$temp_dir"
    
    log_success "Database backup created: $(basename "$backup_file")"
}

# Create configuration backup
backup_configuration() {
    local backup_file="$1"
    local temp_dir=$(mktemp -d)
    
    log_info "Creating configuration backup..."
    
    # Copy configuration files
    cp -r "$CONFIG_DIR" "$temp_dir/"
    
    # Add configuration to backup archive
    tar -czf "$backup_file" -C "$temp_dir" config
    
    # Cleanup
    rm -rf "$temp_dir"
    
    log_success "Configuration backup created: $(basename "$backup_file")"
}

# Create full system backup
backup_full() {
    local backup_file="$1"
    local temp_dir=$(mktemp -d)
    
    log_info "Creating full system backup..."
    
    # Create database backup
    sqlite3 "$DATA_DIR/eform.db" ".backup '$temp_dir/eform.db'"
    
    # Copy configuration
    cp -r "$CONFIG_DIR" "$temp_dir/"
    
    # Copy logs (last 7 days)
    mkdir -p "$temp_dir/logs"
    find /var/log/eform -name "*.log" -mtime -7 -exec cp {} "$temp_dir/logs/" \;
    
    # Copy application logs
    if [[ -d "$INSTALL_DIR/logs" ]]; then
        find "$INSTALL_DIR/logs" -name "*.log" -mtime -7 -exec cp {} "$temp_dir/logs/" \;
    fi
    
    # Create backup archive
    tar -czf "$backup_file" -C "$temp_dir" .
    
    # Cleanup
    rm -rf "$temp_dir"
    
    log_success "Full backup created: $(basename "$backup_file")"
}

# Cleanup old backups
cleanup_old_backups() {
    log_info "Cleaning up old backups..."
    
    # Daily backups - keep last 7
    find "$BACKUP_DIR/daily" -name "*.tar.gz" -type f -mtime +$DAILY_RETENTION -delete
    
    # Weekly backups - keep last 4
    find "$BACKUP_DIR/weekly" -name "*.tar.gz" -type f -mtime +$((WEEKLY_RETENTION * 7)) -delete
    
    # Monthly backups - keep last 12
    find "$BACKUP_DIR/monthly" -name "*.tar.gz" -type f -mtime +$((MONTHLY_RETENTION * 30)) -delete
    
    log_success "Old backups cleaned up"
}

# Verify backup integrity
verify_backup() {
    local backup_file="$1"
    
    log_info "Verifying backup integrity..."
    
    if tar -tzf "$backup_file" >/dev/null 2>&1; then
        log_success "Backup integrity verified"
        return 0
    else
        log_error "Backup integrity check failed"
        return 1
    fi
}

# Send backup notification (if configured)
send_notification() {
    local status="$1"
    local backup_file="$2"
    
    # Check if notification is configured
    if [[ -f "$CONFIG_DIR/notification.conf" ]]; then
        source "$CONFIG_DIR/notification.conf"
        
        if [[ -n "$NOTIFICATION_EMAIL" ]]; then
            local subject="Eform Backup $status"
            local body="Backup completed: $(basename "$backup_file")\nTimestamp: $(date)\nSize: $(du -h "$backup_file" | cut -f1)"
            
            echo -e "$body" | mail -s "$subject" "$NOTIFICATION_EMAIL" || true
        fi
    fi
}

# Main backup function
perform_backup() {
    local backup_type="${1:-daily}"
    
    log_info "Starting $backup_type backup..."
    
    create_backup_dirs
    
    local backup_filename=$(get_backup_filename "$backup_type")
    local backup_path="$BACKUP_DIR/$backup_type/$backup_filename"
    
    # Perform backup based on type
    case "$backup_type" in
        "daily")
            backup_database "$backup_path"
            ;;
        "weekly")
            backup_full "$backup_path"
            ;;
        "monthly")
            backup_full "$backup_path"
            ;;
        *)
            log_error "Unknown backup type: $backup_type"
            exit 1
            ;;
    esac
    
    # Verify backup
    if verify_backup "$backup_path"; then
        log_success "$backup_type backup completed successfully"
        send_notification "SUCCESS" "$backup_path"
    else
        log_error "$backup_type backup failed verification"
        send_notification "FAILED" "$backup_path"
        exit 1
    fi
    
    # Cleanup old backups
    cleanup_old_backups
    
    # Log backup size and location
    local backup_size=$(du -h "$backup_path" | cut -f1)
    log_info "Backup size: $backup_size"
    log_info "Backup location: $backup_path"
}

# Show backup status
show_status() {
    echo "=============================================="
    echo "  Eform Backup Status"
    echo "=============================================="
    echo
    
    for backup_type in daily weekly monthly; do
        echo "$backup_type backups:"
        local backup_dir="$BACKUP_DIR/$backup_type"
        if [[ -d "$backup_dir" ]]; then
            local count=$(find "$backup_dir" -name "*.tar.gz" | wc -l)
            echo "  Count: $count"
            if [[ $count -gt 0 ]]; then
                local latest=$(find "$backup_dir" -name "*.tar.gz" -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)
                local latest_date=$(stat -c %y "$latest" | cut -d' ' -f1)
                local latest_size=$(du -h "$latest" | cut -f1)
                echo "  Latest: $(basename "$latest") ($latest_date, $latest_size)"
            fi
        else
            echo "  No backups found"
        fi
        echo
    done
}

# Restore from backup
restore_backup() {
    local backup_file="$1"
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        exit 1
    fi
    
    log_warning "This will restore from backup and overwrite current data!"
    read -p "Are you sure? (yes/no): " confirm
    
    if [[ "$confirm" != "yes" ]]; then
        log_info "Restore cancelled"
        exit 0
    fi
    
    log_info "Stopping services..."
    systemctl stop eform-gateway eform-kiosk eform-panel eform-agent || true
    
    log_info "Creating pre-restore backup..."
    local pre_restore_backup="$BACKUP_DIR/pre_restore_$(date +%Y%m%d_%H%M%S).tar.gz"
    backup_full "$pre_restore_backup"
    
    log_info "Restoring from backup..."
    local temp_dir=$(mktemp -d)
    
    # Extract backup
    tar -xzf "$backup_file" -C "$temp_dir"
    
    # Restore database
    if [[ -f "$temp_dir/eform.db" ]]; then
        cp "$temp_dir/eform.db" "$DATA_DIR/"
        chown eform:eform "$DATA_DIR/eform.db"
        log_success "Database restored"
    fi
    
    # Restore configuration
    if [[ -d "$temp_dir/config" ]]; then
        cp -r "$temp_dir/config/"* "$CONFIG_DIR/"
        chown -R eform:eform "$CONFIG_DIR"
        log_success "Configuration restored"
    fi
    
    # Cleanup
    rm -rf "$temp_dir"
    
    log_info "Starting services..."
    systemctl start eform-gateway eform-kiosk eform-panel eform-agent
    
    log_success "Restore completed successfully"
    log_info "Pre-restore backup saved: $pre_restore_backup"
}

# Usage information
usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo
    echo "Commands:"
    echo "  backup [daily|weekly|monthly]  Create backup (default: daily)"
    echo "  status                         Show backup status"
    echo "  restore <backup_file>          Restore from backup"
    echo "  help                           Show this help"
    echo
    echo "Examples:"
    echo "  $0 backup daily"
    echo "  $0 status"
    echo "  $0 restore /opt/eform/backups/daily/eform_backup_daily_20231201_020000.tar.gz"
}

# Main script logic
main() {
    local command="${1:-backup}"
    
    case "$command" in
        "backup")
            perform_backup "${2:-daily}"
            ;;
        "status")
            show_status
            ;;
        "restore")
            restore_backup "$2"
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