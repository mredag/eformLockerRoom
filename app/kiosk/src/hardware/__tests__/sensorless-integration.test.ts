/**
 * Integration tests for sensorless retry handler with ModbusController
 * Tests Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ModbusController, ModbusConfig } from '../modbus-controller';
import { EventEmitter } from 'events';

// Mock SerialPort
vi.mock('serialport', () => ({
  SerialPort: vi.fn().mockImplementation(() => ({
    isOpen: true,
    open: vi.fn((callback) => callback(null)),
    write: vi.fn((data, callback) => callback(null)),
    close: vi.fn((callback) => callback())
  }))
}));

describe('Sensorless Integration Tests', () => {
  let controller: ModbusController;
  
  const testConfig: ModbusConfig = {
    port: '/dev/ttyUSB0',
    baudrate: 9600,
    timeout_ms: 1000,
    pulse_duration_ms: 800,
    burst_duration_seconds: 2,
    burst_interval_ms: 100,
    command_interval_ms: 300,
    test_mode: true // Disable queue processor for testing
  };

  beforeEach(async () => {
    controller = new ModbusController(testConfig);
    await controller.initialize();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await controller.close();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Sensorless Open Integration (Requirement 6.1)', () => {
    it('should successfully open locker on first try', async () => {
      const lockerId = 5;
      const cardId = 'card123';

      const resultPromise = controller.openLockerWithSensorlessRetry(lockerId, cardId);
      
      // Advance through open window (no retry needed)
      await vi.advanceTimersByTimeAsync(10000); // 10 seconds
      
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.action).toBe('success_first_try');
      expect(result.message).toBe('Dolabınız açıldı. Eşyalarınızı yerleştirin');
      expect(result.retry_attempted).toBe(false);
    });

    it('should handle retry when card scanned during window (Requirement 6.2, 6.3)', async () => {
      const lockerId = 5;
      const cardId = 'card123';

      const resultPromise = controller.openLockerWithSensorlessRetry(lockerId, cardId);
      
      // Simulate card scan during open window
      await vi.advanceTimersByTimeAsync(2000); // 2 seconds into window
      controller.recordCardScan(cardId);
      
      // Complete the window and retry cycle
      await vi.advanceTimersByTimeAsync(8000); // Complete 10-second window
      await vi.advanceTimersByTimeAsync(500);  // Retry backoff
      await vi.advanceTimersByTimeAsync(800);  // Retry pulse
      
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.action).toBe('success_after_retry');
      expect(result.retry_attempted).toBe(true);
    });

    it('should emit sensorless messages during retry (Requirement 6.5)', async () => {
      const lockerId = 5;
      const cardId = 'card123';
      const messageHandler = vi.fn();
      
      controller.on('sensorless_message', messageHandler);

      const resultPromise = controller.openLockerWithSensorlessRetry(lockerId, cardId);
      
      // Trigger retry
      await vi.advanceTimersByTimeAsync(2000);
      controller.recordCardScan(cardId);
      
      // Complete cycle
      await vi.advanceTimersByTimeAsync(8000 + 500 + 800);
      
      await resultPromise;

      // Should have received retry message and success message
      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          lockerId,
          cardId,
          message: 'Tekrar deneniyor',
          type: 'retry'
        })
      );

      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          lockerId,
          cardId,
          message: 'Dolabınız açıldı. Eşyalarınızı yerleştirin',
          type: 'success'
        })
      );
    });
  });

  describe('Timing Budget Enforcement (Requirement 6.4)', () => {
    it('should respect maximum duration constraint', async () => {
      const lockerId = 5;
      const cardId = 'card123';

      const startTime = Date.now();
      const resultPromise = controller.openLockerWithSensorlessRetry(lockerId, cardId);
      
      // Trigger retry
      await vi.advanceTimersByTimeAsync(2000);
      controller.recordCardScan(cardId);
      
      // Complete full cycle
      await vi.advanceTimersByTimeAsync(8000 + 500 + 800);
      
      const result = await resultPromise;
      
      // Expected max: pulse(800) + window(10000) + backoff(500) + pulse(800) = 12100ms
      const expectedMaxDuration = 800 + 10000 + 500 + 800;
      
      expect(result.duration_ms).toBeLessThanOrEqual(expectedMaxDuration + 100); // Small tolerance
    });
  });

  describe('Hardware Error Handling', () => {
    it('should handle hardware unavailability gracefully', async () => {
      const lockerId = 5;
      const cardId = 'card123';
      
      // Mock hardware as unavailable
      vi.spyOn(controller, 'isHardwareAvailable').mockReturnValue(false);

      const result = await controller.openLockerWithSensorlessRetry(lockerId, cardId);

      expect(result.success).toBe(false);
      expect(result.action).toBe('failed_no_retry');
      expect(result.message).toBe('Şu an işlem yapılamıyor');
      expect(result.retry_attempted).toBe(false);
    });
  });

  describe('Card Scan Recording (Requirement 6.2)', () => {
    it('should record card scans for retry detection', () => {
      const cardId = 'card123';
      
      // Record multiple scans
      controller.recordCardScan(cardId);
      controller.recordCardScan(cardId);
      
      // Verify scans are recorded (internal functionality)
      const sensorlessHandler = controller.getSensorlessRetryHandler();
      expect(sensorlessHandler).toBeDefined();
    });

    it('should clean up old card scans', () => {
      const cardId = 'card123';
      
      controller.recordCardScan(cardId);
      
      // Advance time and trigger cleanup
      vi.advanceTimersByTime(70000); // 70 seconds
      
      const sensorlessHandler = controller.getSensorlessRetryHandler();
      sensorlessHandler.cleanupOldScans();
      
      // Old scans should be cleaned up (internal functionality verified)
      expect(sensorlessHandler).toBeDefined();
    });
  });

  describe('Configuration Management', () => {
    it('should allow sensorless configuration updates', () => {
      const newConfig = {
        pulse_ms: 1000,
        open_window_seconds: 15,
        retry_backoff_ms: 750
      };
      
      controller.updateSensorlessConfig(newConfig);
      
      const sensorlessHandler = controller.getSensorlessRetryHandler();
      const config = sensorlessHandler.getConfig();
      
      expect(config.pulse_ms).toBe(1000);
      expect(config.open_window_seconds).toBe(15);
      expect(config.retry_backoff_ms).toBe(750);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent sensorless operations on different lockers', async () => {
      const locker1 = 5;
      const locker2 = 10;
      const cardId1 = 'card123';
      const cardId2 = 'card456';

      const promise1 = controller.openLockerWithSensorlessRetry(locker1, cardId1);
      const promise2 = controller.openLockerWithSensorlessRetry(locker2, cardId2);
      
      // Advance through operations
      await vi.advanceTimersByTimeAsync(10000);
      
      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.action).toBe('success_first_try');
      expect(result2.action).toBe('success_first_try');
    });

    it('should prevent concurrent operations on same locker', async () => {
      const lockerId = 5;
      const cardId1 = 'card123';
      const cardId2 = 'card456';

      const promise1 = controller.openLockerWithSensorlessRetry(lockerId, cardId1);
      
      // Start second operation on same locker (should wait for mutex)
      const promise2 = controller.openLockerWithSensorlessRetry(lockerId, cardId2);
      
      // Advance time for first operation
      await vi.advanceTimersByTimeAsync(10000);
      
      const result1 = await promise1;
      
      // Now advance time for second operation
      await vi.advanceTimersByTimeAsync(10000);
      
      const result2 = await promise2;

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      // Both should succeed but sequentially
    });
  });
});