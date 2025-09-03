# Hardware Configuration Wizard - User Guide

## Overview

The Hardware Configuration Wizard is a step-by-step guide that helps you add new Modbus relay cards to your eForm Locker System without requiring technical expertise. This wizard automates hardware detection, configuration, and testing to ensure your new equipment works perfectly with your existing system.

**What This Wizard Does**:
- Automatically detects new relay cards
- Configures device addresses without manual DIP switches
- Tests all hardware functionality
- Integrates new equipment into your system
- Provides troubleshooting guidance when needed

**Before You Start**:
- Ensure you have administrator access to the system
- Have your new relay card and connection cables ready
- Allow 15-30 minutes for the complete setup process

## Getting Started

### Accessing the Wizard

1. **Open Admin Panel**: Navigate to `http://your-system-ip:3001` in your web browser
2. **Log In**: Enter your administrator credentials
3. **Go to Hardware**: Click "Hardware Configuration" in the main menu
4. **Start Wizard**: Click the "Add New Card" button to launch the wizard

### System Requirements

**Hardware Requirements**:
- USB-RS485 adapter (FTDI or compatible)
- Modbus RTU relay card (Waveshare 16CH recommended)
- Stable power supply for relay card
- USB cable for RS485 adapter

**Software Requirements**:
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Administrator access to the system
- Network connection to the eForm system

## Step-by-Step Wizard Guide

### Step 1: Pre-Setup Checklist

**Purpose**: Ensure safe and proper hardware setup before beginning configuration.

**What You'll See**:
- Safety checklist with required preparations
- Connection diagram showing proper wiring
- Power and safety verification items

**Actions Required**:
1. **Power Off System**: ✅ Turn off power to existing relay cards
2. **Connect Hardware**: ✅ Connect new relay card to power and RS485
3. **Verify Connections**: ✅ Double-check all connections are secure
4. **Safety Check**: ✅ Ensure work area is safe and organized

**Important Safety Notes**:
- Always power off existing equipment before connecting new hardware
- Verify power supply voltage matches relay card requirements (typically 12V DC)
- Ensure RS485 connections are correct (A+ and B- terminals)
- Keep work area clean and free of metal objects

**Troubleshooting**:
- **No power to relay card**: Check power supply connections and voltage
- **Uncertain about wiring**: Refer to relay card manual or contact support
- **Safety concerns**: Stop and consult with technical personnel

**Next Step**: Click "Continue to Detection" once all checklist items are completed.

### Step 2: Device Detection

**Purpose**: Automatically discover and identify your new relay card.

**What Happens**:
- System scans for available USB-RS485 adapters
- Probes Modbus addresses to find responding devices
- Identifies device type and capabilities
- Displays detected hardware information

**What You'll See**:
- Real-time scanning progress bar
- List of detected serial ports
- Information about found devices
- Device type and channel count

**Typical Results**:
```
✅ USB-RS485 Adapter Found: /dev/ttyUSB0 (FTDI)
✅ Device Detected: Address 0, Type: Waveshare 16CH Relay
✅ Capabilities: 16 relays, Software addressing supported
```

**If No Devices Found**:
1. **Check Connections**: Verify USB and RS485 connections
2. **Power Check**: Ensure relay card has power (LED indicators)
3. **Try Manual Scan**: Use "Rescan" button to try again
4. **Check Different Port**: Try different USB port if available

**If Multiple Devices Found**:
- System will show all detected devices
- New devices will be highlighted
- You can select which device to configure

**Troubleshooting**:
- **"No USB-RS485 adapter found"**: Check USB connection and drivers
- **"Device not responding"**: Verify power and RS485 wiring
- **"Unknown device type"**: Device may still work with generic configuration

**Next Step**: Click "Continue to Configuration" when your device is detected.

### Step 3: Address Configuration

**Purpose**: Automatically assign a unique address to your new relay card.

**What Happens**:
- System finds the next available address
- Uses broadcast commands to configure the device
- Verifies the new address is working correctly
- Resolves any address conflicts automatically

