#!/bin/bash

# eForm Locker Health Check Script
# Comprehensive system health monitoring

echo "🏥 eForm Locker Health Check"
echo "============================"
echo "Timestamp: $(date)"
echo "Hostname: $(hostname)"
echo "IP Address: $(hostname -I | awk '{print $1}')"
echo ""

# Color functions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
    fi
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# System Health
echo "🖥️  System Health"
echo "=================="

# CPU Usage
cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | awk -F'%' '{print $1}')
if (( $(echo "$cpu_usage < 80" | bc -l) )); then
    print_status 0 "CPU Usage: ${cpu_usage}%"
else
    print_status 1 "CPU Usage: ${cpu_usage}% (HIGH)"
fi

# Memory Usage
mem_info=$(free | grep Mem)
mem_total=$(echo $mem_info | awk '{print $2}')
mem_used=$(echo $mem_info | awk '{print $3}')
mem_percent=$(echo "scale=1; $mem_used * 100 / $mem_total" | bc)
if (( $(echo "$mem_percent < 85" | bc -l) )); then
    print_status 0 "Memory Usage: ${mem_percent}%"
else
    print_status 1 "Memory Usage: ${mem_percent}% (HIGH)"
fi

# Disk Usage
disk_usage=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $disk_usage -lt 85 ]; then
    print_status 0 "Disk Usage: ${disk_usage}%"
else
    print_status 1 "Disk Usage: ${disk_usage}% (HIGH)"
fi

# Temperature (Pi specific)
if [ -f /sys/class/thermal/thermal_zone0/temp ]; then
    temp=$(cat /sys/class/thermal/thermal_zone0/temp)
    temp_c=$((temp/1000))
    if [ $temp_c -lt 70 ]; then
        print_status 0 "CPU Temperature: ${temp_c}°C"
    elif [ $temp_c -lt 80 ]; then
        print_warning "CPU Temperature: ${temp_c}°C (Warm)"
    else
        print_status 1 "CPU Temperature: ${temp_c}°C (HOT)"
    fi
fi

echo ""

# Network Health
echo "🌐 Network Health"
echo "=================="

# Network Interface
interface=$(ip route | grep default | awk '{print $5}' | head -1)
ip_addr=$(ip addr show $interface | grep "inet " | awk '{print $2}' | cut -d/ -f1)
print_status 0 "Network Interface: $interface ($ip_addr)"

# Gateway connectivity
gateway=$(ip route | grep default | awk '{print $3}' | head -1)
if ping -c 1 -W 2 $gateway > /dev/null 2>&1; then
    print_status 0 "Gateway connectivity: $gateway"
else
    print_status 1 "Gateway connectivity: $gateway"
fi

# Internet connectivity
if ping -c 1 -W 3 8.8.8.8 > /dev/null 2>&1; then
    print_status 0 "Internet connectivity"
else
    print_status 1 "Internet connectivity"
fi

# DNS resolution
if nslookup google.com > /dev/null 2>&1; then
    print_status 0 "DNS resolution"
else
    print_status 1 "DNS resolution"
fi

echo ""

# Service Health
echo "🔧 Service Health"
echo "=================="

# Check if systemd service exists and is running
if systemctl list-unit-files | grep -q "eform-locker.service"; then
    if systemctl is-active --quiet eform-locker; then
        print_status 0 "eForm Locker Service: Running"
    else
        print_status 1 "eForm Locker Service: Stopped"
    fi
    
    if systemctl is-enabled --quiet eform-locker; then
        print_status 0 "eForm Locker Service: Enabled"
    else
        print_status 1 "eForm Locker Service: Disabled"
    fi
else
    print_warning "eForm Locker Service: Not installed"
fi

# Check individual processes
processes=("node" "npm")
for proc in "${processes[@]}"; do
    if pgrep -f "$proc" > /dev/null; then
        count=$(pgrep -f "$proc" | wc -l)
        print_status 0 "$proc processes: $count running"
    else
        print_status 1 "$proc processes: None running"
    fi
done

echo ""

# Application Health
echo "🚀 Application Health"
echo "====================="

# Check if eForm directories exist
if [ -d "/home/pi/eform-locker" ]; then
    print_status 0 "eForm directory exists"
    
    # Check key files
    key_files=("package.json" "app/gateway/src/index.ts" "app/kiosk/src/index.ts" "app/panel/src/index.ts")
    for file in "${key_files[@]}"; do
        if [ -f "/home/pi/eform-locker/$file" ]; then
            print_status 0 "Key file: $file"
        else
            print_status 1 "Missing file: $file"
        fi
    done
