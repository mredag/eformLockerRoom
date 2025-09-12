import { FastifyRequest } from 'fastify';

/**
 * A utility class for detecting and resolving session conflicts.
 * This can occur when a user rapidly creates multiple sessions, for example,
 * by quickly scanning a QR code multiple times. This class helps ensure
 * that only the most recent session for a user remains active, preventing
 * unexpected behavior from stale or duplicate sessions.
 */
export class SessionConflictDetector {
  /**
   * The maximum number of concurrent sessions allowed per user.
   * @private
   */
  private static readonly MAX_SESSIONS_PER_USER = 3;

  /**
   * The time window in milliseconds for detecting session conflicts.
   * If multiple sessions are created within this window, they are considered a conflict.
   * @private
   */
  private static readonly CONFLICT_DETECTION_WINDOW = 5000; // 5 seconds
  
  /**
   * A map to track recent sessions for each user.
   * The key is the user ID, and the value contains the timestamp of the last activity
   * and a set of session IDs created within the conflict detection window.
   * @private
   */
  private static recentSessions = new Map<string, { timestamp: number; sessionIds: Set<string> }>();
  
  /**
   * Detects and resolves session conflicts for a given user.
   * If multiple sessions are created for the same user within the `CONFLICT_DETECTION_WINDOW`,
   * this method will destroy all but the newest session.
   * @param {number} userId - The ID of the user.
   * @param {string} newSessionId - The ID of the newly created session.
   * @param {any} sessionManager - The session manager instance, which must have a `destroySession` method.
   * @returns {boolean} `true` if a conflict was detected and resolved, otherwise `false`.
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
   * Cleans up old session tracking entries from the `recentSessions` map.
   * An entry is considered old if its last update timestamp is outside the `CONFLICT_DETECTION_WINDOW`.
   * @param {number} now - The current timestamp.
   * @private
   */
  private static cleanupOldEntries(now: number): void {
    for (const [userKey, data] of this.recentSessions.entries()) {
      if (now - data.timestamp > this.CONFLICT_DETECTION_WINDOW) {
        this.recentSessions.delete(userKey);
      }
    }
  }
  
  /**
   * Detects if a browser sends multiple session cookies in a single request.
   * This can happen due to browser bugs or misconfigurations and can lead to
   * unpredictable session handling.
   * @param {FastifyRequest} request - The incoming Fastify request object.
   * @returns {string[]} An array of session cookie values found in the request.
   * An array with more than one element indicates a browser-level conflict.
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