**What You'll See**:
- Current device address (usually 0 for new cards)
- Recommended new address
- Configuration progress indicator
- Verification results

**Automatic Process**:
1. **Address Selection**: System chooses next available address (e.g., address 3)
2. **Broadcast Configuration**: Sends configuration command to device
3. **Verification**: Tests communication at new address
4. **Conflict Resolution**: Handles any addressing conflicts

**Example Progress**:
```
🔍 Finding next available address... ✅ Address 3 selected
📡 Configuring device via broadcast... ✅ Configuration sent
✅ Verification successful: Device responding at address 3
```

**Manual Override** (Advanced Users):
- Click "Manual Configuration" for custom address selection
- Choose specific address from dropdown (1-255)
- System will warn about conflicts before proceeding

**Troubleshooting**:
- **"Configuration failed"**: Device may not support software addressing
- **"Address conflict"**: System will automatically resolve or suggest alternatives
- **"Verification failed"**: May need to power cycle the device

**Next Step**: Click "Continue to Testing" when address configuration is complete.

### Step 4: Testing and Validation

**Purpose**: Thoroughly test your new relay card to ensure proper operation.

**What Happens**:
- Tests basic Modbus communication
- Activates test relays to verify physical operation
- Measures response times and reliability
- Provides comprehensive test results

**Test Sequence**:
1. **Communication Test**: Verifies Modbus connectivity
2. **Relay Test 1**: Activates relay #1 (listen for click)
3. **Relay Test 8**: Activates relay #8 (middle relay)
4. **Relay Test 16**: Activates relay #16 (last relay)
5. **Performance Test**: Measures response times

**What You'll See**:
- Real-time test progress
- Pass/fail indicators for each test
- Physical confirmation prompts
- Performance metrics

**User Interaction Required**:
When testing relays, you'll be asked:
```
🔊 Testing Relay #1
Did you hear a physical "click" sound from the relay?
[Yes, I heard it] [No, no sound] [Test Again]
```

**Test Results Example**:
```
✅ Communication Test: PASSED (45ms response)
✅ Relay #1 Test: PASSED (user confirmed click)
✅ Relay #8 Test: PASSED (user confirmed click)  
✅ Relay #16 Test: PASSED (user confirmed click)
✅ Performance Test: PASSED (avg 52ms response)

Overall Result: ALL TESTS PASSED ✅
```

**If Tests Fail**:
- **Communication Failed**: Check connections and power
- **No Relay Click**: Verify power supply and relay wiring
- **Slow Response**: May indicate connection issues
- **Intermittent Failures**: Could be power supply or interference

**Troubleshooting Options**:
- **Retry Tests**: Run tests again if there were temporary issues
- **Individual Test**: Test specific relays that failed
- **Skip Test**: Continue with warnings (not recommended)
- **Get Help**: Access troubleshooting guide

**Next Step**: Click "Continue to Integration" when all tests pass.

### Step 5: System Integration

**Purpose**: Integrate your new relay card into the system configuration.

**What Happens**:
- Updates system configuration files
- Calculates new total locker count
- Restarts hardware services
- Verifies system integration
- Makes new lockers available for use

**Integration Process**:
1. **Configuration Update**: Adds new card to system.json
2. **Locker Calculation**: Updates total locker count
3. **Service Restart**: Restarts hardware communication services
4. **Verification**: Tests end-to-end functionality
5. **Activation**: Makes new lockers available

**What You'll See**:
- Step-by-step integration progress
- Configuration changes being applied
- Service restart notifications
- Final system status

**Example Integration**:
```
📝 Updating system configuration...
   • Added relay card at address 3 (16 channels)
   • Updated total lockers: 32 → 48
   • Assigned locker range: 33-48

🔄 Restarting hardware services...
   • Stopping kiosk service... ✅
   • Stopping gateway service... ✅
   • Starting services with new config... ✅

✅ Integration Complete!
   • New card operational at address 3
   • 16 new lockers available (33-48)
   • System health: All services running
```

