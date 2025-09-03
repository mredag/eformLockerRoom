/**
 * Test Suite for Slave Address Management Service
 * 
 * Tests the implementation of automated slave address configuration
 * based on the proven dual relay card solution patterns.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 8.2, 8.3
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { SlaveAddressService, AddressConflict, ConfigResult, ModbusDevice } from '../slave-address-service';

// Mock SerialPort for testing
vi.mock('serialport', () => ({
  SerialPort: vi.fn().mockImplementation(() => ({
    open: vi.fn((callback) => callback(null)),
    close: vi.fn((callback) => callback()),
    write: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    isOpen: true
  }))
}));

describe('SlaveAddressService', () => {
  let service: SlaveAddressService;
  let mockSerialPort: any;

  const testConfig = {
    port: '/dev/ttyUSB0',
    baudRate: 9600,
    timeout: 2000,
    maxRetries: 3,
    retryDelay: 1000
  };

  beforeEach(async () => {
    service = new SlaveAddressService(testConfig);
    await service.initialize();
    
    // Get mock serial port instance
    const { SerialPort } = await import('serialport');
    mockSerialPort = new SerialPort();
  });

  afterEach(async () => {
    await service.close();
    vi.clearAllMocks();
  });

  describe('Address Discovery and Validation', () => {
    test('should find next available address', async () => {
      // Mock responses for addresses 1-3 (occupied), address 4 (available)
      let callCount = 0;
      mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => {
            callCount++;
            if (callCount <= 3) {
              // Addresses 1-3 respond (occupied)
              const response = Buffer.from([0x01, 0x03, 0x02, 0x00, 0x01, 0x84, 0x0A]);
              callback(response);
            }
            // Address 4+ timeout (available)
          }, 10);
        }
      });

      const availableAddress = await service.findNextAvailableAddress([]);
      expect(availableAddress).toBe(4);
    });

    test('should validate address availability correctly', async () => {
      // Mock response for occupied address
      mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => {
            const response = Buffer.from([0x01, 0x03, 0x02, 0x00, 0x01, 0x84, 0x0A]);
            callback(response);
          }, 10);
        }
      });

      const isAvailable = await service.validateAddressAvailability(1);
      expect(isAvailable).toBe(false);
    });

    test('should detect address conflicts', async () => {
      // Mock multiple devices responding to same address
      let responseCount = 0;
      mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => {
            responseCount++;
            if (responseCount <= 2) {
              // Two devices respond to address 1
              const response = Buffer.from([0x01, 0x03, 0x02, 0x00, 0x01, 0x84, 0x0A]);
              callback(response);
            }
          }, 10);
        }
      });

      const conflicts = await service.detectAddressConflicts();
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].address).toBe(1);
      expect(conflicts[0].severity).toBe('error');
    });

    test('should exclude specified addresses when finding available address', async () => {
      // Mock all addresses 1-5 as occupied
      mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => {
            const response = Buffer.from([0x01, 0x03, 0x02, 0x00, 0x01, 0x84, 0x0A]);
            callback(response);
          }, 10);
        }
      });

      const availableAddress = await service.findNextAvailableAddress([1, 2, 3, 4, 5]);
      expect(availableAddress).toBe(6);
    });
  });

  describe('Broadcast Address Configuration', () => {
    test('should configure address using broadcast command', async () => {
      // Mock successful broadcast response
      mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => {
            // First response: broadcast acknowledgment
            // Second response: verification read
            const response = Buffer.from([0x00, 0x06, 0x40, 0x00, 0x00, 0x02, 0x1C, 0x1A]);
            callback(response);
          }, 10);
        }
      });

      const result = await service.configureBroadcastAddress(2);
      expect(result.success).toBe(true);
      expect(result.address).toBe(2);
      expect(result.verificationPassed).toBe(true);
    });

    test('should handle broadcast configuration failure', async () => {
      // Mock timeout (no response)
      mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
        // No response - timeout
      });

      const result = await service.configureBroadcastAddress(2);
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    test('should validate address range for broadcast configuration', async () => {
      const result = await service.configureBroadcastAddress(256);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid address');
    });
  });

  describe('Direct Address Configuration', () => {
    test('should set slave address for specific device', async () => {
      // Mock successful configuration response
      mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => {
            const response = Buffer.from([0x01, 0x06, 0x40, 0x00, 0x00, 0x02, 0x1C, 0x1A]);
            callback(response);
          }, 10);
        }
      });

      const result = await service.setSlaveAddress(1, 2);
      expect(result.success).toBe(true);
      expect(result.address).toBe(2);
    });

    test('should verify address configuration', async () => {
      // Mock verification response
      mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => {
            // Response shows device reports address 2
            const response = Buffer.from([0x02, 0x03, 0x02, 0x00, 0x02, 0x84, 0x0A]);
            callback(response);
          }, 10);
        }
      });

      const verified = await service.verifyAddressConfiguration(2);
      expect(verified).toBe(true);
    });

    test('should detect address mismatch during verification', async () => {
      // Mock verification response with wrong address
      mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => {
            // Response shows device reports address 1 instead of 2
            const response = Buffer.from([0x02, 0x03, 0x02, 0x00, 0x01, 0x84, 0x0A]);
            callback(response);
          }, 10);
        }
      });

      const verified = await service.verifyAddressConfiguration(2);
      expect(verified).toBe(false);
    });
  });

  describe('Bulk Address Configuration', () => {
    test('should configure sequential addresses', async () => {
      // Mock successful responses for all configurations
      mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => {
            const response = Buffer.from([0x00, 0x06, 0x40, 0x00, 0x00, 0x01, 0x5C, 0x1B]);
            callback(response);
          }, 10);
        }
      });

      const progressCallback = vi.fn();
      const results = await service.configureSequentialAddresses(1, 3, progressCallback);
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      expect(progressCallback).toHaveBeenCalledTimes(3);
    });

    test('should rollback on sequential configuration failure', async () => {
      let callCount = 0;
      mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => {
            callCount++;
            if (callCount <= 2) {
              // First two succeed
              const response = Buffer.from([0x00, 0x06, 0x40, 0x00, 0x00, 0x01, 0x5C, 0x1B]);
              callback(response);
            }
            // Third fails (no response)
          }, 10);
        }
      });

      const results = await service.configureSequentialAddresses(1, 3);
      
      // Should stop at failure and rollback
      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(false);
    });

    test('should resolve address conflicts', async () => {
      const conflicts: AddressConflict[] = [
        {
          address: 1,
          devices: [
            { address: 1, responseTime: 100, lastSeen: new Date() },
            { address: 1, responseTime: 120, lastSeen: new Date() }
          ],
          severity: 'error',
          autoResolvable: true
        }
      ];

      // Mock successful resolution
      mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => {
            const response = Buffer.from([0x00, 0x06, 0x40, 0x00, 0x00, 0x02, 0x1C, 0x1A]);
            callback(response);
          }, 10);
        }
      });

      const resolutions = await service.resolveAddressConflicts(conflicts);
      
      expect(resolutions).toHaveLength(1);
      expect(resolutions[0].success).toBe(true);
      expect(resolutions[0].originalAddress).toBe(1);
      expect(resolutions[0].newAddress).toBeGreaterThan(1);
    });
  });

  describe('CRC16 Calculation', () => {
    test('should calculate CRC16 correctly for known commands', () => {
      // Test with known command from proven solution
      // Command: 00 06 40 00 00 02 (set address 2 via broadcast)
      // Expected CRC: 1C 1A
      const service = new SlaveAddressService(testConfig);
      const command = Buffer.from([0x00, 0x06, 0x40, 0x00, 0x00, 0x02]);
      
      // Access private method for testing
      const crc = (service as any).calculateCRC16(command);
      
      // CRC should be 0x1A1C (little-endian: 1C 1A)
      expect(crc).toBe(0x1A1C);
    });
  });

  describe('Device Cache Management', () => {
    test('should cache known devices', () => {
      const device: ModbusDevice = {
        address: 1,
        responseTime: 100,
        deviceType: 'waveshare_16ch',
        lastSeen: new Date()
      };

      (service as any).knownDevices.set(1, device);
      
      const cachedDevices = service.getKnownDevices();
      expect(cachedDevices.has(1)).toBe(true);
      expect(cachedDevices.get(1)).toEqual(device);
    });

    test('should clear device cache', () => {
      (service as any).knownDevices.set(1, { address: 1, responseTime: 100, lastSeen: new Date() });
      
      service.clearDeviceCache();
      
      const cachedDevices = service.getKnownDevices();
      expect(cachedDevices.size).toBe(0);
    });

    test('should create and restore configuration backup', () => {
      const device: ModbusDevice = {
        address: 1,
        responseTime: 100,
        lastSeen: new Date()
      };

      (service as any).knownDevices.set(1, device);
      
      const backup = service.createConfigurationBackup();
      service.clearDeviceCache();
      
      expect(service.getKnownDevices().size).toBe(0);
      
      service.restoreConfigurationBackup(backup);
      expect(service.getKnownDevices().size).toBe(1);
      expect(service.getKnownDevices().get(1)).toEqual(device);
    });
  });

  describe('Error Handling', () => {
    test('should handle serial port connection errors', async () => {
      const { SerialPort } = await import('serialport');
      SerialPort.mockImplementation(() => ({
        open: vi.fn((callback) => callback(new Error('Port not found'))),
        close: vi.fn((callback) => callback()),
        isOpen: false
      }));

      const errorService = new SlaveAddressService(testConfig);
      
      await expect(errorService.initialize()).rejects.toThrow('Port not found');
    });

    test('should handle command timeout errors', async () => {
      // Mock no response (timeout)
      mockSerialPort.on.mockImplementation(() => {});
      
      const result = await service.configureBroadcastAddress(2);
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    test('should validate address ranges', async () => {
      const result1 = await service.configureBroadcastAddress(0);
      expect(result1.success).toBe(false);
      expect(result1.error).toContain('Invalid address');

      const result2 = await service.configureBroadcastAddress(256);
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('Invalid address');
    });
  });

  describe('Event Emission', () => {
    test('should emit events for successful configuration', async () => {
      const eventSpy = vi.fn();
      service.on('address_configured', eventSpy);

      // Mock successful response
      mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => {
            const response = Buffer.from([0x00, 0x06, 0x40, 0x00, 0x00, 0x02, 0x1C, 0x1A]);
            callback(response);
          }, 10);
        }
      });

      await service.configureBroadcastAddress(2);
      
      expect(eventSpy).toHaveBeenCalledWith({
        address: 2,
        method: 'broadcast'
      });
    });

    test('should emit events for bulk configuration completion', async () => {
      const eventSpy = vi.fn();
      service.on('bulk_configuration_complete', eventSpy);

      // Mock successful responses
      mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => {
            const response = Buffer.from([0x00, 0x06, 0x40, 0x00, 0x00, 0x01, 0x5C, 0x1B]);
            callback(response);
          }, 10);
        }
      });

      await service.configureSequentialAddresses(1, 2);
      
      expect(eventSpy).toHaveBeenCalledWith({
        startAddress: 1,
        count: 2,
        successCount: 2,
        results: expect.any(Array)
      });
    });
  });
});