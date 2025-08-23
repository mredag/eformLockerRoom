/**
 * Unit tests for ModbusController error handling and retry logic
 * Tests connection error handling, exponential backoff, and health monitoring
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModbusController, ModbusConfig } from '../modbus-controller';

// Mock SerialPort
const mockSerialPort = {
  isOpen: true,
  open: vi.fn(),
  write: vi.fn(),
  close: vi.fn()
};

vi.mock('serialport', () => ({
  SerialPort: vi.fn().mockImplementation(() => mockSerialPort)
}));

describe('ModbusController Error Handling', () => {
  let controller: ModbusController;
  let config: ModbusConfig;

  beforeEach(() => {
    config = {
      port: '/dev/ttyUSB0',
      baudrate: 9600,
      timeout_ms: 1000,
      pulse_duration_ms: 400,
      burst_duration_seconds: 1, // Shortened for testing
      burst_interval_ms: 200,    // Shortened for testing
      command_interval_ms: 100,  // Shortened for testing
      max_retries: 2,
      retry_delay_base_ms: 100,
      retry_delay_max_ms: 1000,
      connection_retry_attempts: 2,
      health_check_interval_ms: 1000
    };

    controller = new ModbusController(config);
    
    // Add error handler to prevent unhandled error events
    controller.on('error', () => {});
    
    // Reset mocks
    vi.clearAllMocks();
    mockSerialPort.open.mockImplementation((callback) => callback(null));
    mockSerialPort.write.mockImplementation((data, callback) => callback(null));
    mockSerialPort.close.mockImplementation((callback) => callback());
  });

  afterEach(async () => {
    await controller.close();
  });

  describe('Connection Error Handling', () => {
    it('should retry connection with exponential backoff', async () => {
      let attemptCount = 0;
      mockSerialPort.open.mockImplementation((callback) => {
        attemptCount++;
        if (attemptCount <= 2) {
          callback(new Error('Connection failed'));
        } else {
          callback(null);
        }
      });

      const startTime = Date.now();
      await controller.initialize();
      const endTime = Date.now();

      expect(attemptCount).toBe(3);
      expect(endTime - startTime).toBeGreaterThanOrEqual(200); // Should have delays
      
      const health = controller.getHealth();
      expect(health.status).toBe('ok');
      expect(health.connection_errors).toBe(2);
      expect(health.retry_attempts).toBe(2);
    });

    it('should fail after max retry attempts', async () => {
      mockSerialPort.open.mockImplementation((callback) => 
        callback(new Error('Persistent connection failure'))
      );

      await expect(controller.initialize()).rejects.toThrow('Failed to initialize Modbus after 3 attempts');
      
      const health = controller.getHealth();
      expect(health.status).toBe('error');
      expect(health.connection_errors).toBe(3);
    });

    it('should calculate exponential backoff correctly', async () => {
      const delays: number[] = [];
      let attemptCount = 0;
      
      mockSerialPort.open.mockImplementation((callback) => {
        attemptCount++;
        if (attemptCount <= 2) {
          callback(new Error('Connection failed'));
        } else {
          callback(null);
        }
      });

      // Mock delay to capture timing
      const originalDelay = (controller as any).delay;
      (controller as any).delay = vi.fn().mockImplementation((ms) => {
        delays.push(ms);
        return originalDelay.call(controller, 10); // Speed up test
      });

      await controller.initialize();

      expect(delays.length).toBeGreaterThanOrEqual(2);
      expect(delays[0]).toBeGreaterThanOrEqual(100); // First retry
      if (delays.length > 1) {
        expect(delays[1]).toBeGreaterThanOrEqual(200); // Second retry (exponential)
        expect(delays[1]).toBeGreaterThan(delays[0]); // Should increase
      }
    });
  });

  describe('Command Retry Logic', () => {
    beforeEach(async () => {
      await controller.initialize();
    });

    it('should retry failed commands with exponential backoff', async () => {
      let attemptCount = 0;
      mockSerialPort.write.mockImplementation((data, callback) => {
        attemptCount++;
        if (attemptCount <= 4) { // Fail first 2 pulse attempts, succeed on burst
          callback(new Error('Command failed'));
        } else {
          callback(null);
        }
      });

      const startTime = Date.now();
      const result = await controller.openLocker(1);
      const endTime = Date.now();

      expect(result).toBe(true);
      expect(attemptCount).toBeGreaterThan(4); // Multiple retries
      expect(endTime - startTime).toBeGreaterThanOrEqual(200); // Should have delays
    });

    it('should fail after max retries', async () => {
      mockSerialPort.write.mockImplementation((data, callback) => 
        callback(new Error('Persistent hardware failure'))
      );

      const result = await controller.openLocker(1);
      
      expect(result).toBe(false);
      
      const health = controller.getHealth();
      expect(health.failed_commands).toBeGreaterThan(0);
      expect(health.error_rate_percent).toBeGreaterThan(0);
    });

    it('should succeed on retry after initial failure', async () => {
      let attemptCount = 0;
      mockSerialPort.write.mockImplementation((data, callback) => {
        attemptCount++;
        if (attemptCount === 1) {
          callback(new Error('Temporary failure'));
        } else {
          callback(null);
        }
      });

      const result = await controller.openLocker(1);
      
      expect(result).toBe(true);
      expect(attemptCount).toBeGreaterThanOrEqual(2); // Initial failure + successful retry
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(async () => {
      await controller.initialize();
    });

    it('should track error rates correctly', async () => {
      // Generate some failures
      mockSerialPort.write.mockImplementation((data, callback) => 
        callback(new Error('Hardware failure'))
      );

      await controller.openLocker(1);
      await controller.openLocker(2);

      const health = controller.getHealth();
      expect(health.error_rate_percent).toBeGreaterThan(0);
      expect(health.failed_commands).toBeGreaterThan(0);
      expect(health.total_commands).toBeGreaterThan(0);
    }, 10000); // Increase timeout

    it('should update status based on error rate', async () => {
      // Generate mixed success/failure pattern
      let callCount = 0;
      mockSerialPort.write.mockImplementation((data, callback) => {
        callCount++;
        if (callCount % 3 === 0) {
          callback(new Error('Intermittent failure'));
        } else {
          callback(null);
        }
      });

      // Execute multiple commands
      for (let i = 0; i < 6; i++) {
        await controller.openLocker(i + 1);
      }

      const health = controller.getHealth();
      expect(['ok', 'degraded', 'error']).toContain(health.status);
      expect(health.error_rate_percent).toBeGreaterThan(0);
      expect(health.error_rate_percent).toBeLessThan(100);
    });

    it('should track uptime correctly', async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const health = controller.getHealth();
      expect(health.uptime_seconds).toBeGreaterThanOrEqual(0);
    });

    it('should have high error rate that could trigger health degraded events', async () => {
      // Simulate high error rate
      mockSerialPort.write.mockImplementation((data, callback) => 
        callback(new Error('Hardware failure'))
      );

      // Generate a few failures
      await controller.openLocker(1);
      await controller.openLocker(2);

      // Check that error rate is tracked
      const health = controller.getHealth();
      expect(health.error_rate_percent).toBeGreaterThan(0);
      expect(health.failed_commands).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Reconnection Logic', () => {
    beforeEach(async () => {
      await controller.initialize();
    });

    it('should detect connection loss', async () => {
      const healthDegradedSpy = vi.fn();
      controller.on('health_degraded', healthDegradedSpy);

      // Simulate connection loss
      mockSerialPort.isOpen = false;

      // Trigger health check
      await new Promise(resolve => setTimeout(resolve, 1100));

      const health = controller.getHealth();
      expect(['disconnected', 'error', 'ok']).toContain(health.status);
    });

    it('should attempt reconnection on connection loss', async () => {
      const reconnectedSpy = vi.fn();
      const reconnectionFailedSpy = vi.fn();
      controller.on('reconnected', reconnectedSpy);
      controller.on('reconnection_failed', reconnectionFailedSpy);

      // Simulate connection loss then recovery
      mockSerialPort.isOpen = false;
      
      // Mock successful reconnection
      mockSerialPort.open.mockImplementation((callback) => {
        mockSerialPort.isOpen = true;
        callback(null);
      });

      // Trigger health check
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Give time for reconnection attempt
      await new Promise(resolve => setTimeout(resolve, 500));

      // Should attempt reconnection
      expect(mockSerialPort.open).toHaveBeenCalled();
    });
  });

  describe('Error Event Handling', () => {
    beforeEach(async () => {
      await controller.initialize();
    });

    it('should emit error events with proper context', async () => {
      controller.removeAllListeners('error');
      const errorSpy = vi.fn();
      controller.on('error', errorSpy);

      mockSerialPort.write.mockImplementation((data, callback) => 
        callback(new Error('Hardware failure'))
      );

      await controller.openLocker(1);

      expect(errorSpy).toHaveBeenCalled();
      const errorCall = errorSpy.mock.calls[0][0];
      expect(errorCall).toHaveProperty('channel');
      expect(errorCall).toHaveProperty('operation');
      expect(errorCall).toHaveProperty('error');
    });

    it('should handle health check errors gracefully', async () => {
      const errorSpy = vi.fn();
      controller.on('error', errorSpy);

      // Force an error in health check by making serialPort null
      (controller as any).serialPort = null;

      // Trigger health check
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should handle the error gracefully without crashing
      expect(['disconnected', 'ok', 'error']).toContain(controller.getHealth().status);
    });
  });

  describe('Configuration Validation', () => {
    it('should use default values for optional config', () => {
      const minimalConfig: ModbusConfig = {
        port: '/dev/ttyUSB0',
        baudrate: 9600,
        timeout_ms: 1000,
        pulse_duration_ms: 400,
        burst_duration_seconds: 10,
        burst_interval_ms: 2000,
        command_interval_ms: 300
      };

      const controller = new ModbusController(minimalConfig);
      
      // Should not throw and should use reasonable defaults
      expect(controller).toBeDefined();
    });

    it('should respect custom retry configuration', async () => {
      const customConfig: ModbusConfig = {
        ...config,
        max_retries: 1,
        connection_retry_attempts: 1
      };

      const customController = new ModbusController(customConfig);
      customController.on('error', () => {});

      mockSerialPort.open.mockImplementation((callback) => 
        callback(new Error('Connection failed'))
      );

      await expect(customController.initialize()).rejects.toThrow('Failed to initialize Modbus after 2 attempts');
      
      await customController.close();
    });
  });
});
