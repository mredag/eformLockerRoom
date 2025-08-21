#!/bin/bash

# Eform Locker System Uninstall Script
# Removes the Eform Locker System from the system

set -e

# Configuration
INSTALL_DIR="/opt/eform"
SERVICE_USER="eform"
SERVICE_GROUP="eform"
LOG_DIR="/var/log/eform"
BACKUP_DIR="/opt/eform/backups"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# Confirm uninstallation
confirm_uninstall() {
    echo "=============================================="
    echo "  Eform Locker System Uninstaller"
    echo "=============================================="
    echo
    log_warning "This will completely remove the Eform Locker System from your system!"
    echo
    echo "The following will be removed:"
    echo "  - All application files in $INSTALL_DIR"
    echo "  - System user and group: $SERVICE_USER"
    echo "  - Systemd service files"
    echo "  - Log files in $LOG_DIR"
    echo "  - Udev rules"
    echo "  - Cron jobs"
    echo "  - Logrotate configuration"
    echo
    log_warning "Database and configuration backups will be preserved in $BACKUP_DIR"
    echo
    read -p "Are you sure you want to continue? (yes/no): " confirm
    
    if [[ "$confirm" != "yes" ]]; then
        log_info "Uninstallation cancelled"
        exit 0
    fi
}

# Create final backup
create_final_backup() {
    log_info "Creating final backup before uninstallation..."
    
    if [[ -x "$INSTALL_DIR/scripts/backup.sh" ]]; then
        "$INSTALL_DIR/scripts/backup.sh" backup daily
        log_success "Final backup created"
    else
        log_warning "Backup script not found, skipping final backup"
    fi
}

# Stop and disable services
stop_services() {
    log_info "Stopping and disabling services..."
    
    local services=("eform-agent" "eform-panel" "eform-kiosk" "eform-gateway")
    
    for service in "${services[@]}"; do
        if systemctl is-enabled --quiet "$service" 2>/dev/null; then
            systemctl stop "$service" || true
            systemctl disable "$service" || true
            log_info "Stopped and disabled $service"
        fi
    done
    
    log_success "Services stopped and disabled"
}

# Remove systemd service files
remove_services() {
    log_info "Removing systemd service files..."
    
    local services=("eform-gateway" "eform-kiosk" "eform-panel" "eform-agent")
    
    for service in "${services[@]}"; do
        if [[ -f "/etc/systemd/system/$service.service" ]]; then
            rm -f "/etc/systemd/system/$service.service"
            log_info "Removed $service.service"
        fi
    done
    
    # Reload systemd
    systemctl daemon-reload
    
    log_success "Systemd service files removed"
}

# Remove udev rules
remove_udev_rules() {
    log_info "Removing udev rules..."
    
    local rules=("99-eform-rfid.rules" "99-eform-serial.rules")
    
    for rule in "${rules[@]}"; do
        if [[ -f "/etc/udev/rules.d/$rule" ]]; then
            rm -f "/etc/udev/rules.d/$rule"
            log_info "Removed $rule"
        fi
    done
    
    # Reload udev rules
    udevadm control --reload-rules
    udevadm trigger
    
    log_success "Udev rules removed"
}

# Remove cron jobs
remove_cron_jobs() {
    log_info "Removing cron jobs..."
    
    if [[ -f "/etc/cron.d/eform-backup" ]]; then
        rm -f "/etc/cron.d/eform-backup"
        log_info "Removed backup cron job"
    fi
    
    log_success "Cron jobs removed"
}

# Remove logrotate configuration
remove_logrotate() {
    log_info "Removing logrotate configuration..."
    
    if [[ -f "/etc/logrotate.d/eform" ]]; then
        rm -f "/etc/logrotate.d/eform"
        log_info "Removed logrotate configuration"
    fi
    
    log_success "Logrotate configuration removed"
}

# Remove sudoers configuration
remove_sudoers() {
    log_info "Removing sudoers configuration..."
    
    if [[ -f "/etc/sudoers.d/eform-agent" ]]; then
        rm -f "/etc/sudoers.d/eform-agent"
        log_info "Removed sudoers configuration"
    fi
    
    log_success "Sudoers configuration removed"
}

