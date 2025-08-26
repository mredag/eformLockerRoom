# eForm Locker System - Documentation

## 📚 **Documentation Overview**

Welcome to the comprehensive documentation for the eForm Locker System. This documentation suite provides everything you need to understand, deploy, operate, and maintain the system.

---

## 📋 **Documentation Structure**

### **🏗️ [System Documentation](SYSTEM_DOCUMENTATION.md)**
**Complete technical overview and architecture guide**
- System architecture and service design
- Hardware integration specifications
- Database schema and relationships
- Deployment and configuration guides
- Security considerations and best practices

### **📡 [API Reference](API_REFERENCE.md)**
**Comprehensive API documentation for all services**
- Complete endpoint documentation with examples
- Request/response formats and error codes
- Authentication and session management
- Testing examples and integration guides
- Rate limiting and performance considerations

### **📊 [Monitoring Guide](MONITORING_GUIDE.md)**
**System monitoring, logging, and troubleshooting**
- Real-time monitoring strategies and scripts
- Log analysis techniques and tools
- Performance monitoring and alerting
- Troubleshooting procedures for common issues
- Emergency procedures and maintenance checklists

### **⚡ [Quick Reference](QUICK_REFERENCE.md)**
**Essential commands and operations for daily use**
- Quick start commands and service management
- Common API testing commands
- Hardware testing and diagnostics
- Database operations and queries
- Emergency procedures and fixes

---

## 📁 **Additional Documentation**

### **Deployment & Setup**
- **[Deployment Guide](DEPLOYMENT.md)** - Production deployment procedures
- **[Development Environment Setup](DEVELOPMENT_ENVIRONMENT_SETUP.md)** - Local development setup
- **[Raspberry Pi Environment Setup](RASPBERRY_PI_ENVIRONMENT_SETUP.md)** - Pi-specific configuration

### **Project History & Improvements**
- **[Production Ready Summary](PRODUCTION_READY_SUMMARY.md)** - Project completion overview
- **[Cross Platform Improvements](CROSS_PLATFORM_IMPROVEMENTS.md)** - Platform compatibility enhancements

### **Troubleshooting Reports**
- **[troubleshooting/](troubleshooting/)** - Historical issue reports and solutions
  - Command queue database path issues
  - Direct relay troubleshooting procedures
  - Raspberry Pi migration fixes

---

## 🚀 **Getting Started**

### **For New Developers**
1. Start with **[System Documentation](SYSTEM_DOCUMENTATION.md)** to understand the architecture
2. Use **[Quick Reference](QUICK_REFERENCE.md)** for immediate productivity
3. Refer to **[API Reference](API_REFERENCE.md)** for integration work
4. Keep **[Monitoring Guide](MONITORING_GUIDE.md)** handy for troubleshooting

### **For System Administrators**
1. Review **[System Documentation](SYSTEM_DOCUMENTATION.md)** deployment section
2. Set up monitoring using **[Monitoring Guide](MONITORING_GUIDE.md)**
3. Bookmark **[Quick Reference](QUICK_REFERENCE.md)** for daily operations
4. Use **[API Reference](API_REFERENCE.md)** for system integration

### **For Support Teams**
1. Use **[Quick Reference](QUICK_REFERENCE.md)** for immediate issue resolution
2. Follow **[Monitoring Guide](MONITORING_GUIDE.md)** troubleshooting procedures
3. Reference **[API Reference](API_REFERENCE.md)** for API-related issues
4. Consult **[System Documentation](SYSTEM_DOCUMENTATION.md)** for complex problems

---

## 🎯 **System Overview**

The **eForm Locker System** is a distributed IoT solution for automated locker management featuring:

### **Key Components**
- **Gateway Service** (Port 3000): API coordination and admin management
- **Kiosk Service** (Port 3002): Hardware control and RFID processing
- **Panel Service** (Port 3001): Web administration and direct relay control

### **Hardware Integration**
- **Raspberry Pi 4**: Main controller with Linux OS
- **USB-RS485 Adapter**: Modbus RTU communication
- **Waveshare Relay Cards**: Physical locker control
- **Sycreader RFID Reader**: Card-based authentication

