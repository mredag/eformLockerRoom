import { EventLogger } from './event-logger';
import { DatabaseConnection } from '../database/connection';
import { EventType } from '../types/core-entities';

/**
 * Hardware Soak Testing Automation System
 * Implements automated 1000-cycle testing with failure detection
 * Requirements: Testing Strategy - Hardware Testing
 */
export class HardwareSoakTester {
  private db: DatabaseConnection;
  private eventLogger: EventLogger;
  private isRunning: boolean = false;
  private currentTest?: SoakTest;

  constructor(db: DatabaseConnection, eventLogger: EventLogger) {
    this.db = db;
    this.eventLogger = eventLogger;
  }

  /**
   * Start automated soak testing for a specific locker
   */
  async startSoakTest(
    kioskId: string,
    lockerId: number,
    targetCycles: number = 1000,
    intervalMs: number = 5000,
    failureThreshold: number = 50
  ): Promise<SoakTest> {
    if (this.isRunning) {
      throw new Error('Soak test already running');
    }

    const test: SoakTest = {
      id: this.generateTestId(),
      kiosk_id: kioskId,
      locker_id: lockerId,
      target_cycles: targetCycles,
      current_cycle: 0,
      success_count: 0,
      failure_count: 0,
      failure_threshold: failureThreshold,
      interval_ms: intervalMs,
      status: 'running',
      started_at: new Date(),
      last_cycle_at: new Date(),
      failures: [],
      performance_metrics: {
        avg_response_time_ms: 0,
        min_response_time_ms: Number.MAX_VALUE,
        max_response_time_ms: 0,
        total_response_time_ms: 0
      }
    };

    // Save test to database
    await this.saveSoakTest(test);

    // Log test start
    await this.eventLogger.logEvent(
      kioskId,
      'soak_test_started' as EventType,
      {
        test_id: test.id,
        locker_id: lockerId,
        target_cycles: targetCycles,
        failure_threshold: failureThreshold
      },
      lockerId
    );

    this.currentTest = test;
    this.isRunning = true;

    // Start the test cycle
    this.runTestCycle();

    return test;
  }

  /**
   * Stop the current soak test
   */
  async stopSoakTest(): Promise<SoakTest | null> {
    if (!this.isRunning || !this.currentTest) {
      return null;
    }

    this.isRunning = false;
    const test = this.currentTest;
    test.status = 'stopped';
    test.completed_at = new Date();

    // Update test in database
    await this.saveSoakTest(test);

    // Log test stop
    await this.eventLogger.logEvent(
      test.kiosk_id,
      'soak_test_stopped' as EventType,
      {
        test_id: test.id,
        cycles_completed: test.current_cycle,
        success_rate: (test.success_count / test.current_cycle) * 100,
        reason: 'manual_stop'
      },
      test.locker_id
    );

    this.currentTest = undefined;
    return test;
  }

  /**
   * Get current test status
   */
  getCurrentTest(): SoakTest | null {
    return this.currentTest || null;
  }

  /**
   * Get test history for a locker
   */
  async getTestHistory(kioskId: string, lockerId?: number): Promise<SoakTest[]> {
    let sql = 'SELECT * FROM soak_tests WHERE kiosk_id = ?';
    const params: any[] = [kioskId];

    if (lockerId !== undefined) {
      sql += ' AND locker_id = ?';
      params.push(lockerId);
    }

    sql += ' ORDER BY started_at DESC';

    const rows = await this.db.all(sql, params);
    return rows.map(row => this.mapRowToSoakTest(row));
  }

  /**
   * Get hardware endurance report
   */
  async getEnduranceReport(kioskId: string): Promise<EnduranceReport> {
    const sql = `
      SELECT 
        locker_id,
        COUNT(*) as test_count,
        SUM(current_cycle) as total_cycles,
        SUM(success_count) as total_successes,
        SUM(failure_count) as total_failures,
        AVG(performance_metrics_avg_response_time) as avg_response_time,
        MAX(started_at) as last_test_date
      FROM soak_tests 
      WHERE kiosk_id = ? 
      GROUP BY locker_id
    `;

    const rows = await this.db.all(sql, [kioskId]);
    
    const lockerReports: LockerEnduranceReport[] = rows.map(row => ({
      locker_id: row.locker_id,
      test_count: row.test_count,
      total_cycles: row.total_cycles,
      total_successes: row.total_successes,
      total_failures: row.total_failures,
      success_rate: (row.total_successes / row.total_cycles) * 100,
      avg_response_time_ms: row.avg_response_time,
      last_test_date: new Date(row.last_test_date),
      maintenance_recommended: this.shouldRecommendMaintenance(row)
    }));

    return {
      kiosk_id: kioskId,
      generated_at: new Date(),
      locker_reports: lockerReports,
      summary: this.generateSummary(lockerReports)
    };
  }

