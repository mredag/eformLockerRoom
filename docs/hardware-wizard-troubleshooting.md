# Hardware Configuration Wizard - Troubleshooting Guide

## Overview

This comprehensive troubleshooting guide helps you diagnose and resolve issues with the Hardware Configuration Wizard. The guide is organized by problem category and provides step-by-step solutions, from basic checks to advanced recovery procedures.

**How to Use This Guide**:
1. Identify your problem category
2. Follow the diagnostic steps in order
3. Apply the recommended solutions
4. Escalate to support if issues persist

**Quick Reference**:
- 🔍 **Diagnostic Steps**: How to identify the problem
- ⚡ **Quick Fixes**: Fast solutions for common issues
- 🛠️ **Detailed Solutions**: Step-by-step resolution procedures
- 🚨 **Emergency Procedures**: Critical issue resolution

## Problem Categories

### 1. Connection and Communication Issues

#### Problem: No USB-RS485 Adapter Detected

**Symptoms**:
- Wizard shows "No serial ports found"
- Device detection step cannot proceed
- Error message: "SerialPort module not available"

**Diagnostic Steps**:
```bash
# Linux/Raspberry Pi
ls -la /dev/ttyUSB*
lsusb | grep -i "serial\|ftdi\|prolific"

# Windows
# Check Device Manager > Ports (COM & LPT)
```

**Quick Fixes**:
1. **Reconnect USB**: Unplug and reconnect USB-RS485 adapter
2. **Try Different Port**: Use different USB port
3. **Check Cable**: Verify USB cable is not damaged

**Detailed Solutions**:

**Solution 1: Driver Installation**
```bash
# Linux - Install FTDI drivers
sudo apt update
sudo apt install libftdi1-dev

# Check if device is recognized
dmesg | tail -20
```

**Solution 2: Permission Fix**
```bash
# Add user to dialout group
sudo usermod -a -G dialout $USER

# Set port permissions
sudo chmod 666 /dev/ttyUSB0

# Restart session or reboot
```

**Solution 3: Module Installation**
```bash
# Install SerialPort module if missing
npm install serialport

# Rebuild native modules
npm rebuild
```

**Advanced Diagnostics**:
```bash
# Test serial port directly
echo "test" > /dev/ttyUSB0

# Monitor kernel messages
sudo dmesg -w
# Then plug/unplug adapter to see messages
```

#### Problem: Device Not Responding

**Symptoms**:
- Device detection finds no devices
- Communication timeout errors
- Error code: HARDWARE_002

**Diagnostic Steps**:
1. **Visual Inspection**: Check for power LEDs on relay card
2. **Voltage Check**: Measure power supply voltage (should be 12V DC)
3. **Connection Check**: Verify RS485 A+ and B- connections
4. **Isolation Test**: Disconnect other devices on RS485 bus

**Quick Fixes**:
1. **Power Cycle**: Turn relay card off and on
2. **Check Connections**: Ensure RS485 wires are secure
3. **Verify Power**: Confirm 12V DC power supply is working

**Detailed Solutions**:

**Solution 1: Power Supply Verification**
```bash
# Check power supply specifications
# Relay card typically needs:
# - Voltage: 12V DC (±10%)
# - Current: 2-3A per 16-channel card
# - Ripple: <100mV

# Measure voltage at relay card terminals
# Should read 11.5V - 12.5V DC
```

**Solution 2: RS485 Wiring Check**
```
Correct RS485 Connections:
USB-RS485 Adapter    →    Relay Card
A+ (or D+)          →    A+ (or D+)
B- (or D-)          →    B- (or D-)
GND                 →    GND (if available)

Common Wiring Mistakes:
❌ A+ connected to B-
❌ Missing ground connection
❌ Loose terminal connections
❌ Wrong terminal blocks used
```

**Solution 3: Communication Settings**
```javascript
// Verify Modbus settings match device
const modbusSettings = {
  baudRate: 9600,    // Most common
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  timeout: 5000      // 5 second timeout
};
```

**Advanced Diagnostics**:
```bash
# Use Modbus testing tool
# Install mbpoll (Linux)
sudo apt install mbpoll

# Test communication
mbpoll -m rtu -b 9600 -P none -a 1 -r 1 -c 1 /dev/ttyUSB0

# Expected output: Register value or timeout
```

#### Problem: Multiple Devices Conflict

**Symptoms**:
- Multiple devices respond to same address
- Inconsistent communication
- Address configuration fails

