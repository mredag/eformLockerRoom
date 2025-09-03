# Hardware Configuration Wizard - Error Code Reference

## Overview

This document provides a comprehensive reference for all error codes used in the Hardware Configuration Wizard system. Each error code includes detailed descriptions, common causes, troubleshooting steps, and recovery procedures.

## Error Code Format

Error codes follow the format: `HARDWARE_XXX` where XXX is a three-digit number.

**Categories**:
- `001-099`: Hardware Communication Errors
- `100-199`: Device Detection Errors  
- `200-299`: Address Configuration Errors
- `300-399`: Testing and Validation Errors
- `400-499`: Wizard Session Errors
- `500-599`: System Integration Errors
- `600-699`: Configuration Template Errors
- `700-799`: Security and Permission Errors
- `800-899`: Performance and Resource Errors
- `900-999`: Critical System Errors

## Hardware Communication Errors (001-099)

### HARDWARE_001: Serial Port Not Available

**Description**: The specified serial port cannot be accessed or does not exist.

**Common Causes**:
- USB-RS485 adapter not connected
- Incorrect port path specified
- Port already in use by another process
- Insufficient permissions to access port

**Troubleshooting Steps**:
1. Check physical USB connection
2. Verify port path: `ls -la /dev/ttyUSB*` (Linux) or check Device Manager (Windows)
3. Check port permissions: `sudo chmod 666 /dev/ttyUSB0`
4. Add user to dialout group: `sudo usermod -a -G dialout $USER`
5. Kill processes using the port: `sudo lsof /dev/ttyUSB0`

**Recovery Actions**:
- Automatic port scanning to find available ports
- Permission correction if running with appropriate privileges
- Suggest alternative ports if available

**Example Response**:
```json
{
  "success": false,
  "error_code": "HARDWARE_001",
  "message": "Serial port /dev/ttyUSB0 not available",
  "details": {
    "port": "/dev/ttyUSB0",
    "system_error": "ENOENT: no such file or directory"
  },
  "recovery_suggestions": [
    "Check USB connection",
    "Verify port permissions",
    "Try alternative port /dev/ttyUSB1"
  ]
}
```

### HARDWARE_002: Modbus Communication Timeout

**Description**: Modbus communication with device timed out.

**Common Causes**:
- Device not powered on
- Incorrect baud rate or serial settings
- Hardware connection issues
- Device at wrong address
- Electromagnetic interference

**Troubleshooting Steps**:
1. Verify device power supply
2. Check serial cable connections
3. Confirm baud rate (default: 9600)
4. Test with known working device
5. Check for electromagnetic interference sources

**Recovery Actions**:
- Retry with increased timeout
- Automatic baud rate detection
- Suggest connection verification steps

**Example Response**:
```json
{
  "success": false,
  "error_code": "HARDWARE_002",
  "message": "Modbus communication timeout after 5000ms",
  "details": {
    "address": 1,
    "timeout_ms": 5000,
    "retry_count": 3
  },
  "recovery_suggestions": [
    "Check device power",
    "Verify connections",
    "Increase timeout setting"
  ]
}
```

### HARDWARE_003: Invalid Modbus Response

**Description**: Received malformed or unexpected response from Modbus device.

**Common Causes**:
- CRC checksum mismatch
- Corrupted data transmission
- Device firmware issues
- Incorrect function code response

**Troubleshooting Steps**:
1. Check cable quality and connections
2. Reduce baud rate to improve reliability
3. Test with different cable
4. Verify device firmware version

**Recovery Actions**:
- Automatic retry with error correction
- CRC validation and correction
- Fallback to basic communication mode

### HARDWARE_004: Device Not Responding

**Description**: Modbus device at specified address is not responding.

**Common Causes**:
- Device not connected
- Wrong slave address
- Device in error state
- Power supply issues

**Troubleshooting Steps**:
1. Verify device address configuration
2. Check device status LEDs
3. Power cycle the device
4. Test with broadcast address (0x00)

**Recovery Actions**:
- Address scanning to locate device
- Broadcast communication attempt
- Device reset procedure

### HARDWARE_005: Serial Port Permission Denied

**Description**: Insufficient permissions to access serial port.

**Common Causes**:
- User not in dialout group
- Port permissions too restrictive
- SELinux or AppArmor restrictions

