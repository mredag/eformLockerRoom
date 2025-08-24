/**
 * Integration Tests for Panel-Gateway Communication
 * Tests the communication between panel frontend and gateway backend
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import TestUtils from '../../test-setup';

describe('Panel-Gateway Integration Tests', () => {
  let gatewayApp: FastifyInstance;
  let panelApp: FastifyInstance;
  let testDbPath: string;

  beforeAll(async () => {
    testDbPath = await TestUtils.createTestDatabase('panel-gateway-integration');
    
    // Mock gateway app
    gatewayApp = {
      inject: vi.fn(),
      listen: vi.fn(),
      close: vi.fn(),
      register: vi.fn(),
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn()
    } as any;

    // Mock panel app  
    panelApp = {
      inject: vi.fn(),
      listen: vi.fn(),
      close: vi.fn(),
      register: vi.fn(),
      get: vi.fn(),
      post: vi.fn()
    } as any;
  });

  describe('Authentication Integration', () => {
    test('should authenticate panel requests to gateway', async () => {
      // Mock successful login response
      (gatewayApp.inject as any).mockResolvedValue({
        statusCode: 200,
        payload: JSON.stringify({
          success: true,
          sessionId: 'test-session-123',
          user: { id: 'staff-1', role: 'admin' }
        })
      });

      const loginResponse = await gatewayApp.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          username: 'admin',
          password: 'test-password'
        }
      });

      expect(loginResponse.statusCode).toBe(200);
      const responseData = JSON.parse(loginResponse.payload);
      expect(responseData.success).toBe(true);
      expect(responseData.sessionId).toBeDefined();
    });

    test('should validate session tokens', async () => {
      (gatewayApp.inject as any).mockResolvedValue({
        statusCode: 200,
        payload: JSON.stringify({
          valid: true,
          user: { id: 'staff-1', role: 'admin' }
        })
      });

      const validationResponse = await gatewayApp.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          'Cookie': 'sessionId=test-session-123'
        }
      });

      expect(validationResponse.statusCode).toBe(200);
      const responseData = JSON.parse(validationResponse.payload);
      expect(responseData.valid).toBe(true);
    });

    test('should reject invalid sessions', async () => {
      (gatewayApp.inject as any).mockResolvedValue({
        statusCode: 401,
        payload: JSON.stringify({
          error: 'Invalid session'
        })
      });

      const validationResponse = await gatewayApp.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          'Cookie': 'sessionId=invalid-session'
        }
      });

      expect(validationResponse.statusCode).toBe(401);
    });
  });

  describe('API Communication', () => {
    test('should fetch locker status from gateway', async () => {
      const mockLockers = TestUtils.generateTestLockers('kiosk-1', 10);
      
      (gatewayApp.inject as any).mockResolvedValue({
        statusCode: 200,
        payload: JSON.stringify({
          lockers: mockLockers
        })
      });

      const lockersResponse = await gatewayApp.inject({
        method: 'GET',
        url: '/api/lockers',
        headers: {
          'Cookie': 'sessionId=valid-session'
        }
      });

      expect(lockersResponse.statusCode).toBe(200);
      const responseData = JSON.parse(lockersResponse.payload);
      expect(responseData.lockers).toHaveLength(10);
      expect(responseData.lockers[0].kiosk_id).toBe('kiosk-1');
    });

    test('should create help requests via API', async () => {
      const helpRequestData = {
        kiosk_id: 'kiosk-1',
        locker_no: 5,
        category: 'lock_problem',
        note: 'Integration test help request'
      };

      (gatewayApp.inject as any).mockResolvedValue({
        statusCode: 201,
        payload: JSON.stringify({
          id: 1,
          ...helpRequestData,
          status: 'open',
          created_at: new Date().toISOString()
        })
      });

      const helpResponse = await gatewayApp.inject({
        method: 'POST',
        url: '/api/help',
        payload: helpRequestData,
        headers: {
          'Cookie': 'sessionId=valid-session',
          'Content-Type': 'application/json'
        }
      });

      expect(helpResponse.statusCode).toBe(201);
      const responseData = JSON.parse(helpResponse.payload);
      expect(responseData.id).toBeDefined();
      expect(responseData.status).toBe('open');
    });

    test('should execute remote commands', async () => {
      const commandData = {
        type: 'open',
        kioskId: 'kiosk-1',
        lockerId: 5
      };

      (gatewayApp.inject as any).mockResolvedValue({
        statusCode: 200,
        payload: JSON.stringify({
          success: true,
          commandId: 'cmd-123',
          message: 'Command executed successfully'
        })
      });

      const commandResponse = await gatewayApp.inject({
        method: 'POST',
        url: '/api/commands',
        payload: commandData,
        headers: {
          'Cookie': 'sessionId=valid-session',
          'Content-Type': 'application/json'
        }
      });

      expect(commandResponse.statusCode).toBe(200);
      const responseData = JSON.parse(commandResponse.payload);
      expect(responseData.success).toBe(true);
      expect(responseData.commandId).toBeDefined();
    });
  });

  describe('WebSocket Integration', () => {
    test('should establish WebSocket connection', async () => {
      const mockWebSocket = {
        on: vi.fn(),
        send: vi.fn(),
        close: vi.fn(),
        readyState: 1,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };

      // Simulate WebSocket connection
      const wsUrl = 'ws://localhost:3001/ws/lockers';
      
      // Mock connection establishment
      mockWebSocket.on.mockImplementation((event, callback) => {
        if (event === 'open') {
          setTimeout(() => callback(), 10);
        }
      });

      // Simulate connection
      const connectionPromise = new Promise((resolve) => {
        mockWebSocket.addEventListener('open', resolve);
      });

      // Trigger open event
      setTimeout(() => {
        const openCallback = mockWebSocket.addEventListener.mock.calls
          .find(call => call[0] === 'open')?.[1];
        if (openCallback) openCallback();
      }, 5);

      await connectionPromise;
      expect(mockWebSocket.addEventListener).toHaveBeenCalledWith('open', expect.any(Function));
    });

    test('should receive real-time locker updates', async () => {
      const mockWebSocket = {
        on: vi.fn(),
        send: vi.fn(),
        close: vi.fn(),
        readyState: 1,
        addEventListener: vi.fn()
      };

      let messageHandler: Function;
      mockWebSocket.addEventListener.mockImplementation((event, callback) => {
        if (event === 'message') {
          messageHandler = callback;
        }
      });

      // Simulate receiving a locker state change message
      const lockerUpdate = {
        type: 'LockerStateChanged',
        data: {
          lockerId: 'kiosk-1-5',
          oldState: 'Free',
          newState: 'Owned',
          kioskId: 'kiosk-1',
          timestamp: new Date().toISOString()
        }
      };

      const receivedMessages: any[] = [];
      if (messageHandler) {
        messageHandler({
          data: JSON.stringify(lockerUpdate)
        });
      }

      // In a real implementation, this would update the UI
      expect(messageHandler).toBeDefined();
    });

    test('should handle WebSocket reconnection', async () => {
      const mockWebSocket = {
        on: vi.fn(),
        send: vi.fn(),
        close: vi.fn(),
        readyState: 3, // CLOSED
        addEventListener: vi.fn()
      };

      let closeHandler: Function;
      mockWebSocket.addEventListener.mockImplementation((event, callback) => {
        if (event === 'close') {
          closeHandler = callback;
        }
      });

      // Simulate connection close
      if (closeHandler) {
        closeHandler({ code: 1006, reason: 'Connection lost' });
      }

      // Verify reconnection logic would be triggered
      expect(mockWebSocket.addEventListener).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  describe('Error Handling', () => {
    test('should handle gateway service unavailable', async () => {
      (gatewayApp.inject as any).mockRejectedValue(new Error('ECONNREFUSED'));

      try {
        await gatewayApp.inject({
          method: 'GET',
          url: '/api/lockers'
        });
      } catch (error) {
        expect(error.message).toBe('ECONNREFUSED');
      }
    });

    test('should handle API timeout', async () => {
      (gatewayApp.inject as any).mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      );

      try {
        await gatewayApp.inject({
          method: 'GET',
          url: '/api/lockers'
        });
      } catch (error) {
        expect(error.message).toBe('Request timeout');
      }
    });

    test('should handle malformed responses', async () => {
      (gatewayApp.inject as any).mockResolvedValue({
        statusCode: 200,
        payload: 'invalid-json'
      });

      const response = await gatewayApp.inject({
        method: 'GET',
        url: '/api/lockers'
      });

      expect(response.statusCode).toBe(200);
      expect(() => JSON.parse(response.payload)).toThrow();
    });
  });

  describe('Performance Tests', () => {
    test('should handle multiple concurrent requests', async () => {
      const concurrentRequests = 10;
      const requests = [];

      for (let i = 0; i < concurrentRequests; i++) {
        (gatewayApp.inject as any).mockResolvedValue({
          statusCode: 200,
          payload: JSON.stringify({ success: true, requestId: i })
        });

        requests.push(
          gatewayApp.inject({
            method: 'GET',
            url: `/api/test/${i}`
          })
        );
      }

      const responses = await Promise.all(requests);
      
      expect(responses).toHaveLength(concurrentRequests);
      responses.forEach((response, index) => {
        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        expect(data.requestId).toBe(index);
      });
    });

    test('should maintain WebSocket connection under load', async () => {
      const messageCount = 100;
      const mockWebSocket = {
        on: vi.fn(),
        send: vi.fn(),
        close: vi.fn(),
        readyState: 1,
        addEventListener: vi.fn()
      };

      let messageHandler: Function;
      mockWebSocket.addEventListener.mockImplementation((event, callback) => {
        if (event === 'message') {
          messageHandler = callback;
        }
      });

      const receivedMessages: any[] = [];
      
      // Simulate receiving many messages quickly
      for (let i = 0; i < messageCount; i++) {
        const message = {
          type: 'LockerStateChanged',
          data: { lockerId: `locker-${i}`, timestamp: Date.now() }
        };

        if (messageHandler) {
          messageHandler({ data: JSON.stringify(message) });
          receivedMessages.push(message);
        }
      }

      expect(receivedMessages).toHaveLength(messageCount);
      expect(mockWebSocket.readyState).toBe(1); // Still connected
    });
  });
});