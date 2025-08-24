/**
 * Basic Testing Suite for System Modernization
 * 
 * This test suite covers the essential functionality as specified in task 28:
 * - Unit tests for core auth, sessions, and help flow
 * - Basic integration tests for panel-gateway communication
 * - Simple end-to-end tests for login, open locker, help workflow
 * - Test basic functionality with 2-3 kiosks
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import TestUtils from '../test-setup';

// Import services and components to test
import { SqliteSessionManager } from '../app/panel/src/services/sqlite-session-manager';
import { HelpService } from '../shared/services/help-service';
import { VipService } from '../shared/services/vip-service';
import { WebSocketManager } from '../app/gateway/src/services/websocket-manager';
import { CommandBus } from '../app/gateway/src/services/command-bus';

describe('Basic Testing Suite - System Modernization', () => {
  let testDbPath: string;
  let sessionManager: SqliteSessionManager;
  let helpService: HelpService;
  let vipService: VipService;
  let wsManager: WebSocketManager;
  let commandBus: CommandBus;

  beforeAll(async () => {
    // Create test database
    testDbPath = await TestUtils.createTestDatabase('basic-test-suite');
    
    // Initialize services with test configuration
    const testConfig = TestUtils.createTestConfig();
    testConfig.database.path = testDbPath;
    
    // Initialize services
    sessionManager = new SqliteSessionManager(testConfig.database);
    helpService = new HelpService(testDbPath);
    vipService = new VipService(testDbPath);
    wsManager = new WebSocketManager();
    commandBus = new CommandBus();
    
    await sessionManager.initialize();
    await helpService.initialize();
    await vipService.initialize();
  });

  afterAll(async () => {
    // Cleanup will be handled by test-setup.ts
  });

  describe('Unit Tests - Core Authentication', () => {
    test('should create and validate sessions', async () => {
      const userId = 'test-user-1';
      const userAgent = 'test-agent';
      const ip = '127.0.0.1';

      // Create session
      const session = await sessionManager.createSession(userId, userAgent, ip);
      
      expect(session).toBeDefined();
      expect(session.user_id).toBe(userId);
      expect(session.user_agent).toBe(userAgent);
      expect(session.ip_address).toBe(ip);
      expect(session.id).toBeDefined();
      expect(session.csrf_token).toBeDefined();

      // Validate session
      const validatedSession = await sessionManager.validateSession(session.id);
      expect(validatedSession).toBeDefined();
      expect(validatedSession?.user_id).toBe(userId);
    });

    test('should handle session renewal', async () => {
      const userId = 'test-user-2';
      const session = await sessionManager.createSession(userId, 'test-agent', '127.0.0.1');
      
      // Wait a moment to ensure timestamp difference
      await TestUtils.wait(100);
      
      const renewedSession = await sessionManager.renewSession(session.id);
      expect(renewedSession).toBeDefined();
      expect(renewedSession.last_activity.getTime()).toBeGreaterThan(session.last_activity.getTime());
    });

    test('should destroy sessions', async () => {
      const userId = 'test-user-3';
      const session = await sessionManager.createSession(userId, 'test-agent', '127.0.0.1');
      
      await sessionManager.destroySession(session.id);
      
      const validatedSession = await sessionManager.validateSession(session.id);
      expect(validatedSession).toBeNull();
    });

    test('should cleanup expired sessions', async () => {
      const userId = 'test-user-4';
      const session = await sessionManager.createSession(userId, 'test-agent', '127.0.0.1');
      
      // Manually expire the session by setting expires_at to past
      await sessionManager.expireSession(session.id);
      
      const cleanedCount = await sessionManager.cleanupExpiredSessions();
      expect(cleanedCount).toBeGreaterThan(0);
      
      const validatedSession = await sessionManager.validateSession(session.id);
      expect(validatedSession).toBeNull();
    });
  });

  describe('Unit Tests - Help Request Flow', () => {
    test('should create help requests', async () => {
      const helpRequest = await helpService.createHelpRequest({
        kiosk_id: 'kiosk-1',
        locker_no: 5,
        category: 'lock_problem',
        note: 'Locker won\'t open after RFID scan'
      });

      expect(helpRequest).toBeDefined();
      expect(helpRequest.kiosk_id).toBe('kiosk-1');
      expect(helpRequest.locker_no).toBe(5);
      expect(helpRequest.category).toBe('lock_problem');
      expect(helpRequest.status).toBe('open');
      expect(helpRequest.id).toBeDefined();
    });

    test('should list help requests', async () => {
      // Create multiple help requests
      await helpService.createHelpRequest({
        kiosk_id: 'kiosk-2',
        category: 'other',
        note: 'General assistance needed'
      });

      await helpService.createHelpRequest({
        kiosk_id: 'kiosk-3',
        locker_no: 10,
        category: 'lock_problem'
      });

      const allRequests = await helpService.getHelpRequests();
      expect(allRequests.length).toBeGreaterThanOrEqual(2);

      const openRequests = await helpService.getHelpRequests('open');
      expect(openRequests.length).toBeGreaterThanOrEqual(2);
      expect(openRequests.every(req => req.status === 'open')).toBe(true);
    });

    test('should resolve help requests', async () => {
      const helpRequest = await helpService.createHelpRequest({
        kiosk_id: 'kiosk-4',
        locker_no: 3,
        category: 'lock_problem',
        note: 'Door stuck'
      });

      await helpService.resolveHelpRequest(helpRequest.id, 'Fixed mechanical issue');

      const resolvedRequest = await helpService.getHelpRequest(helpRequest.id);
      expect(resolvedRequest?.status).toBe('resolved');
      expect(resolvedRequest?.resolved_at).toBeDefined();
    });

    test('should filter help requests by status', async () => {
      // Create and resolve one request
      const helpRequest = await helpService.createHelpRequest({
        kiosk_id: 'kiosk-5',
        category: 'other'
      });
      await helpService.resolveHelpRequest(helpRequest.id);

      const resolvedRequests = await helpService.getHelpRequests('resolved');
      expect(resolvedRequests.length).toBeGreaterThan(0);
      expect(resolvedRequests.every(req => req.status === 'resolved')).toBe(true);
    });
  });

  describe('Unit Tests - VIP Service Basic Operations', () => {
    test('should create VIP contracts', async () => {
      const contract = await vipService.createContract({
        member_name: 'John Doe',
        phone: '+1234567890',
        email: 'john@example.com',
        plan: 'basic',
        price: 99.99,
        start_at: new Date(),
        end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        kiosk_id: 'kiosk-1',
        locker_id: 5,
        rfid_card: 'card-123',
        created_by: 'staff-1'
      });

      expect(contract).toBeDefined();
      expect(contract.member_name).toBe('John Doe');
      expect(contract.plan).toBe('basic');
      expect(contract.status).toBe('active');
    });

    test('should record payments', async () => {
      const contract = await vipService.createContract({
        member_name: 'Jane Smith',
        phone: '+1234567891',
        plan: 'premium',
        price: 149.99,
        start_at: new Date(),
        end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        kiosk_id: 'kiosk-2',
        locker_id: 10,
        rfid_card: 'card-456',
        created_by: 'staff-1'
      });

      const payment = await vipService.recordPayment({
        contract_id: contract.id,
        amount: 149.99,
        method: 'card',
        reference: 'txn-789',
        created_by: 'staff-1'
      });

      expect(payment).toBeDefined();
      expect(payment.contract_id).toBe(contract.id);
      expect(payment.amount).toBe(149.99);
      expect(payment.method).toBe('card');
    });

    test('should get active contracts', async () => {
      const activeContracts = await vipService.getActiveContracts();
      expect(activeContracts.length).toBeGreaterThan(0);
      expect(activeContracts.every(contract => contract.status === 'active')).toBe(true);
    });
  });

  describe('Integration Tests - Panel-Gateway Communication', () => {
    test('should establish WebSocket connection', async () => {
      const mockSocket = {
        on: vi.fn(),
        send: vi.fn(),
        close: vi.fn(),
        readyState: 1 // OPEN
      };

      const connectionId = wsManager.handleConnection(mockSocket as any, '/ws/lockers');
      expect(connectionId).toBeDefined();
      expect(wsManager.getConnectionCount('/ws/lockers')).toBe(1);
    });

    test('should broadcast locker state changes', async () => {
      const mockSocket = {
        on: vi.fn(),
        send: vi.fn(),
        close: vi.fn(),
        readyState: 1
      };

      wsManager.handleConnection(mockSocket as any, '/ws/lockers');

      // Broadcast a locker state change
      wsManager.emitLockerStateChanged('locker-5', 'Free', 'Owned', 'kiosk-1');

      // Verify the message was sent
      expect(mockSocket.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(mockSocket.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('LockerStateChanged');
      expect(sentMessage.data.lockerId).toBe('locker-5');
      expect(sentMessage.data.oldState).toBe('Free');
      expect(sentMessage.data.newState).toBe('Owned');
    });

    test('should handle command bus operations', async () => {
      const command = {
        id: 'cmd-1',
        type: 'open',
        kioskId: 'kiosk-1',
        lockerId: 5,
        userId: 'staff-1',
        timestamp: new Date()
      };

      const result = await commandBus.executeCommand(command);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    test('should handle help request notifications', async () => {
      const mockSocket = {
        on: vi.fn(),
        send: vi.fn(),
        close: vi.fn(),
        readyState: 1
      };

      wsManager.handleConnection(mockSocket as any, '/ws/help');

      // Create a help request (should trigger notification)
      const helpRequest = await helpService.createHelpRequest({
        kiosk_id: 'kiosk-6',
        locker_no: 8,
        category: 'lock_problem',
        note: 'Integration test help request'
      });

      // Emit help request event
      wsManager.emitHelpRequested(helpRequest);

      // Verify notification was sent
      expect(mockSocket.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(mockSocket.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('HelpRequested');
      expect(sentMessage.data.id).toBe(helpRequest.id);
    });
  });

  describe('End-to-End Tests - Core Workflows', () => {
    test('should complete login workflow', async () => {
      // Simulate login process
      const userId = 'e2e-user-1';
      const userAgent = 'Mozilla/5.0 Test Browser';
      const ip = '192.168.1.100';

      // Step 1: Create session (login)
      const session = await sessionManager.createSession(userId, userAgent, ip);
      expect(session).toBeDefined();

      // Step 2: Validate session (subsequent requests)
      const validSession = await sessionManager.validateSession(session.id);
      expect(validSession).toBeDefined();
      expect(validSession?.user_id).toBe(userId);

      // Step 3: Renew session (keep alive)
      const renewedSession = await sessionManager.renewSession(session.id);
      expect(renewedSession.last_activity.getTime()).toBeGreaterThan(session.last_activity.getTime());

      // Step 4: Logout (destroy session)
      await sessionManager.destroySession(session.id);
      const destroyedSession = await sessionManager.validateSession(session.id);
      expect(destroyedSession).toBeNull();
    });

    test('should complete locker open workflow', async () => {
      // Simulate complete locker operation workflow
      const kioskId = 'kiosk-e2e-1';
      const lockerId = 15;
      const userId = 'staff-e2e-1';

      // Step 1: Create session for staff user
      const session = await sessionManager.createSession(userId, 'staff-browser', '192.168.1.101');

      // Step 2: Setup WebSocket connection for real-time updates
      const mockSocket = {
        on: vi.fn(),
        send: vi.fn(),
        close: vi.fn(),
        readyState: 1
      };
      wsManager.handleConnection(mockSocket as any, '/ws/lockers');

      // Step 3: Execute open command
      const openCommand = {
        id: 'e2e-open-cmd-1',
        type: 'open' as const,
        kioskId,
        lockerId,
        userId,
        timestamp: new Date()
      };

      const commandResult = await commandBus.executeCommand(openCommand);
      expect(commandResult.success).toBe(true);

      // Step 4: Verify locker state change notification
      wsManager.emitLockerStateChanged(`${kioskId}-${lockerId}`, 'Free', 'Opened', kioskId);
      expect(mockSocket.send).toHaveBeenCalled();

      // Step 5: Cleanup session
      await sessionManager.destroySession(session.id);
    });

    test('should complete help request workflow', async () => {
      // Simulate complete help request workflow from kiosk to panel resolution
      const kioskId = 'kiosk-e2e-2';
      const lockerId = 20;

      // Step 1: Setup staff session
      const staffSession = await sessionManager.createSession('staff-e2e-2', 'panel-browser', '192.168.1.102');

      // Step 2: Setup WebSocket for help notifications
      const mockSocket = {
        on: vi.fn(),
        send: vi.fn(),
        close: vi.fn(),
        readyState: 1
      };
      wsManager.handleConnection(mockSocket as any, '/ws/help');

      // Step 3: Create help request (from kiosk)
      const helpRequest = await helpService.createHelpRequest({
        kiosk_id: kioskId,
        locker_no: lockerId,
        category: 'lock_problem',
        note: 'E2E test - locker door jammed'
      });

      expect(helpRequest.status).toBe('open');

      // Step 4: Emit help notification to panel
      wsManager.emitHelpRequested(helpRequest);
      expect(mockSocket.send).toHaveBeenCalled();

      // Step 5: Staff views help requests
      const openRequests = await helpService.getHelpRequests('open');
      const ourRequest = openRequests.find(req => req.id === helpRequest.id);
      expect(ourRequest).toBeDefined();

      // Step 6: Staff resolves help request
      await helpService.resolveHelpRequest(helpRequest.id, 'E2E test - cleared door jam');

      // Step 7: Verify resolution
      const resolvedRequest = await helpService.getHelpRequest(helpRequest.id);
      expect(resolvedRequest?.status).toBe('resolved');
      expect(resolvedRequest?.resolved_at).toBeDefined();

      // Step 8: Cleanup
      await sessionManager.destroySession(staffSession.id);
    });
  });

  describe('Multi-Kiosk Functionality Tests', () => {
    test('should handle operations across 2-3 kiosks', async () => {
      const kiosks = ['kiosk-multi-1', 'kiosk-multi-2', 'kiosk-multi-3'];
      const staffUserId = 'staff-multi-test';

      // Create staff session
      const staffSession = await sessionManager.createSession(staffUserId, 'multi-kiosk-test', '192.168.1.200');

      // Setup WebSocket connections for each namespace
      const lockerSocket = { on: vi.fn(), send: vi.fn(), close: vi.fn(), readyState: 1 };
      const helpSocket = { on: vi.fn(), send: vi.fn(), close: vi.fn(), readyState: 1 };

      wsManager.handleConnection(lockerSocket as any, '/ws/lockers');
      wsManager.handleConnection(helpSocket as any, '/ws/help');

      // Test operations across multiple kiosks
      const operations = [];

      for (let i = 0; i < kiosks.length; i++) {
        const kioskId = kiosks[i];
        
        // Create help request from each kiosk
        const helpRequest = await helpService.createHelpRequest({
          kiosk_id: kioskId,
          locker_no: i + 1,
          category: 'lock_problem',
          note: `Multi-kiosk test from ${kioskId}`
        });

        // Execute locker command on each kiosk
        const command = {
          id: `multi-cmd-${i}`,
          type: 'open' as const,
          kioskId,
          lockerId: i + 1,
          userId: staffUserId,
          timestamp: new Date()
        };

        const commandResult = await commandBus.executeCommand(command);
        
        operations.push({
          kioskId,
          helpRequest,
          commandResult
        });
      }

      // Verify all operations succeeded
      expect(operations).toHaveLength(3);
      operations.forEach(op => {
        expect(op.helpRequest.status).toBe('open');
        expect(op.commandResult.success).toBe(true);
      });

      // Verify help requests from all kiosks
      const allHelpRequests = await helpService.getHelpRequests('open');
      const ourRequests = allHelpRequests.filter(req => 
        kiosks.includes(req.kiosk_id) && req.note?.includes('Multi-kiosk test')
      );
      expect(ourRequests).toHaveLength(3);

      // Test WebSocket broadcasting to all connected clients
      wsManager.emitLockerStateChanged('multi-test-locker', 'Free', 'Owned', 'kiosk-multi-1');
      expect(lockerSocket.send).toHaveBeenCalled();

      // Resolve help requests from all kiosks
      for (const op of operations) {
        await helpService.resolveHelpRequest(op.helpRequest.id, `Resolved for ${op.kioskId}`);
      }

      // Verify all resolved
      const resolvedRequests = await helpService.getHelpRequests('resolved');
      const ourResolvedRequests = resolvedRequests.filter(req => 
        kiosks.includes(req.kiosk_id) && req.note?.includes('Multi-kiosk test')
      );
      expect(ourResolvedRequests).toHaveLength(3);

      // Cleanup
      await sessionManager.destroySession(staffSession.id);
    });

    test('should handle concurrent operations', async () => {
      const concurrentOperations = 5;
      const promises = [];

      // Create multiple concurrent sessions
      for (let i = 0; i < concurrentOperations; i++) {
        const promise = (async () => {
          const session = await sessionManager.createSession(
            `concurrent-user-${i}`,
            'concurrent-test',
            `192.168.1.${100 + i}`
          );

          const helpRequest = await helpService.createHelpRequest({
            kiosk_id: `concurrent-kiosk-${i}`,
            locker_no: i,
            category: 'other',
            note: `Concurrent test ${i}`
          });

          return { session, helpRequest };
        })();

        promises.push(promise);
      }

      // Wait for all operations to complete
      const results = await Promise.all(promises);

      // Verify all operations succeeded
      expect(results).toHaveLength(concurrentOperations);
      results.forEach((result, index) => {
        expect(result.session.user_id).toBe(`concurrent-user-${index}`);
        expect(result.helpRequest.kiosk_id).toBe(`concurrent-kiosk-${index}`);
      });

      // Cleanup all sessions
      await Promise.all(results.map(result => 
        sessionManager.destroySession(result.session.id)
      ));
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid session validation', async () => {
      const invalidSession = await sessionManager.validateSession('invalid-session-id');
      expect(invalidSession).toBeNull();
    });

    test('should handle non-existent help request', async () => {
      await expect(helpService.resolveHelpRequest(99999, 'Test')).rejects.toThrow();
    });

    test('should handle WebSocket disconnections', async () => {
      const mockSocket = {
        on: vi.fn(),
        send: vi.fn(),
        close: vi.fn(),
        readyState: 3 // CLOSED
      };

      const connectionId = wsManager.handleConnection(mockSocket as any, '/ws/lockers');
      wsManager.handleDisconnection(mockSocket as any);
      
      expect(wsManager.getConnectionCount('/ws/lockers')).toBe(0);
    });

    test('should handle command execution failures', async () => {
      const invalidCommand = {
        id: 'invalid-cmd',
        type: 'invalid' as any,
        kioskId: 'invalid-kiosk',
        lockerId: -1,
        userId: 'test-user',
        timestamp: new Date()
      };

      const result = await commandBus.executeCommand(invalidCommand);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});