# Hardware Configuration Wizard - Frequently Asked Questions (FAQ)

## Overview

This FAQ addresses the most common questions about the Hardware Configuration Wizard. Questions are organized by category for easy navigation. If you don't find your answer here, please check the User Guide or contact support.

**Quick Navigation**:
- [Getting Started](#getting-started)
- [Hardware Compatibility](#hardware-compatibility)
- [Installation and Setup](#installation-and-setup)
- [Configuration and Addressing](#configuration-and-addressing)
- [Testing and Validation](#testing-and-validation)
- [Troubleshooting](#troubleshooting)
- [Advanced Features](#advanced-features)
- [Maintenance and Support](#maintenance-and-support)

## Getting Started

### Q: What is the Hardware Configuration Wizard?

**A:** The Hardware Configuration Wizard is an automated, step-by-step guide that helps you add new Modbus relay cards to your eForm Locker System. It eliminates the need for manual configuration by automatically detecting hardware, configuring addresses, testing functionality, and integrating new equipment into your system.

**Key Benefits**:
- Zero-knowledge setup (no technical expertise required)
- Automated hardware detection and configuration
- Comprehensive testing and validation
- Seamless system integration
- Built-in troubleshooting and error recovery

### Q: Who can use the Hardware Configuration Wizard?

**A:** The wizard is designed for:
- **System Administrators**: Managing locker system hardware
- **Technicians**: Installing and maintaining equipment
- **Facility Managers**: Adding capacity to existing systems
- **IT Personnel**: Integrating with existing infrastructure

**Requirements**:
- Administrator access to the eForm system
- Basic understanding of hardware connections
- Ability to follow step-by-step instructions

### Q: How long does it take to add a new relay card?

**A:** Typical completion times:
- **Single card setup**: 15-30 minutes
- **Multiple cards (bulk)**: 45-90 minutes
- **First-time users**: Add 15-20 minutes for familiarization

**Time breakdown**:
- Pre-setup and connections: 5-10 minutes
- Device detection: 2-5 minutes
- Address configuration: 1-3 minutes
- Testing and validation: 5-10 minutes
- System integration: 2-5 minutes

### Q: Do I need to shut down the entire system?

**A:** No, you don't need a complete system shutdown:
- **Web interface remains available** throughout the process
- **Database stays online** and accessible
- **Only hardware services restart** during integration
- **Existing lockers continue working** (except during brief service restart)
- **Total downtime**: Usually less than 30 seconds

### Q: Can I cancel the wizard partway through?

**A:** Yes, you can safely cancel at any time:
- Click "Cancel Wizard" button available on every step
- System automatically cleans up any partial configurations
- No permanent changes until final integration step
- Can restart wizard from beginning if needed
- Session data is preserved for 1 hour in case of accidental cancellation

## Hardware Compatibility

### Q: What relay cards are supported?

**A:** **Fully Supported**:
- Waveshare 16CH Modbus RTU Relay (recommended)
- Waveshare 8CH Modbus RTU Relay
- Generic Modbus RTU relay cards with standard function codes

**Partially Supported** (may require manual configuration):
- Other Modbus RTU devices with custom addressing
- Non-standard register layouts
- Proprietary communication protocols

**Not Supported**:
- Modbus TCP/IP devices (different protocol)
- Non-Modbus relay cards
- Devices without software addressing capability

### Q: Can I mix different brands of relay cards?

**A:** Yes, with considerations:
- **Same Protocol**: All cards must use Modbus RTU
- **Compatible Settings**: Same baud rate, parity, stop bits
- **Unique Addresses**: Each card needs a unique address (1-255)
- **Power Requirements**: Ensure adequate power supply for all cards

**Best Practice**: Use identical cards for consistency and easier maintenance.

### Q: What USB-RS485 adapters work with the system?

**A:** **Recommended Adapters**:
- FTDI-based adapters (most reliable)
- Prolific PL2303-based adapters
- CH340/CH341-based adapters

**Specifications**:
- USB 2.0 or higher
- RS485 differential signaling
- 3.3V or 5V logic levels
- Automatic direction control (preferred)

**Avoid**:
- Generic no-name adapters
- Adapters without proper drivers
- RS232-only adapters

### Q: How many relay cards can I add to one system?

**A:** **Technical Limits**:
- Maximum Modbus addresses: 255
- Practical limit: 50-100 cards (depending on system resources)
- Recommended for most installations: 10-20 cards

**Limiting Factors**:
- Power supply capacity
- Physical space and wiring
- System performance and response time
- Network bandwidth (for remote systems)

**Scaling Recommendations**:
- Use multiple RS485 buses for large installations
- Consider distributed architecture for 100+ lockers
- Plan for adequate power distribution

### Q: What power supply do I need?

**A:** **Per 16-Channel Card**:
- Voltage: 12V DC (±10%)
- Current: 2-3A (with safety margin)
- Regulation: <5% voltage variation
- Ripple: <100mV peak-to-peak

**Multiple Cards**:
- Add current requirements for each card
- Use centralized power distribution
- Include 50% safety margin
- Consider redundant power supplies for critical applications

**Example**: 4 cards = 4 × 3A = 12A minimum, recommend 18A power supply

## Installation and Setup

### Q: What cables do I need?

**A:** **Required Cables**:
- USB cable (Type A to Type B or Mini/Micro USB)
- RS485 cable (twisted pair, preferably shielded)
- Power cables (appropriate gauge for current)

**Cable Specifications**:
- RS485: Cat5/Cat6 ethernet cable works well
- Maximum length: 1000m (3280 feet)
- Termination: 120Ω resistors at both ends for long runs
- Shielding: Recommended for noisy environments

### Q: How do I connect multiple relay cards?

**A:** **Daisy Chain Configuration**:
```
USB-RS485 ──┬── Card 1 (Address 1)
            ├── Card 2 (Address 2)  
            ├── Card 3 (Address 3)
            └── Card 4 (Address 4)
```

**Connection Details**:
- Connect A+ to A+ on all cards
- Connect B- to B- on all cards
- Each card needs separate power connection
- Use unique addresses for each card (1, 2, 3, 4...)

**Termination**:
- Add 120Ω resistor between A+ and B- at first and last cards
- Only for cable runs longer than 100m

### Q: Do I need special tools?

**A:** **Basic Tools**:
- Screwdriver set (Phillips and flathead)
- Wire strippers
- Multimeter (for voltage checking)
- Label maker (for cable identification)

**Optional Tools**:
- Crimping tool (for custom cables)
- Oscilloscope (for signal analysis)
- Modbus testing software

**No Special Tools Needed**:
- No programming equipment required
- No specialized Modbus tools
- No DIP switch configuration tools (software addressing used)

### Q: Can I install cards while the system is running?

**A:** **Hot-Plugging Support**:
- USB-RS485 adapter: Yes, can be connected while running
- Relay cards: Yes, can be powered on while system runs
- RS485 connections: Yes, can be made with system running

**Safety Precautions**:
- Always connect power last
- Verify connections before applying power
- Use wizard's detection feature to verify new cards

**Best Practice**: Follow the wizard's pre-setup checklist for safest installation.

## Configuration and Addressing

### Q: How does automatic addressing work?

**A:** **Automatic Process**:
1. **Detection**: Wizard scans for devices at all addresses
2. **Identification**: Finds devices at default address (usually 0)
3. **Assignment**: Selects next available address automatically
4. **Configuration**: Uses broadcast commands to set new address
5. **Verification**: Tests communication at new address

**Broadcast Method**:
- Sends configuration command to address 0 (all devices listen)
- Only unconfigured devices respond
- Configures one device at a time for safety

### Q: What if I have address conflicts?

**A:** **Automatic Resolution**:
- Wizard detects conflicts during scanning
- Automatically suggests alternative addresses
- Can resolve conflicts without user intervention
- Provides manual override options if needed

**Manual Resolution**:
1. Power off all conflicted devices
2. Power on one device at a time
3. Configure each to unique address
4. Power on all devices together

### Q: Can I choose specific addresses?

**A:** **Yes, through Manual Configuration**:
- Click "Advanced Options" during address configuration
- Select "Manual Address Selection"
- Choose from available addresses (1-255)
- System warns about conflicts before proceeding

**Address Planning**:
- Use sequential numbering (1, 2, 3, 4...)
- Leave gaps for future expansion (1, 3, 5, 7...)
- Document address assignments
- Consider logical grouping by location

### Q: What if my device doesn't support software addressing?

**A:** **Hardware DIP Switch Configuration**:
1. Locate DIP switches on relay card
2. Set switches according to desired address:
   - Address 1: Switch 1 ON, others OFF
   - Address 2: Switch 2 ON, others OFF
   - Address 3: Switches 1+2 ON, others OFF
3. Power cycle the device
4. Use "Manual Address Entry" in wizard

**Alternative Methods**:
- Some devices use jumpers instead of DIP switches
- Consult device manual for specific configuration
- Contact manufacturer for addressing instructions

### Q: How do I verify address configuration worked?

**A:** **Automatic Verification**:
- Wizard automatically tests new address
- Reads address from device register (0x4000 for Waveshare)
- Performs communication test
- Shows verification results

**Manual Verification**:
```bash
# Test communication at new address
mbpoll -m rtu -b 9600 -P none -a 3 -r 1 -c 1 /dev/ttyUSB0
# Should return register value if successful
```

## Testing and Validation

### Q: What tests does the wizard perform?

**A:** **Comprehensive Test Suite**:
1. **Communication Test**: Basic Modbus connectivity
2. **Relay Activation Test**: Physical relay operation (relays 1, 8, 16)
3. **Performance Test**: Response time measurement
4. **Reliability Test**: Multiple activation cycles
5. **Integration Test**: End-to-end system verification

**Test Duration**: 5-10 minutes depending on card type and test selection

### Q: What should I listen for during relay tests?

**A:** **Physical Relay Sounds**:
- **Normal Operation**: Clear "click" sound when relay activates
- **Relay Activation**: Audible "click" followed by silence
- **Relay Deactivation**: Second "click" when relay turns off

**What to Check**:
- Each test relay should make two clicks (on/off)
- Clicks should be crisp and clear
- No buzzing or chattering sounds
- Consistent timing between relays

**Troubleshooting Sounds**:
- **No sound**: Power supply or wiring issue
- **Buzzing**: Insufficient power or loose connections
- **Multiple clicks**: Electrical interference or poor connections

### Q: What if a relay test fails?

**A:** **Immediate Actions**:
1. **Retry Test**: Click "Test Again" to retry failed relay
2. **Check Power**: Verify power supply voltage and current
3. **Check Connections**: Ensure all connections are secure
4. **Individual Test**: Test specific relay that failed

**Common Causes and Solutions**:
- **Power Supply**: Upgrade to higher current capacity
- **Wiring**: Check and tighten all connections
- **Defective Relay**: May need card replacement
- **Interference**: Move away from interference sources

**Can I Skip Failed Tests?**:
- Yes, but not recommended
- System will show warnings
- Failed relays may not work in normal operation
- Better to resolve issues before proceeding

### Q: How accurate are the performance tests?

**A:** **Performance Metrics**:
- **Response Time**: Typically 20-100ms for Modbus RTU
- **Accuracy**: ±5ms measurement precision
- **Factors Affecting Performance**:
  - Cable length and quality
  - Baud rate settings
  - System load
  - Electrical interference

**Acceptable Performance**:
- Response time <200ms: Excellent
- Response time 200-500ms: Good
- Response time >500ms: May indicate issues

### Q: What happens if all tests fail?

**A:** **Systematic Troubleshooting**:
1. **Basic Connectivity**: Verify power and connections
2. **Communication Settings**: Check baud rate and wiring
3. **Hardware Issues**: Test with known working equipment
4. **Environmental Factors**: Check for interference

**Wizard Options**:
- **Troubleshooting Guide**: Built-in step-by-step help
- **Skip with Warnings**: Continue but mark issues
- **Cancel and Retry**: Start over with different approach
- **Contact Support**: Get expert assistance

## Troubleshooting

### Q: The wizard says "No serial ports found" - what do I do?

**A:** **Step-by-Step Resolution**:
1. **Check USB Connection**: Ensure adapter is plugged in securely
2. **Try Different Port**: Use different USB port
3. **Install Drivers**: Install FTDI or appropriate drivers
4. **Check Device Manager**: Verify adapter appears in system
5. **Restart Browser**: Refresh page and try again

**Linux-Specific**:
```bash
# Check if device is detected
ls -la /dev/ttyUSB*

# Add user to dialout group
sudo usermod -a -G dialout $USER

# Set permissions
sudo chmod 666 /dev/ttyUSB0
```

### Q: Device detection finds no devices - what's wrong?

**A:** **Common Causes and Solutions**:

**Power Issues**:
- Check power supply voltage (should be 12V DC)
- Verify power connections to relay card
- Look for power indicator LEDs

**Wiring Issues**:
- Verify RS485 A+ and B- connections
- Check for loose connections
- Ensure correct terminal blocks used

**Communication Settings**:
- Verify baud rate (usually 9600)
- Check for other software using serial port
- Try different timeout settings

**Device Issues**:
- Power cycle the relay card
- Try broadcast address (0) communication
- Check device documentation for default settings

### Q: Address configuration keeps failing - why?

**A:** **Possible Reasons**:

**Device Compatibility**:
- Device may not support software addressing
- May require DIP switch configuration
- Check device manual for addressing method

**Communication Issues**:
- Verify stable communication before addressing
- Check for address conflicts
- Ensure proper CRC calculation

**Power/Timing Issues**:
- Power cycle device after configuration
- Allow time for device to save settings
- Verify power supply stability

**Solutions**:
- Use manual DIP switch configuration
- Try different configuration methods
- Contact device manufacturer for support

### Q: System integration fails - what should I do?

**A:** **Integration Failure Recovery**:

**Check System Resources**:
```bash
# Check disk space
df -h

# Check memory
free -h

# Check permissions
ls -la config/system.json
```

**Manual Recovery Steps**:
1. **Restore Backup**: System automatically creates backups
2. **Fix Permissions**: Ensure write access to configuration files
3. **Restart Services**: Manual service restart if needed
4. **Verify Configuration**: Check configuration file integrity

**Prevention**:
- Ensure adequate disk space before starting
- Regular system maintenance
- Keep configuration backups current

### Q: The wizard becomes unresponsive - what do I do?

**A:** **Recovery Steps**:

**Immediate Actions**:
1. **Refresh Browser**: Reload the page
2. **Check Network**: Verify connection to system
3. **Try Different Browser**: Use alternative browser
4. **Clear Cache**: Clear browser cache and cookies

**Session Recovery**:
- Wizard saves progress automatically
- Can resume from last completed step
- Session data preserved for 1 hour
- Use "Resume Session" if available

**System Recovery**:
```bash
# Check service status
systemctl status eform-*

# Restart services if needed
./scripts/start-all-clean.sh

# Check system resources
top
df -h
```

## Advanced Features

### Q: What is bulk configuration mode?

**A:** **Bulk Configuration Features**:
- Configure multiple relay cards simultaneously
- Automatic sequential addressing
- Batch testing of all cards
- Parallel configuration operations

**When to Use**:
- Installing 3+ cards at once
- Setting up new installations
- Upgrading existing systems
- Standardizing configurations

**Process**:
1. Connect all new cards
2. Select "Bulk Configuration" mode
3. Wizard detects all new devices
4. Assigns sequential addresses automatically
5. Tests all cards in parallel
6. Integrates all cards together

### Q: How do configuration templates work?

**A:** **Template System**:
- Save successful configurations as templates
- Reuse templates for similar installations
- Share templates between systems
- Version control for configurations

**Creating Templates**:
1. Complete wizard setup successfully
2. Go to "Configuration Templates"
3. Click "Save as Template"
4. Name and describe template
5. Template saved for future use

**Using Templates**:
1. Start new wizard session
2. Select "Use Template"
3. Choose from available templates
4. Wizard applies template settings
5. Verify and adjust as needed

### Q: What is manual configuration mode?

**A:** **Manual Mode Features**:
- Direct control over all configuration steps
- Custom address selection
- Advanced testing options
- Expert-level troubleshooting tools

**When to Use**:
- Non-standard device types
- Custom addressing schemes
- Troubleshooting specific issues
- Integration with existing systems

**Access Requirements**:
- Administrator privileges
- Understanding of Modbus protocol
- Knowledge of device specifications
- Acceptance of additional risks

### Q: Can I extend the wizard for custom devices?

**A:** **Extensibility Features**:
- Plugin architecture for new device types
- Custom device profiles
- Configurable test procedures
- API for integration with other systems

**Developer Resources**:
- API documentation available
- Device plugin examples
- Developer onboarding guide
- Community support forums

## Maintenance and Support

### Q: How often should I run the wizard?

**A:** **Usage Scenarios**:
- **Adding New Cards**: Each time you install new hardware
- **Replacing Cards**: When replacing defective equipment
- **System Upgrades**: During major system updates
- **Troubleshooting**: When diagnosing hardware issues

**Not Needed For**:
- Regular system maintenance
- Software updates
- Configuration changes to existing cards
- Normal system operation

### Q: How do I backup my configuration?

**A:** **Automatic Backups**:
- Wizard creates backups before changes
- Backups stored in `config/backups/` directory
- Timestamped for easy identification
- Retained for 30 days by default

**Manual Backups**:
```bash
# Create manual backup
cp config/system.json config/system-backup-$(date +%Y%m%d).json

# Verify backup
diff config/system.json config/system-backup-*.json
```

**Backup Best Practices**:
- Regular automated backups
- Store backups off-site
- Test backup restoration procedures
- Document backup schedules

### Q: What support is available?

**A:** **Support Channels**:

**Self-Service**:
- User Guide and documentation
- Built-in troubleshooting wizard
- FAQ (this document)
- Community forums

**Professional Support**:
- Email support (response within 24 hours)
- Phone support (business hours)
- Emergency support (24/7 for critical issues)
- On-site support (available in some regions)

**Training and Consulting**:
- Online training sessions
- Custom implementation consulting
- Best practices workshops
- System optimization services

### Q: How do I report bugs or request features?

**A:** **Bug Reports**:
- Use built-in feedback system in wizard
- Email: bugs@eform-locker.com
- GitHub issues (for technical users)
- Include system information and error logs

**Feature Requests**:
- Community forums for discussion
- Email: features@eform-locker.com
- User advisory board participation
- Annual user survey

**Information to Include**:
- Detailed description of issue/request
- Steps to reproduce (for bugs)
- System configuration details
- Expected vs. actual behavior

### Q: Are there any usage limits or licensing restrictions?

**A:** **Usage Rights**:
- Unlimited use within licensed system
- No per-card or per-user fees
- Includes all wizard features
- Free updates and bug fixes

**Support Limitations**:
- Support included with active license
- Community support always available
- Premium support available separately
- Training and consulting services separate

**Redistribution**:
- Cannot redistribute wizard software
- Can share configuration templates
- Can document procedures and best practices
- Contact sales for OEM licensing

### Q: What's the roadmap for future features?

**A:** **Planned Features** (subject to change):
- Support for additional device types
- Mobile-responsive interface
- Advanced analytics and reporting
- Integration with monitoring systems
- Multi-language support
- Cloud-based configuration management

**Community Input**:
- Feature requests influence roadmap
- Beta testing programs available
- User advisory board participation
- Annual feature planning surveys

---

**Still Have Questions?**

**Contact Information**:
- 📧 Email: support@eform-locker.com
- 📞 Phone: +1-555-EFORM-01
- 🌐 Support Portal: https://support.eform-locker.com
- 💬 Community: https://community.eform-locker.com
- 🚨 Emergency: +1-555-EFORM-911

**Documentation**:
- 📖 User Guide: `docs/hardware-wizard-user-guide.md`
- 🔧 Troubleshooting: `docs/hardware-wizard-troubleshooting.md`
- 👨‍💻 API Documentation: `docs/hardware-wizard-api-documentation.md`
- 🛠️ Developer Guide: `docs/hardware-wizard-developer-guide.md`

---

**Last Updated**: January 3, 2025  
**FAQ Version**: 1.0  
**Compatible with Wizard Version**: 1.0