  /**
   * Check if any lockers need maintenance based on failure rates
   */
  async checkMaintenanceSchedule(kioskId: string): Promise<MaintenanceRecommendation[]> {
    const report = await this.getEnduranceReport(kioskId);
    const recommendations: MaintenanceRecommendation[] = [];

    for (const lockerReport of report.locker_reports) {
      if (lockerReport.maintenance_recommended) {
        const priority = this.calculateMaintenancePriority(lockerReport);
        
        recommendations.push({
          kiosk_id: kioskId,
          locker_id: lockerReport.locker_id,
          priority,
          reason: this.getMaintenanceReason(lockerReport),
          recommended_action: this.getRecommendedAction(lockerReport),
          failure_rate: 100 - lockerReport.success_rate,
          total_cycles: lockerReport.total_cycles,
          last_test_date: lockerReport.last_test_date
        });
      }
    }

    return recommendations.sort((a, b) => this.priorityOrder(a.priority) - this.priorityOrder(b.priority));
  }

  /**
   * Automatically block lockers that exceed failure threshold
   */
  async autoBlockFailedLockers(kioskId: string): Promise<number[]> {
    const recommendations = await this.checkMaintenanceSchedule(kioskId);
    const blockedLockers: number[] = [];

    for (const rec of recommendations) {
      if (rec.priority === 'critical' && rec.failure_rate > 20) {
        // Auto-block locker with critical failure rate
        try {
          await this.blockLocker(rec.kiosk_id, rec.locker_id, 'Auto-blocked due to high failure rate in soak testing');
          blockedLockers.push(rec.locker_id);

          await this.eventLogger.logEvent(
            rec.kiosk_id,
            'soak_test_auto_block' as EventType,
            {
              locker_id: rec.locker_id,
              failure_rate: rec.failure_rate,
              total_cycles: rec.total_cycles,
              reason: 'critical_failure_rate'
            },
            rec.locker_id
          );
        } catch (error) {
          console.error(`Failed to auto-block locker ${rec.locker_id}:`, error);
        }
      }
    }

    return blockedLockers;
  }

  /**
   * Run a single test cycle
   */
  private async runTestCycle(): Promise<void> {
    if (!this.isRunning || !this.currentTest) {
      return;
    }

    const test = this.currentTest;
    const startTime = Date.now();

    try {
      // Simulate hardware operation (in real implementation, this would call ModbusController)
      const success = await this.performHardwareOperation(test.kiosk_id, test.locker_id);
      const responseTime = Date.now() - startTime;

      test.current_cycle++;
      test.last_cycle_at = new Date();

      // Update performance metrics
      test.performance_metrics.total_response_time_ms += responseTime;
      test.performance_metrics.avg_response_time_ms = 
        test.performance_metrics.total_response_time_ms / test.current_cycle;
      test.performance_metrics.min_response_time_ms = 
        Math.min(test.performance_metrics.min_response_time_ms, responseTime);
      test.performance_metrics.max_response_time_ms = 
        Math.max(test.performance_metrics.max_response_time_ms, responseTime);

      if (success) {
        test.success_count++;
      } else {
        test.failure_count++;
        test.failures.push({
          cycle: test.current_cycle,
          timestamp: new Date(),
          error: 'Hardware operation failed',
          response_time_ms: responseTime
        });

        // Check if failure threshold exceeded
        if (test.failure_count >= test.failure_threshold) {
          await this.handleFailureThresholdExceeded(test);
          return;
        }
      }

      // Check if test completed
      if (test.current_cycle >= test.target_cycles) {
        await this.completeTest(test);
        return;
      }

      // Save progress every 10 cycles
      if (test.current_cycle % 10 === 0) {
        await this.saveSoakTest(test);
      }

      // Schedule next cycle
      setTimeout(() => this.runTestCycle(), test.interval_ms);

    } catch (error) {
      test.failure_count++;
      test.failures.push({
        cycle: test.current_cycle,
        timestamp: new Date(),
        error: (error as Error).message,
        response_time_ms: Date.now() - startTime
      });

      await this.handleTestError(test, error as Error);
    }
  }

  /**
   * Perform hardware operation (mock implementation)
   */
  private async performHardwareOperation(kioskId: string, lockerId: number): Promise<boolean> {
    // In real implementation, this would use ModbusController
    // For now, simulate with random success/failure
    return new Promise((resolve) => {
      setTimeout(() => {
        // 95% success rate for simulation
        resolve(Math.random() > 0.05);
      }, Math.random() * 1000 + 500); // 500-1500ms response time
    });
  }

