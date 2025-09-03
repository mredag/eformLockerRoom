/**
 * Integration tests for Wizard Performance Monitoring System
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Database } from 'sqlite3';
import { WizardPerformanceMonitor } from '../../shared/services/wizard-performance-monitor';
import { WizardCacheService } from '../../shared/services/wizard-cache-service';
import { WizardResourceManager } from '../../shared/services/wizard-resource-manager';

// Mock database for testing
const createMockDatabase = () => {
  const mockDb = {
    run: vi.fn((sql, params, callback) => {
      if (callback) callback(null);
      return mockDb;
    }),
    get: vi.fn((sql, params, callback) => {
      if (callback) callback(null, {});
      return mockDb;
    }),
    all: vi.fn((sql, params, callback) => {
      if (callback) callback(null, []);
      return mockDb;
    })
  };
  return mockDb as unknown as Database;
};

describe('Wizard Performance Monitoring Integration', () => {
  let performanceMonitor: WizardPerformanceMonitor;
  let cacheService: WizardCacheService;
  let resourceManager: WizardResourceManager;
  let mockDb: Database;

  beforeEach(async () => {
    mockDb = createMockDatabase();
    performanceMonitor = new WizardPerformanceMonitor(mockDb);
    cacheService = new WizardCacheService();
    resourceManager = new WizardResourceManager();
    
    await performanceMonitor.initialize();
  });

  afterEach(async () => {
    performanceMonitor.shutdown();
    await cacheService.shutdown();
    await resourceManager.shutdown();
  });

  describe('End-to-End Performance Tracking', () => {
    it('should track complete wizard operation flow', async () => {
      const operationId = 'wizard-flow-test';
      
      // Start full wizard operation
      performanceMonitor.startOperation(operationId, 'full_wizard', {
        sessionId: 'test-session',
        userAgent: 'test-browser'
      });

      // Simulate wizard steps
      const steps = [
        { id: 'device-scan', type: 'device_scan' as const, duration: 15000 },
        { id: 'address-config', type: 'address_config' as const, duration: 8000 },
        { id: 'hardware-test', type: 'hardware_test' as const, duration: 12000 },
        { id: 'system-integration', type: 'system_integration' as const, duration: 10000 }
      ];

      for (const step of steps) {
        performanceMonitor.startOperation(step.id, step.type);
        
        // Simulate step execution time
        await new Promise(resolve => setTimeout(resolve, 10));
        
        performanceMonitor.completeOperation(step.id, true);
      }

      // Complete main wizard operation
      performanceMonitor.completeOperation(operationId, true);

      // Verify all operations were tracked
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO wizard_operation_metrics'),
        expect.arrayContaining([operationId, 'full_wizard', expect.any(Number), expect.any(String)])
      );

      // Verify step operations were tracked
      for (const step of steps) {
        expect(mockDb.run).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO wizard_operation_metrics'),
          expect.arrayContaining([step.id, step.type, expect.any(Number), expect.any(String)])
        );
      }
    });

    it('should handle operation failures and generate alerts', async () => {
      const operationId = 'failing-operation';
      const errorMessage = 'Device communication timeout';
      
      performanceMonitor.startOperation(operationId, 'device_scan');
      
      // Simulate a slow operation that would trigger an alert
      const slowDuration = 35000; // Above 30s threshold
      
      // Manually trigger the operation completion with failure
      performanceMonitor.completeOperation(operationId, false, errorMessage);
      
      // Manually trigger threshold check (normally done internally)
      performanceMonitor['checkOperationThresholds']({
        operationId,
        operationType: 'device_scan',
        startTime: Date.now() - slowDuration,
        endTime: Date.now(),
        duration: slowDuration,
        success: false,
        errorMessage
      });

      // Verify operation was recorded as failed
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE wizard_operation_metrics'),
        expect.arrayContaining([expect.any(Number), expect.any(Number), false, errorMessage, operationId])
      );

      // Verify alert was created
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO wizard_performance_alerts'),
        expect.arrayContaining([
          expect.stringContaining('device_scan-slow'),
          'warning',
          'device_scan',
          30000,
          slowDuration,
          expect.stringContaining('exceeding 30000ms threshold')
        ])
      );
    });
  });

  describe('Cache Performance Integration', () => {
    it('should track cache performance and generate optimization recommendations', async () => {
      // Simulate cache usage patterns
      const deviceResults = {
        serialPorts: [{ path: '/dev/ttyUSB0', available: true }],
        modbusDevices: [{ address: 1, type: 'waveshare' }],
        lastScan: Date.now(),
        scanDuration: 5000
      };

      // Cache some data
      cacheService.cacheDeviceDetection('/dev/ttyUSB0', deviceResults);
      cacheService.cacheDeviceDetection('/dev/ttyUSB1', deviceResults);

      // Generate cache hits and misses
      expect(cacheService.getCachedDeviceDetection('/dev/ttyUSB0')).toEqual(deviceResults); // hit
      expect(cacheService.getCachedDeviceDetection('/dev/ttyUSB2')).toBeNull(); // miss
      expect(cacheService.getCachedDeviceDetection('/dev/ttyUSB0')).toEqual(deviceResults); // hit

      const cacheStats = cacheService.getStats();
      
      // Verify cache statistics
      expect(cacheStats.device.totalEntries).toBe(2);
      expect(cacheStats.device.hitRate).toBeGreaterThan(0);
      expect(cacheStats.memoryUsage.total).toBeGreaterThan(0);

      // Test cache optimization
      cacheService.performGarbageCollection();
      
      const optimizedStats = cacheService.getStats();
      expect(optimizedStats).toBeDefined();
    });

    it('should handle cache invalidation and cleanup', async () => {
      // Add cache entries
      cacheService.cacheDeviceDetection('/dev/ttyUSB0', {
        serialPorts: [],
        modbusDevices: [],
        lastScan: Date.now(),
        scanDuration: 1000
      });

      cacheService.cacheWizardSession('session-123', {
        sessionId: 'session-123',
        currentStep: 2,
        cardData: {},
        validationResults: [],
        lastActivity: Date.now()
      });

      // Verify entries exist
      expect(cacheService.getCachedDeviceDetection('/dev/ttyUSB0')).not.toBeNull();
      expect(cacheService.getCachedWizardSession('session-123')).not.toBeNull();

      // Invalidate specific caches
      cacheService.invalidateDeviceCache('/dev/ttyUSB0');
      cacheService.invalidateSessionCache('session-123');

      // Verify entries are removed
      expect(cacheService.getCachedDeviceDetection('/dev/ttyUSB0')).toBeNull();
      expect(cacheService.getCachedWizardSession('session-123')).toBeNull();
    });
  });

  describe('Resource Management Integration', () => {
    it('should manage resource pools and track usage', async () => {
      // Register a mock resource pool
      const mockResourceFactory = vi.fn().mockResolvedValue({
        id: 'mock-resource',
        connected: true
      });

      const pool = resourceManager.registerResourcePool('test-pool', mockResourceFactory, {
        maxSize: 3,
        minSize: 1
      });

      // Acquire resources
      const resource1 = await pool.acquire();
      const resource2 = await pool.acquire();

      expect(mockResourceFactory).toHaveBeenCalledTimes(2);
      expect(resource1).toBeDefined();
      expect(resource2).toBeDefined();

      const stats = pool.stats();
      expect(stats.totalResources).toBe(2);
      expect(stats.activeResources).toBe(2);
      expect(stats.availableResources).toBe(0);

      // Release resources
      pool.release(resource1);
      pool.release(resource2);

      const finalStats = pool.stats();
      expect(finalStats.activeResources).toBe(0);
      expect(finalStats.availableResources).toBe(2);
    });

    it('should handle resource pool overflow and queuing', async () => {
      const mockResourceFactory = vi.fn().mockResolvedValue({
        id: 'mock-resource',
        connected: true
      });

      const pool = resourceManager.registerResourcePool('small-pool', mockResourceFactory, {
        maxSize: 1,
        minSize: 1
      });

      // Acquire the only resource
      const resource1 = await pool.acquire();
      expect(resource1).toBeDefined();

      // Try to acquire another (should be queued)
      const resource2Promise = pool.acquire();
      
      const stats = pool.stats();
      expect(stats.waitingRequests).toBe(1);

      // Release the first resource to fulfill the queued request
      pool.release(resource1);
      
      const resource2 = await resource2Promise;
      expect(resource2).toBeDefined();
    });

    it('should generate resource usage reports and recommendations', async () => {
      // Register some components
      resourceManager.registerComponent('test-component-1', 
        async () => ({ name: 'Component 1' }), 
        { priority: 'high', estimatedSize: 1024 }
      );

      resourceManager.registerComponent('test-component-2', 
        async () => ({ name: 'Component 2' }), 
        { priority: 'low', estimatedSize: 2048 }
      );

      // Load components
      await resourceManager.loadComponent('test-component-1');
      await resourceManager.loadComponent('test-component-2');

      // Generate usage report
      const report = resourceManager.generateUsageReport();

      expect(report.componentStats.totalComponents).toBe(2);
      expect(report.componentStats.loadedComponents).toBe(2);
      expect(report.componentStats.estimatedMemoryUsage).toBe(3072); // 1024 + 2048
      expect(report.memoryUsage.percentage).toBeGreaterThanOrEqual(0);
      expect(report.recommendations).toBeInstanceOf(Array);
    });
  });

  describe('Performance Optimization Recommendations', () => {
    it('should generate recommendations based on performance metrics', async () => {
      // Mock slow operations to trigger recommendations
      vi.mocked(mockDb.all).mockImplementation((sql, params, callback) => {
        if (sql.includes('wizard_operation_metrics')) {
          const operations = [
            { operation_type: 'device_scan', duration_ms: 35000, success: 1 }, // Slow
            { operation_type: 'device_scan', duration_ms: 32000, success: 1 }, // Slow
            { operation_type: 'address_config', duration_ms: 5000, success: 1 }
          ];
          if (callback) callback(null, operations);
        } else if (sql.includes('wizard_resource_snapshots')) {
          const snapshots = [
            { memory_used: 400 * 1024 * 1024, memory_total: 500 * 1024 * 1024, cpu_percentage: 85, network_latency: 1500 },
            { memory_used: 420 * 1024 * 1024, memory_total: 500 * 1024 * 1024, cpu_percentage: 90, network_latency: 1800 }
          ];
          if (callback) callback(null, snapshots);
        }
        return mockDb;
      });

      const recommendations = await performanceMonitor.generateRecommendations();

      expect(recommendations).toHaveLength(2);
      expect(recommendations[0].category).toBe('performance');
      expect(recommendations[0].title).toContain('Device Scanning Performance');
      expect(recommendations[1].title).toContain('Memory Usage');
      
      // Verify recommendations were stored
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO wizard_optimization_recommendations'),
        expect.arrayContaining([
          expect.any(String), // recommendation_id
          'performance',
          expect.any(String), // priority
          expect.stringContaining('Performance'),
          expect.any(String), // description
          expect.any(String), // impact
          expect.any(String), // implementation
          expect.any(String)  // estimated_improvement
        ])
      );
    });

    it('should track recommendation implementation', async () => {
      const recommendationId = 'test-recommendation';
      
      // Add recommendation to internal map
      performanceMonitor['recommendations'].set(recommendationId, {
        id: recommendationId,
        category: 'performance',
        priority: 'high',
        title: 'Test Recommendation',
        description: 'Test description',
        impact: 'Test impact',
        implementation: 'Test implementation',
        estimatedImprovement: '50% improvement',
        timestamp: Date.now()
      });

      await performanceMonitor.implementRecommendation(recommendationId);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE wizard_optimization_recommendations'),
        [recommendationId]
      );
    });
  });

  describe('Alert Management', () => {
    it('should create and manage performance alerts', async () => {
      // Create test alerts
      performanceMonitor['performanceAlerts'].set('alert-1', {
        id: 'alert-1',
        type: 'warning',
        metric: 'memory_usage',
        threshold: 80,
        currentValue: 85,
        message: 'High memory usage detected',
        timestamp: Date.now(),
        acknowledged: false
      });

      performanceMonitor['performanceAlerts'].set('alert-2', {
        id: 'alert-2',
        type: 'error',
        metric: 'cpu_usage',
        threshold: 90,
        currentValue: 95,
        message: 'High CPU usage detected',
        timestamp: Date.now(),
        acknowledged: true
      });

      // Get active alerts (unacknowledged only)
      const activeAlerts = performanceMonitor.getActiveAlerts();
      expect(activeAlerts).toHaveLength(1);
      expect(activeAlerts[0].id).toBe('alert-1');

      // Acknowledge alert
      await performanceMonitor.acknowledgeAlert('alert-1');
      
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE wizard_performance_alerts'),
        ['alert-1']
      );

      // Verify alert is now acknowledged
      expect(performanceMonitor['performanceAlerts'].get('alert-1')?.acknowledged).toBe(true);
    });
  });

  describe('Data Cleanup and Maintenance', () => {
    it('should cleanup old performance data', async () => {
      const retentionDays = 7;
      await performanceMonitor.cleanup(retentionDays);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM wizard_operation_metrics'),
        [expect.any(Number)]
      );
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM wizard_performance_alerts'),
        [expect.any(Number)]
      );
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM wizard_resource_snapshots'),
        [expect.any(Number)]
      );
    });

    it('should handle service shutdown gracefully', async () => {
      const shutdownSpy = vi.fn();
      performanceMonitor.on('shutdown', shutdownSpy);
      cacheService.on('shutdown', shutdownSpy);
      resourceManager.on('shutdown', shutdownSpy);

      performanceMonitor.shutdown();
      await cacheService.shutdown();
      await resourceManager.shutdown();

      expect(shutdownSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('Performance Metrics Calculation', () => {
    it('should calculate comprehensive performance metrics', async () => {
      // Mock database responses with realistic data
      vi.mocked(mockDb.all).mockImplementation((sql, params, callback) => {
        if (sql.includes('wizard_operation_metrics')) {
          const operations = [
            { operation_type: 'device_scan', duration_ms: 15000, success: 1 },
            { operation_type: 'device_scan', duration_ms: 18000, success: 1 },
            { operation_type: 'device_scan', duration_ms: 22000, success: 0 }, // Failed
            { operation_type: 'address_config', duration_ms: 8000, success: 1 },
            { operation_type: 'address_config', duration_ms: 9500, success: 1 },
            { operation_type: 'hardware_test', duration_ms: 12000, success: 1 },
            { operation_type: 'system_integration', duration_ms: 15000, success: 1 },
            { operation_type: 'full_wizard', duration_ms: 120000, success: 1 },
            { operation_type: 'full_wizard', duration_ms: 135000, success: 1 }
          ];
          if (callback) callback(null, operations);
        } else if (sql.includes('wizard_resource_snapshots')) {
          const snapshots = [
            { memory_used: 200 * 1024 * 1024, memory_total: 500 * 1024 * 1024, cpu_percentage: 45, network_latency: 800 },
            { memory_used: 220 * 1024 * 1024, memory_total: 500 * 1024 * 1024, cpu_percentage: 50, network_latency: 900 },
            { memory_used: 240 * 1024 * 1024, memory_total: 500 * 1024 * 1024, cpu_percentage: 55, network_latency: 750 }
          ];
          if (callback) callback(null, snapshots);
        }
        return mockDb;
      });

      const metrics = await performanceMonitor.getCurrentMetrics(24);

      // Verify operation timing metrics
      expect(metrics.deviceScanTime).toEqual([15000, 18000]); // Only successful operations
      expect(metrics.addressConfigTime).toEqual([8000, 9500]);
      expect(metrics.hardwareTestTime).toEqual([12000]);
      expect(metrics.systemIntegrationTime).toEqual([15000]);
      expect(metrics.totalWizardTime).toEqual([120000, 135000]);

      // Verify success rates
      expect(metrics.deviceDetectionSuccessRate).toBeCloseTo(66.67, 1); // 2 out of 3 successful
      expect(metrics.addressConfigSuccessRate).toBe(100); // 2 out of 2 successful
      expect(metrics.hardwareTestSuccessRate).toBe(100); // 1 out of 1 successful
      expect(metrics.wizardCompletionRate).toBe(100); // 2 out of 2 successful

      // Verify resource metrics
      expect(metrics.memoryUsage).toEqual([40, 44, 48]); // Percentages
      expect(metrics.cpuUsage).toEqual([45, 50, 55]);
      expect(metrics.networkLatency).toEqual([800, 900, 750]);
    });
  });
});