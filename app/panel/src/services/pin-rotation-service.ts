import { DatabaseManager } from '../../../../shared/database/database-manager';
import { SessionManager } from './session-manager';
import argon2 from 'argon2';

export interface PinRotationConfig {
  rotationDays: number;
  warningDays: number;
  enforceRotation: boolean;
  minPinLength: number;
  maxPinLength: number;
  preventReuse: boolean;
  reuseHistoryCount: number;
}

const DEFAULT_PIN_ROTATION_CONFIG: PinRotationConfig = {
  rotationDays: 90,
  warningDays: 7,
  enforceRotation: true,
  minPinLength: 4,
  maxPinLength: 10,
  preventReuse: true,
  reuseHistoryCount: 5
};

export interface PinRotationStatus {
  userId: number;
  username: string;
  pinExpiresAt: Date;
  daysUntilExpiry: number;
  isExpired: boolean;
  requiresChange: boolean;
  warningLevel: 'none' | 'warning' | 'urgent' | 'expired';
}

export class PinRotationService {
  private config: PinRotationConfig;
  private dbManager: DatabaseManager;
  private sessionManager: SessionManager;

  constructor(
    dbManager: DatabaseManager, 
    sessionManager: SessionManager,
    config?: Partial<PinRotationConfig>
  ) {
    this.dbManager = dbManager;
    this.sessionManager = sessionManager;
    this.config = { ...DEFAULT_PIN_ROTATION_CONFIG, ...config };
  }

  /**
   * Check PIN rotation status for a user
   */
  async checkPinRotationStatus(userId: number): Promise<PinRotationStatus> {
    const db = this.dbManager.getDatabase();
    
    const user = await db.get(`
      SELECT id, username, pin_expires_at 
      FROM staff_users 
      WHERE id = ?
    `, [userId]);

    if (!user) {
      throw new Error('User not found');
    }

    const now = new Date();
    const expiresAt = user.pin_expires_at ? new Date(user.pin_expires_at) : new Date(0);
    const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isExpired = now > expiresAt;

    let warningLevel: 'none' | 'warning' | 'urgent' | 'expired' = 'none';
    if (isExpired) {
      warningLevel = 'expired';
    } else if (daysUntilExpiry <= 1) {
      warningLevel = 'urgent';
    } else if (daysUntilExpiry <= this.config.warningDays) {
      warningLevel = 'warning';
    }

    return {
      userId: user.id,
      username: user.username,
      pinExpiresAt: expiresAt,
      daysUntilExpiry,
      isExpired,
      requiresChange: isExpired && this.config.enforceRotation,
      warningLevel
    };
  }

  /**
   * Get all users requiring PIN rotation
   */
  async getUsersRequiringRotation(): Promise<PinRotationStatus[]> {
    const db = this.dbManager.getDatabase();
    
    const users = await db.all(`
      SELECT id, username, pin_expires_at 
      FROM staff_users 
      WHERE is_active = 1
    `);

    const statuses: PinRotationStatus[] = [];
    
    for (const user of users) {
      const status = await this.checkPinRotationStatus(user.id);
      if (status.warningLevel !== 'none') {
        statuses.push(status);
      }
    }

    return statuses.sort((a, b) => {
      // Sort by urgency: expired first, then by days until expiry
      if (a.isExpired && !b.isExpired) return -1;
      if (!a.isExpired && b.isExpired) return 1;
      return a.daysUntilExpiry - b.daysUntilExpiry;
    });
  }

  /**
   * Change user PIN with validation and history tracking
   */
  async changePinWithValidation(
    userId: number, 
    currentPin: string, 
    newPin: string,
    adminOverride: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    // Validate new PIN format
    const validation = this.validatePin(newPin);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const db = this.dbManager.getDatabase();
    
    // Get current user data
    const user = await db.get(`
      SELECT id, username, password_hash 
      FROM staff_users 
      WHERE id = ?
    `, [userId]);

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Verify current PIN unless admin override
    if (!adminOverride) {
      const isCurrentPinValid = await argon2.verify(user.password_hash, currentPin);
      if (!isCurrentPinValid) {
        return { success: false, error: 'Current PIN is incorrect' };
      }
    }

    // Check PIN reuse if enabled
    if (this.config.preventReuse) {
      const isReused = await this.isPinReused(userId, newPin);
      if (isReused) {
        return { 
          success: false, 
          error: `PIN cannot be reused. Must be different from last ${this.config.reuseHistoryCount} PINs` 
        };
      }
    }

    // Hash new PIN
    const hashedPin = await argon2.hash(newPin, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 3,
      parallelism: 1,
    });

