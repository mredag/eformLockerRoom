import { StockMonitor, StockLevel, StockAlert, StockMetrics } from '../stock-monitor';
import { DatabaseConnection } from '../../database/connection';

// Mock database connection
const mockDb = {
  get: jest.fn(),
  all: jest.fn(),
  run: jest.fn()
};

// Mock DatabaseConnection
jest.mock('../../database/connection', () => ({
  DatabaseConnection: {
    getInstance: () => mockDb
  }
}));

describe('StockMonitor', () => {
  let stockMonitor: StockMonitor;
  const testKioskId = 'test-kiosk-1';

  beforeEach(() => {
    jest.clearAllMocks();
    stockMonitor = new StockMonitor(mockDb as any);
    // Stop monitoring to prevent interference with tests
    stockMonitor.stopMonitoring();
  });

  afterEach(() => {
    stockMonitor.stopMonitoring();
  });

  describe('calculateFreeRatio', () => {
    it('should calculate free ratio correctly', async () => {
      // Mock locker counts: 10 total, 5 free, 1 VIP
      mockDb.get.mockResolvedValue({
        total: 10,
        free: 5,
        owned: 3,
        blocked: 1,
        error: 0,
        vip: 1
      });

      const freeRatio = await stockMonitor.calculateFreeRatio(testKioskId);
      
      // Available pool = 10 - 1 VIP = 9
      // Free ratio = 5 / 9 = 0.556
      expect(freeRatio).toBeCloseTo(0.556, 3);
    });

    it('should handle zero available pool', async () => {
      // Mock all lockers are VIP
      mockDb.get.mockResolvedValue({
        total: 5,
        free: 0,
        owned: 0,
        blocked: 0,
        error: 0,
        vip: 5
      });

      const freeRatio = await stockMonitor.calculateFreeRatio(testKioskId);
      expect(freeRatio).toBe(0);
    });

    it('should clamp free ratio to [0, 1] range', async () => {
      // Mock scenario where calculation might exceed 1
      mockDb.get.mockResolvedValue({
        total: 10,
        free: 12, // More free than total (edge case)
        owned: 0,
        blocked: 0,
        error: 0,
        vip: 0
      });

      const freeRatio = await stockMonitor.calculateFreeRatio(testKioskId);
      expect(freeRatio).toBe(1); // Should be clamped to 1
    });
  });

  describe('getStockLevel', () => {
    it('should categorize high stock correctly', async () => {
      // Mock high stock scenario: 80% free
      mockDb.get.mockResolvedValue({
        total: 10,
        free: 8,
        owned: 2,
        blocked: 0,
        error: 0,
        vip: 0
      });

      const stockLevel = await stockMonitor.getStockLevel(testKioskId);
      
      expect(stockLevel.category).toBe('high');
      expect(stockLevel.freeRatio).toBe(0.8);
      expect(stockLevel.freeLockers).toBe(8);
      expect(stockLevel.totalLockers).toBe(10);
    });

    it('should categorize medium stock correctly', async () => {
      // Mock medium stock scenario: 30% free
      mockDb.get.mockResolvedValue({
        total: 10,
        free: 3,
        owned: 6,
        blocked: 1,
        error: 0,
        vip: 0
      });

      const stockLevel = await stockMonitor.getStockLevel(testKioskId);
      
      expect(stockLevel.category).toBe('medium');
      expect(stockLevel.freeRatio).toBe(0.3);
    });

    it('should categorize low stock correctly', async () => {
      // Mock low stock scenario: 5% free
      mockDb.get.mockResolvedValue({
        total: 20,
        free: 1,
        owned: 18,
        blocked: 1,
        error: 0,
        vip: 0
      });

      const stockLevel = await stockMonitor.getStockLevel(testKioskId);
      
      expect(stockLevel.category).toBe('low');
      expect(stockLevel.freeRatio).toBe(0.05);
    });

    it('should exclude VIP lockers from available pool', async () => {
      // Mock scenario with VIP lockers
      mockDb.get.mockResolvedValue({
        total: 10,
        free: 4,
        owned: 4,
        blocked: 0,
        error: 0,
        vip: 2 // 2 VIP lockers
      });

      const stockLevel = await stockMonitor.getStockLevel(testKioskId);
      
      // Available pool = 10 - 2 VIP = 8
      // Free ratio = 4 / 8 = 0.5
      expect(stockLevel.freeRatio).toBe(0.5);
      expect(stockLevel.vipLockers).toBe(2);
    });

    it('should throw error for kiosk with no lockers', async () => {
      mockDb.get.mockResolvedValue({
        total: 0,
        free: 0,
        owned: 0,
        blocked: 0,
        error: 0,
        vip: 0
      });

      await expect(stockMonitor.getStockLevel(testKioskId))
        .rejects.toThrow('No lockers found for kiosk test-kiosk-1');
    });
  });

  describe('getStockBehaviorAdjustments', () => {
    it('should calculate high capacity adjustments', async () => {
      // Mock high capacity: 60% free
      mockDb.get.mockResolvedValue({
        total: 10,
        free: 6,
        owned: 4,
        blocked: 0,
        error: 0,
        vip: 0
      });

      const adjustments = await stockMonitor.getStockBehaviorAdjustments(testKioskId);
      
      expect(adjustments.quarantineMinutes).toBe(20); // Maximum quarantine
      expect(adjustments.hotWindowMinutes).toBe(30);  // Maximum hot window
      expect(adjustments.reserveDisabled).toBe(false); // Reserve enabled
      expect(adjustments.assignmentRestricted).toBe(false); // Assignments allowed
    });

    it('should calculate low capacity adjustments', async () => {
      // Mock low capacity: 5% free
      mockDb.get.mockResolvedValue({
        total: 20,
        free: 1,
        owned: 19,
        blocked: 0,
        error: 0,
        vip: 0
      });

      const adjustments = await stockMonitor.getStockBehaviorAdjustments(testKioskId);
      
      expect(adjustments.quarantineMinutes).toBe(5);   // Minimum quarantine
      expect(adjustments.hotWindowMinutes).toBe(0);    // Hot window disabled
      expect(adjustments.reserveDisabled).toBe(true);  // Reserve disabled
      expect(adjustments.assignmentRestricted).toBe(true); // Assignments restricted
    });

    it('should calculate medium capacity adjustments with interpolation', async () => {
      // Mock medium capacity: 30% free (between 0.1 and 0.5)
      mockDb.get.mockResolvedValue({
        total: 10,
        free: 3,
        owned: 7,
        blocked: 0,
        error: 0,
        vip: 0
      });

      const adjustments = await stockMonitor.getStockBehaviorAdjustments(testKioskId);
      
      // Linear interpolation for 30% (0.3):
      // Quarantine: 5 + ((0.3 - 0.1) / (0.5 - 0.1)) * (20 - 5) = 5 + 0.5 * 15 = 12.5 ≈ 13
      // Hot window: 10 + ((0.3 - 0.1) / (0.5 - 0.1)) * (30 - 10) = 10 + 0.5 * 20 = 20
      expect(adjustments.quarantineMinutes).toBe(13);
      expect(adjustments.hotWindowMinutes).toBe(20);
      expect(adjustments.reserveDisabled).toBe(false); // 30% > 20% threshold
      expect(adjustments.assignmentRestricted).toBe(false); // 30% > 5% threshold
    });
  });

  describe('checkStockAlerts', () => {
    beforeEach(() => {
      // Mock successful alert persistence
      mockDb.run.mockResolvedValue({ changes: 1 });
    });

    it('should trigger no stock alert for critical low stock', async () => {
      // Mock critical low stock: 3% free
      mockDb.get.mockResolvedValue({
        total: 100,
        free: 3,
        owned: 97,
        blocked: 0,
        error: 0,
        vip: 0
      });

      const alerts = await stockMonitor.checkStockAlerts(testKioskId);
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('no_stock');
      expect(alerts[0].severity).toBe('critical');
      expect(alerts[0].message).toContain('3% free');
    });

    it('should trigger critical stock alert for low stock', async () => {
      // Mock low stock: 8% free (between 5% and 10%)
      mockDb.get.mockResolvedValue({
        total: 100,
        free: 8,
        owned: 92,
        blocked: 0,
        error: 0,
        vip: 0
      });

      const alerts = await stockMonitor.checkStockAlerts(testKioskId);
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('critical_stock');
      expect(alerts[0].severity).toBe('high');
      expect(alerts[0].message).toContain('8% free');
    });

    it('should trigger low stock alert for medium-low stock', async () => {
      // Mock medium-low stock: 15% free (between 10% and 20%)
      mockDb.get.mockResolvedValue({
        total: 100,
        free: 15,
        owned: 85,
        blocked: 0,
        error: 0,
        vip: 0
      });

      const alerts = await stockMonitor.checkStockAlerts(testKioskId);
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('low_stock');
      expect(alerts[0].severity).toBe('medium');
      expect(alerts[0].message).toContain('15% free');
    });

    it('should not trigger alerts for healthy stock levels', async () => {
      // Mock healthy stock: 60% free
      mockDb.get.mockResolvedValue({
        total: 100,
        free: 60,
        owned: 40,
        blocked: 0,
        error: 0,
        vip: 0
      });

      const alerts = await stockMonitor.checkStockAlerts(testKioskId);
      
      expect(alerts).toHaveLength(0);
    });
  });

  describe('getStockMetrics', () => {
    it('should calculate metrics from stock history', async () => {
      // Mock stock history data
      mockDb.all.mockResolvedValueOnce([
        { free_ratio: 0.8, timestamp: '2025-01-09T10:00:00Z' },
        { free_ratio: 0.6, timestamp: '2025-01-09T11:00:00Z' },
        { free_ratio: 0.4, timestamp: '2025-01-09T12:00:00Z' }
      ]);

      // Mock alert count
      mockDb.get.mockResolvedValue({ count: 2 });

      const metrics = await stockMonitor.getStockMetrics(testKioskId, 24);
      
      expect(metrics.averageFreeRatio).toBeCloseTo(0.6, 3); // (0.8 + 0.6 + 0.4) / 3
      expect(metrics.minFreeRatio).toBe(0.4);
      expect(metrics.maxFreeRatio).toBe(0.8);
      expect(metrics.stockEvents).toBe(3);
      expect(metrics.alertCount).toBe(2);
    });

    it('should handle empty stock history', async () => {
      // Mock empty history
      mockDb.all.mockResolvedValue([]);
      mockDb.get.mockResolvedValue({ count: 0 });

      const metrics = await stockMonitor.getStockMetrics(testKioskId, 24);
      
      expect(metrics.averageFreeRatio).toBe(0);
      expect(metrics.minFreeRatio).toBe(1);
      expect(metrics.maxFreeRatio).toBe(0);
      expect(metrics.stockEvents).toBe(0);
      expect(metrics.alertCount).toBe(0);
    });
  });

  describe('alert management', () => {
    it('should get active alerts', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          type: 'no_stock',
          kiosk_id: testKioskId,
          severity: 'critical',
          message: 'No stock',
          data: '{"freeRatio": 0.02}',
          triggered_at: '2025-01-09T10:00:00Z',
          cleared_at: null,
          auto_cleared: 0
        }
      ];

      mockDb.all.mockResolvedValue(mockAlerts);

      const alerts = await stockMonitor.getActiveAlerts(testKioskId);
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].id).toBe('alert-1');
      expect(alerts[0].type).toBe('no_stock');
      expect(alerts[0].data.freeRatio).toBe(0.02);
    });

    it('should clear alerts', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });

      await stockMonitor.clearAlert('alert-1');
      
      expect(mockDb.run).toHaveBeenCalledWith(
        'UPDATE stock_alerts SET cleared_at = ?, auto_cleared = 1 WHERE id = ?',
        expect.arrayContaining(['alert-1'])
      );
    });
  });

  describe('cleanup operations', () => {
    it('should cleanup old history records', async () => {
      mockDb.run.mockResolvedValue({ changes: 5 });

      await stockMonitor.cleanupOldHistory(7);
      
      expect(mockDb.run).toHaveBeenCalledWith(
        'DELETE FROM stock_history WHERE timestamp < ?',
        expect.any(Array)
      );
    });
  });
});