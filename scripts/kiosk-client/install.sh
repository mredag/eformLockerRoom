#!/bin/bash
# =============================================================================
# Portable Kiosk Installer
# Comprehensive touchscreen kiosk setup for Raspberry Pi
# =============================================================================
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check root
if [[ ${EUID} -ne 0 ]]; then
    log_error "This installer must be run as root (sudo)."
    exit 1
fi

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/portable-kiosk"
KIOSK_USER="${KIOSK_USER:-pi}"
SERVICE_NAME="portable-kiosk.service"
CONFIG_DIR="/var/lib/portable-kiosk"
LOG_DIR="/var/log/portable-kiosk"

log_info "=========================================="
log_info "Portable Kiosk Installer"
log_info "=========================================="
log_info "Install directory: ${INSTALL_DIR}"
log_info "Kiosk user: ${KIOSK_USER}"
log_info "Config directory: ${CONFIG_DIR}"

# =============================================================================
# System Package Installation
# =============================================================================
log_info "Installing system packages..."

APT_PACKAGES=(
    # Python
    python3
    python3-venv
    python3-pip
    
    # Browser
    chromium-browser
    
    # Display server and window management
    xserver-xorg
    xserver-xorg-video-fbdev
    xinit
    x11-xserver-utils
    matchbox-window-manager
    
    # Touch and input
    libinput-bin
    libinput-tools
    xdotool
    xinput
    
    # Virtual keyboard
    qml-module-qtquick-virtualkeyboard
    
    # Screen utilities
    unclutter
    
    # Fonts
    fonts-dejavu
    fonts-liberation
    fonts-noto
    
    # USB utilities
    usbutils
    usb-modeswitch
    
    # Network utilities
    iputils-ping
    curl
    
    # System utilities
    rsync
    procps
)

apt-get update
apt-get install -y "${APT_PACKAGES[@]}" || {
    log_warn "Some packages may not be available, continuing..."
}

log_success "System packages installed"

# =============================================================================
# USB Reset Tool Installation
# =============================================================================
log_info "Installing USB reset tool..."

# Compile usbreset if not available
if ! command -v usbreset &> /dev/null; then
    cat > /tmp/usbreset.c << 'EOF'
#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <sys/ioctl.h>
#include <linux/usbdevice_fs.h>

int main(int argc, char **argv) {
    const char *filename;
    int fd;
    int rc;

    if (argc != 2) {
        fprintf(stderr, "Usage: usbreset device-filename\n");
        return 1;
    }
    filename = argv[1];

    fd = open(filename, O_WRONLY);
    if (fd < 0) {
        perror("Error opening output file");
        return 1;
    }

    printf("Resetting USB device %s\n", filename);
    rc = ioctl(fd, USBDEVFS_RESET, 0);
    if (rc < 0) {
        perror("Error in ioctl");
        return 1;
    }
    printf("Reset successful\n");

    close(fd);
    return 0;
}
EOF
    
    if command -v gcc &> /dev/null; then
        gcc -o /usr/local/bin/usbreset /tmp/usbreset.c
        chmod +x /usr/local/bin/usbreset
        log_success "USB reset tool compiled and installed"
    else
        log_warn "GCC not available, USB reset tool not installed"
    fi
    rm -f /tmp/usbreset.c
else
    log_success "USB reset tool already available"
fi

