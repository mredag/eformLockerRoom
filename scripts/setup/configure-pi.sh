#!/bin/bash
set -Eeuo pipefail

echo "🚀 Full Raspberry Pi Setup for eForm Locker"
echo "==============================================="

# Ensure the script is run as root
if [ "$(id -u)" -ne 0 ]; then
  echo "❌ This script must be run as root. Please use sudo."
  exit 1
fi

echo "⚙️  Disabling unnecessary services..."

# List of services to disable
SERVICES_TO_DISABLE=(
    "bluetooth.service"
    "cups.service"
    "avahi-daemon.service"
)

for service in "${SERVICES_TO_DISABLE[@]}"; do
    if systemctl is-active --quiet "$service"; then
        echo "   - Stopping and disabling $service..."
        systemctl stop "$service"
        systemctl disable "$service"
    else
        echo "   - Service $service is already inactive."
    fi
done

echo "✅ Unnecessary services disabled."
echo ""

echo "🌐 Configuring static IP address..."

# Get the active network interface
INTERFACE=$(ip route | grep '^default' | awk '{print $5}' | head -n1)
if [ -z "$INTERFACE" ]; then
    echo "⚠️  Could not determine active network interface. Skipping static IP configuration."
else
    # Get current IP and gateway
    CURRENT_IP=$(ip addr show "$INTERFACE" | grep "inet\b" | awk '{print $2}')
    GATEWAY_IP=$(ip route | grep '^default' | awk '{print $3}')

    if [ -z "$CURRENT_IP" ] || [ -z "$GATEWAY_IP" ]; then
        echo "⚠️  Could not determine current IP or gateway. Skipping static IP configuration."
    else
        echo "   - Active interface: $INTERFACE"
        echo "   - Current IP: $CURRENT_IP"
        echo "   - Gateway: $GATEWAY_IP"

        # Backup the existing config file
        cp /etc/dhcpcd.conf /etc/dhcpcd.conf.bak
        echo "   - Backed up /etc/dhcpcd.conf to /etc/dhcpcd.conf.bak"

        # Append the static IP configuration
        {
            echo ""
            echo "# Static IP configuration for eForm Locker"
            echo "interface $INTERFACE"
            echo "static ip_address=$CURRENT_IP"
            echo "static routers=$GATEWAY_IP"
            echo "static domain_name_servers=8.8.8.8 8.8.4.4" # Google DNS as a fallback
        } >> /etc/dhcpcd.conf

        echo "✅ Static IP configured successfully."
    fi
fi
echo ""

echo "📦 Installing eForm Locker application services..."

# Get the directory of the current script to find the other script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
INSTALLER_PATH="$SCRIPT_DIR/../deployment/install-startup-system.sh"

if [ -f "$INSTALLER_PATH" ]; then
    bash "$INSTALLER_PATH"
else
    echo "❌ Error: Application installer script not found at $INSTALLER_PATH"
    exit 1
fi

echo "✅ Application services installed."
echo ""

echo "✅ Raspberry Pi setup is complete!"
echo "   A reboot is recommended to apply all changes."
echo "   sudo reboot"
