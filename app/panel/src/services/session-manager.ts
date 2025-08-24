import { randomBytes } from 'crypto';
import { User } from './auth-service';

export interface Session {
  id: string;
  user: User;
  createdAt: Date;
  lastActivity: Date;
  csrfToken: string;
  ipAddress: string;
  userAgent: string;
  pinLastChanged?: Date;
  requiresPinChange?: boolean;
  maxIdleTime?: number;
  autoRenewalEnabled?: boolean;
  renewalCount?: number;
  maxRenewals?: number;
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
  maxIdleTime: 2 * 60 * 60 * 1000, // 2 hours (increased from 30 minutes)
  autoRenewalEnabled: true,
  pinRotationDays: 90,
  maxConcurrentSessions: 3,
  requirePinChangeOnExpiry: true,
  maxRenewals: 5,
  cleanupInterval: 15 * 60 * 1000 // 15 minutes
};

export class SessionManager {
  private sessions = new Map<string, Session>();
  private userSessions = new Map<number, Set<string>>(); // Track sessions per user
  private config: SessionConfig;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config?: Partial<SessionConfig>) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
    this.startCleanupTimer();
  }

  createSession(user: User, ipAddress: string, userAgent: string): Session {
    // Check concurrent session limit
    this.enforceSessionLimit(user.id);

    const sessionId = this.generateSecureToken();
    const csrfToken = this.generateSecureToken();
    
    console.log(`🔧 Creating session for user: ${user.username}`);
    console.log(`🔧 Session ID: ${sessionId.substring(0, 16)}...`);
    console.log(`🔧 IP Address: ${ipAddress}`);
    
    
    // Check if PIN change is required
    const requiresPinChange = this.isPinChangeRequired(user);
    
    const session: Session = {
      id: sessionId,
      user,
      createdAt: new Date(),
      lastActivity: new Date(),
      csrfToken,
      ipAddress,
      userAgent,
      pinLastChanged: user.pin_expires_at,
      requiresPinChange,
      maxIdleTime: this.config.maxIdleTime,
      autoRenewalEnabled: this.config.autoRenewalEnabled,
      renewalCount: 0,
      maxRenewals: this.config.maxRenewals
    };

    this.sessions.set(sessionId, session);
    
    console.log(`✅ Session stored in memory. Total sessions: ${this.sessions.size}`);
    
    // Track user sessions
    if (!this.userSessions.has(user.id)) {
      this.userSessions.set(user.id, new Set());
    }
    this.userSessions.get(user.id)!.add(sessionId);

    return session;
  }

  validateSession(sessionId: string, ipAddress?: string, userAgent?: string): Session | null {
    console.log(`🔍 SessionManager.validateSession called with sessionId: ${sessionId?.substring(0, 16)}...`);
    console.log(`🔍 Total sessions in memory: ${this.sessions.size}`);
    console.log(`🔍 Session IDs in memory: ${Array.from(this.sessions.keys()).map(id => id.substring(0, 16) + '...').join(', ')}`);
    
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`❌ Session not found for ID: ${sessionId?.substring(0, 16)}...`);
      return null;
    }
    
    console.log(`✅ Session found for user: ${session.user.username}`);
    console.log(`🔍 Session created at: ${session.createdAt}`);
    console.log(`🔍 Session IP: ${session.ipAddress}, Request IP: ${ipAddress}`);
    

    const now = new Date();
    
    // Check session timeout
    const timeSinceCreation = now.getTime() - session.createdAt.getTime();
    if (timeSinceCreation > this.config.sessionTimeout) {
      this.destroySession(sessionId);
      return null;
    }

    // Check idle timeout
    const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();
    const maxIdleTime = session.maxIdleTime || this.config.maxIdleTime;
    
    if (timeSinceLastActivity > maxIdleTime) {
      // Try auto-renewal if enabled
      if (session.autoRenewalEnabled && this.canRenewSession(session)) {
        return this.renewSession(sessionId, ipAddress, userAgent);
      } else {
        this.destroySession(sessionId);
        return null;
      }
    }

    // Validate IP address consistency (TEMPORARILY DISABLED for testing)
    if (ipAddress && session.ipAddress !== ipAddress) {
      console.log(`Session ${sessionId}: IP change from ${session.ipAddress} to ${ipAddress} - ALLOWING (IP validation disabled)`);
      // Update session with new IP for consistency
      session.ipAddress = ipAddress;
    }

    // Update last activity
    session.lastActivity = now;
    return session;
  }

  validateCsrfToken(sessionId: string, providedToken: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    return session.csrfToken === providedToken;
  }

  destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Remove from user sessions tracking
      const userSessions = this.userSessions.get(session.user.id);
      if (userSessions) {
        userSessions.delete(sessionId);
        if (userSessions.size === 0) {
          this.userSessions.delete(session.user.id);
        }
      }
    }
    
    this.sessions.delete(sessionId);
  }

  renewSession(sessionId: string, ipAddress?: string, userAgent?: string): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Check if renewal is allowed
    if (!this.canRenewSession(session)) {
      this.destroySession(sessionId);
      return null;
    }

    // Generate new CSRF token
    session.csrfToken = this.generateSecureToken();
    session.lastActivity = new Date();
    session.renewalCount = (session.renewalCount || 0) + 1;
    
    // Update IP and user agent if provided
    if (ipAddress) session.ipAddress = ipAddress;
    if (userAgent) session.userAgent = userAgent;
    
    return session;
  }

  private generateSecureToken(): string {
    return randomBytes(32).toString('hex');
  }

  private cleanupExpiredSessions(): void {
    const now = new Date();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const timeSinceCreation = now.getTime() - session.createdAt.getTime();
      const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();
      const maxIdleTime = session.maxIdleTime || this.config.maxIdleTime;
      
      if (timeSinceCreation > this.config.sessionTimeout || 
          timeSinceLastActivity > maxIdleTime) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => {
      this.destroySession(sessionId);
    });

    if (expiredSessions.length > 0) {
      console.log(`Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  getSessionInfo(sessionId: string): { 
    user: string; 
    role: string; 
    lastActivity: Date;
    createdAt: Date;
    ipAddress: string;
    requiresPinChange: boolean;
    renewalCount: number;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      user: session.user.username,
      role: session.user.role,
      lastActivity: session.lastActivity,
      createdAt: session.createdAt,
      ipAddress: session.ipAddress,
      requiresPinChange: session.requiresPinChange || false,
      renewalCount: session.renewalCount || 0
    };
  }

  /**
   * Get all active sessions for a user
   */
  getUserSessions(userId: number): Session[] {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) {
      return [];
    }

    const sessions: Session[] = [];
    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Destroy all sessions for a user
   */
  destroyUserSessions(userId: number): void {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) {
      return;
    }

    for (const sessionId of sessionIds) {
      this.sessions.delete(sessionId);
    }
    
    this.userSessions.delete(userId);
  }

  /**
   * Update session configuration
   */
  updateConfig(newConfig: Partial<SessionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart cleanup timer if interval changed
    if (newConfig.cleanupInterval) {
      this.stopCleanupTimer();
      this.startCleanupTimer();
    }
  }

  /**
   * Mark PIN as changed for user sessions
   */
  markPinChanged(userId: number): void {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) {
      return;
    }

    const now = new Date();
    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.pinLastChanged = now;
        session.requiresPinChange = false;
      }
    }
  }

  /**
   * Force PIN change for user sessions
   */
  forcePinChange(userId: number): void {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) {
      return;
    }

    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.requiresPinChange = true;
      }
    }
  }

  /**
   * Get session statistics
   */
  getStatistics(): {
    totalSessions: number;
    userCount: number;
    averageSessionAge: number;
    expiringSoon: number;
    requirePinChange: number;
  } {
    const now = new Date();
    let totalAge = 0;
    let expiringSoon = 0;
    let requirePinChange = 0;

    for (const session of this.sessions.values()) {
      const age = now.getTime() - session.createdAt.getTime();
      totalAge += age;

      // Sessions expiring in next 30 minutes
      const timeToExpiry = this.config.sessionTimeout - age;
      if (timeToExpiry < 30 * 60 * 1000) {
        expiringSoon++;
      }

      if (session.requiresPinChange) {
        requirePinChange++;
      }
    }

    return {
      totalSessions: this.sessions.size,
      userCount: this.userSessions.size,
      averageSessionAge: this.sessions.size > 0 ? totalAge / this.sessions.size : 0,
      expiringSoon,
      requirePinChange
    };
  }

  /**
   * Check if IP address change is acceptable for local networks
   */
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

  /**
   * Private helper methods
   */
  private enforceSessionLimit(userId: number): void {
    const userSessions = this.userSessions.get(userId);
    if (!userSessions) {
      return;
    }

    if (userSessions.size >= this.config.maxConcurrentSessions) {
      // Remove oldest session
      const sessions = Array.from(userSessions)
        .map(id => this.sessions.get(id))
        .filter(s => s !== undefined)
        .sort((a, b) => a!.createdAt.getTime() - b!.createdAt.getTime());

      if (sessions.length > 0) {
        this.destroySession(sessions[0]!.id);
      }
    }
  }

  private isPinChangeRequired(user: User): boolean {
    if (!this.config.requirePinChangeOnExpiry || !user.pin_expires_at) {
      return false;
    }

    // Check if PIN has expired
    return new Date() > user.pin_expires_at;
  }

  private canRenewSession(session: Session): boolean {
    const renewalCount = session.renewalCount || 0;
    return renewalCount < (session.maxRenewals || this.config.maxRenewals);
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.config.cleanupInterval);
  }

  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Shutdown session manager
   */
  shutdown(): void {
    this.stopCleanupTimer();
    this.sessions.clear();
    this.userSessions.clear();
  }
}
