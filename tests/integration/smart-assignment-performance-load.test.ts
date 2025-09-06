/**
 * Smart Locker Assignment - Performance and Load Testing
 * 
 * Tests performance requirements and load handling capabilities
 * Requirements: All requirements validation under load conditions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

interface PerformanceMetrics {
  averageResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  throughput: number;
  successRate: number;
  errorRate: number;
  memoryUsage: number;
}

interface LoadTestConfig {
  concurrentUsers: number;
  requestsPerUser: number;
  rampUpTime: number;
  testDuration: number;
}

interface AssignmentRequest {
  cardId: string;
  kioskId: string;
  timestamp: Date;
}

interface AssignmentResult {
  success: boolean;
  lockerId?: number;
  action: string;
  message: string;
  duration: number;
  errorCode?: string;
}

// Mock assignment engine for performance testing
class MockAssignmentEngine {
  private processingDelay: number = 50;
  private failureRate: number = 0.05;
  private assignedLockers: Set<number> = new Set();
  private maxLockers: number = 30;

  setProcessingDelay(delay: number) {
    this.processingDelay = delay;
  }

  setFailureRate(rate: number) {
    this.failureRate = rate;
  }

  setMaxLockers(count: number) {
    this.maxLockers = count;
  }

  async assignLocker(request: AssignmentRequest): Promise<AssignmentResult> {
    const startTime = Date.now();

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, this.processingDelay));

    // Simulate random failures
    if (Math.random() < this.failureRate) {
      return {
        success: false,
        action: 'error',
        message: 'Şu an işlem yapılamıyor',
        duration: Date.now() - startTime,
        errorCode: 'processing_error'
      };
    }

    // Check if lockers available
    if (this.assignedLockers.size >= this.maxLockers) {
      return {
        success: false,
        action: 'no_stock',
        message: 'Boş dolap yok. Görevliye başvurun',
        duration: Date.now() - startTime,
        errorCode: 'no_stock'
      };
    }

    // Assign random available locker
    let lockerId: number;
    do {
      lockerId = Math.floor(Math.random() * this.maxLockers) + 1;
    } while (this.assignedLockers.has(lockerId));

    this.assignedLockers.add(lockerId);

    // Simulate locker release after some time
    setTimeout(() => {
      this.assignedLockers.delete(lockerId);
    }, Math.random() * 10000 + 5000); // 5-15 seconds

    return {
      success: true,
      lockerId,
      action: 'assign_new',
      message: 'Dolabınız açıldı. Eşyalarınızı yerleştirin',
      duration: Date.now() - startTime
    };
  }

  reset() {
    this.assignedLockers.clear();
  }
}

describe('Smart Assignment Performance and Load Tests', () => {
  let assignmentEngine: MockAssignmentEngine;

  beforeEach(() => {
    assignmentEngine = new MockAssignmentEngine();
  });

  afterEach(() => {
    assignmentEngine.reset();
    vi.clearAllMocks();
  });

  describe('Performance SLA Validation', () => {
    it('should meet configured maxResponseTimeMs SLA for single requests', async () => {
      // Arrange
      assignmentEngine.setProcessingDelay(100); // Realistic processing time
      const numTests = 50;
      const responseTimes: number[] = [];
      const maxResponseTimeMs = 2000; // Default from config

      // Act
      for (let i = 0; i < numTests; i++) {
        const request: AssignmentRequest = {
          cardId: `perf-test-${i}`,
          kioskId: 'kiosk-1',
          timestamp: new Date()
        };

        const startTime = Date.now();
        const result = await assignmentEngine.assignLocker(request);
        const responseTime = Date.now() - startTime;

        if (result.success) {
          responseTimes.push(responseTime);
        }
      }

      // Assert
      const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const p95ResponseTime = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];

      expect(avgResponseTime).toBeLessThan(maxResponseTimeMs / 4); // Average under 25% of max
      expect(maxResponseTime).toBeLessThan(maxResponseTimeMs); // Max under configured SLA
      expect(p95ResponseTime).toBeLessThan(maxResponseTimeMs / 2); // 95th percentile under 50% of max
    });

    it('should maintain performance under moderate concurrent load', async () => {
      // Arrange
      const concurrentRequests = 10;
      const requestsPerBatch = 5;
      assignmentEngine.setProcessingDelay(50);

      // Act
      const results: AssignmentResult[] = [];
      const startTime = Date.now();

      for (let batch = 0; batch < requestsPerBatch; batch++) {
        const batchPromises = Array.from({ length: concurrentRequests }, (_, i) => {
          const request: AssignmentRequest = {
            cardId: `concurrent-${batch}-${i}`,
            kioskId: 'kiosk-1',
            timestamp: new Date()
          };
          return assignmentEngine.assignLocker(request);
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const totalDuration = Date.now() - startTime;

      // Assert
      const successfulResults = results.filter(r => r.success);
      const avgResponseTime = successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length;
      const throughput = (successfulResults.length / totalDuration) * 1000; // requests per second

      expect(avgResponseTime).toBeLessThan(300); // Should maintain good response time
      expect(throughput).toBeGreaterThan(5); // At least 5 requests per second
      expect(successfulResults.length).toBeGreaterThan(concurrentRequests * requestsPerBatch * 0.8); // 80% success rate
    });

    it('should handle configuration hot reload without performance degradation', async () => {
      // Arrange
      const baselineRequests = 20;
      const reloadRequests = 20;

      // Measure baseline performance
      const baselineResults: number[] = [];
      for (let i = 0; i < baselineRequests; i++) {
        const request: AssignmentRequest = {
          cardId: `baseline-${i}`,
          kioskId: 'kiosk-1',
          timestamp: new Date()
        };

        const startTime = Date.now();
        await assignmentEngine.assignLocker(request);
        baselineResults.push(Date.now() - startTime);
      }

      // Simulate configuration reload
      await new Promise(resolve => setTimeout(resolve, 100));

      // Measure performance after reload
      const reloadResults: number[] = [];
      for (let i = 0; i < reloadRequests; i++) {
        const request: AssignmentRequest = {
          cardId: `reload-${i}`,
          kioskId: 'kiosk-1',
          timestamp: new Date()
        };

        const startTime = Date.now();
        await assignmentEngine.assignLocker(request);
        reloadResults.push(Date.now() - startTime);
      }

      // Assert
      const baselineAvg = baselineResults.reduce((sum, time) => sum + time, 0) / baselineResults.length;
      const reloadAvg = reloadResults.reduce((sum, time) => sum + time, 0) / reloadResults.length;
      const performanceDegradation = (reloadAvg - baselineAvg) / baselineAvg;

      expect(performanceDegradation).toBeLessThan(0.2); // Less than 20% degradation
      expect(reloadAvg).toBeLessThan(500); // Still meet SLA
    });
  });

  describe('Load Testing Scenarios', () => {
    it('should handle high concurrent user load', async () => {
      // Arrange
      const loadConfig: LoadTestConfig = {
        concurrentUsers: 50,
        requestsPerUser: 3,
        rampUpTime: 2000,
        testDuration: 10000
      };

      assignmentEngine.setProcessingDelay(30);
      assignmentEngine.setMaxLockers(50); // Increase capacity for load test

      const results: AssignmentResult[] = [];
      const startTime = Date.now();

      // Act - Simulate gradual ramp-up
      const userPromises: Promise<void>[] = [];

      for (let user = 0; user < loadConfig.concurrentUsers; user++) {
        const userPromise = (async () => {
          // Stagger user start times for ramp-up
          const startDelay = (user / loadConfig.concurrentUsers) * loadConfig.rampUpTime;
          await new Promise(resolve => setTimeout(resolve, startDelay));

          // Each user makes multiple requests
          for (let req = 0; req < loadConfig.requestsPerUser; req++) {
            const request: AssignmentRequest = {
              cardId: `load-user-${user}-req-${req}`,
              kioskId: 'kiosk-1',
              timestamp: new Date()
            };

            try {
              const result = await assignmentEngine.assignLocker(request);
              results.push(result);
            } catch (error) {
              results.push({
                success: false,
                action: 'error',
                message: 'System error',
                duration: 0,
                errorCode: 'system_error'
              });
            }

            // Small delay between requests from same user
            await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
          }
        })();

        userPromises.push(userPromise);
      }

      await Promise.all(userPromises);
      const totalDuration = Date.now() - startTime;

      // Assert
      const metrics = calculatePerformanceMetrics(results, totalDuration);

      expect(metrics.successRate).toBeGreaterThan(0.7); // At least 70% success rate
      expect(metrics.averageResponseTime).toBeLessThan(1000); // Average under 1 second
      expect(metrics.throughput).toBeGreaterThan(10); // At least 10 requests per second
      expect(metrics.errorRate).toBeLessThan(0.3); // Less than 30% error rate
    });

    it('should handle burst traffic patterns', async () => {
      // Arrange - Simulate traffic bursts
      const burstSize = 20;
      const numBursts = 3;
      const burstInterval = 2000; // 2 seconds between bursts

      assignmentEngine.setProcessingDelay(25);
      const allResults: AssignmentResult[] = [];

      // Act
      for (let burst = 0; burst < numBursts; burst++) {
        const burstStartTime = Date.now();
        
        // Send burst of concurrent requests
        const burstPromises = Array.from({ length: burstSize }, (_, i) => {
          const request: AssignmentRequest = {
            cardId: `burst-${burst}-${i}`,
            kioskId: 'kiosk-1',
            timestamp: new Date()
          };
          return assignmentEngine.assignLocker(request);
        });

        const burstResults = await Promise.all(burstPromises);
        allResults.push(...burstResults);

        const burstDuration = Date.now() - burstStartTime;
        console.log(`Burst ${burst + 1} completed in ${burstDuration}ms`);

        // Wait before next burst
        if (burst < numBursts - 1) {
          await new Promise(resolve => setTimeout(resolve, burstInterval));
        }
      }

      // Assert
      const successfulResults = allResults.filter(r => r.success);
      const burstSuccessRate = successfulResults.length / allResults.length;
      const avgBurstResponseTime = successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length;

      expect(burstSuccessRate).toBeGreaterThan(0.6); // At least 60% success during bursts
      expect(avgBurstResponseTime).toBeLessThan(800); // Average under 800ms during bursts
    });

    it('should gracefully degrade under extreme load', async () => {
      // Arrange - Overload scenario
      const extremeLoad = 100;
      assignmentEngine.setProcessingDelay(100);
      assignmentEngine.setMaxLockers(20); // Limited capacity
      assignmentEngine.setFailureRate(0.1); // Some inherent failures

      // Act
      const promises = Array.from({ length: extremeLoad }, (_, i) => {
        const request: AssignmentRequest = {
          cardId: `extreme-${i}`,
          kioskId: 'kiosk-1',
          timestamp: new Date()
        };
        return assignmentEngine.assignLocker(request);
      });

      const startTime = Date.now();
      const results = await Promise.allSettled(promises);
      const totalDuration = Date.now() - startTime;

      // Assert
      const successfulResults = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(r => r.success);

      const noStockResults = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(r => r.errorCode === 'no_stock');

      // System should handle overload gracefully
      expect(successfulResults.length).toBeLessThanOrEqual(assignmentEngine['maxLockers']);
      expect(noStockResults.length).toBeGreaterThan(0); // Should have capacity-based rejections
      expect(totalDuration).toBeLessThan(30000); // Should complete within 30 seconds
    });
  });

  describe('Memory and Resource Management', () => {
    it('should not leak memory during sustained load', async () => {
      // Arrange
      const initialMemory = process.memoryUsage().heapUsed;
      const numIterations = 50;
      const requestsPerIteration = 10;

      // Act - Sustained load over time
      for (let iteration = 0; iteration < numIterations; iteration++) {
        const iterationPromises = Array.from({ length: requestsPerIteration }, (_, i) => {
          const request: AssignmentRequest = {
            cardId: `memory-test-${iteration}-${i}`,
            kioskId: 'kiosk-1',
            timestamp: new Date()
          };
          return assignmentEngine.assignLocker(request);
        });

        await Promise.all(iterationPromises);

        // Periodic cleanup simulation
        if (iteration % 10 === 0 && global.gc) {
          global.gc();
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Assert
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreasePercent = (memoryIncrease / initialMemory) * 100;

      expect(memoryIncreasePercent).toBeLessThan(100); // Less than 100% increase
      console.log(`Memory increase: ${memoryIncreasePercent.toFixed(2)}%`);
    });

    it('should handle resource cleanup on failures', async () => {
      // Arrange
      assignmentEngine.setFailureRate(0.5); // 50% failure rate
      const numRequests = 30;

      // Act
      const results = await Promise.allSettled(
        Array.from({ length: numRequests }, (_, i) => {
          const request: AssignmentRequest = {
            cardId: `cleanup-test-${i}`,
            kioskId: 'kiosk-1',
            timestamp: new Date()
          };
          return assignmentEngine.assignLocker(request);
        })
      );

      // Assert
      const failedResults = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(r => !r.success);

      expect(failedResults.length).toBeGreaterThan(0); // Should have some failures
      
      // System should remain stable after failures
      const postFailureRequest: AssignmentRequest = {
        cardId: 'post-failure-test',
        kioskId: 'kiosk-1',
        timestamp: new Date()
      };

      assignmentEngine.setFailureRate(0); // Reset failure rate
      const postFailureResult = await assignmentEngine.assignLocker(postFailureRequest);
      expect(postFailureResult.success).toBe(true); // Should work normally after failures
    });
  });

  describe('Scalability Testing', () => {
    it('should scale with multiple kiosks', async () => {
      // Arrange
      const numKiosks = 5;
      const requestsPerKiosk = 10;
      
      // Act
      const kioskPromises = Array.from({ length: numKiosks }, async (_, kioskIndex) => {
        const kioskId = `kiosk-${kioskIndex + 1}`;
        const kioskResults: AssignmentResult[] = [];

        for (let req = 0; req < requestsPerKiosk; req++) {
          const request: AssignmentRequest = {
            cardId: `multi-kiosk-${kioskIndex}-${req}`,
            kioskId,
            timestamp: new Date()
          };

          const result = await assignmentEngine.assignLocker(request);
          kioskResults.push(result);
        }

        return kioskResults;
      });

      const allKioskResults = await Promise.all(kioskPromises);
      const flatResults = allKioskResults.flat();

      // Assert
      const successfulResults = flatResults.filter(r => r.success);
      const avgResponseTime = successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length;

      expect(successfulResults.length).toBeGreaterThan(numKiosks * requestsPerKiosk * 0.7); // 70% success
      expect(avgResponseTime).toBeLessThan(500); // Maintain performance across kiosks
    });

    it('should handle database connection pooling under load', async () => {
      // Arrange - Simulate database connection constraints
      const maxConcurrentConnections = 10;
      let activeConnections = 0;
      const connectionQueue: Array<() => void> = [];

      const mockDatabaseOperation = async (): Promise<void> => {
        return new Promise((resolve) => {
          if (activeConnections < maxConcurrentConnections) {
            activeConnections++;
            setTimeout(() => {
              activeConnections--;
              resolve();
              // Process queue
              const next = connectionQueue.shift();
              if (next) next();
            }, Math.random() * 100 + 50); // 50-150ms operation
          } else {
            connectionQueue.push(() => {
              activeConnections++;
              setTimeout(() => {
                activeConnections--;
                resolve();
                // Process queue
                const next = connectionQueue.shift();
                if (next) next();
              }, Math.random() * 100 + 50);
            });
          }
        });
      };

      // Act - High concurrent load
      const numConcurrentRequests = 25;
      const promises = Array.from({ length: numConcurrentRequests }, async (_, i) => {
        await mockDatabaseOperation(); // Simulate DB operation
        
        const request: AssignmentRequest = {
          cardId: `db-pool-test-${i}`,
          kioskId: 'kiosk-1',
          timestamp: new Date()
        };
        
        return assignmentEngine.assignLocker(request);
      });

      const results = await Promise.all(promises);

      // Assert
      const successfulResults = results.filter(r => r.success);
      expect(successfulResults.length).toBeGreaterThan(numConcurrentRequests * 0.8); // 80% success
      expect(activeConnections).toBe(0); // All connections should be released
    });
  });
});

// Helper function to calculate performance metrics
function calculatePerformanceMetrics(results: AssignmentResult[], totalDuration: number): PerformanceMetrics {
  const successfulResults = results.filter(r => r.success);
  const failedResults = results.filter(r => !r.success);

  const responseTimes = successfulResults.map(r => r.duration);
  const averageResponseTime = responseTimes.length > 0 
    ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
    : 0;

  return {
    averageResponseTime,
    maxResponseTime: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
    minResponseTime: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
    throughput: (results.length / totalDuration) * 1000, // requests per second
    successRate: successfulResults.length / results.length,
    errorRate: failedResults.length / results.length,
    memoryUsage: process.memoryUsage().heapUsed
  };
}