import { randomBytes } from 'crypto';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { User } from './auth-service';

export interface Session {
  id: string;
  user: User;
  createdAt: Date;
  lastActivity: Date;
  csrfToken: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: Date;
  renewalCount: number;
  maxRenewals: number;
}

export interface SessionConfig {
  sessionTimeout: number; // milliseconds
  maxIdleTime: number; // milliseconds
  autoRenewalEnabled: boolean;
  pinRotationDays: number;
  maxConcurrentSessions: number;
  requirePinChangeOnExpiry: boolean;
  maxRenewals: number;
  cleanupInterval: number;
}

const DEFAULT_SESSION_CONFIG: SessionConfig = {
  sessionTimeout: 8 * 60 * 60 * 1000, // 8 hours
  maxIdleTime: 2 * 60 * 60 * 1000, // 2 hours
  autoRenewalEnabled: true,
  pinRotationDays: 90,
  maxConcurrentSessions: 3,
  requirePinChangeOnExpiry: true,
  maxRenewals: 5,
  cleanupInterval: 15 * 60 * 1000 // 15 minutes
};

export class SQLiteSessionManager {
  private config: SessionConfig;
  private cleanupTimer?: NodeJS.Timeout;
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager, config?: Partial<SessionConfig>) {
    this.dbManager = dbManager;
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
    this.startCleanupTimer();
  }

  async createSession(user: User, ipAddress: string, userAgent: string): Promise<Session> {
    // Check concurrent session limit
    await this.enforceSessionLimit(user.id);

    const sessionId = this.generateSecureToken();
    const csrfToken = this.generateSecureToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.sessionTimeout);
    
    console.log(`🔧 Creating SQLite session for user: ${user.username}`);
    console.log(`🔧 Session ID: ${sessionId.substring(0, 16)}...`);
    console.log(`🔧 IP Address: ${ipAddress}`);
    
    // Insert session into database
    const db = this.dbManager.getConnection();
    await db.run(`
      INSERT INTO sessions (
        id, user_id, user_agent, ip_address, created_at, expires_at, 
        csrf_token, last_activity, renewal_count, max_renewals
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      sessionId,
      user.id,
      userAgent,
      ipAddress,
      now.toISOString(),
      expiresAt.toISOString(),
      csrfToken,
      now.toISOString(),
      0,
      this.config.maxRenewals
    ]);

    console.log(`✅ Session stored in SQLite database`);

    const session: Session = {
      id: sessionId,
      user,
      createdAt: now,
      lastActivity: now,
      csrfToken,
      ipAddress,
      userAgent,
      expiresAt,
      renewalCount: 0,
      maxRenewals: this.config.maxRenewals
    };

    return session;
  }

  async validateSession(sessionId: string, ipAddress?: string, userAgent?: string): Promise<Session | null> {
    console.log(`🔍 SQLiteSessionManager.validateSession called with sessionId: ${sessionId?.substring(0, 16)}...`);
    
    if (!sessionId) {
      console.log(`❌ No session ID provided`);
      return null;
    }

    const db = this.dbManager.getConnection();
    
    // Get session with user data
    const sessionRow = await db.get(`
      SELECT 
        s.id, s.user_id, s.user_agent, s.ip_address, s.created_at, 
        s.expires_at, s.csrf_token, s.last_activity, s.renewal_count, s.max_renewals,
        u.username, u.role, u.created_at as user_created_at, u.last_login, u.pin_expires_at
      FROM sessions s
      JOIN staff_users u ON s.user_id = u.id
      WHERE s.id = ? AND u.active = 1
    `, [sessionId]);

    if (!sessionRow) {
      console.log(`❌ Session not found for ID: ${sessionId?.substring(0, 16)}...`);
      return null;
    }

    console.log(`✅ Session found for user: ${sessionRow.username}`);

    const now = new Date();
    const expiresAt = new Date(sessionRow.expires_at);
    const lastActivity = new Date(sessionRow.last_activity);
    
    // Check session timeout
    if (now > expiresAt) {
      console.log(`❌ Session expired at: ${expiresAt}`);
      await this.destroySession(sessionId);
      return null;
    }

    // Check idle timeout
    const timeSinceLastActivity = now.getTime() - lastActivity.getTime();
    if (timeSinceLastActivity > this.config.maxIdleTime) {
      // Try auto-renewal if enabled
      if (this.config.autoRenewalEnabled && sessionRow.renewal_count < sessionRow.max_renewals) {
        console.log(`🔄 Auto-renewing idle session`);
        return await this.renewSession(sessionId, ipAddress, userAgent);
      } else {
        console.log(`❌ Session idle timeout exceeded`);
        await this.destroySession(sessionId);
        return null;
      }
    }

    // Validate IP address consistency (allow local network variations)
    if (ipAddress && sessionRow.ip_address !== ipAddress) {
      if (!this.isLocalNetworkVariation(sessionRow.ip_address, ipAddress)) {
        console.log(`❌ Session IP mismatch: ${sessionRow.ip_address} vs ${ipAddress}`);
        await this.destroySession(sessionId);
        return null;
      } else {
        console.log(`✅ Allowing local network IP variation: ${sessionRow.ip_address} -> ${ipAddress}`);
        // Update session with new IP
        await db.run(`UPDATE sessions SET ip_address = ?, last_activity = ? WHERE id = ?`, 
          [ipAddress, now.toISOString(), sessionId]);
      }
    }

    // Update last activity
    await db.run(`UPDATE sessions SET last_activity = ? WHERE id = ?`, 
      [now.toISOString(), sessionId]);

    // Build user object
    const user: User = {
      id: sessionRow.user_id,
      username: sessionRow.username,
      role: sessionRow.role,
      created_at: new Date(sessionRow.user_created_at),
      last_login: sessionRow.last_login ? new Date(sessionRow.last_login) : undefined,
      pin_expires_at: sessionRow.pin_expires_at ? new Date(sessionRow.pin_expires_at) : undefined
    };

    const session: Session = {
      id: sessionRow.id,
      user,
      createdAt: new Date(sessionRow.created_at),
      lastActivity: now,
      csrfToken: sessionRow.csrf_token,
      ipAddress: ipAddress || sessionRow.ip_address,
      userAgent: sessionRow.user_agent,
      expiresAt,
      renewalCount: sessionRow.renewal_count,
      maxRenewals: sessionRow.max_renewals
    };

    return session;
  }

  async validateCsrfToken(sessionId: string, providedToken: string): Promise<boolean> {
    if (!sessionId || !providedToken) {
      return false;
    }

    const db = this.dbManager.getConnection();
    const result = await db.get(`SELECT csrf_token FROM sessions WHERE id = ?`, [sessionId]);
    
    if (!result) {
      return false;
    }

    return result.csrf_token === providedToken;
  }

  async destroySession(sessionId: string): Promise<void> {
    console.log(`🗑️ Destroying session: ${sessionId?.substring(0, 16)}...`);
    
    const db = this.dbManager.getConnection();
    await db.run(`DELETE FROM sessions WHERE id = ?`, [sessionId]);
    
    console.log(`✅ Session destroyed from database`);
  }

  async renewSession(sessionId: string, ipAddress?: string, userAgent?: string): Promise<Session | null> {
    const db = this.dbManager.getConnection();
    
    // Get current session
    const sessionRow = await db.get(`
      SELECT 
        s.id, s.user_id, s.user_agent, s.ip_address, s.created_at, 
        s.expires_at, s.csrf_token, s.last_activity, s.renewal_count, s.max_renewals,
        u.username, u.role, u.created_at as user_created_at, u.last_login, u.pin_expires_at
      FROM sessions s
      JOIN staff_users u ON s.user_id = u.id
      WHERE s.id = ? AND u.active = 1
    `, [sessionId]);

    if (!sessionRow) {
      return null;
    }

    // Check if renewal is allowed
    if (sessionRow.renewal_count >= sessionRow.max_renewals) {
      await this.destroySession(sessionId);
      return null;
    }

    // Generate new CSRF token and update session
    const newCsrfToken = this.generateSecureToken();
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + this.config.sessionTimeout);
    const newRenewalCount = sessionRow.renewal_count + 1;

    await db.run(`
      UPDATE sessions 
      SET csrf_token = ?, last_activity = ?, expires_at = ?, renewal_count = ?,
          ip_address = COALESCE(?, ip_address), user_agent = COALESCE(?, user_agent)
      WHERE id = ?
    `, [
      newCsrfToken,
      now.toISOString(),
      newExpiresAt.toISOString(),
      newRenewalCount,
      ipAddress,
      userAgent,
      sessionId
    ]);

    console.log(`🔄 Session renewed: ${sessionId?.substring(0, 16)}... (renewal ${newRenewalCount}/${sessionRow.max_renewals})`);

    // Build user object
    const user: User = {
      id: sessionRow.user_id,
      username: sessionRow.username,
      role: sessionRow.role,
      created_at: new Date(sessionRow.user_created_at),
      last_login: sessionRow.last_login ? new Date(sessionRow.last_login) : undefined,
      pin_expires_at: sessionRow.pin_expires_at ? new Date(sessionRow.pin_expires_at) : undefined
    };

    const session: Session = {
      id: sessionRow.id,
      user,
      createdAt: new Date(sessionRow.created_at),
      lastActivity: now,
      csrfToken: newCsrfToken,
      ipAddress: ipAddress || sessionRow.ip_address,
      userAgent: userAgent || sessionRow.user_agent,
      expiresAt: newExpiresAt,
      renewalCount: newRenewalCount,
      maxRenewals: sessionRow.max_renewals
    };

    return session;
  }

  async cleanupExpiredSessions(): Promise<number> {
    const db = this.dbManager.getConnection();
    
    const result = await db.run(`
      DELETE FROM sessions 
      WHERE expires_at < datetime('now') 
         OR last_activity < datetime('now', '-' || ? || ' seconds')
    `, [Math.floor(this.config.maxIdleTime / 1000)]);

    const deletedCount = result.changes || 0;
    
    if (deletedCount > 0) {
      console.log(`🧹 Cleaned up ${deletedCount} expired sessions`);
    }

    return deletedCount;
  }

  async getActiveSessionCount(): Promise<number> {
    const db = this.dbManager.getConnection();
    const result = await db.get(`
      SELECT COUNT(*) as count 
      FROM sessions 
      WHERE expires_at > datetime('now') 
        AND last_activity > datetime('now', '-' || ? || ' seconds')
    `, [Math.floor(this.config.maxIdleTime / 1000)]);

    return result?.count || 0;
  }

  async getSessionInfo(sessionId: string): Promise<{ 
    user: string; 
    role: string; 
    lastActivity: Date;
    createdAt: Date;
    ipAddress: string;
    requiresPinChange: boolean;
    renewalCount: number;
  } | null> {
    const db = this.dbManager.getConnection();
    
    const sessionRow = await db.get(`
      SELECT 
        s.created_at, s.last_activity, s.ip_address, s.renewal_count,
        u.username, u.role, u.pin_expires_at
      FROM sessions s
      JOIN staff_users u ON s.user_id = u.id
      WHERE s.id = ? AND u.active = 1
    `, [sessionId]);

    if (!sessionRow) {
      return null;
    }

    const requiresPinChange = sessionRow.pin_expires_at ? 
      new Date(sessionRow.pin_expires_at) < new Date() : false;

    return {
      user: sessionRow.username,
      role: sessionRow.role,
      lastActivity: new Date(sessionRow.last_activity),
      createdAt: new Date(sessionRow.created_at),
      ipAddress: sessionRow.ip_address,
      requiresPinChange,
      renewalCount: sessionRow.renewal_count
    };
  }

  async getUserSessions(userId: number): Promise<Session[]> {
    const db = this.dbManager.getConnection();
    
    const sessionRows = await db.all(`
      SELECT 
        s.id, s.user_id, s.user_agent, s.ip_address, s.created_at, 
        s.expires_at, s.csrf_token, s.last_activity, s.renewal_count, s.max_renewals,
        u.username, u.role, u.created_at as user_created_at, u.last_login, u.pin_expires_at
      FROM sessions s
      JOIN staff_users u ON s.user_id = u.id
      WHERE s.user_id = ? AND u.active = 1
        AND s.expires_at > datetime('now')
      ORDER BY s.last_activity DESC
    `, [userId]);

    const user: User = sessionRows.length > 0 ? {
      id: sessionRows[0].user_id,
      username: sessionRows[0].username,
      role: sessionRows[0].role,
      created_at: new Date(sessionRows[0].user_created_at),
      last_login: sessionRows[0].last_login ? new Date(sessionRows[0].last_login) : undefined,
      pin_expires_at: sessionRows[0].pin_expires_at ? new Date(sessionRows[0].pin_expires_at) : undefined
    } : {} as User;

    return sessionRows.map(row => ({
      id: row.id,
      user,
      createdAt: new Date(row.created_at),
      lastActivity: new Date(row.last_activity),
      csrfToken: row.csrf_token,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      expiresAt: new Date(row.expires_at),
      renewalCount: row.renewal_count,
      maxRenewals: row.max_renewals
    }));
  }

  async destroyUserSessions(userId: number): Promise<void> {
    const db = this.dbManager.getConnection();
    await db.run(`DELETE FROM sessions WHERE user_id = ?`, [userId]);
    console.log(`🗑️ Destroyed all sessions for user ID: ${userId}`);
  }

  async getStatistics(): Promise<{
    totalSessions: number;
    userCount: number;
    averageSessionAge: number;
    expiringSoon: number;
    requirePinChange: number;
  }> {
    const db = this.dbManager.getConnection();
    
    const stats = await db.get(`
      SELECT 
        COUNT(*) as totalSessions,
        COUNT(DISTINCT s.user_id) as userCount,
        AVG((julianday('now') - julianday(s.created_at)) * 24 * 60 * 60 * 1000) as averageSessionAge,
        COUNT(CASE WHEN s.expires_at < datetime('now', '+30 minutes') THEN 1 END) as expiringSoon,
        COUNT(CASE WHEN u.pin_expires_at < datetime('now') THEN 1 END) as requirePinChange
      FROM sessions s
      JOIN staff_users u ON s.user_id = u.id
      WHERE s.expires_at > datetime('now') AND u.active = 1
    `);

    return {
      totalSessions: stats?.totalSessions || 0,
      userCount: stats?.userCount || 0,
      averageSessionAge: stats?.averageSessionAge || 0,
      expiringSoon: stats?.expiringSoon || 0,
      requirePinChange: stats?.requirePinChange || 0
    };
  }

  updateConfig(newConfig: Partial<SessionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart cleanup timer if interval changed
    if (newConfig.cleanupInterval) {
      this.stopCleanupTimer();
      this.startCleanupTimer();
    }
  }

  private generateSecureToken(): string {
    return randomBytes(32).toString('hex');
  }

  private async enforceSessionLimit(userId: number): Promise<void> {
    const db = this.dbManager.getConnection();
    
    // Get current session count for user
    const result = await db.get(`
      SELECT COUNT(*) as count 
      FROM sessions 
      WHERE user_id = ? AND expires_at > datetime('now')
    `, [userId]);

    const currentCount = result?.count || 0;
    
    if (currentCount >= this.config.maxConcurrentSessions) {
      // Remove oldest sessions to make room
      const sessionsToRemove = currentCount - this.config.maxConcurrentSessions + 1;
      
      await db.run(`
        DELETE FROM sessions 
        WHERE id IN (
          SELECT id FROM sessions 
          WHERE user_id = ? 
          ORDER BY created_at ASC 
          LIMIT ?
        )
      `, [userId, sessionsToRemove]);
      
      console.log(`🚫 Enforced session limit: removed ${sessionsToRemove} old sessions for user ${userId}`);
    }
  }

  private isLocalNetworkVariation(originalIp: string, newIp: string): boolean {
    // Handle unknown/undefined IPs
    if (!originalIp || !newIp || originalIp === 'unknown' || newIp === 'unknown') {
      return true;
    }

    // Same IP
    if (originalIp === newIp) {
      return true;
    }

    // Common localhost variations
    const localhostIps = ['127.0.0.1', '::1', 'localhost'];
    if (localhostIps.includes(originalIp) && localhostIps.includes(newIp)) {
      return true;
    }

    // Local network ranges
    const isLocalNetwork = (ip: string): boolean => {
      return ip.startsWith('192.168.') || 
             ip.startsWith('10.') || 
             ip.startsWith('172.16.') || 
             ip.startsWith('172.17.') || 
             ip.startsWith('172.18.') || 
             ip.startsWith('172.19.') || 
             ip.startsWith('172.20.') || 
             ip.startsWith('172.21.') || 
             ip.startsWith('172.22.') || 
             ip.startsWith('172.23.') || 
             ip.startsWith('172.24.') || 
             ip.startsWith('172.25.') || 
             ip.startsWith('172.26.') || 
             ip.startsWith('172.27.') || 
             ip.startsWith('172.28.') || 
             ip.startsWith('172.29.') || 
             ip.startsWith('172.30.') || 
             ip.startsWith('172.31.');
    };

    // Allow transitions between localhost and local network
    if ((localhostIps.includes(originalIp) && isLocalNetwork(newIp)) ||
        (isLocalNetwork(originalIp) && localhostIps.includes(newIp))) {
      return true;
    }

    // Allow within same local network subnet
    if (isLocalNetwork(originalIp) && isLocalNetwork(newIp)) {
      // Extract network portion (first 3 octets for /24 networks)
      const originalNetwork = originalIp.split('.').slice(0, 3).join('.');
      const newNetwork = newIp.split('.').slice(0, 3).join('.');
      return originalNetwork === newNetwork;
    }

    return false;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanupExpiredSessions();
      } catch (error) {
        console.error('Error during session cleanup:', error);
      }
    }, this.config.cleanupInterval);
  }

  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  shutdown(): void {
    this.stopCleanupTimer();
  }
}