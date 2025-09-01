# Automated Deployment Scripts

This directory contains automated deployment scripts for the eForm Locker System that handle the complete deployment workflow: commit changes, push to Git, pull to Raspberry Pi, and restart services.

## Scripts Overview

### 1. Full Deployment Scripts

#### `auto-deploy.ps1` (PowerShell)
Comprehensive deployment script with full validation and testing.

**Features:**
- Pre-deployment checks (Git status, branch validation)
- Automatic commit message generation
- SSH connection testing
- Service health validation
- Post-deployment testing
- Detailed logging and error handling

**Usage:**
```powershell
# Basic deployment
.\scripts\deployment\auto-deploy.ps1

# With custom commit message
.\scripts\deployment\auto-deploy.ps1 -Message "feat: add new feature"

# Skip post-deployment tests
.\scripts\deployment\auto-deploy.ps1 -SkipTests

# Force deployment even if no changes
.\scripts\deployment\auto-deploy.ps1 -Force

# Show help
.\scripts\deployment\auto-deploy.ps1 -h
```

#### `auto-deploy.sh` (Bash)
Linux/macOS version with identical functionality.

**Usage:**
```bash
# Basic deployment
./scripts/deployment/auto-deploy.sh

# With custom commit message
./scripts/deployment/auto-deploy.sh -m "feat: add new feature"

# Skip tests
./scripts/deployment/auto-deploy.sh --skip-tests

# Force deployment
./scripts/deployment/auto-deploy.sh --force

# Show help
./scripts/deployment/auto-deploy.sh --help
```

### 2. Quick Deployment Scripts

#### `quick-deploy.ps1` (PowerShell)
Simplified deployment for rapid iterations.

**Usage:**
```powershell
# Quick deployment with default message
.\scripts\deployment\quick-deploy.ps1

# With custom message
.\scripts\deployment\quick-deploy.ps1 "fix: update UI"
```

#### `quick-deploy.sh` (Bash)
Linux/macOS version of quick deployment.

**Usage:**
```bash
# Quick deployment with default message
./scripts/deployment/quick-deploy.sh

# With custom message
./scripts/deployment/quick-deploy.sh "fix: update UI"
```

## Deployment Workflow

All scripts follow this workflow:

1. **Pre-checks** (full scripts only)
   - Verify Git repository
   - Check current branch
   - Validate uncommitted changes

2. **Local Git Operations**
   - `git add .` - Stage all changes
   - `git commit -m "message"` - Commit with message
   - `git push origin main` - Push to remote

3. **Remote Deployment**
   - Test SSH connection
   - `git pull origin main` - Pull changes on Pi
   - `./scripts/start-all-clean.sh` - Restart services

4. **Post-deployment Validation** (full scripts only)
   - Health check all services
   - Test API endpoints
   - Validate layout service

## Configuration

Scripts are configured for the standard eForm Locker setup:

```bash
PI_HOST="pi@pi-eform-locker"
PI_PROJECT_PATH="/home/pi/eform-locker"
BRANCH="main"
```

### Service Endpoints Tested:
- **Gateway**: http://192.168.1.8:3000/health
- **Panel**: http://192.168.1.8:3001/health
- **Kiosk**: http://192.168.1.8:3002/health

## Prerequisites

### SSH Setup
Ensure passwordless SSH access to the Raspberry Pi:

```bash
# Generate SSH key (if not exists)
ssh-keygen -t rsa -b 4096

# Copy public key to Pi
ssh-copy-id pi@pi-eform-locker

# Test connection
ssh pi@pi-eform-locker "echo 'SSH working'"
```

### Git Configuration
Ensure Git is properly configured:

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

## Usage Examples

### Development Workflow
```powershell
# Make code changes...
# Test locally...

# Deploy with descriptive message
.\scripts\deployment\auto-deploy.ps1 -Message "feat(ui): improve locker display layout"
```

### Quick Iterations
```powershell
# Make small changes...

# Quick deploy
.\scripts\deployment\quick-deploy.ps1 "fix: minor UI adjustment"
```

### Emergency Deployment
```powershell
# Force deployment even if no changes detected
.\scripts\deployment\auto-deploy.ps1 -Force -Message "hotfix: emergency fix"
```

## Error Handling

### Common Issues and Solutions

#### SSH Connection Failed
```bash
# Test SSH manually
ssh pi@pi-eform-locker

# Check SSH key
ssh-add -l

# Re-add SSH key if needed
ssh-add ~/.ssh/id_rsa
```

#### Git Push Failed
```bash
# Check remote status
git remote -v

# Pull latest changes first
git pull origin main

# Resolve conflicts and retry
```

#### Service Restart Failed
```bash
# Check Pi manually
ssh pi@pi-eform-locker
cd /home/pi/eform-locker

# Check service status
ps aux | grep node

# Manual restart
./scripts/start-all-clean.sh
```

## Monitoring and Logs

### View Deployment Logs
Scripts provide colored output with timestamps and status indicators:
- 🚀 Blue: Process steps
- ✅ Green: Success messages
- ⚠️ Yellow: Warnings
- ❌ Red: Errors

### Monitor Pi Services
```bash
# SSH to Pi and monitor logs
ssh pi@pi-eform-locker
cd /home/pi/eform-locker
tail -f logs/*.log
```

