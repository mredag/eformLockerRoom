/**
 * Integration test showing how StockMonitor integrates with AssignmentEngine
 * This demonstrates the stock monitoring system working with the smart assignment system
 */

import { StockMonitor } from '../stock-monitor';

// Mock database for testing
const mockDb = {
  get: jest.fn(),
  all: jest.fn(),
  run: jest.fn()
};

describe('StockMonitor Assignment Integration', () => {
  let stockMonitor: StockMonitor;
  const testKioskId = 'integration-kiosk';

  beforeEach(() => {
    jest.clearAllMocks();
    stockMonitor = new StockMonitor(mockDb as any);
    stockMonitor.stopMonitoring(); // Prevent automatic monitoring during tests
  });

  afterEach(() => {
    stockMonitor.stopMonitoring();
  });

  describe('Assignment Engine Integration', () => {
    it('should provide stock-based behavior adjustments for assignment decisions', async () => {
      // Mock high stock scenario
      mockDb.get.mockResolvedValue({
        total: 20,
        free: 15,
        owned: 4,
        blocked: 0,
        error: 1,
        vip: 0
      });

      const adjustments = await stockMonitor.getStockBehaviorAdjustments(testKioskId);
      
      // High stock (75% free) should allow generous policies
      expect(adjustments.quarantineMinutes).toBe(20); // Maximum quarantine
      expect(adjustments.hotWindowMinutes).toBe(30);  // Maximum hot window
      expect(adjustments.reserveDisabled).toBe(false); // Reserve capacity enabled
      expect(adjustments.assignmentRestricted).toBe(false); // Assignments allowed
      
      // This would be used by AssignmentEngine like:
      // const config = await configManager.getEffectiveConfig(kioskId);
      // const stockAdjustments = await stockMonitor.getStockBehaviorAdjustments(kioskId);
      // const quarantineMinutes = stockAdjustments.quarantineMinutes;
      // const hotWindowMinutes = stockAdjustments.hotWindowMinutes;
    });

    it('should provide restrictive adjustments for low stock scenarios', async () => {
      // Mock low stock scenario
      mockDb.get.mockResolvedValue({
        total: 20,
        free: 1,
        owned: 18,
        blocked: 1,
        error: 0,
        vip: 0
      });

      const adjustments = await stockMonitor.getStockBehaviorAdjustments(testKioskId);
      
      // Low stock (5% free) should enforce restrictive policies
      expect(adjustments.quarantineMinutes).toBe(5);   // Minimum quarantine
      expect(adjustments.hotWindowMinutes).toBe(0);    // Hot window disabled
      expect(adjustments.reserveDisabled).toBe(true);  // Reserve capacity disabled
      expect(adjustments.assignmentRestricted).toBe(true); // Assignments restricted
      
      // This would trigger alerts and modify assignment behavior:
      // if (stockAdjustments.assignmentRestricted) {
      //   return { success: false, message: "Boş dolap yok. Görevliye başvurun" };
      // }
    });

    it('should calculate interpolated adjustments for medium stock', async () => {
      // Mock medium stock scenario: 30% free
      mockDb.get.mockResolvedValue({
        total: 10,
        free: 3,
        owned: 6,
        blocked: 1,
        error: 0,
        vip: 0
      });

      const adjustments = await stockMonitor.getStockBehaviorAdjustments(testKioskId);
      
      // Medium stock (30% free) should use interpolated values
      // Quarantine: 5 + ((0.3 - 0.1) / (0.5 - 0.1)) * (20 - 5) = 5 + 0.5 * 15 = 12.5 ≈ 13
      // Hot window: 10 + ((0.3 - 0.1) / (0.5 - 0.1)) * (30 - 10) = 10 + 0.5 * 20 = 20
      expect(adjustments.quarantineMinutes).toBe(13);
      expect(adjustments.hotWindowMinutes).toBe(20);
      expect(adjustments.reserveDisabled).toBe(false); // 30% > 20% threshold
      expect(adjustments.assignmentRestricted).toBe(false); // 30% > 5% threshold
    });

    it('should trigger alerts that would notify administrators', async () => {
      // Mock critical stock scenario
      mockDb.get.mockResolvedValue({
        total: 100,
        free: 3,
        owned: 97,
        blocked: 0,
        error: 0,
        vip: 0
      });
      
      // Mock successful alert persistence
      mockDb.run.mockResolvedValue({ changes: 1 });

      const alerts = await stockMonitor.checkStockAlerts(testKioskId);
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('no_stock');
      expect(alerts[0].severity).toBe('critical');
      expect(alerts[0].message).toContain('3% free');
      
      // This would trigger admin notifications:
      // if (alerts.length > 0) {
      //   await notificationService.sendAlert(alerts[0]);
      //   await adminPanel.showAlert(alerts[0]);
      // }
    });

    it('should provide real-time stock level updates for monitoring', async () => {
      // Mock stock level data
      mockDb.get.mockResolvedValue({
        total: 50,
        free: 25,
        owned: 20,
        blocked: 3,
        error: 2,
        vip: 0
      });

      const stockLevel = await stockMonitor.getStockLevel(testKioskId);
      
      expect(stockLevel.freeRatio).toBe(0.5); // Exactly at high/medium threshold
      expect(stockLevel.category).toBe('high'); // ≥0.5 is high
      expect(stockLevel.totalLockers).toBe(50);
      expect(stockLevel.freeLockers).toBe(25);
      
      // This would be used for real-time dashboard updates:
      // webSocketService.broadcast('stockLevelUpdate', stockLevel);
      // adminDashboard.updateStockDisplay(stockLevel);
      
      // Required logging format verification
      console.log(`📊 Stock level: ratio=${stockLevel.freeRatio.toFixed(3)}, category=${stockLevel.category}`);
    });

    it('should handle VIP lockers correctly in calculations', async () => {
      // Mock scenario with VIP lockers
      mockDb.get.mockResolvedValue({
        total: 20,
        free: 8,
        owned: 10,
        blocked: 0,
        error: 0,
        vip: 2 // 2 VIP lockers
      });

      const stockLevel = await stockMonitor.getStockLevel(testKioskId);
      
      // Available pool = 20 - 2 VIP = 18
      // Free ratio = 8 / 18 = 0.444...
      expect(stockLevel.freeRatio).toBeCloseTo(0.444, 3);
      expect(stockLevel.category).toBe('medium');
      expect(stockLevel.vipLockers).toBe(2);
      
      // VIP lockers should not affect assignment pool calculations
      const adjustments = await stockMonitor.getStockBehaviorAdjustments(testKioskId);
      expect(adjustments.quarantineMinutes).toBeGreaterThan(10); // Medium stock behavior
      expect(adjustments.quarantineMinutes).toBeLessThan(20);
    });
  });

  describe('Assignment Flow Integration Points', () => {
    it('should demonstrate complete assignment flow with stock monitoring', async () => {
      // This test shows how stock monitoring would integrate with the full assignment flow
      
      // 1. Check stock level before assignment
      mockDb.get.mockResolvedValue({
        total: 10,
        free: 2,
        owned: 7,
        blocked: 1,
        error: 0,
        vip: 0
      });

      const stockLevel = await stockMonitor.getStockLevel(testKioskId);
      expect(stockLevel.freeRatio).toBe(0.2); // 20% free - low stock
      expect(stockLevel.category).toBe('medium'); // Between 0.1 and 0.5

      // 2. Get behavior adjustments
      const adjustments = await stockMonitor.getStockBehaviorAdjustments(testKioskId);
      expect(adjustments.reserveDisabled).toBe(false); // 20% = threshold, not disabled
      expect(adjustments.assignmentRestricted).toBe(false); // 20% > 5% threshold

      // 3. Check for alerts
      mockDb.run.mockResolvedValue({ changes: 1 });
      const alerts = await stockMonitor.checkStockAlerts(testKioskId);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('low_stock');

      // 4. Assignment would proceed with adjusted parameters:
      // - Quarantine duration: reduced for faster turnover
      // - Hot window: reduced to allow quicker reassignment
      // - Reserve capacity: still enabled at 20%
      // - Alerts: low stock alert triggered for admin attention
      
      console.log(`📊 Stock level: ratio=${stockLevel.freeRatio.toFixed(3)}, category=${stockLevel.category}`);
    });

    it('should demonstrate emergency stock scenario handling', async () => {
      // Critical stock scenario - should restrict assignments
      mockDb.get.mockResolvedValue({
        total: 30,
        free: 1,
        owned: 28,
        blocked: 1,
        error: 0,
        vip: 0
      });

      const stockLevel = await stockMonitor.getStockLevel(testKioskId);
      expect(stockLevel.freeRatio).toBeCloseTo(0.033, 3); // ~3% free
      expect(stockLevel.category).toBe('low');

      const adjustments = await stockMonitor.getStockBehaviorAdjustments(testKioskId);
      expect(adjustments.assignmentRestricted).toBe(true); // 3% < 5% threshold
      expect(adjustments.reserveDisabled).toBe(true);
      expect(adjustments.hotWindowMinutes).toBe(0); // Disabled
      expect(adjustments.quarantineMinutes).toBe(5); // Minimum

      // Mock alert persistence
      mockDb.run.mockResolvedValue({ changes: 1 });
      const alerts = await stockMonitor.checkStockAlerts(testKioskId);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('no_stock');
      expect(alerts[0].severity).toBe('critical');

      // In this scenario, assignment engine would:
      // 1. Return "Boş dolap yok. Görevliye başvurun" message
      // 2. Trigger critical alerts to administrators
      // 3. Disable reserve capacity to maximize availability
      // 4. Minimize quarantine and hot window times
      
      console.log(`📊 Stock level: ratio=${stockLevel.freeRatio.toFixed(3)}, category=${stockLevel.category}`);
    });
  });
});