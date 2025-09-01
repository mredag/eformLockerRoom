#!/bin/bash

# Raspberry Pi Model Auto-Configuration Script
# Automatically detects Pi model and applies optimal configuration

set -e

echo "🔍 Detecting Raspberry Pi model..."

# Detect Pi model
PI_MODEL=$(cat /proc/cpuinfo | grep Model | cut -d':' -f2 | xargs)
MEMORY_MB=$(free -m | awk 'NR==2{print $2}')
CPU_CORES=$(nproc)

echo "Detected: $PI_MODEL"
echo "Memory: ${MEMORY_MB}MB"
echo "CPU Cores: $CPU_CORES"

# Determine Pi generation
if [[ "$PI_MODEL" == *"Pi 4"* ]]; then
    PI_TYPE="pi4"
    echo "✅ Pi 4 detected - High performance configuration"
elif [[ "$PI_MODEL" == *"Pi 3 Model B Plus"* ]]; then
    PI_TYPE="pi3plus"
    echo "✅ Pi 3B+ detected - Optimized configuration"
elif [[ "$PI_MODEL" == *"Pi 3"* ]]; then
    PI_TYPE="pi3"
    echo "✅ Pi 3B detected - Minimal configuration"
else
    echo "⚠️  Unknown Pi model, using Pi 3B configuration as fallback"
    PI_TYPE="pi3"
fi

# Create configuration based on Pi model
create_config() {
    local pi_type=$1
    local config_file="/etc/kiosk-config.json"
    
    case $pi_type in
        "pi4")
            cat > "$config_file" << 'EOF'
{
  "performance": {
    "maxMemoryUsage": "400MB",
    "enableGPUAcceleration": true,
    "animationLevel": "full",
    "updateInterval": 100
  },
  "display": {
    "resolution": "1920x1080",
    "touchOptimization": true,
    "highDPI": true
  },
  "hardware": {
    "serialPort": "/dev/ttyUSB0",
    "baudRate": 9600,
    "timeout": 1000
  }
}
EOF
            ;;
        "pi3plus")
            cat > "$config_file" << 'EOF'
{
  "performance": {
    "maxMemoryUsage": "200MB",
    "enableGPUAcceleration": false,
    "animationLevel": "minimal",
    "updateInterval": 200
  },
  "display": {
    "resolution": "1024x768",
    "touchOptimization": true,
    "highDPI": false
  },
  "hardware": {
    "serialPort": "/dev/ttyUSB0",
    "baudRate": 9600,
    "timeout": 2000
  }
}
EOF
            ;;
        "pi3")
            cat > "$config_file" << 'EOF'
{
  "performance": {
    "maxMemoryUsage": "150MB",
    "enableGPUAcceleration": false,
    "animationLevel": "none",
    "updateInterval": 500
  },
  "display": {
    "resolution": "1024x768",
    "touchOptimization": true,
    "highDPI": false
  },
  "hardware": {
    "serialPort": "/dev/ttyUSB0",
    "baudRate": 9600,
    "timeout": 3000
  }
}
EOF
            ;;
    esac
    
    echo "✅ Configuration file created: $config_file"
}

# Set environment variables
set_environment() {
    local pi_type=$1
    
    # Remove existing kiosk environment variables
    sed -i '/^export KIOSK_/d' ~/.bashrc
    
    # Add new environment variables
    echo "" >> ~/.bashrc
    echo "# Kiosk UI Configuration" >> ~/.bashrc
    echo "export KIOSK_PI_MODEL=\"$pi_type\"" >> ~/.bashrc
    
    case $pi_type in
        "pi4")
            echo "export KIOSK_MEMORY_LIMIT=\"400\"" >> ~/.bashrc
            echo "export KIOSK_GPU_ACCELERATION=\"true\"" >> ~/.bashrc
            echo "export KIOSK_ANIMATION_LEVEL=\"full\"" >> ~/.bashrc
            ;;
        "pi3plus")
            echo "export KIOSK_MEMORY_LIMIT=\"200\"" >> ~/.bashrc
            echo "export KIOSK_GPU_ACCELERATION=\"false\"" >> ~/.bashrc
            echo "export KIOSK_ANIMATION_LEVEL=\"minimal\"" >> ~/.bashrc
            ;;
        "pi3")
            echo "export KIOSK_MEMORY_LIMIT=\"150\"" >> ~/.bashrc
            echo "export KIOSK_GPU_ACCELERATION=\"false\"" >> ~/.bashrc
            echo "export KIOSK_ANIMATION_LEVEL=\"none\"" >> ~/.bashrc
            echo "export KIOSK_MINIMAL_MODE=\"true\"" >> ~/.bashrc
            ;;
    esac
    
    echo "✅ Environment variables configured"
}

