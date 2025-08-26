# Development Environment Setup

## 🏗️ **Development Architecture**

This project uses a **distributed development setup** where code development happens on a Windows PC and deployment/testing occurs on a Raspberry Pi hardware target.

### **Development Machine (Windows PC)**
- **Role**: Primary development environment
- **OS**: Windows 11/10 with PowerShell
- **IDE**: Kiro AI Assistant for code development
- **Git**: Local repository with push access to main branch
- **Tools**: 
  - Node.js for building and testing
  - Postman for API testing
  - PowerShell for remote SSH access

### **Target Hardware (Raspberry Pi)**
- **Role**: Production runtime environment
- **Device**: Raspberry Pi with hardware relay control
- **OS**: Raspberry Pi OS (Linux)
- **Location**: `pi@pi-eform-locker` (passwordless SSH access)
- **Services**: Gateway, Panel, and Kiosk services with hardware integration
- **Hardware**: USB-RS485 adapter connected to relay control cards

## 🔄 **Development Workflow**

### **For Kiro AI Assistant:**

When making changes to the system, you have several options:

#### **Option 1: Push and Deploy (Recommended)**
```bash
# 1. Make code changes on Windows PC
# 2. Build and test locally
npm run build:all

# 3. Commit and push to main
git add .
git commit -m "Description of changes"
git push origin main

# 4. Instruct user to deploy on Raspberry Pi
```

#### **Option 2: Direct SSH Commands**
```powershell
# Connect to Raspberry Pi via PowerShell
ssh pi@pi-eform-locker

# Then run commands on the Pi
git pull origin main
npm run build:all
# restart services as needed
```

#### **Option 3: PowerShell Remote Execution**
```powershell
# Execute commands remotely from Windows PC
ssh pi@pi-eform-locker "git pull origin main && npm run build:gateway"
```

### **For Testing and Validation:**

#### **API Testing with Postman**
- **Gateway Admin API**: `http://192.168.1.8:3000/api/admin/lockers/1/open`
- **Panel UI**: `http://192.168.1.8:3001`
- **Kiosk API**: `http://192.168.1.8:3002/api/locker/open`
- **Health Checks**: All services have `/health` endpoints

#### **Service Management on Raspberry Pi**
```bash
# Start all services
npm run start:gateway &
npm run start:kiosk &
npm run start:panel &

# Check service status
ps aux | grep node

# Test complete system
node scripts/test-queue-vs-direct.js
```

## 🛠️ **Available Tools and Access**

### **SSH Access**
- **Connection**: `ssh pi@pi-eform-locker`
- **Authentication**: Passwordless (SSH key-based)
- **From**: Windows PowerShell or any SSH client

### **API Testing Tools**
- **Postman**: Full REST API testing capability
- **Browser**: Direct access to Panel UI
- **cURL**: Command-line API testing
- **Custom Scripts**: Node.js test scripts in `/scripts` directory

### **Development Commands**

#### **On Windows PC (Development)**
```powershell
# Build services locally
npm run build:gateway
npm run build:kiosk  
npm run build:panel

# Run tests
npm test

# Push changes
git push origin main
```

#### **On Raspberry Pi (Deployment)**
```bash
# Pull latest changes
git pull origin main

# Rebuild services
npm run build:all

# Restart services
sudo pkill -f "node.*"
npm run start:gateway &
npm run start:kiosk &
npm run start:panel &

# Test system
node scripts/test-queue-vs-direct.js
```

## 🎯 **Kiro AI Workflow Recommendations**

### **When Making Code Changes:**

1. **Develop on Windows PC** - Use file tools to modify code
2. **Build and validate** - Run build commands to check for errors
3. **Push to main** - Commit and push changes to GitHub
4. **Deploy instructions** - Provide clear deployment steps for Raspberry Pi
5. **Test remotely** - Use Postman or provide test commands

### **When Debugging Issues:**

1. **SSH into Pi** - Use PowerShell to connect directly
2. **Check service logs** - View real-time service output
3. **Test APIs** - Use Postman for endpoint validation
4. **Hardware validation** - Run hardware-specific test scripts

### **When Adding Features:**

1. **Code on Windows** - Develop using Kiro's file tools
2. **Test locally** - Build and validate syntax
3. **Push changes** - Deploy to main branch
4. **Remote testing** - Guide user through Pi deployment and testing
5. **API documentation** - Update Postman collections as needed

## 📋 **Quick Reference Commands**

### **Connect to Raspberry Pi**
```powershell
ssh pi@pi-eform-locker
```

### **Deploy Latest Changes**
```bash
git pull origin main && npm run build:all
```

### **Restart All Services**
```bash
sudo pkill -f "node.*" && sleep 3 && npm run start:gateway & npm run start:kiosk & npm run start:panel &
```

### **Test System Health**
```bash
curl http://localhost:3000/health && curl http://localhost:3001/health && curl http://localhost:3002/health
```

This setup enables efficient distributed development with real hardware testing capabilities while maintaining clean separation between development and production environments.