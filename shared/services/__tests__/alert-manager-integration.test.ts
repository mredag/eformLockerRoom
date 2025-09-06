import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AlertManager, AlertType } from '../alert-manager';

describe('AlertManager - Integration Test', () => {
  let alertManager: AlertManager;
  let mockDb: any;
  let mockLogger: any;

  beforeEach(() => {
    // Mock database
    mockDb = {
      all: vi.fn(),
      get: vi.fn(),
      run: vi.fn()
    };

    // Mock logger
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    };

    alertManager = new AlertManager(mockDb as any, undefined, mockLogger);
  });

  afterEach(() => {
    if (alertManager) {
      alertManager.shutdown();
    }
  });

  describe('Alert Threshold Verification', () => {
    it('should have correct thresholds for no_stock alert', async () => {
      const kioskId = 'kiosk-1';
      
      // Mock getEventCount to return exactly 3 events (should not trigger)
      vi.spyOn(alertManager as any, 'getEventCount').mockResolvedValue(3);
      vi.spyOn(alertManager, 'triggerAlert').mockResolvedValue();

      await alertManager.monitorNoStock(kioskId);
      expect(alertManager.triggerAlert).not.toHaveBeenCalled();

      // Mock getEventCount to return 4 events (should trigger)
      vi.spyOn(alertManager as any, 'getEventCount').mockResolvedValue(4);
      await alertManager.monitorNoStock(kioskId);
      
      expect(alertManager.triggerAlert).toHaveBeenCalledWith('no_stock', {
        kioskId,
        threshold: 3,
        actualValue: 4,
        windowMinutes: 10,
        eventCount: 4
      });
    });

    it('should have correct thresholds for conflict_rate alert', async () => {
      const kioskId = 'kiosk-1';
      
      // Mock getMetricRate to return exactly 2% (should not trigger)
      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(0.02);
      vi.spyOn(alertManager, 'triggerAlert').mockResolvedValue();

      await alertManager.monitorConflictRate(kioskId);
      expect(alertManager.triggerAlert).not.toHaveBeenCalled();

      // Mock getMetricRate to return 2.1% (should trigger)
      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(0.021);
      await alertManager.monitorConflictRate(kioskId);
      
      expect(alertManager.triggerAlert).toHaveBeenCalledWith('conflict_rate', {
        kioskId,
        threshold: 0.02,
        actualValue: 0.021,
        windowMinutes: 5
      });
    });

    it('should have correct thresholds for open_fail_rate alert', async () => {
      const kioskId = 'kiosk-1';
      
      // Mock getMetricRate to return exactly 1% (should not trigger)
      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(0.01);
      vi.spyOn(alertManager, 'triggerAlert').mockResolvedValue();

      await alertManager.monitorOpenFailRate(kioskId);
      expect(alertManager.triggerAlert).not.toHaveBeenCalled();

      // Mock getMetricRate to return 1.1% (should trigger)
      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(0.011);
      await alertManager.monitorOpenFailRate(kioskId);
      
      expect(alertManager.triggerAlert).toHaveBeenCalledWith('open_fail_rate', {
        kioskId,
        threshold: 0.01,
        actualValue: 0.011,
        windowMinutes: 10
      });
    });

    it('should have correct thresholds for retry_rate alert', async () => {
      const kioskId = 'kiosk-1';
      
      // Mock getMetricRate to return exactly 5% (should not trigger)
      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(0.05);
      vi.spyOn(alertManager, 'triggerAlert').mockResolvedValue();

      await alertManager.monitorRetryRate(kioskId);
      expect(alertManager.triggerAlert).not.toHaveBeenCalled();

      // Mock getMetricRate to return 5.1% (should trigger)
      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(0.051);
      await alertManager.monitorRetryRate(kioskId);
      
      expect(alertManager.triggerAlert).toHaveBeenCalledWith('retry_rate', {
        kioskId,
        threshold: 0.05,
        actualValue: 0.051,
        windowMinutes: 5
      });
    });

    it('should have correct thresholds for overdue_share alert', async () => {
      const kioskId = 'kiosk-1';
      
      // Mock getMetricRate to return 19.9% (should not trigger)
      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(0.199);
      vi.spyOn(alertManager, 'triggerAlert').mockResolvedValue();

      await alertManager.monitorOverdueShare(kioskId);
      expect(alertManager.triggerAlert).not.toHaveBeenCalled();

      // Mock getMetricRate to return exactly 20% (should trigger - ≥20%)
      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(0.20);
      await alertManager.monitorOverdueShare(kioskId);
      
      expect(alertManager.triggerAlert).toHaveBeenCalledWith('overdue_share', {
        kioskId,
        threshold: 0.20,
        actualValue: 0.20,
        windowMinutes: 10
      });
    });
  });

  describe('Auto-Clear Conditions', () => {
    it('should generate correct auto-clear conditions for all alert types', async () => {
      const generateAutoClearCondition = (alertManager as any).generateAutoClearCondition.bind(alertManager);

      // Test all alert types have correct auto-clear conditions
      expect(await generateAutoClearCondition('no_stock', 'kiosk-1')).toBe('<2 events in 10 minutes after 20 minutes');
      expect(await generateAutoClearCondition('conflict_rate', 'kiosk-1')).toBe('<1.0% in 10 minutes');
      expect(await generateAutoClearCondition('open_fail_rate', 'kiosk-1')).toBe('<0.5% in 20 minutes');
      expect(await generateAutoClearCondition('retry_rate', 'kiosk-1')).toBe('<3.0% in 10 minutes');
      expect(await generateAutoClearCondition('overdue_share', 'kiosk-1')).toBe('<10.0% in 20 minutes');
    });

    it('should format clear conditions correctly for logging', () => {
      const formatClearCondition = (alertManager as any).formatClearCondition.bind(alertManager);

      // Test no_stock formatting
      expect(formatClearCondition('no_stock', 1, 2, 10)).toBe('1 events < 2 events in 10 minutes');
      
      // Test percentage-based formatting
      expect(formatClearCondition('conflict_rate', 0.008, 0.01, 10)).toBe('0.8% < 1.0% in 10 minutes');
      expect(formatClearCondition('open_fail_rate', 0.004, 0.005, 20)).toBe('0.4% < 0.5% in 20 minutes');
      expect(formatClearCondition('retry_rate', 0.025, 0.03, 10)).toBe('2.5% < 3.0% in 10 minutes');
      expect(formatClearCondition('overdue_share', 0.08, 0.10, 20)).toBe('8.0% < 10.0% in 20 minutes');
    });
  });

  describe('Alert Logging', () => {
    it('should log alert triggers with correct format', async () => {
      const kioskId = 'kiosk-1';
      
      // Mock database operations for triggerAlert
      mockDb.get.mockResolvedValue({ version: 1 });
      mockDb.run.mockImplementation((query, params, callback) => {
        if (callback) callback(null);
        return { lastID: 1 };
      });

      vi.spyOn(alertManager as any, 'getEventCount').mockResolvedValue(5);
      vi.spyOn(alertManager as any, 'persistAlert').mockResolvedValue();
      vi.spyOn(alertManager as any, 'setupAutoClearTimer').mockResolvedValue();

      await alertManager.monitorNoStock(kioskId);

      // Verify alert trigger logging format
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Alert triggered: type=no_stock, severity=')
      );
    });
  });

  describe('Monitoring Integration', () => {
    it('should monitor all alert types without errors', async () => {
      const kioskId = 'kiosk-1';
      
      // Mock all metric retrieval methods
      vi.spyOn(alertManager as any, 'getEventCount').mockResolvedValue(2); // Below threshold
      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(0.01); // Below thresholds
      vi.spyOn(alertManager, 'triggerAlert').mockResolvedValue();

      // Should not throw errors and not trigger any alerts
      await Promise.all([
        alertManager.monitorNoStock(kioskId),
        alertManager.monitorConflictRate(kioskId),
        alertManager.monitorOpenFailRate(kioskId),
        alertManager.monitorRetryRate(kioskId),
        alertManager.monitorOverdueShare(kioskId)
      ]);

      // No alerts should be triggered since all values are below thresholds
      expect(alertManager.triggerAlert).not.toHaveBeenCalled();
    });

    it('should start and stop monitoring correctly', () => {
      const kioskId = 'kiosk-1';
      
      // Start monitoring
      alertManager.startMonitoring(kioskId, 1); // 1 second interval for testing
      
      // Verify monitoring started
      const intervals = (alertManager as any).monitoringIntervals;
      expect(intervals.has(kioskId)).toBe(true);
      
      // Stop monitoring
      alertManager.stopMonitoring(kioskId);
      
      // Verify monitoring stopped
      expect(intervals.has(kioskId)).toBe(false);
    });
  });
});