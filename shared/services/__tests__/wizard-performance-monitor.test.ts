/**
 * Unit tests for Wizard Performance Monitor
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Database } from 'sqlite3';
import { WizardPerformanceMonitor } from '../wizard-performance-monitor';

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

describe('WizardPerformanceMonitor', () => {
  let monitor: WizardPerformanceMonitor;
  let mockDb: Database;

  beforeEach(async () => {
    mockDb = createMockDatabase();
    monitor = new WizardPerformanceMonitor(mockDb);
    await monitor.initialize();
  });

  afterEach(() => {
    monitor.shutdown();
  });

  it('should initialize performance monitoring tables', async () => {
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS wizard_operation_metrics'),
      undefined
    );
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS wizard_performance_alerts'),
      undefined
    );
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS wizard_resource_snapshots'),
      undefined
    );
  });

  it('should start and complete operation tracking', () => {
    const operationId = 'test-operation-1';
    const operationType = 'device_scan';
    const metadata = { port: '/dev/ttyUSB0' };

    monitor.startOperation(operationId, operationType, metadata);

    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO wizard_operation_metrics'),
      [operationId, operationType, expect.any(Number), JSON.stringify(metadata)]
    );

    monitor.completeOperation(operationId, true);

    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE wizard_operation_metrics'),
      [expect.any(Number), expect.any(Number), true, undefined, operationId]
    );
  });

  it('should handle operation completion with error', () => {
    const operationId = 'test-operation-2';
    const errorMessage = 'Device not found';

    monitor.startOperation(operationId, 'device_scan');
    monitor.completeOperation(operationId, false, errorMessage);

    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE wizard_operation_metrics'),
      [expect.any(Number), expect.any(Number), false, errorMessage, operationId]
    );
  });

  it('should record resource usage snapshots', async () => {
    const snapshot = {
      timestamp: Date.now(),
      memoryUsage: {
        used: 100 * 1024 * 1024, // 100MB
        free: 50 * 1024 * 1024,  // 50MB
        total: 150 * 1024 * 1024, // 150MB
        percentage: 66.7
      },
      cpuUsage: {
        user: 1000,
        system: 500,
        idle: 8500,
        percentage: 15
      },
      networkStats: {
        latency: 100,
        throughput: 1000,
        errors: 0
      }
    };

    await monitor.recordResourceUsage(snapshot);

    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO wizard_resource_snapshots'),
      [
        snapshot.timestamp,
        snapshot.memoryUsage.used,
        snapshot.memoryUsage.total,
        snapshot.cpuUsage.percentage,
        snapshot.networkStats.latency,
        0 // active operations
      ]
    );
  });

  it('should generate performance recommendations', async () => {
    // Mock database responses for metrics calculation
    vi.mocked(mockDb.all).mockImplementation((sql, params, callback) => {
      if (sql.includes('wizard_operation_metrics')) {
        const operations = [
          { operation_type: 'device_scan', duration_ms: 35000, success: 1 }, // Slow scan
          { operation_type: 'device_scan', duration_ms: 32000, success: 1 },
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

    const recommendations = await monitor.generateRecommendations();

    expect(recommendations).toHaveLength(2); // Device scan optimization + memory optimization
    expect(recommendations[0].category).toBe('performance');
    expect(recommendations[0].title).toContain('Device Scanning Performance');
    expect(recommendations[1].title).toContain('Memory Usage');
  });

  it('should get current performance metrics', async () => {
    // Mock database responses
    vi.mocked(mockDb.all).mockImplementation((sql, params, callback) => {
      if (sql.includes('wizard_operation_metrics')) {
        const operations = [
          { operation_type: 'device_scan', duration_ms: 15000, success: 1 },
          { operation_type: 'device_scan', duration_ms: 18000, success: 1 },
          { operation_type: 'address_config', duration_ms: 8000, success: 1 },
          { operation_type: 'hardware_test', duration_ms: 12000, success: 1 },
          { operation_type: 'full_wizard', duration_ms: 120000, success: 1 }
        ];
        if (callback) callback(null, operations);
      } else if (sql.includes('wizard_resource_snapshots')) {
        const snapshots = [
          { memory_used: 200 * 1024 * 1024, memory_total: 500 * 1024 * 1024, cpu_percentage: 45, network_latency: 800 },
          { memory_used: 220 * 1024 * 1024, memory_total: 500 * 1024 * 1024, cpu_percentage: 50, network_latency: 900 }
        ];
        if (callback) callback(null, snapshots);
      }
      return mockDb;
    });

    const metrics = await monitor.getCurrentMetrics(24);

    expect(metrics.deviceScanTime).toHaveLength(2);
    expect(metrics.deviceScanTime).toEqual([15000, 18000]);
    expect(metrics.addressConfigTime).toEqual([8000]);
    expect(metrics.hardwareTestTime).toEqual([12000]);
    expect(metrics.totalWizardTime).toEqual([120000]);
    expect(metrics.deviceDetectionSuccessRate).toBe(100);
    expect(metrics.memoryUsage).toHaveLength(2);
    expect(metrics.cpuUsage).toEqual([45, 50]);
    expect(metrics.networkLatency).toEqual([800, 900]);
  });

  it('should create performance alerts for slow operations', () => {
    const alertListener = vi.fn();
    monitor.on('performanceAlert', alertListener);

    const operationId = 'slow-operation';
    monitor.startOperation(operationId, 'device_scan');
    
    // Simulate slow operation by manually setting duration
    const slowDuration = 35000; // 35 seconds, above 30s threshold
    monitor.completeOperation(operationId, true);

    // The alert would be created in checkOperationThresholds
    // We need to manually trigger it for testing
    monitor['checkOperationThresholds']({
      operationId,
      operationType: 'device_scan',
      startTime: Date.now() - slowDuration,
      endTime: Date.now(),
      duration: slowDuration,
      success: true
    });

    expect(alertListener).toHaveBeenCalled();
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

  it('should create alerts for high resource usage', async () => {
    const alertListener = vi.fn();
    monitor.on('performanceAlert', alertListener);

    const highMemorySnapshot = {
      timestamp: Date.now(),
      memoryUsage: {
        used: 450 * 1024 * 1024,
        free: 50 * 1024 * 1024,
        total: 500 * 1024 * 1024,
        percentage: 90 // Above 80% threshold
      },
      cpuUsage: {
        user: 9000,
        system: 1000,
        idle: 0,
        percentage: 95 // Above 90% threshold
      },
      networkStats: {
        latency: 2500, // Above 2000ms threshold
        throughput: 100,
        errors: 0
      }
    };

    await monitor.recordResourceUsage(highMemorySnapshot);

    expect(alertListener).toHaveBeenCalledTimes(3); // Memory, CPU, and network alerts
  });

  it('should track active operations', () => {
    const operationId1 = 'op1';
    const operationId2 = 'op2';

    monitor.startOperation(operationId1, 'device_scan');
    monitor.startOperation(operationId2, 'address_config');

    expect(monitor['activeOperations'].size).toBe(2);

    monitor.completeOperation(operationId1, true);
    expect(monitor['activeOperations'].size).toBe(1);

    monitor.completeOperation(operationId2, true);
    expect(monitor['activeOperations'].size).toBe(0);
  });

  it('should handle unknown operation completion gracefully', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    monitor.completeOperation('unknown-operation', true);
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Operation unknown-operation not found')
    );
    
    consoleSpy.mockRestore();
  });

  it('should get active alerts', () => {
    // Add some alerts to the internal map
    monitor['performanceAlerts'].set('alert1', {
      id: 'alert1',
      type: 'warning',
      metric: 'memory_usage',
      threshold: 80,
      currentValue: 85,
      message: 'High memory usage',
      timestamp: Date.now(),
      acknowledged: false
    });

    monitor['performanceAlerts'].set('alert2', {
      id: 'alert2',
      type: 'error',
      metric: 'cpu_usage',
      threshold: 90,
      currentValue: 95,
      message: 'High CPU usage',
      timestamp: Date.now(),
      acknowledged: true // This one is acknowledged
    });

    const activeAlerts = monitor.getActiveAlerts();
    expect(activeAlerts).toHaveLength(1);
    expect(activeAlerts[0].id).toBe('alert1');
  });

  it('should acknowledge alerts', async () => {
    const alertId = 'test-alert';
    monitor['performanceAlerts'].set(alertId, {
      id: alertId,
      type: 'warning',
      metric: 'test_metric',
      threshold: 100,
      currentValue: 150,
      message: 'Test alert',
      timestamp: Date.now(),
      acknowledged: false
    });

    const acknowledgeListener = vi.fn();
    monitor.on('alertAcknowledged', acknowledgeListener);

    await monitor.acknowledgeAlert(alertId);

    expect(monitor['performanceAlerts'].get(alertId)?.acknowledged).toBe(true);
    expect(acknowledgeListener).toHaveBeenCalled();
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE wizard_performance_alerts'),
      [alertId]
    );
  });

  it('should get and implement recommendations', async () => {
    const recommendationId = 'test-recommendation';
    monitor['recommendations'].set(recommendationId, {
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

    const recommendations = monitor.getRecommendations();
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].id).toBe(recommendationId);

    const implementListener = vi.fn();
    monitor.on('recommendationImplemented', implementListener);

    await monitor.implementRecommendation(recommendationId);

    expect(implementListener).toHaveBeenCalled();
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE wizard_optimization_recommendations'),
      [recommendationId]
    );
  });

  it('should cleanup old performance data', async () => {
    await monitor.cleanup(7); // 7 days retention

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

  it('should emit shutdown event', () => {
    const shutdownListener = vi.fn();
    monitor.on('shutdown', shutdownListener);

    monitor.shutdown();

    expect(shutdownListener).toHaveBeenCalled();
  });
});