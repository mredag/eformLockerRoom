#!/bin/bash

# eForm Locker Network Setup Script
# Handles IP address conflicts and multi-Pi deployments

set -e

# Configuration
DEFAULT_IP="192.168.1.8"
NETWORK_BASE="192.168.1"
IP_RANGE_START=10
IP_RANGE_END=50
PROJECT_DIR="/home/pi/eform-locker"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1${NC}"
}

# Function to check if IP is available
check_ip_available() {
    local ip=$1
    local timeout=3
    
    # Ping test
    if ping -c 1 -W $timeout "$ip" > /dev/null 2>&1; then
        return 1  # IP is in use
    fi
    
    # ARP check
    if arp -n "$ip" > /dev/null 2>&1; then
        return 1  # IP is in ARP table
    fi
    
    return 0  # IP is available
}

# Function to find available IP
find_available_ip() {
    local base_ip=$1
    local location_id=$2
    
    # Try location-specific IPs first
    case "$location_id" in
        "mens"|"men"|"1")
            suggested_ips=("${NETWORK_BASE}.10" "${NETWORK_BASE}.11" "${NETWORK_BASE}.12")
            ;;
        "womens"|"women"|"2")
            suggested_ips=("${NETWORK_BASE}.20" "${NETWORK_BASE}.21" "${NETWORK_BASE}.22")
            ;;
        "staff"|"admin"|"3")
            suggested_ips=("${NETWORK_BASE}.30" "${NETWORK_BASE}.31" "${NETWORK_BASE}.32")
            ;;
        "vip"|"4")
            suggested_ips=("${NETWORK_BASE}.40" "${NETWORK_BASE}.41" "${NETWORK_BASE}.42")
            ;;
        *)
            suggested_ips=("$base_ip")
            ;;
    esac
    
    # Check suggested IPs first
    for ip in "${suggested_ips[@]}"; do
        log_info "Checking IP: $ip"
        if check_ip_available "$ip"; then
            echo "$ip"
            return 0
        fi
    done
    
    # Scan range for available IP
    log_info "Scanning IP range ${NETWORK_BASE}.${IP_RANGE_START}-${IP_RANGE_END}..."
    for i in $(seq $IP_RANGE_START $IP_RANGE_END); do
        local test_ip="${NETWORK_BASE}.$i"
        if check_ip_available "$test_ip"; then
            echo "$test_ip"
            return 0
        fi
    done
    
    return 1  # No available IP found
}

# Function to configure static IP
configure_static_ip() {
    local new_ip=$1
    local gateway=${2:-"${NETWORK_BASE}.1"}
    local dns1=${3:-"8.8.8.8"}
    local dns2=${4:-"8.8.4.4"}
    
    log_info "Configuring static IP: $new_ip"
    
    # Backup current configuration
    sudo cp /etc/dhcpcd.conf /etc/dhcpcd.conf.backup.$(date +%Y%m%d_%H%M%S)
    
    # Remove existing eForm configuration
    sudo sed -i '/# eForm Locker Static IP Configuration/,/^$/d' /etc/dhcpcd.conf
    
    # Add new configuration
    cat << EOF | sudo tee -a /etc/dhcpcd.conf

# eForm Locker Static IP Configuration
# Generated on $(date)
interface eth0
static ip_address=$new_ip/24
static routers=$gateway
static domain_name_servers=$dns1 $dns2
EOF
    
    log_success "Static IP configured: $new_ip"
}

# Function to update service configuration
update_service_config() {
    local new_ip=$1
    local location_id=$2
    
    log_info "Updating service configuration for IP: $new_ip"
    
    # Update system configuration
    if [ -f "$PROJECT_DIR/config/system.json" ]; then
        # Create backup
        cp "$PROJECT_DIR/config/system.json" "$PROJECT_DIR/config/system.json.backup.$(date +%Y%m%d_%H%M%S)"
        
        # Update IP in config
        sed -i "s/\"host\": \".*\"/\"host\": \"$new_ip\"/" "$PROJECT_DIR/config/system.json"
        sed -i "s/\"ip\": \".*\"/\"ip\": \"$new_ip\"/" "$PROJECT_DIR/config/system.json"
        
        # Update location if provided
        if [ -n "$location_id" ]; then
            sed -i "s/\"location\": \".*\"/\"location\": \"$location_id\"/" "$PROJECT_DIR/config/system.json"
        fi
    fi
    
    # Update Pi management scripts
    if [ -f "$PROJECT_DIR/scripts/deployment/pi-manager.ps1" ]; then
        sed -i "s/192\.168\.1\.[0-9]\+/$new_ip/g" "$PROJECT_DIR/scripts/deployment/pi-manager.ps1"
    fi
    
    # Update documentation
    find "$PROJECT_DIR/docs" -name "*.md" -type f -exec sed -i "s/192\.168\.1\.8/$new_ip/g" {} \;
    
    log_success "Service configuration updated"
}