# =============================================================================
# Raspberry Pi Optimization
# =============================================================================
optimize_raspberry_pi() {
    log_info "Checking for Raspberry Pi optimizations..."
    
    local is_pi=false
    local is_pi5=false
    
    if [[ -r /proc/device-tree/model ]]; then
        local model=$(cat /proc/device-tree/model)
        if [[ "$model" == *"Raspberry Pi"* ]]; then
            is_pi=true
            log_info "Detected: $model"
            if [[ "$model" == *"Raspberry Pi 5"* ]]; then
                is_pi5=true
            fi
        fi
    fi
    
    if [[ "$is_pi" != "true" ]]; then
        log_info "Not a Raspberry Pi, skipping Pi-specific optimizations"
        return
    fi
    
    # Find config file
    local config_file=""
    if [[ -f /boot/firmware/config.txt ]]; then
        config_file="/boot/firmware/config.txt"
    elif [[ -f /boot/config.txt ]]; then
        config_file="/boot/config.txt"
    fi
    
    if [[ -z "$config_file" ]]; then
        log_warn "Could not find boot config file"
        return
    fi
    
    log_info "Updating $config_file..."
    
    # Backup config
    cp "$config_file" "${config_file}.backup.$(date +%Y%m%d%H%M%S)"
    
    # GPU memory
    if grep -qE "^[#[:space:]]*gpu_mem=" "$config_file"; then
        sed -i -E "s/^[#[:space:]]*gpu_mem=.*/gpu_mem=256/" "$config_file"
    else
        echo "gpu_mem=256" >> "$config_file"
    fi
    
    # KMS driver for better graphics
    if grep -qE "^[#[:space:]]*dtoverlay=vc4-kms-v3d" "$config_file"; then
        sed -i -E "s/^[#[:space:]]*dtoverlay=vc4-kms-v3d.*/dtoverlay=vc4-kms-v3d/" "$config_file"
    else
        echo "dtoverlay=vc4-kms-v3d" >> "$config_file"
    fi
    
    # Disable overscan
    if ! grep -q "disable_overscan=1" "$config_file"; then
        echo "disable_overscan=1" >> "$config_file"
    fi
    
    # Add kiosk-specific settings if not present
    if ! grep -q "# Portable Kiosk Settings" "$config_file"; then
        cat >> "$config_file" << 'EOF'

# Portable Kiosk Settings
# Disable splash screen for faster boot
disable_splash=1
# Disable rainbow screen
avoid_warnings=1
EOF
    fi
    
    # Increase GPU memory split for Pi 5
    if [[ "$is_pi5" == "true" ]]; then
        log_info "Applying Raspberry Pi 5 specific optimizations"
        if command -v raspi-config &> /dev/null; then
            raspi-config nonint do_memory_split 256 2>/dev/null || true
        fi
    fi
    
    log_success "Raspberry Pi optimizations applied"
}

optimize_raspberry_pi

# =============================================================================
# Touch Screen Configuration
# =============================================================================
configure_touchscreen() {
    log_info "Configuring touchscreen support..."
    
    # Create udev rules for touchscreen
    cat > /etc/udev/rules.d/99-touchscreen.rules << 'EOF'
# Touchscreen permissions
SUBSYSTEM=="input", KERNEL=="event*", ATTRS{name}=="*[Tt]ouch*", MODE="0666"
SUBSYSTEM=="input", KERNEL=="event*", ATTRS{name}=="*[Ff]inger*", MODE="0666"
SUBSYSTEM=="input", KERNEL=="event*", ATTRS{name}=="*[Dd]igitizer*", MODE="0666"

# USB HID devices
SUBSYSTEM=="usb", ATTR{idVendor}=="*", ATTR{idProduct}=="*", MODE="0666"
EOF
    
    # Create libinput configuration for touch
    mkdir -p /etc/libinput
    cat > /etc/libinput/local-overrides.quirks << 'EOF'
# Touchscreen quirks for kiosk
[Touchscreen Calibration]
MatchUdevType=touchscreen
AttrPressureRange=10:8
EOF
    
    # X11 touchscreen configuration
    mkdir -p /etc/X11/xorg.conf.d
    cat > /etc/X11/xorg.conf.d/40-libinput.conf << 'EOF'
Section "InputClass"
    Identifier "libinput touchscreen catchall"
    MatchIsTouchscreen "on"
    MatchDevicePath "/dev/input/event*"
    Driver "libinput"
    Option "Tapping" "on"
    Option "TappingDrag" "on"
    Option "DisableWhileTyping" "false"
EndSection

Section "InputClass"
    Identifier "libinput pointer catchall"
    MatchIsPointer "on"
    MatchDevicePath "/dev/input/event*"
    Driver "libinput"
EndSection
EOF
    
    # Reload udev rules
    udevadm control --reload-rules
    udevadm trigger
    
    log_success "Touchscreen configuration complete"
}

configure_touchscreen

# =============================================================================
# Disable Unnecessary Services
# =============================================================================
log_info "Disabling unnecessary services..."

SERVICES_TO_DISABLE=(
    bluetooth.service
    hciuart.service
    triggerhappy.service
    avahi-daemon.service
    ModemManager.service
    wpa_supplicant.service  # Only if using ethernet
)

for svc in "${SERVICES_TO_DISABLE[@]}"; do
    if systemctl list-unit-files | grep -Fq "${svc}"; then
        systemctl disable --now "${svc}" 2>/dev/null || true
        log_info "Disabled: ${svc}"
    fi
done

log_success "Unnecessary services disabled"

