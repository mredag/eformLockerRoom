import { Database } from 'sqlite3';
import { promisify } from 'util';

/**
 * Represents a collection of key performance metrics for the system.
 */
export interface PerformanceMetrics {
  timeToOpen: number[];
  errorRate: number;
  sessionsPerHour: number;
  mostSelectedLockers: { lockerId: number; displayName: string; count: number }[];
  averageIdleTime: number;
  uiUpdateLatency: number[];
}

/**
 * Represents a snapshot of system performance metrics at a specific point in time.
 */
export interface SystemPerformanceSnapshot {
  timestamp: Date;
  metrics: PerformanceMetrics;
  kioskId: string;
  period: 'hour' | 'day' | 'week' | 'month';
}

/**
 * Represents usage statistics for a single locker.
 */
export interface LockerUsageStats {
  lockerId: number;
  displayName: string;
  openCount: number;
  errorCount: number;
  avgResponseTime: number;
  lastUsed: Date;
  successRate: number;
}

/**
 * Represents metrics collected for a single user session.
 */
export interface SessionMetrics {
  sessionId: string;
  kioskId: string;
  cardId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  outcome: 'completed' | 'timeout' | 'cancelled' | 'error';
  selectedLockerId?: number;
  timeToSelection?: number;
}

/**
 * Represents metrics for a single UI performance event.
 */
export interface UIPerformanceMetrics {
  timestamp: Date;
  kioskId: string;
  eventType: 'state_update' | 'session_start' | 'locker_selection' | 'ui_render';
  latency: number;
  success: boolean;
  errorMessage?: string;
}

/**
 * A service for tracking and analyzing system performance metrics.
 * It provides methods to initialize database tables for metrics, record various
 * performance-related events, and generate reports and trends.
 */
export class PerformanceMonitor {
  private db: Database;
  private dbRun: (sql: string, params?: any[]) => Promise<any>;
  private dbGet: (sql: string, params?: any[]) => Promise<any>;
  private dbAll: (sql: string, params?: any[]) => Promise<any[]>;

  /**
   * Creates an instance of PerformanceMonitor.
   * @param {Database} database - The SQLite database instance.
   */
  constructor(database: Database) {
    this.db = database;
    this.dbRun = promisify(this.db.run.bind(this.db));
    this.dbGet = promisify(this.db.get.bind(this.db));
    this.dbAll = promisify(this.db.all.bind(this.db));
  }

  /**
   * Initializes the performance monitoring system by creating the necessary database tables.
   */
  async initialize(): Promise<void> {
    await this.createTables();
    console.log('📊 Performance Monitor initialized');
  }

