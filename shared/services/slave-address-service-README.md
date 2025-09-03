# Slave Address Management Service

## Overview

The Slave Address Management Service provides automated slave address configuration for Modbus devices in the Hardware Configuration Wizard. This service is built directly upon the proven dual relay card solution that successfully resolved the dual Waveshare relay card configuration problem.

## Key Features

- **Automatic Address Discovery**: Systematically scans addresses 1-255 to find available addresses
- **Broadcast Configuration**: Uses proven broadcast address (0x00) method for initial device setup
- **Address Validation**: Verifies configuration using register 0x4000 read method
- **Conflict Detection**: Identifies and resolves duplicate address conflicts
- **Bulk Configuration**: Supports sequential configuration of multiple cards
- **Rollback Support**: Provides configuration backup and rollback functionality
- **Event-Driven**: Emits events for monitoring and integration

## Technical Foundation

This service implements the exact patterns from the proven dual relay card solution:

### CRC16 Calculation
```typescript
// Uses the working CRC16 implementation from scripts/configure-relay-slave-addresses.js
private calculateCRC16(data: Buffer): number {
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

### Broadcast Commands
```typescript
// Proven broadcast command format from dual card solution
// Set Card to Address 2: 00 06 40 00 00 02 1C 1A
const command = this.buildWriteRegisterCommand(0x00, 0x4000, newAddress);
```

### Address Verification
```typescript
// Uses register 0x4000 verification method that works in production
const command = this.buildReadRegisterCommand(address, 0x4000, 1);
```

## Usage Examples

### Basic Address Configuration

```typescript
import { SlaveAddressService } from './slave-address-service';

const service = new SlaveAddressService({
  port: '/dev/ttyUSB0',
  baudRate: 9600,
  timeout: 2000,
  maxRetries: 3,
  retryDelay: 1000
});

await service.initialize();

// Configure card to address 2 using broadcast
const result = await service.configureBroadcastAddress(2);
if (result.success) {
  console.log(`Card configured to address ${result.address}`);
}

await service.close();
```

### Address Discovery

```typescript
// Find next available address
const availableAddress = await service.findNextAvailableAddress([1, 2]); // Exclude 1, 2

// Check if specific address is available
const isAvailable = await service.validateAddressAvailability(5);

// Detect conflicts
const conflicts = await service.detectAddressConflicts();
```

### Bulk Configuration

```typescript
// Configure 4 cards sequentially (addresses 1-4)
const progressCallback = (progress, address, result) => {
  console.log(`Progress: ${progress}% - Address ${address}: ${result.success ? 'OK' : 'FAILED'}`);
};

const results = await service.configureSequentialAddresses(1, 4, progressCallback);
```

### Conflict Resolution

```typescript
// Detect and resolve conflicts automatically
const conflicts = await service.detectAddressConflicts();
if (conflicts.length > 0) {
  const resolutions = await service.resolveAddressConflicts(conflicts);
  console.log(`Resolved ${resolutions.filter(r => r.success).length} conflicts`);
}
```

## API Reference

### Core Methods

#### `initialize(): Promise<void>`
Initialize the service and open serial connection.

#### `close(): Promise<void>`
Close the serial connection and cleanup resources.

#### `findNextAvailableAddress(excludeAddresses?: number[]): Promise<number>`
Find the next available slave address, optionally excluding specified addresses.

#### `validateAddressAvailability(address: number): Promise<boolean>`
Check if a specific address is available (not occupied by a device).

#### `detectAddressConflicts(): Promise<AddressConflict[]>`
Scan the bus for address conflicts and return detailed conflict information.

#### `configureBroadcastAddress(newAddress: number): Promise<ConfigResult>`
Configure a device to a new address using broadcast command (address 0x00).

#### `setSlaveAddress(currentAddress: number, newAddress: number): Promise<ConfigResult>`
Configure a specific device from current address to new address.

#### `verifyAddressConfiguration(address: number): Promise<boolean>`
Verify that a device is properly configured at the specified address.

#### `configureSequentialAddresses(startAddress: number, count: number, progressCallback?: Function): Promise<ConfigResult[]>`
Configure multiple devices sequentially with progress reporting.

#### `resolveAddressConflicts(conflicts: AddressConflict[]): Promise<ResolutionResult[]>`
Automatically resolve address conflicts by reassigning devices.

### Utility Methods

#### `createConfigurationBackup(): Map<number, ModbusDevice>`
Create a backup of the current device configuration.

#### `restoreConfigurationBackup(backup: Map<number, ModbusDevice>): void`
Restore configuration from a backup.

#### `getKnownDevices(): Map<number, ModbusDevice>`
Get cached information about known devices.

#### `clearDeviceCache(): void`
Clear the device cache.

## Data Types

### ConfigResult
```typescript
interface ConfigResult {
  address: number;
  success: boolean;
  error?: string;
  verificationPassed: boolean;
  responseTime?: number;
}
```

### AddressConflict
```typescript
interface AddressConflict {
  address: number;
  devices: ModbusDevice[];
  severity: 'warning' | 'error';
  autoResolvable: boolean;
}
```

### ModbusDevice
```typescript
interface ModbusDevice {
  address: number;
  responseTime: number;
  deviceType?: string;
  capabilities?: DeviceCapabilities;
  lastSeen: Date;
}
```

### ResolutionResult
```typescript
interface ResolutionResult {
  originalAddress: number;
  newAddress: number;
  success: boolean;
  error?: string;
}
```

## Events

The service emits the following events:

- `initialized`: Service has been initialized
- `address_configured`: A device address has been configured
- `bulk_configuration_complete`: Bulk configuration process completed
- `conflicts_resolved`: Address conflicts have been resolved

### Event Usage

```typescript
service.on('address_configured', (data) => {
  console.log(`Address ${data.address} configured via ${data.method}`);
});

