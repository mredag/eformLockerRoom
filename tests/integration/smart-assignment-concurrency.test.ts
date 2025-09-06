/**
 * Smart Locker Assignment - Concurrency and Race Condition Tests
 * 
 * Tests concurrent assignment scenarios and race condition handling
 * Requirements: 19.1, 19.2, 19.3, 19.4, 19.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AssignmentEngine } from '../../shared/services/assignment-engine';
import { LockerStateManager } from '../../shared/services/locker-state-manager';
import { ConfigurationManager } from '../../shared/services/configuration-manager';
import { SessionTracker } from '../../shared/services/session-tracker';

interface AssignmentRequest {
  cardId: string;
  kioskId: string;
  timestamp: Date;
}

interface ConcurrencyTestResult {
  cardId: string;
  success: boolean;
  lockerId?: number;
  duration: number;
  error?: string;
}

describe('Smart Assignment Concurrency Tests', () => {
  let assignmentEngine: AssignmentEngine;
  let lockerStateManager: LockerStateManager;
  let configManager: ConfigurationManager;
  let sessionTracker: SessionTracker;

  const mockLockers = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    kioskId: 'kiosk-1',
    status: 'Free',
    freeHours: Math.random() * 5,
    hoursSinceLastOwner: Math.random() * 10,
    wearCount: Math.floor(Math.random() * 20)
  }));

  beforeEach(async () => {
    // Mock configuration manager
    configManager = {
      getEffectiveConfig: vi.fn().mockResolvedValue({
        smart_assignment_enabled: true,
        base_score: 100,
        score_factor_a: 2.0,
        score_factor_b: 1.0,
        score_factor_g: 0.1,
        top_k_candidates: 3,
        selection_temperature: 1.0
      })
    } as any;

    // Mock session tracker
    sessionTracker = {
      getActiveSession: vi.fn().mockResolvedValue(null),
      createSmartSession: vi.fn().mockResolvedValue({
        id: 'session-123',
        cardId: 'test-card',
        kioskId: 'kiosk-1'
      })
    } as any;

    // Mock locker state manager with concurrency simulation
    lockerStateManager = {
      getAvailableLockers: vi.fn().mockResolvedValue([...mockLockers]),
      assignLocker: vi.fn(),
      releaseLocker: vi.fn().mockResolvedValue(true),
      checkExistingOwnership: vi.fn().mockResolvedValue(null)
    } as any;

    assignmentEngine = new AssignmentEngine(
      configManager,
      sessionTracker,
      lockerStateManager,
      {} as any // Mock hardware controller
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Concurrent Assignment Scenarios', () => {
    it('should handle multiple simultaneous assignments without conflicts', async () => {
      // Arrange
      const numConcurrentUsers = 5;
      const requests: AssignmentRequest[] = Array.from({ length: numConcurrentUsers }, (_, i) => ({
        cardId: `card-${i + 1}`,
        kioskId: 'kiosk-1',
        timestamp: new Date()
      }));

      // Mock successful assignments with different lockers
      let assignmentCount = 0;
      vi.mocked(lockerStateManager.assignLocker).mockImplementation(async (kioskId, lockerId, ownerType, ownerKey) => {
        assignmentCount++;
        // Simulate some assignments succeeding, some failing due to conflicts
        return assignmentCount <= 3; // First 3 succeed, others fail initially
      });

      // Act
      const startTime = Date.now();
      const results = await Promise.allSettled(
        requests.map(async (request) => {
          const result = await assignmentEngine.assignLocker(request);
          return {
            cardId: request.cardId,
            success: result.success,
            lockerId: result.lockerId,
            duration: Date.now() - startTime
          };
        })
      );

      // Assert
      const successfulResults = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(r => r.success);

      expect(successfulResults.length).toBeGreaterThan(0);
      expect(successfulResults.length).toBeLessThanOrEqual(numConcurrentUsers);

      // Verify no duplicate locker assignments
      const assignedLockers = successfulResults.map(r => r.lockerId).filter(Boolean);
      const uniqueLockers = new Set(assignedLockers);
      expect(uniqueLockers.size).toBe(assignedLockers.length);
    });

    it('should handle assignment conflicts with single retry', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: 'test-card',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      // Mock assignment conflict on first attempt, success on retry
      vi.mocked(lockerStateManager.assignLocker)
        .mockResolvedValueOnce(false) // First attempt fails (conflict)
        .mockResolvedValueOnce(true); // Retry succeeds

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert
      expect(result.success).toBe(true);
      expect(lockerStateManager.assignLocker).toHaveBeenCalledTimes(2);
    });

    it('should fail after exactly one retry on persistent conflicts', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: 'test-card',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      // Mock persistent assignment conflicts
      vi.mocked(lockerStateManager.assignLocker).mockResolvedValue(false);

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toBe('Şu an işlem yapılamıyor.');
      expect(lockerStateManager.assignLocker).toHaveBeenCalledTimes(2); // Original + 1 retry only
      
      // Verify no duplicate selection logging
      const logCalls = vi.mocked(console.log).mock.calls;
      const selectionLogs = logCalls.filter(call => 
        call[0]?.includes?.('Selected locker') || call[0]?.includes?.('selection')
      );
      expect(selectionLogs.length).toBeLessThanOrEqual(1); // Should not log selection twice
    });

    it('should use fresh locker state on retry', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: 'test-card',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      // Mock different available lockers on retry
      const initialLockers = mockLockers.slice(0, 5);
      const retryLockers = mockLockers.slice(2, 7); // Different set

      vi.mocked(lockerStateManager.getAvailableLockers)
        .mockResolvedValueOnce(initialLockers)
        .mockResolvedValueOnce(retryLockers);

      vi.mocked(lockerStateManager.assignLocker)
        .mockResolvedValueOnce(false) // First attempt fails
        .mockResolvedValueOnce(true); // Retry succeeds

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert
      expect(result.success).toBe(true);
      expect(lockerStateManager.getAvailableLockers).toHaveBeenCalledTimes(2);
    });
  });

  describe('Transaction Safety', () => {
    it('should wrap assignment in single database transaction', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: 'test-card',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      // Mock database transaction
      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        return await callback();
      });

      // Mock locker state manager with transaction support
      const transactionalLockerManager = {
        ...lockerStateManager,
        transaction: mockTransaction,
        assignLocker: vi.fn().mockResolvedValue(true)
      };

      const transactionalEngine = new AssignmentEngine(
        configManager,
        sessionTracker,
        transactionalLockerManager as any,
        {} as any
      );

      // Act
      await transactionalEngine.assignLocker(request);

      // Assert
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('should rollback on assignment failure', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: 'test-card',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      // Mock assignment failure
      vi.mocked(lockerStateManager.assignLocker).mockRejectedValue(new Error('Database error'));

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('database_error');

      // Verify rollback occurred (no session created)
      expect(sessionTracker.createSmartSession).not.toHaveBeenCalled();
    });

    it('should handle optimistic locking conflicts', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: 'test-card',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      // Mock optimistic locking conflict
      const optimisticLockError = new Error('Optimistic lock conflict');
      optimisticLockError.name = 'OptimisticLockError';

      vi.mocked(lockerStateManager.assignLocker)
        .mockRejectedValueOnce(optimisticLockError) // First attempt fails
        .mockResolvedValueOnce(true); // Retry succeeds

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert
      expect(result.success).toBe(true);
      expect(lockerStateManager.assignLocker).toHaveBeenCalledTimes(2);
    });
  });

  describe('High Load Scenarios', () => {
    it('should maintain performance under high concurrent load', async () => {
      // Arrange
      const numConcurrentRequests = 20;
      const requests: AssignmentRequest[] = Array.from({ length: numConcurrentRequests }, (_, i) => ({
        cardId: `load-test-card-${i}`,
        kioskId: 'kiosk-1',
        timestamp: new Date()
      }));

      // Mock realistic assignment success rate (80%)
      vi.mocked(lockerStateManager.assignLocker).mockImplementation(async () => {
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
        return Math.random() > 0.2; // 80% success rate
      });

      // Act
      const startTime = Date.now();
      const results = await Promise.allSettled(
        requests.map(async (request): Promise<ConcurrencyTestResult> => {
          const requestStart = Date.now();
          try {
            const result = await assignmentEngine.assignLocker(request);
            return {
              cardId: request.cardId,
              success: result.success,
              lockerId: result.lockerId,
              duration: Date.now() - requestStart
            };
          } catch (error) {
            return {
              cardId: request.cardId,
              success: false,
              duration: Date.now() - requestStart,
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        })
      );

      const totalDuration = Date.now() - startTime;

      // Assert
      const successfulResults = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(r => r.success);

      expect(successfulResults.length).toBeGreaterThan(numConcurrentRequests * 0.5); // At least 50% success
      expect(totalDuration).toBeLessThan(5000); // Complete within 5 seconds

      // Verify individual request performance
      const avgDuration = successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length;
      expect(avgDuration).toBeLessThan(1000); // Average under 1 second per request
    });

    it('should handle burst traffic patterns', async () => {
      // Arrange - Simulate burst of requests followed by quiet period
      const burstSize = 10;
      const burstRequests: AssignmentRequest[] = Array.from({ length: burstSize }, (_, i) => ({
        cardId: `burst-card-${i}`,
        kioskId: 'kiosk-1',
        timestamp: new Date()
      }));

      vi.mocked(lockerStateManager.assignLocker).mockResolvedValue(true);

      // Act - Send burst of requests
      const burstStartTime = Date.now();
      const burstResults = await Promise.all(
        burstRequests.map(request => assignmentEngine.assignLocker(request))
      );
      const burstDuration = Date.now() - burstStartTime;

      // Wait for quiet period
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send single request after burst
      const singleRequest: AssignmentRequest = {
        cardId: 'post-burst-card',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      const singleStartTime = Date.now();
      const singleResult = await assignmentEngine.assignLocker(singleRequest);
      const singleDuration = Date.now() - singleStartTime;

      // Assert
      const successfulBurstResults = burstResults.filter(r => r.success);
      expect(successfulBurstResults.length).toBeGreaterThan(burstSize * 0.7); // At least 70% success in burst
      expect(burstDuration).toBeLessThan(3000); // Burst completes within 3 seconds

      expect(singleResult.success).toBe(true);
      expect(singleDuration).toBeLessThan(500); // Single request fast after burst
    });

    it('should prevent resource exhaustion under extreme load', async () => {
      // Arrange - More requests than available lockers
      const numRequests = mockLockers.length * 2; // 2x oversubscription
      const requests: AssignmentRequest[] = Array.from({ length: numRequests }, (_, i) => ({
        cardId: `overload-card-${i}`,
        kioskId: 'kiosk-1',
        timestamp: new Date()
      }));

      // Mock realistic locker availability
      let assignedCount = 0;
      vi.mocked(lockerStateManager.assignLocker).mockImplementation(async () => {
        if (assignedCount < mockLockers.length) {
          assignedCount++;
          return true;
        }
        return false; // No more lockers available
      });

      // Act
      const results = await Promise.allSettled(
        requests.map(request => assignmentEngine.assignLocker(request))
      );

      // Assert
      const successfulResults = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(r => r.success);

      const failedResults = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(r => !r.success);

      expect(successfulResults.length).toBeLessThanOrEqual(mockLockers.length);
      expect(failedResults.length).toBeGreaterThan(0);
      expect(successfulResults.length + failedResults.length).toBe(numRequests);
    });
  });

  describe('Deadlock Prevention', () => {
    it('should prevent deadlocks in concurrent locker access', async () => {
      // Arrange - Two users trying to access same locker simultaneously
      const request1: AssignmentRequest = {
        cardId: 'card-1',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      const request2: AssignmentRequest = {
        cardId: 'card-2',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      // Mock locker manager to simulate potential deadlock scenario
      let lockAcquired = false;
      vi.mocked(lockerStateManager.assignLocker).mockImplementation(async (kioskId, lockerId, ownerType, ownerKey) => {
        if (lockAcquired) {
          return false; // Second request fails
        }
        
        // Simulate lock acquisition delay
        await new Promise(resolve => setTimeout(resolve, 10));
        lockAcquired = true;
        return true;
      });

      // Act - Send concurrent requests
      const [result1, result2] = await Promise.all([
        assignmentEngine.assignLocker(request1),
        assignmentEngine.assignLocker(request2)
      ]);

      // Assert - One should succeed, one should fail (no deadlock)
      const results = [result1, result2];
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      expect(successCount).toBe(1);
      expect(failCount).toBe(1);
    });

    it('should timeout long-running transactions', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: 'timeout-card',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      // Mock long-running assignment
      vi.mocked(lockerStateManager.assignLocker).mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay
        return true;
      });

      // Act
      const startTime = Date.now();
      const result = await assignmentEngine.assignLocker(request);
      const duration = Date.now() - startTime;

      // Assert - Should timeout before 10 seconds
      expect(duration).toBeLessThan(5000); // Should timeout within 5 seconds
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('timeout');
    });
  });

  describe('Memory and Resource Management', () => {
    it('should not leak memory during concurrent operations', async () => {
      // Arrange
      const initialMemory = process.memoryUsage().heapUsed;
      const numIterations = 100;

      // Act - Perform many concurrent operations
      for (let i = 0; i < numIterations; i++) {
        const requests: AssignmentRequest[] = Array.from({ length: 5 }, (_, j) => ({
          cardId: `memory-test-${i}-${j}`,
          kioskId: 'kiosk-1',
          timestamp: new Date()
        }));

        await Promise.all(requests.map(request => assignmentEngine.assignLocker(request)));
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Assert
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreasePercent = (memoryIncrease / initialMemory) * 100;

      // Memory increase should be reasonable (less than 50% increase)
      expect(memoryIncreasePercent).toBeLessThan(50);
    });

    it('should clean up resources on assignment failure', async () => {
      // Arrange
      const request: AssignmentRequest = {
        cardId: 'cleanup-test',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      // Mock assignment failure
      vi.mocked(lockerStateManager.assignLocker).mockRejectedValue(new Error('Assignment failed'));

      // Act
      const result = await assignmentEngine.assignLocker(request);

      // Assert
      expect(result.success).toBe(false);

      // Verify cleanup occurred
      expect(sessionTracker.createSmartSession).not.toHaveBeenCalled();
      expect(lockerStateManager.releaseLocker).not.toHaveBeenCalled(); // No locker to release
    });
  });
});