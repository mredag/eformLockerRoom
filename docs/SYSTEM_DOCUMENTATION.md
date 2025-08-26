# eForm Locker System - Complete Documentation

## 📋 **Table of Contents**
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Services Documentation](#services-documentation)
4. [API Reference](#api-reference)
5. [Database Schema](#database-schema)
6. [Hardware Integration](#hardware-integration)
7. [Monitoring & Logging](#monitoring--logging)
8. [Troubleshooting](#troubleshooting)
9. [Development Guide](#development-guide)
10. [Deployment Guide](#deployment-guide)

---

## 🏗️ **System Overview**

The **eForm Locker System** is a distributed IoT solution for automated locker management using RFID authentication and hardware relay control. The system consists of three microservices running on a Raspberry Pi with industrial hardware integration.

### **Key Features**
- **RFID Authentication**: Card-based user identification and locker access
- **Multi-User Support**: Concurrent locker operations with session management
- **Hardware Control**: Direct relay control via Modbus RTU protocol
- **Web Administration**: Real-time locker management and monitoring
- **Fault Tolerance**: Automatic recovery and service health monitoring
- **Scalable Architecture**: Microservices design for easy expansion

### **System Requirements**
- **Hardware**: Raspberry Pi 4 (4GB RAM recommended)
- **OS**: Raspberry Pi OS (Debian-based Linux)
- **Network**: Ethernet or WiFi connectivity
- **Storage**: 32GB+ SD card
- **Power**: 5V 3A power supply

---

## 🏛️ **Architecture**

### **Service Architecture**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Gateway       │    │     Kiosk       │    │     Panel       │
│   Port: 3000    │    │   Port: 3002    │    │   Port: 3001    │
│                 │    │                 │    │                 │
│ • API Router    │◄──►│ • Hardware Ctrl │◄──►│ • Admin UI      │
│ • Admin Mgmt    │    │ • RFID Handler  │    │ • Direct Relay  │
│ • Coordination  │    │ • User Interface│    │ • Monitoring    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   SQLite DB     │
                    │                 │
                    │ • Users         │
                    │ • Lockers       │
                    │ • Sessions      │
                    │ • Logs          │
                    └─────────────────┘
```

### **Hardware Integration**
```
Raspberry Pi 4
├── USB-RS485 Adapter (/dev/ttyUSB0)
│   └── Modbus RTU Network (9600 baud, 8N1)
│       └── Waveshare Relay Cards
│           ├── Card 1: Relays 1-16  (Lockers 1-16)
│           ├── Card 2: Relays 1-16  (Lockers 17-32)
│           └── Card N: Relays 1-16  (Lockers N*16+1...)
└── USB RFID Reader (Sycreader - HID Keyboard Mode)
    └── RFID Cards (10-digit numeric IDs)
```

### **Data Flow**
```
RFID Scan → Session Creation → Locker Selection → Hardware Control → Database Update
     ↓              ↓               ↓                ↓                ↓
1. Card Read   2. User Auth    3. UI Display    4. Relay Pulse   5. Status Update
```

---

## 🔧 **Services Documentation**

### **Gateway Service (Port 3000)**

**Purpose**: Central API coordinator and admin request handler

**Key Responsibilities**:
- Route admin API requests to appropriate services
- Handle cross-service communication
- Provide unified API endpoints
- Manage service health monitoring

**Main Endpoints**:
- `GET /health` - Service health check
- `POST /api/admin/lockers/{id}/open` - Admin locker control
- `GET /api/admin/lockers` - Get all locker statuses
- `POST /api/admin/users` - User management

**Configuration**:
```javascript
{
  "port": 3000,
  "database": "data/eform.db",
  "services": {
    "kiosk": "http://localhost:3002",
    "panel": "http://localhost:3001"
  }
}
```

### **Kiosk Service (Port 3002)**

**Purpose**: Hardware control and user interface service

**Key Responsibilities**:
- RFID card processing and session management
- Hardware relay control via Modbus RTU
- User interface for locker selection
- Real-time locker state management

**Main Endpoints**:
- `GET /` - Kiosk user interface
- `POST /api/rfid/handle-card` - Process RFID card scan
- `POST /api/lockers/select` - Select and assign locker
- `GET /api/lockers/available` - Get available lockers
- `POST /api/master/verify-pin` - Master PIN verification
- `POST /api/master/open-locker` - Master locker override

**Session Management**:
```javascript
// Session Structure
{
  sessionId: "kiosk-1-cardId-timestamp",
  cardId: "0009652489",
  timestamp: 1756241234567,
  timeout: 300000 // 5 minutes
}
```

**Hardware Control**:
- **Modbus Protocol**: RTU over RS485
- **Function Code**: 0x05 (Write Single Coil)
- **Relay Pulse**: 500ms ON, then OFF
- **CRC Calculation**: Custom implementation for Waveshare compatibility

### **Panel Service (Port 3001)**

**Purpose**: Administrative web interface and direct relay control

**Key Responsibilities**:
- Web-based admin interface
- Direct relay control (when Kiosk service unavailable)
- Real-time locker monitoring
- System configuration management

**Main Endpoints**:
- `GET /` - Admin dashboard
- `GET /lockers` - Locker management interface
- `GET /relay` - Direct relay control interface
- `POST /api/relay/activate` - Direct relay activation
- `GET /api/relay/status` - Relay service status

**Authentication**:
- Session-based authentication for web interface
- API endpoints may bypass auth for system integration

---

## 📡 **API Reference**

### **RFID Card Processing**

#### **POST /api/rfid/handle-card**
Process RFID card scan and determine action

**Request**:
```json
{
  "card_id": "0009652489",
  "kiosk_id": "kiosk-1"
}
```

**Response - New User**:
```json
{
  "action": "show_lockers",
  "session_id": "kiosk-1-0009652489-1756241234567",
  "lockers": [
    {"id": 1, "status": "Free"},
    {"id": 2, "status": "Free"}
  ]
}
```

**Response - Existing User**:
```json
{
  "action": "open_locker",
  "locker_id": 4,
  "message": "Locker opened and released"
}
```

### **Locker Selection**

#### **POST /api/lockers/select**
Select and assign a locker to user

**Request**:
```json
{
  "locker_id": 4,
  "kiosk_id": "kiosk-1",
  "session_id": "kiosk-1-0009652489-1756241234567"
}
```

**Response - Success**:
```json
{
  "success": true,
  "locker_id": 4
}
```

**Response - Error**:
```json
{
  "error": "Invalid or expired session. Please scan your card again."
}
```

### **Master PIN Access**

#### **POST /api/master/verify-pin**
Verify master PIN for admin access

**Request**:
```json
{
  "pin": "1234",
  "kiosk_id": "kiosk-1"
}
```

**Response - Success**:
```json
{
  "success": true
}
```

**Response - Failed**:
```json
{
  "error": "Incorrect PIN",
  "attempts_remaining": 3
}
```

### **Admin Locker Control**

#### **POST /api/admin/lockers/{id}/open**
Admin override to open any locker

**Request**:
```json
{
  "staff_user": "admin",
  "reason": "maintenance"
}
```

**Response**:
```json
{
  "success": true,
  "locker_id": 4,
  "message": "Locker opened successfully"
}
```

### **Direct Relay Control**

#### **POST /api/relay/activate**
Direct relay activation (Panel service)

**Request**:
```json
{
  "relay_number": 5,
  "staff_user": "technician",
  "reason": "testing"
}
```

**Response**:
```json
{
  "success": true,
  "relay_number": 5,
  "message": "Relay activated successfully"
}
```

---

## 🗄️ **Database Schema**

### **Lockers Table**
```sql
CREATE TABLE lockers (
  kiosk_id TEXT NOT NULL,
  id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Free',
  owner_type TEXT,
  owner_key TEXT,
  reserved_at DATETIME,
  owned_at DATETIME,
  version INTEGER NOT NULL DEFAULT 1,
  is_vip BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kiosk_id, id)
);
```

**Status Values**:
- `Free` - Available for assignment
- `Reserved` - Temporarily reserved during selection
- `Owned` - Assigned to a user
- `Blocked` - Out of service

### **Users Table** (Legacy - for RFID card mapping)
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  rfid_card_id TEXT UNIQUE NOT NULL
);
```

### **Indexes**
```sql
CREATE INDEX idx_lockers_kiosk_status ON lockers(kiosk_id, status);
CREATE INDEX idx_lockers_owner_key ON lockers(owner_key);
```

### **Triggers**
```sql
CREATE TRIGGER update_lockers_timestamp
  AFTER UPDATE ON lockers
  FOR EACH ROW
  BEGIN
    UPDATE lockers SET updated_at = CURRENT_TIMESTAMP 
    WHERE kiosk_id = NEW.kiosk_id AND id = NEW.id;
  END;
```

---

## ⚙️ **Hardware Integration**

### **Modbus RTU Communication**

**Connection Parameters**:
- **Port**: `/dev/ttyUSB0`
- **Baud Rate**: 9600
- **Data Bits**: 8
- **Parity**: None
- **Stop Bits**: 1
- **Flow Control**: None

**Command Structure**:
```
[Slave ID][Function Code][Address High][Address Low][Value High][Value Low][CRC Low][CRC High]
```

**Example Commands**:
```javascript
// Turn ON relay 5 (coil address 4)
const onCommand = [0x01, 0x05, 0x00, 0x04, 0xFF, 0x00, 0x8D, 0xFA];

// Turn OFF relay 5 (coil address 4)  
const offCommand = [0x01, 0x05, 0x00, 0x04, 0x00, 0x00, 0xCC, 0x0A];
```

**CRC16 Calculation**:
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

### **RFID Reader Integration**

**Device**: Sycreader USB RFID Reader
**Mode**: HID Keyboard Emulation
**Output Format**: 10-digit numeric + Enter key

**JavaScript Capture**:
```javascript
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && rfidBuffer.length > 0) {
    handleRfidCard(rfidBuffer);
    rfidBuffer = '';
  } else if (/[0-9]/.test(event.key)) {
    rfidBuffer += event.key;
  }
});
```

### **Locker Mapping**

**Formula**:
```javascript
const cardId = Math.ceil(lockerNumber / 16);      // Relay card (1, 2, 3...)
const relayId = ((lockerNumber - 1) % 16) + 1;   // Relay on card (1-16)
const coilAddress = relayId - 1;                  // Modbus coil (0-15)
```

**Examples**:
- Locker 1 → Card 1, Relay 1, Coil 0
- Locker 16 → Card 1, Relay 16, Coil 15
- Locker 17 → Card 2, Relay 1, Coil 0

---

## 📊 **Monitoring & Logging**

### **Log Files**
- `logs/gateway.log` - Gateway service logs
- `logs/kiosk.log` - Kiosk service logs  
- `logs/panel.log` - Panel service logs

### **Log Monitoring Commands**

**Real-time Monitoring**:
```bash
# Monitor all services
tail -f logs/*.log

# Monitor specific service
tail -f logs/kiosk.log

# Monitor with filtering
tail -f logs/kiosk.log | grep -i "error\|session\|relay"
```

**Log Analysis**:
```bash
# Count errors in last hour
grep "$(date -d '1 hour ago' '+%Y-%m-%d %H')" logs/kiosk.log | grep -i error | wc -l

# Find RFID card activity
grep "RFID Card Detected" logs/kiosk.log | tail -10

# Check relay activations
grep "Relay activated" logs/*.log | tail -20
```

### **Health Monitoring**

**Service Health Checks**:
```bash
# Check all services
curl -s http://localhost:3000/health  # Gateway
curl -s http://localhost:3002/health  # Kiosk  
curl -s http://localhost:3001/health  # Panel

# Automated health check script
./scripts/test-services-quick.js
```

**System Monitoring**:
```bash
# Check running processes
ps aux | grep node

# Check port usage
netstat -tlnp | grep -E "300[0-2]"

# Check hardware connections
ls -la /dev/ttyUSB*
lsusb | grep -i rfid
```

### **Performance Metrics**

**Key Metrics to Monitor**:
- Response times for API endpoints
- RFID card processing latency
- Relay activation success rate
- Database query performance
- Memory and CPU usage

**Monitoring Script Example**:
```bash
#!/bin/bash
# System performance monitoring
echo "=== eForm Locker System Status ==="
echo "Timestamp: $(date)"
echo ""

# Service health
echo "Service Health:"
curl -s http://localhost:3000/health | jq '.status' 2>/dev/null || echo "Gateway: DOWN"
curl -s http://localhost:3002/health | jq '.status' 2>/dev/null || echo "Kiosk: DOWN"  
curl -s http://localhost:3001/health | jq '.status' 2>/dev/null || echo "Panel: DOWN"

# System resources
echo ""
echo "System Resources:"
echo "CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)%"
echo "Memory: $(free -m | awk 'NR==2{printf "%.1f%%", $3*100/$2}')"
echo "Disk: $(df -h / | awk 'NR==2{print $5}')"

# Hardware status
echo ""
echo "Hardware Status:"
echo "USB-RS485: $(ls /dev/ttyUSB* 2>/dev/null || echo 'Not found')"
echo "RFID Reader: $(lsusb | grep -i rfid > /dev/null && echo 'Connected' || echo 'Not found')"
```

---

## 🔧 **Troubleshooting**

### **Common Issues**

#### **Service Won't Start**
**Symptoms**: Service fails to start or crashes immediately
**Diagnosis**:
```bash
# Check logs for errors
tail -20 logs/kiosk.log

# Check port availability
netstat -tlnp | grep 3002

# Check file permissions
ls -la data/eform.db
```
**Solutions**:
- Kill conflicting processes: `sudo pkill -f "node.*kiosk"`
- Fix database permissions: `chmod 664 data/eform.db`
- Rebuild service: `npm run build:kiosk`

#### **RFID Cards Not Detected**
**Symptoms**: Card scans don't trigger any response
**Diagnosis**:
```bash
# Check USB devices
lsusb | grep -i rfid

# Test keyboard input
cat > /dev/null  # Type and scan card, should see output
```
**Solutions**:
- Reconnect USB RFID reader
- Check browser focus on kiosk page
- Verify card format (10-digit numeric)

#### **Relay Not Activating**
**Symptoms**: API returns success but no physical relay activation
**Diagnosis**:
```bash
# Check serial port
ls -la /dev/ttyUSB*

# Test direct hardware
node scripts/test-basic-relay-control.js

# Check for port conflicts
sudo lsof /dev/ttyUSB0
```
**Solutions**:
- Only one service can use serial port at a time
- Restart services: `./scripts/start-all-clean.sh`
- Check hardware connections and power

#### **Database Locked**
**Symptoms**: "Database is locked" errors
**Diagnosis**:
```bash
# Check database processes
sudo lsof data/eform.db

# Check database integrity
sqlite3 data/eform.db "PRAGMA integrity_check;"
```
**Solutions**:
- Stop all services and restart
- Check disk space: `df -h`
- Backup and recreate database if corrupted

#### **Session Expired Errors**
**Symptoms**: "Invalid or expired session" when selecting lockers
**Diagnosis**:
- Check if user took too long (5-minute timeout)
- Verify session management in logs
**Solutions**:
- Scan RFID card again to create new session
- Reduce session timeout if needed
- Clear browser cache

### **Emergency Procedures**

#### **Emergency Relay Reset**
```bash
# Stop all services
sudo pkill -f "node.*"

# Reset all relays to OFF
node scripts/emergency-relay-reset.js

# Restart services
./scripts/start-all-clean.sh
```

#### **Database Recovery**
```bash
# Backup current database
cp data/eform.db data/eform.db.backup

# Check and repair
sqlite3 data/eform.db "PRAGMA integrity_check;"
sqlite3 data/eform.db "VACUUM;"

# If corrupted, restore from backup or recreate
```

#### **Complete System Reset**
```bash
# Stop all services
sudo pkill -f "node.*"

# Clear logs
rm logs/*.log

# Reset database (WARNING: Loses all data)
rm data/eform.db

# Restart system
./scripts/start-all-clean.sh
```

---

## 👨‍💻 **Development Guide**

### **Development Environment Setup**

**Prerequisites**:
- Node.js 18+ 
- npm 8+
- Git
- SSH access to Raspberry Pi

**Local Development (Windows)**:
```powershell
# Clone repository
git clone https://github.com/mredag/eformLockerRoom.git
cd eformLockerRoom

# Install dependencies
npm install

# Build all services
npm run build:gateway
npm run build:kiosk  
npm run build:panel
```

**Remote Deployment (Raspberry Pi)**:
```bash
# SSH to Pi
ssh pi@pi-eform-locker

# Update code
cd /home/pi/eform-locker
git pull origin main

# Restart services
./scripts/start-all-clean.sh
```

### **Code Structure**

```
eformLockerRoom/
├── app/
│   ├── gateway/          # Gateway service
│   ├── kiosk/           # Kiosk service  
│   └── panel/           # Panel service
├── shared/              # Shared utilities
├── scripts/             # Utility scripts
├── logs/               # Service logs
├── data/               # Database files
└── docs/               # Documentation
```

### **Build Process**

**Individual Services**:
```bash
npm run build:gateway   # Build Gateway
npm run build:kiosk     # Build Kiosk
npm run build:panel     # Build Panel
```

**Development Workflow**:
1. Make changes on Windows PC
2. Build and test locally
3. Commit and push to Git
4. Deploy to Raspberry Pi
5. Test on actual hardware

### **Testing**

**Hardware Tests**:
```bash
# Test relay control
node scripts/test-basic-relay-control.js

# Test multiple relays
node scripts/test-relays-1-8.js

# Test Modbus communication
node scripts/test-modbus-simple.js
```

**API Tests**:
```bash
# Test service health
curl http://192.168.1.8:3002/health

# Test locker opening
curl -X POST http://192.168.1.8:3002/api/locker/open \
  -H "Content-Type: application/json" \
  -d '{"locker_id": 5, "staff_user": "test"}'
```

### **Code Quality**

**TypeScript Configuration**:
- Strict type checking enabled
- ES2018 target for Node.js compatibility
- CommonJS modules for better compatibility

**Best Practices**:
- Use TypeScript for type safety
- Implement comprehensive error handling
- Add detailed logging for debugging
- Follow consistent naming conventions
- Document all public APIs

---

## 🚀 **Deployment Guide**

### **Production Deployment**

#### **Hardware Setup**
1. **Raspberry Pi Configuration**:
   - Install Raspberry Pi OS (64-bit recommended)
   - Enable SSH and configure network
   - Install Node.js 18+ and npm
   - Configure USB permissions for serial devices

2. **Hardware Connections**:
   - Connect USB-RS485 adapter to Pi
   - Connect Waveshare relay cards via RS485
   - Connect RFID reader via USB
   - Test all connections

#### **Software Installation**
```bash
# Clone repository
git clone https://github.com/mredag/eformLockerRoom.git
cd eformLockerRoom

# Install dependencies
npm install

# Build all services
npm run build:gateway
npm run build:kiosk
npm run build:panel

# Set up permissions
chmod +x scripts/*.sh
sudo usermod -a -G dialout pi  # Add pi user to dialout group

# Create systemd services (optional)
sudo cp scripts/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable eform-gateway eform-kiosk eform-panel
```

#### **Configuration**

**Environment Variables**:
```bash
# Create .env file
cat > .env << EOF
NODE_ENV=production
DATABASE_PATH=data/eform.db
SERIAL_PORT=/dev/ttyUSB0
MASTER_PIN=1234
LOG_LEVEL=info
EOF
```

**Database Initialization**:
```bash
# Initialize database with default data
node scripts/init-database.js

# Add RFID cards
sqlite3 data/eform.db "INSERT INTO users (name, rfid_card_id) VALUES ('User 1', '0009652489');"
```

### **Service Management**

#### **Manual Start/Stop**
```bash
# Start all services
./scripts/start-all-clean.sh

# Stop all services  
sudo pkill -f "node.*"

# Restart specific service
sudo pkill -f "node.*kiosk"
npm run start:kiosk > logs/kiosk.log 2>&1 &
```

#### **Systemd Services** (Recommended for production)
```bash
# Start services
sudo systemctl start eform-gateway
sudo systemctl start eform-kiosk  
sudo systemctl start eform-panel

# Enable auto-start on boot
sudo systemctl enable eform-gateway
sudo systemctl enable eform-kiosk
sudo systemctl enable eform-panel

# Check status
sudo systemctl status eform-*
```

### **Backup and Recovery**

#### **Database Backup**
```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp data/eform.db backups/eform_${DATE}.db
find backups/ -name "eform_*.db" -mtime +7 -delete  # Keep 7 days
```

#### **Configuration Backup**
```bash
# Backup configuration
tar -czf config_backup_$(date +%Y%m%d).tar.gz \
  .env \
  data/eform.db \
  logs/ \
  scripts/
```

### **Security Considerations**

1. **Network Security**:
   - Use firewall to restrict access to service ports
   - Consider VPN for remote administration
   - Regular security updates

2. **Application Security**:
   - Change default master PIN
   - Implement rate limiting for API endpoints
   - Use HTTPS in production (with reverse proxy)
   - Regular backup of sensitive data

3. **Physical Security**:
   - Secure Raspberry Pi in locked enclosure
   - Protect USB connections
   - Monitor for unauthorized access

### **Performance Optimization**

1. **System Optimization**:
   - Increase GPU memory split: `gpu_mem=16`
   - Disable unnecessary services
   - Use fast SD card (Class 10 or better)

2. **Application Optimization**:
   - Enable database WAL mode for better concurrency
   - Implement connection pooling
   - Use PM2 for process management

3. **Monitoring Setup**:
   - Set up log rotation
   - Implement health check monitoring
   - Configure alerting for critical failures

---

## 📞 **Support and Maintenance**

### **Regular Maintenance Tasks**

**Daily**:
- Check service health
- Monitor log files for errors
- Verify hardware connections

**Weekly**:
- Database backup
- Log file rotation
- System updates

**Monthly**:
- Full system backup
- Performance review
- Security updates

### **Contact Information**

For technical support and development:
- **Repository**: https://github.com/mredag/eformLockerRoom
- **Documentation**: See project README and docs folder
- **Issues**: Use GitHub Issues for bug reports and feature requests

---

*This documentation is maintained as part of the eForm Locker System project. Last updated: August 2025*