    // Calculate new expiry date
    const newExpiryDate = new Date();
    newExpiryDate.setDate(newExpiryDate.getDate() + this.config.rotationDays);

    try {
      await db.run('BEGIN TRANSACTION');

      // Update user PIN and expiry
      await db.run(`
        UPDATE staff_users 
        SET password_hash = ?, pin_expires_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [hashedPin, newExpiryDate.toISOString(), userId]);

      // Store PIN history if reuse prevention is enabled
      if (this.config.preventReuse) {
        await this.storePinHistory(userId, hashedPin);
      }

      // Log PIN change event
      await this.logPinChangeEvent(userId, user.username, adminOverride);

      await db.run('COMMIT');

      // Update session manager
      this.sessionManager.markPinChanged(userId);

      return { success: true };

    } catch (error) {
      await db.run('ROLLBACK');
      console.error('Error changing PIN:', error);
      return { success: false, error: 'Failed to change PIN' };
    }
  }

  /**
   * Force PIN change for user (admin function)
   */
  async forcePinChange(userId: number, adminUserId: number): Promise<{ success: boolean; error?: string }> {
    const db = this.dbManager.getDatabase();
    
    try {
      // Set PIN as expired immediately
      await db.run(`
        UPDATE staff_users 
        SET pin_expires_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [userId]);

      // Get admin and user info for logging
      const [admin, user] = await Promise.all([
        db.get('SELECT username FROM staff_users WHERE id = ?', [adminUserId]),
        db.get('SELECT username FROM staff_users WHERE id = ?', [userId])
      ]);

      // Log force PIN change event
      await this.logEvent('pin_force_change', {
        target_user_id: userId,
        target_username: user?.username,
        admin_user_id: adminUserId,
        admin_username: admin?.username
      });

      // Force PIN change in session manager
      this.sessionManager.forcePinChange(userId);

      return { success: true };

    } catch (error) {
      console.error('Error forcing PIN change:', error);
      return { success: false, error: 'Failed to force PIN change' };
    }
  }

  /**
   * Validate PIN format and strength
   */
  validatePin(pin: string): { valid: boolean; error?: string; strength?: 'weak' | 'medium' | 'strong' } {
    if (typeof pin !== 'string') {
      return { valid: false, error: 'PIN must be a string' };
    }

    if (pin.length < this.config.minPinLength) {
      return { valid: false, error: `PIN must be at least ${this.config.minPinLength} digits` };
    }

    if (pin.length > this.config.maxPinLength) {
      return { valid: false, error: `PIN must be no more than ${this.config.maxPinLength} digits` };
    }

    if (!/^\d+$/.test(pin)) {
      return { valid: false, error: 'PIN must contain only digits' };
    }

    // Check for weak patterns
    const strength = this.assessPinStrength(pin);
    if (strength === 'weak') {
      return { 
        valid: false, 
        error: 'PIN is too weak. Avoid sequential numbers, repeated digits, or common patterns',
        strength 
      };
    }

    return { valid: true, strength };
  }

  /**
   * Get PIN rotation statistics
   */
  async getRotationStatistics(): Promise<{
    totalUsers: number;
    expiredPins: number;
    expiringInWeek: number;
    expiringInMonth: number;
    averageDaysUntilExpiry: number;
  }> {
    const db = this.dbManager.getDatabase();
    
    const users = await db.all(`
      SELECT pin_expires_at 
      FROM staff_users 
      WHERE is_active = 1
    `);

    const now = new Date();
    let expiredPins = 0;
    let expiringInWeek = 0;
    let expiringInMonth = 0;
    let totalDaysUntilExpiry = 0;

    for (const user of users) {
      if (!user.pin_expires_at) continue;

      const expiresAt = new Date(user.pin_expires_at);
      const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry <= 0) {
        expiredPins++;
      } else if (daysUntilExpiry <= 7) {
        expiringInWeek++;
      } else if (daysUntilExpiry <= 30) {
        expiringInMonth++;
      }

      totalDaysUntilExpiry += Math.max(0, daysUntilExpiry);
    }

    return {
      totalUsers: users.length,
      expiredPins,
      expiringInWeek,
      expiringInMonth,
      averageDaysUntilExpiry: users.length > 0 ? totalDaysUntilExpiry / users.length : 0
    };
  }

  /**
   * Update PIN rotation configuration
   */
  updateConfig(newConfig: Partial<PinRotationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): PinRotationConfig {
    return { ...this.config };
  }

  /**
   * Private helper methods
   */
  private async isPinReused(userId: number, newPin: string): Promise<boolean> {
    const db = this.dbManager.getDatabase();
    
    const history = await db.all(`
      SELECT pin_hash 
      FROM pin_history 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `, [userId, this.config.reuseHistoryCount]);

    for (const entry of history) {
      const isMatch = await argon2.verify(entry.pin_hash, newPin);
      if (isMatch) {
        return true;
      }
    }

    return false;
  }

  private async storePinHistory(userId: number, hashedPin: string): Promise<void> {
    const db = this.dbManager.getDatabase();
    
    // Store new PIN in history
    await db.run(`
      INSERT INTO pin_history (user_id, pin_hash, created_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `, [userId, hashedPin]);

    // Clean up old history beyond the limit
    await db.run(`
      DELETE FROM pin_history 
      WHERE user_id = ? 
      AND id NOT IN (
        SELECT id FROM pin_history 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      )
    `, [userId, userId, this.config.reuseHistoryCount]);
  }

  private assessPinStrength(pin: string): 'weak' | 'medium' | 'strong' {
    // Check for weak patterns
    if (this.hasWeakPattern(pin)) {
      return 'weak';
    }

    // Check for medium patterns
    if (pin.length >= 6 && this.hasVariation(pin)) {
      return 'strong';
    }

    return 'medium';
  }

  private hasWeakPattern(pin: string): boolean {
    // Sequential numbers (1234, 4321)
    if (this.isSequential(pin)) return true;
    
    // Repeated digits (1111, 2222)
    if (this.hasRepeatedDigits(pin)) return true;
    
    // Common patterns (1234, 0000, 1111, etc.)
    const commonPatterns = ['1234', '4321', '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999'];
    if (commonPatterns.includes(pin)) return true;

    return false;
  }

  private isSequential(pin: string): boolean {
    for (let i = 1; i < pin.length; i++) {
      const current = parseInt(pin[i]);
      const previous = parseInt(pin[i - 1]);
      
      if (Math.abs(current - previous) !== 1) {
        return false;
      }
    }
    return true;
  }

  private hasRepeatedDigits(pin: string): boolean {
    const uniqueDigits = new Set(pin.split(''));
    return uniqueDigits.size <= 2; // Too few unique digits
  }

  private hasVariation(pin: string): boolean {
    const uniqueDigits = new Set(pin.split(''));
    return uniqueDigits.size >= Math.min(4, pin.length - 1);
  }

  private async logPinChangeEvent(userId: number, username: string, adminOverride: boolean): Promise<void> {
    await this.logEvent('pin_changed', {
      user_id: userId,
      username,
      admin_override: adminOverride,
      new_expiry: new Date(Date.now() + this.config.rotationDays * 24 * 60 * 60 * 1000).toISOString()
    });
  }

  private async logEvent(eventType: string, details: any): Promise<void> {
    try {
      const db = this.dbManager.getDatabase();
      await db.run(`
        INSERT INTO events (kiosk_id, event_type, details, timestamp)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `, ['panel', eventType, JSON.stringify(details)]);
    } catch (error) {
      console.error('Failed to log PIN rotation event:', error);
    }
  }
}
