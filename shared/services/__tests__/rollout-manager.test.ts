import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RolloutManager, RolloutStatus, RolloutMetrics, RolloutDecision } from '../rollout-manager';
import { DatabaseManager } from '../../database/database-manager';
import { ConfigurationManager } from '../configuration-manager';
import { AlertManager } from '../alert-manager';

// Mock dependencies
vi.mock('../database-manager');
vi.mock('../configuration-manager');
vi.mock('../alert-manager');

describe('RolloutManager', () => {
  let rolloutManager: RolloutManager;
  let mockDb: vi.Mocked<DatabaseManager>;
  let mockConfigManager: vi.Mocked<ConfigurationManager>;
  let mockAlertManager: vi.Mocked<AlertManager>;

  beforeEach(() => {
    mockDb = {
      query: vi.fn()
    } as any;

    mockConfigManager = {
      setKioskOverride: vi.fn(),
      updateGlobalConfig: vi.fn()
    } as any;

    mockAlertManager = {
      triggerAlert: vi.fn()
    } as any;

    rolloutManager = new RolloutManager(mockDb, mockConfigManager, mockAlertManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('enableKiosk', () => {
    it('should enable smart assignment for a kiosk', async () => {
      const kioskId = 'kiosk-1';
      const enabledBy = 'admin';
      const reason = 'Initial rollout';

      mockConfigManager.setKioskOverride.mockResolvedValue();
      mockDb.query.mockResolvedValue([]);
      mockAlertManager.triggerAlert.mockResolvedValue();

      await rolloutManager.enableKiosk(kioskId, enabledBy, reason);

      expect(mockConfigManager.setKioskOverride).toHaveBeenCalledWith(
        kioskId, 
        'smart_assignment_enabled', 
        true
      );

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO rollout_status'),
        expect.arrayContaining([kioskId, 1, expect.any(Date), enabledBy, 'enabled', reason])
      );

      expect(mockAlertManager.triggerAlert).toHaveBeenCalledWith(
        'rollout_enabled',
        expect.objectContaining({
          kioskId,
          enabledBy,
          reason
        })
      );
    });

    it('should log rollout action', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      mockConfigManager.setKioskOverride.mockResolvedValue();
      mockDb.query.mockResolvedValue([]);
      mockAlertManager.triggerAlert.mockResolvedValue();

      await rolloutManager.enableKiosk('kiosk-1', 'admin');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Rollout: kiosk=kiosk-1, enabled=true, by=admin'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('disableKiosk', () => {
    it('should disable smart assignment for a kiosk', async () => {
      const kioskId = 'kiosk-1';
      const disabledBy = 'admin';
      const reason = 'Performance issues';

      mockConfigManager.setKioskOverride.mockResolvedValue();
      mockDb.query.mockResolvedValue([]);
      mockAlertManager.triggerAlert.mockResolvedValue();

      await rolloutManager.disableKiosk(kioskId, disabledBy, reason);

      expect(mockConfigManager.setKioskOverride).toHaveBeenCalledWith(
        kioskId, 
        'smart_assignment_enabled', 
        false
      );

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE rollout_status'),
        expect.arrayContaining([0, expect.any(Date), disabledBy, reason, 'rolled_back'])
      );

      expect(mockAlertManager.triggerAlert).toHaveBeenCalledWith(
        'rollout_disabled',
        expect.objectContaining({
          kioskId,
          disabledBy,
          reason
        })
      );
    });

    it('should log rollback action', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      mockConfigManager.setKioskOverride.mockResolvedValue();
      mockDb.query.mockResolvedValue([]);
      mockAlertManager.triggerAlert.mockResolvedValue();

      await rolloutManager.disableKiosk('kiosk-1', 'admin', 'test reason');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Rollout: kiosk=kiosk-1, enabled=false, by=admin, reason=test reason'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('emergencyDisableAll', () => {
    it('should disable all enabled kiosks', async () => {
      const enabledKiosks = [
        { kiosk_id: 'kiosk-1' },
        { kiosk_id: 'kiosk-2' }
      ];

      mockDb.query
        .mockResolvedValueOnce(enabledKiosks) // Get enabled kiosks
        .mockResolvedValue([]); // Other queries

      mockConfigManager.updateGlobalConfig.mockResolvedValue();
      mockConfigManager.setKioskOverride.mockResolvedValue();
      mockAlertManager.triggerAlert.mockResolvedValue();

      await rolloutManager.emergencyDisableAll('admin', 'Critical issue');

      expect(mockConfigManager.updateGlobalConfig).toHaveBeenCalledWith({
        smart_assignment_enabled: false
      });

      expect(mockConfigManager.setKioskOverride).toHaveBeenCalledTimes(2);
      expect(mockAlertManager.triggerAlert).toHaveBeenCalledWith(
        'emergency_rollback',
        expect.objectContaining({
          disabledBy: 'admin',
          reason: 'Critical issue',
          kioskCount: 2
        })
      );
    });
  });

  describe('calculateMetrics', () => {
    it('should calculate rollout metrics correctly', async () => {
      const kioskId = 'kiosk-1';
      
      // Mock assignment metrics
      mockDb.query
        .mockResolvedValueOnce([{
          total_assignments: 100,
          successful_assignments: 95,
          failed_assignments: 5,
          no_stock_events: 2,
          avg_duration: 1500
        }])
        .mockResolvedValueOnce([{ retry_events: 8 }])
        .mockResolvedValueOnce([{ conflict_events: 1 }]);

      const metrics = await rolloutManager.calculateMetrics(kioskId);

      expect(metrics).toEqual({
        totalAssignments: 100,
        successfulAssignments: 95,
        failedAssignments: 5,
        noStockEvents: 2,
        retryEvents: 8,
        conflictEvents: 1,
        averageAssignmentTime: 1500,
        successRate: 0.95,
        lastUpdated: expect.any(Date)
      });
    });

    it('should handle empty metrics gracefully', async () => {
      mockDb.query
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([{}]);

      const metrics = await rolloutManager.calculateMetrics('kiosk-1');

      expect(metrics.totalAssignments).toBe(0);
      expect(metrics.successRate).toBe(0);
    });
  });

  describe('analyzeRolloutDecision', () => {
    beforeEach(() => {
      // Mock calculateMetrics
      vi.spyOn(rolloutManager, 'calculateMetrics').mockResolvedValue({
        totalAssignments: 100,
        successfulAssignments: 90,
        failedAssignments: 10,
        noStockEvents: 3,
        retryEvents: 8,
        conflictEvents: 1,
        averageAssignmentTime: 1500,
        successRate: 0.90,
        lastUpdated: new Date()
      });

      // Mock getKioskStatus
      vi.spyOn(rolloutManager, 'getKioskStatus').mockResolvedValue({
        kioskId: 'kiosk-1',
        enabled: true,
        phase: 'enabled'
      } as RolloutStatus);
    });

    it('should recommend rollback for low success rate', async () => {
      vi.spyOn(rolloutManager, 'calculateMetrics').mockResolvedValue({
        totalAssignments: 100,
        successfulAssignments: 85,
        failedAssignments: 15,
        noStockEvents: 3,
        retryEvents: 8,
        conflictEvents: 1,
        averageAssignmentTime: 1500,
        successRate: 0.85, // Below 95% threshold
        lastUpdated: new Date()
      });

      const decision = await rolloutManager.analyzeRolloutDecision('kiosk-1');

      expect(decision.recommendation).toBe('rollback');
      expect(decision.confidence).toBe(0.9);
      expect(decision.reasons).toContain(expect.stringContaining('Low success rate'));
    });

    it('should recommend enable for good metrics', async () => {
      vi.spyOn(rolloutManager, 'calculateMetrics').mockResolvedValue({
        totalAssignments: 100,
        successfulAssignments: 98,
        failedAssignments: 2,
        noStockEvents: 1,
        retryEvents: 3,
        conflictEvents: 0,
        averageAssignmentTime: 800,
        successRate: 0.98,
        lastUpdated: new Date()
      });

      vi.spyOn(rolloutManager, 'getKioskStatus').mockResolvedValue({
        kioskId: 'kiosk-1',
        enabled: false,
        phase: 'disabled'
      } as RolloutStatus);

      const decision = await rolloutManager.analyzeRolloutDecision('kiosk-1');

      expect(decision.recommendation).toBe('enable');
      expect(decision.confidence).toBe(0.9);
      expect(decision.reasons).toContain('All metrics within acceptable thresholds');
    });

    it('should recommend monitor for insufficient data', async () => {
      vi.spyOn(rolloutManager, 'calculateMetrics').mockResolvedValue({
        totalAssignments: 10, // Below minimum sample size
        successfulAssignments: 9,
        failedAssignments: 1,
        noStockEvents: 0,
        retryEvents: 1,
        conflictEvents: 0,
        averageAssignmentTime: 1200,
        successRate: 0.90,
        lastUpdated: new Date()
      });

      const decision = await rolloutManager.analyzeRolloutDecision('kiosk-1');

      expect(decision.recommendation).toBe('monitor');
      expect(decision.confidence).toBe(0.3);
      expect(decision.reasons).toContain(expect.stringContaining('Insufficient data'));
    });

    it('should use custom thresholds when provided', async () => {
      const customThresholds = {
        minSuccessRate: 0.80, // Lower threshold
        minSampleSize: 20
      };

      const decision = await rolloutManager.analyzeRolloutDecision('kiosk-1', customThresholds);

      expect(decision.thresholds.minSuccessRate).toBe(0.80);
      expect(decision.thresholds.minSampleSize).toBe(20);
    });
  });

  describe('checkAutomatedRollback', () => {
    it('should trigger rollback for kiosks with high confidence rollback recommendation', async () => {
      const enabledKiosks = [{ kiosk_id: 'kiosk-1' }];
      
      mockDb.query.mockResolvedValue(enabledKiosks);
      
      const mockDecision: RolloutDecision = {
        kioskId: 'kiosk-1',
        recommendation: 'rollback',
        confidence: 0.9,
        reasons: ['Low success rate: 80.0% < 95.0%'],
        metrics: {
          totalAssignments: 100,
          successfulAssignments: 80,
          failedAssignments: 20,
          noStockEvents: 5,
          retryEvents: 10,
          conflictEvents: 2,
          averageAssignmentTime: 2500,
          successRate: 0.80,
          lastUpdated: new Date()
        },
        thresholds: {
          minSuccessRate: 0.95,
          maxNoStockRate: 0.05,
          maxRetryRate: 0.10,
          maxConflictRate: 0.02,
          maxAssignmentTimeMs: 2000,
          minSampleSize: 50
        }
      };

      vi.spyOn(rolloutManager, 'analyzeRolloutDecision').mockResolvedValue(mockDecision);
      vi.spyOn(rolloutManager, 'disableKiosk').mockResolvedValue();

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await rolloutManager.checkAutomatedRollback();

      expect(rolloutManager.disableKiosk).toHaveBeenCalledWith(
        'kiosk-1',
        'system',
        expect.stringContaining('Automated rollback')
      );

      expect(mockAlertManager.triggerAlert).toHaveBeenCalledWith(
        'automated_rollback',
        expect.objectContaining({
          kioskId: 'kiosk-1',
          reasons: mockDecision.reasons,
          confidence: 0.9
        })
      );

      consoleSpy.mockRestore();
    });

    it('should not trigger rollback for low confidence recommendations', async () => {
      const enabledKiosks = [{ kiosk_id: 'kiosk-1' }];
      
      mockDb.query.mockResolvedValue(enabledKiosks);
      
      const mockDecision: RolloutDecision = {
        kioskId: 'kiosk-1',
        recommendation: 'rollback',
        confidence: 0.5, // Low confidence
        reasons: ['Some minor issues'],
        metrics: {} as RolloutMetrics,
        thresholds: {} as any
      };

      vi.spyOn(rolloutManager, 'analyzeRolloutDecision').mockResolvedValue(mockDecision);
      vi.spyOn(rolloutManager, 'disableKiosk').mockResolvedValue();

      await rolloutManager.checkAutomatedRollback();

      expect(rolloutManager.disableKiosk).not.toHaveBeenCalled();
    });
  });

  describe('getRolloutSummary', () => {
    it('should return rollout summary statistics', async () => {
      mockDb.query
        .mockResolvedValueOnce([{
          total_kiosks: 5,
          enabled_kiosks: 3,
          disabled_kiosks: 1,
          monitoring_kiosks: 2,
          rolled_back_kiosks: 1
        }])
        .mockResolvedValueOnce([{
          total_success: 950,
          total_assignments: 1000
        }])
        .mockResolvedValueOnce([{
          critical_count: 2
        }]);

      const summary = await rolloutManager.getRolloutSummary();

      expect(summary).toEqual({
        totalKiosks: 5,
        enabledKiosks: 3,
        disabledKiosks: 1,
        monitoringKiosks: 2,
        rolledBackKiosks: 1,
        overallSuccessRate: 0.95,
        criticalIssues: 2
      });
    });
  });
});