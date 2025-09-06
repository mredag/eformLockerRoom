import { DatabaseConnection } from '../database/connection';
import { ConfigurationManager } from './configuration-manager';
import { Locker } from '../types/core-entities';

export interface ReserveCapacityConfig {
  reserve_ratio: number;        // Percentage of lockers to reserve (0.0-0.5, default 0.10)
  reserve_minimum: number;      // Minimum number of lockers to reserve (0-10, default 2)
}

export interface ReserveCapacityResult {
  totalAvailable: number;
  reserveRequired: number;
  assignableCount: number;
  assignableLockers: Locker[];
  reserveDisabled: boolean;
  reason?: string;
}

export interface ReserveCapacityStatus {
  totalLockers: number;
  availableLockers: number;
  reserveRequired: number;
  assignableLockers: number;
  reserveRatio: number;
  reserveMinimum: number;
  reserveDisabled: boolean;
  lowStockAlert: boolean;
}

/**
 * ReserveCapacityManager - Manages reserve capacity for locker assignment
 * 
 * Features:
 * - Calculate reserve requirement based on ratio and minimum
 * - Filter assignable locker pool (total - reserved)
 * - Detect low stock and disable reserve when needed
 * - Monitor reserve capacity and trigger alerts
 * - Log reserve decisions for monitoring
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
 */
export class ReserveCapacityManager {
  private db: DatabaseConnection;
  private configManager: ConfigurationManager;

  constructor(db: DatabaseConnection, configManager: ConfigurationManager) {
    this.db = db;
    this.configManager = configManager;
  }

  /**
   * Apply reserve capacity filtering to available lockers
   * Requirements: 13.1, 13.2, 13.3
   * 
   * Bounds: reserve_ratio clamped 0-0.5, reserve_minimum clamped 0-10
   * Placement: Applied after pool filtering and reclaim checks
   */
  async applyReserveCapacity(
    kioskId: string, 
    availableLockers: Locker[]
  ): Promise<ReserveCapacityResult> {
    const config = await this.configManager.getEffectiveConfig(kioskId);
    const totalAvailable = Math.max(0, availableLockers.length); // Ensure >= 0
    
    // Apply bounds validation (Requirements: 13.4, 13.5)
    const reserveRatio = Math.max(0, Math.min(0.5, config.reserve_ratio)); // Clamp 0-0.5
    const reserveMinimum = Math.max(0, Math.min(10, config.reserve_minimum)); // Clamp 0-10
    
    // Calculate reserve requirement (Requirements: 13.1)
    const reserveByRatio = Math.ceil(totalAvailable * reserveRatio);
    const reserveRequired = Math.max(reserveByRatio, reserveMinimum);
    
    // Check if low stock - disable reserve to maximize availability (Requirements: 13.3)
    const lowStockThreshold = reserveRequired * 2;
    if (totalAvailable <= lowStockThreshold) {
      console.log(`Reserve disabled: reason=low_stock, assignable=${totalAvailable}.`);
      
      return {
        totalAvailable,
        reserveRequired: 0,
        assignableCount: totalAvailable,
        assignableLockers: availableLockers,
        reserveDisabled: true,
        reason: 'low_stock'
      };
    }
    
    // Apply reserve capacity - keep last N lockers as reserve
    const assignableCount = totalAvailable - reserveRequired;
    const assignableLockers = availableLockers.slice(0, assignableCount);
    
    // Log reserve decision (exact format required)
    console.log(`Reserve applied: kept=${reserveRequired}, assignable=${assignableCount}.`);
    
    return {
      totalAvailable,
      reserveRequired,
      assignableCount,
      assignableLockers,
      reserveDisabled: false
    };
  }

  /**
   * Check if reserve capacity triggers low stock alert
   * Requirements: 13.2
   */
  async checkLowStockAlert(kioskId: string): Promise<{
    shouldAlert: boolean;
    reason: string;
    metrics: {
      totalAvailable: number;
      reserveRequired: number;
      reserveRatio: number;
    };
  }> {
    const config = await this.configManager.getEffectiveConfig(kioskId);
    
    // Get current available lockers
    const availableLockers = await this.getAvailableLockers(kioskId);
    const totalAvailable = availableLockers.length;
    
    // Calculate reserve requirement
    const reserveByRatio = Math.ceil(totalAvailable * config.reserve_ratio);
    const reserveRequired = Math.max(reserveByRatio, config.reserve_minimum);
    
    // Check if reserve capacity drops below minimum (Requirements: 13.2)
    const shouldAlert = totalAvailable < reserveRequired;
    
    return {
      shouldAlert,
      reason: shouldAlert ? 'reserve_capacity_below_minimum' : 'reserve_capacity_adequate',
      metrics: {
        totalAvailable,
        reserveRequired,
        reserveRatio: config.reserve_ratio
      }
    };
  }