### **Key Features**
- ✅ **Multi-User RFID Support**: Session-based card management
- ✅ **Real-time Hardware Control**: Direct relay activation via Modbus
- ✅ **Web Administration**: Complete locker management interface
- ✅ **Fault Tolerance**: Automatic service recovery and health monitoring
- ✅ **Production Ready**: Comprehensive monitoring and documentation

---

## 🌐 **System Access**

### **Web Interfaces**
- **Kiosk Interface**: http://192.168.1.8:3002 (User RFID interface)
- **Admin Panel**: http://192.168.1.8:3001 (Locker management)
- **Relay Control**: http://192.168.1.8:3001/relay (Direct hardware control)
- **Gateway API**: http://192.168.1.8:3000 (API endpoints)

### **Service Health Checks**
```bash
curl http://192.168.1.8:3000/health  # Gateway
curl http://192.168.1.8:3002/health  # Kiosk
curl http://192.168.1.8:3001/health  # Panel
```

---

## 🔧 **Quick Operations**

### **Start All Services**
```bash
./scripts/start-all-clean.sh
```

### **Monitor System**
```bash
# Real-time logs
tail -f logs/*.log

# System health
./scripts/health-check.sh

# Performance monitoring
./scripts/performance-monitor.sh
```

### **Test Hardware**
```bash
# Test relay control
node scripts/test-basic-relay-control.js

# Test RFID processing
curl -X POST http://192.168.1.8:3002/api/rfid/handle-card \
  -H "Content-Type: application/json" \
  -d '{"card_id": "0009652489", "kiosk_id": "kiosk-1"}'
```

---

## 📊 **System Status**

### **Current Configuration**
- **RFID Cards Registered**: 2 active cards
- **Lockers Available**: 30 total (8 hardware-tested)
- **Services**: 3 microservices running
- **Database**: SQLite with WAL mode
- **Hardware**: Modbus RTU over RS485

### **Production Readiness**
- ✅ **Multi-user RFID support** with session management
- ✅ **Hardware integration** with reliable relay control
- ✅ **Web interfaces** for users and administrators
- ✅ **Comprehensive monitoring** and alerting
- ✅ **Complete documentation** and troubleshooting guides

---

## 🛠️ **Maintenance**

### **Daily Tasks**
- Check service health: `./scripts/health-check.sh`
- Monitor error logs: `tail -f logs/*.log | grep -i error`
- Verify hardware connectivity: `ls /dev/ttyUSB* && lsusb | grep -i rfid`

### **Weekly Tasks**
- Rotate logs: `./scripts/rotate-logs.sh`
- Database maintenance: `sqlite3 data/eform.db "VACUUM; ANALYZE;"`
- Performance review: `./scripts/performance-monitor.sh`

### **Emergency Procedures**
- Complete restart: `./scripts/start-all-clean.sh`
- Hardware reset: `node scripts/emergency-relay-reset.js`
- Database recovery: See [Monitoring Guide](MONITORING_GUIDE.md)

---

## 📞 **Support**

### **Documentation Files**
- **[SYSTEM_DOCUMENTATION.md](SYSTEM_DOCUMENTATION.md)** - Complete technical documentation
- **[API_REFERENCE.md](API_REFERENCE.md)** - API endpoints and integration
- **[MONITORING_GUIDE.md](MONITORING_GUIDE.md)** - Operations and troubleshooting
- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - Essential commands and procedures

### **Key Scripts**
- `./scripts/start-all-clean.sh` - Start all services cleanly
- `./scripts/health-check.sh` - System health monitoring
- `./scripts/test-basic-relay-control.js` - Hardware functionality test
- `./scripts/emergency-relay-reset.js` - Emergency hardware reset

### **Project Repository**
- **GitHub**: https://github.com/mredag/eformLockerRoom
- **Issues**: Use GitHub Issues for bug reports and feature requests
- **Development**: See steering guides in `.kiro/steering/`

---

## 🎉 **Project Status**

The eForm Locker System is **production-ready** with:
- ✅ **Complete functionality** tested and verified
- ✅ **Professional documentation** for all aspects
- ✅ **Monitoring and alerting** systems in place
- ✅ **Emergency procedures** documented and tested
- ✅ **Multi-user support** with RFID session management

**Last Updated**: August 2025  
**Version**: 1.0.0  
**Status**: Production Ready

---

*This documentation is maintained as part of the eForm Locker System project. For the latest updates, check the project repository.*