# Function to create location-specific hostname
set_hostname() {
    local location_id=$1
    local current_hostname=$(hostname)
    
    case "$location_id" in
        "mens"|"men"|"1")
            new_hostname="pi-eform-mens"
            ;;
        "womens"|"women"|"2")
            new_hostname="pi-eform-womens"
            ;;
        "staff"|"admin"|"3")
            new_hostname="pi-eform-staff"
            ;;
        "vip"|"4")
            new_hostname="pi-eform-vip"
            ;;
        *)
            new_hostname="pi-eform-locker"
            ;;
    esac
    
    if [ "$current_hostname" != "$new_hostname" ]; then
        log_info "Setting hostname to: $new_hostname"
        
        # Update hostname
        echo "$new_hostname" | sudo tee /etc/hostname
        
        # Update hosts file
        sudo sed -i "s/127.0.1.1.*/127.0.1.1\t$new_hostname/" /etc/hosts
        
        log_success "Hostname set to: $new_hostname"
        log_warning "Reboot required for hostname change to take effect"
    fi
}

# Main setup function
main() {
    local location_id=${1:-""}
    local force_ip=${2:-""}
    
    log_info "🌐 eForm Locker Network Setup Starting..."
    echo "Location ID: ${location_id:-"default"}"
    echo "Force IP: ${force_ip:-"auto-detect"}"
    echo ""
    
    # Check if running as root
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
    
    # Get current IP
    current_ip=$(hostname -I | awk '{print $1}')
    log_info "Current IP: $current_ip"
    
    # Determine target IP
    if [ -n "$force_ip" ]; then
        target_ip="$force_ip"
        log_info "Using forced IP: $target_ip"
    else
        # Check if default IP is available
        if check_ip_available "$DEFAULT_IP"; then
            target_ip="$DEFAULT_IP"
            log_success "Default IP $DEFAULT_IP is available"
        else
            log_warning "Default IP $DEFAULT_IP is in use, finding alternative..."
            target_ip=$(find_available_ip "$DEFAULT_IP" "$location_id")
            
            if [ $? -eq 0 ]; then
                log_success "Found available IP: $target_ip"
            else
                log_error "No available IP found in range"
                exit 1
            fi
        fi
    fi
    
    # Configure network if IP needs to change
    if [ "$current_ip" != "$target_ip" ]; then
        log_info "Configuring network for IP change: $current_ip → $target_ip"
        
        # Configure static IP
        configure_static_ip "$target_ip"
        
        # Update service configuration
        update_service_config "$target_ip" "$location_id"
        
        log_warning "Network configuration changed. Reboot required!"
        echo ""
        echo "After reboot, access the system at:"
        echo "  Admin Panel:   http://$target_ip:3001"
        echo "  Kiosk UI:      http://$target_ip:3002"
        echo "  Gateway API:   http://$target_ip:3000"
        echo "  SSH:           ssh pi@$target_ip"
    else
        log_success "Current IP $current_ip is correct, no changes needed"
        
        # Still update service config for location
        if [ -n "$location_id" ]; then
            update_service_config "$target_ip" "$location_id"
        fi
    fi
    
    # Set hostname based on location
    if [ -n "$location_id" ]; then
        set_hostname "$location_id"
    fi
    
    # Create network info file
    cat > "$PROJECT_DIR/.network-config" << EOF
# eForm Locker Network Configuration
# Generated on $(date)
IP_ADDRESS=$target_ip
LOCATION=${location_id:-"default"}
HOSTNAME=$(hostname)
GATEWAY=${NETWORK_BASE}.1
DNS_PRIMARY=8.8.8.8
DNS_SECONDARY=8.8.4.4

# Access URLs
ADMIN_PANEL=http://$target_ip:3001
KIOSK_UI=http://$target_ip:3002
GATEWAY_API=http://$target_ip:3000
SSH_ACCESS=ssh pi@$target_ip
EOF
    
    chown pi:pi "$PROJECT_DIR/.network-config"
    
    log_success "🎉 Network setup completed!"
    echo ""
    echo "📋 Configuration Summary:"
    echo "========================"
    echo "IP Address: $target_ip"
    echo "Location: ${location_id:-"default"}"
    echo "Hostname: $(hostname)"
    echo ""
    echo "🌐 Access URLs:"
    echo "Admin Panel:   http://$target_ip:3001"
    echo "Kiosk UI:      http://$target_ip:3002"
    echo "Gateway API:   http://$target_ip:3000"
    echo "SSH:           ssh pi@$target_ip"
    echo ""
    
    if [ "$current_ip" != "$target_ip" ]; then
        echo "⚠️  IMPORTANT: Reboot required for network changes!"
        echo "   sudo reboot"
    fi
}

# Show usage if no parameters
if [ $# -eq 0 ]; then
    echo "eForm Locker Network Setup"
    echo "=========================="
    echo ""
    echo "Usage: sudo $0 [location] [force_ip]"
    echo ""
    echo "Locations:"
    echo "  mens, men, 1     - Men's locker room (192.168.1.10-12)"
    echo "  womens, women, 2 - Women's locker room (192.168.1.20-22)"
    echo "  staff, admin, 3  - Staff area (192.168.1.30-32)"
    echo "  vip, 4           - VIP area (192.168.1.40-42)"
    echo ""
    echo "Examples:"
    echo "  sudo $0 mens                    # Setup for men's room"
    echo "  sudo $0 womens                  # Setup for women's room"
    echo "  sudo $0 staff 192.168.1.35      # Force specific IP"
    echo ""
    exit 0
fi

# Run main function with parameters
main "$1" "$2"