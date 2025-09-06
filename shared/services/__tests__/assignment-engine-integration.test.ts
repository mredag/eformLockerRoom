import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AssignmentEngine } from '../assignment-engine';
import { LockerStateManager } from '../locker-state-manager';
import { ConfigurationManager } from '../configuration-manager';
import { DatabaseConnection } from '../../database/connection';

/**
 * Integration test for AssignmentEngine
 * Tests the main assignment flow with realistic scenarios
 */
describe('AssignmentEngine Integration', () => {
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
    exit_quarantine_minutes: 20,
    version: 1
  };

  beforeEach(() => {
    mockDb = {
      get: vi.fn(),
      all: vi.fn(),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined)
    };

    mockLockerStateManager = {
      checkExistingOwnership: vi.fn()
    };

    mockConfigManager = {
      getEffectiveConfig: vi.fn().mockResolvedValue(mockConfig)
    };

    assignmentEngine = new AssignmentEngine(
      mockDb,
      mockLockerStateManager,
      mockConfigManager
    );
  });

  it('should complete assignment flow successfully', async () => {
    // Arrange
    const request = {
      cardId: '0009652489',
      kioskId: 'kiosk-1',
      timestamp: new Date('2025-01-09T10:30:00Z')
    };

    // No existing ownership
    mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
    
    // No overdue, return hold, or reclaim lockers
    mockDb.get.mockResolvedValue(null);
    
    // Available lockers for assignment
    const availableLockers = [
      {
        kiosk_id: 'kiosk-1',
        id: 1,
        status: 'Free',
        version: 1,
        is_vip: false,
        free_since: '2025-01-09T09:00:00Z',
        wear_count: 5
      },
      {
        kiosk_id: 'kiosk-1',
        id: 2,
        status: 'Free',
        version: 1,
        is_vip: false,
        free_since: '2025-01-09T08:30:00Z',
        wear_count: 3
      }
    ];

    mockDb.all.mockResolvedValueOnce(availableLockers);
    
    // Exclusion data (no exclusions)
    mockDb.all.mockResolvedValueOnce([
      { id: 1, quarantine_until: null, return_hold_until: null, overdue_from: null, suspected_occupied: 0 },
      { id: 2, quarantine_until: null, return_hold_until: null, overdue_from: null, suspected_occupied: 0 }
    ]);

    // Stats for free ratio calculation
    mockDb.get.mockResolvedValueOnce({ total: 10, free: 8 });

    // Act
    const result = await assignmentEngine.assignLocker(request);

    // Assert
    expect(result.success).toBe(true);
    expect(result.action).toBe('assign_new');
    expect(result.lockerId).toBeDefined();
    expect([1, 2]).toContain(result.lockerId);
    expect(result.message).toBe('Dolabınız açıldı. Eşyalarınızı yerleştirin');

    // Verify transaction was used
    expect(mockDb.beginTransaction).toHaveBeenCalled();
    expect(mockDb.commit).toHaveBeenCalled();
    expect(mockDb.rollback).not.toHaveBeenCalled();
  });

  it('should handle existing ownership correctly', async () => {
    // Arrange
    const request = {
      cardId: '0009652489',
      kioskId: 'kiosk-1',
      timestamp: new Date('2025-01-09T10:30:00Z')
    };

    const existingLocker = {
      kiosk_id: 'kiosk-1',
      id: 5,
      status: 'Owned',
      owner_type: 'rfid',
      owner_key: '0009652489',
      version: 1,
      is_vip: false
    };

    mockLockerStateManager.checkExistingOwnership.mockResolvedValue(existingLocker);

    // Act
    const result = await assignmentEngine.assignLocker(request);

    // Assert
    expect(result.success).toBe(true);
    expect(result.action).toBe('open_existing');
    expect(result.lockerId).toBe(5);
    expect(result.message).toBe('Önceki dolabınız açıldı');
  });

  it('should handle no stock scenario', async () => {
    // Arrange
    const request = {
      cardId: '0009652489',
      kioskId: 'kiosk-1',
      timestamp: new Date('2025-01-09T10:30:00Z')
    };

    mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
    mockDb.get.mockResolvedValue(null);
    mockDb.all.mockResolvedValueOnce([]); // No available lockers

    // Act
    const result = await assignmentEngine.assignLocker(request);

    // Assert
    expect(result.success).toBe(false);
    expect(result.action).toBe('assign_new');
    expect(result.errorCode).toBe('no_stock');
    expect(result.message).toBe('Boş dolap yok. Görevliye başvurun');
  });

  it('should provide correct status information', async () => {
    // Act
    const status = await assignmentEngine.getStatus();

    // Assert
    expect(status).toEqual({
      available: true,
      errorRate: 0
    });
  });
});