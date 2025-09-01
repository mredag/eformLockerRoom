# How to Manage Your eForm Locker Raspberry Pi

This guide shows you exactly how to manage and monitor your eForm Locker system running on the Raspberry Pi from your Windows PC.

## 🎯 Quick Access Methods

### **Method 1: Double-Click Batch Files (Easiest)**

I've created simple batch files you can double-click:

- **`pi-status.bat`** - Shows complete system status
- **`pi-health.bat`** - Runs health check
- **`pi-restart.bat`** - Restarts all services

Just double-click any of these files from Windows Explorer!

### **Method 2: PowerShell Script (Recommended)**

Open PowerShell in your project folder and use:

```powershell
# Show system status
.\scripts\deployment\pi-manager.ps1 status

# Run health check
.\scripts\deployment\pi-manager.ps1 health

# Restart services
.\scripts\deployment\pi-manager.ps1 restart

# Start services
.\scripts\deployment\pi-manager.ps1 start

# Stop services
.\scripts\deployment\pi-manager.ps1 stop

# View recent logs
.\scripts\deployment\pi-manager.ps1 logs

# Show service status
.\scripts\deployment\pi-manager.ps1 services

# Show help
.\scripts\deployment\pi-manager.ps1 help
```

### **Method 3: Direct SSH Commands**

```powershell
# Connect to Pi
ssh pi@pi-eform-locker

# Once connected, you can use:
/home/pi/eform-status.sh                    # Status dashboard
bash /home/pi/eform-locker/scripts/deployment/health-check.sh  # Health check
sudo systemctl restart eform-locker        # Restart services
sudo systemctl status eform-locker         # Service status
```

### **Method 4: One-Line SSH Commands**

```powershell
# Status dashboard
ssh pi@pi-eform-locker "/home/pi/eform-status.sh"

# Health check
ssh pi@pi-eform-locker "cd /home/pi/eform-locker; bash scripts/deployment/health-check.sh"

# Restart services
ssh pi@pi-eform-locker "sudo systemctl restart eform-locker"

# Service status
ssh pi@pi-eform-locker "sudo systemctl status eform-locker --no-pager"
```

## 🌐 Web Interfaces

You can also access the system through web browsers:

- **Admin Panel**: http://192.168.1.8:3001
- **Kiosk UI**: http://192.168.1.8:3002  
- **Gateway API**: http://192.168.1.8:3000

## 📊 What Each Command Shows

### **Status Dashboard** (`pi-status.bat` or `status` command)
Shows:
- System uptime and date
- Service status (Running/Stopped)
- Network connectivity test
- Hardware information (USB devices, temperature)
- Resource usage (memory, disk)
- Recent system events

### **Health Check** (`pi-health.bat` or `health` command)
Shows:
- Individual service health (Gateway, Kiosk, Panel)
- USB device count
- Database integrity
- System resources (CPU, memory)
- Overall health percentage

### **Service Status** (`services` command)
Shows:
- Detailed systemd service information
- Process IDs and resource usage
- Service startup logs
- Current service state

### **Logs** (`logs` command)
Shows:
- Recent Gateway service logs
- Recent Kiosk service logs
- Recent Panel service logs

## 🔧 Common Management Tasks

### **Daily Monitoring**
```powershell
# Quick daily check
.\scripts\deployment\pi-manager.ps1 health
```

### **After Making Code Changes**
```powershell
# Deploy changes (from your development workflow)
git push origin main

# SSH to Pi and pull changes
ssh pi@pi-eform-locker "cd /home/pi/eform-locker && git pull origin main"

# Restart services to apply changes
.\scripts\deployment\pi-manager.ps1 restart
```

### **Troubleshooting Issues**
```powershell
# Check overall status
.\scripts\deployment\pi-manager.ps1 status

# Run health check
.\scripts\deployment\pi-manager.ps1 health

# View recent logs
.\scripts\deployment\pi-manager.ps1 logs

# Check detailed service status
.\scripts\deployment\pi-manager.ps1 services

# Restart if needed
.\scripts\deployment\pi-manager.ps1 restart
```

### **Emergency Procedures**
```powershell
# Stop all services
.\scripts\deployment\pi-manager.ps1 stop

# Start services
.\scripts\deployment\pi-manager.ps1 start

# Full restart
.\scripts\deployment\pi-manager.ps1 restart

# If Pi is unresponsive, reboot it
ssh pi@pi-eform-locker "sudo reboot"
```

## 🚨 Understanding Health Scores

The health check gives you a percentage score:

- **100%** - Perfect health, all systems working
- **83%** - Good health, minor issues (like no USB hardware)
- **67%** - Moderate issues, some services may be down
- **50%** - Significant issues, multiple services affected
- **<50%** - Critical issues, system needs attention

## 📱 Mobile Access

You can also check the system from your phone by visiting:
- http://192.168.1.8:3001 (Admin Panel)
- http://192.168.1.8:3002 (Kiosk UI)

## 🔄 Automatic Features

The system automatically:
- ✅ Starts all services on Pi boot
- ✅ Monitors service health every minute
- ✅ Restarts failed services automatically
- ✅ Rotates log files to prevent disk full
- ✅ Runs maintenance tasks daily
- ✅ Monitors system resources

## 📋 Quick Reference Card

| Task | Command |
|------|---------|
| **Quick Status** | Double-click `pi-status.bat` |
| **Health Check** | Double-click `pi-health.bat` |
| **Restart Services** | Double-click `pi-restart.bat` |
| **PowerShell Status** | `.\scripts\deployment\pi-manager.ps1 status` |
| **PowerShell Health** | `.\scripts\deployment\pi-manager.ps1 health` |
| **SSH Status** | `ssh pi@pi-eform-locker "/home/pi/eform-status.sh"` |
| **Web Admin** | http://192.168.1.8:3001 |
| **Web Kiosk** | http://192.168.1.8:3002 |

## 🆘 Getting Help

If you need help:

1. **Check the status first**: `pi-status.bat`
2. **Run health check**: `pi-health.bat`
3. **View logs**: `.\scripts\deployment\pi-manager.ps1 logs`
4. **Try restarting**: `pi-restart.bat`
5. **Check documentation**: `docs/raspberry-pi-startup-system.md`

## 💡 Pro Tips

1. **Bookmark the web interfaces** for quick access
2. **Run health checks daily** to catch issues early
3. **Use the batch files** for the quickest access
4. **Check logs** when troubleshooting issues
5. **The system is self-healing** - most issues resolve automatically

---

**Remember**: The system is designed to be self-managing. Most of the time, you'll just need to check the status occasionally. The automatic monitoring and recovery handles most issues for you!