service.on('bulk_configuration_complete', (data) => {
  console.log(`${data.successCount}/${data.count} cards configured`);
});
```

## Error Handling

The service provides comprehensive error handling:

- **Connection Errors**: Serial port connection issues
- **Timeout Errors**: Device communication timeouts
- **Validation Errors**: Address range and format validation
- **Configuration Errors**: Device configuration failures
- **Conflict Errors**: Address conflict resolution failures

All methods return structured error information in their result objects.

## Integration with Hardware Configuration Wizard

The service is designed to integrate seamlessly with the Hardware Configuration Wizard:

1. **Step 1**: Scan for existing devices and conflicts
2. **Step 2**: Find available address for new card
3. **Step 3**: Configure new card using broadcast method
4. **Step 4**: Verify configuration and integrate with system

```typescript
// Wizard integration example
const conflicts = await service.detectAddressConflicts();
if (conflicts.length > 0) {
  await service.resolveAddressConflicts(conflicts);
}

const newAddress = await service.findNextAvailableAddress();
const result = await service.configureBroadcastAddress(newAddress);

if (result.success && result.verificationPassed) {
  // Proceed with system integration
}
```

## Testing

The service includes comprehensive test coverage:

- Unit tests for all core methods
- Mock serial port for reliable testing
- Error condition testing
- Event emission testing
- CRC16 calculation validation

Run tests with:
```bash
npm test shared/services/__tests__/slave-address-service.test.ts
```

## Production Validation

This service is based on the proven dual relay card solution that:

- ✅ Successfully resolved dual relay card conflicts in production
- ✅ Achieved 100% API test success rate (6/6 tests passed)
- ✅ Delivered perfect hardware isolation with 0% error rate
- ✅ Supports 32 independent lockers with stable system uptime

## Requirements Compliance

The service fulfills the following requirements:

- **3.1**: Address discovery and validation using proven scanning techniques
- **3.2**: Broadcast address configuration with exact command format
- **3.3**: Address verification using register 0x4000 method
- **3.4**: Conflict detection with systematic address probing
- **3.5**: Error handling patterns from production deployment
- **3.6**: Configuration verification and rollback support
- **8.2**: Sequential addressing for multiple card setup
- **8.3**: Automatic conflict resolution and bulk operations

## Dependencies

- `serialport`: Serial communication with Modbus devices
- `events`: Event emitter for status notifications

## Configuration

```typescript
interface SlaveAddressConfig {
  port: string;          // Serial port path (e.g., '/dev/ttyUSB0')
  baudRate: number;      // Baud rate (typically 9600)
  timeout: number;       // Command timeout in milliseconds
  maxRetries: number;    // Maximum retry attempts
  retryDelay: number;    // Base delay between retries
}
```

## Best Practices

1. **Always initialize** the service before use
2. **Always close** the service when done
3. **Use broadcast configuration** for unknown device addresses
4. **Verify configuration** after each address change
5. **Handle errors gracefully** with appropriate user feedback
6. **Create backups** before bulk operations
7. **Monitor events** for real-time status updates

## Troubleshooting

### Common Issues

1. **Port Access Denied**: Ensure user has permission to access serial port
2. **Device Not Responding**: Check physical connections and power
3. **Address Conflicts**: Use conflict detection and resolution methods
4. **Timeout Errors**: Increase timeout value or check bus load
5. **CRC Errors**: Verify command format and CRC calculation

### Debug Logging

Enable debug logging to troubleshoot issues:

```typescript
// The service logs all operations to console
// Look for these prefixes:
// 🔍 - Discovery operations
// 🔧 - Configuration operations
// ✅ - Success messages
// ❌ - Error messages
// 📡 - Command transmission
// 📨 - Response reception
```

## License

This service is part of the eForm Locker System and follows the same licensing terms.