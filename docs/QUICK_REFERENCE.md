# eForm Locker System - Quick Reference

## 🚀 **Quick Start Commands**

### **Service Management**
```bash
# Start all services (RECOMMENDED)
./scripts/start-all-clean.sh

# Stop all services
sudo pkill -f "node.*eform"

# Restart specific service
sudo pkill -f "node.*kiosk"
npm run start:kiosk > logs/kiosk.log 2>&1 &
```

### **Health Checks**
```bash
# Check all services
curl http://192.168.1.8:3000/health  # Gateway
curl http://192.168.1.8:3002/health  # Kiosk  
curl http://192.168.1.8:3001/health  # Panel

# Quick system status
./scripts/health-check.sh
```

### **Log Monitoring**
```bash
# Monitor all logs
tail -f logs/*.log

# Monitor RFID activity
tail -f logs/kiosk.log | grep -i "rfid\|session"

# Monitor errors
tail -f logs/*.log | grep -i "error\|failed"
```

---

## 🌐 **Access URLs**

- **Kiosk Interface**: http://192.168.1.8:3002
- **Admin Panel**: http://192.168.1.8:3001  
- **Relay Control**: http://192.168.1.8:3001/relay
- **Gateway API**: http://192.168.1.8:3000

---

## 🔧 **Hardware Testing**

### **Test Relay Control**
```bash
# Test basic relay
node scripts/test-basic-relay-control.js

# Test multiple relays
node scripts/test-relays-1-8.js

# Emergency reset all relays
node scripts/emergency-relay-reset.js
```

### **Check Hardware**
```bash
# Check USB-RS485 adapter
ls -la /dev/ttyUSB*

# Check RFID reader
lsusb | grep -i rfid

# Check port conflicts
sudo lsof /dev/ttyUSB0
```

---

## 🎯 **API Quick Tests**

### **RFID Card Processing**
```bash
curl -X POST http://192.168.1.8:3002/api/rfid/handle-card \
  -H "Content-Type: application/json" \
  -d '{"card_id": "0009652489", "kiosk_id": "kiosk-1"}'
```

### **Admin Locker Control**
```bash
curl -X POST http://192.168.1.8:3000/api/admin/lockers/5/open \
  -H "Content-Type: application/json" \
  -d '{"staff_user": "admin", "reason": "testing"}'
```

### **Direct Relay Control**
```bash
curl -X POST http://192.168.1.8:3001/api/relay/activate \
  -H "Content-Type: application/json" \
  -d '{"relay_number": 5, "staff_user": "tech", "reason": "test"}'
```

---

## 🗄️ **Database Quick Commands**

### **Check Locker Status**
```bash
sqlite3 data/eform.db "SELECT id, status, owner_key FROM lockers WHERE status != 'Free';"
```

### **Check Users**
```bash
sqlite3 data/eform.db "SELECT * FROM users;"
```

### **Add RFID User**
```bash
sqlite3 data/eform.db "INSERT INTO users (name, rfid_card_id) VALUES ('New User', '1234567890');"
```

### **Reset All Lockers**
```bash
sqlite3 data/eform.db "UPDATE lockers SET status='Free', owner_key=NULL, owned_at=NULL;"
```

---

## 🚨 **Emergency Procedures**

### **Complete System Reset**
```bash
# Stop all services
sudo pkill -f "node.*"

# Reset hardware
node scripts/emergency-relay-reset.js

# Clear logs (optional)
rm logs/*.log

# Restart system
./scripts/start-all-clean.sh
```

### **Fix Common Issues**

#### **Port Busy Error**
```bash
sudo lsof /dev/ttyUSB0
sudo pkill -f "node.*"
./scripts/start-all-clean.sh
```

#### **Database Locked**
```bash
sudo pkill -f "node.*"
sqlite3 data/eform.db "PRAGMA integrity_check;"
./scripts/start-all-clean.sh
```

#### **Service Won't Start**
```bash
# Check logs
tail -20 logs/kiosk.log

# Check permissions
ls -la data/eform.db
sudo chmod 664 data/eform.db

# Rebuild and restart
npm run build:kiosk
./scripts/start-all-clean.sh
```

---

## 📊 **Monitoring Commands**

### **System Performance**
```bash
# CPU and memory
top -bn1 | grep "Cpu(s)\|MiB Mem"

# Disk space
df -h /

# Service response times
time curl -s http://localhost:3002/health
```

### **Log Analysis**
```bash
# Error count last hour
grep "$(date -d '1 hour ago' '+%Y-%m-%d %H')" logs/*.log | grep -i error | wc -l

# RFID activity
grep "RFID Card Detected" logs/kiosk.log | tail -10

# Session activity
grep -i "session" logs/kiosk.log | tail -10
```

---

## 🔑 **RFID Cards**

### **Currently Registered**
- **Card 1**: `0009652489` → "Card User 1"
- **Card 2**: `0009652490` → "Card User 2"

### **Test Flow**
1. Scan card → User recognized → Locker selection shown
2. Click locker → Relay activates → Locker assigned
3. Scan same card → Locker opens → Assignment released

---

## 📝 **Build & Deploy**

### **Local Development (Windows)**
```powershell
# Build services
npm run build:gateway
npm run build:kiosk
npm run build:panel

# Commit and push
git add .
git commit -m "Description"
git push origin main
```

### **Deploy to Pi**
```bash
ssh pi@pi-eform-locker "cd /home/pi/eform-locker && git pull origin main && ./scripts/start-all-clean.sh"
```

---

## 📞 **Support**

### **Documentation**
- `SYSTEM_DOCUMENTATION.md` - Complete system docs
- `API_REFERENCE.md` - API documentation
- `MONITORING_GUIDE.md` - Monitoring and troubleshooting
- `PROJECT_COMPLETE_SUMMARY.md` - Project overview

### **Key Scripts**
- `./scripts/start-all-clean.sh` - Start all services
- `./scripts/health-check.sh` - System health check
- `./scripts/test-basic-relay-control.js` - Hardware test
- `./scripts/emergency-relay-reset.js` - Emergency reset

---

*Keep this reference handy for quick system operations and troubleshooting!*