  /**
   * Handle test completion
   */
  private async completeTest(test: SoakTest): Promise<void> {
    this.isRunning = false;
    test.status = 'completed';
    test.completed_at = new Date();

    await this.saveSoakTest(test);

    const successRate = (test.success_count / test.current_cycle) * 100;

    await this.eventLogger.logEvent(
      test.kiosk_id,
      'soak_test_completed' as EventType,
      {
        test_id: test.id,
        cycles_completed: test.current_cycle,
        success_count: test.success_count,
        failure_count: test.failure_count,
        success_rate: successRate,
        avg_response_time_ms: test.performance_metrics.avg_response_time_ms
      },
      test.locker_id
    );

    this.currentTest = undefined;
  }

  /**
   * Handle failure threshold exceeded
   */
  private async handleFailureThresholdExceeded(test: SoakTest): Promise<void> {
    this.isRunning = false;
    test.status = 'failed';
    test.completed_at = new Date();

    await this.saveSoakTest(test);

    await this.eventLogger.logEvent(
      test.kiosk_id,
      'soak_test_failed' as EventType,
      {
        test_id: test.id,
        cycles_completed: test.current_cycle,
        failure_count: test.failure_count,
        failure_threshold: test.failure_threshold,
        reason: 'failure_threshold_exceeded'
      },
      test.locker_id
    );

    // Auto-block the locker
    await this.blockLocker(test.kiosk_id, test.locker_id, `Soak test failed: ${test.failure_count} failures in ${test.current_cycle} cycles`);

    this.currentTest = undefined;
  }

  /**
   * Handle test error
   */
  private async handleTestError(test: SoakTest, error: Error): Promise<void> {
    this.isRunning = false;
    test.status = 'error';
    test.completed_at = new Date();

    await this.saveSoakTest(test);

    await this.eventLogger.logEvent(
      test.kiosk_id,
      'soak_test_error' as EventType,
      {
        test_id: test.id,
        cycles_completed: test.current_cycle,
        error: error.message
      },
      test.locker_id
    );

    this.currentTest = undefined;
  }

  /**
   * Block a locker (mock implementation)
   */
  private async blockLocker(kioskId: string, lockerId: number, reason: string): Promise<void> {
    // In real implementation, this would update the locker status in database
    const sql = `
      UPDATE lockers 
      SET status = 'Blocked', updated_at = CURRENT_TIMESTAMP 
      WHERE kiosk_id = ? AND id = ?
    `;
    
    await this.db.run(sql, [kioskId, lockerId]);
  }

  /**
   * Save soak test to database
   */
  private async saveSoakTest(test: SoakTest): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO soak_tests (
        id, kiosk_id, locker_id, target_cycles, current_cycle,
        success_count, failure_count, failure_threshold, interval_ms,
        status, started_at, completed_at, last_cycle_at,
        failures, performance_metrics_avg_response_time,
        performance_metrics_min_response_time, performance_metrics_max_response_time,
        performance_metrics_total_response_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      test.id,
      test.kiosk_id,
      test.locker_id,
      test.target_cycles,
      test.current_cycle,
      test.success_count,
      test.failure_count,
      test.failure_threshold,
      test.interval_ms,
      test.status,
      test.started_at.toISOString(),
      test.completed_at?.toISOString() || null,
      test.last_cycle_at.toISOString(),
      JSON.stringify(test.failures),
      test.performance_metrics.avg_response_time_ms,
      test.performance_metrics.min_response_time_ms,
      test.performance_metrics.max_response_time_ms,
      test.performance_metrics.total_response_time_ms
    ];

