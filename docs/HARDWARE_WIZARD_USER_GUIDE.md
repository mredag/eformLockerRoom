# 🔧 Hardware Configuration Wizard - Complete User Guide

## 📋 Overview

The Hardware Configuration Wizard is a comprehensive tool for setting up and managing relay cards in your eForm Locker System. It provides a step-by-step guided process with enterprise-grade security, real-time monitoring, and automatic error recovery.

## 🚀 Quick Start

### 1. Access the Wizard

**Admin Panel Access:**
```
http://192.168.1.8:3001/wizard/hardware-wizard
```

**Login Requirements:**
- **Admin Users**: Full access to all wizard features
- **Staff Users**: Limited access (view, scan, test only)

### 2. Pre-Setup Checklist

Before starting the wizard, ensure:

✅ **Hardware Connected**
- USB-RS485 adapter connected to Raspberry Pi
- Relay cards connected via Modbus RTU
- Power supply connected to relay cards

✅ **System Requirements**
- Panel service running on port 3001
- Database migrations applied (including migration 021)
- Serial port `/dev/ttyUSB0` available

✅ **Permissions**
- Admin account for full configuration
- Staff account for testing and monitoring

## 🛠️ Step-by-Step Wizard Process

### Step 1: Pre-Setup Checklist
- **Purpose**: Verify hardware and system readiness
- **Actions**: Check connections, power, and system status
- **Security**: Basic authentication required

### Step 2: Device Detection
- **Purpose**: Scan for connected relay cards
- **Process**: 
  - Scans serial ports for Modbus devices
  - Detects existing relay cards
  - Identifies new hardware
- **Security**: Requires `SCAN_DEVICES` permission

### Step 3: Address Configuration
- **Purpose**: Set unique slave addresses for each relay card
- **Features**:
  - Automatic address assignment
  - Conflict detection and resolution
  - Broadcast configuration support
- **Security**: Requires `CONFIGURE_ADDRESSES` permission

### Step 4: Testing & Validation
- **Purpose**: Verify hardware functionality
- **Tests**:
  - Communication test with each card
  - Individual relay activation test
  - Full system validation
- **Security**: Requires `TEST_HARDWARE` permission

### Step 5: System Integration
- **Purpose**: Integrate configured hardware with locker system
- **Actions**:
  - Update system configuration
  - Map relays to lockers
  - Apply configuration changes
- **Security**: Requires `MODIFY_CONFIGURATION` permission

## 🔐 Security Features

### Role-Based Access Control

**Admin Users Can:**
- Run complete wizard process
- Configure slave addresses
- Modify system settings
- Access security dashboard
- Trigger emergency stop

**Staff Users Can:**
- View hardware status
- Run device scans
- Test hardware functionality
- View audit logs (limited)

### Security Monitoring

**Real-Time Monitoring:**
- All operations are logged and monitored
- Suspicious activity detection
- Automatic threat response
- Rate limiting per user/operation

**Security Dashboard:**
```
http://192.168.1.8:3001/api/wizard/security/dashboard
```

### Emergency Stop

**When to Use:**
- Security breach detected
- Hardware malfunction
- Unauthorized access attempt

**How to Activate:**
```bash
curl -X POST http://192.168.1.8:3001/api/wizard/security/emergency-stop \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: YOUR_TOKEN" \
  -d '{"reason": "Security breach detected"}'
```

## 📊 Monitoring & Diagnostics

### Performance Dashboard
```
http://192.168.1.8:3001/wizard/performance-dashboard
```

**Features:**
- Real-time operation metrics
- Resource usage monitoring
- Performance recommendations
- System health indicators

### Security Dashboard
```
http://192.168.1.8:3001/api/wizard/security/dashboard
```

**Features:**
- Active security alerts
- Audit log summary
- Risk analysis
- User activity monitoring

### Hardware Dashboard
```
http://192.168.1.8:3001/hardware-dashboard
```

**Features:**
- Device status overview
- Connection health
- Hardware diagnostics
- System integration status

## 🔧 Advanced Configuration

### Manual Configuration Mode

For advanced users who need direct hardware control:

```javascript
// Access manual configuration
const manualConfig = {
  address: 1,
  register: 0x4000,
  value: 5,
  functionCode: 6
};

// Send manual command
fetch('/api/wizard/manual-configuration', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken
  },
  body: JSON.stringify(manualConfig)
});
```

### Bulk Configuration

Configure multiple devices simultaneously:

```javascript
const bulkConfig = {
  startAddress: 1,
  count: 3,
  configuration: {
    baudRate: 9600,
    parity: 'none',
    stopBits: 1
  }
};
```

