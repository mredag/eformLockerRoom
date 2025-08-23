#!/bin/bash

# Eform Locker System Installation Script
# This script installs and configures the Eform Locker System on Ubuntu/Debian systems

set -e

# Configuration
INSTALL_DIR="/opt/eform"
SERVICE_USER="eform"
SERVICE_GROUP="eform"
DATA_DIR="/opt/eform/data"
CONFIG_DIR="/opt/eform/config"
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

# Check system requirements
check_requirements() {
    log_info "Checking system requirements..."
    
    # Check OS
    if ! grep -q "Ubuntu\|Debian" /etc/os-release; then
        log_error "This installer supports Ubuntu/Debian systems only"
        exit 1
    fi
    
    # Check architecture
    local arch=$(uname -m)
    if [[ "$arch" != "x86_64" ]] && [[ "$arch" != "aarch64" ]] && [[ "$arch" != "armv7l" ]] && [[ "$arch" != "armv6l" ]]; then
        log_error "This installer supports x86_64, aarch64, armv7l, and armv6l architectures only. Current: $arch"
        exit 1
    fi
    
    log_info "Architecture: $arch (supported)"
    
    log_success "System requirements met"
}

# Install system dependencies
install_dependencies() {
    log_info "Installing system dependencies..."
    
    apt-get update
    apt-get install -y \
        curl \
        wget \
        gnupg \
        software-properties-common \
        build-essential \
        python3 \
        python3-pip \
        sqlite3 \
        udev \
        systemd \
        logrotate \
        cron
    
    log_success "System dependencies installed"
}

# Install Node.js 20 LTS
install_nodejs() {
    log_info "Installing Node.js 20 LTS..."
    
    # Add NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    
    # Verify installation
    node_version=$(node --version)
    npm_version=$(npm --version)
    
    log_success "Node.js $node_version and npm $npm_version installed"
}

# Create system user and directories
create_user_and_directories() {
    log_info "Creating system user and directories..."
    
    # Create system user
    if ! id "$SERVICE_USER" &>/dev/null; then
        useradd --system --home-dir "$INSTALL_DIR" --shell /bin/false "$SERVICE_USER"
        log_success "Created system user: $SERVICE_USER"
    else
        log_info "System user $SERVICE_USER already exists"
    fi
    
    # Create directories
    mkdir -p "$INSTALL_DIR"/{app,config,data,logs,backups,static}
    mkdir -p "$LOG_DIR"
    mkdir -p "$BACKUP_DIR"
    
    # Set ownership and permissions
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR"
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$LOG_DIR"
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$BACKUP_DIR"
    
    chmod 755 "$INSTALL_DIR"
    chmod 750 "$DATA_DIR"
    chmod 750 "$CONFIG_DIR"
    chmod 755 "$LOG_DIR"
    chmod 750 "$BACKUP_DIR"
    
    log_success "Created directories and set permissions"
}

# Install application files
install_application() {
    log_info "Installing application files..."
    
    # Copy application files
    cp -r app/ "$INSTALL_DIR/"
    cp -r shared/ "$INSTALL_DIR/"
    cp -r migrations/ "$INSTALL_DIR/"
    
    # Copy static files if they exist
    if [[ -d "static/" ]]; then
        cp -r static/ "$INSTALL_DIR/"
        log_info "Copied static files"
    else
        log_info "No static directory found, skipping"
    fi
    
    cp package*.json "$INSTALL_DIR/"
    
    # Create scripts directory and copy migrate script
    mkdir -p "$INSTALL_DIR/scripts/"
    cp scripts/migrate.ts "$INSTALL_DIR/scripts/"
    
    # Copy configuration
    if [[ ! -f "$CONFIG_DIR/system.json" ]]; then
        cp config/system.json "$CONFIG_DIR/"
        log_info "Copied default configuration"
    else
        log_warning "Configuration file exists, skipping copy"
    fi
    
    # Set ownership
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR"
    
    log_success "Application files installed"
}

# Install Node.js dependencies and build
build_application() {
    log_info "Installing Node.js dependencies and building application..."
    
    cd "$INSTALL_DIR"
    
    # Install dependencies as eform user
    sudo -u "$SERVICE_USER" npm install
    sudo -u "$SERVICE_USER" npm run build
    
    log_success "Application built successfully"
}

