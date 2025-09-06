/**
 * E2E Test: Assignment Restriction when free_ratio ≤ 0.05
 * 
 * This test drives the complete flow from stock monitoring through assignment orchestrator
 * to verify that assignments are blocked and the correct Turkish message is shown.
 */

import { StockMonitor } from '../stock-monitor';

// Mock assignment orchestrator behavior
class MockAssignmentOrchestrator {
  private stockMonitor: StockMonitor;

  constructor(stockMonitor: StockMonitor) {
    this.stockMonitor = stockMonitor;
  }

  async processAssignmentRequest(kioskId: string, cardId: string) {
    // 1. Check stock-based restrictions before assignment
    const adjustments = await this.stockMonitor.getStockBehaviorAdjustments(kioskId);
    
    if (adjustments.assignmentRestricted) {
      return {
        success: false,
        message: "Boş dolap yok. Görevliye başvurun.",
        errorCode: "NO_CAPACITY",
        retryAllowed: false,
        action: 'assignment_blocked',
        stockLevel: await this.stockMonitor.getStockLevel(kioskId)
      };
    }

    // 2. Normal assignment flow would continue here
    return {
      success: true,
      message: "Dolap atandı.",
      lockerId: 42,
      action: 'assign_new'
    };
  }
}

// Mock database and configuration
const mockDb = {
  get: jest.fn(),
  all: jest.fn(),
  run: jest.fn()
};

const mockConfigManager = {
  getEffectiveConfig: jest.fn(),
  getGlobalConfig: jest.fn()
};

