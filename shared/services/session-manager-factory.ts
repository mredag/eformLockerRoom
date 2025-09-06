/**
 * Factory for creating SessionManager with SmartSessionManager integration
 * Provides proper initialization for smart assignment features
 */

import { SessionManager } from '../../app/kiosk/src/controllers/session-manager';
import { SmartSessionManager } from './smart-session-manager';
import { ConfigurationManager } from './configuration-manager';
import { DatabaseManager } from './database-manager';

export interface SessionManagerFactoryConfig {
  defaultTimeoutSeconds?: number;
  cleanupIntervalMs?: number;
  maxSessionsPerKiosk?: number;
  enableSmartSessions?: boolean;
}

export class SessionManagerFactory {
  /**
   * Create a SessionManager with optional SmartSessionManager integration
   */
  static async create(
    db: DatabaseManager,
    config: SessionManagerFactoryConfig = {}
  ): Promise<SessionManager> {
    const {
      defaultTimeoutSeconds = 30,
      cleanupIntervalMs = 5000,
      maxSessionsPerKiosk = 1,
      enableSmartSessions = true
    } = config;

    // Create configuration manager
    const configManager = new ConfigurationManager(db);

    // Create smart session manager if enabled
    let smartSessionManager: SmartSessionManager | undefined;
    if (enableSmartSessions) {
      smartSessionManager = new SmartSessionManager(db, configManager);
    }

    // Create enhanced session manager
    const sessionManager = new SessionManager(
      {
        defaultTimeoutSeconds,
        cleanupIntervalMs,
        maxSessionsPerKiosk
      },
      smartSessionManager,
      configManager
    );

    console.log(`🔧 Created SessionManager with smart sessions: ${enableSmartSessions ? 'enabled' : 'disabled'}`);
    
    return sessionManager;
  }

  /**
   * Create a basic SessionManager without smart session integration (manual mode only)
   */
  static createBasic(config: SessionManagerFactoryConfig = {}): SessionManager {
    const {
      defaultTimeoutSeconds = 30,
      cleanupIntervalMs = 5000,
      maxSessionsPerKiosk = 1
    } = config;

    return new SessionManager({
      defaultTimeoutSeconds,
      cleanupIntervalMs,
      maxSessionsPerKiosk
    });
  }
}

/**
 * Example usage:
 * 
 * // For smart assignment enabled system
 * const db = new DatabaseManager('path/to/database.db');
 * const sessionManager = await SessionManagerFactory.create(db, {
 *   enableSmartSessions: true,
 *   defaultTimeoutSeconds: 30
 * });
 * 
 * // For manual mode only
 * const basicSessionManager = SessionManagerFactory.createBasic({
 *   defaultTimeoutSeconds: 30
 * });
 */