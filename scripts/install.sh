#!/bin/bash

# Eform Locker System Installation Script
# This script installs and configures the Eform Locker System on Linux systems

set -e

# Trap errors and provide cleanup
trap 'handle_error $? $LINENO' ERR

# Error handler
handle_error() {
    local exit_code=$1
    local line_number=$2
    log_error "Installation failed at line $line_number with exit code $exit_code"
    log_info "You can try running the script again or check the logs for more details"
    exit $exit_code
}

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
    
    # Check OS - Support more Linux distributions
    if [[ -f /etc/os-release ]]; then
        if ! grep -q "Ubuntu\|Debian\|Raspbian" /etc/os-release; then
            log_warning "This installer is designed for Ubuntu/Debian/Raspbian systems"
            log_info "Attempting to continue on $(grep PRETTY_NAME /etc/os-release | cut -d'"' -f2)"
        fi
    else
        log_warning "Cannot detect OS version, continuing anyway"
    fi
    
    # Check architecture - Support more architectures
    local arch=$(uname -m)
    case "$arch" in
        x86_64|amd64)
            log_info "Architecture: $arch (x86_64 - supported)"
            ;;
        aarch64|arm64)
            log_info "Architecture: $arch (ARM64 - supported)"
            ;;
        armv7l|armv6l|armhf)
            log_info "Architecture: $arch (ARM - supported)"
            ;;
        *)
            log_warning "Architecture: $arch (untested but attempting to continue)"
            ;;
    esac
    
    # Check for required commands
    local missing_commands=()
    for cmd in curl wget node npm systemctl; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing_commands+=("$cmd")
        fi
    done
    
    if [[ ${#missing_commands[@]} -gt 0 ]]; then
        log_info "Missing commands will be installed: ${missing_commands[*]}"
    fi
    
    log_success "System requirements check completed"
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
    
    # Check if Node.js 20 is already installed
    if command -v node >/dev/null 2>&1; then
        local current_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ "$current_version" == "20" ]]; then
            log_info "Node.js 20 is already installed: $(node --version)"
            return 0
        else
            log_info "Found Node.js $(node --version), upgrading to v20..."
        fi
    fi
    
    # Install Node.js 20 via NodeSource repository
    log_info "Adding NodeSource repository..."
    if curl -fsSL https://deb.nodesource.com/setup_20.x | bash -; then
        log_info "NodeSource repository added successfully"
    else
        log_error "Failed to add NodeSource repository"
        exit 1
    fi
    
    log_info "Installing Node.js..."
    if apt-get install -y nodejs; then
        # Verify installation
        local node_version=$(node --version)
        local npm_version=$(npm --version)
        log_success "Node.js $node_version and npm $npm_version installed"
    else
        log_error "Failed to install Node.js"
        exit 1
    fi
}

# Create system user and directories
create_user_and_directories() {
    log_info "Creating system user and directories..."
    
    # Create system group first
    if ! getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
        groupadd --system "$SERVICE_GROUP"
        log_info "Created system group: $SERVICE_GROUP"
    fi
    
    # Create system user
    if ! id "$SERVICE_USER" &>/dev/null; then
        useradd --system --home-dir "$INSTALL_DIR" --shell /bin/false --gid "$SERVICE_GROUP" "$SERVICE_USER"
        log_success "Created system user: $SERVICE_USER"
    else
        log_info "System user $SERVICE_USER already exists"
        # Ensure user is in correct group
        usermod -g "$SERVICE_GROUP" "$SERVICE_USER" 2>/dev/null || true
    fi
    
    # Create directories with proper structure
    log_info "Creating directory structure..."
    mkdir -p "$INSTALL_DIR"/{app,config,data,logs,backups,scripts}
    mkdir -p "$LOG_DIR"
    mkdir -p "$BACKUP_DIR"
    
    # Create data subdirectories
    mkdir -p "$DATA_DIR"
    mkdir -p "$CONFIG_DIR"
    
    # Set ownership and permissions
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR"
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$LOG_DIR"
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$BACKUP_DIR"
    
    # Set secure permissions
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
    
    # Verify we're in the correct directory
    if [[ ! -f "package.json" ]]; then
        log_error "package.json not found. Please run this script from the project root directory."
        exit 1
    fi
    
    # Copy core application files
    local required_dirs=("app" "shared" "migrations")
    for dir in "${required_dirs[@]}"; do
        if [[ -d "$dir/" ]]; then
            cp -r "$dir/" "$INSTALL_DIR/"
            log_info "Copied $dir/ directory"
        else
            log_error "Required directory $dir/ not found"
            exit 1
        fi
    done
    
    # Copy optional directories
    local optional_dirs=("static" "assets" "public")
    for dir in "${optional_dirs[@]}"; do
        if [[ -d "$dir/" ]]; then
            cp -r "$dir/" "$INSTALL_DIR/"
            log_info "Copied optional $dir/ directory"
        fi
    done
    
    # Copy package files
    cp package*.json "$INSTALL_DIR/"
    log_info "Copied package files"
    
    # Copy other important files
    local optional_files=("README.md" "LICENSE" ".env.example")
    for file in "${optional_files[@]}"; do
        if [[ -f "$file" ]]; then
            cp "$file" "$INSTALL_DIR/"
        fi
    done
    
    # Copy scripts
    if [[ -d "scripts/" ]]; then
        cp -r scripts/ "$INSTALL_DIR/"
        log_info "Copied scripts directory"
    fi
    
    # Copy configuration
    if [[ -f "config/system.json" ]]; then
        if [[ ! -f "$CONFIG_DIR/system.json" ]]; then
            cp config/system.json "$CONFIG_DIR/"
            log_info "Copied default configuration"
        else
            log_warning "Configuration file exists, skipping copy"
        fi
    else
        log_warning "No default configuration found at config/system.json"
    fi
    
    # Set ownership
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR"
    
    log_success "Application files installed"
}