**Troubleshooting Steps**:
1. Add user to dialout group: `sudo usermod -a -G dialout $USER`
2. Set port permissions: `sudo chmod 666 /dev/ttyUSB0`
3. Check SELinux status: `sestatus`
4. Restart session after group changes

**Recovery Actions**:
- Automatic permission correction (if running as root)
- User guidance for permission setup
- Alternative port suggestion

## Device Detection Errors (100-199)

### HARDWARE_100: No Serial Ports Found

**Description**: No suitable serial ports detected for USB-RS485 communication.

**Common Causes**:
- No USB-RS485 adapters connected
- Driver issues
- Hardware failure

**Troubleshooting Steps**:
1. Connect USB-RS485 adapter
2. Install appropriate drivers
3. Check USB port functionality
4. Try different USB port

**Recovery Actions**:
- Manual port specification option
- Driver installation guidance
- Hardware connection verification

### HARDWARE_101: Device Scan Timeout

**Description**: Device scanning operation exceeded maximum allowed time.

**Common Causes**:
- Large address range specified
- Slow device responses
- Network congestion

**Troubleshooting Steps**:
1. Reduce scan address range
2. Increase scan timeout
3. Check network performance
4. Scan in smaller batches

**Recovery Actions**:
- Automatic range reduction
- Batch scanning implementation
- Timeout adjustment

### HARDWARE_102: No Devices Detected

**Description**: No responding Modbus devices found during scan.

**Common Causes**:
- No devices connected
- All devices at different addresses
- Communication settings mismatch
- Hardware issues

**Troubleshooting Steps**:
1. Verify device connections
2. Check device power
3. Expand address scan range
4. Test with known device address

**Recovery Actions**:
- Extended address range scanning
- Manual device addition option
- Connection verification wizard

### HARDWARE_103: Device Identification Failed

**Description**: Unable to identify device type or capabilities.

**Common Causes**:
- Unsupported device type
- Firmware compatibility issues
- Communication errors during identification

**Troubleshooting Steps**:
1. Check device documentation
2. Update device firmware
3. Use manual device configuration
4. Contact device manufacturer

**Recovery Actions**:
- Generic device configuration
- Manual capability specification
- Device type override option

## Address Configuration Errors (200-299)

### HARDWARE_200: Address Configuration Failed

**Description**: Failed to configure slave address on Modbus device.

**Common Causes**:
- Device doesn't support software address configuration
- Address already in use
- Communication failure during configuration
- Invalid address range

**Troubleshooting Steps**:
1. Verify device supports software addressing
2. Check for address conflicts
3. Use broadcast address (0x00) for initial configuration
4. Verify address range (1-255)

**Recovery Actions**:
- Automatic conflict resolution
- Alternative address suggestion
- Manual DIP switch configuration guidance

**Example Response**:
```json
{
  "success": false,
  "error_code": "HARDWARE_200",
  "message": "Failed to configure slave address 3",
  "details": {
    "current_address": 0,
    "target_address": 3,
    "conflict_detected": true,
    "existing_device": {
      "address": 3,
      "type": "Waveshare 16CH"
    }
  },
  "recovery_suggestions": [
    "Use address 4 instead",
    "Resolve address conflict first",
    "Configure existing device to different address"
  ]
}
```

### HARDWARE_201: Address Conflict Detected

**Description**: Multiple devices responding to the same slave address.

**Common Causes**:
- Duplicate address configuration
- Factory default addresses
- Configuration error

**Troubleshooting Steps**:
1. Identify conflicting devices
2. Power off one device at a time
3. Reconfigure addresses sequentially
4. Use address conflict resolution wizard

**Recovery Actions**:
- Automatic address reassignment
- Conflict resolution wizard
- Sequential addressing setup

### HARDWARE_202: Address Verification Failed

**Description**: Unable to verify that address configuration was successful.

**Common Causes**:
- Device doesn't store address in expected register
- Communication failure after configuration
- Device reset required

**Troubleshooting Steps**:
1. Power cycle the device
2. Read address from register 0x4000
3. Test communication at new address
4. Check device documentation for address storage

**Recovery Actions**:
- Alternative verification methods
- Device reset procedure
- Manual verification prompts

### HARDWARE_203: Invalid Address Range

**Description**: Specified address is outside valid range (1-255).

**Common Causes**:
- User input error
- Configuration file corruption
- Programming error

**Troubleshooting Steps**:
1. Verify address is between 1-255
2. Check configuration file integrity
3. Use address validation

**Recovery Actions**:
- Automatic range correction
- Default address suggestion
- Input validation enhancement