**Final Verification**:
- System tests communication with all cards
- Verifies new locker range is accessible
- Confirms all services are running properly

**If Integration Fails**:
- **Configuration Error**: System will rollback changes
- **Service Restart Failed**: Manual restart may be required
- **Verification Failed**: Check hardware connections

**Completion Options**:
- **Add Another Card**: Start wizard again for additional cards
- **View Dashboard**: Go to hardware dashboard to see all cards
- **Return to Admin**: Go back to main admin panel

## Advanced Features

### Manual Configuration Mode

For experienced users who need more control over the setup process.

**Accessing Manual Mode**:
1. Click "Advanced Options" during any wizard step
2. Select "Manual Configuration Mode"
3. Confirm you understand the risks

**Manual Mode Features**:
- Custom address selection
- Direct register access
- Custom test procedures
- Configuration override options

**When to Use Manual Mode**:
- Non-standard device types
- Custom addressing schemes
- Troubleshooting specific issues
- Integration with existing systems

### Bulk Configuration

For setting up multiple relay cards at once.

**Accessing Bulk Mode**:
1. From hardware dashboard, click "Bulk Setup"
2. Select number of cards to configure
3. Choose addressing strategy

**Bulk Setup Process**:
1. **Detection Phase**: Finds all new devices
2. **Address Planning**: Assigns sequential addresses
3. **Batch Configuration**: Configures all devices
4. **Batch Testing**: Tests all devices
5. **System Integration**: Updates configuration for all cards

**Benefits of Bulk Setup**:
- Faster setup for multiple cards
- Consistent addressing scheme
- Reduced manual intervention
- Comprehensive testing

### Configuration Templates

Save and reuse configuration setups for similar installations.

**Creating Templates**:
1. Complete wizard setup for one system
2. Go to "Configuration Templates"
3. Click "Save Current Setup as Template"
4. Name and describe your template

**Using Templates**:
1. Start wizard and select "Use Template"
2. Choose from available templates
3. Wizard applies template settings
4. Verify and adjust as needed

**Template Benefits**:
- Consistent deployments
- Faster setup for similar systems
- Reduced configuration errors
- Easy replication of working setups

## Troubleshooting Guide

### Common Issues and Solutions

#### Issue: "No USB-RS485 adapter found"

**Symptoms**:
- Wizard shows no serial ports detected
- Cannot proceed past device detection

**Solutions**:
1. **Check USB Connection**: Ensure adapter is plugged in securely
2. **Try Different Port**: Use different USB port on computer
3. **Install Drivers**: Install FTDI or appropriate drivers
4. **Check Device Manager**: Verify adapter appears in system
5. **Test with Different Adapter**: Try known working adapter

**Prevention**:
- Use quality USB-RS485 adapters
- Keep drivers updated
- Test adapters before installation

#### Issue: "Device not responding"

**Symptoms**:
- Device detection finds no devices
- Communication tests fail
- No response from relay card

**Solutions**:
1. **Check Power**: Verify relay card has proper power supply
2. **Verify Wiring**: Check RS485 A+ and B- connections
3. **Test Voltage**: Measure power supply voltage (should be 12V DC)
4. **Check LEDs**: Look for power/status indicators on card
5. **Try Different Address**: Test with broadcast address (0)

**Prevention**:
- Use stable power supplies
- Double-check wiring before powering on
- Test power supply voltage before connecting

#### Issue: "Address configuration failed"

**Symptoms**:
- Cannot set device address
- Address verification fails
- Device doesn't respond at new address

**Solutions**:
1. **Power Cycle**: Turn device off and on again
2. **Use Broadcast**: Try broadcast address (0) for configuration
3. **Check Compatibility**: Verify device supports software addressing
4. **Manual DIP Switches**: Use hardware DIP switches if available
5. **Try Different Address**: Use alternative address

