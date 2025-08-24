import { DatabaseConnection } from '../database/connection';
import { DatabaseManager } from '../database/database-manager';
import * as argon2 from 'argon2';

export interface SecuritySettings {
  lockout_attempts: number;
  lockout_minutes: number;
}

export interface LockoutStatus {
  kiosk_id: string;
  locked: boolean;
  lockout_end?: number;
  attempts: number;
}

export class SettingsService {
  private connection: DatabaseConnection;

  constructor() {
    this.connection = DatabaseManager.getInstance().getConnection();
  }

  /**
   * Get current security settings
   */
  async getSecuritySettings(): Promise<SecuritySettings> {
    const rows = await this.connection.all(`
      SELECT setting_key, setting_value 
      FROM system_settings 
      WHERE setting_key IN ('lockout_attempts', 'lockout_minutes')
    `) as { setting_key: string; setting_value: string }[];
    
    const settings: SecuritySettings = {
      lockout_attempts: 5, // default
      lockout_minutes: 5   // default
    };
    
    for (const row of rows) {
      if (row.setting_key === 'lockout_attempts') {
        settings.lockout_attempts = parseInt(row.setting_value) || 5;
      } else if (row.setting_key === 'lockout_minutes') {
        settings.lockout_minutes = parseInt(row.setting_value) || 5;
      }
    }
    
    return settings;
  }

  /**
   * Update security settings
   */
  async updateSecuritySettings(settings: SecuritySettings): Promise<void> {
    await this.connection.run(`
      INSERT OR REPLACE INTO system_settings (setting_key, setting_value, updated_at)
      VALUES (?, ?, datetime('now'))
    `, ['lockout_attempts', settings.lockout_attempts.toString()]);
    
    await this.connection.run(`
      INSERT OR REPLACE INTO system_settings (setting_key, setting_value, updated_at)
      VALUES (?, ?, datetime('now'))
    `, ['lockout_minutes', settings.lockout_minutes.toString()]);
  }

  /**
   * Verify master PIN
   */
  async verifyMasterPin(pin: string): Promise<boolean> {
    try {
      const row = await this.connection.get(`
        SELECT setting_value 
        FROM system_settings 
        WHERE setting_key = 'master_pin_hash'
      `) as { setting_value: string } | undefined;
      
      if (!row) {
        // No PIN set, use default '1234'
        return pin === '1234';
      }
      
      return await argon2.verify(row.setting_value, pin);
    } catch (error) {
      console.error('Error verifying master PIN:', error);
      return false;
    }
  }

  /**
   * Change master PIN
   */
  async changeMasterPin(newPin: string): Promise<void> {
    const hashedPin = await argon2.hash(newPin);
    
    await this.connection.run(`
      INSERT OR REPLACE INTO system_settings (setting_key, setting_value, updated_at)
      VALUES ('master_pin_hash', ?, datetime('now'))
    `, [hashedPin]);
  }

  /**
   * Get lockout status for all kiosks
   */
  async getLockoutStatus(): Promise<LockoutStatus[]> {
    const now = Date.now();
    const rows = await this.connection.all(`
      SELECT kiosk_id, attempts, lockout_end
      FROM master_pin_attempts
      WHERE attempts > 0 OR lockout_end > ?
    `, [now]) as { 
      kiosk_id: string; 
      attempts: number; 
      lockout_end: number | null 
    }[];
    
    return rows.map(row => ({
      kiosk_id: row.kiosk_id,
      locked: row.lockout_end ? row.lockout_end > now : false,
      lockout_end: row.lockout_end || undefined,
      attempts: row.attempts
    }));
  }

  /**
   * Clear lockout for specific kiosk
   */
  async clearLockout(kioskId: string): Promise<void> {
    await this.connection.run(`
      DELETE FROM master_pin_attempts 
      WHERE kiosk_id = ?
    `, [kioskId]);
  }

  /**
   * Record PIN attempt
   */
  async recordPinAttempt(kioskId: string, clientIp: string, success: boolean): Promise<boolean> {
    const settings = await this.getSecuritySettings();
    
    if (success) {
      // Clear attempts on success
      await this.connection.run(`
        DELETE FROM master_pin_attempts 
        WHERE kiosk_id = ? AND client_ip = ?
      `, [kioskId, clientIp]);
      return false; // Not locked
    }
    
    // Get current attempts
    const current = await this.connection.get(`
      SELECT attempts, lockout_end 
      FROM master_pin_attempts 
      WHERE kiosk_id = ? AND client_ip = ?
    `, [kioskId, clientIp]) as { 
      attempts: number; 
      lockout_end: number | null 
    } | undefined;
    
    const now = Date.now();
    
    // Check if still locked
    if (current?.lockout_end && current.lockout_end > now) {
      return true; // Still locked
    }
    
    const newAttempts = (current?.attempts || 0) + 1;
    const isLocked = newAttempts >= settings.lockout_attempts;
    const lockoutEnd = isLocked ? now + (settings.lockout_minutes * 60 * 1000) : null;
    
    // Update attempts
    await this.connection.run(`
      INSERT OR REPLACE INTO master_pin_attempts 
      (kiosk_id, client_ip, attempts, lockout_end, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `, [kioskId, clientIp, newAttempts, lockoutEnd]);
    
    return isLocked;
  }

  /**
   * Check if kiosk/IP combination is locked
   */
  async isLocked(kioskId: string, clientIp: string): Promise<boolean> {
    const now = Date.now();
    const row = await this.connection.get(`
      SELECT lockout_end 
      FROM master_pin_attempts 
      WHERE kiosk_id = ? AND client_ip = ? AND lockout_end > ?
    `, [kioskId, clientIp, now]) as { lockout_end: number } | undefined;
    
    return !!row;
  }

  /**
   * Get remaining lockout time in seconds
   */
  async getRemainingLockoutTime(kioskId: string, clientIp: string): Promise<number> {
    const now = Date.now();
    const row = await this.connection.get(`
      SELECT lockout_end 
      FROM master_pin_attempts 
      WHERE kiosk_id = ? AND client_ip = ? AND lockout_end > ?
    `, [kioskId, clientIp, now]) as { lockout_end: number } | undefined;
    
    if (!row) return 0;
    
    return Math.ceil((row.lockout_end - now) / 1000);
  }
}