# Install systemd service files
install_services() {
    log_info "Installing systemd service files..."
    
    # Copy service files
    cp scripts/systemd/*.service /etc/systemd/system/
    
    # Reload systemd
    systemctl daemon-reload
    
    # Enable services
    systemctl enable eform-gateway.service
    systemctl enable eform-kiosk.service
    systemctl enable eform-panel.service
    systemctl enable eform-agent.service
    
    log_success "Systemd services installed and enabled"
}

# Setup database
setup_database() {
    log_info "Setting up database..."
    
    cd "$INSTALL_DIR"
    
    # Run migrations as eform user
    sudo -u "$SERVICE_USER" npm run migrate
    
    log_success "Database initialized"
}

# Setup udev rules for hardware access
setup_udev_rules() {
    log_info "Setting up udev rules for hardware access..."
    
    # RFID reader access
    cat > /etc/udev/rules.d/99-eform-rfid.rules << 'EOF'
# RFID HID devices
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="ffff", ATTRS{idProduct}=="0035", MODE="0666", GROUP="eform"
SUBSYSTEM=="usb", ATTRS{idVendor}=="ffff", ATTRS{idProduct}=="0035", MODE="0666", GROUP="eform"

# Generic HID devices for RFID
KERNEL=="hidraw*", ATTRS{product}=="*RFID*", MODE="0666", GROUP="eform"
EOF

    # Serial port access for Modbus
    cat > /etc/udev/rules.d/99-eform-serial.rules << 'EOF'
# USB-to-RS485 converters
SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="6001", MODE="0666", GROUP="eform", SYMLINK+="eform-modbus"
SUBSYSTEM=="tty", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="7523", MODE="0666", GROUP="eform", SYMLINK+="eform-modbus"

# Generic USB serial devices
KERNEL=="ttyUSB*", MODE="0666", GROUP="eform"
KERNEL=="ttyACM*", MODE="0666", GROUP="eform"
EOF

    # Add eform user to dialout group for serial access
    usermod -a -G dialout "$SERVICE_USER"
    
    # Reload udev rules
    udevadm control --reload-rules
    udevadm trigger
    
    log_success "Udev rules configured"
}

# Setup log rotation
setup_logrotate() {
    log_info "Setting up log rotation..."
    
    cat > /etc/logrotate.d/eform << 'EOF'
/var/log/eform/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 eform eform
    postrotate
        systemctl reload eform-gateway eform-kiosk eform-panel eform-agent || true
    endscript
}

/opt/eform/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 eform eform
}
EOF

    log_success "Log rotation configured"
}

# Setup backup cron job
setup_backup() {
    log_info "Setting up automated backup..."
    
    cat > /etc/cron.d/eform-backup << 'EOF'
# Eform Locker System Backup
# Runs daily at 2:00 AM
0 2 * * * eform /opt/eform/scripts/backup.sh >/dev/null 2>&1
EOF

    # Make backup script executable
    chmod +x "$INSTALL_DIR/scripts/backup.sh"
    
    log_success "Automated backup configured"
}

# Generate secure secrets
generate_secrets() {
    log_info "Generating secure secrets..."
    
    # Generate random secrets
    PROVISIONING_SECRET=$(openssl rand -hex 32)
    SESSION_SECRET=$(openssl rand -hex 32)
    HMAC_SECRET=$(openssl rand -hex 32)
    
    # Update configuration file
    sed -i "s/change-this-in-production/$PROVISIONING_SECRET/g" "$CONFIG_DIR/system.json"
    sed -i "s/change-this-in-production/$SESSION_SECRET/g" "$CONFIG_DIR/system.json"
    sed -i "s/change-this-in-production/$HMAC_SECRET/g" "$CONFIG_DIR/system.json"
    
    log_success "Secure secrets generated"
}

# Start services
start_services() {
    log_info "Starting services..."
    
    systemctl start eform-gateway.service
    systemctl start eform-agent.service
    
    # Wait for gateway to be ready
    sleep 5
    
    systemctl start eform-kiosk.service
    systemctl start eform-panel.service
    
    log_success "Services started"
}

# Verify installation
verify_installation() {
    log_info "Verifying installation..."
    
    # Check service status
    services=("eform-gateway" "eform-kiosk" "eform-panel" "eform-agent")
    
    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service"; then
            log_success "$service is running"
        else
            log_error "$service is not running"
            systemctl status "$service" --no-pager
        fi
    done
    
    # Check database
    if sudo -u "$SERVICE_USER" sqlite3 "$DATA_DIR/eform.db" "SELECT COUNT(*) FROM lockers;" >/dev/null 2>&1; then
        log_success "Database is accessible"
    else
        log_error "Database is not accessible"
    fi
    
    # Check ports
    if netstat -tuln | grep -q ":3000 "; then
        log_success "Gateway service listening on port 3000"
    else
        log_warning "Gateway service not listening on port 3000"
    fi
    
    if netstat -tuln | grep -q ":3002 "; then
        log_success "Panel service listening on port 3002"
    else
        log_warning "Panel service not listening on port 3002"
    fi
}

# Print installation summary
print_summary() {
    echo
    echo "=============================================="
    echo "  Eform Locker System Installation Complete"
    echo "=============================================="
    echo
    echo "Installation Directory: $INSTALL_DIR"
    echo "Configuration: $CONFIG_DIR/system.json"
    echo "Database: $DATA_DIR/eform.db"
    echo "Logs: $LOG_DIR"
    echo "Backups: $BACKUP_DIR"
    echo
    echo "Services:"
    echo "  - Gateway:  http://localhost:3000"
    echo "  - Panel:    http://localhost:3002"
    echo "  - Kiosk:    http://localhost:3001"
    echo
    echo "Service Management:"
    echo "  systemctl status eform-gateway"
    echo "  systemctl status eform-kiosk"
    echo "  systemctl status eform-panel"
    echo "  systemctl status eform-agent"
    echo
    echo "Next Steps:"
    echo "1. Configure hardware settings in $CONFIG_DIR/system.json"
    echo "2. Access the panel at http://localhost:3002"
    echo "3. Create admin user and configure kiosks"
    echo "4. Test RFID and Modbus hardware connections"
    echo
}

# Main installation function
main() {
    echo "=============================================="
    echo "  Eform Locker System Installer"
    echo "=============================================="
    echo
    
    check_root
    check_requirements
    install_dependencies
    install_nodejs
    create_user_and_directories
    install_application
    build_application
    install_services
    setup_database
    setup_udev_rules
    setup_logrotate
    setup_backup
    generate_secrets
    start_services
    verify_installation
    print_summary
    
    log_success "Installation completed successfully!"
}

# Run main function
main "$@"