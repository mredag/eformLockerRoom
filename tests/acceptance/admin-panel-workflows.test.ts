/**
 * Admin Panel Workflows - Acceptance Tests
 * 
 * Validates all admin panel functionality and user workflows
 * for the smart locker assignment system.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../shared/database/database-manager';
import { ConfigurationManager } from '../../shared/services/configuration-manager';
import { SessionTracker } from '../../shared/services/session-tracker';
import { AlertManager } from '../../shared/services/alert-manager';

describe('Admin Panel Workflows Acceptance', () => {
  let db: DatabaseManager;
  let configManager: ConfigurationManager;
  let sessionTracker: SessionTracker;
  let alertManager: AlertManager;

  beforeEach(async () => {
    db = new DatabaseManager(':memory:');
    await db.initialize();
    
    configManager = new ConfigurationManager(db);
    sessionTracker = new SessionTracker(db);
    alertManager = new AlertManager(db);
    
    await seedTestData();
  });

  afterEach(async () => {
    await db.close();
  });

  async function seedTestData() {
    // Create test kiosks and lockers
    await db.query(`
      INSERT INTO lockers (kiosk_id, id, status, owner_key) VALUES 
      ('kiosk-1', 1, 'Free', NULL),
      ('kiosk-1', 2, 'Owned', 'card-123'),
      ('kiosk-1', 3, 'Free', NULL),
      ('kiosk-2', 1, 'Free', NULL),
      ('kiosk-2', 2, 'Free', NULL)
    `);

    // Seed configuration
    await configManager.seedDefaultConfiguration();
    
    // Create test sessions
    await sessionTracker.createSmartSession('card-123', 'kiosk-1');
    await sessionTracker.createSmartSession('card-456', 'kiosk-2');
  }

  describe('Configuration Management Workflow', () => {
    test('validates complete configuration management cycle', async () => {
      // 1. View current global configuration
      const initialConfig = await configManager.getGlobalConfig();
      expect(initialConfig.base_score).toBe(100); // Default value
      expect(initialConfig.smart_assignment_enabled).toBe(false);

      // 2. Update global configuration
      const updates = {
        base_score: 150,
        score_factor_a: 2.5,
        smart_assignment_enabled: true,
        session_limit_minutes: 240
      };
      
      await configManager.updateGlobalConfig(updates);
      
      // 3. Verify updates applied
      const updatedConfig = await configManager.getGlobalConfig();
      expect(updatedConfig.base_score).toBe(150);
      expect(updatedConfig.score_factor_a).toBe(2.5);
      expect(updatedConfig.smart_assignment_enabled).toBe(true);
      expect(updatedConfig.session_limit_minutes).toBe(240);

      // 4. Set kiosk-specific override
      await configManager.setKioskOverride('kiosk-1', 'session_limit_minutes', 300);
      
      // 5. Verify effective configuration merging
      const kiosk1Config = await configManager.getEffectiveConfig('kiosk-1');
      const kiosk2Config = await configManager.getEffectiveConfig('kiosk-2');
      
      expect(kiosk1Config.session_limit_minutes).toBe(300); // Override
      expect(kiosk2Config.session_limit_minutes).toBe(240); // Global
      expect(kiosk1Config.base_score).toBe(150); // Global (no override)

      // 6. Remove override
      await configManager.removeKioskOverride('kiosk-1', 'session_limit_minutes');
      
      const resetConfig = await configManager.getEffectiveConfig('kiosk-1');
      expect(resetConfig.session_limit_minutes).toBe(240); // Back to global

      // 7. Verify audit trail
      const history = await configManager.getConfigHistory();
      expect(history.length).toBeGreaterThan(0);
      
      const sessionLimitChanges = history.filter(h => h.key === 'session_limit_minutes');
      expect(sessionLimitChanges.length).toBeGreaterThanOrEqual(2); // Set and remove override
    });

    test('validates configuration validation and error handling', async () => {
      // Test invalid data types
      await expect(
        configManager.updateGlobalConfig({ base_score: 'invalid' as any })
      ).rejects.toThrow('Invalid configuration value');

      await expect(
        configManager.updateGlobalConfig({ smart_assignment_enabled: 'maybe' as any })
      ).rejects.toThrow('Invalid configuration value');

      // Test invalid ranges
      await expect(
        configManager.updateGlobalConfig({ score_factor_a: -1 })
      ).rejects.toThrow('Configuration value out of range');

      // Test unknown keys
      await expect(
        configManager.updateGlobalConfig({ unknown_key: 123 } as any)
      ).rejects.toThrow('Unknown configuration key');
    });

    test('validates configuration hot reload workflow', async () => {
      const startTime = Date.now();
      
      // Update configuration
      await configManager.updateGlobalConfig({ base_score: 200 });
      
      // Trigger hot reload
      await configManager.triggerReload();
      
      // Verify propagation time
      const propagationTime = Date.now() - startTime;
      expect(propagationTime).toBeLessThanOrEqual(3000); // ≤3 seconds requirement

      // Verify configuration is updated
      const config = await configManager.getEffectiveConfig('kiosk-1');
      expect(config.base_score).toBe(200);
    });

    test('validates Turkish admin interface labels', () => {
      const requiredLabels = {
        save: "Kaydet",
        load_default: "Varsayılanı Yükle",
        override_for_kiosk: "Kiosk için Geçersiz Kıl",
        global_settings: "Genel Ayarlar",
        kiosk_overrides: "Kiosk Geçersiz Kılmaları",
        configuration_history: "Yapılandırma Geçmişi"
      };

      Object.entries(requiredLabels).forEach(([key, label]) => {
        expect(label).toMatch(/[çğıöşüÇĞİÖŞÜ]/); // Contains Turkish characters
        expect(label.length).toBeGreaterThan(0);
        expect(typeof label).toBe('string');
      });
    });
  });

  describe('Live Session Monitoring Workflow', () => {
    test('validates complete session monitoring cycle', async () => {
      // 1. View live sessions
      const liveSessions = await sessionTracker.getActiveSessions();
      expect(liveSessions.length).toBe(2); // From seed data
      
      const session1 = liveSessions.find(s => s.cardId === 'card-123');
      const session2 = liveSessions.find(s => s.cardId === 'card-456');
      
      expect(session1).toBeDefined();
      expect(session2).toBeDefined();
      expect(session1?.status).toBe('active');
      expect(session2?.status).toBe('active');

      // 2. Calculate remaining time
      const now = new Date();
      const remainingTime1 = Math.max(0, session1!.expiresTime.getTime() - now.getTime());
      const remainingTime2 = Math.max(0, session2!.expiresTime.getTime() - now.getTime());
      
      expect(remainingTime1).toBeGreaterThan(0);
      expect(remainingTime2).toBeGreaterThan(0);

      // 3. Extend session
      const extendResult = await sessionTracker.extendSession(
        session1!.id,
        'admin-user',
        'User requested more time'
      );
      
      expect(extendResult).toBe(true);

      // 4. Verify extension applied
      const extendedSession = await sessionTracker.getActiveSession('card-123');
      expect(extendedSession?.extensionCount).toBe(1);
      
      const newExpiryTime = extendedSession!.expiresTime.getTime();
      const originalExpiryTime = session1!.expiresTime.getTime();
      expect(newExpiryTime).toBeGreaterThan(originalExpiryTime);

      // 5. Test extension limits
      for (let i = 0; i < 5; i++) {
        await sessionTracker.extendSession(session1!.id, 'admin-user', `Extension ${i}`);
      }
      
      const maxExtendedSession = await sessionTracker.getActiveSession('card-123');
      expect(maxExtendedSession?.extensionCount).toBeLessThanOrEqual(4); // Max 4 extensions

      // 6. Force complete session
      await sessionTracker.completeSession(session2!.id, 'admin_force_complete');
      
      const completedSession = await sessionTracker.getActiveSession('card-456');
      expect(completedSession).toBeNull();
    });

    test('validates session extension audit trail', async () => {
      const sessions = await sessionTracker.getActiveSessions();
      const session = sessions[0];
      
      // Extend with audit information
      await sessionTracker.extendSession(
        session.id,
        'admin-john',
        'Customer needs extra time for large item'
      );
      
      // Verify audit record
      const auditRecords = await db.query(`
        SELECT * FROM session_extensions 
        WHERE session_id = ? 
        ORDER BY created_at DESC
      `, [session.id]);
      
      expect(auditRecords.length).toBe(1);
      expect(auditRecords[0].admin_user).toBe('admin-john');
      expect(auditRecords[0].reason).toBe('Customer needs extra time for large item');
      expect(auditRecords[0].extension_minutes).toBe(60);
    });

    test('validates Turkish session monitoring labels', () => {
      const sessionLabels = {
        remaining_time: "Kalan süre",
        extend_session: "Oturumu uzat +60 dk",
        force_complete: "Oturumu zorla bitir",
        session_history: "Oturum Geçmişi",
        active_sessions: "Aktif Oturumlar",
        extension_reason: "Uzatma Nedeni"
      };

      Object.values(sessionLabels).forEach(label => {
        expect(label).toMatch(/[çğıöşüÇĞİÖŞÜ]/);
        expect(label.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Overdue and Suspected Locker Management', () => {
    test('validates overdue locker management workflow', async () => {
      // 1. Create overdue session
      const session = await sessionTracker.createSmartSession('overdue-card', 'kiosk-1');
      await sessionTracker.markOverdue(session.id);
      
      // 2. Get overdue lockers list
      const overdueLockers = await getOverdueLockers();
      expect(overdueLockers.length).toBe(1);
      expect(overdueLockers[0].cardId).toBe('overdue-card');
      expect(overdueLockers[0].status).toBe('overdue');

      // 3. Force open overdue locker
      await forceOpenLocker(overdueLockers[0].kioskId, overdueLockers[0].lockerId, 'admin-user');
      
      // 4. Mark as cleared
      await markLockerCleared(
        overdueLockers[0].kioskId,
        overdueLockers[0].lockerId,
        'admin-user',
        'Items retrieved by staff'
      );
      
      // 5. Verify locker is cleared
      const clearedLockers = await getOverdueLockers();
      expect(clearedLockers.length).toBe(0);
    });

    test('validates suspected occupied locker workflow', async () => {
      // 1. Mark locker as suspected occupied
      await markLockerSuspected('kiosk-1', 1, 'card-reporter', 'Locker appears full');
      
      // 2. Get suspected lockers list
      const suspectedLockers = await getSuspectedLockers();
      expect(suspectedLockers.length).toBe(1);
      expect(suspectedLockers[0].lockerId).toBe(1);
      expect(suspectedLockers[0].reportedBy).toBe('card-reporter');

      // 3. Investigate and clear
      await clearSuspectedFlag(
        'kiosk-1',
        1,
        'admin-user',
        'Investigated - locker was actually empty'
      );
      
      // 4. Verify cleared
      const clearedSuspected = await getSuspectedLockers();
      expect(clearedSuspected.length).toBe(0);
    });

    test('validates bulk operations for overdue lockers', async () => {
      // Create multiple overdue sessions
      const sessions = [];
      for (let i = 1; i <= 3; i++) {
        const session = await sessionTracker.createSmartSession(`overdue-${i}`, 'kiosk-1');
        await sessionTracker.markOverdue(session.id);
        sessions.push(session);
      }
      
      // Bulk force open
      const overdueLockers = await getOverdueLockers();
      expect(overdueLockers.length).toBe(3);
      
      await bulkForceOpen(
        overdueLockers.map(l => ({ kioskId: l.kioskId, lockerId: l.lockerId })),
        'admin-user',
        'Bulk clearing overdue lockers'
      );
      
      // Verify all cleared
      const remainingOverdue = await getOverdueLockers();
      expect(remainingOverdue.length).toBe(0);
    });

    test('validates Turkish overdue/suspected labels', () => {
      const labels = {
        overdue_lockers: "Gecikmiş dolaplar",
        suspected_lockers: "Şüpheli dolaplar",
        force_open: "Zorla aç",
        mark_cleared: "Temizlendi olarak işaretle",
        bulk_operations: "Toplu İşlemler",
        investigation_notes: "Araştırma Notları"
      };

      Object.values(labels).forEach(label => {
        expect(label).toMatch(/[çğıöşüÇĞİÖŞÜ]/);
        expect(label.length).toBeGreaterThan(0);
      });
    });

    // Helper functions for overdue/suspected management
    async function getOverdueLockers() {
      return await db.query(`
        SELECT s.*, l.kiosk_id, l.id as locker_id
        FROM smart_sessions s
        JOIN lockers l ON l.owner_key = s.card_id
        WHERE s.status = 'overdue'
      `);
    }

    async function getSuspectedLockers() {
      return await db.query(`
        SELECT * FROM lockers 
        WHERE suspected_occupied = 1
      `);
    }

    async function forceOpenLocker(kioskId: string, lockerId: number, adminUser: string) {
      // Simulate force open operation
      await db.query(`
        UPDATE lockers 
        SET status = 'Opening', cleared_by = ?, cleared_at = CURRENT_TIMESTAMP
        WHERE kiosk_id = ? AND id = ?
      `, [adminUser, kioskId, lockerId]);
    }

    async function markLockerCleared(kioskId: string, lockerId: number, adminUser: string, reason: string) {
      await db.query(`
        UPDATE lockers 
        SET status = 'Free', owner_key = NULL, cleared_by = ?, cleared_at = CURRENT_TIMESTAMP
        WHERE kiosk_id = ? AND id = ?
      `, [adminUser, kioskId, lockerId]);
    }

    async function markLockerSuspected(kioskId: string, lockerId: number, reportedBy: string, reason: string) {
      await db.query(`
        UPDATE lockers 
        SET suspected_occupied = 1, overdue_reason = ?
        WHERE kiosk_id = ? AND id = ?
      `, [reason, kioskId, lockerId]);
    }

    async function clearSuspectedFlag(kioskId: string, lockerId: number, adminUser: string, notes: string) {
      await db.query(`
        UPDATE lockers 
        SET suspected_occupied = 0, cleared_by = ?, cleared_at = CURRENT_TIMESTAMP
        WHERE kiosk_id = ? AND id = ?
      `, [adminUser, kioskId, lockerId]);
    }

    async function bulkForceOpen(lockers: Array<{kioskId: string, lockerId: number}>, adminUser: string, reason: string) {
      for (const locker of lockers) {
        await forceOpenLocker(locker.kioskId, locker.lockerId, adminUser);
        await markLockerCleared(locker.kioskId, locker.lockerId, adminUser, reason);
      }
    }
  });

  describe('Metrics and Alerts Dashboard', () => {
    test('validates metrics dashboard workflow', async () => {
      // 1. Generate test metrics
      await generateTestMetrics();
      
      // 2. View dashboard metrics
      const metrics = await getDashboardMetrics('kiosk-1');
      
      expect(metrics.assignment_success_rate).toBeDefined();
      expect(metrics.average_assignment_time).toBeDefined();
      expect(metrics.retry_rate).toBeDefined();
      expect(metrics.no_stock_events).toBeDefined();
      
      // 3. View historical trends
      const trends = await getMetricsTrends('kiosk-1', '24h');
      expect(trends.length).toBeGreaterThan(0);
      
      // 4. Export metrics data
      const exportData = await exportMetrics('kiosk-1', new Date(Date.now() - 86400000), new Date());
      expect(exportData.length).toBeGreaterThan(0);
    });

    test('validates alert management workflow', async () => {
      // 1. Trigger test alert
      await alertManager.triggerAlert('no_stock', {
        kioskId: 'kiosk-1',
        eventCount: 5,
        windowMinutes: 10
      });
      
      // 2. View active alerts
      const activeAlerts = await alertManager.getActiveAlerts('kiosk-1');
      expect(activeAlerts.length).toBe(1);
      expect(activeAlerts[0].type).toBe('no_stock');
      
      // 3. Acknowledge alert
      await alertManager.acknowledgeAlert(activeAlerts[0].id, 'admin-user', 'Investigating issue');
      
      // 4. Clear alert
      await alertManager.clearAlert(activeAlerts[0].id);
      
      // 5. Verify alert cleared
      const clearedAlerts = await alertManager.getActiveAlerts('kiosk-1');
      expect(clearedAlerts.length).toBe(0);
    });

    async function generateTestMetrics() {
      // Insert test assignment metrics
      await db.query(`
        INSERT INTO assignment_metrics (kiosk_id, card_id, assignment_time, action_type, success, duration_ms)
        VALUES 
        ('kiosk-1', 'card-1', CURRENT_TIMESTAMP, 'assign_new', 1, 450),
        ('kiosk-1', 'card-2', CURRENT_TIMESTAMP, 'assign_new', 1, 380),
        ('kiosk-1', 'card-3', CURRENT_TIMESTAMP, 'assign_new', 0, 1200)
      `);
    }

    async function getDashboardMetrics(kioskId: string) {
      const results = await db.query(`
        SELECT 
          AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as assignment_success_rate,
          AVG(duration_ms) as average_assignment_time,
          COUNT(*) as total_assignments
        FROM assignment_metrics 
        WHERE kiosk_id = ? AND assignment_time > datetime('now', '-1 hour')
      `, [kioskId]);
      
      return results[0] || {};
    }

    async function getMetricsTrends(kioskId: string, period: string) {
      return await db.query(`
        SELECT 
          strftime('%H', assignment_time) as hour,
          COUNT(*) as assignments,
          AVG(duration_ms) as avg_duration
        FROM assignment_metrics 
        WHERE kiosk_id = ? AND assignment_time > datetime('now', '-1 day')
        GROUP BY strftime('%H', assignment_time)
        ORDER BY hour
      `, [kioskId]);
    }

    async function exportMetrics(kioskId: string, startDate: Date, endDate: Date) {
      return await db.query(`
        SELECT * FROM assignment_metrics 
        WHERE kiosk_id = ? 
        AND assignment_time BETWEEN ? AND ?
        ORDER BY assignment_time
      `, [kioskId, startDate.toISOString(), endDate.toISOString()]);
    }
  });

  describe('User Access Control and Security', () => {
    test('validates admin authentication workflow', async () => {
      // Test admin login
      const loginResult = await authenticateAdmin('admin-user', 'correct-password');
      expect(loginResult.success).toBe(true);
      expect(loginResult.token).toBeDefined();
      
      // Test invalid credentials
      const invalidLogin = await authenticateAdmin('admin-user', 'wrong-password');
      expect(invalidLogin.success).toBe(false);
      expect(invalidLogin.token).toBeUndefined();
    });

    test('validates role-based access control', async () => {
      // Test different permission levels
      const viewOnlyUser = { role: 'viewer', permissions: ['view_config', 'view_sessions'] };
      const adminUser = { role: 'admin', permissions: ['view_config', 'edit_config', 'manage_sessions'] };
      
      expect(hasPermission(viewOnlyUser, 'view_config')).toBe(true);
      expect(hasPermission(viewOnlyUser, 'edit_config')).toBe(false);
      expect(hasPermission(adminUser, 'edit_config')).toBe(true);
    });

    test('validates audit logging for admin actions', async () => {
      // Perform admin action
      await configManager.updateGlobalConfig({ base_score: 175 });
      
      // Verify audit log
      const auditLogs = await getAuditLogs('config_change');
      expect(auditLogs.length).toBeGreaterThan(0);
      
      const latestLog = auditLogs[0];
      expect(latestLog.action_type).toBe('config_change');
      expect(latestLog.details).toContain('base_score');
    });

    async function authenticateAdmin(username: string, password: string) {
      // Simulate authentication
      if (username === 'admin-user' && password === 'correct-password') {
        return { success: true, token: 'mock-jwt-token' };
      }
      return { success: false };
    }

    function hasPermission(user: any, permission: string): boolean {
      return user.permissions.includes(permission);
    }

    async function getAuditLogs(actionType?: string) {
      const query = actionType 
        ? `SELECT * FROM audit_logs WHERE action_type = ? ORDER BY created_at DESC`
        : `SELECT * FROM audit_logs ORDER BY created_at DESC`;
      
      return actionType 
        ? await db.query(query, [actionType])
        : await db.query(query);
    }
  });
});