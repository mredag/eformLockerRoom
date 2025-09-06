import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QuarantineCleanupService } from '../quarantine-cleanup-service';
import { QuarantineManager } from '../quarantine-manager';

// Mock QuarantineManager
vi.mock('../quarantine-manager');

describe('QuarantineCleanupService', () => {
  let cleanupService: QuarantineCleanupService;
  let mockQuarantineManager: vi.Mocked<QuarantineManager>;
  let mockLogger: any;

  beforeEach(() => {
    mockQuarantineManager = {
      cleanupExpiredQuarantines: vi.fn()
    } as any;

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    cleanupService = new QuarantineCleanupService(mockQuarantineManager, mockLogger);

    // Mock timers
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupService.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Service Lifecycle', () => {
    it('should start and stop the cleanup service', () => {
      expect(cleanupService.isServiceRunning()).toBe(false);

      cleanupService.start();
      expect(cleanupService.isServiceRunning()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Quarantine cleanup service started (60s interval)');

      cleanupService.stop();
      expect(cleanupService.isServiceRunning()).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Quarantine cleanup service stopped');
    });

    it('should not start if already running', () => {
      cleanupService.start();
      cleanupService.start(); // Try to start again

      expect(mockLogger.warn).toHaveBeenCalledWith('Quarantine cleanup service is already running');
    });

    it('should handle stop when not running', () => {
      cleanupService.stop(); // Stop when not running
      expect(cleanupService.isServiceRunning()).toBe(false);
    });
  });

  describe('Cleanup Execution', () => {
    it('should run initial cleanup on start', async () => {
      mockQuarantineManager.cleanupExpiredQuarantines.mockResolvedValue(5);

      cleanupService.start();

      // Wait for initial cleanup
      await vi.runOnlyPendingTimersAsync();

      expect(mockQuarantineManager.cleanupExpiredQuarantines).toHaveBeenCalledWith(undefined, 100);
      expect(mockLogger.info).toHaveBeenCalledWith('Quarantine cleanup: removed=5');
    });

    it('should run cleanup every 60 seconds', async () => {
      mockQuarantineManager.cleanupExpiredQuarantines.mockResolvedValue(0); // No cleanup needed

      cleanupService.start();
      
      const initialCallCount = mockQuarantineManager.cleanupExpiredQuarantines.mock.calls.length;

      // Advance time by 60 seconds
      vi.advanceTimersByTime(60 * 1000);
      await vi.runOnlyPendingTimersAsync();

      // Should have made additional calls for scheduled cleanup
      expect(mockQuarantineManager.cleanupExpiredQuarantines.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    it('should not log when no quarantines are cleaned', async () => {
      mockQuarantineManager.cleanupExpiredQuarantines.mockResolvedValue(0);

      cleanupService.start();
      await vi.runOnlyPendingTimersAsync();

      // Should not log when nothing was cleaned
      expect(mockLogger.info).toHaveBeenCalledWith('Quarantine cleanup service started (60s interval)');
      expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('removed='));
    });

    it('should handle cleanup errors gracefully', async () => {
      const error = new Error('Database error');
      mockQuarantineManager.cleanupExpiredQuarantines.mockRejectedValue(error);

      cleanupService.start();
      await vi.runOnlyPendingTimersAsync();

      expect(mockLogger.error).toHaveBeenCalledWith('Quarantine cleanup error:', error);
    });

    it('should process large cleanups in batches', async () => {
      // Mock batch processing: first call returns 100 (full batch), second returns 50 (partial), third returns 0
      mockQuarantineManager.cleanupExpiredQuarantines
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(0);

      cleanupService.start();
      await vi.runOnlyPendingTimersAsync();

      expect(mockQuarantineManager.cleanupExpiredQuarantines).toHaveBeenCalledTimes(3);
      expect(mockLogger.info).toHaveBeenCalledWith('Quarantine cleanup: removed=150');
    });
  });

  describe('Manual Cleanup', () => {
    it('should run manual cleanup when service is running', async () => {
      mockQuarantineManager.cleanupExpiredQuarantines.mockResolvedValue(25);

      cleanupService.start();
      const result = await cleanupService.runManualCleanup();

      expect(result).toBe(25);
      expect(mockQuarantineManager.cleanupExpiredQuarantines).toHaveBeenCalledWith(undefined, 1000);
      expect(mockLogger.info).toHaveBeenCalledWith('Manual quarantine cleanup: removed=25');
    });

    it('should throw error when manual cleanup is called on stopped service', async () => {
      await expect(cleanupService.runManualCleanup()).rejects.toThrow(
        'Quarantine cleanup service is not running'
      );
    });

    it('should handle large manual cleanups in batches', async () => {
      // Start service first with no cleanup needed
      mockQuarantineManager.cleanupExpiredQuarantines.mockResolvedValue(0);
      cleanupService.start();
      await vi.runOnlyPendingTimersAsync(); // Let initial cleanup complete
      
      // Reset mock for manual cleanup test
      mockQuarantineManager.cleanupExpiredQuarantines.mockReset();
      
      // Mock manual cleanup batches
      mockQuarantineManager.cleanupExpiredQuarantines
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(500)
        .mockResolvedValue(0); // Subsequent calls return 0

      const result = await cleanupService.runManualCleanup();

      expect(result).toBe(2500);
      expect(mockLogger.info).toHaveBeenCalledWith('Manual quarantine cleanup: removed=2500');
    });
  });

  describe('Status Reporting', () => {
    it('should return correct status when stopped', () => {
      const status = cleanupService.getStatus();

      expect(status).toEqual({
        isRunning: false,
        intervalSeconds: 60,
        nextCleanupIn: undefined
      });
    });

    it('should return correct status when running', () => {
      cleanupService.start();
      const status = cleanupService.getStatus();

      expect(status).toEqual({
        isRunning: true,
        intervalSeconds: 60,
        nextCleanupIn: 60
      });
    });
  });

  describe('Error Handling', () => {
    it('should continue running after cleanup errors', async () => {
      mockQuarantineManager.cleanupExpiredQuarantines
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValueOnce(5);

      cleanupService.start();
      await vi.runOnlyPendingTimersAsync();

      // Advance to next cleanup
      vi.advanceTimersByTime(60 * 1000);
      await vi.runOnlyPendingTimersAsync();

      expect(mockLogger.error).toHaveBeenCalledWith('Quarantine cleanup error:', expect.any(Error));
      expect(cleanupService.isServiceRunning()).toBe(true);
    });

    it('should handle batch processing delays', async () => {
      // Mock multiple full batches to test delay logic
      mockQuarantineManager.cleanupExpiredQuarantines
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(0);

      cleanupService.start();
      await vi.runOnlyPendingTimersAsync();

      // Should have logged the total cleanup
      expect(mockLogger.info).toHaveBeenCalledWith('Quarantine cleanup: removed=200');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle service restart', async () => {
      mockQuarantineManager.cleanupExpiredQuarantines.mockResolvedValue(3);

      // Start, stop, start again
      cleanupService.start();
      cleanupService.stop();
      cleanupService.start();

      await vi.runOnlyPendingTimersAsync();

      expect(cleanupService.isServiceRunning()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Quarantine cleanup service started (60s interval)');
    });

    it('should handle concurrent manual and scheduled cleanups', async () => {
      mockQuarantineManager.cleanupExpiredQuarantines.mockResolvedValue(0); // No cleanup needed

      cleanupService.start();
      
      // Run manual cleanup
      const result = await cleanupService.runManualCleanup();

      // Manual cleanup should complete successfully
      expect(result).toBe(0);
      expect(cleanupService.isServiceRunning()).toBe(true);
    });
  });
});