**Diagnostic Steps**:
1. **Address Scan**: Use wizard's device detection to identify all addresses
2. **Isolation Test**: Power on one device at a time
3. **Factory Reset**: Reset devices to factory defaults if possible

**Solutions**:

**Solution 1: Sequential Configuration**
```
Step-by-step process:
1. Power off all relay cards
2. Connect only one card
3. Configure to unique address (e.g., address 1)
4. Power off configured card
5. Connect next card
6. Configure to next address (e.g., address 2)
7. Repeat for all cards
8. Power on all cards together
```

**Solution 2: Address Conflict Resolution**
```javascript
// Wizard automatically handles conflicts by:
1. Detecting all responding addresses
2. Finding next available address
3. Using broadcast (address 0) to configure
4. Verifying new address works
5. Updating system configuration
```

### 2. Device Detection Issues

#### Problem: Wrong Device Type Detected

**Symptoms**:
- Device detected but wrong model/capabilities shown
- Incorrect channel count
- Missing features

**Diagnostic Steps**:
1. **Manual Identification**: Check device labels and documentation
2. **Register Reading**: Read device identification registers
3. **Feature Testing**: Test specific device capabilities

**Solutions**:

**Solution 1: Manual Device Override**
```javascript
// In manual configuration mode:
const deviceOverride = {
  manufacturer: 'waveshare',
  model: '16CH Relay',
  channels: 16,
  features: ['software_addressing', 'timed_pulse'],
  customProperties: {
    firmwareVersion: '2.1',
    supportedFunctions: [1, 5, 6, 15, 16]
  }
};
```

**Solution 2: Device Profile Update**
```javascript
// Add new device profile to detection service
private async identifyCustomDevice(address: number): Promise<DeviceType> {
  // Read device-specific identification register
  const deviceId = await this.readRegister(address, 0x1000);
  
  if (deviceId === 0x5678) {
    return {
      manufacturer: 'custom',
      model: 'CustomRelay32CH',
      channels: 32,
      features: ['custom_addressing']
    };
  }
  
  return this.identifyGenericDevice(address);
}
```

#### Problem: Device Detection Timeout

**Symptoms**:
- Scanning takes too long
- Timeout errors during detection
- Partial scan results

**Solutions**:

**Solution 1: Optimize Scan Parameters**
```javascript
// Reduce scan range for faster detection
const scanConfig = {
  startAddress: 1,
  endAddress: 10,     // Instead of 255
  timeout: 2000,      // 2 seconds per address
  retries: 2          // Reduce retry attempts
};
```

**Solution 2: Batch Scanning**
```javascript
// Scan in smaller batches
const batchSize = 5;
for (let i = 1; i <= 255; i += batchSize) {
  const batch = await scanAddressRange(i, i + batchSize - 1);
  // Process batch results
  await delay(1000); // Pause between batches
}
```

### 3. Address Configuration Problems

#### Problem: Address Configuration Fails

**Symptoms**:
- Cannot set device address
- Error code: HARDWARE_200
- Address verification fails

**Diagnostic Steps**:
1. **Device Compatibility**: Verify device supports software addressing
2. **Communication Test**: Ensure basic communication works
3. **Register Access**: Test reading/writing to address register

**Solutions**:

**Solution 1: Broadcast Configuration Method**
```javascript
// Use proven Waveshare method
const configureAddress = async (newAddress) => {
  const command = Buffer.alloc(8);
  command[0] = 0x00;        // Broadcast address
  command[1] = 0x06;        // Write Single Register
  command[2] = 0x40;        // Register 0x4000 high byte
  command[3] = 0x00;        // Register 0x4000 low byte
  command[4] = 0x00;        // New address high byte
  command[5] = newAddress;  // New address low byte
  
  const crc = calculateCRC16(command.subarray(0, 6));
  command[6] = crc & 0xFF;
  command[7] = (crc >> 8) & 0xFF;
  
  return await sendCommand(command);
};
```

**Solution 2: Manual DIP Switch Configuration**
```
If software addressing fails:
1. Locate DIP switches on relay card
2. Set switches according to desired address:
   Address 1: Switch 1 ON, others OFF
   Address 2: Switch 2 ON, others OFF
   Address 3: Switches 1+2 ON, others OFF
   etc.
3. Power cycle the device
4. Test communication at new address
```

**Solution 3: Alternative Configuration Methods**
```javascript
// Try different function codes
const alternativeMethods = [
  { function: 0x06, register: 0x4000 }, // Standard method
  { function: 0x10, register: 0x4000 }, // Write multiple registers
  { function: 0x06, register: 0x0000 }, // Alternative register
];

for (const method of alternativeMethods) {
  try {
    await configureWithMethod(method);
    break; // Success
  } catch (error) {
    console.log(`Method ${method.function} failed:`, error);
  }
}
```

