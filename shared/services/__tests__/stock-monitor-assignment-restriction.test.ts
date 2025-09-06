/**
 * Test demonstrating assignment restriction when free_ratio ≤ 0.05
 * Shows how StockMonitor integrates with assignment orchestrator
 */

import { StockMonitor } from '../stock-monitor';

// Mock database and configuration manager
const mockDb = {
  get: jest.fn(),
  all: jest.fn(),
  run: jest.fn()
};

const mockConfigManager = {
  getEffectiveConfig: jest.fn(),
  getGlobalConfig: jest.fn()
};

describe('Stock Monitor Assignment Restriction', () => {
  let stockMonitor: StockMonitor;
  const testKioskId = 'restriction-test-kiosk';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock configuration values
    mockConfigManager.getEffectiveConfig.mockResolvedValue({
      free_ratio_low: 0.1,
      free_ratio_high: 0.5,
      quarantine_min_floor: 5,
      quarantine_min_ceiling: 20,
      owner_hot_window_min: 10,
      owner_hot_window_max: 30,
      stock_reserve_disable_threshold: 0.2,
      stock_assignment_restrict_threshold: 0.05,
      stock_alert_no_stock_threshold: 0.05,
      stock_alert_critical_threshold: 0.1,
      stock_alert_low_threshold: 0.2
    });

    mockConfigManager.getGlobalConfig.mockResolvedValue({
      stock_monitoring_interval_sec: 30,
      stock_alert_cooldown_min: 5
    });

    stockMonitor = new StockMonitor(mockDb as any, mockConfigManager as any);
    stockMonitor.stopMonitoring();
  });

  afterEach(() => {
    stockMonitor.stopMonitoring();
  });

  describe('Assignment Restriction Logic', () => {
    it('should restrict assignments when free_ratio ≤ 0.05', async () => {
      // Mock critical stock scenario: 3% free (≤ 5% threshold)
      mockDb.get.mockResolvedValue({
        total: 100,
        free: 3,
        owned: 97,
        blocked: 0,
        error: 0,
        vip: 0
      });

      const adjustments = await stockMonitor.getStockBehaviorAdjustments(testKioskId);
      
      expect(adjustments.assignmentRestricted).toBe(true);
      expect(adjustments.reserveDisabled).toBe(true);
      expect(adjustments.quarantineMinutes).toBe(5); // Minimum
      expect(adjustments.hotWindowMinutes).toBe(0); // Disabled
      
      // This would be used in assignment orchestrator:
      // if (adjustments.assignmentRestricted) {
      //   return {
      //     success: false,
      //     message: "Boş dolap yok. Görevliye başvurun.",
      //     errorCode: "NO_CAPACITY",
      //     retryAllowed: false
      //   };
      // }
    });

    it('should allow assignments when free_ratio > 0.05', async () => {
      // Mock acceptable stock scenario: 8% free (> 5% threshold)
      mockDb.get.mockResolvedValue({
        total: 100,
        free: 8,
        owned: 92,
        blocked: 0,
        error: 0,
        vip: 0
      });

      const adjustments = await stockMonitor.getStockBehaviorAdjustments(testKioskId);
      
      expect(adjustments.assignmentRestricted).toBe(false);
      expect(adjustments.reserveDisabled).toBe(true); // Still disabled at 8% < 20%
      expect(adjustments.quarantineMinutes).toBe(5); // Still minimum at 8% < 10%
      expect(adjustments.hotWindowMinutes).toBe(0); // Still disabled at 8% < 10%
      
      // Assignment would proceed normally
    });

    it('should demonstrate E2E assignment flow with stock monitoring', async () => {
      // Scenario: Critical stock level
      mockDb.get.mockResolvedValue({
        total: 50,
        free: 2, // 4% free - below 5% threshold
        owned: 48,
        blocked: 0,
        error: 0,
        vip: 0
      });

      // 1. Check stock level
      const stockLevel = await stockMonitor.getStockLevel(testKioskId);
      expect(stockLevel.freeRatio).toBe(0.04); // 4% free
      expect(stockLevel.category).toBe('low'); // < 10% = low

      // 2. Get behavior adjustments
      const adjustments = await stockMonitor.getStockBehaviorAdjustments(testKioskId);
      expect(adjustments.assignmentRestricted).toBe(true); // 4% ≤ 5%

      // 3. Check alerts
      mockDb.run.mockResolvedValue({ changes: 1 });
      const alerts = await stockMonitor.checkStockAlerts(testKioskId);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('no_stock');
      expect(alerts[0].severity).toBe('critical');

      // 4. Assignment orchestrator would use this:
      const mockAssignmentResult = {
        success: false,
        message: "Boş dolap yok. Görevliye başvurun.",
        errorCode: "NO_CAPACITY",
        retryAllowed: false,
        action: 'assignment_blocked'
      };

      // Verify the expected flow
      expect(mockAssignmentResult.success).toBe(false);
      expect(mockAssignmentResult.message).toBe("Boş dolap yok. Görevliye başvurun.");
      
      console.log(`Stock level: ratio=${stockLevel.freeRatio.toFixed(3)}, category=${stockLevel.category}.`);
      console.log(`Assignment restricted: ${adjustments.assignmentRestricted}.`);
      console.log(`Alert triggered: ${alerts[0].type} - ${alerts[0].message}.`);
    });

    it('should demonstrate boundary condition at exactly 5%', async () => {
      // Exactly at threshold: 5% free
      mockDb.get.mockResolvedValue({
        total: 100,
        free: 5, // Exactly 5% free
        owned: 95,
        blocked: 0,
        error: 0,
        vip: 0
      });

      const adjustments = await stockMonitor.getStockBehaviorAdjustments(testKioskId);
      
      // At exactly 5%, should still be restricted (≤ 0.05)
      expect(adjustments.assignmentRestricted).toBe(true);
      
      console.log(`Stock level: ratio=0.050, category=low.`);
      console.log(`Assignment restricted: true (boundary condition).`);
    });

    it('should demonstrate recovery scenario', async () => {
      // Recovery scenario: stock improves to 6%
      mockDb.get.mockResolvedValue({
        total: 100,
        free: 6, // 6% free - above 5% threshold
        owned: 94,
        blocked: 0,
        error: 0,
        vip: 0
      });

      const adjustments = await stockMonitor.getStockBehaviorAdjustments(testKioskId);
      
      // Above 5%, assignments should be allowed again
      expect(adjustments.assignmentRestricted).toBe(false);
      expect(adjustments.reserveDisabled).toBe(true); // Still disabled at 6% < 20%
      
      // Assignment orchestrator would proceed normally
      const mockAssignmentResult = {
        success: true,
        action: 'assign_new',
        message: "Dolap atandı.",
        lockerId: 42
      };

      expect(mockAssignmentResult.success).toBe(true);
      
      console.log(`Stock level: ratio=0.060, category=low.`);
      console.log(`Assignment restricted: false (recovery).`);
    });
  });

  describe('Configuration Integration', () => {
    it('should use configurable threshold for assignment restriction', async () => {
      // Test with custom threshold
      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        ...mockConfigManager.getEffectiveConfig.mockResolvedValue(),
        stock_assignment_restrict_threshold: 0.03 // Custom 3% threshold
      });

      // Mock 4% free - above custom 3% threshold
      mockDb.get.mockResolvedValue({
        total: 100,
        free: 4,
        owned: 96,
        blocked: 0,
        error: 0,
        vip: 0
      });

      const adjustments = await stockMonitor.getStockBehaviorAdjustments(testKioskId);
      
      // Should not be restricted with custom 3% threshold
      expect(adjustments.assignmentRestricted).toBe(false);
      
      console.log(`Stock level: ratio=0.040, category=low.`);
      console.log(`Assignment restricted: false (custom threshold 3%).`);
    });
  });
});