### HARDWARE_204: Broadcast Configuration Failed

**Description**: Failed to configure device using broadcast address (0x00).

**Common Causes**:
- Device doesn't support broadcast commands
- Multiple devices responding simultaneously
- CRC calculation error

**Troubleshooting Steps**:
1. Isolate single device for configuration
2. Verify CRC calculation method
3. Use device-specific configuration method
4. Check broadcast command format

**Recovery Actions**:
- Individual device configuration
- Alternative configuration methods
- Manual configuration guidance

## Testing and Validation Errors (300-399)

### HARDWARE_300: Communication Test Failed

**Description**: Basic Modbus communication test with device failed.

**Common Causes**:
- Device not responding
- Incorrect address
- Communication settings mismatch
- Hardware failure

**Troubleshooting Steps**:
1. Verify device address
2. Check communication settings
3. Test with different function codes
4. Verify hardware connections

**Recovery Actions**:
- Alternative communication methods
- Address verification
- Connection troubleshooting wizard

### HARDWARE_301: Relay Test Failed

**Description**: Relay activation test did not complete successfully.

**Common Causes**:
- Relay hardware failure
- Insufficient power supply
- Wiring issues
- Device malfunction

**Troubleshooting Steps**:
1. Check power supply voltage and current
2. Verify relay wiring
3. Test with different relay numbers
4. Listen for physical relay clicks

**Recovery Actions**:
- Alternative relay testing
- Power supply verification
- Manual confirmation prompts

### HARDWARE_302: Test Timeout

**Description**: Hardware test operation exceeded maximum allowed time.

**Common Causes**:
- Slow device response
- Hardware issues
- Network congestion
- Resource constraints

**Troubleshooting Steps**:
1. Increase test timeout
2. Check system resources
3. Test individual components
4. Reduce test complexity

**Recovery Actions**:
- Timeout adjustment
- Simplified test procedures
- Batch testing approach

### HARDWARE_303: Test Validation Failed

**Description**: Test completed but validation criteria not met.

**Common Causes**:
- Performance below threshold
- Intermittent failures
- Configuration issues
- Hardware degradation

**Troubleshooting Steps**:
1. Review test criteria
2. Check hardware condition
3. Verify configuration settings
4. Run extended diagnostics

**Recovery Actions**:
- Criteria adjustment
- Extended testing
- Hardware replacement recommendation

## Wizard Session Errors (400-499)

### HARDWARE_400: Session Not Found

**Description**: Specified wizard session ID does not exist or has expired.

**Common Causes**:
- Session timeout
- Invalid session ID
- Server restart
- Memory cleanup

**Troubleshooting Steps**:
1. Create new wizard session
2. Check session timeout settings
3. Verify session ID format
4. Review session cleanup policies

**Recovery Actions**:
- Automatic session creation
- Session recovery from backup
- State restoration from cache

### HARDWARE_401: Session Expired

**Description**: Wizard session has exceeded maximum allowed duration.

**Common Causes**:
- User inactivity
- Long-running operations
- Session timeout too short
- System clock changes

**Troubleshooting Steps**:
1. Create new session
2. Adjust session timeout
3. Implement session extension
4. Check system clock

**Recovery Actions**:
- Session renewal
- State migration to new session
- Automatic timeout extension

### HARDWARE_402: Invalid Session State

**Description**: Session is in an invalid or corrupted state.

**Common Causes**:
- Data corruption
- Concurrent modifications
- System errors
- Programming bugs

**Troubleshooting Steps**:
1. Reset session state
2. Create new session
3. Check for concurrent access
4. Review error logs

**Recovery Actions**:
- State reset and recovery
- Session recreation
- Data validation and repair

### HARDWARE_403: Step Validation Failed

**Description**: Current wizard step cannot be completed due to validation errors.

**Common Causes**:
- Missing required data
- Invalid configuration
- Dependency not met
- User input errors

**Troubleshooting Steps**:
1. Review step requirements
2. Check input validation
3. Verify dependencies
4. Complete prerequisite steps

**Recovery Actions**:
- Input correction guidance
- Dependency resolution
- Step retry mechanism

## System Integration Errors (500-599)

### HARDWARE_500: Configuration Update Failed

**Description**: Failed to update system configuration with new hardware.

**Common Causes**:
- File permission issues
- Configuration validation errors
- Disk space shortage
- Concurrent modifications

