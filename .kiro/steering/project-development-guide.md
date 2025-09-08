# eForm Locker System - Development Guide

## 🏗️ **Project Architecture Overview**

This is a **distributed eForm Locker System** with hardware relay control:

### **Services Architecture**

- **Gateway** (Port 3000): Main API coordinator, handles admin requests
- **Kiosk** (Port 3002): Hardware control service, manages Modbus communication
- **Panel** (Port 3001): Admin web interface, direct relay control
- **Agent** (Optional): Background task processing and automation

### **Hardware Setup**

- **Target**: Raspberry Pi 4 with USB-RS485 adapter
- **Relays**: Waveshare relay control cards via Modbus RTU
- **RFID**: Sycreader USB RFID reader (HID keyboard mode)
- **Serial Port**: `/dev/ttyUSB0` (9600 baud, 8N1)
- **Protocol**: Modbus RTU with custom CRC16 calculation

### **Key Features (Latest)**

- **✅ Multi-User RFID Support**: Session-based card management (no automatic timeout)
- **✅ Power Interruption Resilience**: Locker assignments survive power outages and system restarts
- **✅ Real-time Hardware Control**: Direct relay activation via Modbus RTU
- **✅ Web Administration**: Complete locker management and monitoring
- **✅ Fault Tolerance**: Automatic service recovery and health monitoring
- **✅ Production Ready**: Full documentation and monitoring tools
- **✅ Clean Codebase**: Repository optimized with consistent English status names
- **✅ Performance Monitoring**: Real-time system monitoring and health checks
- **✅ Locker Naming**: Custom display names with Turkish character support

## 🚀 **Quick Development Commands**

### **Start Services (Raspberry Pi)**

```bash
# Clean start all services
./scripts/start-all-clean.sh

# Start individual services
npm run start:gateway &
npm run start:kiosk &
npm run start:panel &

# Check service status
ps aux | grep node
curl http://localhost:3000/health  # Gateway
curl http://localhost:3002/health  # Kiosk
curl http://localhost:3001/health  # Panel (may need auth)
```

### **Build Commands (Windows PC)**

```powershell
# Build all services
npm run build:gateway
npm run build:kiosk
npm run build:panel

# Deploy to Pi (after git push)
ssh pi@pi-eform-locker "cd /home/pi/eform-locker && git pull origin main"
```

### **Testing Commands**

```bash
# Test hardware directly
node scripts/test-basic-relay-control.js
node scripts/test-relays-1-8.js

# Test API endpoints
curl -X POST http://192.168.1.11:3002/api/locker/open \
  -H "Content-Type: application/json" \
  -d '{"locker_id": 5, "staff_user": "test", "reason": "testing"}'

# Test relay control
curl -X POST http://192.168.1.11:3001/api/relay/activate \
  -H "Content-Type: application/json" \
  -d '{"relay_number": 5, "staff_user": "test", "reason": "testing"}'
```

### **Log Monitoring**

```bash
# View logs
tail -f logs/gateway.log
tail -f logs/kiosk.log
tail -f logs/panel.log

# Clear logs
rm logs/*.log
```

## 🎯 **Latest System Features (August 2025)**

### **✅ Repository Cleanup & Maintenance System (August 2025)**

**RECENTLY COMPLETED:**

- **Repository Optimization**: Removed 105 unnecessary files and outdated artifacts
- **Status Normalization**: All database status values now use English consistently
- **Code Cleanup**: Eliminated Turkish/English mixing in backend code
- **Documentation Consolidation**: Streamlined and organized documentation
- **Script Optimization**: Kept only essential operational scripts
- **Automated Maintenance System**: Comprehensive cleanup and organization automation
- **Git Hooks**: Quality gates to prevent repository degradation
- **Health Monitoring**: Continuous repository health tracking and reporting

**Current Repository Structure**:

```
eform-locker-system/
├── app/                    # 4 core services (Gateway, Kiosk, Panel, Agent)
├── shared/                 # Common utilities and types
├── scripts/                # Essential operational scripts
│   ├── deployment/         # Deployment automation
│   ├── testing/           # Test execution scripts
│   ├── maintenance/       # Repository maintenance system (NEW)
│   └── emergency/         # Emergency procedures
├── docs/                   # Essential documentation
├── tests/                  # Integration and unit tests
├── migrations/             # Database migrations
└── config/                 # Configuration files
```

