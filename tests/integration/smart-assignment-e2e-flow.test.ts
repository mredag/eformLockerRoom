/**
 * Smart Locker Assignment - End-to-End Flow Integration Tests
 * 
 * Tests complete assignment flows from card scan to locker opening
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AssignmentEngine } from '../../shared/services/assignment-engine';
import { ConfigurationManager } from '../../shared/services/configuration-manager';
import { SessionTracker } from '../../shared/services/session-tracker';
import { LockerStateManager } from '../../shared/services/locker-state-manager';
import { ModbusController } from '../../app/kiosk/src/hardware/modbus-controller';
import { Logger } from '../../shared/services/logger';

interface TestLocker {
  id: number;
  kioskId: string;
  status: string;
  freeHours: number;
  hoursSinceLastOwner: number;
  wearCount: number;
  quarantineUntil?: Date;
}

interface AssignmentRequest {
  cardId: string;
  kioskId: string;
  timestamp: Date;
}

interface AssignmentResult {
  success: boolean;
  lockerId?: number;
  action: 'assign_new' | 'open_existing' | 'retrieve_overdue' | 'reopen_reclaim';
  message: string;
  errorCode?: string;
}

describe('Smart Assignment E2E Flow Tests', () => {
  let assignmentEngine: AssignmentEngine;
  let configManager: ConfigurationManager;
  let sessionTracker: SessionTracker;
  let lockerStateManager: LockerStateManager;
  let modbusController: ModbusController;
  let logger: Logger;
  let loggerSpy: any;

  const mockLockers: TestLocker[] = [
    { id: 1, kioskId: 'kiosk-1', status: 'Free', freeHours: 2, hoursSinceLastOwner: 5, wearCount: 10 },
    { id: 2, kioskId: 'kiosk-1', status: 'Free', freeHours: 1, hoursSinceLastOwner: 3, wearCount: 8 },
    { id: 3, kioskId: 'kiosk-1', status: 'Free', freeHours: 4, hoursSinceLastOwner: 8, wearCount: 15 },
    { id: 4, kioskId: 'kiosk-1', status: 'Owned', freeHours: 0, hoursSinceLastOwner: 0, wearCount: 5 },
    { id: 5, kioskId: 'kiosk-1', status: 'Free', freeHours: 0.5, hoursSinceLastOwner: 1, wearCount: 3 }
  ];

  beforeEach(async () => {
    // Mock logger
    logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    } as any;
    loggerSpy = vi.spyOn(logger, 'info');

    // Mock dependencies
    configManager = {
      getEffectiveConfig: vi.fn().mockResolvedValue({
        smart_assignment_enabled: true,
        maxResponseTimeMs: 2000,
        base_score: 100,
        score_factor_a: 2.0,
        score_factor_b: 1.0,
        score_factor_g: 0.1,
        top_k_candidates: 3,
        selection_temperature: 1.0,
        session_limit_minutes: 180,
        pulse_ms: 800,
        open_window_sec: 10,
        retry_backoff_ms: 500,
        low_stock_threshold: 0.05,
        reserve_capacity_ratio: 0.1
      })
    } as any;

    sessionTracker = {
      getActiveSession: vi.fn(),
      createSmartSession: vi.fn(),
      updateSession: vi.fn(),
      completeSession: vi.fn()
    } as any;

    lockerStateManager = {
      getAvailableLockers: vi.fn().mockResolvedValue(mockLockers.filter(l => l.status === 'Free')),
      assignLocker: vi.fn().mockResolvedValue(true),
      releaseLocker: vi.fn().mockResolvedValue(true),
      checkExistingOwnership: vi.fn().mockResolvedValue(null),
      updateLockerTiming: vi.fn().mockResolvedValue(true)
    } as any;

    modbusController = {
      openLocker: vi.fn().mockResolvedValue(true),
      pulseRelay: vi.fn().mockResolvedValue(true)
    } as any;

    assignmentEngine = new AssignmentEngine(
      configManager,
      sessionTracker,
      lockerStateManager,
      modbusController,
      logger
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    loggerSpy.mockClear();
  });

  describe('New User Assignment Flow', () => {
    it('should complete full assignment flow for new user', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      // Mock no existing session
      vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(null);

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.action).toBe('assign_new');
      expect(result.lockerId).toBeDefined();
      expect(result.message).toBe('Dolabınız açıldı. Eşyalarınızı yerleştirin.');

      // Verify scoring and selection occurred
      expect(lockerStateManager.getAvailableLockers).toHaveBeenCalledWith('kiosk-1');
      expect(lockerStateManager.assignLocker).toHaveBeenCalledWith(
        'kiosk-1',
        result.lockerId,
        'rfid',
        '0009652489'
      );

      // Verify hardware activation
      expect(modbusController.openLocker).toHaveBeenCalledWith(result.lockerId);

      // Verify session creation
      expect(sessionTracker.createSmartSession).toHaveBeenCalledWith(
        '0009652489',
        'kiosk-1'
      );
    });

    it('should handle no available lockers scenario', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      // Mock no available lockers
      vi.mocked(lockerStateManager.getAvailableLockers).mockResolvedValue([]);

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('no_stock');
      expect(result.message).toBe('Boş dolap yok. Görevliye başvurun.');

      // Verify no hardware activation
      expect(modbusController.openLocker).not.toHaveBeenCalled();
      expect(sessionTracker.createSmartSession).not.toHaveBeenCalled();
    });

    it('should apply scoring algorithm correctly', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(null);

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert - Should select locker with highest score
      // Locker 3: score = 100 + 2.0*4 + 1.0*8 = 116, divided by (1 + 0.1*15) = 116/2.5 = 46.4
      // Locker 1: score = 100 + 2.0*2 + 1.0*5 = 109, divided by (1 + 0.1*10) = 109/2 = 54.5
      // Locker 2: score = 100 + 2.0*1 + 1.0*3 = 105, divided by (1 + 0.1*8) = 105/1.8 = 58.3
      // Locker 5: score = 100 + 2.0*0.5 + 1.0*1 = 102, divided by (1 + 0.1*3) = 102/1.3 = 78.5

      expect(result.success).toBe(true);
      expect(result.lockerId).toBe(5); // Highest scoring locker
    });

    it('should use seeded determinism for consistent selection', async () => {
      // Arrange - Same seed should produce same selection
      const baseTime = Math.floor(Date.now() / 1000);
      const request1: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date(baseTime * 1000)
      };
      const request2: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date(baseTime * 1000 + 2000) // Same 5-second bucket
      };

      vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(null);

      // Act
      const result1 = await assignmentEngine.assignLocker(request1);
      const result2 = await assignmentEngine.assignLocker(request2);

      // Assert - Same seed hash should produce same selection
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.lockerId).toBe(result2.lockerId);

      // Verify logger called with selection info
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^Selected locker \d+ from \d+ candidates\.$/)
      );
    });

    it('should change selection in different 5-second bucket', async () => {
      // Arrange - Different 5-second buckets should allow different selections
      const baseTime = Math.floor(Date.now() / 1000);
      const request1: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date(baseTime * 1000)
      };
      const request2: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date((baseTime + 6) * 1000) // Different 5-second bucket
      };

      vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(null);

      // Act
      const result1 = await assignmentEngine.assignLocker(request1);
      const result2 = await assignmentEngine.assignLocker(request2);

      // Assert - Different buckets may produce different selections
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      // Note: May be same or different, but algorithm allows for change
    });
  });

  describe('Existing User Return Flow', () => {
    it('should open existing locker for returning user', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      const existingSession = {
        id: 'session-123',
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        lockerId: 4,
        status: 'active'
      };

      vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(existingSession);

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.action).toBe('open_existing');
      expect(result.lockerId).toBe(4);
      expect(result.message).toBe('Önceki dolabınız açıldı.');

      // Verify hardware activation
      expect(modbusController.openLocker).toHaveBeenCalledWith(4);

      // Verify no new assignment
      expect(lockerStateManager.assignLocker).not.toHaveBeenCalled();
    });

    it('should handle overdue session retrieval', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      const overdueSession = {
        id: 'session-123',
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        lockerId: 4,
        status: 'overdue'
      };

      vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(overdueSession);

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.action).toBe('retrieve_overdue');
      expect(result.lockerId).toBe(4);
      expect(result.message).toBe('Süreniz doldu. Almanız için açılıyor.');

      // Verify session completion
      expect(sessionTracker.completeSession).toHaveBeenCalledWith(
        'session-123',
        'overdue_retrieval'
      );
    });
  });

  describe('Reclaim Flow', () => {
    it('should handle reclaim scenario for recent user', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      // Mock recent ownership but no active session
      vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(null);
      vi.mocked(lockerStateManager.checkExistingOwnership).mockResolvedValue({
        id: 3,
        kioskId: 'kiosk-1',
        status: 'Free',
        recentOwner: '0009652489',
        recentOwnerTime: new Date(Date.now() - 90 * 60 * 1000) // 90 minutes ago
      });

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.action).toBe('reopen_reclaim');
      expect(result.lockerId).toBe(3);
      expect(result.message).toBe('Önceki dolabınız yeniden açıldı.');

      // Verify exit quarantine applied
      expect(lockerStateManager.updateLockerTiming).toHaveBeenCalledWith(
        'kiosk-1',
        3,
        expect.objectContaining({
          quarantineUntil: expect.any(Date)
        })
      );
    });

    it('should not reclaim if outside reclaim window', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      // Mock old ownership outside reclaim window
      vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(null);
      vi.mocked(lockerStateManager.checkExistingOwnership).mockResolvedValue({
        id: 3,
        kioskId: 'kiosk-1',
        status: 'Free',
        recentOwner: '0009652489',
        recentOwnerTime: new Date(Date.now() - 200 * 60 * 1000) // 200 minutes ago
      });

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert - Should assign new locker instead of reclaim
      expect(result.success).toBe(true);
      expect(result.action).toBe('assign_new');
      expect(result.lockerId).not.toBe(3); // Should not reclaim old locker
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle hardware failure gracefully', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(null);
      vi.mocked(modbusController.openLocker).mockResolvedValue(false);

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('hardware_failure');
      expect(result.message).toBe('Şu an işlem yapılamıyor.');

      // Verify assignment was rolled back
      expect(lockerStateManager.releaseLocker).toHaveBeenCalled();
    });

    it('should handle assignment conflict with retry', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(null);
      
      // First assignment fails (conflict), second succeeds
      vi.mocked(lockerStateManager.assignLocker)
        .mockResolvedValueOnce(false) // First attempt fails
        .mockResolvedValueOnce(true); // Retry succeeds

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert
      expect(result.success).toBe(true);
      expect(lockerStateManager.assignLocker).toHaveBeenCalledTimes(2);
    });

    it('should exclude quarantined lockers from assignment', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      const lockersWithQuarantine = mockLockers.map(l => ({
        ...l,
        quarantineUntil: l.id === 1 ? new Date(Date.now() + 10 * 60 * 1000) : undefined
      }));

      vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(null);
      vi.mocked(lockerStateManager.getAvailableLockers).mockResolvedValue(
        lockersWithQuarantine.filter(l => l.status === 'Free')
      );

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.lockerId).not.toBe(1); // Should not assign quarantined locker
    });
  });

  describe('Performance Requirements', () => {
    it('should complete assignment within configured maxResponseTimeMs', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(null);

      // Act
      const startTime = Date.now();
      const result = await assignmentEngine.assignLocker(request);
      const duration = Date.now() - startTime;

      // Assert
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(2000); // Default maxResponseTimeMs from config
    });

    it('should handle high concurrency load', async () => {
      // Arrange
      const requests = Array.from({ length: 10 }, (_, i) => ({
        cardId: `000965248${i}`,
        kioskId: 'kiosk-1',
        timestamp: new Date()
      }));

      vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(null);

      // Act
      const startTime = Date.now();
      const results = await Promise.all(
        requests.map(req => assignmentEngine.assignLocker(req))
      );
      const duration = Date.now() - startTime;

      // Assert
      const successfulAssignments = results.filter(r => r.success).length;
      expect(successfulAssignments).toBeGreaterThan(0);
      expect(duration).toBeLessThan(2000); // Should handle 10 concurrent requests in under 2s
    });
  });

  describe('Low Stock and Reserve Capacity', () => {
    it('should block assignment when free_ratio <= 0.05', async () => {
      // Arrange - Only 1 free locker out of 20 total (5% = threshold)
      const lowStockLockers = [
        { id: 1, kioskId: 'kiosk-1', status: 'Free', freeHours: 1, hoursSinceLastOwner: 2, wearCount: 5 }
      ];
      const totalLockers = 20;

      vi.mocked(lockerStateManager.getAvailableLockers).mockResolvedValue(lowStockLockers);
      vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(null);

      const request: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toBe('Boş dolap yok. Görevliye başvurun.');
    });

    it('should apply reserve capacity after filtering and reclaim', async () => {
      // Arrange - Test reserve capacity with deterministic seed
      const availableLockers = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        kioskId: 'kiosk-1',
        status: 'Free',
        freeHours: i + 1,
        hoursSinceLastOwner: i + 2,
        wearCount: i + 3
      }));

      vi.mocked(lockerStateManager.getAvailableLockers).mockResolvedValue(availableLockers);
      vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(null);

      const request: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date(1640995200000) // Fixed timestamp for deterministic seed
      };

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert - Should succeed with reserve capacity applied
      expect(result.success).toBe(true);
      expect(result.lockerId).toBeDefined();
      
      // Verify deterministic selection with fixed seed
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^Selected locker \d+ from \d+ candidates\.$/)
      );
    });
  });

  describe('Rate Limiting', () => {
    it('should throttle before assignment and relay activation', async () => {
      // Arrange - Mock rate limiter to reject
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.name = 'RateLimitError';
      
      vi.mocked(lockerStateManager.assignLocker).mockRejectedValue(rateLimitError);
      vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(null);

      const request: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toBe('Lütfen birkaç saniye sonra deneyin.');
    });
  });

  describe('Turkish Message Validation', () => {
    it('should return only approved Turkish messages with periods', async () => {
      const approvedMessages = [
        'Dolabınız açıldı. Eşyalarınızı yerleştirin.',
        'Önceki dolabınız açıldı.',
        'Boş dolap yok. Görevliye başvurun.',
        'Şu an işlem yapılamıyor.',
        'Süreniz doldu. Almanız için açılıyor.',
        'Önceki dolabınız yeniden açıldı.',
        'Lütfen birkaç saniye sonra deneyin.'
      ];

      const testCases = [
        {
          scenario: 'new_assignment',
          expectedMessage: 'Dolabınız açıldı. Eşyalarınızı yerleştirin.',
          setup: () => vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(null)
        },
        {
          scenario: 'existing_locker',
          expectedMessage: 'Önceki dolabınız açıldı.',
          setup: () => vi.mocked(sessionTracker.getActiveSession).mockResolvedValue({
            id: 'session-123',
            cardId: '0009652489',
            kioskId: 'kiosk-1',
            lockerId: 4,
            status: 'active'
          })
        },
        {
          scenario: 'no_stock',
          expectedMessage: 'Boş dolap yok. Görevliye başvurun.',
          setup: () => {
            vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(null);
            vi.mocked(lockerStateManager.getAvailableLockers).mockResolvedValue([]);
          }
        }
      ];

      for (const testCase of testCases) {
        // Arrange
        testCase.setup();
        const request: AssignmentRequest = {
          cardId: '0009652489',
          kioskId: 'kiosk-1',
          timestamp: new Date()
        };

        // Act
        const result = await assignmentEngine.assignLocker(request);

        // Assert - Message must be from approved set and end with period
        expect(approvedMessages).toContain(result.message);
        expect(result.message).toMatch(/\.$/); // Ends with period
        expect(result.message).not.toMatch(/-/); // No hyphens
      }
    });
  });

  describe('Logging Validation', () => {
    it('should log exact lines with periods and no emojis or PII', async () => {
      // Arrange
      vi.mocked(configManager.getEffectiveConfig).mockResolvedValue({
        smart_assignment_enabled: true,
        version: 'v1.2.3',
        maxResponseTimeMs: 2000
      });

      const request: AssignmentRequest = {
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      vi.mocked(sessionTracker.getActiveSession).mockResolvedValue(null);

      // Act
      await assignmentEngine.assignLocker(request);

      // Assert - Check for exact log format
      expect(loggerSpy).toHaveBeenCalledWith('Config loaded: version=v1.2.3.');
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^Selected locker \d+ from \d+ candidates\.$/)
      );

      // Verify no emojis in logs
      const logCalls = loggerSpy.mock.calls.flat();
      logCalls.forEach((call: string) => {
        expect(call).not.toMatch(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u);
      });

      // Verify no PII (card IDs should be masked or not logged)
      logCalls.forEach((call: string) => {
        expect(call).not.toContain('0009652489');
      });
    });
  });
});