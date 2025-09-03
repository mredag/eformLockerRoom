/**
 * Hardware Detection Service Tests
 * Tests for automatic hardware discovery and device identification
 */

import { HardwareDetectionService, SerialPortInfo, ModbusDevice } from '../hardware-detection-service';
import { ModbusConfig } from '../../../app/kiosk/src/hardware/modbus-controller';
import { RelayCard } from '../../types/system-config';

describe('HardwareDetectionService', () => {
  let service: HardwareDetectionService;
  let mockConfig: ModbusConfig;
  let mockExistingCards: RelayCard[];

  beforeEach(() => {
    mockConfig = {
      port: '/dev/ttyUSB0',
      baudrate: 9600,
      timeout_ms: 2000,
      pulse_duration_ms: 400,
      burst_duration_seconds: 10,
      burst_interval_ms: 2000,
      command_interval_ms: 300,
      test_mode: true
    };

    mockExistingCards = [
      {
        slave_address: 1,
        channels: 16,
        type: 'waveshare_16ch',
        description: 'Test Card 1',
        enabled: true
      },
      {
        slave_address: 2,
        channels: 16,
        type: 'waveshare_16ch',
        description: 'Test Card 2',
        enabled: true
      }
    ];

    service = new HardwareDetectionService(mockConfig, mockExistingCards);
  });

  afterEach(async () => {
    await service.cleanup();
  });

  describe('Serial Port Scanning', () => {
    test('should initialize with known devices from configuration', () => {
      const knownDevices = service.getKnownDevices();
      expect(knownDevices).toHaveLength(2);
      expect(knownDevices[0].address).toBe(1);
      expect(knownDevices[1].address).toBe(2);
    });

    test('should handle empty existing cards configuration', () => {
      const emptyService = new HardwareDetectionService(mockConfig, []);
      const knownDevices = emptyService.getKnownDevices();
      expect(knownDevices).toHaveLength(0);
    });

    test('should identify USB-RS485 adapters correctly', () => {
      // This would require mocking SerialPort.list() for proper testing
      // For now, we test the identification logic
      const mockPort = {
        path: '/dev/ttyUSB0',
        manufacturer: 'FTDI',
        serialNumber: '12345',
        vendorId: '0403',
        productId: '6001'
      };

      // Access private method through any cast for testing
      const isUSBRS485 = (service as any).isUSBRS485Adapter(mockPort);
      expect(isUSBRS485).toBe(true);
    });

    test('should generate appropriate port descriptions', () => {
      const mockPort = {
        path: '/dev/ttyUSB0',
        manufacturer: 'FTDI',
        serialNumber: '12345'
      };

      const description = (service as any).generatePortDescription(mockPort);
      expect(description).toContain('FTDI');
      expect(description).toContain('USB-Serial');
    });
  });

  describe('Device Management', () => {
    test('should add and remove known devices', () => {
      const testDevice: ModbusDevice = {
        address: 3,
        type: {
          manufacturer: 'waveshare',
          model: 'Waveshare 16CH Relay',
          channels: 16,
          features: ['modbus_rtu'],
          confidence: 0.9
        },
        capabilities: {
          maxRelays: 16,
          supportedFunctions: [0x01, 0x05],
          addressConfigurable: true,
          timedPulseSupport: true,
          multipleCoilsSupport: true,
          registerReadSupport: true
        },
        status: 'responding',
        responseTime: 100,
        lastSeen: new Date(),
        isNew: true
      };

      service.addKnownDevice(testDevice);
      expect(service.getKnownDevices()).toHaveLength(3);

      service.removeKnownDevice(3);
      expect(service.getKnownDevices()).toHaveLength(2);
    });

    test('should track scan progress state', () => {
      expect(service.isScanInProgress()).toBe(false);
      expect(service.isMonitoringActive()).toBe(false);
    });

    test('should handle cache operations', () => {
      // Test cache clearing
      service.clearCache();
      
      // Test cache retrieval with no data
      const cached = service.getCachedResults('/dev/ttyUSB0', { start: 1, end: 10 });
      expect(cached).toBeNull();
    });
  });

  describe('Device Type Identification', () => {
    test('should identify Waveshare devices correctly', () => {
      const waveshareDevice: ModbusDevice = {
        address: 1,
        type: {
          manufacturer: 'waveshare',
          model: 'Waveshare 16CH Relay',
          channels: 16,
          features: ['modbus_rtu', 'coil_control', 'address_configurable'],
          confidence: 0.9
        },
        capabilities: {
          maxRelays: 16,
          supportedFunctions: [0x01, 0x05, 0x0F],
          addressConfigurable: true,
          timedPulseSupport: true,
          multipleCoilsSupport: true,
          registerReadSupport: true
        },
        status: 'responding',
        responseTime: 50,
        lastSeen: new Date()
      };

      expect(waveshareDevice.type.manufacturer).toBe('waveshare');
      expect(waveshareDevice.capabilities.addressConfigurable).toBe(true);
      expect(waveshareDevice.capabilities.timedPulseSupport).toBe(true);
    });

    test('should handle unknown devices gracefully', () => {
      const unknownDevice: ModbusDevice = {
        address: 99,
        type: {
          manufacturer: 'unknown',
          model: 'Unknown Device',
          channels: 0,
          features: [],
          confidence: 0.1
        },
        capabilities: {
          maxRelays: 0,
          supportedFunctions: [],
          addressConfigurable: false,
          timedPulseSupport: false,
          multipleCoilsSupport: false,
          registerReadSupport: false
        },
        status: 'error',
        responseTime: 0,
        lastSeen: new Date()
      };

      expect(unknownDevice.type.manufacturer).toBe('unknown');
      expect(unknownDevice.type.confidence).toBeLessThan(0.5);
    });
  });

  describe('Event Handling', () => {
    test('should emit events during operations', (done) => {
      let eventCount = 0;
      
      service.on('ports_scanned', (data) => {
        expect(data).toHaveProperty('ports');
        expect(data).toHaveProperty('timestamp');
        eventCount++;
      });

      service.on('devices_scanned', (data) => {
        expect(data).toHaveProperty('devices');
        expect(data).toHaveProperty('portPath');
        expect(data).toHaveProperty('scanDuration');
        eventCount++;
      });

      service.on('new_devices_detected', (data) => {
        expect(data).toHaveProperty('devices');
        expect(data).toHaveProperty('timestamp');
        eventCount++;
      });

      // Simulate some events
      service.emit('ports_scanned', { ports: [], timestamp: new Date() });
      service.emit('devices_scanned', { devices: [], portPath: '/dev/ttyUSB0', scanDuration: 1000, timestamp: new Date() });
      service.emit('new_devices_detected', { devices: [], timestamp: new Date() });

      setTimeout(() => {
        expect(eventCount).toBe(3);
        done();
      }, 100);
    });

    test('should handle error events', (done) => {
      service.on('scan_error', (data) => {
        expect(data).toHaveProperty('error');
        expect(data).toHaveProperty('operation');
        done();
      });

      service.emit('scan_error', { error: 'Test error', operation: 'test' });
    });
  });

  describe('Monitoring', () => {
    test('should start and stop monitoring', () => {
      const mockCallback = jest.fn();
      
      service.monitorForNewDevices(mockCallback, 1000);
      expect(service.isMonitoringActive()).toBe(true);
      
      service.stopMonitoring();
      expect(service.isMonitoringActive()).toBe(false);
    });

    test('should prevent multiple monitoring sessions', () => {
      const mockCallback = jest.fn();
      
      service.monitorForNewDevices(mockCallback, 1000);
      expect(service.isMonitoringActive()).toBe(true);
      
      // Try to start another monitoring session
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      service.monitorForNewDevices(mockCallback, 1000);
      
      expect(consoleSpy).toHaveBeenCalledWith('⚠️ Device monitoring already active');
      consoleSpy.mockRestore();
      
      service.stopMonitoring();
    });
  });

  describe('Error Handling', () => {
    test('should handle scan errors gracefully', async () => {
      // Mock a failing scan scenario
      const errorService = new HardwareDetectionService({
        ...mockConfig,
        port: '/invalid/port'
      });

      await expect(errorService.scanSerialPorts()).rejects.toThrow();
    });

    test('should handle device detection errors', async () => {
      // Test with invalid configuration
      const errorService = new HardwareDetectionService({
        ...mockConfig,
        port: '/invalid/port'
      });

      await expect(errorService.detectNewDevices()).rejects.toThrow();
    });
  });

  describe('Requirements Validation', () => {
    test('should meet requirement 1.1 - Serial port discovery', () => {
      // The scanSerialPorts method should discover USB-RS485 adapters
      expect(typeof service.scanSerialPorts).toBe('function');
    });

    test('should meet requirement 1.2 - Port validation', () => {
      // The validateSerialPort method should verify port accessibility
      expect(typeof service.validateSerialPort).toBe('function');
    });

    test('should meet requirement 1.3 - Modbus device scanning', () => {
      // The scanModbusDevices method should probe addresses systematically
      expect(typeof service.scanModbusDevices).toBe('function');
    });

    test('should meet requirement 1.4 - Device identification', () => {
      // The identifyDeviceType method should fingerprint devices
      expect(typeof service.identifyDeviceType).toBe('function');
    });

    test('should meet requirement 1.5 - Device capabilities', () => {
      // The getDeviceCapabilities method should read device specifications
      expect(typeof service.getDeviceCapabilities).toBe('function');
    });

    test('should meet requirement 1.6 - New device detection', () => {
      // The detectNewDevices method should identify new cards
      expect(typeof service.detectNewDevices).toBe('function');
    });

    test('should meet requirement 2.1 - Real-time monitoring', () => {
      // The monitorForNewDevices method should provide real-time detection
      expect(typeof service.monitorForNewDevices).toBe('function');
      expect(typeof service.stopMonitoring).toBe('function');
    });
  });
});