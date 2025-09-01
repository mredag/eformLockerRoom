#!/bin/bash

# Eform Locker System Deployment Script
# Handles application updates and deployments

set -e

# Configuration
INSTALL_DIR="/opt/eform"
DATA_DIR="/opt/eform/data"
CONFIG_DIR="/opt/eform/config"
BACKUP_DIR="/opt/eform/backups"
LOG_FILE="/var/log/eform/deploy.log"

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

# Get current version
get_current_version() {
    if [[ -f "$INSTALL_DIR/package.json" ]]; then
        grep '"version"' "$INSTALL_DIR/package.json" | cut -d'"' -f4
    else
        echo "unknown"
    fi
}

# Verify deployment package
verify_package() {
    local package_file="$1"
    
    log_info "Verifying deployment package..."
    
    if [[ ! -f "$package_file" ]]; then
        log_error "Package file not found: $package_file"
        return 1
    fi
    
    # Check if it's a valid tar.gz file
    if ! tar -tzf "$package_file" >/dev/null 2>&1; then
        log_error "Invalid package file format"
        return 1
    fi
    
    # Check for required files
    local required_files=("package.json" "app/" "shared/")
    for file in "${required_files[@]}"; do
        if ! tar -tzf "$package_file" | grep -q "^$file"; then
            log_error "Required file/directory missing from package: $file"
            return 1
        fi
    done
    
    log_success "Package verification passed"
    return 0
}

# Create pre-deployment backup
create_pre_deployment_backup() {
    log_info "Creating pre-deployment backup..."
    
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="$BACKUP_DIR/pre_deploy_$timestamp.tar.gz"
    
    # Use existing backup script if available
    if [[ -x "$INSTALL_DIR/scripts/backup.sh" ]]; then
        "$INSTALL_DIR/scripts/backup.sh" backup daily
    else
        # Manual backup
        local temp_dir=$(mktemp -d)
        
        # Backup database
        if [[ -f "$DATA_DIR/eform.db" ]]; then
            sqlite3 "$DATA_DIR/eform.db" ".backup '$temp_dir/eform.db'"
        fi
        
        # Backup configuration
        if [[ -d "$CONFIG_DIR" ]]; then
            cp -r "$CONFIG_DIR" "$temp_dir/"
        fi
        
        # Backup current application
        if [[ -d "$INSTALL_DIR/app" ]]; then
            cp -r "$INSTALL_DIR/app" "$temp_dir/"
        fi
        
        # Create backup archive
        tar -czf "$backup_file" -C "$temp_dir" .
        rm -rf "$temp_dir"
    fi
    
    log_success "Pre-deployment backup created"
    echo "$backup_file"
}

# Stop services for deployment
stop_services() {
    log_info "Stopping services for deployment..."
    
    local services=("eform-agent" "eform-panel" "eform-kiosk" "eform-gateway")
    
    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service"; then
            systemctl stop "$service"
            log_info "Stopped $service"
        fi
    done
    
    # Wait for services to fully stop
    sleep 5
    
    log_success "Services stopped"
}

# Start services after deployment
start_services() {
    log_info "Starting services after deployment..."
    
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
    return 0
}

# Deploy application
deploy_application() {
    local package_file="$1"
    local temp_dir=$(mktemp -d)
    
    log_info "Deploying application..."
    
    # Extract package
    tar -xzf "$package_file" -C "$temp_dir"
    
    # Backup current application
    if [[ -d "$INSTALL_DIR/app" ]]; then
        mv "$INSTALL_DIR/app" "$INSTALL_DIR/app.backup.$(date +%s)"
    fi
    
    if [[ -d "$INSTALL_DIR/shared" ]]; then
        mv "$INSTALL_DIR/shared" "$INSTALL_DIR/shared.backup.$(date +%s)"
    fi
    
    # Deploy new application files
    cp -r "$temp_dir/app" "$INSTALL_DIR/"
    cp -r "$temp_dir/shared" "$INSTALL_DIR/"
    
    # Update package.json
    if [[ -f "$temp_dir/package.json" ]]; then
        cp "$temp_dir/package.json" "$INSTALL_DIR/"
    fi
    
    # Copy migrations if present
    if [[ -d "$temp_dir/migrations" ]]; then
        cp -r "$temp_dir/migrations" "$INSTALL_DIR/"
    fi
    
    # Set ownership
    chown -R eform:eform "$INSTALL_DIR/app" "$INSTALL_DIR/shared"
    
    # Cleanup
    rm -rf "$temp_dir"
    
    log_success "Application files deployed"
}

# Install dependencies and build
build_application() {
    log_info "Installing dependencies and building application..."
    
    cd "$INSTALL_DIR"
    
    # Install dependencies as eform user
    sudo -u eform npm install
    
    # Build application
    sudo -u eform npm run build
    
    log_success "Application built successfully"
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    cd "$INSTALL_DIR"
    
    # Run migrations as eform user
    if sudo -u eform npm run migrate; then
        log_success "Database migrations completed"
    else
        log_error "Database migrations failed"
        return 1
    fi
}

