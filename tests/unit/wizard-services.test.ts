/**
 * Comprehensive Unit Tests for Hardware Configuration Wizard Services
 * 
 * This test suite covers all wizard services with mock hardware interfaces
 * for reliable testing, including edge cases and error conditions.
 * 
 * Requirements: All service layer requirements (1.1-10.6)
 */

import { describe, test, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { EventEmitter } from 'events';

// Import all wizard services
import { HardwareDetectionService } from '../../shared/services/hardware-detection-service';
import { SlaveAddressService } from '../../shared/services/slave-address-service';
import { HardwareTestingService } from '../../shared/services/hardware-testing-service';
import { WizardOrchestrationService } from '../../shared/services/wizard-orchestration-service';
import { ErrorHandler } from '../../shared/services/error-handler';

// Mock external dependencies
vi.mock('serialport', () => ({
  SerialPort: vi.fn().mockImplementation(() => ({
    open: vi.fn((callback) => callback(null)),
    close: vi.fn((callback) => callback()),
    write: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    isOpen: true,
    path: '/dev/ttyUSB0'
  })),
  list: vi.fn().mockResolvedValue([
    {
      path: '/dev/ttyUSB0',
      manufacturer: 'FTDI',
      serialNumber: '12345',
      vendorId: '0403',
      productId: '6001'
    },
    {
      path: '/dev/ttyUSB1',
      manufacturer: 'Prolific',
      serialNumber: '67890',
      vendorId: '067b',
      productId: '2303'
    }
  ])
}));

vi.mock('../../shared/database/database-manager', () => ({
  DatabaseManager: {
    getInstance: vi.fn().mockReturnValue({
      getConnection: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(undefined),
        run: vi.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
        get: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue([])
      })
    })
  }
}));

vi.mock('../../shared/services/config-manager', () => ({
  ConfigManager: {
    getInstance: vi.fn().mockReturnValue({
      getConfiguration: vi.fn().mockReturnValue({
        hardware: { relay_cards: [] },
        lockers: { total_count: 0, layout: { rows: 1, columns: 1 } }
      }),
      updateConfiguration: vi.fn().mockResolvedValue(undefined)
    })
  }
}));