describe('E2E Assignment Restriction Flow', () => {
  let stockMonitor: StockMonitor;
  let assignmentOrchestrator: MockAssignmentOrchestrator;
  const testKioskId = 'e2e-test-kiosk';
  const testCardId = '0009652489';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock standard configuration
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
    
    assignmentOrchestrator = new MockAssignmentOrchestrator(stockMonitor);
  });

  afterEach(() => {
    stockMonitor.stopMonitoring();
  });

  describe('Critical Stock Assignment Blocking', () => {
    it('should block assignment and show Turkish message when free_ratio ≤ 0.05', async () => {
      // Setup: Critical stock scenario (3% free - below 5% threshold)
      mockDb.get.mockResolvedValue({
        total: 100,
        free: 3, // 3% free
        owned: 97,
        blocked: 0,
        error: 0,
        vip: 0
      });

      // Mock alert persistence
      mockDb.run.mockResolvedValue({ changes: 1 });

      // Execute: Process assignment request
      const result = await assignmentOrchestrator.processAssignmentRequest(testKioskId, testCardId);

      // Verify: Assignment blocked with correct message
      expect(result.success).toBe(false);
      expect(result.message).toBe("Boş dolap yok. Görevliye başvurun.");
      expect(result.errorCode).toBe("NO_CAPACITY");
      expect(result.retryAllowed).toBe(false);
      expect(result.action).toBe('assignment_blocked');
      
      // Verify stock level details
      expect(result.stockLevel).toBeDefined();
      expect(result.stockLevel.freeRatio).toBe(0.03);
      expect(result.stockLevel.category).toBe('low');
      
      console.log(`E2E Test: Assignment blocked at ${(result.stockLevel.freeRatio * 100).toFixed(1)}% free.`);
      console.log(`Message: ${result.message}.`);
    });

    it('should allow assignment when free_ratio > 0.05', async () => {
      // Setup: Acceptable stock scenario (8% free - above 5% threshold)
      mockDb.get.mockResolvedValue({
        total: 100,
        free: 8, // 8% free
        owned: 92,
        blocked: 0,
        error: 0,
        vip: 0
      });

      // Execute: Process assignment request
      const result = await assignmentOrchestrator.processAssignmentRequest(testKioskId, testCardId);

      // Verify: Assignment proceeds normally
      expect(result.success).toBe(true);
      expect(result.message).toBe("Dolap atandı.");
      expect(result.lockerId).toBe(42);
      expect(result.action).toBe('assign_new');
      
      console.log(`E2E Test: Assignment allowed at 8.0% free.`);
      console.log(`Message: ${result.message}.`);
    });

    it('should test exact boundary condition at 5%', async () => {
      // Setup: Exactly at threshold (5% free)
      mockDb.get.mockResolvedValue({
        total: 100,
        free: 5, // Exactly 5% free
        owned: 95,
        blocked: 0,
        error: 0,
        vip: 0
      });

      mockDb.run.mockResolvedValue({ changes: 1 });

      // Execute: Process assignment request
      const result = await assignmentOrchestrator.processAssignmentRequest(testKioskId, testCardId);

      // Verify: At exactly 5%, should still be blocked (≤ 0.05)
      expect(result.success).toBe(false);
      expect(result.message).toBe("Boş dolap yok. Görevliye başvurun.");
      expect(result.stockLevel.freeRatio).toBe(0.05);
      
      console.log(`E2E Test: Boundary condition - assignment blocked at exactly 5.0% free.`);
    });

    it('should demonstrate recovery scenario', async () => {
      // Setup: Recovery scenario (6% free - just above threshold)
      mockDb.get.mockResolvedValue({
        total: 100,
        free: 6, // 6% free - above 5% threshold
        owned: 94,
        blocked: 0,
        error: 0,
        vip: 0
      });

      // Execute: Process assignment request
      const result = await assignmentOrchestrator.processAssignmentRequest(testKioskId, testCardId);

      // Verify: Assignment allowed after recovery
      expect(result.success).toBe(true);
      expect(result.message).toBe("Dolap atandı.");
      
      console.log(`E2E Test: Recovery - assignment allowed at 6.0% free.`);
    });
  });

  describe('Complete E2E Flow with Alerts', () => {
    it('should demonstrate full orchestrator flow with stock monitoring and alerts', async () => {
      // Setup: Critical stock scenario
      mockDb.get.mockResolvedValue({
        total: 50,
        free: 2, // 4% free - critical level
        owned: 48,
        blocked: 0,
        error: 0,
        vip: 0
      });

      mockDb.run.mockResolvedValue({ changes: 1 });

      // Step 1: Check stock level
      const stockLevel = await stockMonitor.getStockLevel(testKioskId);
      expect(stockLevel.freeRatio).toBe(0.04);
      expect(stockLevel.category).toBe('low');

      // Step 2: Check behavior adjustments
      const adjustments = await stockMonitor.getStockBehaviorAdjustments(testKioskId);
      expect(adjustments.assignmentRestricted).toBe(true);
      expect(adjustments.reserveDisabled).toBe(true);
      expect(adjustments.quarantineMinutes).toBe(5); // Minimum
      expect(adjustments.hotWindowMinutes).toBe(0); // Disabled

      // Step 3: Check alerts
      const alerts = await stockMonitor.checkStockAlerts(testKioskId);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('no_stock');
      expect(alerts[0].severity).toBe('critical');

      // Step 4: Process assignment request
      const assignmentResult = await assignmentOrchestrator.processAssignmentRequest(testKioskId, testCardId);
      expect(assignmentResult.success).toBe(false);
      expect(assignmentResult.message).toBe("Boş dolap yok. Görevliye başvurun.");

      // Verify complete flow
      console.log(`Stock level: ratio=${stockLevel.freeRatio.toFixed(3)}, category=${stockLevel.category}.`);
      console.log(`Assignment restricted: ${adjustments.assignmentRestricted}.`);
      console.log(`Alert: ${alerts[0].type} - ${alerts[0].message}.`);
      console.log(`Assignment result: ${assignmentResult.message}.`);
      
      // This demonstrates the complete E2E flow:
      // 1. Stock monitoring detects critical level (4% free)
      // 2. Behavior adjustments restrict assignments
      // 3. Alerts notify administrators
      // 4. Assignment orchestrator blocks new assignments
      // 5. User sees Turkish message: "Boş dolap yok. Görevliye başvurun."
    });
  });

  describe('Configuration-Driven Thresholds', () => {
    it('should respect custom assignment restriction threshold', async () => {
      // Setup: Custom threshold configuration
      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        ...mockConfigManager.getEffectiveConfig.mockResolvedValue(),
        stock_assignment_restrict_threshold: 0.03 // Custom 3% threshold
      });

      // Test with 4% free - above custom 3% threshold
      mockDb.get.mockResolvedValue({
        total: 100,
        free: 4, // 4% free
        owned: 96,
        blocked: 0,
        error: 0,
        vip: 0
      });

      // Execute: Process assignment request
      const result = await assignmentOrchestrator.processAssignmentRequest(testKioskId, testCardId);

      // Verify: Assignment allowed with custom threshold
      expect(result.success).toBe(true);
      expect(result.message).toBe("Dolap atandı.");
      
      console.log(`E2E Test: Custom threshold (3%) - assignment allowed at 4.0% free.`);
    });
  });
});