# Install Node.js dependencies and build
build_application() {
    log_info "Installing Node.js dependencies and building application..."
    
    cd "$INSTALL_DIR"
    
    # Check if package.json exists
    if [[ ! -f "package.json" ]]; then
        log_error "package.json not found in $INSTALL_DIR"
        exit 1
    fi
    
    # Install dependencies as eform user
    log_info "Installing npm dependencies..."
    if sudo -u "$SERVICE_USER" npm install --production; then
        log_success "Dependencies installed successfully"
    else
        log_error "Failed to install dependencies"
        exit 1
    fi
    
    # Check if build script exists
    if grep -q '"build"' package.json; then
        log_info "Building application..."
        if sudo -u "$SERVICE_USER" npm run build; then
            log_success "Application built successfully"
        else
            log_warning "Build failed, but continuing (may not be required)"
        fi
    else
        log_info "No build script found, skipping build step"
    fi
}

# Install systemd service files
install_services() {
    log_info "Installing systemd service files..."
    
    # Check if systemd service files exist
    if [[ -d "$INSTALL_DIR/scripts/systemd" ]]; then
        local service_files=("$INSTALL_DIR"/scripts/systemd/*.service)
        if [[ -f "${service_files[0]}" ]]; then
            # Copy service files
            cp "$INSTALL_DIR"/scripts/systemd/*.service /etc/systemd/system/
            log_info "Copied systemd service files"
            
            # Reload systemd
            systemctl daemon-reload
            
            # Enable services (only if they exist)
            local services=("eform-gateway" "eform-kiosk" "eform-panel" "eform-agent")
            for service in "${services[@]}"; do
                if [[ -f "/etc/systemd/system/${service}.service" ]]; then
                    systemctl enable "${service}.service"
                    log_info "Enabled ${service}.service"
                else
                    log_warning "Service file ${service}.service not found, skipping"
                fi
            done
            
            log_success "Systemd services installed and enabled"
        else
            log_warning "No systemd service files found in scripts/systemd/"
        fi
    else
        log_warning "No systemd directory found, skipping service installation"
    fi
}

# Setup database
setup_database() {
    log_info "Setting up database..."
    
    cd "$INSTALL_DIR"
    
    # Check if migrate script exists
    if grep -q '"migrate"' package.json; then
        log_info "Running database migrations..."
        if sudo -u "$SERVICE_USER" npm run migrate; then
            log_success "Database initialized"
        else
            log_warning "Database migration failed, but continuing"
        fi
    elif [[ -f "scripts/migrate.ts" ]]; then
        log_info "Running TypeScript migration script..."
        if sudo -u "$SERVICE_USER" npx tsx scripts/migrate.ts; then
            log_success "Database initialized"
        else
            log_warning "Database migration failed, but continuing"
        fi
    else
        log_info "No migration script found, skipping database setup"
    fi
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
    
    # Check if backup script exists
    if [[ -f "$INSTALL_DIR/scripts/backup.sh" ]]; then
        # Make backup script executable
        chmod +x "$INSTALL_DIR/scripts/backup.sh"
        
        # Create cron job
        cat > /etc/cron.d/eform-backup << 'EOF'
# Eform Locker System Backup
# Runs daily at 2:00 AM
0 2 * * * eform /opt/eform/scripts/backup.sh >/dev/null 2>&1
EOF
        
        log_success "Automated backup configured"
    else
        log_info "No backup script found, skipping backup configuration"
    fi
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
    
    # Start services in dependency order
    local services=("eform-gateway" "eform-agent" "eform-kiosk" "eform-panel")
    local started_services=()
    
    for service in "${services[@]}"; do
        if [[ -f "/etc/systemd/system/${service}.service" ]]; then
            if systemctl start "${service}.service"; then
                started_services+=("$service")
                log_info "Started ${service}.service"
                
                # Wait a bit between services
                if [[ "$service" == "eform-gateway" ]]; then
                    log_info "Waiting for gateway to initialize..."
                    sleep 5
                else
                    sleep 2
                fi
            else
                log_warning "Failed to start ${service}.service"
            fi
        else
            log_info "Service ${service}.service not found, skipping"
        fi
    done
    
    if [[ ${#started_services[@]} -gt 0 ]]; then
        log_success "Started services: ${started_services[*]}"
    else
        log_warning "No services were started"
    fi
}

# Verify installation
verify_installation() {
    log_info "Verifying installation..."
    
    local verification_passed=true
    
    # Check service status
    local services=("eform-gateway" "eform-kiosk" "eform-panel" "eform-agent")
    local running_services=0
    
    for service in "${services[@]}"; do
        if [[ -f "/etc/systemd/system/${service}.service" ]]; then
            if systemctl is-active --quiet "$service"; then
                log_success "$service is running"
                ((running_services++))
            else
                log_warning "$service is not running"
                # Show brief status without failing
                systemctl status "$service" --no-pager --lines=3 2>/dev/null || true
            fi
        else
            log_info "$service service not installed"
        fi
    done
    
    # Check database (if it exists)
    if [[ -f "$DATA_DIR/eform.db" ]]; then
        if sudo -u "$SERVICE_USER" sqlite3 "$DATA_DIR/eform.db" "SELECT 1;" >/dev/null 2>&1; then
            log_success "Database is accessible"
        else
            log_warning "Database exists but is not accessible"
        fi
    else
        log_info "Database not found (may be created on first run)"
    fi
    
    # Check ports (use ss if available, fallback to netstat)
    local port_cmd=""
    if command -v ss >/dev/null 2>&1; then
        port_cmd="ss -tuln"
    elif command -v netstat >/dev/null 2>&1; then
        port_cmd="netstat -tuln"
    fi
    
    if [[ -n "$port_cmd" ]]; then
        if $port_cmd | grep -q ":3000 "; then
            log_success "Gateway service listening on port 3000"
        else
            log_info "Gateway service not yet listening on port 3000 (may still be starting)"
        fi
        
        if $port_cmd | grep -q ":3002 "; then
            log_success "Panel service listening on port 3002"
        else
            log_info "Panel service not yet listening on port 3002 (may still be starting)"
        fi
    else
        log_info "Cannot check port status (ss/netstat not available)"
    fi
    
    # Check file permissions
    if [[ -d "$INSTALL_DIR" ]] && [[ -O "$INSTALL_DIR" ]] || [[ $(stat -c %U "$INSTALL_DIR" 2>/dev/null) == "$SERVICE_USER" ]]; then
        log_success "File permissions are correct"
    else
        log_warning "File permissions may need adjustment"
    fi
    
    log_info "Verification completed ($running_services services running)"
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

# Pre-flight checks
preflight_checks() {
    log_info "Running pre-flight checks..."
    
    # Check if we're in the right directory
    if [[ ! -f "package.json" ]]; then
        log_error "package.json not found. Please run this script from the project root directory."
        log_info "Current directory: $(pwd)"
        log_info "Expected files: package.json, app/, shared/, migrations/"
        exit 1
    fi
    
    # Check available disk space (need at least 1GB)
    local available_space=$(df . | awk 'NR==2 {print $4}')
    if [[ $available_space -lt 1048576 ]]; then  # 1GB in KB
        log_warning "Low disk space detected. Installation may fail."
        log_info "Available: $(df -h . | awk 'NR==2 {print $4}'), Recommended: 1GB+"
    fi
    
    # Check internet connectivity
    if ! curl -s --max-time 10 https://registry.npmjs.org >/dev/null 2>&1; then
        log_warning "Cannot reach npm registry. Installation may fail without internet access."
    fi
    
    log_success "Pre-flight checks completed"
}

# Main installation function
main() {
    echo "=============================================="
    echo "  Eform Locker System Installer"
    echo "=============================================="
    echo "  Version: $(grep '"version"' package.json 2>/dev/null | cut -d'"' -f4 || echo 'unknown')"
    echo "  Date: $(date)"
    echo "  System: $(uname -s) $(uname -m)"
    echo "=============================================="
    echo
    
    # Run installation steps
    preflight_checks
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
    log_info "Check the summary above for next steps and service URLs"
}

# Run main function
main "$@"