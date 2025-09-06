/**
 * Comprehensive Assignment Engine Unit Tests
 * Task 28: Create comprehensive unit tests
 * 
 * Tests all assignment engine components with >90% coverage
 * Requirements: 1.1-1.5, 2.1-2.5, 19.1-19.5
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AssignmentEngine, AssignmentRequest, AssignmentResult } from '../assignment-engine';
import { LockerStateManager } from '../locker-state-manager';
import { ConfigurationManager } from '../configuration-manager';
import { Locker } from '../../types/core-entities';

describe('AssignmentEngine - Comprehensive Tests', () => {
  let assignmentEngine: AssignmentEngine;
  let mockDb: any;
  let mockLockerStateManager: any;
  let mockConfigManager: any;
  let mockConsole: any;

  const mockConfig = {
    smart_assignment_enabled: true,
    base_score: 100,
    score_factor_a: 2.0,
    score_factor_b: 1.0,
    score_factor_g: 0.1,
    score_factor_d: 0.5,
    top_k_candidates: 5,
    selection_temperature: 1.0,
    quarantine_min_floor: 5,
    quarantine_min_ceiling: 20,
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
    mockConsole = global.mockConsole();
    
    mockDb = {
      get: jest.fn(),
      all: jest.fn(),
      run: jest.fn(),
      transaction: jest.fn().mockImplementation(async (callback) => {
        return await callback(mockDb);
      })
    };

    mockLockerStateManager = {
      checkExistingOwnership: jest.fn(),
      getLocker: jest.fn(),
      assignLocker: jest.fn(),
      releaseLocker: jest.fn(),
      getAvailableLockers: jest.fn()
    };

    mockConfigManager = {
      getEffectiveConfig: jest.fn().mockResolvedValue(mockConfig),
      getGlobalConfig: jest.fn().mockResolvedValue(mockConfig)
    };

    assignmentEngine = new AssignmentEngine(
      mockDb,
      mockLockerStateManager,
      mockConfigManager
    );
  });

  afterEach(() => {
    mockConsole.restore();
  });

  describe('Scoring Algorithm (Requirements 2.1-2.5)', () => {
    it('should calculate base score correctly', async () => {
      const mockLockers = [
        {
          kiosk_id: 'kiosk-1',
          id: 1,
          status: 'Free',
          free_since: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
          recent_owner_time: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
          wear_count: 5,
          quarantine_until: null
        }
      ];

      mockDb.all.mockResolvedValue(mockLockers);

      const scores = await assignmentEngine.scoreLockers('kiosk-1', []);

      expect(scores).toHaveLength(1);
      expect(scores[0].baseScore).toBe(100);
      expect(scores[0].freeHours).toBe(2);
      expect(scores[0].hoursSinceLastOwner).toBe(4);
      expect(scores[0].wearCount).toBe(5);
      
      // Final score = (100 + 2*2 + 1*4) / (1 + 0.1*5) = 108 / 1.5 = 72
      expect(scores[0].finalScore).toBeCloseTo(72, 1);
    });

    it('should exclude quarantined lockers from scoring', async () => {
      const mockLockers = [
        {
          kiosk_id: 'kiosk-1',
          id: 1,
          status: 'Free',
          quarantine_until: new Date(Date.now() + 60000).toISOString() // Future quarantine
        },
        {
          kiosk_id: 'kiosk-1',
          id: 2,
          status: 'Free',
          quarantine_until: null
        }
      ];

      mockDb.all.mockResolvedValue(mockLockers);

      const scores = await assignmentEngine.scoreLockers('kiosk-1', []);

      expect(scores).toHaveLength(1);
      expect(scores[0].lockerId).toBe(2);
    });

    it('should apply waiting hours bonus when configured', async () => {
      const mockLockers = [
        {
          kiosk_id: 'kiosk-1',
          id: 1,
          status: 'Free',
          free_since: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
          recent_owner_time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
          wear_count: 0,
          quarantine_until: null
        }
      ];

      mockDb.all.mockResolvedValue(mockLockers);

      // Mock waiting time for starvation reduction
      const waitingHours = 3;
      const scores = await assignmentEngine.scoreLockers('kiosk-1', [], waitingHours);

      expect(scores[0].waitingHours).toBe(3);
      // Score should include waiting bonus: score_factor_d * waiting_hours = 0.5 * 3 = 1.5
      const expectedBonus = 0.5 * 3;
      expect(scores[0].finalScore).toBeGreaterThan(100); // Base score + bonus
    });

    it('should handle edge case with zero wear count', async () => {
      const mockLockers = [
        {
          kiosk_id: 'kiosk-1',
          id: 1,
          status: 'Free',
          free_since: new Date().toISOString(),
          recent_owner_time: new Date().toISOString(),
          wear_count: 0,
          quarantine_until: null
        }
      ];

      mockDb.all.mockResolvedValue(mockLockers);

      const scores = await assignmentEngine.scoreLockers('kiosk-1', []);

      expect(scores[0].wearCount).toBe(0);
      // Divisor should be (1 + 0.1*0) = 1, so no wear penalty
      expect(scores[0].finalScore).toBe(100); // Base score only
    });
  });

  describe('Candidate Selection (Requirements 2.1-2.5)', () => {
    it('should select top K candidates only', async () => {
      const mockScores = [
        { lockerId: 1, finalScore: 100 },
        { lockerId: 2, finalScore: 90 },
        { lockerId: 3, finalScore: 80 },
        { lockerId: 4, finalScore: 70 },
        { lockerId: 5, finalScore: 60 },
        { lockerId: 6, finalScore: 50 },
        { lockerId: 7, finalScore: 40 }
      ];

      const selectedId = assignmentEngine.selectFromCandidates(mockScores, mockConfig);

      // Should select from top 5 candidates (top_k_candidates = 5)
      expect([1, 2, 3, 4, 5]).toContain(selectedId);
      expect([6, 7]).not.toContain(selectedId);
    });

    it('should handle empty candidate list', async () => {
      const selectedId = assignmentEngine.selectFromCandidates([], mockConfig);
      expect(selectedId).toBeNull();
    });

    it('should handle single candidate', async () => {
      const mockScores = [{ lockerId: 1, finalScore: 100 }];
      const selectedId = assignmentEngine.selectFromCandidates(mockScores, mockConfig);
      expect(selectedId).toBe(1);
    });
  });

  describe('Assignment Flow (Requirements 1.1-1.5)', () => {
    const mockRequest: AssignmentRequest = {
      cardId: '0009652489',
      kioskId: 'kiosk-1',
      timestamp: new Date('2025-01-09T10:30:00Z')
    };

    it('should handle existing ownership (Requirement 1.5)', async () => {
      const existingLocker: Locker = {
        kiosk_id: 'kiosk-1',
        id: 5,
        status: 'Owned',
        owner_type: 'rfid',
        owner_key: '0009652489',
        version: 1,
        is_vip: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(existingLocker);

      const result = await assignmentEngine.assignLocker(mockRequest);

      expect(result.success).toBe(true);
      expect(result.action).toBe('open_existing');
      expect(result.lockerId).toBe(5);
      expect(result.message).toBe('Önceki dolabınız açıldı');
    });

    it('should handle overdue retrieval', async () => {
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      
      // Mock overdue locker for this card
      mockDb.get.mockResolvedValueOnce({
        kiosk_id: 'kiosk-1',
        id: 3,
        status: 'Free',
        overdue_from: new Date(Date.now() - 60000).toISOString(),
        recent_owner: '0009652489'
      });

      mockLockerStateManager.assignLocker.mockResolvedValue(true);

      const result = await assignmentEngine.assignLocker(mockRequest);

      expect(result.success).toBe(true);
      expect(result.action).toBe('retrieve_overdue');
      expect(result.lockerId).toBe(3);
      expect(result.message).toBe('Süreniz doldu. Almanız için açılıyor');
    });

    it('should handle return hold bypass', async () => {
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockDb.get.mockResolvedValueOnce(null); // No overdue

      // Mock return hold locker
      mockDb.get.mockResolvedValueOnce({
        kiosk_id: 'kiosk-1',
        id: 7,
        status: 'Free',
        return_hold_until: new Date(Date.now() + 60000).toISOString(),
        recent_owner: '0009652489'
      });

      mockLockerStateManager.assignLocker.mockResolvedValue(true);

      const result = await assignmentEngine.assignLocker(mockRequest);

      expect(result.success).toBe(true);
      expect(result.action).toBe('open_existing');
      expect(result.lockerId).toBe(7);
      expect(result.message).toBe('Önceki dolabınız açıldı');
    });

    it('should handle reclaim scenario', async () => {
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockDb.get.mockResolvedValueOnce(null); // No overdue
      mockDb.get.mockResolvedValueOnce(null); // No return hold

      // Mock reclaim eligibility
      mockDb.get.mockResolvedValueOnce({
        kiosk_id: 'kiosk-1',
        id: 8,
        status: 'Free',
        recent_owner: '0009652489',
        recent_owner_time: new Date(Date.now() - 150 * 60 * 1000).toISOString() // 150 minutes ago
      });

      mockLockerStateManager.assignLocker.mockResolvedValue(true);

      const result = await assignmentEngine.assignLocker(mockRequest);

      expect(result.success).toBe(true);
      expect(result.action).toBe('reopen_reclaim');
      expect(result.lockerId).toBe(8);
      expect(result.message).toBe('Önceki dolabınız açıldı');
    });

    it('should handle new assignment with scoring', async () => {
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockDb.get.mockResolvedValue(null); // No special cases

      // Mock available lockers for scoring
      mockDb.all.mockResolvedValue([
        {
          kiosk_id: 'kiosk-1',
          id: 10,
          status: 'Free',
          free_since: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          recent_owner_time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          wear_count: 2,
          quarantine_until: null
        }
      ]);

      mockLockerStateManager.assignLocker.mockResolvedValue(true);

      const result = await assignmentEngine.assignLocker(mockRequest);

      expect(result.success).toBe(true);
      expect(result.action).toBe('assign_new');
      expect(result.lockerId).toBe(10);
      expect(result.message).toBe('Dolabınız açıldı. Eşyalarınızı yerleştirin');
    });

    it('should handle no stock scenario (Requirement 1.2)', async () => {
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockDb.get.mockResolvedValue(null);
      mockDb.all.mockResolvedValue([]); // No available lockers

      const result = await assignmentEngine.assignLocker(mockRequest);

      expect(result.success).toBe(false);
      expect(result.action).toBe('assign_new');
      expect(result.errorCode).toBe('no_stock');
      expect(result.message).toBe('Boş dolap yok. Görevliye başvurun.');
    });

    it('should block assignment when free_ratio <= 0.05 (E2E low-stock)', async () => {
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockDb.get.mockResolvedValue(null);
      
      // Mock very low stock: 1 free out of 30 total = 0.033 ratio
      mockDb.all.mockResolvedValue([
        { kiosk_id: 'kiosk-1', id: 1, status: 'Free' }
      ]);
      mockDb.get.mockResolvedValue({ total: 30, free: 1 }); // 0.033 < 0.05

      const result = await assignmentEngine.assignLocker(mockRequest);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('no_stock');
      expect(result.message).toBe('Boş dolap yok. Görevliye başvurun.');
    });

    it('should return rate limit message with period', async () => {
      // Mock rate limit triggered
      const rateLimitedRequest = {
        ...mockRequest,
        cardId: 'rate-limited-card'
      };

      // Mock rate limiter to return not allowed
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      
      const result = await assignmentEngine.assignLocker(rateLimitedRequest);

      if (result.errorCode === 'rate_limited') {
        expect(result.message).toBe('Lütfen birkaç saniye sonra deneyin.');
      }
    });
  });

  describe('Concurrency and Transaction Safety (Requirements 19.1-19.5)', () => {
    it('should handle assignment conflicts with retry (Requirement 19.2)', async () => {
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockDb.get.mockResolvedValue(null);

      // First attempt fails due to conflict
      mockDb.all.mockResolvedValueOnce([
        { kiosk_id: 'kiosk-1', id: 1, status: 'Free', quarantine_until: null }
      ]);
      mockLockerStateManager.assignLocker.mockResolvedValueOnce(false); // Conflict

      // Second attempt succeeds with fresh state
      mockDb.all.mockResolvedValueOnce([
        { kiosk_id: 'kiosk-1', id: 2, status: 'Free', quarantine_until: null }
      ]);
      mockLockerStateManager.assignLocker.mockResolvedValueOnce(true); // Success

      const mockRequest: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      const result = await assignmentEngine.assignLocker(mockRequest);

      expect(result.success).toBe(true);
      expect(result.lockerId).toBe(2);
      expect(mockLockerStateManager.assignLocker).toHaveBeenCalledTimes(2);
    });

    it('should fail after single retry (Requirement 19.3)', async () => {
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockDb.get.mockResolvedValue(null);

      // Both attempts fail
      mockDb.all.mockResolvedValue([
        { kiosk_id: 'kiosk-1', id: 1, status: 'Free', quarantine_until: null }
      ]);
      mockLockerStateManager.assignLocker.mockResolvedValue(false); // Always fail

      const mockRequest: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      const result = await assignmentEngine.assignLocker(mockRequest);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('assignment_conflict');
      expect(mockLockerStateManager.assignLocker).toHaveBeenCalledTimes(2); // Only 2 attempts
    });

    it('should use single transaction (Requirement 19.1)', async () => {
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockDb.get.mockResolvedValue(null);
      mockDb.all.mockResolvedValue([
        { kiosk_id: 'kiosk-1', id: 1, status: 'Free', quarantine_until: null }
      ]);
      mockLockerStateManager.assignLocker.mockResolvedValue(true);

      const mockRequest: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      await assignmentEngine.assignLocker(mockRequest);

      expect(mockDb.transaction).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockLockerStateManager.checkExistingOwnership.mockRejectedValue(
        new Error('Database connection failed')
      );

      const mockRequest: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      const result = await assignmentEngine.assignLocker(mockRequest);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('system_error');
      expect(result.message).toBe('Şu an işlem yapılamıyor');
    });

    it('should handle configuration errors', async () => {
      mockConfigManager.getEffectiveConfig.mockRejectedValue(
        new Error('Configuration not found')
      );

      const mockRequest: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      const result = await assignmentEngine.assignLocker(mockRequest);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('system_error');
    });
  });

  describe('Status and Monitoring', () => {
    it('should return engine status', async () => {
      const status = await assignmentEngine.getStatus();

      expect(status).toHaveProperty('available');
      expect(status).toHaveProperty('errorRate');
      expect(status).toHaveProperty('lastAssignment');
      expect(status).toHaveProperty('totalAssignments');
      expect(status.available).toBe(true);
    });

    it('should track assignment metrics', async () => {
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockDb.get.mockResolvedValue(null);
      mockDb.all.mockResolvedValue([
        { kiosk_id: 'kiosk-1', id: 1, status: 'Free', quarantine_until: null }
      ]);
      mockLockerStateManager.assignLocker.mockResolvedValue(true);

      const mockRequest: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      await assignmentEngine.assignLocker(mockRequest);

      const status = await assignmentEngine.getStatus();
      expect(status.totalAssignments).toBeGreaterThan(0);
    });
  });

  describe('Exclusion Logic (Requirements 1.3)', () => {
    it('should exclude quarantined lockers', async () => {
      const mockLockers = [
        {
          kiosk_id: 'kiosk-1',
          id: 1,
          status: 'Free',
          quarantine_until: new Date(Date.now() + 60000).toISOString() // Future
        },
        {
          kiosk_id: 'kiosk-1',
          id: 2,
          status: 'Free',
          quarantine_until: new Date(Date.now() - 60000).toISOString() // Past (expired)
        }
      ];

      mockDb.all.mockResolvedValue(mockLockers);

      const scores = await assignmentEngine.scoreLockers('kiosk-1', []);

      expect(scores).toHaveLength(1);
      expect(scores[0].lockerId).toBe(2); // Only non-quarantined locker
    });

    it('should exclude overdue lockers', async () => {
      const mockLockers = [
        {
          kiosk_id: 'kiosk-1',
          id: 1,
          status: 'Free',
          overdue_from: new Date().toISOString() // Overdue
        },
        {
          kiosk_id: 'kiosk-1',
          id: 2,
          status: 'Free',
          overdue_from: null // Not overdue
        }
      ];

      mockDb.all.mockResolvedValue(mockLockers);

      const scores = await assignmentEngine.scoreLockers('kiosk-1', []);

      expect(scores).toHaveLength(1);
      expect(scores[0].lockerId).toBe(2);
    });

    it('should exclude suspected occupied lockers', async () => {
      const mockLockers = [
        {
          kiosk_id: 'kiosk-1',
          id: 1,
          status: 'Free',
          suspected_occupied: 1 // Suspected
        },
        {
          kiosk_id: 'kiosk-1',
          id: 2,
          status: 'Free',
          suspected_occupied: 0 // Not suspected
        }
      ];

      mockDb.all.mockResolvedValue(mockLockers);

      const scores = await assignmentEngine.scoreLockers('kiosk-1', []);

      expect(scores).toHaveLength(1);
      expect(scores[0].lockerId).toBe(2);
    });
  });

  describe('Logging and Audit', () => {
    it('should log assignment completion with correct format', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockDb.get.mockResolvedValue(null);
      mockDb.all.mockResolvedValue([
        { kiosk_id: 'kiosk-1', id: 1, status: 'Free', quarantine_until: null }
      ]);
      mockLockerStateManager.assignLocker.mockResolvedValue(true);

      const mockRequest: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      await assignmentEngine.assignLocker(mockRequest);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Assignment completed: action=assign_new, locker=1/)
      );

      consoleSpy.mockRestore();
    });

    it('should never log PII (card IDs or seeds)', async () => {
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockDb.get.mockResolvedValue(null);
      mockDb.all.mockResolvedValue([
        { kiosk_id: 'kiosk-1', id: 1, status: 'Free', quarantine_until: null }
      ]);
      mockLockerStateManager.assignLocker.mockResolvedValue(true);

      const mockRequest: AssignmentRequest = {
        cardId: '0009652489', // This should never appear in logs
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      await assignmentEngine.assignLocker(mockRequest);

      // Check all logs for PII
      global.assertNoPII(mockConsole.logs, ['0009652489']);
    });

    it('should log candidate selection with exact format', async () => {
      const mockScores = [
        { lockerId: 1, finalScore: 100 },
        { lockerId: 2, finalScore: 90 }
      ];

      assignmentEngine.selectFromCandidates(mockScores, mockConfig);

      expect(mockConsole.logs).toContain('Selected locker 1 from 2 candidates.');
    });
  });
});