# Hardware Configuration Wizard - API Documentation

## Overview

The Hardware Configuration Wizard API provides comprehensive endpoints for automated hardware detection, slave address configuration, testing, and system integration. This API enables zero-knowledge setup of Modbus relay cards through intelligent automation and guided workflows.

**Base URL**: `http://localhost:3001/api/hardware-config`

**Authentication**: Session-based authentication required for all endpoints

**Content-Type**: `application/json`

## API Endpoints Reference

### 1. Hardware Detection Endpoints

#### 1.1 Scan Serial Ports

**Endpoint**: `GET /scan-ports`

**Description**: Discovers available USB-RS485 adapters and serial ports suitable for Modbus communication.

**Parameters**: None

**Response**:
```json
{
  "success": true,
  "ports": [
    {
      "path": "/dev/ttyUSB0",
      "manufacturer": "FTDI",
      "serialNumber": "A12345",
      "vendorId": "0403",
      "productId": "6001",
      "available": true,
      "description": "USB-RS485 Adapter (FTDI)"
    }
  ],
  "total_found": 2,
  "usb_rs485_candidates": 1,
  "scan_timestamp": "2025-01-03T10:30:00.000Z"
}
```

**Error Codes**:
- `500`: Serial port scanning failed or SerialPort module unavailable

**Example Usage**:
```javascript
const response = await fetch('/api/hardware-config/scan-ports');
const data = await response.json();
console.log(`Found ${data.usb_rs485_candidates} USB-RS485 adapters`);
```

#### 1.2 Scan Modbus Devices

**Endpoint**: `GET /scan-devices`

**Description**: Probes Modbus addresses to identify responding relay cards and their capabilities.

**Query Parameters**:
- `port` (required): Serial port path (e.g., "/dev/ttyUSB0")
- `start_address` (optional): Starting address to scan (default: 1)
- `end_address` (optional): Ending address to scan (default: 10)
- `timeout` (optional): Scan timeout in milliseconds (default: 30000)

**Response**:
```json
{
  "success": true,
  "devices": [
    {
      "address": 1,
      "type": {
        "manufacturer": "waveshare",
        "model": "16CH Relay",
        "channels": 16,
        "features": ["timed_pulse", "address_config"]
      },
      "capabilities": {
        "maxRelays": 16,
        "supportedFunctions": [1, 5, 6, 15, 16],
        "firmwareVersion": "1.0",
        "addressConfigurable": true,
        "timedPulseSupport": true
      },
      "status": "responding",
      "responseTime": 45,
      "lastSeen": "2025-01-03T10:30:15.000Z"
    }
  ],
  "scan_range": { "start_address": 1, "end_address": 10 },
  "port": "/dev/ttyUSB0",
  "scan_timestamp": "2025-01-03T10:30:15.000Z"
}
```

**Error Codes**:
- `400`: Missing required port parameter
- `500`: Modbus scanning failed or timeout

#### 1.3 Detect New Cards

**Endpoint**: `GET /detect-new-cards`

**Description**: Identifies new relay cards not present in current system configuration.

**Parameters**: None

**Response**:
```json
{
  "success": true,
  "new_devices": [
    {
      "address": 3,
      "type": {
        "manufacturer": "waveshare",
        "model": "16CH Relay",
        "channels": 16
      },
      "status": "responding",
      "responseTime": 52
    }
  ],
  "existing_devices": [
    {
      "address": 1,
      "type": {
        "manufacturer": "waveshare",
        "model": "16CH Relay",
        "channels": 16
      },
      "status": "responding"
    }
  ],
  "total_detected": 2,
  "known_addresses": [1, 2],
  "recommendations": [
    {
      "type": "address_assignment",
      "priority": "high",
      "description": "Assign address 4 to new device at address 3",
      "autoApplicable": true
    }
  ]
}
```

### 2. Slave Address Management Endpoints

#### 2.1 Set Slave Address

**Endpoint**: `POST /set-slave-address`

**Description**: Configures slave address for a Modbus device using broadcast commands.

**Request Body**:
```json
{
  "current_address": 0,
  "new_address": 3,
  "verify": true
}
```

**Response**:
```json
{
  "success": true,
  "message": "Slave address configured successfully",
  "current_address": 0,
  "new_address": 3,
  "verification_passed": true,
  "configuration_time": "2025-01-03T10:35:00.000Z"
}
```

**Error Codes**:
- `400`: Invalid address parameters
- `409`: Address conflict detected
- `500`: Configuration failed

#### 2.2 Read Slave Address

**Endpoint**: `GET /read-slave-address`

**Description**: Reads current slave address from device register 0x4000.

**Query Parameters**:
- `address` (required): Device address to read from