  /**
   * Creates the database tables required for storing performance metrics.
   * @private
   */
  private async createTables(): Promise<void> {
    await this.dbRun(`
      CREATE TABLE IF NOT EXISTS session_metrics (
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CHECK (outcome IN ('active', 'completed', 'timeout', 'cancelled', 'error'))
      )
    `);

    await this.dbRun(`
      CREATE TABLE IF NOT EXISTS ui_performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL,
        kiosk_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        success BOOLEAN NOT NULL,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CHECK (event_type IN ('state_update', 'session_start', 'locker_selection', 'ui_render'))
      )
    `);

    await this.dbRun(`
      CREATE TABLE IF NOT EXISTS performance_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL,
        kiosk_id TEXT NOT NULL,
        period TEXT NOT NULL,
        metrics_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CHECK (period IN ('hour', 'day', 'week', 'month'))
      )
    `);

    await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_session_metrics_kiosk_time ON session_metrics(kiosk_id, start_time)`);
    await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_session_metrics_outcome ON session_metrics(outcome)`);
    await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_ui_performance_kiosk_time ON ui_performance_metrics(kiosk_id, timestamp)`);
    await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_ui_performance_event_type ON ui_performance_metrics(event_type)`);
    await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_performance_snapshots_kiosk_period ON performance_snapshots(kiosk_id, period, timestamp)`);
  }

  /**
   * Records the start of a new user session.
   * @param {string} sessionId - The unique ID for the session.
   * @param {string} kioskId - The ID of the kiosk where the session started.
   * @param {string} cardId - The RFID card ID used to start the session.
   */
  async recordSessionStart(sessionId: string, kioskId: string, cardId: string): Promise<void> {
    await this.dbRun(`
      INSERT INTO session_metrics (session_id, kiosk_id, card_id, start_time, outcome)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'active')
    `, [sessionId, kioskId, cardId]);
  }

  /**
   * Records the end of a user session with its outcome.
   * @param {string} sessionId - The ID of the session to end.
   * @param {'completed' | 'timeout' | 'cancelled' | 'error'} outcome - The outcome of the session.
   * @param {number} [selectedLockerId] - The ID of the locker selected during the session.
   * @param {number} [timeToSelection] - The time in seconds it took for the user to make a selection.
   */
  async recordSessionEnd(
    sessionId: string, 
    outcome: 'completed' | 'timeout' | 'cancelled' | 'error',
    selectedLockerId?: number,
    timeToSelection?: number
  ): Promise<void> {
    const endTime = new Date();
    
    const session = await this.dbGet(`
      SELECT start_time FROM session_metrics 
      WHERE session_id = ? AND outcome = 'active'
    `, [sessionId]);

    if (session) {
      const startTime = new Date(session.start_time);
      const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

      await this.dbRun(`
        UPDATE session_metrics 
        SET end_time = ?, duration_seconds = ?, outcome = ?, 
            selected_locker_id = ?, time_to_selection_seconds = ?
        WHERE session_id = ? AND outcome = 'active'
      `, [endTime.toISOString(), duration, outcome, selectedLockerId, timeToSelection, sessionId]);
    }
  }

  /**
   * Records a UI performance event, such as render time or update latency.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {'state_update' | 'session_start' | 'locker_selection' | 'ui_render'} eventType - The type of UI event.
   * @param {number} latency - The measured latency in milliseconds.
   * @param {boolean} success - Whether the event was successful.
   * @param {string} [errorMessage] - An optional error message.
   */
  async recordUIPerformance(
    kioskId: string,
    eventType: 'state_update' | 'session_start' | 'locker_selection' | 'ui_render',
    latency: number,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    await this.dbRun(`
      INSERT INTO ui_performance_metrics (timestamp, kiosk_id, event_type, latency_ms, success, error_message)
      VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)
    `, [kioskId, eventType, latency, success, errorMessage]);
  }

  /**
   * Records the duration of a locker operation command.
   * @param {string} commandId - The ID of the command.
   * @param {number} duration - The duration of the operation in milliseconds.
   * @param {boolean} success - Whether the operation was successful.
   */
  async recordLockerOperation(commandId: string, duration: number, success: boolean): Promise<void> {
    await this.dbRun(`
      UPDATE command_queue 
      SET duration_ms = ?, status = ?
      WHERE command_id = ?
    `, [duration, success ? 'completed' : 'failed', commandId]);
  }

  /**
   * Retrieves a snapshot of the current performance metrics for a kiosk over a given period.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {number} [periodHours=24] - The time period in hours to calculate metrics over.
   * @returns {Promise<PerformanceMetrics>} An object containing the calculated performance metrics.
   */
  async getCurrentMetrics(kioskId: string, periodHours: number = 24): Promise<PerformanceMetrics> {
    const since = new Date(Date.now() - periodHours * 60 * 60 * 1000);

    const timeToOpenData = await this.dbAll(`
      SELECT duration_ms FROM command_queue 
      WHERE kiosk_id = ? AND created_at >= ? AND duration_ms IS NOT NULL AND status = 'completed'
      ORDER BY created_at DESC LIMIT 100
    `, [kioskId, since.toISOString()]);

    const timeToOpen = timeToOpenData.map(row => row.duration_ms);

    const totalCommands = await this.dbGet(`
      SELECT COUNT(*) as total FROM command_queue 
      WHERE kiosk_id = ? AND created_at >= ?
    `, [kioskId, since.toISOString()]);

    const failedCommands = await this.dbGet(`
      SELECT COUNT(*) as failed FROM command_queue 
      WHERE kiosk_id = ? AND created_at >= ? AND status = 'failed'
    `, [kioskId, since.toISOString()]);

    const errorRate = totalCommands.total > 0 ? 
      (failedCommands.failed / totalCommands.total) * 100 : 0;

    const sessionCount = await this.dbGet(`
      SELECT COUNT(*) as count FROM session_metrics 
      WHERE kiosk_id = ? AND start_time >= ? AND outcome != 'active'
    `, [kioskId, since.toISOString()]);

    const sessionsPerHour = sessionCount.count / periodHours;

    const mostSelectedData = await this.dbAll(`
      SELECT 
        sm.selected_locker_id as lockerId,
        COALESCE(l.display_name, 'Dolap ' || l.id) as displayName,
        COUNT(*) as count
      FROM session_metrics sm
      LEFT JOIN lockers l ON sm.selected_locker_id = l.id AND l.kiosk_id = sm.kiosk_id
      WHERE sm.kiosk_id = ? AND sm.start_time >= ? 
        AND sm.selected_locker_id IS NOT NULL AND sm.outcome = 'completed'
      GROUP BY sm.selected_locker_id
      ORDER BY count DESC
      LIMIT 10
    `, [kioskId, since.toISOString()]);

    const mostSelectedLockers = mostSelectedData.map(row => ({
      lockerId: row.lockerId,
      displayName: row.displayName,
      count: row.count
    }));

    const avgIdleData = await this.dbGet(`
      SELECT AVG(duration_seconds) as avgIdle FROM session_metrics 
      WHERE kiosk_id = ? AND start_time >= ? AND outcome = 'timeout'
    `, [kioskId, since.toISOString()]);

    const averageIdleTime = avgIdleData.avgIdle || 20;

    const uiLatencyData = await this.dbAll(`
      SELECT latency_ms FROM ui_performance_metrics 
      WHERE kiosk_id = ? AND timestamp >= ? AND event_type = 'state_update' AND success = 1
      ORDER BY timestamp DESC LIMIT 50
    `, [kioskId, since.toISOString()]);

    const uiUpdateLatency = uiLatencyData.map(row => row.latency_ms);

    return {
      timeToOpen,
      errorRate,
      sessionsPerHour,
      mostSelectedLockers,
      averageIdleTime,
      uiUpdateLatency
    };
  }

  /**
   * Retrieves usage statistics for each locker on a given kiosk.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {number} [periodDays=7] - The time period in days to calculate stats over.
   * @returns {Promise<LockerUsageStats[]>} An array of usage statistics for each locker.
   */
  async getLockerUsageStats(kioskId: string, periodDays: number = 7): Promise<LockerUsageStats[]> {
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const stats = await this.dbAll(`
      SELECT 
        l.id as lockerId,
        COALESCE(l.display_name, 'Dolap ' || l.id) as displayName,
        COUNT(CASE WHEN cq.status = 'completed' THEN 1 END) as openCount,
        COUNT(CASE WHEN cq.status = 'failed' THEN 1 END) as errorCount,
        AVG(CASE WHEN cq.duration_ms IS NOT NULL THEN cq.duration_ms END) as avgResponseTime,
        MAX(cq.created_at) as lastUsed,
        CASE 
          WHEN COUNT(*) > 0 THEN 
            (COUNT(CASE WHEN cq.status = 'completed' THEN 1 END) * 100.0 / COUNT(*))
          ELSE 100 
        END as successRate
      FROM lockers l
      LEFT JOIN command_queue cq ON l.kiosk_id = cq.kiosk_id 
        AND JSON_EXTRACT(cq.payload, '$.locker_id') = l.id
        AND cq.created_at >= ?
      WHERE l.kiosk_id = ?
      GROUP BY l.id, l.display_name
      ORDER BY openCount DESC, l.id
    `, [since.toISOString(), kioskId]);

    return stats.map(row => ({
      lockerId: row.lockerId,
      displayName: row.displayName,
      openCount: row.openCount || 0,
      errorCount: row.errorCount || 0,
      avgResponseTime: row.avgResponseTime || 0,
      lastUsed: row.lastUsed ? new Date(row.lastUsed) : new Date(0),
      successRate: row.successRate || 100
    }));
  }

  /**
   * Creates and stores a snapshot of performance metrics for a specified period.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {'hour' | 'day' | 'week' | 'month'} period - The time period for the snapshot.
   */
  async createPerformanceSnapshot(
    kioskId: string, 
    period: 'hour' | 'day' | 'week' | 'month'
  ): Promise<void> {
    const periodHours = {
      hour: 1,
      day: 24,
      week: 168,
      month: 720
    }[period];

    const metrics = await this.getCurrentMetrics(kioskId, periodHours);
    
    await this.dbRun(`
      INSERT INTO performance_snapshots (timestamp, kiosk_id, period, metrics_json)
      VALUES (CURRENT_TIMESTAMP, ?, ?, ?)
    `, [kioskId, period, JSON.stringify(metrics)]);
  }

  /**
   * Retrieves a series of historical performance snapshots to analyze trends.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {'hour' | 'day' | 'week' | 'month'} period - The time period of the snapshots to retrieve.
   * @param {number} [limit=24] - The maximum number of snapshots to return.
   * @returns {Promise<SystemPerformanceSnapshot[]>} An array of performance snapshots.
   */
  async getPerformanceTrends(
    kioskId: string, 
    period: 'hour' | 'day' | 'week' | 'month',
    limit: number = 24
  ): Promise<SystemPerformanceSnapshot[]> {
    const snapshots = await this.dbAll(`
      SELECT timestamp, metrics_json FROM performance_snapshots
      WHERE kiosk_id = ? AND period = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `, [kioskId, period, limit]);

    return snapshots.map(row => ({
      timestamp: new Date(row.timestamp),
      metrics: JSON.parse(row.metrics_json),
      kioskId,
      period
    }));
  }

  /**
   * Checks if the system's performance meets the defined success criteria.
   * @param {string} kioskId - The ID of the kiosk to check.
   * @returns {Promise<object>} An object indicating whether the criteria are met, along with a summary.
   */
  async checkPerformanceCriteria(kioskId: string): Promise<{
    meets95PercentUnder2Seconds: boolean;
    errorRateUnder2Percent: boolean;
    uiUpdatesUnder2Seconds: boolean;
    summary: string;
  }> {
    const metrics = await this.getCurrentMetrics(kioskId, 24);

    const under2Seconds = metrics.timeToOpen.filter(time => time <= 2000).length;
    const meets95PercentUnder2Seconds = metrics.timeToOpen.length === 0 || 
      (under2Seconds / metrics.timeToOpen.length) >= 0.95;

    const errorRateUnder2Percent = metrics.errorRate <= 2;

    const uiUnder2Seconds = metrics.uiUpdateLatency.filter(latency => latency <= 2000).length;
    const uiUpdatesUnder2Seconds = metrics.uiUpdateLatency.length === 0 ||
      (uiUnder2Seconds / metrics.uiUpdateLatency.length) >= 0.95;

    const summary = `Performance Check: ` +
      `95% under 2s: ${meets95PercentUnder2Seconds ? '✅' : '❌'} ` +
      `(${under2Seconds}/${metrics.timeToOpen.length}), ` +
      `Error rate: ${errorRateUnder2Percent ? '✅' : '❌'} ` +
      `(${metrics.errorRate.toFixed(1)}%), ` +
      `UI updates: ${uiUpdatesUnder2Seconds ? '✅' : '❌'} ` +
      `(${uiUnder2Seconds}/${metrics.uiUpdateLatency.length})`;

    return {
      meets95PercentUnder2Seconds,
      errorRateUnder2Percent,
      uiUpdatesUnder2Seconds,
      summary
    };
  }

  /**
   * Cleans up old performance data to save space.
   * @param {number} [retentionDays=30] - The number of days to retain performance data.
   */
  async cleanupOldData(retentionDays: number = 30): Promise<void> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    await this.dbRun(`DELETE FROM session_metrics WHERE created_at < ?`, [cutoff.toISOString()]);
    await this.dbRun(`DELETE FROM ui_performance_metrics WHERE created_at < ?`, [cutoff.toISOString()]);
    await this.dbRun(`DELETE FROM performance_snapshots WHERE created_at < ?`, [cutoff.toISOString()]);

    console.log(`🧹 Cleaned up performance data older than ${retentionDays} days`);
  }
}