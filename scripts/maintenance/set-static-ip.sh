#!/bin/bash

set -e

# --- Configuration ---
# The network configuration file to modify
DHCPCD_CONF="/etc/dhcpcd.conf"

# --- Functions ---

# Function to print usage information
usage() {
    echo "Usage: $0 <static_ip_address>"
    echo "Example: $0 192.168.1.100"
    exit 1
}

# Function to validate an IP address format
validate_ip() {
    local ip=$1
    if [[ $ip =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        return 0 # Success
    else
        return 1 # Failure
    fi
}

# --- Main Script ---

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Error: This script must be run as root."
  exit 1
fi

# Check for correct number of arguments
if [ "$#" -ne 1 ]; then
    usage
fi

STATIC_IP=$1

# Validate the provided IP address
if ! validate_ip "$STATIC_IP"; then
    echo "Error: Invalid IP address format."
    usage
fi

echo "Attempting to set static IP to $STATIC_IP..."

# Check if IP is already in use
echo "Checking if IP address $STATIC_IP is already in use..."
if ping -c 1 -W 1 "$STATIC_IP" > /dev/null; then
    echo "Error: IP address $STATIC_IP is already in use on the network."
    exit 1
fi
echo "IP address $STATIC_IP appears to be available."
# Detect network interface, gateway, and subnet
echo "Detecting network configuration..."
INTERFACE=$(ip route | grep default | awk '{print $5}')
if [ -z "$INTERFACE" ]; then
    echo "Error: Could not detect active network interface."
    exit 1
fi
echo "Detected active interface: $INTERFACE"

GATEWAY_IP=$(ip route | grep default | awk '{print $3}')
if [ -z "$GATEWAY_IP" ]; then
    echo "Error: Could not detect gateway IP."
    exit 1
fi
echo "Detected gateway IP: $GATEWAY_IP"

# Get the IP and CIDR for the interface
IP_CIDR=$(ip addr show "$INTERFACE" | grep "inet " | awk '{print $2}')
if [ -z "$IP_CIDR" ]; then
    echo "Error: Could not detect IP and CIDR for interface $INTERFACE."
    exit 1
fi
SUBNET_CIDR=$(echo "$IP_CIDR" | cut -d'/' -f2)
echo "Detected subnet CIDR: /$SUBNET_CIDR"
# Backup /etc/dhcpcd.conf
echo "Backing up $DHCPCD_CONF to $DHCPCD_CONF.bak..."
cp "$DHCPCD_CONF" "$DHCPCD_CONF.bak"

# Append new configuration to /etc/dhcpcd.conf
echo "Appending new static IP configuration to $DHCPCD_CONF..."
cat << EOF >> "$DHCPCD_CONF"

# Static IP configuration added by set-static-ip.sh on $(date)
interface $INTERFACE
static ip_address=$STATIC_IP/$SUBNET_CIDR
static routers=$GATEWAY_IP
static domain_name_servers=8.8.8.8 8.8.4.4
EOF

# Inform user about restart/reboot
echo "Static IP configuration applied successfully."
echo "Please restart the dhcpcd service or reboot the system for the changes to take effect."
echo "To restart the service, run: sudo systemctl restart dhcpcd"
