import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AssignmentEngine, AssignmentRequest } from '../assignment-engine';
import { LockerStateManager } from '../locker-state-manager';
import { ConfigurationManager } from '../configuration-manager';
import { DatabaseConnection } from '../../database/connection';
import { Locker } from '../../types/core-entities';

describe('AssignmentEngine', () => {
  let assignmentEngine: AssignmentEngine;
  let mockDb: any;
  let mockLockerStateManager: any;
  let mockConfigManager: any;

  const mockConfig = {
    smart_assignment_enabled: true,
    base_score: 100,
    score_factor_a: 2.0,
    score_factor_b: 1.0,
    score_factor_g: 0.1,
    score_factor_d: 0.5,
    top_k_candidates: 5,
    selection_temperature: 1.0,
    quarantine_minutes_base: 5,
    quarantine_minutes_ceiling: 20,
    exit_quarantine_minutes: 20,
    return_hold_trigger_seconds: 120,
    return_hold_minutes: 15,
    session_limit_minutes: 180,
    retrieve_window_minutes: 10,
    reserve_ratio: 0.1,
    reserve_minimum: 2,
    sensorless_pulse_ms: 800,
    open_window_seconds: 10,
    retry_count: 1,
    retry_backoff_ms: 500,
    card_rate_limit_seconds: 10,
    locker_rate_limit_per_minute: 3,
    command_cooldown_seconds: 3,
    user_report_daily_cap: 2,
    allow_reclaim_during_quarantine: false,
    version: 1
  };

  beforeEach(() => {
    // Create mocked instances
    mockDb = {
      get: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined)
    };

    mockLockerStateManager = {
      checkExistingOwnership: vi.fn(),
      getLocker: vi.fn(),
      assignLocker: vi.fn(),
      releaseLocker: vi.fn()
    };

    mockConfigManager = {
      getEffectiveConfig: vi.fn().mockResolvedValue(mockConfig),
      getGlobalConfig: vi.fn().mockResolvedValue(mockConfig)
    };

    assignmentEngine = new AssignmentEngine(
      mockDb,
      mockLockerStateManager,
      mockConfigManager
    );
  });

  describe('assignLocker', () => {
    const mockRequest: AssignmentRequest = {
      cardId: '0009652489',
      kioskId: 'kiosk-1',
      timestamp: new Date('2025-01-09T10:30:00Z')
    };

    it('should return existing locker if user already owns one', async () => {
      // Arrange
      const existingLocker: Locker = {
        kiosk_id: 'kiosk-1',
        id: 5,
        status: 'Owned',
        owner_type: 'rfid',
        owner_key: '0009652489',
        version: 1,
        is_vip: false,
        created_at: new Date('2025-01-09T10:00:00Z'),
        updated_at: new Date('2025-01-09T10:00:00Z')
      };

      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(existingLocker);

      // Act
      const result = await assignmentEngine.assignLocker(mockRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.action).toBe('open_existing');
      expect(result.lockerId).toBe(5);
      expect(result.message).toBe('Önceki dolabınız açıldı');
    });

    it('should handle no stock scenario', async () => {
      // Arrange
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      
      // No overdue, return hold, or reclaim lockers
      mockDb.get.mockResolvedValue(null);
      
      // No available lockers
      mockDb.all.mockResolvedValueOnce([]);

      // Act
      const result = await assignmentEngine.assignLocker(mockRequest);

      // Assert
      expect(result.success).toBe(false);
      expect(result.action).toBe('assign_new');
      expect(result.errorCode).toBe('no_stock');
      expect(result.message).toBe('Boş dolap yok. Görevliye başvurun');
    });

    it('should handle system errors gracefully', async () => {
      // Arrange
      mockLockerStateManager.checkExistingOwnership.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await assignmentEngine.assignLocker(mockRequest);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('system_error');
      expect(result.message).toBe('Şu an işlem yapılamıyor');
    });
  });

  describe('getStatus', () => {
    it('should return engine status', async () => {
      // Act
      const status = await assignmentEngine.getStatus();

      // Assert
      expect(status.available).toBe(true);
      expect(status.errorRate).toBe(0);
    });
  });
});