# Optimize system settings
optimize_system() {
    local pi_type=$1
    
    echo "⚙️  Optimizing system settings for $pi_type..."
    
    # Common optimizations for all Pi models
    
    # Disable unnecessary services
    sudo systemctl disable bluetooth 2>/dev/null || true
    sudo systemctl disable cups 2>/dev/null || true
    sudo systemctl disable avahi-daemon 2>/dev/null || true
    
    # Optimize boot configuration
    sudo cp /boot/config.txt /boot/config.txt.backup
    
    # Add performance optimizations to config.txt
    if ! grep -q "# Kiosk optimizations" /boot/config.txt; then
        sudo tee -a /boot/config.txt << 'EOF'

# Kiosk optimizations
disable_camera=1
disable_splash=1
boot_delay=0
EOF
    fi
    
    # Model-specific optimizations
    case $pi_type in
        "pi4")
            # Pi 4 can handle more features
            if ! grep -q "gpu_mem=128" /boot/config.txt; then
                echo "gpu_mem=128" | sudo tee -a /boot/config.txt
            fi
            ;;
        "pi3plus"|"pi3")
            # Pi 3 needs more aggressive optimization
            if ! grep -q "gpu_mem=64" /boot/config.txt; then
                echo "gpu_mem=64" | sudo tee -a /boot/config.txt
            fi
            if ! grep -q "dtoverlay=disable-bt" /boot/config.txt; then
                echo "dtoverlay=disable-bt" | sudo tee -a /boot/config.txt
            fi
            ;;
    esac
    
    # Optimize cmdline.txt for memory management
    sudo cp /boot/cmdline.txt /boot/cmdline.txt.backup
    
    if ! grep -q "cgroup_memory=1" /boot/cmdline.txt; then
        sudo sed -i 's/$/ cgroup_memory=1 cgroup_enable=memory/' /boot/cmdline.txt
    fi
    
    echo "✅ System optimizations applied"
}

# Create systemd service
create_service() {
    local pi_type=$1
    
    echo "📋 Creating systemd service..."
    
    sudo tee /etc/systemd/system/kiosk-ui.service << EOF
[Unit]
Description=Kiosk UI Service
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/eform-locker
ExecStart=/usr/bin/npm run start:kiosk
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=KIOSK_PI_MODEL=$pi_type

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    sudo systemctl enable kiosk-ui.service
    
    echo "✅ Systemd service created and enabled"
}

# Main configuration process
main() {
    echo "🚀 Starting Pi model configuration..."
    
    # Check if running as root
    if [ "$EUID" -eq 0 ]; then
        echo "❌ Please run this script as pi user, not root"
        exit 1
    fi
    
    # Check if in correct directory
    if [ ! -f "package.json" ]; then
        echo "❌ Please run this script from the project root directory"
        exit 1
    fi
    
    # Create configuration
    sudo mkdir -p /etc
    create_config "$PI_TYPE"
    
    # Set environment variables
    set_environment "$PI_TYPE"
    
    # Optimize system
    optimize_system "$PI_TYPE"
    
    # Create systemd service
    create_service "$PI_TYPE"
    
    echo ""
    echo "🎉 Configuration completed successfully!"
    echo ""
    echo "Pi Model: $PI_TYPE"
    echo "Configuration: /etc/kiosk-config.json"
    echo "Service: kiosk-ui.service"
    echo ""
    echo "Next steps:"
    echo "1. Reboot the system: sudo reboot"
    echo "2. After reboot, start the service: sudo systemctl start kiosk-ui.service"
    echo "3. Check status: sudo systemctl status kiosk-ui.service"
    echo "4. Access kiosk: http://$(hostname -I | awk '{print $1}'):3002"
    echo ""
    echo "⚠️  A reboot is recommended to apply all optimizations"
}

# Handle command line arguments
case "${1:-auto}" in
    "auto")
        main
        ;;
    "pi4")
        PI_TYPE="pi4"
        main
        ;;
    "pi3plus")
        PI_TYPE="pi3plus"
        main
        ;;
    "pi3")
        PI_TYPE="pi3"
        main
        ;;
    *)
        echo "Usage: $0 [auto|pi4|pi3plus|pi3]"
        echo "  auto    - Auto-detect Pi model (default)"
        echo "  pi4     - Force Pi 4 configuration"
        echo "  pi3plus - Force Pi 3B+ configuration"
        echo "  pi3     - Force Pi 3B configuration"
        exit 1
        ;;
esac