#### Problem: Address Conflicts

**Symptoms**:
- Multiple devices respond to same address
- Inconsistent responses
- Configuration verification fails

**Solutions**:

**Solution 1: Automatic Conflict Resolution**
```javascript
const resolveAddressConflicts = async () => {
  // 1. Detect all conflicts
  const conflicts = await detectAddressConflicts();
  
  // 2. For each conflict, reassign addresses
  for (const conflict of conflicts) {
    const newAddress = await findNextAvailableAddress();
    
    // 3. Use physical isolation method
    await isolateAndReconfigure(conflict.address, newAddress);
  }
  
  // 4. Verify all devices have unique addresses
  return await verifyUniqueAddresses();
};
```

**Solution 2: Physical Isolation Method**
```
Manual conflict resolution:
1. Power off all devices
2. Power on first conflicted device only
3. Configure to new unique address
4. Power off first device
5. Power on second conflicted device
6. Configure to different unique address
7. Power on all devices and verify
```

### 4. Testing and Validation Issues

#### Problem: Relay Tests Fail

**Symptoms**:
- No physical relay clicks
- Test timeouts
- Error code: HARDWARE_301

**Diagnostic Steps**:
1. **Power Check**: Verify adequate power supply current
2. **Load Test**: Check if relays work under load
3. **Individual Testing**: Test each relay separately
4. **Visual Inspection**: Look for physical damage

**Solutions**:

**Solution 1: Power Supply Verification**
```
Power Requirements Check:
- Each relay coil: ~20-30mA
- 16 relays simultaneously: ~500mA
- Plus control circuit: ~100mA
- Total per card: ~600mA minimum
- Recommended: 2-3A per card for safety margin

Power Supply Test:
1. Measure voltage under load
2. Should remain 11.5V-12.5V during relay activation
3. If voltage drops significantly, upgrade power supply
```

**Solution 2: Individual Relay Testing**
```javascript
// Test each relay individually
const testAllRelays = async (address) => {
  const results = [];
  
  for (let relay = 1; relay <= 16; relay++) {
    try {
      // Activate relay
      await activateRelay(address, relay);
      await delay(500);
      
      // Deactivate relay
      await deactivateRelay(address, relay);
      
      results.push({ relay, success: true });
    } catch (error) {
      results.push({ relay, success: false, error: error.message });
    }
    
    // Delay between tests
    await delay(200);
  }
  
  return results;
};
```

**Solution 3: Load Testing**
```javascript
// Test with actual load connected
const testWithLoad = async (address, relay) => {
  // Connect test load (LED + resistor or small bulb)
  // Activate relay and measure output
  
  await activateRelay(address, relay);
  
  // Check if load is powered
  const loadPowered = await checkLoadStatus();
  
  await deactivateRelay(address, relay);
  
  return loadPowered;
};
```

#### Problem: Communication Tests Intermittent

**Symptoms**:
- Tests sometimes pass, sometimes fail
- Inconsistent response times
- Random timeouts

**Solutions**:

**Solution 1: Improve Signal Quality**
```
Signal Quality Improvements:
1. Use shielded RS485 cable
2. Add 120Ω termination resistors at both ends
3. Keep RS485 cable length under 1000m
4. Separate from power cables
5. Use twisted pair cable (Cat5/Cat6 works)
```

**Solution 2: Adjust Communication Parameters**
```javascript
// More robust communication settings
const robustSettings = {
  baudRate: 9600,      // Lower baud rate for reliability
  timeout: 10000,      // Longer timeout
  retries: 5,          // More retry attempts
  retryDelay: 1000,    // Delay between retries
  frameDelay: 100      // Delay between frames
};
```

**Solution 3: Environmental Factors**
```
Check for interference sources:
- Fluorescent lights
- Motor drives
- Switching power supplies
- WiFi routers
- Cell phones

Solutions:
- Move equipment away from interference sources
- Use ferrite cores on cables
- Improve grounding
- Shield sensitive equipment
```

### 5. System Integration Problems

#### Problem: Configuration Update Fails

**Symptoms**:
- Cannot save new configuration
- File permission errors
- Error code: HARDWARE_500

**Solutions**:

**Solution 1: Permission Fix**
```bash
# Check file permissions
ls -la config/system.json

# Fix permissions if needed
sudo chown $USER:$USER config/system.json
chmod 644 config/system.json

# Check directory permissions
sudo chown -R $USER:$USER config/
```