**Maintenance System Features**:

- **Automated Cleanup**: Daily removal of temporary files and artifacts
- **Health Monitoring**: Repository health scoring and compliance checking
- **Git Hooks**: Pre-commit/pre-push quality gates
- **Organization Compliance**: Automated file placement and naming validation
- **Scheduled Maintenance**: Windows Task Scheduler integration

### **� RFIbD Session Management**

**✅ WORKING IMPLEMENTATION:**

- **Session Creation**: Each RFID card scan creates unique session (no automatic timeout)
- **Multi-User Support**: Different cards can operate simultaneously without conflicts
- **Session Format**: `kiosk-{kioskId}-{cardId}-{timestamp}`
- **Power Resilience**: Locker assignments persist through power outages and system restarts
- **Database Integrity**: SQLite WAL mode ensures data durability during power interruptions

**Session Flow**:

```
1. Card Scan → Create Session → Show Available Lockers
2. Locker Selection → Assign to Card → Clear Session
3. Same Card Scan Again → Open Assigned Locker → Release
```

**RFID Cards Currently Registered**:

- Card 1: `0009652489` → "Card User 1"
- Card 2: `0009652490` → "Card User 2"

### **🖥️ User Interface Features**

**✅ WORKING FEATURES:**

- **Real-time RFID Detection**: Browser-based keyboard event capture
- **Visual Locker Selection**: Interactive grid showing available lockers
- **Master PIN Access**: 4-digit PIN with lockout protection (default: 1234)
- **Multi-language Support**: Turkish/English interface
- **Responsive Design**: Touch-screen optimized

## ⚡ **Critical Technical Knowledge**

### **🔧 Modbus Communication - WHAT WORKS**

**✅ WORKING METHOD (Use This!):**

- **Function Code**: `0x05` (Write Single Coil)
- **ON Command**: `01 05 00 04 FF 00 [CRC]` (for relay 5)
- **OFF Command**: `01 05 00 04 00 00 [CRC]` (for relay 5)
- **CRC Calculation**: Custom implementation (see below)

**❌ BROKEN METHODS (Avoid These!):**

