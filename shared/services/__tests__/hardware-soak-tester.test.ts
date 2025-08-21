import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HardwareSoakTester, SoakTest } from '../hardware-soak-tester.js';
import { DatabaseConnection } from '../../database/connection.js';
import { EventLogger } from '../event-logger.js';

// Mock dependencies
const mockDb = {
  run: vi.fn(),
  get: vi.fn(),
  all: vi.fn()
} as unknown as DatabaseConnection;

const mockEventLogger = {
  logEvent: vi.fn()
} as unknown as EventLogger;

describe('HardwareSoakTester', () => {
  let soakTester: HardwareSoakTester;

  beforeEach(() => {
    vi.clearAllMocks();
    soakTester = new HardwareSoakTester(mockDb, mockEventLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('startSoakTest', () => {
    it('should start a new soak test with default parameters', async () => {
      vi.mocked(mockDb.run).mockResolvedValue({ lastID: 1, changes: 1 });
      vi.mocked(mockEventLogger.logEvent).mockResolvedValue({} as any);

      const test = await soakTester.startSoakTest('kiosk-1', 5);

      expect(test.kiosk_id).toBe('kiosk-1');
      expect(test.locker_id).toBe(5);
      expect(test.target_cycles).toBe(1000);
      expect(test.current_cycle).toBe(0);
      expect(test.status).toBe('running');
      expect(test.failure_threshold).toBe(50);
      expect(test.interval_ms).toBe(5000);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO soak_tests'),
        expect.arrayContaining([
          expect.any(String), // test ID
          'kiosk-1',
          5,
          1000,
          0,
          0,
          0,
          50,
          5000,
          'running'
        ])
      );

      expect(mockEventLogger.logEvent).toHaveBeenCalledWith(
        'kiosk-1',
        'soak_test_started',
        expect.objectContaining({
          test_id: expect.any(String),
          locker_id: 5,
          target_cycles: 1000,
          failure_threshold: 50
        }),
        5
      );
    });

    it('should start a soak test with custom parameters', async () => {
      vi.mocked(mockDb.run).mockResolvedValue({ lastID: 1, changes: 1 });
      vi.mocked(mockEventLogger.logEvent).mockResolvedValue({} as any);

      const test = await soakTester.startSoakTest('kiosk-2', 10, 500, 2000, 25);

      expect(test.target_cycles).toBe(500);
      expect(test.interval_ms).toBe(2000);
      expect(test.failure_threshold).toBe(25);
    });

    it('should throw error if test is already running', async () => {
      vi.mocked(mockDb.run).mockResolvedValue({ lastID: 1, changes: 1 });
      vi.mocked(mockEventLogger.logEvent).mockResolvedValue({} as any);

      // Start first test
      await soakTester.startSoakTest('kiosk-1', 5);

      // Try to start second test
      await expect(
        soakTester.startSoakTest('kiosk-1', 6)
      ).rejects.toThrow('Soak test already running');
    });
  });

  describe('stopSoakTest', () => {
    it('should stop a running test', async () => {
      vi.mocked(mockDb.run).mockResolvedValue({ lastID: 1, changes: 1 });
      vi.mocked(mockEventLogger.logEvent).mockResolvedValue({} as any);

      // Start test
      await soakTester.startSoakTest('kiosk-1', 5);

      // Stop test
      const stoppedTest = await soakTester.stopSoakTest();

      expect(stoppedTest).toBeDefined();
      expect(stoppedTest!.status).toBe('stopped');
      expect(stoppedTest!.completed_at).toBeInstanceOf(Date);

      expect(mockEventLogger.logEvent).toHaveBeenCalledWith(
        'kiosk-1',
        'soak_test_stopped',
        expect.objectContaining({
          test_id: expect.any(String),
          cycles_completed: 0,
          success_rate: expect.any(Number),
          reason: 'manual_stop'
        }),
        5
      );
    });

    it('should return null if no test is running', async () => {
      const result = await soakTester.stopSoakTest();
      expect(result).toBeNull();
    });
  });

  describe('getCurrentTest', () => {
    it('should return current test if running', async () => {
      vi.mocked(mockDb.run).mockResolvedValue({ lastID: 1, changes: 1 });
      vi.mocked(mockEventLogger.logEvent).mockResolvedValue({} as any);

      const test = await soakTester.startSoakTest('kiosk-1', 5);
      const currentTest = soakTester.getCurrentTest();

      expect(currentTest).toEqual(test);
    });

    it('should return null if no test is running', () => {
      const currentTest = soakTester.getCurrentTest();
      expect(currentTest).toBeNull();
    });
  });

  describe('getTestHistory', () => {
    it('should return test history for a kiosk', async () => {
      const mockRows = [
        {
          id: 'test_1',
          kiosk_id: 'kiosk-1',
          locker_id: 5,
          target_cycles: 1000,
          current_cycle: 1000,
          success_count: 950,
          failure_count: 50,
          failure_threshold: 50,
          interval_ms: 5000,
          status: 'completed',
          started_at: '2024-01-01T10:00:00Z',
          completed_at: '2024-01-01T15:00:00Z',
          last_cycle_at: '2024-01-01T15:00:00Z',
          failures: '[]',
          performance_metrics_avg_response_time: 800,
          performance_metrics_min_response_time: 500,
          performance_metrics_max_response_time: 1200,
          performance_metrics_total_response_time: 800000
        }
      ];

      vi.mocked(mockDb.all).mockResolvedValue(mockRows);

      const history = await soakTester.getTestHistory('kiosk-1');

      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('test_1');
      expect(history[0].kiosk_id).toBe('kiosk-1');
      expect(history[0].status).toBe('completed');
      expect(history[0].started_at).toBeInstanceOf(Date);
      expect(history[0].completed_at).toBeInstanceOf(Date);

      expect(mockDb.all).toHaveBeenCalledWith(
        'SELECT * FROM soak_tests WHERE kiosk_id = ? ORDER BY started_at DESC',
        ['kiosk-1']
      );
    });

    it('should return test history for a specific locker', async () => {
      vi.mocked(mockDb.all).mockResolvedValue([]);

      await soakTester.getTestHistory('kiosk-1', 5);

      expect(mockDb.all).toHaveBeenCalledWith(
        'SELECT * FROM soak_tests WHERE kiosk_id = ? AND locker_id = ? ORDER BY started_at DESC',
        ['kiosk-1', 5]
      );
    });
  });

  describe('getEnduranceReport', () => {
    it('should generate endurance report for a kiosk', async () => {
      const mockRows = [
        {
          locker_id: 5,
          test_count: 3,
          total_cycles: 3000,
          total_successes: 2850,
          total_failures: 150,
          avg_response_time: 800,
          last_test_date: '2024-01-01T15:00:00Z'
        },
        {
          locker_id: 6,
          test_count: 2,
          total_cycles: 2000,
          total_successes: 1900,
          total_failures: 100,
          avg_response_time: 750,
          last_test_date: '2024-01-01T12:00:00Z'
        }
      ];

      vi.mocked(mockDb.all).mockResolvedValue(mockRows);

      const report = await soakTester.getEnduranceReport('kiosk-1');

      expect(report.kiosk_id).toBe('kiosk-1');
      expect(report.generated_at).toBeInstanceOf(Date);
      expect(report.locker_reports).toHaveLength(2);

      const locker5Report = report.locker_reports.find(r => r.locker_id === 5);
      expect(locker5Report).toBeDefined();
      expect(locker5Report!.test_count).toBe(3);
      expect(locker5Report!.total_cycles).toBe(3000);
      expect(locker5Report!.success_rate).toBe(95);
      expect(locker5Report!.maintenance_recommended).toBe(false);

      expect(report.summary.total_lockers).toBe(2);
      expect(report.summary.overall_success_rate).toBe(95);
      expect(report.summary.total_test_cycles).toBe(5000);
    });
  });

  describe('checkMaintenanceSchedule', () => {
    it('should identify lockers needing maintenance', async () => {
      const mockRows = [
        {
          locker_id: 5,
          test_count: 3,
          total_cycles: 3000,
          total_successes: 2400, // 80% success rate
          total_failures: 600,
          avg_response_time: 800,
          last_test_date: '2024-01-01T15:00:00Z'
        },
        {
          locker_id: 6,
          test_count: 2,
          total_cycles: 2000,
          total_successes: 1000, // 50% success rate - critical
          total_failures: 1000,
          avg_response_time: 750,
          last_test_date: '2024-01-01T12:00:00Z'
        }
      ];

      vi.mocked(mockDb.all).mockResolvedValue(mockRows);

      const recommendations = await soakTester.checkMaintenanceSchedule('kiosk-1');

      expect(recommendations).toHaveLength(2);

      // Critical priority should be first
      expect(recommendations[0].locker_id).toBe(6);
      expect(recommendations[0].priority).toBe('critical');
      expect(recommendations[0].failure_rate).toBe(50);

      expect(recommendations[1].locker_id).toBe(5);
      expect(recommendations[1].priority).toBe('high'); // 20% failure rate is high priority
      expect(recommendations[1].failure_rate).toBe(20);
    });
  });

  describe('autoBlockFailedLockers', () => {
    it('should auto-block lockers with critical failure rates', async () => {
      const mockRows = [
        {
          locker_id: 5,
          test_count: 3,
          total_cycles: 3000,
          total_successes: 2100, // 70% success rate
          total_failures: 900,
          avg_response_time: 800,
          last_test_date: '2024-01-01T15:00:00Z'
        }
      ];

      vi.mocked(mockDb.all).mockResolvedValue(mockRows);
      vi.mocked(mockDb.run).mockResolvedValue({ lastID: 1, changes: 1 });
      vi.mocked(mockEventLogger.logEvent).mockResolvedValue({} as any);

      const blockedLockers = await soakTester.autoBlockFailedLockers('kiosk-1');

      expect(blockedLockers).toEqual([5]);

      // Verify locker was blocked
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lockers'),
        ['kiosk-1', 5]
      );

      // Verify event was logged
      expect(mockEventLogger.logEvent).toHaveBeenCalledWith(
        'kiosk-1',
        'soak_test_auto_block',
        expect.objectContaining({
          locker_id: 5,
          failure_rate: 30,
          total_cycles: 3000,
          reason: 'critical_failure_rate'
        }),
        5
      );
    });

    it('should not block lockers with acceptable failure rates', async () => {
      const mockRows = [
        {
          locker_id: 5,
          test_count: 3,
          total_cycles: 3000,
          total_successes: 2850, // 95% success rate
          total_failures: 150,
          avg_response_time: 800,
          last_test_date: '2024-01-01T15:00:00Z'
        }
      ];

      vi.mocked(mockDb.all).mockResolvedValue(mockRows);

      const blockedLockers = await soakTester.autoBlockFailedLockers('kiosk-1');

      expect(blockedLockers).toEqual([]);
      expect(mockDb.run).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lockers SET status = \'Blocked\''),
        expect.any(Array)
      );
    });
  });

  describe('Test Execution Simulation', () => {
    it('should handle successful test cycles', async () => {
      vi.mocked(mockDb.run).mockResolvedValue({ lastID: 1, changes: 1 });
      vi.mocked(mockEventLogger.logEvent).mockResolvedValue({} as any);

      const test = await soakTester.startSoakTest('kiosk-1', 5, 5, 100); // 5 cycles, 100ms interval

      // Test should be running
      const currentTest = soakTester.getCurrentTest();
      expect(currentTest).toBeDefined();
      expect(currentTest!.status).toBe('running');
      expect(currentTest!.target_cycles).toBe(5);

      // Stop the test
      await soakTester.stopSoakTest();
    });

    it('should handle test failures and threshold exceeded', async () => {
      vi.mocked(mockDb.run).mockResolvedValue({ lastID: 1, changes: 1 });
      vi.mocked(mockEventLogger.logEvent).mockResolvedValue({} as any);

      const test = await soakTester.startSoakTest('kiosk-1', 5, 100, 50, 5); // Low failure threshold

      // Test should be running initially
      const currentTest = soakTester.getCurrentTest();
      expect(currentTest).toBeDefined();
      expect(currentTest!.failure_threshold).toBe(5);

      // Stop the test
      await soakTester.stopSoakTest();
    });
  });

  describe('Maintenance Priority Calculation', () => {
    it('should calculate correct maintenance priorities', () => {
      const calculatePriority = (soakTester as any).calculateMaintenancePriority.bind(soakTester);

      expect(calculatePriority({ success_rate: 75 })).toBe('critical'); // 25% failure
      expect(calculatePriority({ success_rate: 85 })).toBe('high'); // 15% failure
      expect(calculatePriority({ success_rate: 92 })).toBe('medium'); // 8% failure
      expect(calculatePriority({ success_rate: 97 })).toBe('low'); // 3% failure
    });

    it('should generate appropriate maintenance reasons', () => {
      const getMaintenanceReason = (soakTester as any).getMaintenanceReason.bind(soakTester);

      expect(getMaintenanceReason({ success_rate: 75 })).toBe('Critical failure rate detected');
      expect(getMaintenanceReason({ success_rate: 85 })).toBe('High failure rate detected');
      expect(getMaintenanceReason({ success_rate: 97, avg_response_time_ms: 2500 })).toBe('Slow response time detected');
      expect(getMaintenanceReason({ success_rate: 97, total_cycles: 15000 })).toBe('High usage cycles reached');
    });

    it('should generate appropriate recommended actions', () => {
      const getRecommendedAction = (soakTester as any).getRecommendedAction.bind(soakTester);

      expect(getRecommendedAction({ success_rate: 75 })).toBe('Replace relay and lock mechanism');
      expect(getRecommendedAction({ success_rate: 85 })).toBe('Inspect and service lock mechanism');
      expect(getRecommendedAction({ success_rate: 97, avg_response_time_ms: 2500 })).toBe('Check electrical connections and relay');
      expect(getRecommendedAction({ success_rate: 97 })).toBe('Schedule routine maintenance inspection');
    });
  });

  describe('Database Operations', () => {
    it('should save soak test to database with correct parameters', async () => {
      const saveSoakTest = (soakTester as any).saveSoakTest.bind(soakTester);
      
      const testData: SoakTest = {
        id: 'test_123',
        kiosk_id: 'kiosk-1',
        locker_id: 5,
        target_cycles: 1000,
        current_cycle: 100,
        success_count: 95,
        failure_count: 5,
        failure_threshold: 50,
        interval_ms: 5000,
        status: 'running',
        started_at: new Date('2024-01-01T10:00:00Z'),
        completed_at: undefined,
        last_cycle_at: new Date('2024-01-01T10:30:00Z'),
        failures: [],
        performance_metrics: {
          avg_response_time_ms: 800,
          min_response_time_ms: 500,
          max_response_time_ms: 1200,
          total_response_time_ms: 80000
        }
      };

      vi.mocked(mockDb.run).mockResolvedValue({ lastID: 1, changes: 1 });

      await saveSoakTest(testData);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO soak_tests'),
        [
          'test_123',
          'kiosk-1',
          5,
          1000,
          100,
          95,
          5,
          50,
          5000,
          'running',
          '2024-01-01T10:00:00.000Z',
          null,
          '2024-01-01T10:30:00.000Z',
          '[]',
          800,
          500,
          1200,
          80000
        ]
      );
    });

    it('should map database row to SoakTest object correctly', () => {
      const mapRowToSoakTest = (soakTester as any).mapRowToSoakTest.bind(soakTester);
      
      const row = {
        id: 'test_123',
        kiosk_id: 'kiosk-1',
        locker_id: 5,
        target_cycles: 1000,
        current_cycle: 100,
        success_count: 95,
        failure_count: 5,
        failure_threshold: 50,
        interval_ms: 5000,
        status: 'running',
        started_at: '2024-01-01T10:00:00Z',
        completed_at: null,
        last_cycle_at: '2024-01-01T10:30:00Z',
        failures: '[]',
        performance_metrics_avg_response_time: 800,
        performance_metrics_min_response_time: 500,
        performance_metrics_max_response_time: 1200,
        performance_metrics_total_response_time: 80000
      };

      const soakTest = mapRowToSoakTest(row);

      expect(soakTest.id).toBe('test_123');
      expect(soakTest.kiosk_id).toBe('kiosk-1');
      expect(soakTest.locker_id).toBe(5);
      expect(soakTest.status).toBe('running');
      expect(soakTest.started_at).toBeInstanceOf(Date);
      expect(soakTest.completed_at).toBeUndefined();
      expect(soakTest.failures).toEqual([]);
      expect(soakTest.performance_metrics.avg_response_time_ms).toBe(800);
    });
  });
});