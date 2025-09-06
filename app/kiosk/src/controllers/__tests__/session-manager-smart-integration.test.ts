/**
 * Integration tests for SessionManager with SmartSessionManager
 * Verifies smart assignment session integration and backward compatibility
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
 */

import { SessionManager } from '../session-manager';
import { SmartSessionManager } from '../../../../shared/services/smart-session-manager';
import { ConfigurationManager } from '../../../../shared/services/configuration-manager';
import { DatabaseManager } from '../../../../shared/services/database-manager';

// Mock dependencies
jest.mock('../../../../shared/services/smart-session-manager');
jest.mock('../../../../shared/services/configuration-manager');
jest.mock('../../../../shared/services/database-manager');

describe('SessionManager Smart Integration', () => {
  let sessionManager: SessionManager;
  let mockSmartSessionManager: jest.Mocked<SmartSessionManager>;
  let mockConfigManager: jest.Mocked<ConfigurationManager>;
  let mockDb: jest.Mocked<DatabaseManager>;

  beforeEach(() => {
    mockDb = new DatabaseManager(':memory:') as jest.Mocked<DatabaseManager>;
    mockConfigManager = new ConfigurationManager(mockDb) as jest.Mocked<ConfigurationManager>;
    mockSmartSessionManager = new SmartSessionManager(mockDb, mockConfigManager) as jest.Mocked<SmartSessionManager>;

    // Mock configuration manager
    mockConfigManager.getEffectiveConfig = jest.fn();

    // Mock smart session manager
    mockSmartSessionManager.createSmartSession = jest.fn();
    mockSmartSessionManager.getActiveSession = jest.fn();
    mockSmartSessionManager.getKioskSession = jest.fn();
    mockSmartSessionManager.getSession = jest.fn();
    mockSmartSessionManager.extendSession = jest.fn();
    mockSmartSessionManager.completeSession = jest.fn();
    mockSmartSessionManager.getRemainingMinutes = jest.fn();

    sessionManager = new SessionManager(
      { defaultTimeoutSeconds: 30 },
      mockSmartSessionManager,
      mockConfigManager
    );
  });

  afterEach(() => {
    sessionManager.shutdown();
  });

  describe('Smart Assignment Mode', () => {
    beforeEach(() => {
      // Mock smart assignment enabled
      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        smart_assignment_enabled: true,
        session_limit_minutes: 180
      });
    });

    test('should create smart session when smart assignment is enabled', async () => {
      const mockSmartSession = {
        id: 'smart-session-123',
        cardId: 'card-123',
        kioskId: 'kiosk-1',
        startTime: new Date(),
        limitTime: new Date(Date.now() + (180 * 60 * 1000)),
        expiresTime: new Date(Date.now() + (180 * 60 * 1000)),
        status: 'active' as const,
        lastSeen: new Date(),
        extensionCount: 0,
        maxExtensions: 4
      };

      mockSmartSessionManager.createSmartSession.mockResolvedValue(mockSmartSession);
      mockSmartSessionManager.getRemainingMinutes.mockReturnValue(180);

      const session = await sessionManager.createSession('kiosk-1', 'card-123');

      expect(mockSmartSessionManager.createSmartSession).toHaveBeenCalledWith('card-123', 'kiosk-1');
      expect(session.id).toBe('smart-session-123');
      expect(session.timeoutSeconds).toBe(180 * 60); // 180 minutes in seconds
    });

    test('should get smart session for kiosk', async () => {
      const mockSmartSession = {
        id: 'smart-session-123',
        cardId: 'card-123',
        kioskId: 'kiosk-1',
        startTime: new Date(),
        limitTime: new Date(),
        expiresTime: new Date(Date.now() + (120 * 60 * 1000)), // 120 minutes remaining
        status: 'active' as const,
        lastSeen: new Date(),
        extensionCount: 0,
        maxExtensions: 4
      };

      mockSmartSessionManager.getKioskSession.mockResolvedValue(mockSmartSession);
      mockSmartSessionManager.getRemainingMinutes.mockReturnValue(120);

      const session = await sessionManager.getKioskSession('kiosk-1');

      expect(session).toBeDefined();
      expect(session?.id).toBe('smart-session-123');
      expect(session?.timeoutSeconds).toBe(120 * 60); // 120 minutes in seconds
    });

    test('should complete smart session with locker assignment', async () => {
      const mockSmartSession = {
        id: 'smart-session-123',
        cardId: 'card-123',
        kioskId: 'kiosk-1',
        startTime: new Date(),
        limitTime: new Date(),
        expiresTime: new Date(),
        status: 'active' as const,
        lastSeen: new Date(),
        extensionCount: 0,
        maxExtensions: 4
      };

      mockSmartSessionManager.getSession.mockResolvedValue(mockSmartSession);
      mockSmartSessionManager.updateSession.mockResolvedValue();
      mockSmartSessionManager.completeSession.mockResolvedValue();
      mockSmartSessionManager.getRemainingMinutes.mockReturnValue(120);

      const success = await sessionManager.completeSession('smart-session-123', 15);

      expect(success).toBe(true);
      expect(mockSmartSessionManager.updateSession).toHaveBeenCalledWith('smart-session-123', {
        lockerId: 15,
        lastSeen: expect.any(Date)
      });
      expect(mockSmartSessionManager.completeSession).toHaveBeenCalledWith('smart-session-123', 'completed');
    });

    test('should extend smart session with admin authorization', async () => {
      mockSmartSessionManager.extendSession.mockResolvedValue(true);

      const success = await sessionManager.extendSmartSession('smart-session-123', 'admin-user', 'User needs more time');

      expect(success).toBe(true);
      expect(mockSmartSessionManager.extendSession).toHaveBeenCalledWith(
        'smart-session-123',
        'admin-user',
        'User needs more time'
      );
    });

    test('should get remaining minutes for smart session', async () => {
      const mockSmartSession = {
        id: 'smart-session-123',
        cardId: 'card-123',
        kioskId: 'kiosk-1',
        startTime: new Date(),
        limitTime: new Date(),
        expiresTime: new Date(Date.now() + (90 * 60 * 1000)), // 90 minutes remaining
        status: 'active' as const,
        lastSeen: new Date(),
        extensionCount: 1,
        maxExtensions: 4
      };

      mockSmartSessionManager.getSession.mockResolvedValue(mockSmartSession);
      mockSmartSessionManager.getRemainingMinutes.mockReturnValue(90);

      const remaining = await sessionManager.getSmartSessionRemainingMinutes('smart-session-123');

      expect(remaining).toBe(90);
    });
  });

  describe('Manual Mode (Backward Compatibility)', () => {
    beforeEach(() => {
      // Mock smart assignment disabled
      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        smart_assignment_enabled: false,
        session_limit_minutes: 180
      });
    });

    test('should create regular session when smart assignment is disabled', async () => {
      const session = await sessionManager.createSession('kiosk-1', 'card-123', [1, 2, 3]);

      expect(mockSmartSessionManager.createSmartSession).not.toHaveBeenCalled();
      expect(session.timeoutSeconds).toBe(30); // Regular session timeout
      expect(session.availableLockers).toEqual([1, 2, 3]);
    });

    test('should fall back to regular session methods', async () => {
      mockSmartSessionManager.getKioskSession.mockResolvedValue(null);

      const session = await sessionManager.getKioskSession('kiosk-1');

      expect(session).toBeNull(); // No regular session exists
    });
  });

  describe('Configuration Integration', () => {
    test('should handle configuration errors gracefully', async () => {
      mockConfigManager.getEffectiveConfig.mockRejectedValue(new Error('Config error'));

      // Should fall back to regular session when config fails
      const session = await sessionManager.createSession('kiosk-1', 'card-123');

      expect(session.timeoutSeconds).toBe(30); // Regular session timeout
      expect(mockSmartSessionManager.createSmartSession).not.toHaveBeenCalled();
    });

    test('should use kiosk-specific configuration', async () => {
      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        smart_assignment_enabled: true,
        session_limit_minutes: 240 // Custom limit for this kiosk
      });

      const mockSmartSession = {
        id: 'smart-session-123',
        cardId: 'card-123',
        kioskId: 'kiosk-1',
        startTime: new Date(),
        limitTime: new Date(Date.now() + (240 * 60 * 1000)),
        expiresTime: new Date(Date.now() + (240 * 60 * 1000)),
        status: 'active' as const,
        lastSeen: new Date(),
        extensionCount: 0,
        maxExtensions: 4
      };

      mockSmartSessionManager.createSmartSession.mockResolvedValue(mockSmartSession);
      mockSmartSessionManager.getRemainingMinutes.mockReturnValue(240);

      await sessionManager.createSession('kiosk-1', 'card-123');

      expect(mockConfigManager.getEffectiveConfig).toHaveBeenCalledWith('kiosk-1');
    });
  });

  describe('Event Emission', () => {
    test('should emit session_created event for smart session', async () => {
      mockConfigManager.getEffectiveConfig.mockResolvedValue({
        smart_assignment_enabled: true,
        session_limit_minutes: 180
      });

      const mockSmartSession = {
        id: 'smart-session-123',
        cardId: 'card-123',
        kioskId: 'kiosk-1',
        startTime: new Date(),
        limitTime: new Date(),
        expiresTime: new Date(),
        status: 'active' as const,
        lastSeen: new Date(),
        extensionCount: 0,
        maxExtensions: 4
      };

      mockSmartSessionManager.createSmartSession.mockResolvedValue(mockSmartSession);
      mockSmartSessionManager.getRemainingMinutes.mockReturnValue(180);

      const eventPromise = new Promise((resolve) => {
        sessionManager.once('session_created', resolve);
      });

      await sessionManager.createSession('kiosk-1', 'card-123');

      const event = await eventPromise;
      expect(event).toMatchObject({
        type: 'session_created',
        sessionId: 'smart-session-123',
        data: {
          message: 'Kart okundu. Akıllı atama aktif',
          isSmartSession: true
        }
      });
    });

    test('should emit session_extended event', async () => {
      mockSmartSessionManager.extendSession.mockResolvedValue(true);

      const eventPromise = new Promise((resolve) => {
        sessionManager.once('session_extended', resolve);
      });

      await sessionManager.extendSmartSession('smart-session-123', 'admin-user', 'Test extension');

      const event = await eventPromise;
      expect(event).toMatchObject({
        sessionId: 'smart-session-123',
        adminUser: 'admin-user',
        reason: 'Test extension'
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle smart session manager unavailable', async () => {
      const sessionManagerWithoutSmart = new SessionManager({ defaultTimeoutSeconds: 30 });

      const session = await sessionManagerWithoutSmart.createSession('kiosk-1', 'card-123');

      expect(session.timeoutSeconds).toBe(30); // Falls back to regular session
      
      sessionManagerWithoutSmart.shutdown();
    });

    test('should handle extension failure gracefully', async () => {
      mockSmartSessionManager.extendSession.mockResolvedValue(false);

      const success = await sessionManager.extendSmartSession('invalid-session', 'admin-user', 'Test');

      expect(success).toBe(false);
    });
  });
});