**Prevention**:
- Verify device compatibility before purchase
- Read device documentation thoroughly
- Test with known working devices first

#### Issue: "Relay tests failing"

**Symptoms**:
- No physical relay clicks heard
- Relays don't activate during testing
- Intermittent relay operation

**Solutions**:
1. **Check Power Supply**: Verify adequate current capacity
2. **Test Individual Relays**: Use manual relay testing
3. **Check Wiring**: Verify relay output connections
4. **Measure Voltage**: Check relay coil voltage during activation
5. **Replace Card**: Card may be defective

**Prevention**:
- Use power supplies with adequate current rating
- Verify relay specifications match requirements
- Test cards before installation

#### Issue: "System integration failed"

**Symptoms**:
- Configuration update fails
- Services won't restart
- New lockers not available

**Solutions**:
1. **Check Permissions**: Verify file write permissions
2. **Check Disk Space**: Ensure adequate free space
3. **Manual Restart**: Restart services manually
4. **Rollback Configuration**: Use automatic rollback feature
5. **Contact Support**: Get technical assistance

**Prevention**:
- Maintain adequate disk space
- Regular system backups
- Monitor system health

### Getting Additional Help

#### Built-in Help System

**Accessing Help**:
- Click "?" icon next to any wizard step
- Use "Help" button in top navigation
- Access context-sensitive help tooltips

**Help Features**:
- Step-by-step guidance
- Video tutorials (where available)
- Interactive troubleshooting
- FAQ sections

#### Technical Support

**When to Contact Support**:
- Hardware compatibility questions
- Repeated configuration failures
- System integration issues
- Safety concerns

**Information to Provide**:
- System configuration details
- Error messages and codes
- Steps attempted
- Hardware model numbers

**Support Channels**:
- Online support portal
- Email support
- Phone support (for critical issues)
- Community forums

#### Emergency Procedures

**Emergency Stop**:
If you need to immediately stop all relay operations:
1. Click "Emergency Stop" button (red button in top bar)
2. System will deactivate all relays immediately
3. All wizard operations will be paused
4. Contact support before resuming

**System Recovery**:
If wizard becomes unresponsive:
1. Refresh browser page
2. Log in again if needed
3. Wizard will resume from last saved state
4. Use "Cancel Wizard" if needed to start over

## Best Practices

### Planning Your Installation

**Before Starting**:
1. **Inventory Hardware**: Count existing and new cards
2. **Plan Addressing**: Decide on addressing scheme
3. **Check Power**: Verify power supply capacity
4. **Schedule Downtime**: Plan for service interruption
5. **Backup Configuration**: Save current system configuration

**Addressing Strategy**:
- Use sequential addressing (1, 2, 3, 4...)
- Leave gaps for future expansion
- Document address assignments
- Test each address before proceeding

### During Installation

**Safety First**:
- Always power off before connecting hardware
- Use proper ESD precautions
- Double-check connections before powering on
- Keep work area organized and clean

**Testing Thoroughly**:
- Test each relay individually
- Verify physical relay operation
- Check response times
- Document any issues

**Documentation**:
- Record device addresses and locations
- Note any configuration changes
- Save configuration templates
- Update system documentation

### After Installation

**Verification**:
- Test complete system operation
- Verify all lockers are accessible
- Check system performance
- Monitor for any issues

**Maintenance**:
- Regular system health checks
- Monitor performance metrics
- Keep configuration backups current
- Plan for future expansions

## Frequently Asked Questions (FAQ)

### General Questions

**Q: How long does the wizard take to complete?**
A: Typically 15-30 minutes depending on the number of tests and your familiarity with the process.

**Q: Can I add multiple cards at once?**
A: Yes, use the "Bulk Configuration" feature to set up multiple cards simultaneously.

**Q: What happens if the wizard fails partway through?**
A: The wizard saves progress at each step and can resume from where it left off. You can also start over if needed.

**Q: Do I need to shut down the entire system?**
A: No, only the hardware services are restarted. The web interface and database remain available.

