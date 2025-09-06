import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ReserveCapacityManager } from '../reserve-capacity-manager';
import { DatabaseConnection } from '../../database/connection';
import { ConfigurationManager } from '../configuration-manager';
import { Locker } from '../../types/core-entities';

// Mock dependencies
vi.mock('../../database/connection');
vi.mock('../configuration-manager');

describe('ReserveCapacityManager', () => {
  let reserveManager: ReserveCapacityManager;
  let mockDb: vi.Mocked<DatabaseConnection>;
  let mockConfigManager: vi.Mocked<ConfigurationManager>;

  const mockConfig = {
    reserve_ratio: 0.1,      // 10%
    reserve_minimum: 2       // Minimum 2 lockers
  };

  beforeEach(() => {
    mockDb = {
      get: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn()
    } as any;

    mockConfigManager = {
      getEffectiveConfig: vi.fn().mockResolvedValue(mockConfig),
      setKioskOverride: vi.fn(),
      removeKioskOverride: vi.fn()
    } as any;

    reserveManager = new ReserveCapacityManager(mockDb, mockConfigManager);

    // Mock console.log to capture logging
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockLockers = (count: number): Locker[] => {
    return Array.from({ length: count }, (_, i) => ({
      kiosk_id: 'kiosk-1',
      id: i + 1,
      status: 'Free',
      owner_type: null,
      owner_key: null,
      reserved_at: null,
      owned_at: null,
      version: 1,
      is_vip: false,
      display_name: null,
      name_updated_at: null,
      name_updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      free_since: new Date().toISOString(),
      recent_owner: null,
      recent_owner_time: null,
      quarantine_until: null,
      wear_count: 0,
      overdue_from: null,
      overdue_reason: null,
      suspected_occupied: false,
      cleared_by: null,
      cleared_at: null,
      return_hold_until: null,
      owner_hot_until: null
    }));
  };

  describe('applyReserveCapacity', () => {
    it('should maintain reserve_ratio percentage of total capacity as reserve (Requirement 13.1)', async () => {
      const availableLockers = createMockLockers(20); // 20 available lockers
      
      const result = await reserveManager.applyReserveCapacity('kiosk-1', availableLockers);
      
      // With 10% ratio and 20 lockers: reserve = Math.ceil(20 * 0.1) = 2
      // With minimum 2: reserve = Math.max(2, 2) = 2
      // Assignable = 20 - 2 = 18
      expect(result.totalAvailable).toBe(20);
      expect(result.reserveRequired).toBe(2);
      expect(result.assignableCount).toBe(18);
      expect(result.assignableLockers).toHaveLength(18);
      expect(result.reserveDisabled).toBe(false);
      
      // Should log exact format
      expect(console.log).toHaveBeenCalledWith('Reserve: kept=2, assignable=18');
    });

    it('should use reserve_minimum when ratio calculation is lower', async () => {
      const availableLockers = createMockLockers(10); // 10 available lockers
      
      const result = await reserveManager.applyReserveCapacity('kiosk-1', availableLockers);
      
      // With 10% ratio and 10 lockers: reserve = Math.ceil(10 * 0.1) = 1
      // With minimum 2: reserve = Math.max(1, 2) = 2
      // Assignable = 10 - 2 = 8
      expect(result.reserveRequired).toBe(2);
      expect(result.assignableCount).toBe(8);
      expect(result.reserveDisabled).toBe(false);
    });

    it('should disable reserve when low stock detected (Requirement 13.3)', async () => {
      const availableLockers = createMockLockers(4); // Only 4 available lockers
      
      const result = await reserveManager.applyReserveCapacity('kiosk-1', availableLockers);
      
      // Reserve required = 2, low stock threshold = 2 * 2 = 4
      // Since 4 <= 4, reserve should be disabled
      expect(result.totalAvailable).toBe(4);
      expect(result.reserveRequired).toBe(0);
      expect(result.assignableCount).toBe(4);
      expect(result.assignableLockers).toHaveLength(4);
      expect(result.reserveDisabled).toBe(true);
      expect(result.reason).toBe('low_stock');
      
      // Should log disabled reserve
      expect(console.log).toHaveBeenCalledWith('Reserve: kept=0, assignable=4 (disabled due to low stock)');
    });

    it('should handle edge case with very few lockers', async () => {
      const availableLockers = createMockLockers(1); // Only 1 available locker
      
      const result = await reserveManager.applyReserveCapacity('kiosk-1', availableLockers);
      
      expect(result.reserveDisabled).toBe(true);
      expect(result.assignableCount).toBe(1);
      expect(result.assignableLockers).toHaveLength(1);
    });

    it('should handle empty locker list', async () => {
      const availableLockers: Locker[] = [];
      
      const result = await reserveManager.applyReserveCapacity('kiosk-1', availableLockers);
      
      expect(result.totalAvailable).toBe(0);
      expect(result.reserveRequired).toBe(0);
      expect(result.assignableCount).toBe(0);
      expect(result.assignableLockers).toHaveLength(0);
      expect(result.reserveDisabled).toBe(true);
    });

    it('should slice lockers correctly to maintain reserve', async () => {
      const availableLockers = createMockLockers(15);
      
      const result = await reserveManager.applyReserveCapacity('kiosk-1', availableLockers);
      
      // Reserve = Math.ceil(15 * 0.1) = 2, assignable = 15 - 2 = 13
      expect(result.assignableLockers).toHaveLength(13);
      expect(result.assignableLockers[0].id).toBe(1);
      expect(result.assignableLockers[12].id).toBe(13);
      // Lockers 14 and 15 should be reserved (not in assignable list)
    });
  });

  describe('checkLowStockAlert', () => {
    beforeEach(() => {
      // Mock getAvailableLockers query
      mockDb.all.mockResolvedValue(createMockLockers(3));
    });

    it('should trigger alert when reserve capacity drops below minimum (Requirement 13.2)', async () => {
      // 3 available lockers, reserve minimum is 2, so 3 < 2 is false
      // But let's test with 1 available locker
      mockDb.all.mockResolvedValue(createMockLockers(1));
      
      const result = await reserveManager.checkLowStockAlert('kiosk-1');
      
      expect(result.shouldAlert).toBe(true);
      expect(result.reason).toBe('reserve_capacity_below_minimum');
      expect(result.metrics.totalAvailable).toBe(1);
      expect(result.metrics.reserveRequired).toBe(2); // minimum is 2
    });

    it('should not trigger alert when reserve capacity is adequate', async () => {
      mockDb.all.mockResolvedValue(createMockLockers(10));
      
      const result = await reserveManager.checkLowStockAlert('kiosk-1');
      
      expect(result.shouldAlert).toBe(false);
      expect(result.reason).toBe('reserve_capacity_adequate');
      expect(result.metrics.totalAvailable).toBe(10);
      expect(result.metrics.reserveRequired).toBe(2);
    });
  });

  describe('getReserveCapacityStatus', () => {
    beforeEach(() => {
      mockDb.get.mockResolvedValue({ count: 30 }); // Total 30 lockers
      mockDb.all.mockResolvedValue(createMockLockers(20)); // 20 available
    });

    it('should return comprehensive status (Requirements 13.4, 13.5)', async () => {
      const status = await reserveManager.getReserveCapacityStatus('kiosk-1');
      
      expect(status.totalLockers).toBe(30);
      expect(status.availableLockers).toBe(20);
      expect(status.reserveRequired).toBe(2); // Math.max(Math.ceil(20 * 0.1), 2) = 2
      expect(status.assignableLockers).toBe(18); // 20 - 2
      expect(status.reserveRatio).toBe(0.1);
      expect(status.reserveMinimum).toBe(2);
      expect(status.reserveDisabled).toBe(false);
      expect(status.lowStockAlert).toBe(false);
    });

    it('should show reserve disabled when low stock', async () => {
      mockDb.all.mockResolvedValue(createMockLockers(3)); // Only 3 available
      
      const status = await reserveManager.getReserveCapacityStatus('kiosk-1');
      
      expect(status.availableLockers).toBe(3);
      expect(status.reserveDisabled).toBe(true); // 3 <= 2*2
      expect(status.assignableLockers).toBe(3); // All available when disabled
      expect(status.lowStockAlert).toBe(true); // 3 < 2 (reserve minimum)
    });
  });

  describe('monitorReserveCapacity', () => {
    it('should generate appropriate alerts (Requirements 13.2, 13.4)', async () => {
      mockDb.get.mockResolvedValue({ count: 30 });
      mockDb.all.mockResolvedValue(createMockLockers(1)); // Very low stock
      
      const result = await reserveManager.monitorReserveCapacity('kiosk-1');
      
      expect(result.alerts).toHaveLength(2);
      
      // Should have reserve below minimum alert
      const reserveAlert = result.alerts.find(a => a.type === 'reserve_below_minimum');
      expect(reserveAlert).toBeDefined();
      expect(reserveAlert?.severity).toBe('high');
      
      // Should have low stock alert
      const lowStockAlert = result.alerts.find(a => a.type === 'low_stock');
      expect(lowStockAlert).toBeDefined();
      expect(lowStockAlert?.severity).toBe('high');
    });

    it('should generate reserve disabled alert when appropriate', async () => {
      mockDb.get.mockResolvedValue({ count: 30 });
      mockDb.all.mockResolvedValue(createMockLockers(4)); // Low stock but not critical
      
      const result = await reserveManager.monitorReserveCapacity('kiosk-1');
      
      const disabledAlert = result.alerts.find(a => a.type === 'reserve_disabled');
      expect(disabledAlert).toBeDefined();
      expect(disabledAlert?.severity).toBe('medium');
    });

    it('should not generate alerts when capacity is adequate', async () => {
      mockDb.get.mockResolvedValue({ count: 30 });
      mockDb.all.mockResolvedValue(createMockLockers(20)); // Good capacity
      
      const result = await reserveManager.monitorReserveCapacity('kiosk-1');
      
      expect(result.alerts).toHaveLength(0);
    });
  });

  describe('configuration management', () => {
    it('should update reserve configuration', async () => {
      await reserveManager.updateReserveConfig('kiosk-1', {
        reserve_ratio: 0.15,
        reserve_minimum: 3
      });
      
      expect(mockConfigManager.setKioskOverride).toHaveBeenCalledWith('kiosk-1', 'reserve_ratio', 0.15);
      expect(mockConfigManager.setKioskOverride).toHaveBeenCalledWith('kiosk-1', 'reserve_minimum', 3);
    });

    it('should reset reserve configuration to defaults', async () => {
      await reserveManager.resetReserveConfig('kiosk-1');
      
      expect(mockConfigManager.removeKioskOverride).toHaveBeenCalledWith('kiosk-1', 'reserve_ratio');
      expect(mockConfigManager.removeKioskOverride).toHaveBeenCalledWith('kiosk-1', 'reserve_minimum');
    });
  });

  describe('testReserveCapacity', () => {
    it('should test different scenarios correctly', async () => {
      const scenarios = [
        { availableCount: 20, description: 'Normal capacity' },
        { availableCount: 4, description: 'Low stock' },
        { availableCount: 1, description: 'Critical stock' }
      ];
      
      const results = await reserveManager.testReserveCapacity('kiosk-1', scenarios);
      
      expect(results).toHaveLength(3);
      
      // Normal capacity
      expect(results[0].result.reserveDisabled).toBe(false);
      expect(results[0].result.assignableCount).toBe(18); // 20 - 2
      
      // Low stock
      expect(results[1].result.reserveDisabled).toBe(true);
      expect(results[1].result.assignableCount).toBe(4); // All available
      
      // Critical stock
      expect(results[2].result.reserveDisabled).toBe(true);
      expect(results[2].result.assignableCount).toBe(1); // All available
    });
  });

  describe('logging requirements', () => {
    it('should log exact format "Reserve applied: kept=X, assignable=Y." (Acceptance Criteria)', async () => {
      const availableLockers = createMockLockers(15);
      
      await reserveManager.applyReserveCapacity('kiosk-1', availableLockers);
      
      expect(console.log).toHaveBeenCalledWith('Reserve applied: kept=2, assignable=13.');
    });

    it('should log disabled reserve with exact format', async () => {
      const availableLockers = createMockLockers(3);
      
      await reserveManager.applyReserveCapacity('kiosk-1', availableLockers);
      
      expect(console.log).toHaveBeenCalledWith('Reserve disabled: reason=low_stock, assignable=3.');
    });

    it('should ensure no PII in logs', async () => {
      const availableLockers = createMockLockers(10);
      
      // Mock console.log to capture all calls
      const logSpy = vi.spyOn(console, 'log');
      
      await reserveManager.applyReserveCapacity('kiosk-1', availableLockers);
      
      // Check that no log contains PII patterns (card IDs, user names, etc.)
      const logCalls = logSpy.mock.calls.flat();
      logCalls.forEach(call => {
        expect(String(call)).not.toMatch(/card[_-]?\d+/i);
        expect(String(call)).not.toMatch(/user[_-]?\w+/i);
        expect(String(call)).not.toMatch(/\b\d{10,}\b/); // Long numbers that could be IDs
      });
    });
  });

  describe('bounds validation and edge cases', () => {
    it('should clamp reserve_ratio to 0-0.5 bounds', async () => {
      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        reserve_ratio: 0.9, // Above 0.5 limit
        reserve_minimum: 2
      });
      
      const availableLockers = createMockLockers(10);
      const result = await reserveManager.applyReserveCapacity('kiosk-1', availableLockers);
      
      // Should be clamped to 0.5: Math.ceil(10 * 0.5) = 5
      // Low stock threshold = 5 * 2 = 10, since 10 <= 10, reserve disabled
      expect(result.reserveDisabled).toBe(true);
      expect(result.assignableCount).toBe(10);
    });

    it('should clamp reserve_minimum to 0-10 bounds', async () => {
      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        reserve_ratio: 0.1,
        reserve_minimum: 15 // Above 10 limit
      });
      
      const availableLockers = createMockLockers(20);
      const result = await reserveManager.applyReserveCapacity('kiosk-1', availableLockers);
      
      // Should be clamped to 10: Math.max(Math.ceil(20 * 0.1), 10) = 10
      expect(result.reserveRequired).toBe(10);
      expect(result.assignableCount).toBe(10);
    });

    it('should handle totalAvailable >= 0 constraint', async () => {
      const result = await reserveManager.applyReserveCapacity('kiosk-1', []);
      
      expect(result.totalAvailable).toBe(0);
      expect(result.reserveDisabled).toBe(true);
      expect(result.assignableCount).toBe(0);
    });

    it('should handle edge where reserve_required > available', async () => {
      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        reserve_ratio: 0.1,
        reserve_minimum: 5 // Higher than available
      });
      
      const availableLockers = createMockLockers(3); // Only 3 available
      const result = await reserveManager.applyReserveCapacity('kiosk-1', availableLockers);
      
      // Reserve required = Math.max(1, 5) = 5, but only 3 available
      // Should disable reserve: 3 <= 5*2 = 10
      expect(result.reserveDisabled).toBe(true);
      expect(result.assignableCount).toBe(3);
    });

    it('should handle database errors gracefully', async () => {
      mockDb.get.mockRejectedValue(new Error('Database error'));
      
      await expect(reserveManager.getReserveCapacityStatus('kiosk-1')).rejects.toThrow('Database error');
    });
  });

  describe('determinism and performance', () => {
    it('should provide deterministic results with fixed seed after reserve filtering', async () => {
      const availableLockers = createMockLockers(15);
      
      // Run multiple times with same input
      const results = await Promise.all([
        reserveManager.applyReserveCapacity('kiosk-1', availableLockers),
        reserveManager.applyReserveCapacity('kiosk-1', availableLockers),
        reserveManager.applyReserveCapacity('kiosk-1', availableLockers)
      ]);
      
      // All results should be identical
      expect(results[0]).toEqual(results[1]);
      expect(results[1]).toEqual(results[2]);
      expect(results[0].assignableCount).toBe(13); // 15 - 2
    });

    it('should test low-stock disable path explicitly', async () => {
      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        reserve_ratio: 0.2, // 20%
        reserve_minimum: 3
      });
      
      const availableLockers = createMockLockers(6); // Exactly at threshold
      const result = await reserveManager.applyReserveCapacity('kiosk-1', availableLockers);
      
      // Reserve = Math.max(Math.ceil(6 * 0.2), 3) = 3
      // Threshold = 3 * 2 = 6, since 6 <= 6, should disable
      expect(result.reserveDisabled).toBe(true);
      expect(result.reason).toBe('low_stock');
      expect(result.assignableCount).toBe(6);
      
      // Check log format
      expect(console.log).toHaveBeenCalledWith('Reserve disabled: reason=low_stock, assignable=6.');
    });

    it('should perform within 10ms for 200 lockers (Pi-class performance)', async () => {
      const largeLockerSet = createMockLockers(200);
      
      const startTime = Date.now();
      await reserveManager.applyReserveCapacity('kiosk-1', largeLockerSet);
      const endTime = Date.now();
      
      const executionTime = endTime - startTime;
      expect(executionTime).toBeLessThan(10); // Should be < 10ms
    });
  });
});