    await this.db.run(sql, params);
  }

  /**
   * Map database row to SoakTest object
   */
  private mapRowToSoakTest(row: any): SoakTest {
    return {
      id: row.id,
      kiosk_id: row.kiosk_id,
      locker_id: row.locker_id,
      target_cycles: row.target_cycles,
      current_cycle: row.current_cycle,
      success_count: row.success_count,
      failure_count: row.failure_count,
      failure_threshold: row.failure_threshold,
      interval_ms: row.interval_ms,
      status: row.status,
      started_at: new Date(row.started_at),
      completed_at: row.completed_at ? new Date(row.completed_at) : undefined,
      last_cycle_at: new Date(row.last_cycle_at),
      failures: JSON.parse(row.failures || '[]'),
      performance_metrics: {
        avg_response_time_ms: row.performance_metrics_avg_response_time,
        min_response_time_ms: row.performance_metrics_min_response_time,
        max_response_time_ms: row.performance_metrics_max_response_time,
        total_response_time_ms: row.performance_metrics_total_response_time
      }
    };
  }

  /**
   * Generate unique test ID
   */
  private generateTestId(): string {
    return `soak_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if maintenance should be recommended
   */
  private shouldRecommendMaintenance(row: any): boolean {
    const successRate = (row.total_successes / row.total_cycles) * 100;
    const failureRate = 100 - successRate;
    
    return failureRate > 5 || // More than 5% failure rate
           row.avg_response_time > 2000 || // Response time over 2 seconds
           row.total_cycles > 10000; // High usage
  }

  /**
   * Calculate maintenance priority
   */
  private calculateMaintenancePriority(report: LockerEnduranceReport): 'low' | 'medium' | 'high' | 'critical' {
    const failureRate = 100 - report.success_rate;
    
    if (failureRate > 20) return 'critical';
    if (failureRate > 10) return 'high';
    if (failureRate > 5) return 'medium';
    return 'low';
  }

  /**
   * Get maintenance reason
   */
  private getMaintenanceReason(report: LockerEnduranceReport): string {
    const failureRate = 100 - report.success_rate;
    
    if (failureRate > 20) return 'Critical failure rate detected';
    if (failureRate > 10) return 'High failure rate detected';
    if (report.avg_response_time_ms > 2000) return 'Slow response time detected';
    if (report.total_cycles > 10000) return 'High usage cycles reached';
    return 'Preventive maintenance recommended';
  }

  /**
   * Get recommended action
   */
  private getRecommendedAction(report: LockerEnduranceReport): string {
    const failureRate = 100 - report.success_rate;
    
    if (failureRate > 20) return 'Replace relay and lock mechanism';
    if (failureRate > 10) return 'Inspect and service lock mechanism';
    if (report.avg_response_time_ms > 2000) return 'Check electrical connections and relay';
    return 'Schedule routine maintenance inspection';
  }

  /**
   * Generate summary for endurance report
   */
  private generateSummary(reports: LockerEnduranceReport[]): EnduranceSummary {
    const totalLockers = reports.length;
    const needMaintenance = reports.filter(r => r.maintenance_recommended).length;
    const avgSuccessRate = reports.reduce((sum, r) => sum + r.success_rate, 0) / totalLockers;
    const totalCycles = reports.reduce((sum, r) => sum + r.total_cycles, 0);

    return {
      total_lockers: totalLockers,
      lockers_needing_maintenance: needMaintenance,
      overall_success_rate: avgSuccessRate,
      total_test_cycles: totalCycles,
      maintenance_percentage: (needMaintenance / totalLockers) * 100
    };
  }

  /**
   * Get priority order for sorting
   */
  private priorityOrder(priority: string): number {
    switch (priority) {
      case 'critical': return 1;
      case 'high': return 2;
      case 'medium': return 3;
      case 'low': return 4;
      default: return 5;
    }
  }
}

// Type definitions
export interface SoakTest {
  id: string;
  kiosk_id: string;
  locker_id: number;
  target_cycles: number;
  current_cycle: number;
  success_count: number;
  failure_count: number;
  failure_threshold: number;
  interval_ms: number;
  status: 'running' | 'completed' | 'failed' | 'stopped' | 'error';
  started_at: Date;
  completed_at?: Date;
  last_cycle_at: Date;
  failures: TestFailure[];
  performance_metrics: PerformanceMetrics;
}

export interface TestFailure {
  cycle: number;
  timestamp: Date;
  error: string;
  response_time_ms: number;
}

export interface PerformanceMetrics {
  avg_response_time_ms: number;
  min_response_time_ms: number;
  max_response_time_ms: number;
  total_response_time_ms: number;
}

export interface EnduranceReport {
  kiosk_id: string;
  generated_at: Date;
  locker_reports: LockerEnduranceReport[];
  summary: EnduranceSummary;
}

export interface LockerEnduranceReport {
  locker_id: number;
  test_count: number;
  total_cycles: number;
  total_successes: number;
  total_failures: number;
  success_rate: number;
  avg_response_time_ms: number;
  last_test_date: Date;
  maintenance_recommended: boolean;
}

export interface EnduranceSummary {
  total_lockers: number;
  lockers_needing_maintenance: number;
  overall_success_rate: number;
  total_test_cycles: number;
  maintenance_percentage: number;
}

export interface MaintenanceRecommendation {
  kiosk_id: string;
  locker_id: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  recommended_action: string;
  failure_rate: number;
  total_cycles: number;
  last_test_date: Date;
}