**Solution 2: Disk Space Check**
```bash
# Check available disk space
df -h

# Clean up if needed
sudo apt autoremove
sudo apt autoclean

# Clear logs if necessary
sudo journalctl --vacuum-time=7d
```

**Solution 3: Configuration Backup and Recovery**
```bash
# Create backup before changes
cp config/system.json config/system.json.backup

# If update fails, restore backup
cp config/system.json.backup config/system.json

# Verify configuration integrity
node scripts/validate-config.js
```

#### Problem: Service Restart Fails

**Symptoms**:
- Services won't restart after configuration
- System becomes unresponsive
- Error code: HARDWARE_501

**Solutions**:

**Solution 1: Manual Service Restart**
```bash
# Stop all services
sudo pkill -f "node.*eform"

# Wait for processes to stop
sleep 5

# Start services individually
npm run start:gateway &
sleep 2
npm run start:kiosk &
sleep 2
npm run start:panel &

# Check service status
ps aux | grep node
```

**Solution 2: Service Dependency Check**
```bash
# Check for port conflicts
sudo netstat -tulpn | grep :300

# Kill processes using required ports
sudo kill $(sudo lsof -t -i:3000)
sudo kill $(sudo lsof -t -i:3001)
sudo kill $(sudo lsof -t -i:3002)

# Restart services
./scripts/start-all-clean.sh
```

**Solution 3: System Resource Check**
```bash
# Check memory usage
free -h

# Check CPU usage
top

# Check disk I/O
iostat 1 5

# If resources are low:
# - Close unnecessary applications
# - Restart system if needed
# - Check for memory leaks
```

### 6. Emergency Procedures

#### Emergency Stop Procedure

**When to Use**:
- Hardware malfunction detected
- Safety concerns
- System behaving unexpectedly
- Smoke or burning smell

**Immediate Actions**:
1. **Click Emergency Stop**: Red button in wizard interface
2. **Power Off**: Disconnect power to relay cards
3. **Assess Situation**: Check for visible damage or hazards
4. **Document Issue**: Note what happened before the emergency

**Emergency Stop Implementation**:
```javascript
const emergencyStop = async () => {
  try {
    // Deactivate all relays immediately
    const promises = [];
    for (let address = 1; address <= 10; address++) {
      for (let relay = 1; relay <= 16; relay++) {
        promises.push(
          deactivateRelay(address, relay).catch(() => {
            // Ignore errors during emergency stop
          })
        );
      }
    }
    
    await Promise.allSettled(promises);
    
    // Stop all wizard operations
    await cancelAllOperations();
    
    // Log emergency stop
    console.error('EMERGENCY STOP ACTIVATED');
    
  } catch (error) {
    console.error('Emergency stop failed:', error);
    // Physical power disconnection may be required
  }
};
```

#### System Recovery Procedure

**When System Becomes Unresponsive**:

**Step 1: Soft Recovery**
```bash
# Refresh browser page
# Log in again if needed
# Check if wizard session can be resumed
```

**Step 2: Service Recovery**
```bash
# Restart services
sudo systemctl restart eform-gateway
sudo systemctl restart eform-kiosk
sudo systemctl restart eform-panel

# Or use manual restart
./scripts/start-all-clean.sh
```

**Step 3: Hard Recovery**
```bash
# If services won't restart, reboot system
sudo reboot

# After reboot, check service status
systemctl status eform-*
```

**Step 4: Configuration Recovery**
```bash
# If configuration is corrupted, restore backup
cp config/system.json.backup config/system.json

# Validate configuration
node scripts/validate-config.js

# Restart services
./scripts/start-all-clean.sh
```

#### Data Recovery Procedure

**If Database Becomes Corrupted**:

```bash
# Check database integrity
sqlite3 data/eform.db "PRAGMA integrity_check;"

# If corruption detected, restore from backup
cp data/eform.db.backup data/eform.db

# If no backup available, try repair
sqlite3 data/eform.db ".recover" > recovered.sql
sqlite3 data/eform_new.db < recovered.sql
mv data/eform.db data/eform.db.corrupted
mv data/eform_new.db data/eform.db
```

### 7. Advanced Diagnostics

#### Network Diagnostics

**Check Network Connectivity**:
```bash
# Test local network
ping 192.168.1.1

# Check port accessibility
telnet localhost 3001
telnet localhost 3002

# Check firewall rules
sudo ufw status
sudo iptables -L
```

#### Hardware Diagnostics

