import { Database } from 'sqlite3';
import { AuditLogEntry, WizardOperation } from './wizard-security-service';
import { SecurityAlert } from './wizard-security-monitor';

export interface SecurityAuditRecord {
  id: number;
  audit_id: string;
  timestamp: Date;
  user_id: number;
  username: string;
  operation: string;
  resource: string;
  success: boolean;
  details: any;
  ip_address: string;
  user_agent: string;
  session_id: string;
  risk_level: string;
}

export interface SecurityAlertRecord {
  id: number;
  alert_id: string;
  timestamp: Date;
  severity: string;
  type: string;
  message: string;
  user_id?: number;
  username?: string;
  session_id?: string;
  ip_address?: string;
  user_agent?: string;
  details: any;
  resolved: boolean;
  resolved_at?: Date;
  resolved_by?: string;
}

export interface SecurityMetricsRecord {
  id: number;
  date: string;
  total_operations: number;
  failed_operations: number;
  suspicious_activities: number;
  rate_limit_violations: number;
  emergency_stops: number;
  active_alerts: number;
  unique_users: number;
  unique_ips: number;
}

export interface ConfigChangeRecord {
  id: number;
  change_id: string;
  timestamp: Date;
  user_id: number;
  username: string;
  session_id?: string;
  change_type: string;
  resource_type: string;
  resource_id?: string;
  old_value?: any;
  new_value?: any;
  success: boolean;
  error_message?: string;
  rollback_data?: any;
}

export class WizardSecurityDatabase {
  constructor(private db: Database) {}