# Health check
health_check() {
    log_info "Performing health check..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f http://localhost:3000/health >/dev/null 2>&1; then
            log_success "Health check passed"
            return 0
        fi
        
        log_info "Health check attempt $attempt/$max_attempts failed, retrying..."
        sleep 2
        ((attempt++))
    done
    
    log_error "Health check failed after $max_attempts attempts"
    return 1
}

# Rollback deployment
rollback_deployment() {
    local backup_file="$1"
    
    log_warning "Rolling back deployment..."
    
    if [[ -z "$backup_file" ]] || [[ ! -f "$backup_file" ]]; then
        log_error "No valid backup file for rollback"
        return 1
    fi
    
    # Stop services
    stop_services
    
    # Restore from backup
    log_info "Restoring from backup: $(basename "$backup_file")"
    "$INSTALL_DIR/scripts/restore.sh" restore "$backup_file" --no-confirm
    
    log_success "Rollback completed"
}

# Deploy with rollback capability
deploy_with_rollback() {
    local package_file="$1"
    
    # Verify package
    if ! verify_package "$package_file"; then
        exit 1
    fi
    
    # Get current version
    local current_version=$(get_current_version)
    log_info "Current version: $current_version"
    
    # Create pre-deployment backup
    local backup_file=$(create_pre_deployment_backup)
    
    # Stop services
    stop_services
    
    # Deploy application
    if ! deploy_application "$package_file"; then
        log_error "Application deployment failed"
        rollback_deployment "$backup_file"
        exit 1
    fi
    
    # Build application
    if ! build_application; then
        log_error "Application build failed"
        rollback_deployment "$backup_file"
        exit 1
    fi
    
    # Run migrations
    if ! run_migrations; then
        log_error "Database migrations failed"
        rollback_deployment "$backup_file"
        exit 1
    fi
    
    # Start services
    if ! start_services; then
        log_error "Failed to start services"
        rollback_deployment "$backup_file"
        exit 1
    fi
    
    # Health check
    if ! health_check; then
        log_error "Health check failed"
        rollback_deployment "$backup_file"
        exit 1
    fi
    
    # Get new version
    local new_version=$(get_current_version)
    log_success "Deployment completed successfully!"
    log_info "Version: $current_version -> $new_version"
    log_info "Backup saved: $(basename "$backup_file")"
}

# Show deployment status
show_status() {
    echo "=============================================="
    echo "  Eform Deployment Status"
    echo "=============================================="
    echo
    
    # Version information
    local version=$(get_current_version)
    echo "Current Version: $version"
    echo
    
    # Service status
    echo "Service Status:"
    local services=("eform-gateway" "eform-kiosk" "eform-panel" "eform-agent")
    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service"; then
            echo "  $service: Running"
        else
            echo "  $service: Stopped"
        fi
    done
    echo
    
    # Health check
    echo "Health Check:"
    if curl -f http://localhost:3000/health >/dev/null 2>&1; then
        echo "  Gateway: Healthy"
    else
        echo "  Gateway: Unhealthy"
    fi
    
    if curl -f http://localhost:3001/health >/dev/null 2>&1; then
        echo "  Kiosk: Healthy"
    else
        echo "  Kiosk: Unhealthy"
    fi
    
    if curl -f http://localhost:3002/health >/dev/null 2>&1; then
        echo "  Panel: Healthy"
    else
        echo "  Panel: Unhealthy"
    fi
    echo
    
    # Recent backups
    echo "Recent Backups:"
    if [[ -d "$BACKUP_DIR" ]]; then
        find "$BACKUP_DIR" -name "*.tar.gz" -mtime -7 -printf '%T@ %p\n' | sort -rn | head -5 | while read timestamp filepath; do
            local date=$(date -d "@$timestamp" "+%Y-%m-%d %H:%M")
            local size=$(du -h "$filepath" | cut -f1)
            echo "  $(basename "$filepath") - $date ($size)"
        done
    else
        echo "  No backups found"
    fi
}

# Usage information
usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo
    echo "Commands:"
    echo "  deploy <package_file>    Deploy application from package"
    echo "  rollback <backup_file>   Rollback to previous backup"
    echo "  status                   Show deployment status"
    echo "  help                     Show this help"
    echo
    echo "Examples:"
    echo "  $0 deploy /path/to/eform-v1.1.0.tar.gz"
    echo "  $0 rollback /opt/eform/backups/pre_deploy_20231201_120000.tar.gz"
    echo "  $0 status"
}

# Main script logic
main() {
    local command="${1:-status}"
    
    case "$command" in
        "deploy")
            if [[ -z "$2" ]]; then
                log_error "Package file path required"
                usage
                exit 1
            fi
            check_root
            deploy_with_rollback "$2"
            ;;
        "rollback")
            if [[ -z "$2" ]]; then
                log_error "Backup file path required"
                usage
                exit 1
            fi
            check_root
            rollback_deployment "$2"
            ;;
        "status")
            show_status
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