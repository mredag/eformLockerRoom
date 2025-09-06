/**
 * End-to-End Rate Limiting Tests
 * 
 * Tests that rate limiting is properly enforced and returns correct Turkish messages
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { DatabaseConnection } from '../../shared/database/connection';
import { get_rate_limiter, reset_rate_limiter } from '../../shared/services/rate-limiter';
import { getConfigurationManager, resetConfigurationManager } from '../../shared/services/configuration-manager';

describe('Rate Limiting E2E Tests', () => {
  let db: DatabaseConnection;
  let config_manager: any;

  beforeAll(async () => {
    // Initialize test database
    db = DatabaseConnection.getInstance(':memory:');
    await db.initialize();
    
    // Run migrations to set up rate limiting settings
    const migrations = [
      `CREATE TABLE IF NOT EXISTS settings_global (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        data_type TEXT NOT NULL DEFAULT 'string',
        description TEXT,
        updated_by TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS settings_kiosk (
        kiosk_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        data_type TEXT NOT NULL DEFAULT 'string',
        description TEXT,
        updated_by TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (kiosk_id, key)
      )`,
      `CREATE TABLE IF NOT EXISTS config_version (
        id INTEGER PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `INSERT OR REPLACE INTO settings_global (key, value, data_type, description) VALUES
        ('card_open_min_interval_sec', '10', 'number', 'Minimum seconds between card opens'),
        ('locker_opens_window_sec', '60', 'number', 'Time window for locker opens'),
        ('locker_opens_max_per_window', '3', 'number', 'Maximum opens per locker per window'),
        ('command_cooldown_sec', '3', 'number', 'Cooldown between relay commands'),
        ('user_report_daily_cap', '2', 'number', 'Maximum user reports per day')`,
      `INSERT OR REPLACE INTO config_version (id, version) VALUES (1, 1)`
    ];

    for (const migration of migrations) {
      await db.run(migration);
    }

    // Initialize configuration manager
    config_manager = getConfigurationManager(db);
    await config_manager.initialize();
  });

  afterAll(async () => {
    reset_rate_limiter();
    resetConfigurationManager();
    await db.close();
  });

  describe('Card Rate Limiting', () => {
    it('should allow first card scan', async () => {
      const rate_limiter = get_rate_limiter();
      
      const result = await rate_limiter.check_card_rate('test_card_001', 'kiosk_001');
      
      expect(result.allowed).toBe(true);
      expect(result.message).toBe('Rate limit passed.');
    });

    it('should block second card scan and return Turkish message', async () => {
      const rate_limiter = get_rate_limiter();
      
      // First scan - record it
      rate_limiter.record_card_open('test_card_002');
      
      // Second scan immediately - should be blocked
      const result = await rate_limiter.check_card_rate('test_card_002', 'kiosk_001');
      
      expect(result.allowed).toBe(false);
      expect(result.type).toBe('card_rate');
      expect(result.message).toBe('Lütfen birkaç saniye sonra deneyin.');
      expect(result.retry_after_seconds).toBeGreaterThan(0);
      expect(result.retry_after_seconds).toBeLessThanOrEqual(10);
    });

    it('should anonymize card ID in logs', async () => {
      const rate_limiter = get_rate_limiter();
      
      rate_limiter.record_card_open('1234567890');
      
      const result = await rate_limiter.check_card_rate('1234567890', 'kiosk_001');
      
      expect(result.allowed).toBe(false);
      expect(result.key).toBe('12****90'); // Anonymized
      expect(result.key).not.toBe('1234567890'); // Not raw card ID
    });
  });

  describe('Locker Rate Limiting', () => {
    it('should allow first 3 locker opens', async () => {
      const rate_limiter = get_rate_limiter();
      
      for (let i = 0; i < 3; i++) {
        const result = await rate_limiter.check_locker_rate(1, 'kiosk_001');
        expect(result.allowed).toBe(true);
        
        if (result.allowed) {
          await rate_limiter.record_locker_open(1, 'kiosk_001');
        }
      }
    });

    it('should block 4th locker open and return Turkish message', async () => {
      const rate_limiter = get_rate_limiter();
      
      // Fill up the locker with 3 opens
      for (let i = 0; i < 3; i++) {
        await rate_limiter.record_locker_open(2, 'kiosk_001');
      }
      
      // 4th attempt should be blocked
      const result = await rate_limiter.check_locker_rate(2, 'kiosk_001');
      
      expect(result.allowed).toBe(false);
      expect(result.type).toBe('locker_rate');
      expect(result.message).toBe('Lütfen birkaç saniye sonra deneyin.');
      expect(result.retry_after_seconds).toBeGreaterThan(0);
    });
  });

  describe('Command Cooldown', () => {
    it('should allow first command', async () => {
      const rate_limiter = get_rate_limiter();
      
      const result = await rate_limiter.check_command_cooldown('kiosk_001');
      
      expect(result.allowed).toBe(true);
      expect(result.message).toBe('Rate limit passed.');
    });

    it('should block immediate second command and return Turkish message', async () => {
      const rate_limiter = get_rate_limiter();
      
      // Record first command
      rate_limiter.record_command();
      
      // Immediate second command should be blocked
      const result = await rate_limiter.check_command_cooldown('kiosk_001');
      
      expect(result.allowed).toBe(false);
      expect(result.type).toBe('command_cooldown');
      expect(result.message).toBe('Lütfen birkaç saniye sonra deneyin.');
      expect(result.retry_after_seconds).toBeGreaterThan(0);
      expect(result.retry_after_seconds).toBeLessThanOrEqual(3);
    });
  });

  describe('User Report Rate Limiting', () => {
    it('should allow first 2 reports per day', async () => {
      const rate_limiter = get_rate_limiter();
      
      for (let i = 0; i < 2; i++) {
        const result = await rate_limiter.check_user_report_rate('test_card_reports', 'kiosk_001');
        expect(result.allowed).toBe(true);
        
        if (result.allowed) {
          rate_limiter.record_user_report('test_card_reports');
        }
      }
    });

    it('should block 3rd report and return Turkish message (not daily limit message)', async () => {
      const rate_limiter = get_rate_limiter();
      
      // Record 2 reports
      for (let i = 0; i < 2; i++) {
        rate_limiter.record_user_report('test_card_reports_2');
      }
      
      // 3rd attempt should be blocked
      const result = await rate_limiter.check_user_report_rate('test_card_reports_2', 'kiosk_001');
      
      expect(result.allowed).toBe(false);
      expect(result.type).toBe('user_report_rate');
      expect(result.message).toBe('Lütfen birkaç saniye sonra deneyin.'); // Not daily limit message
      expect(result.message).not.toBe('Günlük rapor limitine ulaştınız'); // Should not show this on kiosks
    });

    it('should handle disabled reports (cap = 0)', async () => {
      // Update config to disable reports
      await config_manager.updateGlobalConfig({ user_report_daily_cap: 0 });
      
      const rate_limiter = get_rate_limiter();
      
      const result = await rate_limiter.check_user_report_rate('test_card_disabled', 'kiosk_001');
      
      expect(result.allowed).toBe(false);
      expect(result.type).toBe('user_report_rate');
      expect(result.message).toBe('Lütfen birkaç saniye sonra deneyin.');
    });
  });

  describe('Combined Rate Limiting', () => {
    it('should check all limits for locker open operation', async () => {
      const rate_limiter = get_rate_limiter();
      
      const result = await rate_limiter.check_all_limits('test_card_combined', 10, 'kiosk_001');
      
      expect(result.allowed).toBe(true);
      expect(result.message).toBe('All rate limits passed.');
    });

    it('should fail if any limit is exceeded and return Turkish message', async () => {
      const rate_limiter = get_rate_limiter();
      
      // Exceed card rate limit
      rate_limiter.record_card_open('test_card_fail');
      
      const result = await rate_limiter.check_all_limits('test_card_fail', 11, 'kiosk_001');
      
      expect(result.allowed).toBe(false);
      expect(result.type).toBe('card_rate');
      expect(result.message).toBe('Lütfen birkaç saniye sonra deneyin.');
    });

    it('should record successful operation', async () => {
      const rate_limiter = get_rate_limiter();
      
      await rate_limiter.record_successful_open('test_card_success', 12, 'kiosk_001');
      
      // Verify all counters were updated
      const card_result = await rate_limiter.check_card_rate('test_card_success', 'kiosk_001');
      const locker_result = await rate_limiter.check_locker_rate(12, 'kiosk_001');
      const command_result = await rate_limiter.check_command_cooldown('kiosk_001');
      
      expect(card_result.allowed).toBe(false); // Card rate limit hit
      expect(locker_result.allowed).toBe(true); // Still has opens left
      expect(command_result.allowed).toBe(false); // Command cooldown hit
    });
  });

  describe('Configuration Validation', () => {
    it('should enforce validation bounds', async () => {
      // Test with out-of-bounds values
      await config_manager.updateGlobalConfig({
        card_open_min_interval_sec: 100, // Should be clamped to 60
        locker_opens_max_per_window: 20, // Should be clamped to 10
        command_cooldown_sec: 0, // Should be clamped to 1
        user_report_daily_cap: 15 // Should be clamped to 10
      });

      const rate_limiter = get_rate_limiter();
      const config = await (rate_limiter as any).get_rate_limit_config('kiosk_001');
      
      expect(config.card_open_min_interval_sec).toBe(60); // Clamped
      expect(config.locker_opens_max_per_window).toBe(10); // Clamped
      expect(config.command_cooldown_sec).toBe(1); // Clamped
      expect(config.user_report_daily_cap).toBe(10); // Clamped
    });

    it('should support hot reload within 3 seconds', async () => {
      const start_time = Date.now();
      
      // Update configuration
      await config_manager.updateGlobalConfig({
        card_open_min_interval_sec: 5
      });
      
      // Configuration should be available quickly
      const rate_limiter = get_rate_limiter();
      const config = await (rate_limiter as any).get_rate_limit_config('kiosk_001');
      
      const reload_time = Date.now() - start_time;
      
      expect(config.card_open_min_interval_sec).toBe(5);
      expect(reload_time).toBeLessThan(3000); // Hot reload requirement: ≤ 3 seconds
    });
  });

  describe('Security Requirements', () => {
    it('should not log raw card IDs', async () => {
      const rate_limiter = get_rate_limiter();
      
      // Create a violation
      rate_limiter.record_card_open('sensitive_card_123');
      await rate_limiter.check_card_rate('sensitive_card_123', 'kiosk_001');
      
      const violations = rate_limiter.get_recent_violations(1);
      
      expect(violations).toHaveLength(1);
      expect(violations[0].key).toBe('se****123'); // Anonymized
      expect(violations[0].key).not.toContain('sensitive_card_123'); // No raw card ID
    });

    it('should use consistent Turkish message format', async () => {
      const rate_limiter = get_rate_limiter();
      
      // Test all rate limit types return the same Turkish message
      rate_limiter.record_card_open('msg_test_card');
      rate_limiter.record_command();
      
      const card_result = await rate_limiter.check_card_rate('msg_test_card', 'kiosk_001');
      const command_result = await rate_limiter.check_command_cooldown('kiosk_001');
      
      expect(card_result.message).toBe('Lütfen birkaç saniye sonra deneyin.');
      expect(command_result.message).toBe('Lütfen birkaç saniye sonra deneyin.');
      
      // Both messages should be identical and end with period
      expect(card_result.message).toBe(command_result.message);
      expect(card_result.message.endsWith('.')).toBe(true);
    });
  });
});