# Remove application files
remove_application() {
    log_info "Removing application files..."
    
    if [[ -d "$INSTALL_DIR" ]]; then
        # Preserve backups
        if [[ -d "$BACKUP_DIR" ]]; then
            local temp_backup="/tmp/eform_backups_$(date +%s)"
            mv "$BACKUP_DIR" "$temp_backup"
            log_info "Preserved backups in $temp_backup"
        fi
        
        # Remove installation directory
        rm -rf "$INSTALL_DIR"
        
        # Restore backups to a safe location
        if [[ -d "$temp_backup" ]]; then
            mkdir -p "/var/backups/eform"
            mv "$temp_backup"/* "/var/backups/eform/"
            rmdir "$temp_backup"
            log_info "Backups moved to /var/backups/eform"
        fi
        
        log_success "Application files removed"
    else
        log_info "Application directory not found"
    fi
}

# Remove log files
remove_logs() {
    log_info "Removing log files..."
    
    if [[ -d "$LOG_DIR" ]]; then
        rm -rf "$LOG_DIR"
        log_success "Log files removed"
    else
        log_info "Log directory not found"
    fi
}

# Remove system user
remove_user() {
    log_info "Removing system user..."
    
    if id "$SERVICE_USER" &>/dev/null; then
        # Remove user from groups
        gpasswd -d "$SERVICE_USER" dialout 2>/dev/null || true
        
        # Delete user
        userdel "$SERVICE_USER" 2>/dev/null || true
        
        # Delete group if it exists and is empty
        if getent group "$SERVICE_GROUP" &>/dev/null; then
            groupdel "$SERVICE_GROUP" 2>/dev/null || true
        fi
        
        log_success "System user removed"
    else
        log_info "System user not found"
    fi
}

# Clean up package dependencies (optional)
cleanup_dependencies() {
    log_info "Cleaning up unused dependencies..."
    
    # This is optional and should be done carefully
    apt-get autoremove -y || true
    
    log_success "Dependency cleanup completed"
}

# Verify uninstallation
verify_uninstallation() {
    log_info "Verifying uninstallation..."
    
    local issues=()
    
    # Check services
    local services=("eform-gateway" "eform-kiosk" "eform-panel" "eform-agent")
    for service in "${services[@]}"; do
        if systemctl is-enabled --quiet "$service" 2>/dev/null; then
            issues+=("Service $service still enabled")
        fi
    done
    
    # Check files
    if [[ -d "$INSTALL_DIR" ]]; then
        issues+=("Installation directory still exists: $INSTALL_DIR")
    fi
    
    if [[ -d "$LOG_DIR" ]]; then
        issues+=("Log directory still exists: $LOG_DIR")
    fi
    
    # Check user
    if id "$SERVICE_USER" &>/dev/null; then
        issues+=("System user still exists: $SERVICE_USER")
    fi
    
    # Report results
    if [[ ${#issues[@]} -eq 0 ]]; then
        log_success "Uninstallation verification passed"
    else
        log_warning "Uninstallation verification found issues:"
        for issue in "${issues[@]}"; do
            echo "  - $issue"
        done
    fi
}

# Print uninstallation summary
print_summary() {
    echo
    echo "=============================================="
    echo "  Eform Locker System Uninstallation Complete"
    echo "=============================================="
    echo
    echo "Removed:"
    echo "  - Application files from $INSTALL_DIR"
    echo "  - System user: $SERVICE_USER"
    echo "  - Systemd services"
    echo "  - Log files from $LOG_DIR"
    echo "  - Udev rules"
    echo "  - Cron jobs"
    echo "  - Logrotate configuration"
    echo
    echo "Preserved:"
    echo "  - Database and configuration backups in /var/backups/eform"
    echo
    echo "Manual cleanup (if needed):"
    echo "  - Remove Node.js if no longer needed: apt remove nodejs npm"
    echo "  - Remove backup files: rm -rf /var/backups/eform"
    echo
}

# Main uninstallation function
main() {
    check_root
    confirm_uninstall
    create_final_backup
    stop_services
    remove_services
    remove_udev_rules
    remove_cron_jobs
    remove_logrotate
    remove_sudoers
    remove_application
    remove_logs
    remove_user
    cleanup_dependencies
    verify_uninstallation
    print_summary
    
    log_success "Uninstallation completed successfully!"
}

# Run main function
main "$@"