- Waveshare timed pulse commands (`01 05 02 00 ...`)
- ModbusRTU library `writeCoil()` method
- `writeUInt16BE()` for command building
- Standard Modbus libraries (they don't work with this hardware)

### **🔧 Working CRC16 Implementation**

```javascript
function calculateCRC16(data) {
  let crc = 0xffff;

  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];

    for (let j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xa001;
      } else {
        crc = crc >> 1;
      }
    }
  }

  return crc;
}
```

### **🔧 Working Command Builder**

```javascript
function buildModbusCommand(slaveId, functionCode, startAddress, value) {
  const buffer = Buffer.alloc(8);

  buffer[0] = slaveId;
  buffer[1] = functionCode;
  buffer[2] = (startAddress >> 8) & 0xff; // Address high
  buffer[3] = startAddress & 0xff; // Address low
  buffer[4] = (value >> 8) & 0xff; // Value high
  buffer[5] = value & 0xff; // Value low

  const crc = calculateCRC16(buffer.subarray(0, 6));
  buffer[6] = crc & 0xff; // CRC low
  buffer[7] = (crc >> 8) & 0xff; // CRC high

  return buffer;
}
```

### **🔧 Locker to Hardware Mapping**

```javascript
// Convert locker ID to hardware addresses
const cardId = Math.ceil(lockerNumber / 16); // Card 1, 2, 3...
const relayId = ((lockerNumber - 1) % 16) + 1; // Relay 1-16 on card
const coilAddress = relayId - 1; // 0-based coil address

// Examples:
// Locker 1  -> Card 1, Relay 1,  Coil 0
// Locker 5  -> Card 1, Relay 5,  Coil 4
// Locker 16 -> Card 1, Relay 16, Coil 15
// Locker 17 -> Card 2, Relay 1,  Coil 0
```

## 🛠️ **Development Workflow**

### **1. Making Code Changes (Windows PC)**

```powershell
# Pre-work maintenance check
.\scripts\maintenance\daily-routine.ps1 -Quick

# Edit code in Kiro
# Build the service
npm run build:kiosk  # or build:gateway, build:panel

# Pre-commit verification (Git hooks will run automatically)
git add .
git commit -m "feat(component): description of changes"  # Follow commit format
git push origin main

# Post-work cleanup (optional)
bash scripts/maintenance/daily-cleanup.sh
```

### **2. Deploy to Raspberry Pi**

```bash
# SSH to Pi and update
ssh pi@pi-eform-locker
cd /home/pi/eform-locker
git pull origin main

# Restart services
sudo killall node
./scripts/start-all-clean.sh
```

### **3. Test Changes**

```bash
# Test hardware
node scripts/test-basic-relay-control.js

# Test API
curl -X POST http://192.168.1.11:3002/api/locker/open \
  -H "Content-Type: application/json" \
  -d '{"locker_id": 5, "staff_user": "test", "reason": "testing"}'
```

## 🚨 **Common Issues & Solutions**

### **Port Conflicts**

**Problem**: `Resource temporarily unavailable` or `EBUSY`
**Solution**: Only ONE service can use `/dev/ttyUSB0` at a time

```bash
# Check what's using the port
sudo lsof /dev/ttyUSB0

# Kill conflicting processes
sudo killall node
```

### **Relay Not Clicking**

**Problem**: API returns success but no relay activation
**Solutions**:

1. Check if using Waveshare commands (broken) vs basic ON/OFF (working)
2. Verify CRC calculation method
3. Test with working script: `node scripts/test-basic-relay-control.js`

### **Service Won't Start**

**Problem**: Service fails to start or crashes
**Solutions**:

```bash
# Check logs for errors
tail -20 logs/kiosk.log

# Verify port availability
ls -la /dev/ttyUSB*

# Check service health
curl http://localhost:3002/health
```

### **Build Failures**

**Problem**: TypeScript or build errors
**Solutions**:

```powershell
# Clean build
rm -rf app/*/dist
npm run build:all

# Check for syntax errors
npm run lint  # if available
```

## 📋 **Useful Test Scripts**

### **Hardware Testing**

- `scripts/test-basic-relay-control.js` - Test basic relay ON/OFF
- `scripts/test-relays-1-8.js` - Test multiple relays
- `scripts/emergency-close-relay.js` - Emergency relay shutdown
- `scripts/emergency-relay-reset.js` - Reset stuck relays

### **Service Management**

- `scripts/start-all-clean.sh` - Clean start all services
- `scripts/production-startup.js` - Production service startup
- `scripts/health-check-kiosk.sh` - Health monitoring

### **Deployment & Testing**

- `scripts/deploy-kiosk-ui.sh` - Deploy UI updates
- `scripts/validate-deployment.sh` - Validate deployment
- `scripts/run-e2e-admin-panel-tests.js` - E2E testing

## 🔍 **Debugging Tips**

### **Enable Debug Logging**

Add to service code:

```javascript
console.log(`🔧 Debug: ${JSON.stringify(data)}`);
console.log(`📡 Command: ${buffer.toString("hex").toUpperCase()}`);
```

### **Monitor Serial Communication**

```bash
# Install serial monitor
sudo apt install minicom

# Monitor port (stop services first!)
sudo minicom -D /dev/ttyUSB0 -b 9600
```

### **Check Hardware Connections**

```bash
# List USB devices
lsusb

# Check serial ports
ls -la /dev/ttyUSB*

# Test port permissions
sudo chmod 666 /dev/ttyUSB0
```

## 🎯 **API Endpoints Reference**

### **Kiosk Service (Port 3002)**

- `POST /api/locker/open` - Open locker (queue-based, RECOMMENDED)
- `GET /health` - Service health check

### **Gateway Service (Port 3000)**

- `POST /api/admin/lockers/{id}/open` - Admin locker control
- `GET /health` - Service health check

### **Panel Service (Port 3001)**

- `POST /api/relay/activate` - Direct relay control
- `GET /api/relay/status` - Relay service status
- `GET /lockers` - Locker management page
- `GET /relay` - Direct relay control page

## 🔐 **Authentication Notes**

- Panel service requires authentication for web pages
- API endpoints may bypass auth for testing
- Default credentials in environment or config files

## 📦 **Dependencies & Libraries**

### **Working Libraries**

- `serialport` - Direct serial communication ✅
- `fastify` - Web server framework ✅
- `sqlite3` - Database operations ✅

### **Problematic Libraries**

- `modbus-serial` - Doesn't work with this hardware ❌
- `node-modbus` - CRC calculation issues ❌

## 🚀 **Performance Tips**

- Use queue-based locker control (Kiosk service) for reliability
- Avoid direct relay control when Kiosk service is running
- Keep relay pulse duration around 500ms for best results
- Always turn relay OFF after activation to prevent stuck relays

## 📊 **System Monitoring & Logs**

### **Real-time Monitoring**

```bash
# Monitor all service logs
tail -f logs/*.log

# Monitor RFID activity and sessions
tail -f logs/kiosk.log | grep -i "rfid\|session\|card"

# Monitor relay activations
tail -f logs/*.log | grep -i "relay\|modbus"

# Monitor errors only
tail -f logs/*.log | grep -i "error\|failed"
```

### **Health Checks**

```bash
# Quick health check all services
curl http://192.168.1.11:3000/health  # Gateway
curl http://192.168.1.11:3002/health  # Kiosk
curl http://192.168.1.11:3001/health  # Panel

# Automated health monitoring
./scripts/health-check.sh
```

### **Database Monitoring**

```bash
# Check locker states
sqlite3 data/eform.db "SELECT id, status, owner_key FROM lockers WHERE status != 'Free';"

# Check active sessions (in logs)
grep "Created session" logs/kiosk.log | tail -10

# Database size and performance
du -h data/eform.db
sqlite3 data/eform.db "PRAGMA integrity_check;"
```

## 🎯 **Latest Features (August 2025)**

### **✅ RFID Session Management**

- **Multi-User Support**: Different RFID cards work simultaneously
- **Session Timeout**: 5-minute automatic cleanup
- **Card Registration**: Easy user management via database
- **Real-time Processing**: Browser-based RFID capture

### **✅ Production Features**

- **Comprehensive Documentation**: Complete API reference and monitoring guides
- **Health Monitoring**: Automated service health checks
- **Error Handling**: Robust error recovery and logging
- **Performance Monitoring**: System resource and response time tracking

### **✅ Web Interfaces**

- **Kiosk UI**: `http://192.168.1.11:3002` - User RFID interface
- **Admin Panel**: `http://192.168.1.11:3001` - Locker management
- **Relay Control**: `http://192.168.1.11:3001/relay` - Direct hardware control

## 📚 **Documentation Files**

- `docs/DEPLOYMENT_README.md` - Deployment and setup guide
- `docs/performance-monitoring-guide.md` - Performance monitoring
- `docs/kiosk-troubleshooting-guide.md` - Troubleshooting guide
- `docs/pi-configuration-guide.md` - Pi configuration
- `docs/rollback-procedures.md` - Rollback procedures
- `docs/REPOSITORY_MAINTENANCE_GUIDE.md` - Repository maintenance procedures
- `scripts/maintenance/README.md` - Maintenance system documentation
- `REPOSITORY_CLEANUP_COMPLETE.md` - Repository cleanup summary

---

## 🔄 **Data Consistency & Status Management**

### **Database Status Values (English)**

- `Free` - Available for assignment
- `Owned` - Assigned to RFID card
- `Opening` - Confirmed ownership, opening in progress
- `Error` - Hardware or system errors
- `Blocked` - Administratively blocked

### **UI Display Mapping (Turkish)**

- Database `Free` → UI displays `Boş`
- Database `Owned` → UI displays `Dolu`
- Database `Opening` → UI displays `Açılıyor`
- Database `Error` → UI displays `Hata`
- Database `Blocked` → UI displays `Engelli`

### **CSS Classes (Turkish-based)**

- `.state-bos` - Green (available)
- `.state-dolu` - Red (occupied)
- `.state-aciliyor` - Orange (opening)
- `.state-hata` - Gray (error)
- `.state-engelli` - Red/Pink (blocked)

**Architecture**: Database (English) → API (English) → UI Display (Turkish)

---

**Remember**: When in doubt, use the working test scripts to verify hardware functionality before debugging software issues! The system is now production-ready with full multi-user RFID support and clean, consistent data architecture.
