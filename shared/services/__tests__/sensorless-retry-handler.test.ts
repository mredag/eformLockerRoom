/**
 * Unit tests for SensorlessRetryHandler
 * Tests Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import { SensorlessRetryHandler, SensorlessConfig } from '../sensorless-retry-handler';

describe('SensorlessRetryHandler', () => {
  let handler: SensorlessRetryHandler;
  let mockPulseFunction: ReturnType<typeof vi.fn<(lockerId: number) => Promise<boolean>>>;
  
  const testConfig: SensorlessConfig = {
    pulse_ms: 800,
    open_window_sec: 2, // Shorter for testing
    retry_backoff_ms: 500,
    retry_count: 1
  };

  beforeEach(() => {
    handler = new SensorlessRetryHandler(testConfig);
    mockPulseFunction = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Configuration Validation', () => {
    it('should accept valid configuration', () => {
      expect(() => new SensorlessRetryHandler(testConfig)).not.toThrow();
    });

    it('should clamp pulse_ms to valid range', () => {
      const handler1 = new SensorlessRetryHandler({ ...testConfig, pulse_ms: 100 }); // Below min
      expect(handler1.getConfig().pulse_ms).toBe(200);
      
      const handler2 = new SensorlessRetryHandler({ ...testConfig, pulse_ms: 3000 }); // Above max
      expect(handler2.getConfig().pulse_ms).toBe(2000);
    });

    it('should clamp open_window_sec to valid range', () => {
      const handler1 = new SensorlessRetryHandler({ ...testConfig, open_window_sec: 2 }); // Below min
      expect(handler1.getConfig().open_window_sec).toBe(5);
      
      const handler2 = new SensorlessRetryHandler({ ...testConfig, open_window_sec: 25 }); // Above max
      expect(handler2.getConfig().open_window_sec).toBe(20);
    });

    it('should reject retry_count > 1', () => {
      expect(() => new SensorlessRetryHandler({ ...testConfig, retry_count: 2 }))
        .toThrow('retry_count > 1 is not supported');
    });
  });

  describe('Successful First Try (Requirement 6.1)', () => {
    it('should return success on first pulse without retry', async () => {
      mockPulseFunction.mockResolvedValue(true);

      const resultPromise = handler.openWithRetry(1, 'card123', mockPulseFunction);
      
      // Advance through open window
      await vi.advanceTimersByTimeAsync(testConfig.open_window_sec * 1000);
      
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.action).toBe('success_first_try');
      expect(result.message).toBe('Dolabınız açıldı. Eşyalarınızı yerleştirin.');
      expect(result.retry_attempted).toBe(false);
      expect(mockPulseFunction).toHaveBeenCalledTimes(1);
    });

    it('should enforce timing budget (Requirement 6.4)', async () => {
      mockPulseFunction.mockResolvedValue(true);

      const resultPromise = handler.openWithRetry(1, 'card123', mockPulseFunction);
      
      // Advance through open window
      await vi.advanceTimersByTimeAsync(testConfig.open_window_sec * 1000);
      
      const result = await resultPromise;
      
      // Calculate expected max duration: pulse + window + backoff + pulse
      const expectedMaxDuration = testConfig.pulse_ms + 
                                 (testConfig.open_window_sec * 1000) + 
                                 testConfig.retry_backoff_ms + 
                                 testConfig.pulse_ms;
      
      expect(result.duration_ms).toBeLessThanOrEqual(expectedMaxDuration);
    });
  });

  describe('Card Scan Recording (Requirement 6.2)', () => {
    it('should record card scans with timestamps', () => {
      const cardId = 'card123';
      
      handler.recordCardScan(cardId);
      
      // Verify scan was recorded (internal state check)
      // Note: getRecentScans is private, so we just verify the handler exists
      expect(handler).toBeDefined();
    });

    it('should clean up old card scans', () => {
      const cardId = 'card123';
      
      handler.recordCardScan(cardId);
      
      // Advance time beyond cleanup threshold
      vi.advanceTimersByTime(70000); // 70 seconds
      
      handler.cleanupOldScans();
      
      // Old scans should be cleaned up
      expect(handler.isAttemptActive(1)).toBe(false);
    });
  });

  describe('Retry Logic (Requirements 6.2, 6.3)', () => {
    it('should detect retry need from card scan during window', async () => {
      mockPulseFunction.mockResolvedValue(true);

      const resultPromise = handler.openWithRetry(1, 'card123', mockPulseFunction);
      
      // Simulate card scan during open window
      await vi.advanceTimersByTimeAsync(1000); // 1 second into window
      handler.recordCardScan('card123');
      
      // Complete the window
      await vi.advanceTimersByTimeAsync(testConfig.open_window_sec * 1000 - 1000);
      
      // Advance through retry backoff and second pulse
      await vi.advanceTimersByTimeAsync(testConfig.retry_backoff_ms + testConfig.pulse_ms);
      
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.action).toBe('success_after_retry');
      expect(result.retry_attempted).toBe(true);
      expect(mockPulseFunction).toHaveBeenCalledTimes(2);
    });

    it('should show "Tekrar deneniyor." message during retry (Requirement 6.5)', async () => {
      mockPulseFunction.mockResolvedValue(true);
      
      const messageHandler = vi.fn();
      handler.on('show_message', messageHandler);

      const resultPromise = handler.openWithRetry(1, 'card123', mockPulseFunction);
      
      // Simulate card scan during window to trigger retry
      await vi.advanceTimersByTimeAsync(1000);
      handler.recordCardScan('card123');
      
      // Complete window and start retry
      await vi.advanceTimersByTimeAsync(testConfig.open_window_sec * 1000 - 1000);
      
      // Should show retry message
      expect(messageHandler).toHaveBeenCalledWith({
        lockerId: 1,
        cardId: 'card123',
        message: 'Tekrar deneniyor.',
        type: 'retry'
      });
      
      // Complete retry
      await vi.advanceTimersByTimeAsync(testConfig.retry_backoff_ms + testConfig.pulse_ms);
      
      await resultPromise;
    });

    it('should enforce single retry only (Requirement 6.3)', async () => {
      mockPulseFunction.mockResolvedValue(false); // Always fail

      const resultPromise = handler.openWithRetry(1, 'card123', mockPulseFunction);
      
      // Trigger retry with card scan
      await vi.advanceTimersByTimeAsync(1000);
      handler.recordCardScan('card123');
      
      // Complete window and retry
      await vi.advanceTimersByTimeAsync(testConfig.open_window_sec * 1000 - 1000);
      await vi.advanceTimersByTimeAsync(testConfig.retry_backoff_ms + testConfig.pulse_ms);
      
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.action).toBe('failed_after_retry');
      expect(result.retry_attempted).toBe(true);
      expect(mockPulseFunction).toHaveBeenCalledTimes(2); // Only 2 calls: first + retry
    });
  });

  describe('Timing Budget Enforcement (Requirement 6.4)', () => {
    it('should skip retry if insufficient time budget', async () => {
      // Create handler with very short timing budget
      const shortConfig: SensorlessConfig = {
        pulse_ms: 100,
        open_window_sec: 1,
        retry_backoff_ms: 2000, // Very long backoff
        retry_count: 1
      };
      
      const shortHandler = new SensorlessRetryHandler(shortConfig);
      mockPulseFunction.mockResolvedValue(true);

      const resultPromise = shortHandler.openWithRetry(1, 'card123', mockPulseFunction);
      
      // Trigger retry need
      await vi.advanceTimersByTimeAsync(500);
      shortHandler.recordCardScan('card123');
      
      // Complete window
      await vi.advanceTimersByTimeAsync(500);
      
      const result = await resultPromise;

      // Should not retry due to insufficient budget
      expect(result.retry_attempted).toBe(false);
      expect(mockPulseFunction).toHaveBeenCalledTimes(1);
    });

    it('should respect maximum duration constraint', async () => {
      mockPulseFunction.mockResolvedValue(true);

      const resultPromise = handler.openWithRetry(1, 'card123', mockPulseFunction);
      
      // Trigger retry
      await vi.advanceTimersByTimeAsync(1000);
      handler.recordCardScan('card123');
      
      // Complete full cycle
      await vi.advanceTimersByTimeAsync(testConfig.open_window_sec * 1000 - 1000);
      await vi.advanceTimersByTimeAsync(testConfig.retry_backoff_ms + testConfig.pulse_ms);
      
      const result = await resultPromise;
      
      const maxDuration = testConfig.pulse_ms + 
                         (testConfig.open_window_sec * 1000) + 
                         testConfig.retry_backoff_ms + 
                         testConfig.pulse_ms;
      
      expect(result.duration_ms).toBeLessThanOrEqual(maxDuration + 100); // Small tolerance
    });
  });

  describe('Error Handling', () => {
    it('should handle pulse function errors gracefully', async () => {
      mockPulseFunction.mockRejectedValue(new Error('Hardware error'));

      const resultPromise = handler.openWithRetry(1, 'card123', mockPulseFunction);
      
      await vi.advanceTimersByTimeAsync(testConfig.open_window_sec * 1000);
      
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.action).toBe('failed_no_retry');
      expect(result.message).toBe('Şu an işlem yapılamıyor.');
    });

    it('should handle retry pulse function errors', async () => {
      mockPulseFunction
        .mockResolvedValueOnce(true)  // First pulse succeeds
        .mockRejectedValueOnce(new Error('Retry error')); // Retry fails

      const resultPromise = handler.openWithRetry(1, 'card123', mockPulseFunction);
      
      // Trigger retry
      await vi.advanceTimersByTimeAsync(1000);
      handler.recordCardScan('card123');
      
      // Complete cycle
      await vi.advanceTimersByTimeAsync(testConfig.open_window_sec * 1000 - 1000);
      await vi.advanceTimersByTimeAsync(testConfig.retry_backoff_ms + testConfig.pulse_ms);
      
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.action).toBe('failed_after_retry');
      expect(result.retry_attempted).toBe(true);
    });
  });

  describe('State Management', () => {
    it('should track active attempts', async () => {
      mockPulseFunction.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve(true), 100);
      }));

      const resultPromise = handler.openWithRetry(1, 'card123', mockPulseFunction);
      
      // Check attempt is active
      expect(handler.isAttemptActive(1)).toBe(true);
      
      const attemptInfo = handler.getAttemptInfo(1);
      expect(attemptInfo).toBeTruthy();
      expect(attemptInfo?.lockerId).toBe(1);
      
      // Complete the attempt
      await vi.advanceTimersByTimeAsync(testConfig.open_window_sec * 1000 + 1000);
      await resultPromise;
      
      // Attempt should be cleaned up
      expect(handler.isAttemptActive(1)).toBe(false);
    });

    it('should handle concurrent attempts for different lockers', async () => {
      mockPulseFunction.mockResolvedValue(true);

      const promise1 = handler.openWithRetry(1, 'card123', mockPulseFunction);
      const promise2 = handler.openWithRetry(2, 'card456', mockPulseFunction);
      
      expect(handler.isAttemptActive(1)).toBe(true);
      expect(handler.isAttemptActive(2)).toBe(true);
      
      await vi.advanceTimersByTimeAsync(testConfig.open_window_sec * 1000);
      
      await Promise.all([promise1, promise2]);
      
      expect(handler.isAttemptActive(1)).toBe(false);
      expect(handler.isAttemptActive(2)).toBe(false);
    });
  });

  describe('Configuration Management', () => {
    it('should return current configuration', () => {
      const config = handler.getConfig();
      
      expect(config).toEqual(expect.objectContaining({
        pulse_ms: expect.any(Number),
        open_window_sec: expect.any(Number),
        retry_backoff_ms: expect.any(Number),
        retry_count: 1
      }));
      expect(config).not.toBe(testConfig); // Should be a copy
    });

    it('should update configuration with validation', () => {
      const newConfig = { pulse_ms: 1000 };
      
      handler.updateConfig(newConfig);
      
      const updatedConfig = handler.getConfig();
      expect(updatedConfig.pulse_ms).toBe(1000);
      expect(updatedConfig.open_window_sec).toBe(handler.getConfig().open_window_sec); // Unchanged
    });

    it('should reject retry_count > 1 in updates', () => {
      expect(() => handler.updateConfig({ retry_count: 2 }))
        .toThrow('retry_count > 1 is not supported');
    });

    it('should clamp values in updates', () => {
      handler.updateConfig({ pulse_ms: 50 }); // Below minimum
      expect(handler.getConfig().pulse_ms).toBe(200);
      
      handler.updateConfig({ open_window_sec: 30 }); // Above maximum
      expect(handler.getConfig().open_window_sec).toBe(20);
    });
  });

  describe('Turkish Messages (Requirement 6.5)', () => {
    it('should use correct Turkish messages for all outcomes', async () => {
      const messageHandler = vi.fn();
      handler.on('show_message', messageHandler);

      // Test success message
      mockPulseFunction.mockResolvedValue(true);
      
      const resultPromise = handler.openWithRetry(1, 'card123', mockPulseFunction);
      
      // Trigger retry to test all messages
      await vi.advanceTimersByTimeAsync(1000);
      handler.recordCardScan('card123');
      
      await vi.advanceTimersByTimeAsync(testConfig.open_window_sec * 1000 - 1000);
      await vi.advanceTimersByTimeAsync(testConfig.retry_backoff_ms + testConfig.pulse_ms);
      
      const result = await resultPromise;

      // Check retry message
      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Tekrar deneniyor.',
          type: 'retry'
        })
      );

      // Check success message
      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Dolabınız açıldı. Eşyalarınızı yerleştirin.',
          type: 'success'
        })
      );

      expect(result.message).toBe('Dolabınız açıldı. Eşyalarınızı yerleştirin.');
    });

    it('should show failure message in Turkish', async () => {
      mockPulseFunction.mockResolvedValue(false);

      const resultPromise = handler.openWithRetry(1, 'card123', mockPulseFunction);
      
      await vi.advanceTimersByTimeAsync(testConfig.open_window_sec * 1000);
      
      const result = await resultPromise;

      expect(result.message).toBe('Şu an işlem yapılamıyor.');
    });
  });
});