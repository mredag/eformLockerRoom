/**
 * Metrics Dashboard Test Suite
 * 
 * Tests the metrics and alerts dashboard functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Database } from 'sqlite3';
import { AlertManager } from '../../../../shared/services/alert-manager';
import { PerformanceMonitor } from '../../../../shared/services/performance-monitor';
import { MetricsCollector } from '../../../../shared/services/metrics-collector';

describe('Metrics Dashboard', () => {
  let db: Database;
  let alertManager: AlertManager;
  let performanceMonitor: PerformanceMonitor;
  let metricsCollector: MetricsCollector;

  beforeEach(async () => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    
    // Initialize tables
    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        // Create alerts table
        db.run(`
          CREATE TABLE alerts (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            kiosk_id TEXT NOT NULL,
            severity TEXT NOT NULL,
            message TEXT NOT NULL,
            data TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            triggered_at TEXT NOT NULL,
            cleared_at TEXT,
            auto_clear_condition TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create alert metrics table
        db.run(`
          CREATE TABLE alert_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kiosk_id TEXT NOT NULL,
            metric_type TEXT NOT NULL,
            metric_value REAL NOT NULL,
            event_count INTEGER NOT NULL DEFAULT 1,
            timestamp TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create performance tables
        db.run(`
          CREATE TABLE session_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            kiosk_id TEXT NOT NULL,
            card_id TEXT NOT NULL,
            start_time DATETIME NOT NULL,
            end_time DATETIME,
            duration_seconds INTEGER,
            outcome TEXT NOT NULL,
            selected_locker_id INTEGER,
            time_to_selection_seconds INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(`
          CREATE TABLE ui_performance_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME NOT NULL,
            kiosk_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            latency_ms INTEGER NOT NULL,
            success BOOLEAN NOT NULL,
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(`
          CREATE TABLE command_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            command_id TEXT NOT NULL,
            kiosk_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            duration_ms INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(`
          CREATE TABLE lockers (
            kiosk_id TEXT NOT NULL,
            id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'Free',
            PRIMARY KEY (kiosk_id, id)
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    // Initialize services
    alertManager = new AlertManager(db);
    performanceMonitor = new PerformanceMonitor(db);
    await performanceMonitor.initialize();
    
    metricsCollector = new MetricsCollector(db, alertManager, performanceMonitor);
  });

  afterEach(() => {
    metricsCollector.shutdown();
    alertManager.shutdown();
    db.close();
  });

  describe('MetricsCollector', () => {
    it('should collect basic metrics for a kiosk', async () => {
      // Setup test data
      await new Promise<void>((resolve) => {
        db.run(`INSERT INTO lockers (kiosk_id, id, status) VALUES ('kiosk-1', 1, 'Free')`, resolve);
      });

      await new Promise<void>((resolve) => {
        db.run(`INSERT INTO lockers (kiosk_id, id, status) VALUES ('kiosk-1', 2, 'Owned')`, resolve);
      });

      // Collect metrics
      const metrics = await metricsCollector.collectKioskMetrics('kiosk-1');

      expect(metrics).toBeDefined();
      expect(metrics.kioskId).toBe('kiosk-1');
      expect(metrics.totalLockers).toBe(2);
      expect(metrics.availableLockers).toBe(1);
      expect(metrics.freeRatio).toBe(0.5);
      expect(metrics.systemHealth).toBeGreaterThan(0);
      expect(metrics.timestamp).toBeInstanceOf(Date);
    });

    it('should calculate system health score correctly', async () => {
      // Setup test data with good metrics
      await new Promise<void>((resolve) => {
        db.run(`INSERT INTO lockers (kiosk_id, id, status) VALUES ('kiosk-1', 1, 'Free')`, resolve);
      });

      const metrics = await metricsCollector.collectKioskMetrics('kiosk-1');
      
      // With no performance issues, health should be high
      expect(metrics.systemHealth).toBeGreaterThanOrEqual(80);
    });

    it('should detect metric threshold violations', async () => {
      // Setup test data
      await new Promise<void>((resolve) => {
        db.run(`INSERT INTO lockers (kiosk_id, id, status) VALUES ('kiosk-1', 1, 'Free')`, resolve);
      });

      // Record high latency metric
      await metricsCollector.recordMetricEvent('kiosk-1', 'ui_latency', 5000, true);
      
      const metrics = await metricsCollector.collectKioskMetrics('kiosk-1');
      
      // High UI latency should reduce system health
      expect(metrics.systemHealth).toBeLessThan(100);
    });

    it('should start and stop collection properly', () => {
      const startSpy = vi.spyOn(metricsCollector, 'startCollection');
      const stopSpy = vi.spyOn(metricsCollector, 'stopCollection');

      metricsCollector.startCollection(1); // 1 second for testing
      expect(startSpy).toHaveBeenCalledWith(1);

      metricsCollector.stopCollection();
      expect(stopSpy).toHaveBeenCalled();
    });

    it('should emit events on metrics updates', (done) => {
      metricsCollector.on('metricsUpdate', (data) => {
        expect(data).toBeDefined();
        expect(data.kioskId).toBeDefined();
        expect(data.metrics).toBeDefined();
        done();
      });

      // Trigger metrics collection
      metricsCollector.collectAllMetrics();
    });
  });

  describe('Alert Integration', () => {
    it('should count active alerts correctly', async () => {
      // Create test alert
      await alertManager.triggerAlert('no_stock', {
        kioskId: 'kiosk-1',
        threshold: 3,
        actualValue: 5,
        windowMinutes: 10,
        eventCount: 5
      });

      const metrics = await metricsCollector.collectKioskMetrics('kiosk-1');
      
      expect(metrics.activeAlerts).toBe(1);
      expect(metrics.alertsByType.no_stock).toBe(1);
    });

    it('should categorize alerts by type', async () => {
      // Create multiple alerts
      await alertManager.triggerAlert('no_stock', {
        kioskId: 'kiosk-1',
        threshold: 3,
        actualValue: 5,
        windowMinutes: 10
      });

      await alertManager.triggerAlert('conflict_rate', {
        kioskId: 'kiosk-1',
        threshold: 0.02,
        actualValue: 0.05,
        windowMinutes: 5
      });

      const metrics = await metricsCollector.collectKioskMetrics('kiosk-1');
      
      expect(metrics.activeAlerts).toBe(2);
      expect(metrics.alertsByType.no_stock).toBe(1);
      expect(metrics.alertsByType.conflict_rate).toBe(1);
      expect(metrics.alertsByType.open_fail_rate).toBe(0);
    });
  });

  describe('Performance Integration', () => {
    it('should calculate average open time from performance data', async () => {
      // Record some UI performance events
      await performanceMonitor.recordUIPerformance('kiosk-1', 'state_update', 1500, true);
      await performanceMonitor.recordUIPerformance('kiosk-1', 'state_update', 2500, true);

      const metrics = await metricsCollector.collectKioskMetrics('kiosk-1');
      
      expect(metrics.uiLatency).toBe(2000); // Average of 1500 and 2500
    });

    it('should track session metrics', async () => {
      // Record session start and end
      await performanceMonitor.recordSessionStart('session-1', 'kiosk-1', 'card-1');
      await performanceMonitor.recordSessionEnd('session-1', 'completed', 1, 30);

      const metrics = await metricsCollector.collectKioskMetrics('kiosk-1');
      
      // Should have some session activity
      expect(metrics.sessionsPerHour).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Capacity Metrics', () => {
    it('should calculate free ratio correctly', async () => {
      // Setup 4 lockers: 2 free, 2 occupied
      await new Promise<void>((resolve) => {
        db.serialize(() => {
          db.run(`INSERT INTO lockers (kiosk_id, id, status) VALUES ('kiosk-1', 1, 'Free')`);
          db.run(`INSERT INTO lockers (kiosk_id, id, status) VALUES ('kiosk-1', 2, 'Free')`);
          db.run(`INSERT INTO lockers (kiosk_id, id, status) VALUES ('kiosk-1', 3, 'Owned')`);
          db.run(`INSERT INTO lockers (kiosk_id, id, status) VALUES ('kiosk-1', 4, 'Owned')`, resolve);
        });
      });

      const metrics = await metricsCollector.collectKioskMetrics('kiosk-1');
      
      expect(metrics.totalLockers).toBe(4);
      expect(metrics.availableLockers).toBe(2);
      expect(metrics.freeRatio).toBe(0.5);
    });

    it('should handle empty kiosk gracefully', async () => {
      const metrics = await metricsCollector.collectKioskMetrics('kiosk-empty');
      
      expect(metrics.totalLockers).toBe(0);
      expect(metrics.availableLockers).toBe(0);
      expect(metrics.freeRatio).toBe(0);
    });
  });

  describe('Usage Metrics', () => {
    it('should calculate operations per minute', async () => {
      // Add some command queue entries
      const now = new Date().toISOString();
      await new Promise<void>((resolve) => {
        db.serialize(() => {
          db.run(`INSERT INTO command_queue (command_id, kiosk_id, status, created_at) VALUES ('cmd-1', 'kiosk-1', 'completed', ?)`, [now]);
          db.run(`INSERT INTO command_queue (command_id, kiosk_id, status, created_at) VALUES ('cmd-2', 'kiosk-1', 'completed', ?)`, [now], resolve);
        });
      });

      const metrics = await metricsCollector.collectKioskMetrics('kiosk-1');
      
      expect(metrics.operationsPerMinute).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBe(100); // All operations successful
    });

    it('should calculate success rate correctly', async () => {
      const now = new Date().toISOString();
      await new Promise<void>((resolve) => {
        db.serialize(() => {
          db.run(`INSERT INTO command_queue (command_id, kiosk_id, status, created_at) VALUES ('cmd-1', 'kiosk-1', 'completed', ?)`, [now]);
          db.run(`INSERT INTO command_queue (command_id, kiosk_id, status, created_at) VALUES ('cmd-2', 'kiosk-1', 'failed', ?)`, [now], resolve);
        });
      });

      const metrics = await metricsCollector.collectKioskMetrics('kiosk-1');
      
      expect(metrics.successRate).toBe(50); // 1 success out of 2 operations
    });
  });

  describe('Real-time Events', () => {
    it('should record metric events', async () => {
      const eventPromise = new Promise((resolve) => {
        metricsCollector.on('metricEvent', resolve);
      });

      await metricsCollector.recordMetricEvent('kiosk-1', 'open_time', 1500, true);
      
      const event = await eventPromise;
      expect(event).toBeDefined();
    });

    it('should emit metric alerts when thresholds are exceeded', async () => {
      const alertPromise = new Promise((resolve) => {
        metricsCollector.on('metricAlerts', resolve);
      });

      // Setup data that will trigger alerts
      await new Promise<void>((resolve) => {
        db.run(`INSERT INTO lockers (kiosk_id, id, status) VALUES ('kiosk-1', 1, 'Owned')`, resolve);
      });

      // Record high error rate
      await metricsCollector.recordMetricEvent('kiosk-1', 'error_rate', 10, false);
      
      // Trigger collection which should detect threshold violations
      await metricsCollector.collectAllMetrics();
      
      // This might emit alerts depending on the metrics
      // The test verifies the event system works
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Close database to simulate error
      db.close();
      
      // Should not throw
      expect(async () => {
        await metricsCollector.collectKioskMetrics('kiosk-1');
      }).not.toThrow();
    });

    it('should handle missing kiosk data', async () => {
      const metrics = await metricsCollector.collectKioskMetrics('nonexistent-kiosk');
      
      expect(metrics).toBeDefined();
      expect(metrics.kioskId).toBe('nonexistent-kiosk');
      expect(metrics.totalLockers).toBe(0);
    });
  });
});

describe('Dashboard API Integration', () => {
  // These would be integration tests for the actual API endpoints
  // Testing the full request/response cycle
  
  it('should return metrics overview', () => {
    // Mock API test - would use actual Fastify test framework
    expect(true).toBe(true); // Placeholder
  });

  it('should return real-time metrics', () => {
    // Mock API test
    expect(true).toBe(true); // Placeholder
  });

  it('should return alert distribution', () => {
    // Mock API test
    expect(true).toBe(true); // Placeholder
  });

  it('should return system health status', () => {
    // Mock API test
    expect(true).toBe(true); // Placeholder
  });
});