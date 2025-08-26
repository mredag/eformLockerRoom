# eForm Locker System - Development Guide

## 🏗️ **Project Architecture Overview**

This is a **distributed eForm Locker System** with hardware relay control:

### **Services Architecture**
- **Gateway** (Port 3000): Main API coordinator, handles admin requests
- **Kiosk** (Port 3002): Hardware control service, manages Modbus communication
- **Panel** (Port 3001): Admin web interface, direct relay control

### **Hardware Setup**
- **Target**: Raspberry Pi with USB-RS485 adapter
- **Relays**: Waveshare relay control cards via Modbus RTU
- **Serial Port**: `/dev/ttyUSB0` (9600 baud, 8N1)
- **Protocol**: Modbus RTU with custom CRC16 calculation

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
curl -X POST http://192.168.1.8:3002/api/locker/open \
  -H "Content-Type: application/json" \
  -d '{"locker_id": 5, "staff_user": "test", "reason": "testing"}'

# Test relay control
curl -X POST http://192.168.1.8:3001/api/relay/activate \
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
  let crc = 0xFFFF;
  
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    
    for (let j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xA001;
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
  buffer[2] = (startAddress >> 8) & 0xFF;  // Address high
  buffer[3] = startAddress & 0xFF;         // Address low
  buffer[4] = (value >> 8) & 0xFF;         // Value high
  buffer[5] = value & 0xFF;                // Value low
  
  const crc = calculateCRC16(buffer.subarray(0, 6));
  buffer[6] = crc & 0xFF;                  // CRC low
  buffer[7] = (crc >> 8) & 0xFF;           // CRC high
  
  return buffer;
}
```

### **🔧 Locker to Hardware Mapping**
```javascript
// Convert locker ID to hardware addresses
const cardId = Math.ceil(lockerNumber / 16);      // Card 1, 2, 3...
const relayId = ((lockerNumber - 1) % 16) + 1;   // Relay 1-16 on card
const coilAddress = relayId - 1;                  // 0-based coil address

// Examples:
// Locker 1  -> Card 1, Relay 1,  Coil 0
// Locker 5  -> Card 1, Relay 5,  Coil 4
// Locker 16 -> Card 1, Relay 16, Coil 15
// Locker 17 -> Card 2, Relay 1,  Coil 0
```

## 🛠️ **Development Workflow**

### **1. Making Code Changes (Windows PC)**
```powershell
# Edit code in Kiro
# Build the service
npm run build:kiosk  # or build:gateway, build:panel

# Commit and push
git add .
git commit -m "Description of changes"
git push origin main
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
curl -X POST http://192.168.1.8:3002/api/locker/open \
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

### **API Testing**
- `scripts/test-services-quick.js` - Quick service health check
- `scripts/test-command-processing.js` - Test command queue
- `scripts/debug-hardware-communication.js` - Debug Modbus issues

### **Service Management**
- `scripts/start-all-clean.sh` - Clean start all services
- `scripts/start-services-properly.sh` - Alternative startup
- `scripts/emergency-relay-reset.js` - Reset stuck relays

## 🔍 **Debugging Tips**

### **Enable Debug Logging**
Add to service code:
```javascript
console.log(`🔧 Debug: ${JSON.stringify(data)}`);
console.log(`📡 Command: ${buffer.toString('hex').toUpperCase()}`);
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

---

**Remember**: When in doubt, use the working test scripts to verify hardware functionality before debugging software issues!