**Troubleshooting Steps**:
1. Check file permissions
2. Verify disk space
3. Validate configuration format
4. Check for file locks

**Recovery Actions**:
- Permission correction
- Configuration rollback
- Alternative update methods

### HARDWARE_501: Service Restart Failed

**Description**: Unable to restart hardware services after configuration update.

**Common Causes**:
- Service dependency issues
- Resource constraints
- Configuration errors
- Permission problems

**Troubleshooting Steps**:
1. Check service status
2. Review service logs
3. Verify dependencies
4. Check system resources

**Recovery Actions**:
- Manual service restart
- Dependency resolution
- Resource cleanup

### HARDWARE_502: Integration Validation Failed

**Description**: System integration validation checks failed after hardware addition.

**Common Causes**:
- Configuration inconsistencies
- Hardware not responding
- Service communication issues
- Database update failures

**Troubleshooting Steps**:
1. Run system health checks
2. Verify hardware connectivity
3. Check service communication
4. Validate database integrity

**Recovery Actions**:
- Configuration correction
- Hardware re-initialization
- Service restart sequence

## Configuration Template Errors (600-699)

### HARDWARE_600: Template Not Found

**Description**: Specified configuration template does not exist.

**Common Causes**:
- Invalid template ID
- Template deleted
- File system issues
- Database corruption

**Troubleshooting Steps**:
1. Verify template ID
2. Check template storage
3. Review deletion logs
4. Validate database integrity

**Recovery Actions**:
- Template recreation
- Backup restoration
- Alternative template suggestion

### HARDWARE_601: Template Validation Failed

**Description**: Configuration template failed validation checks.

**Common Causes**:
- Invalid template format
- Missing required fields
- Version incompatibility
- Corrupted template data

**Troubleshooting Steps**:
1. Validate template format
2. Check required fields
3. Verify version compatibility
4. Test with known good template

**Recovery Actions**:
- Template repair
- Format conversion
- Version migration

### HARDWARE_602: Template Application Failed

**Description**: Failed to apply configuration template to system.

**Common Causes**:
- Hardware compatibility issues
- Resource constraints
- Configuration conflicts
- Permission problems

**Troubleshooting Steps**:
1. Check hardware compatibility
2. Verify system resources
3. Resolve configuration conflicts
4. Check permissions

**Recovery Actions**:
- Compatibility adjustment
- Conflict resolution
- Resource allocation

## Security and Permission Errors (700-799)

### HARDWARE_700: Authentication Required

**Description**: Operation requires user authentication.

**Common Causes**:
- Session expired
- No authentication provided
- Invalid credentials
- Security policy changes

**Troubleshooting Steps**:
1. Log in with valid credentials
2. Check session status
3. Verify authentication method
4. Review security policies

**Recovery Actions**:
- Authentication prompt
- Session renewal
- Alternative authentication

### HARDWARE_701: Insufficient Permissions

**Description**: User lacks required permissions for operation.

**Common Causes**:
- Role-based access restrictions
- Permission changes
- Security policy updates
- User account issues

**Troubleshooting Steps**:
1. Check user roles
2. Verify permissions
3. Contact administrator
4. Review security policies

**Recovery Actions**:
- Permission elevation request
- Alternative operation methods
- Administrator notification

### HARDWARE_702: Operation Not Authorized

**Description**: Requested operation is not authorized for current user.

**Common Causes**:
- Security restrictions
- Maintenance mode
- Emergency lockdown
- Policy violations

**Troubleshooting Steps**:
1. Check system status
2. Verify operation permissions
3. Review security policies
4. Contact system administrator

**Recovery Actions**:
- Authorization request
- Alternative procedures
- Emergency override (if available)

## Performance and Resource Errors (800-899)

### HARDWARE_800: Resource Limit Exceeded

**Description**: Operation exceeded system resource limits.

**Common Causes**:
- Memory shortage
- CPU overload
- Disk space full
- Network bandwidth limit

**Troubleshooting Steps**:
1. Check system resources
2. Close unnecessary processes
3. Free disk space
4. Optimize operations

**Recovery Actions**:
- Resource cleanup
- Operation optimization
- System resource monitoring

### HARDWARE_801: Operation Timeout

**Description**: Operation exceeded maximum allowed execution time.

**Common Causes**:
- System overload
- Hardware delays
- Network issues
- Resource contention

**Troubleshooting Steps**:
1. Check system load
2. Verify hardware performance
3. Test network connectivity
4. Optimize operation parameters