# =============================================================================
# SSH Configuration
# =============================================================================
configure_ssh() {
    log_info "Configuring SSH..."
    
    local sshd_config="/etc/ssh/sshd_config"
    [[ -f "${sshd_config}" ]] || return
    
    # Backup
    cp "${sshd_config}" "${sshd_config}.backup.$(date +%Y%m%d%H%M%S)"
    
    declare -A options=(
        ["PasswordAuthentication"]="yes"
        ["PubkeyAuthentication"]="no"
        ["UsePAM"]="yes"
        ["PermitRootLogin"]="no"
    )
    
    for key in "${!options[@]}"; do
        local value="${options[${key}]}"
        if grep -qiE "^[#[:space:]]*${key}" "${sshd_config}"; then
            sed -i -E "s/^[#[:space:]]*${key}.*/${key} ${value}/I" "${sshd_config}"
        else
            echo "${key} ${value}" >> "${sshd_config}"
        fi
    done
    
    systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null || true
    log_success "SSH configured"
}

configure_ssh

# =============================================================================
# Auto-login Configuration
# =============================================================================
configure_autologin() {
    log_info "Configuring auto-login for ${KIOSK_USER}..."
    
    # Getty auto-login
    mkdir -p /etc/systemd/system/getty@tty1.service.d
    cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin ${KIOSK_USER} --noclear %I \$TERM
EOF
    
    log_success "Auto-login configured"
}

configure_autologin

# =============================================================================
# X11 Auto-start Configuration
# =============================================================================
configure_x11_autostart() {
    log_info "Configuring X11 auto-start..."
    
    local user_home=$(eval echo ~${KIOSK_USER})
    
    # Create .xinitrc
    cat > "${user_home}/.xinitrc" << 'EOF'
#!/bin/bash
# Kiosk X11 initialization

# Disable screen blanking
xset s off
xset -dpms
xset s noblank

# Hide cursor after 3 seconds of inactivity
unclutter -idle 3 -root &

# Start window manager
matchbox-window-manager -use_titlebar no -use_cursor no &

# Wait for window manager
sleep 2

# The kiosk service will handle launching the browser
# Keep X running
wait
EOF
    
    chmod +x "${user_home}/.xinitrc"
    chown "${KIOSK_USER}:${KIOSK_USER}" "${user_home}/.xinitrc"
    
    # Create .bash_profile to auto-start X
    cat > "${user_home}/.bash_profile" << 'EOF'
# Auto-start X on tty1
if [[ -z $DISPLAY ]] && [[ $(tty) = /dev/tty1 ]]; then
    exec startx -- -nocursor
fi
EOF
    
    chown "${KIOSK_USER}:${KIOSK_USER}" "${user_home}/.bash_profile"
    
    log_success "X11 auto-start configured"
}

configure_x11_autostart

# =============================================================================
# Install Kiosk Application
# =============================================================================
log_info "Installing kiosk application..."

# Create directories
mkdir -p "${INSTALL_DIR}"
mkdir -p "${CONFIG_DIR}"
mkdir -p "${LOG_DIR}"

# Copy files
rsync -a --delete "${SCRIPT_DIR}/" "${INSTALL_DIR}/"

# Create Python virtual environment
log_info "Setting up Python environment..."
python3 -m venv "${INSTALL_DIR}/venv"
"${INSTALL_DIR}/venv/bin/pip" install --upgrade pip wheel

# Install requirements if present
if [[ -f "${INSTALL_DIR}/requirements.txt" ]]; then
    "${INSTALL_DIR}/venv/bin/pip" install -r "${INSTALL_DIR}/requirements.txt"
fi

# Set permissions
chown -R "${KIOSK_USER}:${KIOSK_USER}" "${CONFIG_DIR}" "${INSTALL_DIR}" "${LOG_DIR}"
chmod +x "${INSTALL_DIR}/portable_launcher.py"

log_success "Kiosk application installed"

# =============================================================================
# Systemd Service Installation
# =============================================================================
log_info "Installing systemd service..."

SERVICE_TEMPLATE="${INSTALL_DIR}/portable-kiosk.service.template"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"

sed -e "s#@INSTALL_DIR@#${INSTALL_DIR}#g" \
    -e "s#@KIOSK_USER@#${KIOSK_USER}#g" \
    -e "s#@LOG_DIR@#${LOG_DIR}#g" \
    "${SERVICE_TEMPLATE}" > "${SERVICE_PATH}"

# Create log rotation
cat > /etc/logrotate.d/portable-kiosk << EOF
${LOG_DIR}/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 ${KIOSK_USER} ${KIOSK_USER}
}
EOF

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"

log_success "Systemd service installed"