**Response**:
```json
{
  "success": true,
  "address": 3,
  "register_value": 3,
  "verification_successful": true,
  "read_timestamp": "2025-01-03T10:36:00.000Z"
}
```

#### 2.3 Find Next Address

**Endpoint**: `GET /find-next-address`

**Description**: Automatically determines the next available slave address.

**Query Parameters**:
- `exclude` (optional): Comma-separated list of addresses to exclude

**Response**:
```json
{
  "success": true,
  "next_address": 4,
  "used_addresses": [1, 2, 3],
  "available_range": "4-255",
  "recommendation": "Use address 4 for optimal performance"
}
```

### 3. Hardware Testing Endpoints

#### 3.1 Test Card

**Endpoint**: `POST /test-card`

**Description**: Performs comprehensive testing of a relay card including communication and relay functionality.

**Request Body**:
```json
{
  "address": 3,
  "test_types": ["communication", "relay_activation", "all_relays"],
  "test_relays": [1, 8, 16]
}
```

**Response**:
```json
{
  "success": true,
  "test_suite": {
    "address": 3,
    "totalTests": 5,
    "passedTests": 5,
    "failedTests": 0,
    "results": [
      {
        "testName": "Communication Test",
        "success": true,
        "duration": 45,
        "details": "Modbus communication successful",
        "timestamp": "2025-01-03T10:40:00.000Z"
      },
      {
        "testName": "Relay 1 Activation",
        "success": true,
        "duration": 520,
        "details": "Physical click detected",
        "timestamp": "2025-01-03T10:40:01.000Z"
      }
    ],
    "overallSuccess": true,
    "duration": 2500
  }
}
```

#### 3.2 Test Relay

**Endpoint**: `POST /test-relay`

**Description**: Tests individual relay activation and provides user confirmation prompts.

**Request Body**:
```json
{
  "address": 3,
  "relay": 5,
  "duration": 500,
  "require_confirmation": true
}
```

**Response**:
```json
{
  "success": true,
  "test_result": {
    "testName": "Relay 5 Activation Test",
    "success": true,
    "duration": 520,
    "details": "Relay activated successfully - please confirm physical click",
    "relay_number": 5,
    "address": 3,
    "confirmation_required": true
  }
}
```

#### 3.3 Validate Setup

**Endpoint**: `POST /validate-setup`

**Description**: Performs end-to-end system validation including configuration integrity and hardware connectivity.

**Request Body**:
```json
{
  "full_validation": true,
  "test_all_cards": true,
  "verify_configuration": true
}
```

**Response**:
```json
{
  "success": true,
  "validation_results": {
    "configuration_valid": true,
    "hardware_responsive": true,
    "all_cards_tested": true,
    "total_lockers_verified": 32,
    "issues_found": 0,
    "warnings": [],
    "recommendations": [
      "System is ready for production use"
    ]
  }
}
```

### 4. Wizard Session Management Endpoints

#### 4.1 Create Wizard Session

**Endpoint**: `POST /wizard/create-session`

**Description**: Initializes a new hardware configuration wizard session.

**Request Body**:
```json
{
  "wizard_type": "add_card",
  "user_info": {
    "name": "Admin User",
    "role": "administrator"
  }
}
```

**Response**:
```json
{
  "success": true,
  "session": {
    "sessionId": "wizard-12345-67890",
    "currentStep": 1,
    "maxCompletedStep": 0,
    "cardData": {},
    "testResults": [],
    "errors": [],
    "createdAt": "2025-01-03T10:45:00.000Z",
    "expiresAt": "2025-01-03T11:45:00.000Z"
  }
}
```

#### 4.2 Get Wizard Session

**Endpoint**: `GET /wizard/session/:id`

**Description**: Retrieves current wizard session state and progress.

**Parameters**:
- `id`: Session ID

**Response**:
```json
{
  "success": true,
  "session": {
    "sessionId": "wizard-12345-67890",
    "currentStep": 3,
    "maxCompletedStep": 2,
    "cardData": {
      "detectedAddress": 0,
      "assignedAddress": 4,
      "deviceType": {
        "manufacturer": "waveshare",
        "model": "16CH Relay",
        "channels": 16
      },
      "testsPassed": false
    },
    "progress": 60,
    "lastUpdated": "2025-01-03T10:50:00.000Z"
  }
}
```

#### 4.3 Update Wizard Session

**Endpoint**: `PUT /wizard/session/:id`

**Description**: Updates wizard session state and progress data.

**Request Body**:
```json
{
  "currentStep": 4,
  "cardData": {
    "testsPassed": true,
    "testResults": [
      {
        "testName": "Communication Test",
        "success": true,
        "duration": 45
      }
    ]
  }
}
```