**Recovery Actions**:
- Timeout adjustment
- Operation retry
- Performance optimization

### HARDWARE_802: Rate Limit Exceeded

**Description**: Too many requests in specified time period.

**Common Causes**:
- Rapid successive requests
- Automated scripts
- System abuse
- Configuration errors

**Troubleshooting Steps**:
1. Reduce request frequency
2. Implement request queuing
3. Check for automation
4. Review rate limit settings

**Recovery Actions**:
- Request throttling
- Queue management
- Rate limit adjustment

## Critical System Errors (900-999)

### HARDWARE_900: System Failure

**Description**: Critical system failure affecting hardware operations.

**Common Causes**:
- Hardware malfunction
- Software corruption
- Database failure
- System crash

**Troubleshooting Steps**:
1. Check system status
2. Review error logs
3. Verify hardware integrity
4. Test system components

**Recovery Actions**:
- System restart
- Emergency procedures
- Backup restoration
- Technical support contact

### HARDWARE_901: Database Error

**Description**: Critical database error affecting wizard operations.

**Common Causes**:
- Database corruption
- Connection failure
- Disk errors
- Transaction conflicts

**Troubleshooting Steps**:
1. Check database integrity
2. Verify connections
3. Test disk health
4. Review transaction logs

**Recovery Actions**:
- Database repair
- Backup restoration
- Connection reset
- Transaction rollback

### HARDWARE_902: Emergency Stop Activated

**Description**: Emergency stop procedure has been activated.

**Common Causes**:
- Safety concern
- Hardware malfunction
- User intervention
- System protection

**Troubleshooting Steps**:
1. Identify emergency cause
2. Verify system safety
3. Check hardware status
4. Review emergency logs

**Recovery Actions**:
- Safety verification
- System reset
- Hardware inspection
- Emergency clearance

## Error Recovery Procedures

### Automatic Recovery

The system implements automatic recovery for many error conditions:

1. **Retry Logic**: Automatic retry with exponential backoff
2. **Fallback Methods**: Alternative approaches when primary method fails
3. **State Recovery**: Session and configuration state restoration
4. **Resource Cleanup**: Automatic cleanup of failed operations

### Manual Recovery

Some errors require manual intervention:

1. **Hardware Issues**: Physical connection and power checks
2. **Permission Problems**: User account and system permission setup
3. **Configuration Conflicts**: Manual resolution of conflicting settings
4. **Emergency Situations**: Safety procedures and system reset

### Recovery Best Practices

1. **Always Check Logs**: Review detailed error logs for root cause analysis
2. **Verify Hardware**: Ensure physical connections and power before software troubleshooting
3. **Test Incrementally**: Start with basic tests and gradually increase complexity
4. **Document Issues**: Keep record of recurring problems and solutions
5. **Contact Support**: Escalate to technical support for unresolved critical errors

## Error Reporting and Logging

### Log Levels

- **ERROR**: Critical errors requiring immediate attention
- **WARN**: Warning conditions that may lead to errors
- **INFO**: Informational messages about normal operations
- **DEBUG**: Detailed debugging information for troubleshooting

### Log Format

```
[TIMESTAMP] [LEVEL] [COMPONENT] [ERROR_CODE] MESSAGE
Additional details and stack trace if available
```

### Example Log Entry

```
[2025-01-03T10:30:15.123Z] [ERROR] [HardwareDetection] [HARDWARE_002] Modbus communication timeout after 5000ms
Address: 1, Port: /dev/ttyUSB0, Retry: 3/3
Stack trace: ModbusTimeoutError at HardwareDetectionService.scanDevice (line 145)
```

## Support and Escalation

### Self-Service Resources

1. **Error Code Reference**: This document
2. **Troubleshooting Guide**: Step-by-step problem resolution
3. **User Manual**: Complete system documentation
4. **FAQ**: Frequently asked questions and solutions

### Technical Support

For unresolved issues:

1. **Collect Information**: Error codes, logs, system configuration
2. **Document Steps**: What was attempted and results
3. **Contact Support**: Provide collected information
4. **Follow Up**: Track resolution progress

### Emergency Contacts

- **Critical System Failures**: Immediate technical support
- **Safety Issues**: Emergency shutdown procedures
- **Security Incidents**: Security team notification

---

**Last Updated**: January 3, 2025  
**Document Version**: 1.0  
**Error Code Database Version**: 1.0