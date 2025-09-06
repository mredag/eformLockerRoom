import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Database } from 'sqlite3';
import { AlertManager, Alert, AlertType } from '../alert-manager';
import { ConfigurationManager } from '../configuration-manager';

// Mock sqlite3
vi.mock('sqlite3', () => ({
  Database: vi.fn().mockImplementation(() => ({
    all: vi.fn(),
    get: vi.fn(),
    run: vi.fn(),
    close: vi.fn()
  }))
}));

// Mock ConfigurationManager
vi.mock('../configuration-manager', () => ({
  ConfigurationManager: vi.fn().mockImplementation(() => ({
    getEffectiveConfig: vi.fn().mockResolvedValue({
      alert_no_stock_trigger_count: 3,
      alert_no_stock_trigger_window_min: 10,
      alert_conflict_rate_trigger: 0.02,
      alert_conflict_rate_window_min: 5,
      alert_open_fail_rate_trigger: 0.01,
      alert_retry_rate_trigger: 0.05,
      alert_overdue_share_trigger: 0.20
    })
  }))
}));

describe('AlertManager', () => {
  let alertManager: AlertManager;
  let mockDb: any;
  let mockConfigManager: any;
  let mockLogger: any;

  beforeEach(() => {
    mockDb = {
      all: vi.fn(),
      get: vi.fn(),
      run: vi.fn(),
      close: vi.fn()
    };
    
    mockConfigManager = {
      getEffectiveConfig: vi.fn().mockResolvedValue({
        alert_no_stock_trigger_count: 3,
        alert_no_stock_trigger_window_min: 10,
        alert_conflict_rate_trigger: 0.02,
        alert_conflict_rate_window_min: 5,
        alert_open_fail_rate_trigger: 0.01,
        alert_retry_rate_trigger: 0.05,
        alert_overdue_share_trigger: 0.20
      })
    };

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    };
    
    // Mock the Database constructor to return our mock
    (Database as any).mockImplementation(() => mockDb);
    
    alertManager = new AlertManager(mockDb, mockConfigManager, mockLogger);
  });

  afterEach(() => {
    alertManager.shutdown();
    vi.clearAllMocks();
  });

  describe('Alert Generation', () => {
    it('should trigger alert correctly', async () => {
      // Mock database run for insert
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      const alertData = {
        kioskId: 'kiosk-1',
        threshold: 3,
        actualValue: 5,
        windowMinutes: 10,
        eventCount: 5
      };

      const alertTriggeredSpy = vi.fn();
      alertManager.on('alertTriggered', alertTriggeredSpy);

      await alertManager.triggerAlert('no_stock', alertData);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.arrayContaining([
          expect.any(String), // id
          'no_stock',
          'kiosk-1',
          expect.any(String), // severity
          expect.stringContaining('No stock events exceeded threshold'),
          expect.any(String), // JSON data
          expect.any(String), // triggered_at
          expect.any(String)  // auto_clear_condition
        ]),
        expect.any(Function)
      );

      expect(alertTriggeredSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'no_stock',
          kioskId: 'kiosk-1',
          severity: expect.any(String),
          message: expect.stringContaining('No stock events exceeded threshold')
        })
      );
    });

    it('should not trigger duplicate alerts', async () => {
      // Mock existing alert in memory
      const existingAlert: Alert = {
        id: 'existing-alert',
        type: 'no_stock',
        kioskId: 'kiosk-1',
        severity: 'medium',
        message: 'Test alert',
        data: {},
        triggeredAt: new Date()
      };

      (alertManager as any).activeAlerts.set('existing-alert', existingAlert);

      const alertData = {
        kioskId: 'kiosk-1',
        threshold: 3,
        actualValue: 5
      };

      await alertManager.triggerAlert('no_stock', alertData);

      // Should not call database insert for duplicate
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    it('should calculate severity correctly', async () => {
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      const testCases = [
        { actualValue: 10, threshold: 3, expectedSeverity: 'critical' }, // 10 >= 3*2
        { actualValue: 5, threshold: 3, expectedSeverity: 'high' },      // 5 >= 3*1.5
        { actualValue: 4, threshold: 3, expectedSeverity: 'medium' },    // 4 >= 3*1.2
        { actualValue: 3, threshold: 3, expectedSeverity: 'low' }        // 3 < 3*1.2
      ];

      for (const testCase of testCases) {
        const alertData = {
          kioskId: 'kiosk-1',
          threshold: testCase.threshold,
          actualValue: testCase.actualValue
        };

        const alertTriggeredSpy = vi.fn();
        alertManager.on('alertTriggered', alertTriggeredSpy);

        await alertManager.triggerAlert('no_stock', alertData);

        expect(alertTriggeredSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            severity: testCase.expectedSeverity
          })
        );

        alertManager.removeAllListeners();
        (alertManager as any).activeAlerts.clear();
      }
    });
  });

  describe('Alert Clearing', () => {
    it('should clear alert correctly', async () => {
      // Setup existing alert
      const alert: Alert = {
        id: 'test-alert',
        type: 'no_stock',
        kioskId: 'kiosk-1',
        severity: 'medium',
        message: 'Test alert',
        data: {},
        triggeredAt: new Date()
      };

      (alertManager as any).activeAlerts.set('test-alert', alert);

      // Mock database update
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      const alertClearedSpy = vi.fn();
      alertManager.on('alertCleared', alertClearedSpy);

      await alertManager.clearAlert('test-alert');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alerts SET cleared_at = ?'),
        expect.arrayContaining([
          expect.any(String), // cleared_at timestamp
          'test-alert'
        ]),
        expect.any(Function)
      );

      expect(alertClearedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-alert',
          clearedAt: expect.any(Date)
        })
      );

      expect((alertManager as any).activeAlerts.has('test-alert')).toBe(false);
    });

    it('should handle clearing non-existent alert', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await alertManager.clearAlert('non-existent');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Alert not found for clearing: non-existent')
      );
      expect(mockDb.run).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Threshold Monitoring', () => {
    beforeEach(() => {
      // Mock alert config
      mockDb.get.mockImplementation((query: string, params: any[], callback: Function) => {
        if (query.includes('alert_config')) {
          callback(null, {
            kiosk_id: null,
            alert_type: params[0],
            trigger_threshold: 3,
            trigger_window_minutes: 10,
            clear_threshold: 2,
            clear_window_minutes: 10,
            clear_wait_minutes: 20,
            enabled: 1
          });
        } else {
          callback(null, { total_count: 5 });
        }
      });
    });

    it('should monitor no stock events correctly', async () => {
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      const alertTriggeredSpy = vi.fn();
      alertManager.on('alertTriggered', alertTriggeredSpy);

      await alertManager.monitorNoStock('kiosk-1');

      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('alert_config'),
        ['no_stock', 'kiosk-1'],
        expect.any(Function)
      );

      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SUM(event_count)'),
        expect.arrayContaining(['kiosk-1', 'no_stock_events']),
        expect.any(Function)
      );

      expect(alertTriggeredSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'no_stock',
          kioskId: 'kiosk-1'
        })
      );
    });

    it('should monitor conflict rate correctly', async () => {
      // Mock rate query to return high rate
      mockDb.get.mockImplementation((query: string, params: any[], callback: Function) => {
        if (query.includes('alert_config')) {
          callback(null, {
            kiosk_id: null,
            alert_type: 'conflict_rate',
            trigger_threshold: 0.02,
            trigger_window_minutes: 5,
            clear_threshold: 0.01,
            clear_window_minutes: 10,
            clear_wait_minutes: 0,
            enabled: 1
          });
        } else if (query.includes('AVG(metric_value)')) {
          callback(null, { avg_rate: 0.03 }); // Above threshold
        }
      });

      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      const alertTriggeredSpy = vi.fn();
      alertManager.on('alertTriggered', alertTriggeredSpy);

      await alertManager.monitorConflictRate('kiosk-1');

      expect(alertTriggeredSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'conflict_rate',
          kioskId: 'kiosk-1',
          data: expect.objectContaining({
            threshold: 0.02,
            actualValue: 0.03
          })
        })
      );
    });
  });

  describe('Metric Recording', () => {
    it('should record metrics correctly', async () => {
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      await alertManager.recordMetric('kiosk-1', 'no_stock_events', 1, 1);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alert_metrics'),
        expect.arrayContaining([
          'kiosk-1',
          'no_stock_events',
          1,
          1,
          expect.any(String), // window_start
          expect.any(String)  // window_end
        ]),
        expect.any(Function)
      );
    });
  });

  describe('Monitoring Control', () => {
    it('should start and stop monitoring correctly', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      alertManager.startMonitoring('kiosk-1', 30);

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        30000 // 30 seconds in milliseconds
      );

      alertManager.stopMonitoring('kiosk-1');

      expect(clearIntervalSpy).toHaveBeenCalled();

      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    });

    it('should replace existing monitoring interval', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      alertManager.startMonitoring('kiosk-1', 30);
      alertManager.startMonitoring('kiosk-1', 60); // Replace existing

      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(setIntervalSpy).toHaveBeenCalledTimes(2);

      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    });
  });

  describe('Alert History', () => {
    it('should retrieve alert history correctly', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          type: 'no_stock',
          kiosk_id: 'kiosk-1',
          severity: 'medium',
          message: 'Test alert 1',
          data: '{}',
          triggered_at: '2025-01-09T10:00:00Z',
          cleared_at: '2025-01-09T10:30:00Z',
          auto_clear_condition: 'Test condition'
        }
      ];

      mockDb.all.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null, mockAlerts);
      });

      const history = await alertManager.getAlertHistory('kiosk-1', 50);

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, type, kiosk_id'),
        ['kiosk-1', 50],
        expect.any(Function)
      );

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(
        expect.objectContaining({
          id: 'alert-1',
          type: 'no_stock',
          kioskId: 'kiosk-1',
          severity: 'medium',
          message: 'Test alert 1'
        })
      );
    });
  });

  describe('Cleanup', () => {
    it('should cleanup old alerts correctly', async () => {
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      await alertManager.cleanupOldAlerts(30);

      expect(mockDb.run).toHaveBeenCalledWith(
        'DELETE FROM alerts WHERE triggered_at < ?',
        [expect.any(String)],
        expect.any(Function)
      );

      expect(mockDb.run).toHaveBeenCalledWith(
        'DELETE FROM alert_metrics WHERE created_at < ?',
        [expect.any(String)],
        expect.any(Function)
      );
    });
  });

  describe('Message Generation', () => {
    it('should generate correct messages for different alert types', async () => {
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      const testCases: Array<{
        type: AlertType;
        data: any;
        expectedMessagePattern: RegExp;
      }> = [
        {
          type: 'no_stock',
          data: { kioskId: 'kiosk-1', threshold: 3, actualValue: 5, windowMinutes: 10 },
          expectedMessagePattern: /No stock events exceeded threshold: 5 events in 10 minutes/
        },
        {
          type: 'conflict_rate',
          data: { kioskId: 'kiosk-1', threshold: 0.02, actualValue: 0.03, windowMinutes: 5 },
          expectedMessagePattern: /Assignment conflict rate exceeded: 3\.0% in 5 minutes/
        },
        {
          type: 'open_fail_rate',
          data: { kioskId: 'kiosk-1', threshold: 0.01, actualValue: 0.015, windowMinutes: 10 },
          expectedMessagePattern: /Locker open failure rate exceeded: 1\.5% in 10 minutes/
        },
        {
          type: 'retry_rate',
          data: { kioskId: 'kiosk-1', threshold: 0.05, actualValue: 0.07, windowMinutes: 5 },
          expectedMessagePattern: /Retry rate exceeded: 7\.0% in 5 minutes/
        },
        {
          type: 'overdue_share',
          data: { kioskId: 'kiosk-1', threshold: 0.20, actualValue: 0.25, windowMinutes: 10 },
          expectedMessagePattern: /Overdue locker share exceeded: 25\.0% in 10 minutes/
        }
      ];

      for (const testCase of testCases) {
        const alertTriggeredSpy = vi.fn();
        alertManager.on('alertTriggered', alertTriggeredSpy);

        await alertManager.triggerAlert(testCase.type, testCase.data);

        expect(alertTriggeredSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringMatching(testCase.expectedMessagePattern)
          })
        );

        alertManager.removeAllListeners();
        (alertManager as any).activeAlerts.clear();
      }
    });
  });

  describe('Auto-Clear Conditions', () => {
    it('should generate correct auto-clear conditions', async () => {
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      const testCases: Array<{
        type: AlertType;
        expectedConditionPattern: RegExp;
      }> = [
        {
          type: 'no_stock',
          expectedConditionPattern: /<2 events in 10 minutes after 20 minutes/
        },
        {
          type: 'conflict_rate',
          expectedConditionPattern: /<1\.0% in 10 minutes/
        },
        {
          type: 'open_fail_rate',
          expectedConditionPattern: /<0\.5% in 20 minutes/
        },
        {
          type: 'retry_rate',
          expectedConditionPattern: /<3\.0% in 10 minutes/
        },
        {
          type: 'overdue_share',
          expectedConditionPattern: /<10\.0% in 20 minutes/
        }
      ];

      for (const testCase of testCases) {
        const alertTriggeredSpy = vi.fn();
        alertManager.on('alertTriggered', alertTriggeredSpy);

        await alertManager.triggerAlert(testCase.type, { kioskId: 'kiosk-1' });

        expect(alertTriggeredSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            autoClearCondition: expect.stringMatching(testCase.expectedConditionPattern)
          })
        );

        alertManager.removeAllListeners();
        (alertManager as any).activeAlerts.clear();
      }
    });
  });
}); 
 describe('Single Alert Per Breach', () => {
    it('should not create duplicate alerts for same type and kiosk', async () => {
      // Mock database run for insert
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      const alertData = {
        kioskId: 'kiosk-1',
        threshold: 3,
        actualValue: 5
      };

      // Trigger first alert
      await alertManager.triggerAlert('no_stock', alertData);
      
      // Try to trigger duplicate alert
      await alertManager.triggerAlert('no_stock', alertData);

      // Should only call database insert once
      expect(mockDb.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('Auto-Clear Path', () => {
    it('should set up auto-clear timer for alerts', async () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      const alertData = {
        kioskId: 'kiosk-1',
        threshold: 3,
        actualValue: 5
      };

      await alertManager.triggerAlert('no_stock', alertData);

      // Should set up auto-clear timer
      expect(setTimeoutSpy).toHaveBeenCalled();

      setTimeoutSpy.mockRestore();
    });
  });

  describe('Pagination', () => {
    it('should return paginated alert history', async () => {
      const mockAlerts = Array.from({ length: 25 }, (_, i) => ({
        id: `alert-${i}`,
        type: 'no_stock',
        kiosk_id: 'kiosk-1',
        severity: 'medium',
        message: `Test alert ${i}`,
        data: '{}',
        status: 'active',
        triggered_at: new Date(Date.now() - i * 1000).toISOString(),
        cleared_at: null,
        auto_clear_condition: 'Test condition'
      }));

      // Mock count query
      mockDb.get.mockImplementation((query: string, params: any[], callback: Function) => {
        if (query.includes('COUNT(*)')) {
          callback(null, { total: 25 });
        }
      });

      // Mock data query
      mockDb.all.mockImplementation((query: string, params: any[], callback: Function) => {
        const limit = params[params.length - 2];
        const offset = params[params.length - 1];
        const pageData = mockAlerts.slice(offset, offset + limit);
        callback(null, pageData);
      });

      const result = await alertManager.getAlertHistory('kiosk-1', 1, 10);

      expect(result.alerts).toHaveLength(10);
      expect(result.total).toBe(25);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('Emitter Cleanup', () => {
    it('should clean up all listeners and timers on shutdown', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const removeAllListenersSpy = vi.spyOn(alertManager, 'removeAllListeners');

      // Add some intervals and timers
      alertManager.startMonitoring('kiosk-1', 60);
      (alertManager as any).alertClearTimers.set('test-alert', setTimeout(() => {}, 1000));

      alertManager.shutdown();

      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(removeAllListenersSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('Logging Format', () => {
    it('should log alerts with exact format', async () => {
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      const alertData = {
        kioskId: 'kiosk-1',
        threshold: 3,
        actualValue: 5
      };

      await alertManager.triggerAlert('no_stock', alertData);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^Alert triggered: type=no_stock, severity=\w+\.$/)
      );
    });

    it('should log alert clearing with exact format', async () => {
      // Setup existing alert
      const alert: Alert = {
        id: 'test-alert',
        type: 'no_stock',
        kioskId: 'kiosk-1',
        severity: 'medium',
        message: 'Test alert',
        data: {},
        status: 'active',
        triggeredAt: new Date()
      };

      (alertManager as any).activeAlerts.set('test-alert', alert);

      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      await alertManager.clearAlert('test-alert');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Alert cleared: type=no_stock.'
      );
    });
  });

  describe('PII Sanitization', () => {
    it('should remove PII from alert data', async () => {
      mockDb.run.mockImplementation((query: string, params: any[], callback: Function) => {
        callback(null);
      });

      const alertData = {
        kioskId: 'kiosk-1',
        threshold: 3,
        actualValue: 5,
        cardId: '0009652489', // PII that should be removed
        rfidCard: 'sensitive-data', // PII that should be removed
        seed: 'secret-seed', // PII that should be removed
        payload: 'raw-payload' // PII that should be removed
      };

      await alertManager.triggerAlert('no_stock', alertData);

      // Check that PII was removed from persisted data
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.any(String), // id
          'no_stock',
          'kiosk-1',
          expect.any(String), // severity
          expect.any(String), // message
          expect.stringMatching(/^{(?!.*cardId)(?!.*rfidCard)(?!.*seed)(?!.*payload).*}$/), // sanitized data
          'active',
          expect.any(String), // triggered_at
          expect.any(String)  // auto_clear_condition
        ]),
        expect.any(Function)
      );
    });
  });
});