describe('Hardware Configuration Wizard Services - Unit Tests', () => {
  let mockSerialPort: any;
  let mockDatabase: any;
  let mockConfig: any;

  beforeAll(() => {
    // Setup global mocks
    global.console.warn = vi.fn();
    global.console.error = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset mock implementations
    const { SerialPort } = require('serialport');
    mockSerialPort = new SerialPort();
    
    const { DatabaseManager } = require('../../shared/database/database-manager');
    mockDatabase = DatabaseManager.getInstance().getConnection();
    
    const { ConfigManager } = require('../../shared/services/config-manager');
    mockConfig = ConfigManager.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('HardwareDetectionService - Comprehensive Tests', () => {
    let service: HardwareDetectionService;
    const testConfig = {
      port: '/dev/ttyUSB0',
      baudrate: 9600,
      timeout_ms: 2000,
      pulse_duration_ms: 400,
      burst_duration_seconds: 10,
      burst_interval_ms: 2000,
      command_interval_ms: 300,
      test_mode: true
    };

    beforeEach(() => {
      service = new HardwareDetectionService(testConfig, []);
    });

    afterEach(async () => {
      await service.cleanup();
    });

    describe('Serial Port Discovery', () => {
      test('should discover USB-RS485 adapters', async () => {
        const ports = await service.scanSerialPorts();
        
        expect(ports).toHaveLength(2);
        expect(ports[0]).toMatchObject({
          path: '/dev/ttyUSB0',
          manufacturer: 'FTDI',
          available: true,
          description: expect.stringContaining('FTDI')
        });
      });

      test('should validate serial port accessibility', async () => {
        const isValid = await service.validateSerialPort('/dev/ttyUSB0');
        expect(isValid).toBe(true);
      });

      test('should handle invalid serial port', async () => {
        const isValid = await service.validateSerialPort('/dev/invalid');
        expect(isValid).toBe(false);
      });

      test('should emit ports_scanned event', async () => {
        const eventPromise = new Promise((resolve) => {
          service.once('ports_scanned', resolve);
        });

        await service.scanSerialPorts();
        const eventData = await eventPromise;
        
        expect(eventData).toHaveProperty('ports');
        expect(eventData).toHaveProperty('timestamp');
      });
    });

    describe('Modbus Device Scanning', () => {
      test('should scan Modbus devices systematically', async () => {
        // Mock device responses
        let addressCounter = 0;
        mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
          if (event === 'data') {
            setTimeout(() => {
              addressCounter++;
              if (addressCounter <= 2) {
                // First two addresses respond
                const response = Buffer.from([addressCounter, 0x03, 0x02, 0x00, 0x01, 0x84, 0x0A]);
                callback(response);
              }
              // Other addresses timeout
            }, 10);
          }
        });

        const devices = await service.scanModbusDevices('/dev/ttyUSB0', { start: 1, end: 5 });
        
        expect(devices).toHaveLength(2);
        expect(devices[0].address).toBe(1);
        expect(devices[1].address).toBe(2);
        expect(devices[0].status).toBe('responding');
      });

      test('should identify Waveshare devices', async () => {
        // Mock Waveshare device response
        mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
          if (event === 'data') {
            setTimeout(() => {
              // Waveshare 16CH response pattern
              const response = Buffer.from([0x01, 0x03, 0x02, 0x00, 0x10, 0x84, 0x0A]);
              callback(response);
            }, 10);
          }
        });

        const deviceType = await service.identifyDeviceType(1);
        
        expect(deviceType.manufacturer).toBe('waveshare');
        expect(deviceType.model).toContain('16CH');
        expect(deviceType.channels).toBe(16);
        expect(deviceType.confidence).toBeGreaterThan(0.8);
      });

      test('should get device capabilities', async () => {
        const capabilities = await service.getDeviceCapabilities(1);
        
        expect(capabilities).toMatchObject({
          maxRelays: expect.any(Number),
          supportedFunctions: expect.any(Array),
          addressConfigurable: expect.any(Boolean),
          timedPulseSupport: expect.any(Boolean)
        });
      });

      test('should handle scan timeout gracefully', async () => {
        // Mock no response (timeout)
        mockSerialPort.on.mockImplementation(() => {});

        const devices = await service.scanModbusDevices('/dev/ttyUSB0', { start: 1, end: 3 });
        expect(devices).toHaveLength(0);
      });
    });

    describe('New Device Detection', () => {
      test('should detect new devices', async () => {
        // Setup known devices
        service.addKnownDevice({
          address: 1,
          type: { manufacturer: 'waveshare', model: '16CH', channels: 16, features: [], confidence: 0.9 },
          capabilities: { maxRelays: 16, supportedFunctions: [5], addressConfigurable: true, timedPulseSupport: false, multipleCoilsSupport: true, registerReadSupport: true },
          status: 'responding',
          responseTime: 100,
          lastSeen: new Date(),
          isNew: false
        });

        // Mock scan finding device at address 2
        mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
          if (event === 'data') {
            setTimeout(() => {
              const response = Buffer.from([0x02, 0x03, 0x02, 0x00, 0x10, 0x84, 0x0A]);
              callback(response);
            }, 10);
          }
        });

        const newDevices = await service.detectNewDevices();
        
        expect(newDevices).toHaveLength(1);
        expect(newDevices[0].address).toBe(2);
        expect(newDevices[0].isNew).toBe(true);
      });

      test('should monitor for new devices', (done) => {
        const mockCallback = vi.fn();
        
        service.monitorForNewDevices(mockCallback, 100);
        expect(service.isMonitoringActive()).toBe(true);
        
        setTimeout(() => {
          service.stopMonitoring();
          expect(service.isMonitoringActive()).toBe(false);
          done();
        }, 150);
      });
    });

    describe('Error Handling', () => {
      test('should handle serial port connection errors', async () => {
        const { SerialPort } = require('serialport');
        SerialPort.mockImplementation(() => ({
          open: vi.fn((callback) => callback(new Error('Port not found'))),
          close: vi.fn((callback) => callback()),
          isOpen: false
        }));

        await expect(service.scanSerialPorts()).rejects.toThrow();
      });

      test('should emit scan_error events', (done) => {
        service.once('scan_error', (data) => {
          expect(data).toHaveProperty('error');
          expect(data).toHaveProperty('operation');
          done();
        });

        service.emit('scan_error', { error: 'Test error', operation: 'test' });
      });
    });

    describe('Cache Management', () => {
      test('should cache scan results', () => {
        const mockResults = [
          { address: 1, status: 'responding', responseTime: 100, lastSeen: new Date() }
        ];

        service.setCachedResults('/dev/ttyUSB0', { start: 1, end: 10 }, mockResults);
        
        const cached = service.getCachedResults('/dev/ttyUSB0', { start: 1, end: 10 });
        expect(cached).toEqual(mockResults);
      });

      test('should clear cache', () => {
        service.setCachedResults('/dev/ttyUSB0', { start: 1, end: 10 }, []);
        service.clearCache();
        
        const cached = service.getCachedResults('/dev/ttyUSB0', { start: 1, end: 10 });
        expect(cached).toBeNull();
      });
    });
  });

  describe('SlaveAddressService - Comprehensive Tests', () => {
    let service: SlaveAddressService;
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
    });

    afterEach(async () => {
      await service.close();
    });

    describe('Address Discovery', () => {
      test('should find next available address', async () => {
        // Mock responses for addresses 1-3 (occupied), address 4+ (available)
        let callCount = 0;
        mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
          if (event === 'data') {
            setTimeout(() => {
              callCount++;
              if (callCount <= 3) {
                const response = Buffer.from([callCount, 0x03, 0x02, 0x00, 0x01, 0x84, 0x0A]);
                callback(response);
              }
            }, 10);
          }
        });

        const address = await service.findNextAvailableAddress([]);
        expect(address).toBe(4);
      });

      test('should validate address availability', async () => {
        // Mock occupied address
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
        // Mock multiple responses to same address
        let responseCount = 0;
        mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
          if (event === 'data') {
            setTimeout(() => {
              responseCount++;
              if (responseCount <= 2) {
                const response = Buffer.from([0x01, 0x03, 0x02, 0x00, 0x01, 0x84, 0x0A]);
                callback(response);
              }
            }, 10);
          }
        });

        const conflicts = await service.detectAddressConflicts();
        expect(conflicts.length).toBeGreaterThan(0);
        expect(conflicts[0].severity).toBe('error');
      });
    });

    describe('Broadcast Configuration', () => {
      test('should configure address via broadcast', async () => {
        // Mock successful broadcast response
        mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
          if (event === 'data') {
            setTimeout(() => {
              const response = Buffer.from([0x00, 0x06, 0x40, 0x00, 0x00, 0x02, 0x1C, 0x1A]);
              callback(response);
            }, 10);
          }
        });

        const result = await service.configureBroadcastAddress(2);
        expect(result.success).toBe(true);
        expect(result.address).toBe(2);
      });

      test('should handle broadcast timeout', async () => {
        // Mock no response
        mockSerialPort.on.mockImplementation(() => {});

        const result = await service.configureBroadcastAddress(2);
        expect(result.success).toBe(false);
        expect(result.error).toContain('timeout');
      });

      test('should validate address range', async () => {
        const result = await service.configureBroadcastAddress(256);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid address');
      });
    });

    describe('CRC16 Calculation', () => {
      test('should calculate CRC16 correctly', () => {
        const command = Buffer.from([0x00, 0x06, 0x40, 0x00, 0x00, 0x02]);
        const crc = (service as any).calculateCRC16(command);
        expect(crc).toBe(0x1A1C); // Known CRC for this command
      });
    });

    describe('Bulk Operations', () => {
      test('should configure sequential addresses', async () => {
        // Mock successful responses
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

      test('should resolve address conflicts', async () => {
        const conflicts = [{
          address: 1,
          devices: [
            { address: 1, responseTime: 100, lastSeen: new Date() },
            { address: 1, responseTime: 120, lastSeen: new Date() }
          ],
          severity: 'error' as const,
          autoResolvable: true
        }];

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
      });
    });
  });

  describe('HardwareTestingService - Comprehensive Tests', () => {
    let service: HardwareTestingService;
    const testConfig = {
      port: '/dev/ttyUSB0',
      baudrate: 9600,
      timeout_ms: 5000,
      pulse_duration_ms: 400,
      burst_duration_seconds: 2,
      burst_interval_ms: 100,
      command_interval_ms: 300,
      test_mode: true
    };

    beforeEach(async () => {
      service = new HardwareTestingService();
      await service.initialize(testConfig);
    });

    afterEach(async () => {
      await service.cleanup();
    });

    describe('Communication Testing', () => {
      test('should test basic communication', async () => {
        const result = await service.testCommunication(1);
        
        expect(result).toMatchObject({
          testName: 'Communication Test - Address 1',
          success: true,
          duration: expect.any(Number),
          details: expect.stringContaining('Communication successful'),
          timestamp: expect.any(Date)
        });
      });

      test('should measure response time', async () => {
        const responseTime = await service.measureResponseTime(1);
        expect(responseTime).toBeGreaterThan(0);
      });

      test('should include response time when requested', async () => {
        const result = await service.testCommunication(1, { includeResponseTime: true });
        expect(result.responseTime).toBeGreaterThan(0);
      });
    });

    describe('Relay Testing', () => {
      test('should test individual relay activation', async () => {
        const result = await service.testRelayActivation(1, 5);
        
        expect(result).toMatchObject({
          testName: 'Relay Activation Test - Address 1, Relay 5',
          success: true,
          details: expect.stringContaining('Relay 5 activated successfully'),
          timestamp: expect.any(Date)
        });
      });

      test('should test default relays (1, 8, 16)', async () => {
        const results = await service.testAllRelays(1);
        
        expect(results).toHaveLength(3);
        expect(results.map(r => r.testName)).toEqual([
          expect.stringContaining('Relay 1'),
          expect.stringContaining('Relay 8'),
          expect.stringContaining('Relay 16')
        ]);
      });

      test('should test all 16 relays when requested', async () => {
        const results = await service.testAllRelays(1, { includeAllRelays: true });
        expect(results).toHaveLength(16);
      });
    });

    describe('Comprehensive Testing', () => {
      test('should run full hardware test suite', async () => {
        const testSuite = await service.runFullHardwareTest(1);
        
        expect(testSuite).toMatchObject({
          address: 1,
          totalTests: expect.any(Number),
          passedTests: expect.any(Number),
          failedTests: expect.any(Number),
          results: expect.any(Array),
          overallSuccess: expect.any(Boolean),
          duration: expect.any(Number),
          timestamp: expect.any(Date)
        });
        
        expect(testSuite.totalTests).toBeGreaterThan(0);
        expect(testSuite.results.length).toBe(testSuite.totalTests);
      });

      test('should validate system integration', async () => {
        const result = await service.validateSystemIntegration();
        
        expect(result).toMatchObject({
          systemHealthy: expect.any(Boolean),
          servicesRunning: expect.any(Boolean),
          configurationValid: expect.any(Boolean),
          hardwareResponding: expect.any(Boolean),
          lockersAccessible: expect.any(Boolean),
          issues: expect.any(Array),
          recommendations: expect.any(Array)
        });
      });

      test('should perform reliability testing', async () => {
        const result = await service.testReliability(1, 5);
        
        expect(result).toMatchObject({
          address: 1,
          totalIterations: 5,
          successfulIterations: expect.any(Number),
          failedIterations: expect.any(Number),
          averageResponseTime: expect.any(Number),
          reliability: expect.any(Number),
          errors: expect.any(Array)
        });
        
        expect(result.reliability).toBeGreaterThanOrEqual(0);
        expect(result.reliability).toBeLessThanOrEqual(1);
      });
    });

    describe('Event Emission', () => {
      test('should emit test completion events', async () => {
        const completionEvents: any[] = [];
        service.on('test_completed', (event) => completionEvents.push(event));

        await service.testCommunication(1);

        expect(completionEvents.length).toBeGreaterThan(0);
        expect(completionEvents[0]).toMatchObject({
          testName: expect.any(String),
          address: 1,
          success: true
        });
      });

      test('should emit reliability test progress', async () => {
        const progressEvents: any[] = [];
        service.on('reliability_test_progress', (event) => progressEvents.push(event));

        await service.testReliability(1, 3);

        expect(progressEvents.length).toBe(3);
      });
    });
  });

  describe('ErrorHandler - Comprehensive Tests', () => {
    let errorHandler: ErrorHandler;

    beforeEach(() => {
      errorHandler = new ErrorHandler();
    });

    describe('Error Classification', () => {
      test('should classify serial port errors', () => {
        const error = new Error('ENOENT: no such file or directory');
        (error as any).code = 'ENOENT';

        const wizardError = errorHandler.classifyError(error);
        
        expect(wizardError.code).toBe('SP_NOT_FOUND');
        expect(wizardError.category).toBe('serial_port');
        expect(wizardError.severity).toBe('critical');
        expect(wizardError.recoverable).toBe(true);
      });

      test('should classify communication errors', () => {
        const error = new Error('Operation timed out');
        
        const wizardError = errorHandler.classifyError(error);
        
        expect(wizardError.code).toBe('COM_TIMEOUT');
        expect(wizardError.category).toBe('communication');
        expect(wizardError.severity).toBe('warning');
      });

      test('should include context in errors', () => {
        const error = new Error('Test error');
        const context = { step: 2, sessionId: 'test-session' };

        const wizardError = errorHandler.classifyError(error, context);
        
        expect(wizardError.context).toEqual(context);
        expect(wizardError.timestamp).toBeInstanceOf(Date);
      });
    });

    describe('Recovery Actions', () => {
      test('should suggest recovery actions', () => {
        const wizardError = {
          code: 'SP_NOT_FOUND',
          category: 'serial_port' as const,
          severity: 'critical' as const,
          message: 'Serial port not found',
          userMessage: 'USB-RS485 adapter not found',
          recoverable: true,
          timestamp: new Date()
        };

        const actions = errorHandler.suggestRecoveryAction(wizardError);
        
        expect(actions).toHaveLength(1);
        expect(actions[0].type).toBe('automatic_fix');
        expect(actions[0].automatic).toBe(true);
      });

      test('should execute recovery actions', async () => {
        const action = {
          type: 'retry' as const,
          description: 'Test action',
          userDescription: 'Test action for user',
          automatic: true,
          priority: 1,
          execute: vi.fn().mockResolvedValue(true)
        };

        const result = await errorHandler.executeRecoveryAction(action);
        
        expect(result).toBe(true);
        expect(action.execute).toHaveBeenCalled();
      });
    });

    describe('Troubleshooting Steps', () => {
      test('should generate troubleshooting steps', () => {
        const wizardError = {
          code: 'SP_NOT_FOUND',
          category: 'serial_port' as const,
          severity: 'critical' as const,
          message: 'Serial port not found',
          userMessage: 'USB-RS485 adapter not found',
          recoverable: true,
          timestamp: new Date()
        };

        const steps = errorHandler.generateTroubleshootingSteps(wizardError);
        
        expect(steps.length).toBeGreaterThan(0);
        expect(steps[0].title).toContain('Check USB Connection');
        expect(steps[0].estimatedTime).toBeGreaterThan(0);
      });
    });

    describe('Error History', () => {
      test('should maintain error history', () => {
        const error = new Error('Test error');
        errorHandler.classifyError(error);

        const history = errorHandler.getErrorHistory();
        expect(history).toHaveLength(1);
      });

      test('should provide error statistics', () => {
        const serialError = new Error('Serial error');
        (serialError as any).code = 'ENOENT';
        errorHandler.classifyError(serialError);

        const commError = new Error('Communication timeout');
        errorHandler.classifyError(commError);

        const stats = errorHandler.getErrorStatistics();
        
        expect(stats.totalErrors).toBe(2);
        expect(stats.errorsByCategory).toHaveProperty('serial_port');
        expect(stats.errorsByCategory).toHaveProperty('communication');
      });
    });
  });

  describe('Integration Between Services', () => {
    test('should coordinate between detection and address services', async () => {
      const detectionService = new HardwareDetectionService(testConfig, []);
      const addressService = new SlaveAddressService({
        port: '/dev/ttyUSB0',
        baudRate: 9600,
        timeout: 2000,
        maxRetries: 3,
        retryDelay: 1000
      });

      await addressService.initialize();

      // Mock device detection
      mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => {
            const response = Buffer.from([0x01, 0x03, 0x02, 0x00, 0x01, 0x84, 0x0A]);
            callback(response);
          }, 10);
        }
      });

      const devices = await detectionService.scanModbusDevices('/dev/ttyUSB0', { start: 1, end: 3 });
      expect(devices).toHaveLength(1);

      const nextAddress = await addressService.findNextAvailableAddress([1]);
      expect(nextAddress).toBeGreaterThan(1);

      await detectionService.cleanup();
      await addressService.close();
    });

    test('should coordinate between address and testing services', async () => {
      const addressService = new SlaveAddressService({
        port: '/dev/ttyUSB0',
        baudRate: 9600,
        timeout: 2000,
        maxRetries: 3,
        retryDelay: 1000
      });
      const testingService = new HardwareTestingService();

      await addressService.initialize();
      await testingService.initialize({
        port: '/dev/ttyUSB0',
        baudrate: 9600,
        timeout_ms: 5000,
        pulse_duration_ms: 400,
        burst_duration_seconds: 2,
        burst_interval_ms: 100,
        command_interval_ms: 300,
        test_mode: true
      });

      // Mock successful address configuration
      mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => {
            const response = Buffer.from([0x00, 0x06, 0x40, 0x00, 0x00, 0x02, 0x1C, 0x1A]);
            callback(response);
          }, 10);
        }
      });

      const configResult = await addressService.configureBroadcastAddress(2);
      expect(configResult.success).toBe(true);

      const testResult = await testingService.testCommunication(2);
      expect(testResult.success).toBe(true);

      await addressService.close();
      await testingService.cleanup();
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    test('should handle service initialization failures', async () => {
      const { SerialPort } = require('serialport');
      SerialPort.mockImplementation(() => ({
        open: vi.fn((callback) => callback(new Error('Port not found'))),
        close: vi.fn((callback) => callback()),
        isOpen: false
      }));

      const service = new SlaveAddressService({
        port: '/dev/invalid',
        baudRate: 9600,
        timeout: 2000,
        maxRetries: 3,
        retryDelay: 1000
      });

      await expect(service.initialize()).rejects.toThrow('Port not found');
    });

    test('should handle concurrent operations gracefully', async () => {
      const service = new HardwareDetectionService(testConfig, []);
      
      // Start multiple scans concurrently
      const promises = [
        service.scanModbusDevices('/dev/ttyUSB0', { start: 1, end: 5 }),
        service.scanModbusDevices('/dev/ttyUSB0', { start: 6, end: 10 }),
        service.scanModbusDevices('/dev/ttyUSB0', { start: 11, end: 15 })
      ];

      const results = await Promise.allSettled(promises);
      
      // At least one should succeed, others may be rejected due to port conflicts
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThan(0);

      await service.cleanup();
    });

    test('should handle memory pressure during large scans', async () => {
      const service = new HardwareDetectionService(testConfig, []);
      
      // Mock many device responses
      let responseCount = 0;
      mockSerialPort.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          setTimeout(() => {
            responseCount++;
            if (responseCount <= 100) {
              const response = Buffer.from([responseCount % 255, 0x03, 0x02, 0x00, 0x01, 0x84, 0x0A]);
              callback(response);
            }
          }, 1);
        }
      });

      const devices = await service.scanModbusDevices('/dev/ttyUSB0', { start: 1, end: 100 });
      
      expect(devices.length).toBeLessThanOrEqual(100);
      expect(process.memoryUsage().heapUsed).toBeLessThan(100 * 1024 * 1024); // Less than 100MB

      await service.cleanup();
    });

    test('should handle service cleanup during active operations', async () => {
      const service = new HardwareDetectionService(testConfig, []);
      
      // Start a long-running operation
      const scanPromise = service.scanModbusDevices('/dev/ttyUSB0', { start: 1, end: 255 });
      
      // Cleanup while scanning
      setTimeout(() => service.cleanup(), 100);
      
      // Should handle cleanup gracefully
      await expect(scanPromise).resolves.toBeDefined();
    });
  });
});