# =============================================================================
# Sudoers Configuration (for USB reset)
# =============================================================================
log_info "Configuring sudo permissions..."

cat > /etc/sudoers.d/portable-kiosk << EOF
# Allow kiosk user to reset USB and reload modules without password
${KIOSK_USER} ALL=(ALL) NOPASSWD: /sbin/modprobe
${KIOSK_USER} ALL=(ALL) NOPASSWD: /usr/sbin/udevadm
${KIOSK_USER} ALL=(ALL) NOPASSWD: /bin/sh -c echo * > /sys/bus/usb/drivers/usb/*
EOF

chmod 440 /etc/sudoers.d/portable-kiosk

log_success "Sudo permissions configured"

# =============================================================================
# Watchdog Configuration
# =============================================================================
configure_watchdog() {
    log_info "Configuring hardware watchdog..."
    
    # Enable hardware watchdog on Raspberry Pi
    if [[ -r /proc/device-tree/model ]] && grep -q "Raspberry Pi" /proc/device-tree/model; then
        # Install watchdog package
        apt-get install -y watchdog 2>/dev/null || true
        
        # Configure watchdog
        if [[ -f /etc/watchdog.conf ]]; then
            cat > /etc/watchdog.conf << 'EOF'
# Watchdog configuration for kiosk
watchdog-device = /dev/watchdog
watchdog-timeout = 15
max-load-1 = 24
min-memory = 1
EOF
            systemctl enable watchdog 2>/dev/null || true
            log_success "Hardware watchdog configured"
        fi
    fi
}

configure_watchdog

# =============================================================================
# Network Configuration
# =============================================================================
configure_network() {
    log_info "Configuring network settings..."
    
    # Disable IPv6 if not needed (can cause delays)
    if ! grep -q "net.ipv6.conf.all.disable_ipv6" /etc/sysctl.conf; then
        cat >> /etc/sysctl.conf << 'EOF'

# Disable IPv6 for kiosk (optional, reduces boot time)
# net.ipv6.conf.all.disable_ipv6 = 1
# net.ipv6.conf.default.disable_ipv6 = 1
EOF
    fi
    
    # Configure DNS timeout
    if [[ -f /etc/systemd/resolved.conf ]]; then
        sed -i 's/#DNSStubListenerExtra=/DNSStubListenerExtra=/' /etc/systemd/resolved.conf 2>/dev/null || true
    fi
    
    log_success "Network settings configured"
}

configure_network

# =============================================================================
# Final Steps
# =============================================================================
log_info "Performing final setup..."

# Create status check script
cat > "${INSTALL_DIR}/check-status.sh" << 'EOF'
#!/bin/bash
echo "=== Portable Kiosk Status ==="
echo ""
echo "Service Status:"
systemctl status portable-kiosk.service --no-pager -l | head -20
echo ""
echo "Recent Logs:"
journalctl -u portable-kiosk.service -n 20 --no-pager
echo ""
echo "Touch Devices:"
xinput list 2>/dev/null || echo "X not running"
echo ""
echo "USB Devices:"
lsusb | grep -i "touch\|hid\|input" || echo "No touch devices found"
EOF
chmod +x "${INSTALL_DIR}/check-status.sh"

# Create restart script
cat > "${INSTALL_DIR}/restart-kiosk.sh" << 'EOF'
#!/bin/bash
sudo systemctl restart portable-kiosk.service
echo "Kiosk service restarted"
EOF
chmod +x "${INSTALL_DIR}/restart-kiosk.sh"

log_success "Helper scripts created"

# =============================================================================
# Summary
# =============================================================================
echo ""
log_info "=========================================="
log_success "Installation Complete!"
log_info "=========================================="
echo ""
echo "The kiosk launcher service is now installed and enabled."
echo ""
echo "Commands:"
echo "  Start service:    sudo systemctl start ${SERVICE_NAME}"
echo "  Stop service:     sudo systemctl stop ${SERVICE_NAME}"
echo "  View status:      sudo systemctl status ${SERVICE_NAME}"
echo "  View logs:        sudo journalctl -u ${SERVICE_NAME} -f"
echo "  Check status:     ${INSTALL_DIR}/check-status.sh"
echo ""
echo "Configuration:"
echo "  Config file:      ${CONFIG_DIR}/config.json"
echo "  Log directory:    ${LOG_DIR}"
echo ""
echo "On first boot, the kiosk will display a setup page to configure"
echo "the server address and zone."
echo ""
log_warn "A reboot is recommended to apply all changes."
echo ""
read -p "Reboot now? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Rebooting..."
    reboot
fi