### Hardware Questions

**Q: What relay cards are supported?**
A: Waveshare 16CH Modbus RTU relay cards are fully supported. Other Modbus RTU cards may work with generic configuration.

**Q: Can I use different brands of relay cards together?**
A: Yes, as long as they support standard Modbus RTU protocol. The wizard will detect and configure each type appropriately.

**Q: What if my card doesn't support software addressing?**
A: You can use manual DIP switch configuration. The wizard will guide you through the process.

**Q: How many cards can I add to one system?**
A: The system supports up to 255 Modbus addresses, so theoretically 255 cards. Practical limits depend on power supply and physical space.

### Technical Questions

**Q: What if I have address conflicts?**
A: The wizard automatically detects and resolves address conflicts by assigning alternative addresses.

**Q: Can I change addresses after setup?**
A: Yes, use the hardware dashboard to reconfigure addresses of existing cards.

**Q: What happens if a test fails?**
A: You can retry tests, skip them with warnings, or get troubleshooting guidance. Failed tests don't prevent completion but may indicate issues.

**Q: How do I know if my power supply is adequate?**
A: Each 16-channel relay card typically needs 2-3 amps at 12V DC. Check your power supply specifications and add up the requirements for all cards.

### Troubleshooting Questions

**Q: The wizard says "device not responding" but I can see the card is powered on.**
A: Check RS485 wiring (A+ and B- connections), verify baud rate settings, and ensure no other software is using the serial port.

**Q: Relays click during testing but don't work in normal operation.**
A: This may indicate power supply issues under load, wiring problems, or configuration errors. Check power supply capacity and connections.

**Q: The system integration step fails.**
A: This is usually due to file permissions or disk space issues. Check that the system has write access to configuration files and adequate free space.

**Q: Can I cancel the wizard partway through?**
A: Yes, click "Cancel Wizard" at any time. The system will safely clean up any partial configurations.

## Video Tutorials

### Available Video Guides

1. **Getting Started** (5 minutes)
   - Accessing the wizard
   - Understanding the interface
   - Safety preparations

2. **Hardware Connection** (8 minutes)
   - Proper wiring techniques
   - Power supply setup
   - Connection verification

3. **Complete Wizard Walkthrough** (15 minutes)
   - Full step-by-step process
   - Common issues and solutions
   - Best practices

4. **Advanced Configuration** (12 minutes)
   - Manual configuration mode
   - Bulk setup procedures
   - Template management

5. **Troubleshooting Common Issues** (10 minutes)
   - Diagnosing connection problems
   - Resolving address conflicts
   - Testing procedures

### Accessing Videos

**Online Access**:
- Visit the support portal
- Navigate to "Video Tutorials"
- Select "Hardware Configuration Wizard"

**Offline Access**:
- Videos are cached locally after first viewing
- Available in system help section
- Can be downloaded for offline viewing

## Support Resources

### Documentation

- **API Documentation**: Technical reference for developers
- **System Administration Guide**: Complete system management
- **Hardware Compatibility List**: Supported devices and specifications
- **Installation Manual**: Physical installation procedures

### Community Resources

- **User Forums**: Community discussions and solutions
- **Knowledge Base**: Searchable database of solutions
- **Best Practices Guide**: Recommendations from experienced users
- **Case Studies**: Real-world implementation examples

### Professional Support

- **Technical Support**: Expert assistance for complex issues
- **Training Services**: On-site or remote training sessions
- **Consulting Services**: Custom implementation assistance
- **Maintenance Contracts**: Ongoing support and maintenance

---

**Last Updated**: January 3, 2025  
**User Guide Version**: 1.0  
**Compatible with Wizard Version**: 1.0

**Need Help?**
- 📧 Email: support@eform-locker.com
- 📞 Phone: +1-555-EFORM-01
- 🌐 Web: https://support.eform-locker.com
- 💬 Chat: Available 24/7 in admin panel