else
    print_status 1 "eForm directory missing"
fi

# Check database
if [ -f "/home/pi/eform-locker/database.db" ]; then
    db_size=$(du -h /home/pi/eform-locker/database.db | cut -f1)
    print_status 0 "Database exists: $db_size"
else
    print_status 1 "Database missing"
fi

# Check log files
if [ -d "/home/pi/eform-locker/logs" ]; then
    log_count=$(ls -1 /home/pi/eform-locker/logs/*.log 2>/dev/null | wc -l)
    if [ $log_count -gt 0 ]; then
        print_status 0 "Log files: $log_count found"
    else
        print_warning "Log files: None found"
    fi
else
    print_warning "Log directory missing"
fi

echo ""

# Port Health
echo "🔌 Port Health"
echo "=============="

# Check if ports are listening
ports=(3000 3001 3002)
for port in "${ports[@]}"; do
    if netstat -tuln | grep -q ":$port "; then
        print_status 0 "Port $port: Listening"
    else
        print_status 1 "Port $port: Not listening"
    fi
done

echo ""

# Hardware Health (Pi specific)
echo "🔩 Hardware Health"
echo "=================="

# Check GPIO access
if [ -d "/sys/class/gpio" ]; then
    print_status 0 "GPIO interface available"
else
    print_status 1 "GPIO interface missing"
fi

# Check I2C
if [ -c "/dev/i2c-1" ]; then
    print_status 0 "I2C interface available"
else
    print_warning "I2C interface not available"
fi

# Check SPI
if [ -c "/dev/spidev0.0" ]; then
    print_status 0 "SPI interface available"
else
    print_warning "SPI interface not available"
fi

# Check USB devices
usb_count=$(lsusb | wc -l)
print_info "USB devices connected: $usb_count"

echo ""

# Recent Errors
echo "🚨 Recent Errors"
echo "================"

# Check system logs for errors in last hour
error_count=$(journalctl --since "1 hour ago" --priority=err | wc -l)
if [ $error_count -eq 0 ]; then
    print_status 0 "No system errors in last hour"
else
    print_warning "$error_count system errors in last hour"
    echo "Recent errors:"
    journalctl --since "1 hour ago" --priority=err --no-pager | tail -5
fi

# Check eForm logs for errors
if [ -d "/home/pi/eform-locker/logs" ]; then
    recent_errors=$(find /home/pi/eform-locker/logs -name "*.log" -mtime -1 -exec grep -i "error\|exception\|failed" {} \; 2>/dev/null | wc -l)
    if [ $recent_errors -eq 0 ]; then
        print_status 0 "No application errors in recent logs"
    else
        print_warning "$recent_errors application errors in recent logs"
    fi
fi

echo ""

# Performance Metrics
echo "📊 Performance Metrics"
echo "======================"

# Load average
load_avg=$(uptime | awk -F'load average:' '{print $2}')
print_info "Load average:$load_avg"

# Uptime
uptime_info=$(uptime -p)
print_info "System uptime: $uptime_info"

# Process count
process_count=$(ps aux | wc -l)
print_info "Running processes: $process_count"

# Network connections
connection_count=$(netstat -an | grep ESTABLISHED | wc -l)
print_info "Active connections: $connection_count"

echo ""

# Quick Service Test
echo "🧪 Quick Service Test"
echo "===================="

# Test local API endpoints
if command -v curl > /dev/null; then
    # Test Gateway API
    if curl -s --connect-timeout 5 http://localhost:3000/health > /dev/null; then
        print_status 0 "Gateway API responding"
    else
        print_status 1 "Gateway API not responding"
    fi
    
    # Test Admin Panel
    if curl -s --connect-timeout 5 http://localhost:3001 > /dev/null; then
        print_status 0 "Admin Panel responding"
    else
        print_status 1 "Admin Panel not responding"
    fi
    
    # Test Kiosk UI
    if curl -s --connect-timeout 5 http://localhost:3002 > /dev/null; then
        print_status 0 "Kiosk UI responding"
    else
        print_status 1 "Kiosk UI not responding"
    fi
else
    print_warning "curl not available for service testing"
fi

echo ""
echo "🏁 Health Check Complete"
echo "========================"
echo "Timestamp: $(date)"

# Return appropriate exit code
# You can customize this logic based on critical vs non-critical issues
exit 0