  /**
   * Store audit log entry in database
   */
  async storeAuditEntry(entry: AuditLogEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO wizard_security_audit (
          audit_id, timestamp, user_id, username, operation, resource,
          success, details, ip_address, user_agent, session_id, risk_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(
        sql,
        [
          entry.id,
          entry.timestamp.toISOString(),
          entry.userId,
          entry.username,
          entry.operation,
          entry.resource,
          entry.success ? 1 : 0,
          JSON.stringify(entry.details),
          entry.ipAddress,
          entry.userAgent,
          entry.sessionId,
          entry.riskLevel
        ],
        (err) => {
          if (err) {
            console.error('Failed to store audit entry:', err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Store security alert in database
   */
  async storeSecurityAlert(alert: SecurityAlert): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO wizard_security_alerts (
          alert_id, timestamp, severity, type, message, user_id, username,
          session_id, ip_address, user_agent, details, resolved
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(
        sql,
        [
          alert.id,
          alert.timestamp.toISOString(),
          alert.severity,
          alert.type,
          alert.message,
          alert.context?.userId || null,
          alert.context?.username || null,
          alert.context?.sessionId || null,
          alert.context?.ipAddress || null,
          alert.context?.userAgent || null,
          JSON.stringify(alert.details),
          alert.resolved ? 1 : 0
        ],
        (err) => {
          if (err) {
            console.error('Failed to store security alert:', err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Update security alert resolution status
   */
  async resolveSecurityAlert(alertId: string, resolvedBy: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE wizard_security_alerts 
        SET resolved = 1, resolved_at = ?, resolved_by = ?
        WHERE alert_id = ? AND resolved = 0
      `;

      this.db.run(
        sql,
        [new Date().toISOString(), resolvedBy, alertId],
        function(err) {
          if (err) {
            console.error('Failed to resolve security alert:', err);
            reject(err);
          } else {
            resolve(this.changes > 0);
          }
        }
      );
    });
  }

  /**
   * Get audit log entries with filtering
   */
  async getAuditEntries(filters: {
    userId?: number;
    operation?: WizardOperation;
    success?: boolean;
    riskLevel?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<SecurityAuditRecord[]> {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM wizard_security_audit WHERE 1=1';
      const params: any[] = [];

      if (filters.userId !== undefined) {
        sql += ' AND user_id = ?';
        params.push(filters.userId);
      }

      if (filters.operation) {
        sql += ' AND operation = ?';
        params.push(filters.operation);
      }

      if (filters.success !== undefined) {
        sql += ' AND success = ?';
        params.push(filters.success ? 1 : 0);
      }

      if (filters.riskLevel) {
        sql += ' AND risk_level = ?';
        params.push(filters.riskLevel);
      }

      if (filters.startDate) {
        sql += ' AND timestamp >= ?';
        params.push(filters.startDate.toISOString());
      }

      if (filters.endDate) {
        sql += ' AND timestamp <= ?';
        params.push(filters.endDate.toISOString());
      }

      sql += ' ORDER BY timestamp DESC';

      if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
      }

      if (filters.offset) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }

      this.db.all(sql, params, (err, rows: any[]) => {
        if (err) {
          console.error('Failed to get audit entries:', err);
          reject(err);
        } else {
          const entries = rows.map(row => ({
            ...row,
            timestamp: new Date(row.timestamp),
            success: row.success === 1,
            details: JSON.parse(row.details || '{}')
          }));
          resolve(entries);
        }
      });
    });
  }

  /**
   * Get security alerts with filtering
   */
  async getSecurityAlerts(filters: {
    severity?: string;
    type?: string;
    resolved?: boolean;
    userId?: number;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<SecurityAlertRecord[]> {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM wizard_security_alerts WHERE 1=1';
      const params: any[] = [];

      if (filters.severity) {
        sql += ' AND severity = ?';
        params.push(filters.severity);
      }

      if (filters.type) {
        sql += ' AND type = ?';
        params.push(filters.type);
      }

      if (filters.resolved !== undefined) {
        sql += ' AND resolved = ?';
        params.push(filters.resolved ? 1 : 0);
      }

      if (filters.userId !== undefined) {
        sql += ' AND user_id = ?';
        params.push(filters.userId);
      }

      if (filters.startDate) {
        sql += ' AND timestamp >= ?';
        params.push(filters.startDate.toISOString());
      }

      if (filters.endDate) {
        sql += ' AND timestamp <= ?';
        params.push(filters.endDate.toISOString());
      }

      sql += ' ORDER BY timestamp DESC';

      if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
      }

      if (filters.offset) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }

      this.db.all(sql, params, (err, rows: any[]) => {
        if (err) {
          console.error('Failed to get security alerts:', err);
          reject(err);
        } else {
          const alerts = rows.map(row => ({
            ...row,
            timestamp: new Date(row.timestamp),
            resolved: row.resolved === 1,
            resolved_at: row.resolved_at ? new Date(row.resolved_at) : undefined,
            details: JSON.parse(row.details || '{}')
          }));
          resolve(alerts);
        }
      });
    });
  }

  /**
   * Get security metrics for date range
   */
  async getSecurityMetrics(startDate?: Date, endDate?: Date): Promise<SecurityMetricsRecord[]> {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM wizard_security_metrics WHERE 1=1';
      const params: any[] = [];

      if (startDate) {
        sql += ' AND date >= ?';
        params.push(startDate.toISOString().split('T')[0]);
      }

      if (endDate) {
        sql += ' AND date <= ?';
        params.push(endDate.toISOString().split('T')[0]);
      }

      sql += ' ORDER BY date DESC';

      this.db.all(sql, params, (err, rows: any[]) => {
        if (err) {
          console.error('Failed to get security metrics:', err);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Store configuration change
   */
  async storeConfigChange(change: {
    changeId: string;
    userId: number;
    username: string;
    sessionId?: string;
    changeType: string;
    resourceType: string;
    resourceId?: string;
    oldValue?: any;
    newValue?: any;
    success: boolean;
    errorMessage?: string;
    rollbackData?: any;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO wizard_config_changes (
          change_id, timestamp, user_id, username, session_id, change_type,
          resource_type, resource_id, old_value, new_value, success,
          error_message, rollback_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(
        sql,
        [
          change.changeId,
          new Date().toISOString(),
          change.userId,
          change.username,
          change.sessionId || null,
          change.changeType,
          change.resourceType,
          change.resourceId || null,
          change.oldValue ? JSON.stringify(change.oldValue) : null,
          change.newValue ? JSON.stringify(change.newValue) : null,
          change.success ? 1 : 0,
          change.errorMessage || null,
          change.rollbackData ? JSON.stringify(change.rollbackData) : null
        ],
        (err) => {
          if (err) {
            console.error('Failed to store config change:', err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Get configuration changes
   */
  async getConfigChanges(filters: {
    userId?: number;
    changeType?: string;
    resourceType?: string;
    success?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  } = {}): Promise<ConfigChangeRecord[]> {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM wizard_config_changes WHERE 1=1';
      const params: any[] = [];

      if (filters.userId !== undefined) {
        sql += ' AND user_id = ?';
        params.push(filters.userId);
      }

      if (filters.changeType) {
        sql += ' AND change_type = ?';
        params.push(filters.changeType);
      }

      if (filters.resourceType) {
        sql += ' AND resource_type = ?';
        params.push(filters.resourceType);
      }

      if (filters.success !== undefined) {
        sql += ' AND success = ?';
        params.push(filters.success ? 1 : 0);
      }

      if (filters.startDate) {
        sql += ' AND timestamp >= ?';
        params.push(filters.startDate.toISOString());
      }

      if (filters.endDate) {
        sql += ' AND timestamp <= ?';
        params.push(filters.endDate.toISOString());
      }

      sql += ' ORDER BY timestamp DESC';

      if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
      }

      this.db.all(sql, params, (err, rows: any[]) => {
        if (err) {
          console.error('Failed to get config changes:', err);
          reject(err);
        } else {
          const changes = rows.map(row => ({
            ...row,
            timestamp: new Date(row.timestamp),
            success: row.success === 1,
            old_value: row.old_value ? JSON.parse(row.old_value) : undefined,
            new_value: row.new_value ? JSON.parse(row.new_value) : undefined,
            rollback_data: row.rollback_data ? JSON.parse(row.rollback_data) : undefined
          }));
          resolve(changes);
        }
      });
    });
  }

  /**
   * Store emergency stop event
   */
  async storeEmergencyStop(stop: {
    stopId: string;
    userId: number;
    username: string;
    sessionId?: string;
    reason: string;
    affectedSessions?: string[];
    recoveryActions?: string[];
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO wizard_emergency_stops (
          stop_id, timestamp, user_id, username, session_id, reason,
          affected_sessions, recovery_actions, resolved
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(
        sql,
        [
          stop.stopId,
          new Date().toISOString(),
          stop.userId,
          stop.username,
          stop.sessionId || null,
          stop.reason,
          stop.affectedSessions ? JSON.stringify(stop.affectedSessions) : null,
          stop.recoveryActions ? JSON.stringify(stop.recoveryActions) : null,
          0 // Not resolved initially
        ],
        (err) => {
          if (err) {
            console.error('Failed to store emergency stop:', err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Update rate limit tracking
   */
  async updateRateLimit(userId: number, operation: string, windowMs: number): Promise<{
    allowed: boolean;
    currentCount: number;
    resetTime: Date;
  }> {
    return new Promise((resolve, reject) => {
      const now = new Date();
      const windowStart = new Date(now.getTime() - windowMs);
      const windowEnd = new Date(now.getTime() + windowMs);

      // Clean up old entries first
      this.db.run(
        'DELETE FROM wizard_rate_limits WHERE window_end < ?',
        [now.toISOString()],
        (err) => {
          if (err) {
            console.error('Failed to clean up rate limits:', err);
            reject(err);
            return;
          }

          // Check current count
          this.db.get(
            `SELECT request_count, window_end FROM wizard_rate_limits 
             WHERE user_id = ? AND operation = ? AND window_start >= ?`,
            [userId, operation, windowStart.toISOString()],
            (err, row: any) => {
              if (err) {
                console.error('Failed to check rate limit:', err);
                reject(err);
                return;
              }

              if (row) {
                // Update existing entry
                this.db.run(
                  `UPDATE wizard_rate_limits 
                   SET request_count = request_count + 1 
                   WHERE user_id = ? AND operation = ? AND window_start >= ?`,
                  [userId, operation, windowStart.toISOString()],
                  (err) => {
                    if (err) {
                      console.error('Failed to update rate limit:', err);
                      reject(err);
                    } else {
                      resolve({
                        allowed: true, // Let the application logic decide
                        currentCount: row.request_count + 1,
                        resetTime: new Date(row.window_end)
                      });
                    }
                  }
                );
              } else {
                // Create new entry
                this.db.run(
                  `INSERT INTO wizard_rate_limits 
                   (user_id, operation, request_count, window_start, window_end) 
                   VALUES (?, ?, 1, ?, ?)`,
                  [userId, operation, now.toISOString(), windowEnd.toISOString()],
                  (err) => {
                    if (err) {
                      console.error('Failed to create rate limit entry:', err);
                      reject(err);
                    } else {
                      resolve({
                        allowed: true,
                        currentCount: 1,
                        resetTime: windowEnd
                      });
                    }
                  }
                );
              }
            }
          );
        }
      );
    });
  }

  /**
   * Get security dashboard summary
   */
  async getSecuritySummary(): Promise<{
    todayMetrics: SecurityMetricsRecord | null;
    activeAlerts: number;
    recentAuditCount: number;
    topOperations: { operation: string; count: number }[];
    topUsers: { username: string; count: number }[];
  }> {
    return new Promise((resolve, reject) => {
      const today = new Date().toISOString().split('T')[0];
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Get today's metrics
      this.db.get(
        'SELECT * FROM wizard_security_metrics WHERE date = ?',
        [today],
        (err, todayMetrics: any) => {
          if (err) {
            reject(err);
            return;
          }

          // Get active alerts count
          this.db.get(
            'SELECT COUNT(*) as count FROM wizard_security_alerts WHERE resolved = 0',
            (err, alertsResult: any) => {
              if (err) {
                reject(err);
                return;
              }

              // Get recent audit count
              this.db.get(
                'SELECT COUNT(*) as count FROM wizard_security_audit WHERE timestamp >= ?',
                [last24Hours],
                (err, auditResult: any) => {
                  if (err) {
                    reject(err);
                    return;
                  }

                  // Get top operations
                  this.db.all(
                    `SELECT operation, COUNT(*) as count 
                     FROM wizard_security_audit 
                     WHERE timestamp >= ? 
                     GROUP BY operation 
                     ORDER BY count DESC 
                     LIMIT 5`,
                    [last24Hours],
                    (err, operations: any[]) => {
                      if (err) {
                        reject(err);
                        return;
                      }

                      // Get top users
                      this.db.all(
                        `SELECT username, COUNT(*) as count 
                         FROM wizard_security_audit 
                         WHERE timestamp >= ? 
                         GROUP BY username 
                         ORDER BY count DESC 
                         LIMIT 5`,
                        [last24Hours],
                        (err, users: any[]) => {
                          if (err) {
                            reject(err);
                            return;
                          }

                          resolve({
                            todayMetrics,
                            activeAlerts: alertsResult.count,
                            recentAuditCount: auditResult.count,
                            topOperations: operations,
                            topUsers: users
                          });
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    });
  }
}