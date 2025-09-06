/**
 * Comprehensive Alert System Unit Tests
 * Task 28: Create comprehensive unit tests
 * 
 * Tests all alert generation and clearing logic with >90% coverage
 * Requirements 17.1-17.5: Alerting and Monitoring Thresholds
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AlertManager, Alert, AlertType, AlertData } from '../alert-manager';

describe('AlertSystem - Comprehensive Tests', () => {
  let alertManager: AlertManager;
  let mockDb: any;
  let mockConfig: any;

  const mockAlertThresholds = {
    no_stock: {
      trigger: { count: 3, windowMinutes: 10 },
      clear: { count: 2, windowMinutes: 10, waitMinutes: 20 }
    },
    conflict_rate: {
      trigger: { rate: 0.02, windowMinutes: 5 },
      clear: { rate: 0.01, windowMinutes: 10 }
    },
    open_fail_rate: {
      trigger: { rate: 0.01, windowMinutes: 10 },
      clear: { rate: 0.005, windowMinutes: 20 }
    },
    retry_rate: {
      trigger: { rate: 0.05, windowMinutes: 5 },
      clear: { rate: 0.03, windowMinutes: 10 }
    },
    overdue_share: {
      trigger: { rate: 0.20, windowMinutes: 10 },
      clear: { rate: 0.10, windowMinutes: 20 }
    }
  };

  beforeEach(() => {
    mockDb = {
      get: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
      prepare: vi.fn().mockReturnValue({
        get: vi.fn(),
        all: vi.fn(),
        run: vi.fn()
      })
    };

    mockConfig = {
      alert_thresholds: mockAlertThresholds,
      alert_retention_days: 30
    };

    alertManager = new AlertManager(mockDb, mockConfig);
  });

  describe('No Stock Alert Monitoring (Requirement 17.1)', () => {
    it('should trigger alert when >3 events in 10 minutes', async () => {
      // Mock 4 no-stock events in last 10 minutes
      const mockEvents = [
        { timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString() },
        { timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString() },
        { timestamp: new Date(Date.now() - 6 * 60 * 1000).toISOString() },
        { timestamp: new Date(Date.now() - 8 * 60 * 1000).toISOString() }
      ];

      mockDb.all.mockResolvedValue(mockEvents);
      mockDb.get.mockResolvedValue(null); // No existing alert
      mockDb.run.mockResolvedValue({ changes: 1 });

      await alertManager.monitorNoStock('kiosk-1');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.arrayContaining([
          expect.any(String), // alert ID
          'no_stock',
          'kiosk-1',
          'medium',
          expect.stringContaining('No stock events exceeded threshold'),
          expect.any(String), // JSON data
          expect.any(String)  // timestamp
        ])
      );
    });

    it('should not trigger alert when ≤3 events in 10 minutes', async () => {
      // Mock 3 no-stock events (at threshold, not exceeding)
      const mockEvents = [
        { timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString() },
        { timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString() },
        { timestamp: new Date(Date.now() - 6 * 60 * 1000).toISOString() }
      ];

      mockDb.all.mockResolvedValue(mockEvents);

      await alertManager.monitorNoStock('kiosk-1');

      expect(mockDb.run).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.anything()
      );
    });

    it('should auto-clear when <2 events in 10 minutes after 20 minutes wait', async () => {
      // Mock existing alert triggered 25 minutes ago
      const existingAlert = {
        id: 'alert-123',
        type: 'no_stock',
        kiosk_id: 'kiosk-1',
        triggered_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
        cleared_at: null
      };

      mockDb.get.mockResolvedValue(existingAlert);

      // Mock only 1 event in last 10 minutes (below clear threshold of 2)
      const mockEvents = [
        { timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString() }
      ];

      mockDb.all.mockResolvedValue(mockEvents);
      mockDb.run.mockResolvedValue({ changes: 1 });

      await alertManager.monitorNoStock('kiosk-1');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alerts SET cleared_at = ?'),
        expect.arrayContaining([expect.any(String), 'alert-123'])
      );
    });

    it('should not auto-clear before 20 minutes wait time', async () => {
      // Mock existing alert triggered 15 minutes ago (less than 20 minute wait)
      const existingAlert = {
        id: 'alert-123',
        type: 'no_stock',
        kiosk_id: 'kiosk-1',
        triggered_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        cleared_at: null
      };

      mockDb.get.mockResolvedValue(existingAlert);
      mockDb.all.mockResolvedValue([]); // No events

      await alertManager.monitorNoStock('kiosk-1');

      expect(mockDb.run).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alerts SET cleared_at = ?'),
        expect.anything()
      );
    });
  });

  describe('Conflict Rate Alert Monitoring (Requirement 17.2)', () => {
    it('should trigger alert when >2% conflict rate in 5 minutes', async () => {
      // Mock assignment metrics: 100 total, 3 conflicts = 3% rate
      const mockMetrics = {
        total_assignments: 100,
        conflict_count: 3
      };

      mockDb.get.mockResolvedValueOnce(mockMetrics);
      mockDb.get.mockResolvedValueOnce(null); // No existing alert
      mockDb.run.mockResolvedValue({ changes: 1 });

      await alertManager.monitorConflictRate('kiosk-1');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.arrayContaining([
          expect.any(String),
          'conflict_rate',
          'kiosk-1',
          'high',
          expect.stringContaining('Conflict rate exceeded 2%'),
          expect.any(String),
          expect.any(String)
        ])
      );
    });

    it('should auto-clear when <1% conflict rate in 10 minutes', async () => {
      const existingAlert = {
        id: 'alert-456',
        type: 'conflict_rate',
        kiosk_id: 'kiosk-1',
        triggered_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        cleared_at: null
      };

      mockDb.get.mockResolvedValueOnce({ total_assignments: 200, conflict_count: 1 }); // 0.5% rate
      mockDb.get.mockResolvedValueOnce(existingAlert);
      mockDb.run.mockResolvedValue({ changes: 1 });

      await alertManager.monitorConflictRate('kiosk-1');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alerts SET cleared_at = ?'),
        expect.arrayContaining([expect.any(String), 'alert-456'])
      );
    });

    it('should handle zero assignments gracefully', async () => {
      mockDb.get.mockResolvedValue({ total_assignments: 0, conflict_count: 0 });

      await alertManager.monitorConflictRate('kiosk-1');

      // Should not trigger alert or throw error
      expect(mockDb.run).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.anything()
      );
    });
  });

  describe('Open Fail Rate Alert Monitoring (Requirement 17.3)', () => {
    it('should trigger alert when >1% failure rate in 10 minutes', async () => {
      const mockMetrics = {
        total_opens: 100,
        failed_opens: 2 // 2% failure rate
      };

      mockDb.get.mockResolvedValueOnce(mockMetrics);
      mockDb.get.mockResolvedValueOnce(null);
      mockDb.run.mockResolvedValue({ changes: 1 });

      await alertManager.monitorOpenFailRate('kiosk-1');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.arrayContaining([
          expect.any(String),
          'open_fail_rate',
          'kiosk-1',
          'high',
          expect.stringContaining('Open failure rate exceeded 1%'),
          expect.any(String),
          expect.any(String)
        ])
      );
    });

    it('should auto-clear when <0.5% failure rate in 20 minutes', async () => {
      const existingAlert = {
        id: 'alert-789',
        type: 'open_fail_rate',
        kiosk_id: 'kiosk-1',
        triggered_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
        cleared_at: null
      };

      mockDb.get.mockResolvedValueOnce({ total_opens: 1000, failed_opens: 4 }); // 0.4% rate
      mockDb.get.mockResolvedValueOnce(existingAlert);
      mockDb.run.mockResolvedValue({ changes: 1 });

      await alertManager.monitorOpenFailRate('kiosk-1');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alerts SET cleared_at = ?'),
        expect.arrayContaining([expect.any(String), 'alert-789'])
      );
    });
  });

  describe('Retry Rate Alert Monitoring (Requirement 17.4)', () => {
    it('should trigger alert when >5% retry rate in 5 minutes', async () => {
      const mockMetrics = {
        total_opens: 100,
        retry_count: 6 // 6% retry rate
      };

      mockDb.get.mockResolvedValueOnce(mockMetrics);
      mockDb.get.mockResolvedValueOnce(null);
      mockDb.run.mockResolvedValue({ changes: 1 });

      await alertManager.monitorRetryRate('kiosk-1');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.arrayContaining([
          expect.any(String),
          'retry_rate',
          'kiosk-1',
          'medium',
          expect.stringContaining('Retry rate exceeded 5%'),
          expect.any(String),
          expect.any(String)
        ])
      );
    });

    it('should auto-clear when <3% retry rate in 10 minutes', async () => {
      const existingAlert = {
        id: 'alert-retry',
        type: 'retry_rate',
        kiosk_id: 'kiosk-1',
        triggered_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        cleared_at: null
      };

      mockDb.get.mockResolvedValueOnce({ total_opens: 100, retry_count: 2 }); // 2% rate
      mockDb.get.mockResolvedValueOnce(existingAlert);
      mockDb.run.mockResolvedValue({ changes: 1 });

      await alertManager.monitorRetryRate('kiosk-1');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alerts SET cleared_at = ?'),
        expect.arrayContaining([expect.any(String), 'alert-retry'])
      );
    });
  });

  describe('Overdue Share Alert Monitoring (Requirement 17.5)', () => {
    it('should trigger alert when ≥20% overdue share in 10 minutes', async () => {
      const mockMetrics = {
        total_lockers: 30,
        overdue_count: 6 // 20% overdue share (exactly at threshold)
      };

      mockDb.get.mockResolvedValueOnce(mockMetrics);
      mockDb.get.mockResolvedValueOnce(null);
      mockDb.run.mockResolvedValue({ changes: 1 });

      await alertManager.monitorOverdueShare('kiosk-1');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.arrayContaining([
          expect.any(String),
          'overdue_share',
          'kiosk-1',
          'critical',
          expect.stringContaining('Overdue share reached 20%'),
          expect.any(String),
          expect.any(String)
        ])
      );
    });

    it('should auto-clear when <10% overdue share in 20 minutes', async () => {
      const existingAlert = {
        id: 'alert-overdue',
        type: 'overdue_share',
        kiosk_id: 'kiosk-1',
        triggered_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
        cleared_at: null
      };

      mockDb.get.mockResolvedValueOnce({ total_lockers: 30, overdue_count: 2 }); // 6.7% share
      mockDb.get.mockResolvedValueOnce(existingAlert);
      mockDb.run.mockResolvedValue({ changes: 1 });

      await alertManager.monitorOverdueShare('kiosk-1');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alerts SET cleared_at = ?'),
        expect.arrayContaining([expect.any(String), 'alert-overdue'])
      );
    });

    it('should not trigger when <20% overdue share', async () => {
      const mockMetrics = {
        total_lockers: 30,
        overdue_count: 5 // 16.7% overdue share (below threshold)
      };

      mockDb.get.mockResolvedValue(mockMetrics);

      await alertManager.monitorOverdueShare('kiosk-1');

      expect(mockDb.run).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.anything()
      );
    });
  });

  describe('Alert Generation and Management', () => {
    it('should generate unique alert IDs', async () => {
      mockDb.get.mockResolvedValue(null);
      mockDb.run.mockResolvedValue({ changes: 1 });

      const alertData: AlertData = {
        count: 5,
        threshold: 3,
        windowMinutes: 10
      };

      await alertManager.triggerAlert('no_stock', 'kiosk-1', alertData);
      await alertManager.triggerAlert('no_stock', 'kiosk-2', alertData);

      expect(mockDb.run).toHaveBeenCalledTimes(2);
      
      const calls = mockDb.run.mock.calls;
      const alertId1 = calls[0][1][0];
      const alertId2 = calls[1][1][0];
      
      expect(alertId1).not.toBe(alertId2);
      expect(alertId1).toMatch(/^alert-/);
      expect(alertId2).toMatch(/^alert-/);
    });

    it('should set appropriate severity levels', async () => {
      mockDb.get.mockResolvedValue(null);
      mockDb.run.mockResolvedValue({ changes: 1 });

      const testCases = [
        { type: 'no_stock' as AlertType, expectedSeverity: 'medium' },
        { type: 'conflict_rate' as AlertType, expectedSeverity: 'high' },
        { type: 'open_fail_rate' as AlertType, expectedSeverity: 'high' },
        { type: 'retry_rate' as AlertType, expectedSeverity: 'medium' },
        { type: 'overdue_share' as AlertType, expectedSeverity: 'critical' }
      ];

      for (const { type, expectedSeverity } of testCases) {
        await alertManager.triggerAlert(type, 'kiosk-1', { count: 1 });
        
        expect(mockDb.run).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO alerts'),
          expect.arrayContaining([
            expect.any(String),
            type,
            'kiosk-1',
            expectedSeverity,
            expect.any(String),
            expect.any(String),
            expect.any(String)
          ])
        );
      }
    });

    it('should prevent duplicate alerts for same type and kiosk', async () => {
      const existingAlert = {
        id: 'existing-alert',
        type: 'no_stock',
        kiosk_id: 'kiosk-1',
        cleared_at: null
      };

      mockDb.get.mockResolvedValue(existingAlert);

      const alertData: AlertData = { count: 5, threshold: 3 };
      await alertManager.triggerAlert('no_stock', 'kiosk-1', alertData);

      expect(mockDb.run).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.anything()
      );
    });

    it('should log alert generation with exact format', async () => {
      mockDb.get.mockResolvedValue(null);
      mockDb.run.mockResolvedValue({ changes: 1 });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await alertManager.triggerAlert('no_stock', 'kiosk-1', { count: 5 });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Alert triggered: type=no_stock, severity=medium.'
      );

      consoleSpy.mockRestore();
    });

    it('should log alert clearing with exact format', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await alertManager.clearAlert('alert-123');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Alert cleared: type=no_stock, condition=below_threshold.'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Alert Queries and Status', () => {
    it('should get active alerts for kiosk', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          type: 'no_stock',
          kiosk_id: 'kiosk-1',
          severity: 'medium',
          message: 'No stock alert',
          triggered_at: new Date().toISOString(),
          cleared_at: null
        },
        {
          id: 'alert-2',
          type: 'conflict_rate',
          kiosk_id: 'kiosk-1',
          severity: 'high',
          message: 'Conflict rate alert',
          triggered_at: new Date().toISOString(),
          cleared_at: null
        }
      ];

      mockDb.all.mockResolvedValue(mockAlerts);

      const alerts = await alertManager.getActiveAlerts('kiosk-1');

      expect(alerts).toHaveLength(2);
      expect(alerts[0].type).toBe('no_stock');
      expect(alerts[1].type).toBe('conflict_rate');
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM alerts WHERE kiosk_id = ? AND cleared_at IS NULL'),
        ['kiosk-1']
      );
    });

    it('should get all alerts with pagination', async () => {
      const mockAlerts = Array.from({ length: 10 }, (_, i) => ({
        id: `alert-${i}`,
        type: 'no_stock',
        kiosk_id: 'kiosk-1',
        severity: 'medium'
      }));

      mockDb.all.mockResolvedValue(mockAlerts.slice(0, 5)); // First page

      const alerts = await alertManager.getAllAlerts({ page: 1, limit: 5 });

      expect(alerts).toHaveLength(5);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 5 OFFSET 0'),
        expect.any(Array)
      );
    });

    it('should get alert statistics', async () => {
      const mockStats = {
        total: 100,
        active: 5,
        cleared: 95,
        critical: 2,
        high: 8,
        medium: 15,
        low: 0
      };

      mockDb.get.mockResolvedValue(mockStats);

      const stats = await alertManager.getAlertStatistics();

      expect(stats.total).toBe(100);
      expect(stats.active).toBe(5);
      expect(stats.cleared).toBe(95);
      expect(stats.critical).toBe(2);
    });
  });

  describe('Alert Cleanup and Maintenance', () => {
    it('should clean up old cleared alerts', async () => {
      mockDb.run.mockResolvedValue({ changes: 15 });

      const deletedCount = await alertManager.cleanupOldAlerts();

      expect(deletedCount).toBe(15);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM alerts'),
        expect.arrayContaining([expect.any(String)]) // cutoff date
      );
    });

    it('should archive old alerts before deletion', async () => {
      const oldAlerts = [
        {
          id: 'old-alert-1',
          type: 'no_stock',
          triggered_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
        }
      ];

      mockDb.all.mockResolvedValue(oldAlerts);
      mockDb.run.mockResolvedValue({ changes: 1 });

      await alertManager.archiveOldAlerts();

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alert_archive'),
        expect.any(Array)
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle database errors gracefully', async () => {
      mockDb.get.mockRejectedValue(new Error('Database connection failed'));

      await expect(alertManager.monitorNoStock('kiosk-1'))
        .rejects.toThrow('Database connection failed');
    });

    it('should handle missing configuration gracefully', async () => {
      const alertManagerWithoutConfig = new AlertManager(mockDb, {});

      // Should use default thresholds
      await expect(alertManagerWithoutConfig.monitorNoStock('kiosk-1'))
        .resolves.not.toThrow();
    });

    it('should handle invalid alert data', async () => {
      mockDb.get.mockResolvedValue(null);

      await expect(alertManager.triggerAlert('no_stock', '', { count: 5 }))
        .rejects.toThrow('Kiosk ID is required');

      await expect(alertManager.triggerAlert('' as AlertType, 'kiosk-1', { count: 5 }))
        .rejects.toThrow('Alert type is required');
    });

    it('should handle concurrent alert operations', async () => {
      mockDb.get.mockResolvedValue(null);
      mockDb.run.mockResolvedValue({ changes: 1 });

      const promises = [
        alertManager.triggerAlert('no_stock', 'kiosk-1', { count: 5 }),
        alertManager.triggerAlert('conflict_rate', 'kiosk-1', { rate: 0.03 }),
        alertManager.clearAlert('alert-123')
      ];

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });
  });

  describe('Alert Threshold Configuration', () => {
    it('should validate alert threshold configuration', () => {
      const validConfig = {
        no_stock: {
          trigger: { count: 3, windowMinutes: 10 },
          clear: { count: 2, windowMinutes: 10, waitMinutes: 20 }
        }
      };

      expect(alertManager.validateThresholdConfig(validConfig)).toBe(true);

      const invalidConfig = {
        no_stock: {
          trigger: { count: -1, windowMinutes: 10 } // Invalid negative count
        }
      };

      expect(alertManager.validateThresholdConfig(invalidConfig)).toBe(false);
    });

    it('should update alert thresholds dynamically', async () => {
      const newThresholds = {
        no_stock: {
          trigger: { count: 5, windowMinutes: 15 },
          clear: { count: 3, windowMinutes: 15, waitMinutes: 30 }
        }
      };

      await alertManager.updateThresholds(newThresholds);

      expect(alertManager.getThresholds().no_stock.trigger.count).toBe(5);
      expect(alertManager.getThresholds().no_stock.trigger.windowMinutes).toBe(15);
    });
  });
});