  /**
   * Get reserve capacity status for monitoring
   * Requirements: 13.4, 13.5
   */
  async getReserveCapacityStatus(kioskId: string): Promise<ReserveCapacityStatus> {
    const config = await this.configManager.getEffectiveConfig(kioskId);
    
    // Get total lockers count
    const totalLockers = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM lockers WHERE kiosk_id = ? AND is_vip = 0`,
      [kioskId]
    );
    
    // Get available lockers
    const availableLockers = await this.getAvailableLockers(kioskId);
    const availableCount = availableLockers.length;
    
    // Calculate reserve requirement
    const reserveByRatio = Math.ceil(availableCount * config.reserve_ratio);
    const reserveRequired = Math.max(reserveByRatio, config.reserve_minimum);
    
    // Check if reserve is disabled due to low stock
    const lowStockThreshold = reserveRequired * 2;
    const reserveDisabled = availableCount <= lowStockThreshold;
    
    // Calculate assignable lockers
    const assignableCount = reserveDisabled ? availableCount : Math.max(0, availableCount - reserveRequired);
    
    // Check for low stock alert
    const lowStockAlert = availableCount < reserveRequired;
    
    return {
      totalLockers: totalLockers?.count || 0,
      availableLockers: availableCount,
      reserveRequired: reserveDisabled ? 0 : reserveRequired,
      assignableLockers: assignableCount,
      reserveRatio: config.reserve_ratio,
      reserveMinimum: config.reserve_minimum,
      reserveDisabled,
      lowStockAlert
    };
  }

  /**
   * Monitor reserve capacity and return alerts if needed
   * Requirements: 13.2, 13.4
   */
  async monitorReserveCapacity(kioskId: string): Promise<{
    alerts: Array<{
      type: 'low_stock' | 'reserve_disabled' | 'reserve_below_minimum';
      severity: 'low' | 'medium' | 'high';
      message: string;
      data: any;
    }>;
    status: ReserveCapacityStatus;
  }> {
    const status = await this.getReserveCapacityStatus(kioskId);
    const alerts: any[] = [];
    
    // Low stock alert (Requirements: 13.2)
    if (status.lowStockAlert) {
      alerts.push({
        type: 'reserve_below_minimum',
        severity: 'high',
        message: `Reserve capacity below minimum: ${status.availableLockers} available, ${status.reserveRequired} required`,
        data: {
          availableLockers: status.availableLockers,
          reserveRequired: status.reserveRequired,
          reserveMinimum: status.reserveMinimum
        }
      });
    }
    
    // Reserve disabled alert (Requirements: 13.3)
    if (status.reserveDisabled) {
      alerts.push({
        type: 'reserve_disabled',
        severity: 'medium',
        message: `Reserve capacity disabled due to low stock: ${status.availableLockers} available`,
        data: {
          availableLockers: status.availableLockers,
          threshold: status.reserveRequired * 2
        }
      });
    }
    
    // Very low stock alert
    if (status.availableLockers <= 2) {
      alerts.push({
        type: 'low_stock',
        severity: 'high',
        message: `Critical low stock: only ${status.availableLockers} lockers available`,
        data: {
          availableLockers: status.availableLockers,
          totalLockers: status.totalLockers
        }
      });
    }
    
    return { alerts, status };
  }

  /**
   * Get available lockers for reserve calculation
   * Excludes: owned, blocked, VIP, quarantined, held, overdue, suspected
   */
  private async getAvailableLockers(kioskId: string): Promise<Locker[]> {
    const now = new Date().toISOString();
    
    return await this.db.all<Locker>(
      `SELECT * FROM lockers 
       WHERE kiosk_id = ? 
       AND status = 'Free' 
       AND is_vip = 0
       AND (quarantine_until IS NULL OR quarantine_until <= ?)
       AND (return_hold_until IS NULL OR return_hold_until <= ?)
       AND (owner_hot_until IS NULL OR owner_hot_until <= ?)
       AND overdue_from IS NULL
       AND suspected_occupied = 0
       ORDER BY id ASC`,
      [kioskId, now, now, now]
    );
  }



  /**
   * Test reserve capacity calculation with different scenarios
   * Used for validation and testing
   */
  async testReserveCapacity(
    kioskId: string, 
    scenarios: Array<{ availableCount: number; description: string }>
  ): Promise<Array<{ scenario: string; result: ReserveCapacityResult }>> {
    const config = await this.configManager.getEffectiveConfig(kioskId);
    const results: Array<{ scenario: string; result: ReserveCapacityResult }> = [];
    
    for (const scenario of scenarios) {
      // Create mock lockers for testing
      const mockLockers: Locker[] = Array.from({ length: scenario.availableCount }, (_, i) => ({
        kiosk_id: kioskId,
        id: i + 1,
        status: 'Free',
        owner_type: undefined,
        owner_key: undefined,
        reserved_at: undefined,
        owned_at: undefined,
        version: 1,
        is_vip: false,
        display_name: undefined,
        name_updated_at: undefined,
        name_updated_by: undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        free_since: new Date().toISOString(),
        recent_owner: undefined,
        recent_owner_time: undefined,
        quarantine_until: undefined,
        wear_count: 0,
        overdue_from: undefined,
        overdue_reason: undefined,
        suspected_occupied: false,
        cleared_by: undefined,
        cleared_at: undefined,
        return_hold_until: undefined,
        owner_hot_until: undefined
      }));
      
      const result = await this.applyReserveCapacity(kioskId, mockLockers);
      results.push({
        scenario: `${scenario.description} (${scenario.availableCount} available)`,
        result
      });
    }
    
    return results;
  }
}