### Configuration Templates

Save and reuse common configurations:

```javascript
const template = {
  name: "Standard Relay Setup",
  description: "Default configuration for 16-relay cards",
  configuration: {
    addresses: [1, 2, 3],
    settings: {
      timeout: 1000,
      retries: 3
    }
  }
};
```

## 🚨 Troubleshooting

### Common Issues

**1. Device Not Detected**
```bash
# Check serial port
ls -la /dev/ttyUSB*

# Test port permissions
sudo chmod 666 /dev/ttyUSB0

# Verify hardware connection
node scripts/test-basic-relay-control.js
```

**2. Address Conflicts**
- Use wizard's automatic conflict resolution
- Check existing device addresses
- Manually assign unique addresses

**3. Communication Errors**
- Verify baud rate (9600)
- Check cable connections
- Test with different timeout values

**4. Permission Denied**
- Verify user role and permissions
- Check session validity
- Ensure CSRF token is valid

### Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| WIZ001 | Device not found | Check hardware connections |
| WIZ002 | Address conflict | Use address resolution wizard |
| WIZ003 | Communication timeout | Increase timeout, check cables |
| WIZ004 | Permission denied | Check user role and permissions |
| WIZ005 | Rate limit exceeded | Wait and retry, or contact admin |

### Recovery Procedures

**Emergency Recovery:**
```bash
# Stop all services
sudo killall node

# Reset hardware
node scripts/emergency-relay-reset.js

# Restart services
./scripts/start-all-clean.sh
```

**Configuration Rollback:**
```bash
# View configuration history
curl http://192.168.1.8:3001/api/wizard/config-changes

# Rollback to previous configuration
curl -X POST http://192.168.1.8:3001/api/wizard/rollback \
  -d '{"changeId": "previous-config-id"}'
```

## 📈 Performance Optimization

### Best Practices

1. **Sequential Configuration**: Configure devices one at a time
2. **Optimal Timing**: Use recommended delays between operations
3. **Error Handling**: Always check operation results
4. **Resource Management**: Monitor system resources during configuration

### Performance Monitoring

```javascript
// Monitor wizard performance
const performanceData = await fetch('/api/wizard/performance/metrics');
const metrics = await performanceData.json();

console.log('Average response time:', metrics.averageResponseTime);
console.log('Success rate:', metrics.successRate);
```

## 🔄 Integration with Existing System

### Locker Mapping

After hardware configuration, map relays to lockers:

```javascript
const lockerMapping = {
  lockerId: 1,
  relayCard: 1,
  relayNumber: 1,
  kioskId: 'kiosk-1'
};
```

### System Configuration Update

The wizard automatically updates:
- `config/system.json`
- Database locker mappings
- Hardware configuration cache
- Service configurations

### Validation

Verify integration:
```bash
# Test locker operation
curl -X POST http://192.168.1.8:3002/api/locker/open \
  -H "Content-Type: application/json" \
  -d '{"locker_id": 1, "staff_user": "admin", "reason": "testing"}'
```

## 📚 API Reference

### Core Endpoints

**Start Wizard Session:**
```
POST /api/wizard/session
```

**Device Detection:**
```
POST /api/wizard/detect-devices
```

**Configure Address:**
```
POST /api/wizard/configure-address
```

**Test Hardware:**
```
POST /api/wizard/test-hardware
```

**Finalize Configuration:**
```
POST /api/wizard/finalize
```

### Security Endpoints

**Security Dashboard:**
```
GET /api/wizard/security/dashboard
```

**Audit Logs:**
```
GET /api/wizard/security/audit-logs
```

**Emergency Stop:**
```
POST /api/wizard/security/emergency-stop
```

## 🎯 Tips for Success

1. **Plan Your Setup**: Know your hardware layout before starting
2. **Test Incrementally**: Validate each step before proceeding
3. **Monitor Security**: Keep an eye on the security dashboard
4. **Document Changes**: Use the audit log for troubleshooting
5. **Regular Maintenance**: Run periodic hardware tests

## 📞 Support

For additional help:
- Check the troubleshooting guide: `docs/hardware-wizard-troubleshooting.md`
- Review error codes: `docs/hardware-wizard-error-codes.md`
- API documentation: `docs/hardware-wizard-api-documentation.md`
- Developer guide: `docs/hardware-wizard-developer-guide.md`

---

**🎉 Congratulations!** You now have a comprehensive understanding of the Hardware Configuration Wizard. The system provides enterprise-grade security, monitoring, and automation to make hardware setup as smooth as possible.