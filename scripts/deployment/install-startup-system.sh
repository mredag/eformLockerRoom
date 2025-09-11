#!/bin/bash
set -Eeuo pipefail

echo "🚀 Installing eForm Locker startup system..."
echo "====================================================="

# Ensure the script is run as root
if [ "$(id -u)" -ne 0 ]; then
  echo "❌ This script must be run as root. Please use sudo."
  exit 1
fi

# Define paths
PROJECT_DIR="/home/pi/eform-locker"
SCRIPTS_SRC_DIR="$PROJECT_DIR/scripts"
SCRIPTS_DEST_DIR="/home/pi/eform-locker/scripts/deployment"
SYSTEMD_SRC_DIR="$PROJECT_DIR/scripts/systemd"
SYSTEMD_DEST_DIR="/etc/systemd/system"

# 1. Copy systemd service files
echo "⚙️  Installing systemd service files..."
cp "$SYSTEMD_SRC_DIR/eform-hardware-init.service" "$SYSTEMD_DEST_DIR/"
cp "$SYSTEMD_SRC_DIR/eform-locker.service" "$SYSTEMD_DEST_DIR/"
cp "$SYSTEMD_SRC_DIR/eform-monitor.service" "$SYSTEMD_DEST_DIR/"

# 2. Set permissions for service files
chmod 644 "$SYSTEMD_DEST_DIR/eform-hardware-init.service"
chmod 644 "$SYSTEMD_DEST_DIR/eform-locker.service"
chmod 644 "$SYSTEMD_DEST_DIR/eform-monitor.service"

# 3. Copy helper scripts
echo "📜 Copying helper scripts..."
# No need to copy, they are already in the project directory.

# 4. Set permissions for helper scripts
echo "🔐 Setting permissions for helper scripts..."
chmod +x "$SCRIPTS_DEST_DIR/startup-services-systemd.sh"
chmod +x "$SCRIPTS_DEST_DIR/stop-services-systemd.sh"
chmod +x "$SCRIPTS_DEST_DIR/restart-services-systemd.sh"
chmod +x "$SCRIPTS_DEST_DIR/hardware-init.sh"
chmod +x "$SCRIPTS_DEST_DIR/system-monitor.sh"
chmod +x "$SCRIPTS_DEST_DIR/health-check.sh"

# 5. Reload systemd daemon
echo "🔄 Reloading systemd daemon..."
systemctl daemon-reload

# 6. Enable services to start on boot
echo "🔌 Enabling services to start on boot..."
systemctl enable eform-hardware-init.service
systemctl enable eform-locker.service
systemctl enable eform-monitor.service

echo "====================================================="
echo "✅ Installation complete!"
echo "   The eForm Locker services will now start automatically on boot."
echo "   To start the services immediately, run: sudo systemctl start eform-locker.service"
echo "   To check the status, run: sudo systemctl status eform-locker.service"
