import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AlertManager, AlertType } from '../alert-manager';
import { Database } from 'sqlite3';
import { ConfigurationManager } from '../configuration-manager';

describe('AlertManager - Specific Alert Monitors', () => {
  let alertManager: AlertManager;
  let mockDb: any;
  let mockConfigManager: any;
  let mockLogger: any;

  beforeEach(() => {
    // Mock database
    mockDb = {
      all: vi.fn(),
      get: vi.fn(),
      run: vi.fn()
    };

    // Mock configuration manager
    mockConfigManager = {
      getEffectiveConfig: vi.fn()
    };

    // Mock logger
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    };

    alertManager = new AlertManager(mockDb as any, mockConfigManager, mockLogger);
  });

  afterEach(() => {
    if (alertManager) {
      alertManager.shutdown();
    }
  });

  describe('No Stock Alert Monitor', () => {
    it('should trigger alert when >3 events in 10 minutes', async () => {
      const kioskId = 'kiosk-1';
      const eventCount = 4; // >3 events

      // Mock getEventCount to return 4 events
      vi.spyOn(alertManager as any, 'getEventCount').mockResolvedValue(eventCount);
      vi.spyOn(alertManager, 'triggerAlert').mockResolvedValue();

      await alertManager.monitorNoStock(kioskId);

      expect(alertManager.triggerAlert).toHaveBeenCalledWith('no_stock', {
        kioskId,
        threshold: 3,
        actualValue: eventCount,
        windowMinutes: 10,
        eventCount
      });
    });

    it('should not trigger alert when ≤3 events in 10 minutes', async () => {
      const kioskId = 'kiosk-1';
      const eventCount = 3; // =3 events (not >3)

      vi.spyOn(alertManager as any, 'getEventCount').mockResolvedValue(eventCount);
      vi.spyOn(alertManager, 'triggerAlert').mockResolvedValue();

      await alertManager.monitorNoStock(kioskId);

      expect(alertManager.triggerAlert).not.toHaveBeenCalled();
    });

    it('should auto-clear when <2 events in 10 minutes after 20 minutes', async () => {
      const alert = {
        id: 'alert-1',
        type: 'no_stock' as AlertType,
        kioskId: 'kiosk-1',
        triggeredAt: new Date(Date.now() - 21 * 60 * 1000) // 21 minutes ago
      };

      vi.spyOn(alertManager as any, 'getEventCount').mockResolvedValue(1); // <2 events
      vi.spyOn(alertManager, 'clearAlert').mockResolvedValue();

      // Simulate auto-clear check
      const setupAutoClearTimer = (alertManager as any).setupAutoClearTimer.bind(alertManager);
      await setupAutoClearTimer(alert);

      // Wait for timer to execute
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Alert cleared: type=no_stock, condition=1 events < 2 events in 10 minutes')
      );
    });
  });

  describe('Conflict Rate Alert Monitor', () => {
    it('should trigger alert when >2% conflict rate in 5 minutes', async () => {
      const kioskId = 'kiosk-1';
      const rate = 0.025; // 2.5% > 2%

      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(rate);
      vi.spyOn(alertManager, 'triggerAlert').mockResolvedValue();

      await alertManager.monitorConflictRate(kioskId);

      expect(alertManager.triggerAlert).toHaveBeenCalledWith('conflict_rate', {
        kioskId,
        threshold: 0.02,
        actualValue: rate,
        windowMinutes: 5
      });
    });

    it('should not trigger alert when ≤2% conflict rate in 5 minutes', async () => {
      const kioskId = 'kiosk-1';
      const rate = 0.02; // =2% (not >2%)

      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(rate);
      vi.spyOn(alertManager, 'triggerAlert').mockResolvedValue();

      await alertManager.monitorConflictRate(kioskId);

      expect(alertManager.triggerAlert).not.toHaveBeenCalled();
    });

    it('should auto-clear when <1% in 10 minutes', async () => {
      const alert = {
        id: 'alert-2',
        type: 'conflict_rate' as AlertType,
        kioskId: 'kiosk-1',
        triggeredAt: new Date()
      };

      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(0.008); // 0.8% < 1%
      vi.spyOn(alertManager, 'clearAlert').mockResolvedValue();

      const setupAutoClearTimer = (alertManager as any).setupAutoClearTimer.bind(alertManager);
      await setupAutoClearTimer(alert);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Alert cleared: type=conflict_rate, condition=0.8% < 1.0% in 10 minutes')
      );
    });
  });

  describe('Open Fail Rate Alert Monitor', () => {
    it('should trigger alert when >1% open fail rate in 10 minutes', async () => {
      const kioskId = 'kiosk-1';
      const rate = 0.015; // 1.5% > 1%

      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(rate);
      vi.spyOn(alertManager, 'triggerAlert').mockResolvedValue();

      await alertManager.monitorOpenFailRate(kioskId);

      expect(alertManager.triggerAlert).toHaveBeenCalledWith('open_fail_rate', {
        kioskId,
        threshold: 0.01,
        actualValue: rate,
        windowMinutes: 10
      });
    });

    it('should not trigger alert when ≤1% open fail rate in 10 minutes', async () => {
      const kioskId = 'kiosk-1';
      const rate = 0.01; // =1% (not >1%)

      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(rate);
      vi.spyOn(alertManager, 'triggerAlert').mockResolvedValue();

      await alertManager.monitorOpenFailRate(kioskId);

      expect(alertManager.triggerAlert).not.toHaveBeenCalled();
    });

    it('should auto-clear when <0.5% in 20 minutes', async () => {
      const alert = {
        id: 'alert-3',
        type: 'open_fail_rate' as AlertType,
        kioskId: 'kiosk-1',
        triggeredAt: new Date()
      };

      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(0.004); // 0.4% < 0.5%
      vi.spyOn(alertManager, 'clearAlert').mockResolvedValue();

      const setupAutoClearTimer = (alertManager as any).setupAutoClearTimer.bind(alertManager);
      await setupAutoClearTimer(alert);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Alert cleared: type=open_fail_rate, condition=0.4% < 0.5% in 20 minutes')
      );
    });
  });

  describe('Retry Rate Alert Monitor', () => {
    it('should trigger alert when >5% retry rate in 5 minutes', async () => {
      const kioskId = 'kiosk-1';
      const rate = 0.06; // 6% > 5%

      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(rate);
      vi.spyOn(alertManager, 'triggerAlert').mockResolvedValue();

      await alertManager.monitorRetryRate(kioskId);

      expect(alertManager.triggerAlert).toHaveBeenCalledWith('retry_rate', {
        kioskId,
        threshold: 0.05,
        actualValue: rate,
        windowMinutes: 5
      });
    });

    it('should not trigger alert when ≤5% retry rate in 5 minutes', async () => {
      const kioskId = 'kiosk-1';
      const rate = 0.05; // =5% (not >5%)

      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(rate);
      vi.spyOn(alertManager, 'triggerAlert').mockResolvedValue();

      await alertManager.monitorRetryRate(kioskId);

      expect(alertManager.triggerAlert).not.toHaveBeenCalled();
    });

    it('should auto-clear when <3% in 10 minutes', async () => {
      const alert = {
        id: 'alert-4',
        type: 'retry_rate' as AlertType,
        kioskId: 'kiosk-1',
        triggeredAt: new Date()
      };

      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(0.025); // 2.5% < 3%
      vi.spyOn(alertManager, 'clearAlert').mockResolvedValue();

      const setupAutoClearTimer = (alertManager as any).setupAutoClearTimer.bind(alertManager);
      await setupAutoClearTimer(alert);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Alert cleared: type=retry_rate, condition=2.5% < 3.0% in 10 minutes')
      );
    });
  });

  describe('Overdue Share Alert Monitor', () => {
    it('should trigger alert when ≥20% overdue share in 10 minutes', async () => {
      const kioskId = 'kiosk-1';
      const share = 0.20; // =20% (≥20%)

      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(share);
      vi.spyOn(alertManager, 'triggerAlert').mockResolvedValue();

      await alertManager.monitorOverdueShare(kioskId);

      expect(alertManager.triggerAlert).toHaveBeenCalledWith('overdue_share', {
        kioskId,
        threshold: 0.20,
        actualValue: share,
        windowMinutes: 10
      });
    });

    it('should trigger alert when >20% overdue share in 10 minutes', async () => {
      const kioskId = 'kiosk-1';
      const share = 0.25; // 25% > 20%

      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(share);
      vi.spyOn(alertManager, 'triggerAlert').mockResolvedValue();

      await alertManager.monitorOverdueShare(kioskId);

      expect(alertManager.triggerAlert).toHaveBeenCalledWith('overdue_share', {
        kioskId,
        threshold: 0.20,
        actualValue: share,
        windowMinutes: 10
      });
    });

    it('should not trigger alert when <20% overdue share in 10 minutes', async () => {
      const kioskId = 'kiosk-1';
      const share = 0.19; // 19% < 20%

      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(share);
      vi.spyOn(alertManager, 'triggerAlert').mockResolvedValue();

      await alertManager.monitorOverdueShare(kioskId);

      expect(alertManager.triggerAlert).not.toHaveBeenCalled();
    });

    it('should auto-clear when <10% in 20 minutes', async () => {
      const alert = {
        id: 'alert-5',
        type: 'overdue_share' as AlertType,
        kioskId: 'kiosk-1',
        triggeredAt: new Date()
      };

      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(0.08); // 8% < 10%
      vi.spyOn(alertManager, 'clearAlert').mockResolvedValue();

      const setupAutoClearTimer = (alertManager as any).setupAutoClearTimer.bind(alertManager);
      await setupAutoClearTimer(alert);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Alert cleared: type=overdue_share, condition=8.0% < 10.0% in 20 minutes')
      );
    });
  });

  describe('Alert Logging', () => {
    it('should log alert trigger with correct format', async () => {
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

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Alert triggered: type=no_stock, severity=')
      );
    });

    it('should log alert clear with correct format', async () => {
      const alert = {
        id: 'alert-test',
        type: 'conflict_rate' as AlertType,
        kioskId: 'kiosk-1',
        triggeredAt: new Date()
      };

      vi.spyOn(alertManager as any, 'getMetricRate').mockResolvedValue(0.005); // 0.5% < 1%
      vi.spyOn(alertManager, 'clearAlert').mockResolvedValue();

      const setupAutoClearTimer = (alertManager as any).setupAutoClearTimer.bind(alertManager);
      await setupAutoClearTimer(alert);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Alert cleared: type=conflict_rate, condition=0.5% < 1.0% in 10 minutes'
      );
    });
  });

  describe('Auto-Clear Conditions', () => {
    it('should generate correct auto-clear conditions', async () => {
      const generateAutoClearCondition = (alertManager as any).generateAutoClearCondition.bind(alertManager);

      expect(await generateAutoClearCondition('no_stock', 'kiosk-1')).toBe('<2 events in 10 minutes after 20 minutes');
      expect(await generateAutoClearCondition('conflict_rate', 'kiosk-1')).toBe('<1.0% in 10 minutes');
      expect(await generateAutoClearCondition('open_fail_rate', 'kiosk-1')).toBe('<0.5% in 20 minutes');
      expect(await generateAutoClearCondition('retry_rate', 'kiosk-1')).toBe('<3.0% in 10 minutes');
      expect(await generateAutoClearCondition('overdue_share', 'kiosk-1')).toBe('<10.0% in 20 minutes');
    });

    it('should format clear conditions correctly', () => {
      const formatClearCondition = (alertManager as any).formatClearCondition.bind(alertManager);

      expect(formatClearCondition('no_stock', 1, 2, 10)).toBe('1 events < 2 events in 10 minutes');
      expect(formatClearCondition('conflict_rate', 0.008, 0.01, 10)).toBe('0.8% < 1.0% in 10 minutes');
      expect(formatClearCondition('open_fail_rate', 0.004, 0.005, 20)).toBe('0.4% < 0.5% in 20 minutes');
      expect(formatClearCondition('retry_rate', 0.025, 0.03, 10)).toBe('2.5% < 3.0% in 10 minutes');
      expect(formatClearCondition('overdue_share', 0.08, 0.10, 20)).toBe('8.0% < 10.0% in 20 minutes');
    });
  });
});
