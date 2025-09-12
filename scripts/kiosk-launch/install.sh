#!/bin/bash

set -e

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit
fi

echo "Installing kiosk launcher..."

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Install dependencies
echo "Installing dependencies..."
apt-get update
apt-get install -y python3-pip chromium-browser unclutter avahi-daemon libnss-mdns procps
pip3 install -r "$SCRIPT_DIR/requirements.txt"

# Enable Avahi daemon
echo "Enabling Avahi daemon..."
systemctl enable avahi-daemon
systemctl start avahi-daemon

# Create cache directory
echo "Creating cache directory..."
install -d -o pi -g pi /var/cache

# Create offline screen directory
echo "Setting up offline screen..."
mkdir -p /usr/share/kiosk-offline
cp "$SCRIPT_DIR/offline-screen/index.html" /usr/share/kiosk-offline/

# Copy config file if it doesn't exist
if [ ! -f /etc/kiosk.conf ]; then
    echo "Creating default kiosk.conf..."
    cp "$SCRIPT_DIR/kiosk.conf.example" /etc/kiosk.conf
fi

# Install systemd service
echo "Installing systemd service..."
# Note: The service file has a hardcoded path. This installer assumes the script is run from the repo's root.
# A more robust solution would replace a placeholder in the service file.
# For now, we will assume the path is correct.
cp "$SCRIPT_DIR/kiosk-launch.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable kiosk-launch.service
systemctl start kiosk-launch.service

echo "Kiosk launcher installed successfully."
echo "Please edit /etc/kiosk.conf to set the correct ZONE."