**Response**:
```json
{
  "success": true,
  "message": "Session updated successfully",
  "session": {
    "sessionId": "wizard-12345-67890",
    "currentStep": 4,
    "progress": 80,
    "lastUpdated": "2025-01-03T10:55:00.000Z"
  }
}
```

#### 4.4 Finalize Wizard

**Endpoint**: `POST /wizard/finalize`

**Description**: Completes wizard process and integrates new hardware into system configuration.

**Request Body**:
```json
{
  "session_id": "wizard-12345-67890",
  "final_configuration": {
    "slave_address": 4,
    "channels": 16,
    "description": "New 16CH Relay Card",
    "enabled": true
  }
}
```

**Response**:
```json
{
  "success": true,
  "message": "Hardware configuration wizard completed successfully",
  "integration_results": {
    "card_added": true,
    "configuration_updated": true,
    "services_restarted": true,
    "new_locker_range": "49-64",
    "total_lockers": 64
  },
  "completion_time": "2025-01-03T11:00:00.000Z"
}
```

### 5. Advanced Configuration Endpoints

#### 5.1 Manual Register Access

**Endpoint**: `POST /read-register`

**Description**: Direct register read access for advanced users.

**Request Body**:
```json
{
  "address": 3,
  "register": "0x4000",
  "count": 1
}
```

**Response**:
```json
{
  "success": true,
  "register_data": {
    "address": 3,
    "register": "0x4000",
    "value": 3,
    "raw_data": "0x0003",
    "read_timestamp": "2025-01-03T11:05:00.000Z"
  }
}
```

#### 5.2 Bulk Operations

**Endpoint**: `POST /bulk-sequential-addressing`

**Description**: Configure multiple cards with sequential addressing.

**Request Body**:
```json
{
  "start_address": 5,
  "card_count": 3,
  "verify_each": true,
  "delay_between_cards": 1000
}
```

**Response**:
```json
{
  "success": true,
  "bulk_results": {
    "total_cards": 3,
    "successful": 3,
    "failed": 0,
    "results": [
      {
        "card_index": 1,
        "assigned_address": 5,
        "success": true,
        "verification_passed": true
      }
    ],
    "completion_time": "2025-01-03T11:10:00.000Z"
  }
}
```

### 6. Configuration Templates

#### 6.1 List Templates

**Endpoint**: `GET /templates`

**Description**: Retrieve all available configuration templates.

**Response**:
```json
{
  "success": true,
  "templates": [
    {
      "id": "template-001",
      "name": "Standard 32-Locker Setup",
      "description": "Two 16CH relay cards with sequential addressing",
      "card_count": 2,
      "total_lockers": 32,
      "created_at": "2025-01-01T00:00:00.000Z",
      "version": "1.0"
    }
  ],
  "total_templates": 1
}
```

#### 6.2 Apply Template

**Endpoint**: `POST /templates/apply`

**Description**: Apply a configuration template to the system.

**Request Body**:
```json
{
  "template_id": "template-001",
  "validate_before_apply": true,
  "backup_current_config": true
}
```

**Response**:
```json
{
  "success": true,
  "application_results": {
    "template_applied": true,
    "validation_passed": true,
    "backup_created": "backup-20250103-1115",
    "cards_configured": 2,
    "total_lockers": 32,
    "services_restarted": true
  }
}
```

## Error Handling

### Standard Error Response Format

All API endpoints return errors in a consistent format:

```json
{
  "success": false,
  "error": "Error message description",
  "error_code": "HARDWARE_001",
  "details": {
    "field": "specific field that caused error",
    "value": "invalid value",
    "expected": "expected value format"
  },
  "timestamp": "2025-01-03T11:20:00.000Z"
}
```

### Common Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `HARDWARE_001` | Serial port not available | Check USB connections and permissions |
| `HARDWARE_002` | Modbus communication timeout | Verify device power and connections |
| `HARDWARE_003` | Address configuration failed | Check device compatibility and address conflicts |
| `HARDWARE_004` | Test execution failed | Verify hardware functionality and connections |
| `HARDWARE_005` | Session not found or expired | Create new wizard session |
| `HARDWARE_006` | Configuration validation failed | Review configuration parameters |
| `HARDWARE_007` | System integration failed | Check system permissions and service status |

### Error Recovery Strategies

1. **Communication Errors**: Automatic retry with exponential backoff
2. **Address Conflicts**: Automatic resolution with next available address
3. **Test Failures**: Detailed diagnostics and troubleshooting guidance
4. **Session Timeouts**: Graceful session recovery and state restoration
5. **Configuration Errors**: Rollback to previous working configuration

## Rate Limiting

API endpoints are rate-limited to prevent hardware overload:

- **Hardware Operations**: 10 requests per minute per session
- **Scanning Operations**: 5 requests per minute per IP
- **Testing Operations**: 20 requests per minute per session
- **Configuration Changes**: 5 requests per minute per user

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1641196800
```

## WebSocket Events

Real-time updates are provided through WebSocket connections:

**Connection**: `ws://localhost:3001/ws/hardware-config`

**Event Types**:
- `scan_progress`: Device scanning progress updates
- `test_progress`: Hardware testing progress updates
- `wizard_step_complete`: Wizard step completion notifications
- `error_occurred`: Real-time error notifications
- `configuration_updated`: System configuration change notifications

**Example Event**:
```json
{
  "type": "scan_progress",
  "data": {
    "current_address": 5,
    "total_addresses": 10,
    "progress_percent": 50,
    "devices_found": 2,
    "timestamp": "2025-01-03T11:25:00.000Z"
  }
}
```

## Integration Examples

### JavaScript/TypeScript Integration

```typescript
class HardwareWizardAPI {
  private baseUrl = '/api/hardware-config';
  
  async scanPorts(): Promise<SerialPortInfo[]> {
    const response = await fetch(`${this.baseUrl}/scan-ports`);
    const data = await response.json();
    return data.ports;
  }
  
  async createWizardSession(): Promise<WizardSession> {
    const response = await fetch(`${this.baseUrl}/wizard/create-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wizard_type: 'add_card' })
    });
    const data = await response.json();
    return data.session;
  }
  
  async testCard(address: number): Promise<TestSuite> {
    const response = await fetch(`${this.baseUrl}/test-card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        address, 
        test_types: ['communication', 'relay_activation'] 
      })
    });
    const data = await response.json();
    return data.test_suite;
  }
}
```

### React Hook Integration

```typescript
import { useState, useEffect } from 'react';

export function useHardwareWizard() {
  const [session, setSession] = useState<WizardSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const createSession = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/hardware-config/wizard/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wizard_type: 'add_card' })
      });
      const data = await response.json();
      setSession(data.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };
  
  return { session, loading, error, createSession };
}
```

## Testing and Development

### API Testing with curl

```bash
# Scan for serial ports
curl -X GET http://localhost:3001/api/hardware-config/scan-ports

# Create wizard session
curl -X POST http://localhost:3001/api/hardware-config/wizard/create-session \
  -H "Content-Type: application/json" \
  -d '{"wizard_type": "add_card"}'

# Test relay card
curl -X POST http://localhost:3001/api/hardware-config/test-card \
  -H "Content-Type: application/json" \
  -d '{"address": 1, "test_types": ["communication", "relay_activation"]}'
```

### Postman Collection

A complete Postman collection is available at `docs/hardware-wizard-api.postman_collection.json` with:
- Pre-configured requests for all endpoints
- Environment variables for easy testing
- Automated test scripts for response validation
- Example request/response data

## Security Considerations

### Authentication Requirements

All API endpoints require valid session authentication:
- Session cookies must be present and valid
- CSRF tokens required for state-changing operations
- Role-based access control enforced

### Input Validation

- All parameters validated against expected types and ranges
- SQL injection prevention through parameterized queries
- Command injection prevention for hardware operations
- Rate limiting to prevent abuse

### Hardware Safety

- Emergency stop functionality available at all times
- Automatic timeout for hardware operations
- Validation of address ranges and device capabilities
- Rollback mechanisms for failed configurations

## Support and Troubleshooting

### Common Issues

1. **"SerialPort module not available"**
   - Install serialport dependency: `npm install serialport`
   - Verify Node.js version compatibility

2. **"Permission denied" on serial port**
   - Add user to dialout group: `sudo usermod -a -G dialout $USER`
   - Set port permissions: `sudo chmod 666 /dev/ttyUSB0`

3. **"Modbus communication timeout"**
   - Check physical connections and power
   - Verify baud rate and serial settings
   - Test with known working device

4. **"Address configuration failed"**
   - Ensure device supports software address configuration
   - Check for address conflicts
   - Verify CRC calculation and command format

### Debug Mode

Enable debug logging by setting environment variable:
```bash
export HARDWARE_DEBUG=true
```

This provides detailed logging of:
- Serial communication commands and responses
- Modbus protocol details
- Hardware detection process
- Configuration changes and validation

### Support Resources

- **API Documentation**: This document
- **User Guide**: `docs/hardware-wizard-user-guide.md`
- **Troubleshooting Guide**: `docs/hardware-wizard-troubleshooting.md`
- **Developer Onboarding**: `docs/hardware-wizard-developer-guide.md`
- **GitHub Issues**: Report bugs and feature requests
- **Community Forum**: Get help from other users

---

**Last Updated**: January 3, 2025  
**API Version**: 1.0  
**Documentation Version**: 1.0