**Serial Port Testing**:
```bash
# Test serial port with loopback
# Connect TX to RX on RS485 adapter
echo "test" > /dev/ttyUSB0 &
cat /dev/ttyUSB0

# Should echo "test" if loopback works
```

**Modbus Protocol Analysis**:
```bash
# Install Modbus testing tools
sudo apt install mbpoll

# Test basic communication
mbpoll -m rtu -b 9600 -P none -a 1 -r 1 -c 1 /dev/ttyUSB0

# Monitor Modbus traffic
sudo apt install wireshark
# Capture on serial interface
```

#### Performance Diagnostics

**System Performance Check**:
```bash
# CPU usage
top -p $(pgrep -d',' -f node)

# Memory usage
ps aux --sort=-%mem | head -10

# Disk I/O
sudo iotop

# Network usage
sudo nethogs
```

**Application Performance**:
```javascript
// Add performance monitoring to wizard
const performanceMonitor = {
  startTime: Date.now(),
  
  logStep(stepName) {
    const elapsed = Date.now() - this.startTime;
    console.log(`Step ${stepName}: ${elapsed}ms`);
  },
  
  logMemory() {
    const used = process.memoryUsage();
    console.log('Memory usage:', {
      rss: Math.round(used.rss / 1024 / 1024) + 'MB',
      heapTotal: Math.round(used.heapTotal / 1024 / 1024) + 'MB',
      heapUsed: Math.round(used.heapUsed / 1024 / 1024) + 'MB'
    });
  }
};
```

## Escalation Procedures

### When to Escalate

**Immediate Escalation** (Contact support immediately):
- Safety hazards (smoke, sparks, burning smell)
- System security breaches
- Data corruption or loss
- Complete system failure

**Standard Escalation** (Contact support within 24 hours):
- Repeated configuration failures
- Hardware compatibility issues
- Performance degradation
- Intermittent system problems

**Information to Provide**:

**System Information**:
```bash
# Collect system information
uname -a
cat /etc/os-release
node --version
npm --version
```

**Error Information**:
- Complete error messages and codes
- Steps that led to the error
- Screenshots of error conditions
- Log file excerpts

**Hardware Information**:
- Relay card model numbers
- USB-RS485 adapter type
- Power supply specifications
- Cable types and lengths

**Configuration Information**:
```bash
# Export configuration (remove sensitive data)
cp config/system.json config/system-support.json
# Edit file to remove passwords, keys, etc.
```

### Support Channels

**Emergency Support** (24/7):
- Phone: +1-555-EFORM-911
- Email: emergency@eform-locker.com
- Chat: Emergency chat in admin panel

**Standard Support** (Business hours):
- Phone: +1-555-EFORM-01
- Email: support@eform-locker.com
- Portal: https://support.eform-locker.com

**Community Support**:
- Forums: https://community.eform-locker.com
- Discord: https://discord.gg/eform-locker
- GitHub: https://github.com/eform-locker/issues

## Prevention and Maintenance

### Preventive Measures

**Regular Maintenance**:
```bash
# Weekly checks
./scripts/health-check.sh
./scripts/backup-config.sh

# Monthly maintenance
sudo apt update && sudo apt upgrade
npm audit fix
./scripts/cleanup-logs.sh

# Quarterly reviews
# - Review system performance
# - Update documentation
# - Test backup procedures
# - Plan capacity upgrades
```

**Monitoring Setup**:
```javascript
// Set up automated monitoring
const monitoring = {
  checkInterval: 300000, // 5 minutes
  
  async performChecks() {
    const checks = [
      this.checkDiskSpace(),
      this.checkMemoryUsage(),
      this.checkServiceHealth(),
      this.checkHardwareConnectivity()
    ];
    
    const results = await Promise.allSettled(checks);
    
    // Alert on failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.sendAlert(`Check ${index} failed: ${result.reason}`);
      }
    });
  }
};
```

**Best Practices**:
1. **Regular Backups**: Automated daily configuration backups
2. **Update Management**: Scheduled system and software updates
3. **Performance Monitoring**: Continuous system health monitoring
4. **Documentation**: Keep system documentation current
5. **Training**: Regular user training and knowledge updates

---

**Last Updated**: January 3, 2025  
**Troubleshooting Guide Version**: 1.0  
**Compatible with Wizard Version**: 1.0

**Emergency Contact Information**:
- 🚨 Emergency: +1-555-EFORM-911
- 📧 Support: support@eform-locker.com
- 🌐 Portal: https://support.eform-locker.com
- 💬 Chat: Available 24/7 in admin panel