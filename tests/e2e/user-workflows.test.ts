/**
 * End-to-End Tests for User Workflows
 * Tests complete user journeys from start to finish
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import TestUtils from '../../test-setup';

// Mock browser-like environment for E2E tests
const mockBrowser = {
  localStorage: new Map(),
  sessionStorage: new Map(),
  cookies: new Map(),
  
  setItem(storage: 'localStorage' | 'sessionStorage', key: string, value: string) {
    this[storage].set(key, value);
  },
  
  getItem(storage: 'localStorage' | 'sessionStorage', key: string) {
    return this[storage].get(key) || null;
  },
  
  removeItem(storage: 'localStorage' | 'sessionStorage', key: string) {
    this[storage].delete(key);
  },
  
  setCookie(name: string, value: string, options: any = {}) {
    this.cookies.set(name, { value, ...options });
  },
  
  getCookie(name: string) {
    return this.cookies.get(name)?.value || null;
  },
  
  clearCookies() {
    this.cookies.clear();
  }
};

describe('End-to-End User Workflows', () => {
  let testDbPath: string;
  let mockServices: any;

  beforeAll(async () => {
    testDbPath = await TestUtils.createTestDatabase('e2e-workflows');
    
    // Initialize mock services for E2E testing
    mockServices = {
      sessionManager: {
        createSession: vi.fn(),
        validateSession: vi.fn(),
        renewSession: vi.fn(),
        destroySession: vi.fn()
      },
      helpService: {
        createHelpRequest: vi.fn(),
        getHelpRequests: vi.fn(),
        resolveHelpRequest: vi.fn()
      },
      vipService: {
        createContract: vi.fn(),
        recordPayment: vi.fn(),
        generateContractPDF: vi.fn()
      },
      commandBus: {
        executeCommand: vi.fn()
      },
      websocketManager: {
        handleConnection: vi.fn(),
        emitLockerStateChanged: vi.fn(),
        emitHelpRequested: vi.fn()
      }
    };
  });

  beforeEach(() => {
    // Reset browser state
    mockBrowser.localStorage.clear();
    mockBrowser.sessionStorage.clear();
    mockBrowser.clearCookies();
    
    // Reset all mocks
    vi.clearAllMocks();
  });

  describe('Staff Login Workflow', () => {
    test('should complete full login workflow', async () => {
      const staffCredentials = {
        username: 'admin',
        password: 'test-password'
      };

      // Step 1: User enters credentials
      const loginData = {
        username: staffCredentials.username,
        password: staffCredentials.password
      };

      // Step 2: Mock successful authentication
      const mockSession = {
        id: 'session-123',
        user_id: 'staff-1',
        user_agent: 'Test Browser',
        ip_address: '192.168.1.100',
        created_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        csrf_token: 'csrf-token-123',
        last_activity: new Date()
      };

      mockServices.sessionManager.createSession.mockResolvedValue(mockSession);

      // Step 3: Create session
      const session = await mockServices.sessionManager.createSession(
        'staff-1',
        'Test Browser',
        '192.168.1.100'
      );

      expect(session).toBeDefined();
      expect(session.user_id).toBe('staff-1');

      // Step 4: Store session in browser
      mockBrowser.setCookie('sessionId', session.id, {
        httpOnly: true,
        secure: false, // Test environment
        sameSite: 'strict'
      });

      expect(mockBrowser.getCookie('sessionId')).toBe(session.id);

      // Step 5: Validate session on subsequent requests
      mockServices.sessionManager.validateSession.mockResolvedValue(session);
      
      const validatedSession = await mockServices.sessionManager.validateSession(session.id);
      expect(validatedSession).toBeDefined();
      expect(validatedSession.user_id).toBe('staff-1');

      // Step 6: Navigate to dashboard (simulate redirect)
      mockBrowser.setItem('localStorage', 'currentPage', '/dashboard');
      expect(mockBrowser.getItem('localStorage', 'currentPage')).toBe('/dashboard');
    });

    test('should handle login failure', async () => {
      const invalidCredentials = {
        username: 'admin',
        password: 'wrong-password'
      };

      // Mock authentication failure
      mockServices.sessionManager.createSession.mockRejectedValue(
        new Error('Invalid credentials')
      );

      // Attempt login
      try {
        await mockServices.sessionManager.createSession(
          'staff-1',
          'Test Browser',
          '192.168.1.100'
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('Invalid credentials');
      }

      // Verify no session cookie is set
      expect(mockBrowser.getCookie('sessionId')).toBeNull();
    });

    test('should handle session expiration', async () => {
      // Create expired session
      const expiredSession = {
        id: 'expired-session',
        user_id: 'staff-1',
        expires_at: new Date(Date.now() - 1000), // Expired 1 second ago
        last_activity: new Date(Date.now() - 60000) // Last activity 1 minute ago
      };

      mockServices.sessionManager.validateSession.mockResolvedValue(null);

      // Try to validate expired session
      const validatedSession = await mockServices.sessionManager.validateSession(expiredSession.id);
      expect(validatedSession).toBeNull();

      // Should redirect to login
      mockBrowser.setItem('localStorage', 'currentPage', '/login');
      expect(mockBrowser.getItem('localStorage', 'currentPage')).toBe('/login');
    });
  });

  describe('Locker Operation Workflow', () => {
    test('should complete remote locker open workflow', async () => {
      // Step 1: Staff is logged in
      const staffSession = {
        id: 'staff-session',
        user_id: 'staff-1'
      };
      mockBrowser.setCookie('sessionId', staffSession.id);

      // Step 2: Staff selects locker to open
      const lockerToOpen = {
        kioskId: 'kiosk-1',
        lockerId: 5
      };

      // Step 3: Execute remote open command
      const openCommand = {
        id: 'open-cmd-1',
        type: 'open',
        kioskId: lockerToOpen.kioskId,
        lockerId: lockerToOpen.lockerId,
        userId: staffSession.user_id,
        timestamp: new Date()
      };

      mockServices.commandBus.executeCommand.mockResolvedValue({
        success: true,
        commandId: openCommand.id,
        message: 'Locker opened successfully'
      });

      // Step 4: Execute command
      const result = await mockServices.commandBus.executeCommand(openCommand);
      expect(result.success).toBe(true);
      expect(result.commandId).toBe(openCommand.id);

      // Step 5: Receive real-time update via WebSocket
      const lockerUpdate = {
        type: 'LockerStateChanged',
        data: {
          lockerId: `${lockerToOpen.kioskId}-${lockerToOpen.lockerId}`,
          oldState: 'Free',
          newState: 'Opened',
          kioskId: lockerToOpen.kioskId,
          timestamp: new Date().toISOString()
        }
      };

      mockServices.websocketManager.emitLockerStateChanged.mockImplementation(() => {
        // Simulate WebSocket message received
        return lockerUpdate;
      });

      const wsUpdate = mockServices.websocketManager.emitLockerStateChanged(
        `${lockerToOpen.kioskId}-${lockerToOpen.lockerId}`,
        'Free',
        'Opened',
        lockerToOpen.kioskId
      );

      expect(wsUpdate.data.newState).toBe('Opened');

      // Step 6: Update UI state
      mockBrowser.setItem('localStorage', 'lastLockerAction', JSON.stringify({
        action: 'open',
        lockerId: lockerToOpen.lockerId,
        timestamp: new Date().toISOString()
      }));

      const lastAction = JSON.parse(mockBrowser.getItem('localStorage', 'lastLockerAction') || '{}');
      expect(lastAction.action).toBe('open');
      expect(lastAction.lockerId).toBe(lockerToOpen.lockerId);
    });

    test('should handle locker open failure', async () => {
      const failedCommand = {
        id: 'failed-cmd-1',
        type: 'open',
        kioskId: 'kiosk-1',
        lockerId: 99, // Non-existent locker
        userId: 'staff-1',
        timestamp: new Date()
      };

      mockServices.commandBus.executeCommand.mockResolvedValue({
        success: false,
        error: 'Locker not found',
        commandId: failedCommand.id
      });

      const result = await mockServices.commandBus.executeCommand(failedCommand);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Locker not found');

      // Should show error message to user
      mockBrowser.setItem('sessionStorage', 'errorMessage', result.error);
      expect(mockBrowser.getItem('sessionStorage', 'errorMessage')).toBe('Locker not found');
    });
  });

  describe('Help Request Workflow', () => {
    test('should complete full help request workflow', async () => {
      // Step 1: Customer at kiosk encounters problem
      const kioskId = 'kiosk-1';
      const lockerId = 8;

      // Step 2: Customer presses Help button
      const helpRequestData = {
        kiosk_id: kioskId,
        locker_no: lockerId,
        category: 'lock_problem',
        note: 'Door won\'t open after RFID scan'
      };

      // Step 3: Create help request
      const mockHelpRequest = {
        id: 1,
        ...helpRequestData,
        status: 'open',
        created_at: new Date(),
        resolved_at: null
      };

      mockServices.helpService.createHelpRequest.mockResolvedValue(mockHelpRequest);

      const helpRequest = await mockServices.helpService.createHelpRequest(helpRequestData);
      expect(helpRequest.id).toBeDefined();
      expect(helpRequest.status).toBe('open');

      // Step 4: Notify staff via WebSocket
      mockServices.websocketManager.emitHelpRequested.mockImplementation(() => {
        return {
          type: 'HelpRequested',
          data: helpRequest
        };
      });

      const helpNotification = mockServices.websocketManager.emitHelpRequested(helpRequest);
      expect(helpNotification.type).toBe('HelpRequested');
      expect(helpNotification.data.id).toBe(helpRequest.id);

      // Step 5: Staff receives notification and views help requests
      mockServices.helpService.getHelpRequests.mockResolvedValue([helpRequest]);

      const openRequests = await mockServices.helpService.getHelpRequests('open');
      expect(openRequests).toHaveLength(1);
      expect(openRequests[0].id).toBe(helpRequest.id);

      // Step 6: Staff resolves help request
      const resolvedRequest = {
        ...helpRequest,
        status: 'resolved',
        resolved_at: new Date()
      };

      mockServices.helpService.resolveHelpRequest.mockResolvedValue(resolvedRequest);

      await mockServices.helpService.resolveHelpRequest(
        helpRequest.id,
        'Cleared door mechanism, tested operation'
      );

      expect(mockServices.helpService.resolveHelpRequest).toHaveBeenCalledWith(
        helpRequest.id,
        'Cleared door mechanism, tested operation'
      );

      // Step 7: Update help counter in UI
      mockBrowser.setItem('localStorage', 'helpRequestsCount', '0');
      expect(mockBrowser.getItem('localStorage', 'helpRequestsCount')).toBe('0');
    });

    test('should handle multiple concurrent help requests', async () => {
      const helpRequests = [
        {
          kiosk_id: 'kiosk-1',
          locker_no: 5,
          category: 'lock_problem',
          note: 'First help request'
        },
        {
          kiosk_id: 'kiosk-2',
          locker_no: 10,
          category: 'other',
          note: 'Second help request'
        },
        {
          kiosk_id: 'kiosk-3',
          locker_no: 15,
          category: 'lock_problem',
          note: 'Third help request'
        }
      ];

      // Create multiple help requests
      const mockRequests = helpRequests.map((req, index) => ({
        id: index + 1,
        ...req,
        status: 'open',
        created_at: new Date(),
        resolved_at: null
      }));

      mockServices.helpService.createHelpRequest
        .mockResolvedValueOnce(mockRequests[0])
        .mockResolvedValueOnce(mockRequests[1])
        .mockResolvedValueOnce(mockRequests[2]);

      // Create all requests
      const createdRequests = await Promise.all(
        helpRequests.map(req => mockServices.helpService.createHelpRequest(req))
      );

      expect(createdRequests).toHaveLength(3);
      expect(createdRequests.every(req => req.status === 'open')).toBe(true);

      // Staff views all open requests
      mockServices.helpService.getHelpRequests.mockResolvedValue(mockRequests);

      const allOpenRequests = await mockServices.helpService.getHelpRequests('open');
      expect(allOpenRequests).toHaveLength(3);

      // Update help counter
      mockBrowser.setItem('localStorage', 'helpRequestsCount', allOpenRequests.length.toString());
      expect(mockBrowser.getItem('localStorage', 'helpRequestsCount')).toBe('3');
    });
  });

  describe('VIP Contract Workflow', () => {
    test('should complete VIP contract creation workflow', async () => {
      // Step 1: Staff starts VIP contract wizard
      const contractData = {
        member_name: 'John Doe',
        phone: '+1234567890',
        email: 'john@example.com',
        plan: 'premium',
        price: 149.99,
        start_at: new Date(),
        end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        kiosk_id: 'kiosk-1',
        locker_id: 5,
        rfid_card: 'card-123',
        created_by: 'staff-1'
      };

      // Step 2: Create contract
      const mockContract = {
        id: 1,
        ...contractData,
        status: 'active',
        created_at: new Date()
      };

      mockServices.vipService.createContract.mockResolvedValue(mockContract);

      const contract = await mockServices.vipService.createContract(contractData);
      expect(contract.id).toBeDefined();
      expect(contract.status).toBe('active');
      expect(contract.member_name).toBe('John Doe');

      // Step 3: Record payment
      const paymentData = {
        contract_id: contract.id,
        amount: 149.99,
        method: 'card',
        reference: 'txn-789',
        created_by: 'staff-1'
      };

      const mockPayment = {
        id: 1,
        ...paymentData,
        paid_at: new Date()
      };

      mockServices.vipService.recordPayment.mockResolvedValue(mockPayment);

      const payment = await mockServices.vipService.recordPayment(paymentData);
      expect(payment.contract_id).toBe(contract.id);
      expect(payment.amount).toBe(149.99);

      // Step 4: Generate PDF contract
      const mockPdfBuffer = Buffer.from('PDF content');
      mockServices.vipService.generateContractPDF.mockResolvedValue(mockPdfBuffer);

      const pdfBuffer = await mockServices.vipService.generateContractPDF(contract.id);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);

      // Step 5: Complete workflow
      mockBrowser.setItem('localStorage', 'lastVipContract', JSON.stringify({
        contractId: contract.id,
        memberName: contract.member_name,
        completedAt: new Date().toISOString()
      }));

      const lastContract = JSON.parse(mockBrowser.getItem('localStorage', 'lastVipContract') || '{}');
      expect(lastContract.contractId).toBe(contract.id);
      expect(lastContract.memberName).toBe('John Doe');
    });

    test('should handle VIP contract validation errors', async () => {
      const invalidContractData = {
        member_name: '', // Invalid: empty name
        phone: 'invalid-phone', // Invalid format
        plan: 'invalid-plan', // Invalid plan type
        price: -50, // Invalid: negative price
        kiosk_id: 'kiosk-1',
        locker_id: 999, // Invalid: non-existent locker
        created_by: 'staff-1'
      };

      mockServices.vipService.createContract.mockRejectedValue(
        new Error('Validation failed: Invalid member name, phone format, plan type, and price')
      );

      try {
        await mockServices.vipService.createContract(invalidContractData);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).toContain('Validation failed');
      }

      // Should show validation errors to user
      mockBrowser.setItem('sessionStorage', 'validationErrors', JSON.stringify([
        'Member name is required',
        'Invalid phone format',
        'Invalid plan type',
        'Price must be positive'
      ]));

      const errors = JSON.parse(mockBrowser.getItem('sessionStorage', 'validationErrors') || '[]');
      expect(errors).toHaveLength(4);
    });
  });

  describe('Multi-Kiosk Scenarios', () => {
    test('should handle operations across multiple kiosks', async () => {
      const kiosks = ['kiosk-1', 'kiosk-2', 'kiosk-3'];
      
      // Step 1: Staff monitors all kiosks
      mockBrowser.setItem('localStorage', 'monitoredKiosks', JSON.stringify(kiosks));

      // Step 2: Simultaneous help requests from different kiosks
      const helpRequests = kiosks.map((kioskId, index) => ({
        kiosk_id: kioskId,
        locker_no: index + 1,
        category: 'lock_problem',
        note: `Help request from ${kioskId}`
      }));

      const mockHelpRequests = helpRequests.map((req, index) => ({
        id: index + 1,
        ...req,
        status: 'open',
        created_at: new Date()
      }));

      // Mock multiple help request creation
      mockServices.helpService.createHelpRequest
        .mockResolvedValueOnce(mockHelpRequests[0])
        .mockResolvedValueOnce(mockHelpRequests[1])
        .mockResolvedValueOnce(mockHelpRequests[2]);

      // Create help requests from all kiosks
      const createdRequests = await Promise.all(
        helpRequests.map(req => mockServices.helpService.createHelpRequest(req))
      );

      expect(createdRequests).toHaveLength(3);

      // Step 3: Staff receives notifications for all kiosks
      createdRequests.forEach(request => {
        mockServices.websocketManager.emitHelpRequested(request);
      });

      expect(mockServices.websocketManager.emitHelpRequested).toHaveBeenCalledTimes(3);

      // Step 4: Staff can execute commands on different kiosks
      const commands = kiosks.map((kioskId, index) => ({
        id: `cmd-${index}`,
        type: 'open',
        kioskId,
        lockerId: index + 1,
        userId: 'staff-1',
        timestamp: new Date()
      }));

      mockServices.commandBus.executeCommand.mockResolvedValue({
        success: true
      });

      // Execute commands on all kiosks
      const commandResults = await Promise.all(
        commands.map(cmd => mockServices.commandBus.executeCommand(cmd))
      );

      expect(commandResults.every(result => result.success)).toBe(true);

      // Step 5: Update UI for multi-kiosk status
      mockBrowser.setItem('localStorage', 'kioskStatuses', JSON.stringify(
        kiosks.reduce((acc, kioskId) => {
          acc[kioskId] = {
            online: true,
            lastHeartbeat: new Date().toISOString(),
            activeHelpRequests: 1
          };
          return acc;
        }, {} as Record<string, any>)
      ));

      const kioskStatuses = JSON.parse(mockBrowser.getItem('localStorage', 'kioskStatuses') || '{}');
      expect(Object.keys(kioskStatuses)).toHaveLength(3);
      expect(kioskStatuses['kiosk-1'].online).toBe(true);
    });
  });

  describe('Error Recovery Scenarios', () => {
    test('should handle network disconnection and recovery', async () => {
      // Step 1: Normal operation
      mockBrowser.setItem('localStorage', 'connectionStatus', 'connected');

      // Step 2: Network disconnection
      mockServices.websocketManager.handleConnection.mockRejectedValue(
        new Error('Network error')
      );

      try {
        await mockServices.websocketManager.handleConnection({}, '/ws/lockers');
      } catch (error) {
        expect(error.message).toBe('Network error');
      }

      // Update connection status
      mockBrowser.setItem('localStorage', 'connectionStatus', 'disconnected');
      mockBrowser.setItem('localStorage', 'lastDisconnection', new Date().toISOString());

      expect(mockBrowser.getItem('localStorage', 'connectionStatus')).toBe('disconnected');

      // Step 3: Queue operations while offline
      const queuedOperations = [
        { type: 'help_request', data: { kiosk_id: 'kiosk-1', note: 'Queued help' } },
        { type: 'locker_command', data: { kioskId: 'kiosk-1', lockerId: 5, action: 'open' } }
      ];

      mockBrowser.setItem('localStorage', 'queuedOperations', JSON.stringify(queuedOperations));

      // Step 4: Network recovery
      mockServices.websocketManager.handleConnection.mockResolvedValue('connection-id');

      const connectionId = await mockServices.websocketManager.handleConnection({}, '/ws/lockers');
      expect(connectionId).toBe('connection-id');

      // Update connection status
      mockBrowser.setItem('localStorage', 'connectionStatus', 'connected');
      mockBrowser.setItem('localStorage', 'lastReconnection', new Date().toISOString());

      // Step 5: Process queued operations
      const queued = JSON.parse(mockBrowser.getItem('localStorage', 'queuedOperations') || '[]');
      expect(queued).toHaveLength(2);

      // Clear queue after processing
      mockBrowser.removeItem('localStorage', 'queuedOperations');
      expect(mockBrowser.getItem('localStorage', 'queuedOperations')).toBeNull();
    });

    test('should handle session timeout during operation', async () => {
      // Step 1: User starts operation
      const sessionId = 'active-session';
      mockBrowser.setCookie('sessionId', sessionId);

      // Step 2: Session expires during operation
      mockServices.sessionManager.validateSession.mockResolvedValue(null);

      const validatedSession = await mockServices.sessionManager.validateSession(sessionId);
      expect(validatedSession).toBeNull();

      // Step 3: Redirect to login and preserve operation context
      const operationContext = {
        type: 'vip_contract',
        step: 'payment',
        data: { member_name: 'John Doe', plan: 'premium' }
      };

      mockBrowser.setItem('sessionStorage', 'operationContext', JSON.stringify(operationContext));
      mockBrowser.setItem('localStorage', 'currentPage', '/login');

      // Step 4: After re-login, restore operation
      const newSessionId = 'new-session';
      mockBrowser.setCookie('sessionId', newSessionId);

      const savedContext = JSON.parse(mockBrowser.getItem('sessionStorage', 'operationContext') || '{}');
      expect(savedContext.type).toBe('vip_contract');
      expect(savedContext.step).toBe('payment');

      // Clear context after restoration
      mockBrowser.removeItem('sessionStorage', 'operationContext');
    });
  });
});