### Health Check URLs
After deployment, verify services:
- Admin Panel: http://192.168.1.8:3001
- Kiosk UI: http://192.168.1.8:3002
- Gateway API: http://192.168.1.8:3000
- Hardware Config: http://192.168.1.8:3001/hardware-config

## Integration with Development Workflow

### VS Code Integration
Add to VS Code tasks.json:
```json
{
    "label": "Deploy to Pi",
    "type": "shell",
    "command": "./scripts/deployment/auto-deploy.ps1",
    "args": ["-Message", "${input:commitMessage}"],
    "group": "build",
    "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "new"
    }
}
```

### Git Hooks Integration
Add to `.git/hooks/post-commit`:
```bash
#!/bin/bash
# Auto-deploy after commit (optional)
# ./scripts/deployment/quick-deploy.sh "$(git log -1 --pretty=%B)"
```

## Best Practices

1. **Use Full Scripts for Major Changes**
   - New features
   - Bug fixes
   - Configuration changes

2. **Use Quick Scripts for Minor Updates**
   - UI tweaks
   - Documentation updates
   - Small fixes

3. **Always Test After Deployment**
   - Check service health
   - Verify functionality
   - Monitor logs for errors

4. **Use Descriptive Commit Messages**
   - Follow conventional commit format
   - Include scope and description
   - Reference issue numbers if applicable

## Troubleshooting

### Script Permissions
```bash
# Make scripts executable
chmod +x scripts/deployment/*.sh
chmod +x scripts/deployment/*.ps1
```

### PowerShell Execution Policy
```powershell
# Allow script execution (Windows)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Network Issues
```bash
# Test Pi connectivity
ping 192.168.1.8

# Test SSH port
telnet 192.168.1.8 22
```

For additional support, check the main project documentation or contact the development team.
---


## 🚀 Raspberry Pi Startup System

### **Complete Installation**
```bash
# Install everything (run as root on Pi)
sudo bash scripts/deployment/install-startup-system.sh
```

### **Individual Components**

#### **Systemd Services**
```bash
# Install systemd services
sudo bash scripts/deployment/pi-startup-system.sh
sudo systemctl daemon-reload
sudo systemctl enable eform-locker eform-hardware-init eform-monitor
```

#### **Boot Optimizations**
```bash
# Optimize Pi boot configuration
sudo bash scripts/deployment/pi-boot-setup.sh
sudo reboot
```

#### **Service Management**
```bash
# Start services
bash scripts/deployment/startup-services.sh

# Stop services
bash scripts/deployment/stop-services.sh

# Restart services
bash scripts/deployment/restart-services.sh

# Health check
bash scripts/deployment/health-check.sh
```

## 📋 Startup System Scripts

### **New Startup System Scripts**
- `install-startup-system.sh` - **Complete installation script**
- `pi-startup-system.sh` - Install systemd services
- `pi-boot-setup.sh` - Optimize Pi boot configuration
- `startup-services.sh` - Start all eForm services
- `stop-services.sh` - Stop all services gracefully
- `restart-services.sh` - Restart all services
- `hardware-init.sh` - Initialize hardware on boot
- `system-monitor.sh` - Continuous system monitoring
- `health-check.sh` - Quick health verification

## 🎯 Quick Start for New Pi Setup

### **Complete Pi Setup**
```bash
# 1. Clone project to Pi
git clone <repository> /home/pi/eform-locker
cd /home/pi/eform-locker

# 2. Install startup system
sudo bash scripts/deployment/install-startup-system.sh

# 3. Reboot
sudo reboot

# 4. Check status
eform-status
```

### **Service Management Commands**
```bash
# Check status
sudo systemctl status eform-locker
eform-status

# Control services
sudo systemctl start/stop/restart eform-locker

# View logs
eform-logs
sudo journalctl -u eform-locker -f

# Health check
eform-health
```

## 🔧 Startup System Configuration

### **Systemd Services**
- `eform-locker.service` - Main application service
- `eform-hardware-init.service` - Hardware initialization
- `eform-monitor.service` - System monitoring

### **Monitoring Features**
- Health checks every 5 minutes
- Service auto-restart on failure
- Resource monitoring (CPU, memory, temperature)
- Log rotation and cleanup
- Hardware connectivity checks

### **Quick Commands (Available after installation)**
```bash
eform-status    # Status dashboard
eform-health    # Health check
eform-logs      # View all logs
eform-start     # Start services
eform-stop      # Stop services
eform-restart   # Restart services
```

## 📊 Status and Monitoring Files

### **Status Files**
```bash
/home/pi/eform-locker/.startup-success      # Startup completion
/home/pi/eform-locker/.system-status        # Current system status
/home/pi/eform-locker/.system-alerts        # System alerts
/home/pi/eform-locker/.hardware-init-status # Hardware status
```

### **Log Files**
```bash
/home/pi/eform-locker/logs/gateway.log       # Gateway service
/home/pi/eform-locker/logs/kiosk.log         # Kiosk service
/home/pi/eform-locker/logs/panel.log         # Panel service
/home/pi/eform-locker/logs/system-monitor.log # System monitor
/home/pi/eform-locker/logs/health-check.log  # Health checks
```

## 📚 Additional Documentation

- **Complete Startup Guide**: `docs/raspberry-pi-startup-system.md`
- **Troubleshooting**: `docs/kiosk-troubleshooting-guide.md`
- **Performance**: `docs/raspberry-pi-performance-optimizations.md`

---

**For complete Pi startup system installation, run:** `sudo bash scripts/deployment/install-startup-system.sh`