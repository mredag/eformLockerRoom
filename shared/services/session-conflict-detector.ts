import { FastifyRequest } from 'fastify';

export class SessionConflictDetector {
  private static readonly MAX_SESSIONS_PER_USER = 3;
  private static readonly CONFLICT_DETECTION_WINDOW = 5000; // 5 seconds
  
  private static recentSessions = new Map<string, { timestamp: number; sessionIds: Set<string> }>();
  
  /**
   * Detect and resolve session conflicts for a user
   */
  static detectAndResolve(userId: number, newSessionId: string, sessionManager: any): boolean {
    const userKey = userId.toString();
    const now = Date.now();
    
    // Clean old entries
    this.cleanupOldEntries(now);
    
    // Get or create user session tracking
    let userSessions = this.recentSessions.get(userKey);
    if (!userSessions) {
      userSessions = { timestamp: now, sessionIds: new Set() };
      this.recentSessions.set(userKey, userSessions);
    }
    
    // Add new session
    userSessions.sessionIds.add(newSessionId);
    userSessions.timestamp = now;
    
    // Check for conflicts (multiple sessions in short time)
    if (userSessions.sessionIds.size > 1) {
      console.log(`⚠️ Session conflict detected for user ${userId}: ${userSessions.sessionIds.size} sessions`);
      
      // Keep only the newest session, destroy others
      const sessionIds = Array.from(userSessions.sessionIds);
      const oldSessions = sessionIds.slice(0, -1); // All except the last (newest)
      
      oldSessions.forEach(sessionId => {
        console.log(`🗑️ Destroying conflicting session: ${sessionId.substring(0, 16)}...`);
        sessionManager.destroySession(sessionId);
      });
      
      // Keep only the new session
      userSessions.sessionIds.clear();
      userSessions.sessionIds.add(newSessionId);
      
      return true; // Conflict was resolved
    }
    
    return false; // No conflict
  }
  
  /**
   * Clean up old session tracking entries
   */
  private static cleanupOldEntries(now: number): void {
    for (const [userKey, data] of this.recentSessions.entries()) {
      if (now - data.timestamp > this.CONFLICT_DETECTION_WINDOW) {
        this.recentSessions.delete(userKey);
      }
    }
  }
  
  /**
   * Check if request has multiple session cookies (browser conflict)
   */
  static detectBrowserConflict(request: FastifyRequest): string[] {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return [];
    
    const sessionCookies: string[] = [];
    const cookies = cookieHeader.split(';');
    
    cookies.forEach(cookie => {
      const trimmed = cookie.trim();
      if (trimmed.startsWith('session=')) {
        const value = trimmed.split('=')[1];
        if (value && !sessionCookies.includes(value)) {
          sessionCookies.push(value);
        }
      }
    });
    
    if (sessionCookies.length > 1) {
      console.log(`🚨 Browser cookie conflict detected: ${sessionCookies.length} session cookies`);
      console.log(`   Session IDs: ${sessionCookies.map(id => id.substring(0, 16) + '...').join(', ')}`);
    }
    
    return sessionCookies;
  }
}