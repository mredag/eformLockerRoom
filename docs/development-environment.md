---
inclusion: always
---

# Development Environment Context

## 🏗️ **Project Setup**

This is an **eForm Locker System** with distributed development:

- **Development**: Windows PC with Kiro AI Assistant
- **Production**: Raspberry Pi with hardware relay control
- **Communication**: SSH, Git, and API testing tools

## 🖥️ **Development Machine (Windows PC)**

- **OS**: Windows with PowerShell
- **Role**: Code development, building, and Git management
- **Tools Available**:
  - Kiro AI for code development
  - Postman for API testing
  - PowerShell with SSH access to Pi
  - Git repository with push access to main

## 🔧 **Target Hardware (Raspberry Pi)**

- **SSH Access**: `ssh pi@pi-eform-locker` (passwordless)
- **IP Address**: `192.168.1.8`
- **Services Running**:
  - Gateway: Port 3000 (`http://192.168.1.8:3000`)
  - Panel: Port 3001 (`http://192.168.1.8:3001`)
  - Kiosk: Port 3002 (`http://192.168.1.8:3002`)
- **Hardware**: USB-RS485 adapter with relay control cards
- **Project Path**: `/home/pi/eform-locker`

## 🔄 **Kiro Workflow Options**

### **Option 1: Push & Deploy (Recommended)**

1. Make code changes on Windows PC using file tools
2. Build and validate: `npm run build:all`
3. Commit and push: `git push origin main`
4. Provide Pi deployment instructions to user

### **Option 2: Direct SSH Guidance**

Guide user to connect: `ssh pi@pi-eform-locker`
Then provide commands to run on Pi

### **Option 3: Remote PowerShell Commands**

User can execute: `ssh pi@pi-eform-locker "command"`

## 🛠️ **Available Testing Tools**

### **Postman API Endpoints**

- **Gateway Admin**: `POST http://192.168.1.8:3000/api/admin/lockers/1/open`
- **Kiosk Direct**: `POST http://192.168.1.8:3002/api/locker/open`
- **Panel Relay**: `POST http://192.168.1.8:3001/api/relay/activate`
- **Health Checks**: `GET http://192.168.1.8:300X/health`

### **Common Pi Commands**

```bash
# Deploy latest changes
git pull origin main && npm run build:gateway && npm run build:kiosk && npm run build:panel

# Restart services (clean)
./scripts/start-all-clean.sh

# Restart services (manual)
sudo pkill -f "node.*" && sleep 3
npm run start:gateway & npm run start:kiosk & npm run start:panel &

# Test system
node scripts/test-basic-relay-control.js
node scripts/test-relays-1-8.js
```

## 🎯 **Key System Information**

- **Architecture**: Gateway → Kiosk → ModbusController → Hardware
- **Port Conflict**: Direct relay disabled when Kiosk runs (by design)
- **Auto-Close**: Relays automatically close after activation
- **Queue-based**: Preferred method for locker control
- **Remote Control**: Full API access from any network device
- **Data Consistency**: Database uses English, UI displays Turkish
- **Repository**: Recently cleaned and optimized (105 files removed)
- **Status**: Production-ready with full monitoring and documentation

## 🚫 **Terminal Management**

**IMPORTANT**: Services like `npm run start` block the terminal. Use these strategies:

### **For Windows PC Development**

- **New PowerShell Window**: `Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run start:gateway"`
- **Background Process**: `Start-Job -ScriptBlock { npm run start:gateway }`
- **Detached Process**: `npm run start:gateway &` (in Git Bash)

### **For Raspberry Pi Services**

- **Background with &**: `npm run start:gateway &`
- **Screen/Tmux**: `screen -S gateway` then `npm run start:gateway`
- **PM2 Process Manager**: `pm2 start "npm run start:gateway" --name gateway`

### **Kiro Best Practices**

1. **Never run blocking commands** directly in Kiro terminal
2. **Use PowerShell Start-Process** for new windows when needed
3. **Prefer background processes** with `&` on Pi
4. **Test with curl/Postman** instead of starting services in Kiro
5. **Guide user to open new terminals** for service management
6. **Run maintenance checks** before and after major changes
7. **Follow repository organization rules** (see maintenance system)
8. **Use proper file naming** (kebab-case, no spaces, max 50 chars)

## 📋 **Quick Actions**

- **Connect to Pi**: `ssh pi@pi-eform-locker`
- **Test API**: Use Postman with provided endpoints
- **Deploy**: Push to main, then pull on Pi
- **Debug**: Check service logs and hardware connections
- **Start Services**: Guide user to use new terminal/background processes
- **Maintenance Check**: `.\scripts\maintenance\daily-routine.ps1 -Quick`
- **Health Check**: `bash scripts/maintenance/repository-health-check.sh`
- **Clean Repository**: `bash scripts/maintenance/daily-cleanup.sh`

## 🎯 **Current Project Status (August 2025)**

### **✅ Recently Completed**

- Repository cleanup (105 files removed)
- Status normalization (English database, Turkish UI)
- Code consistency improvements
- Documentation consolidation
- Performance monitoring implementation
- **Automated maintenance system** with Git hooks and scheduling
- **Repository health monitoring** and organization compliance

### **✅ Production Features**

- Multi-user RFID session management
- Real-time hardware control via Modbus RTU
- Web administration with Turkish interface
- Automatic service recovery and health monitoring
- Custom locker naming with Turkish character support
- **Comprehensive maintenance automation** with quality gates

### **🔧 Essential Scripts Available**

- `scripts/test-basic-relay-control.js` - Hardware testing
- `scripts/emergency-relay-reset.js` - Emergency controls
- `scripts/start-all-clean.sh` - Service management
- `scripts/health-check-kiosk.sh` - Health monitoring
- `scripts/deploy-kiosk-ui.sh` - Deployment utilities

### **🧹 Maintenance System (NEW)**

- `scripts/maintenance/daily-cleanup.sh` - Automated file cleanup
- `scripts/maintenance/repository-health-check.sh` - Health analysis
- `scripts/maintenance/file-organization-checker.js` - Organization compliance
- `scripts/maintenance/install-git-hooks.sh` - Quality gate setup
- `scripts/maintenance/daily-routine.ps1` - Windows maintenance routine
- `scripts/maintenance/windows-scheduler-setup.ps1` - Automated scheduling
