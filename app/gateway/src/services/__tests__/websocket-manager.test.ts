import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketManager, WebSocketConnection } from '../websocket-manager.js';
import { FastifyInstance } from 'fastify';
import { EventEmitter } from 'events';

// Mock Fastify instance
const mockFastify = {
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
} as unknown as FastifyInstance;

// Mock WebSocket using EventEmitter
class MockWebSocket extends EventEmitter {
  public readyState = 1; // WebSocket.OPEN
  public messages: string[] = [];
  
  static OPEN = 1;
  static CLOSED = 3;
  
  constructor() {
    super();
  }
  
  send(data: string) {
    this.messages.push(data);
  }
  
  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close', code, reason);
  }
  
  simulateMessage(data: any) {
    this.emit('message', Buffer.from(JSON.stringify(data)));
  }
  
  simulateError(error: Error) {
    this.emit('error', error);
  }
}

describe('WebSocketManager', () => {
  let wsManager: WebSocketManager;
  let mockSocket: MockWebSocket;

  beforeEach(() => {
    wsManager = new WebSocketManager(mockFastify);
    mockSocket = new MockWebSocket();
  });

  afterEach(() => {
    wsManager.shutdown();
  });

  describe('Namespace Management', () => {
    it('should create default namespaces', () => {
      expect(wsManager.getConnectionCount('/ws/lockers')).toBe(0);
      expect(wsManager.getConnectionCount('/ws/help')).toBe(0);
      expect(wsManager.getConnectionCount('/ws/events')).toBe(0);
    });

    it('should create custom namespace', () => {
      const namespace = wsManager.createNamespace('/ws/custom', false);
      expect(namespace.path).toBe('/ws/custom');
      expect(namespace.requireAuth).toBe(false);
      expect(wsManager.getConnectionCount('/ws/custom')).toBe(0);
    });
  });

  describe('Connection Management', () => {
    it('should handle connection to non-auth namespace', async () => {
      wsManager.createNamespace('/ws/test', false);
      
      const connectionId = await wsManager.handleConnection(mockSocket, '/ws/test');
      
      expect(connectionId).toBeTruthy();
      expect(wsManager.getConnectionCount('/ws/test')).toBe(1);
      expect(mockSocket.messages.length).toBeGreaterThanOrEqual(1);
      
      const connectionMessage = JSON.parse(mockSocket.messages[0]);
      expect(connectionMessage.type).toBe('connection');
      expect(connectionMessage.data.authenticated).toBe(true);
    });

    it('should reject connection to invalid namespace', async () => {
      const connectionId = await wsManager.handleConnection(mockSocket, '/ws/invalid');
      
      expect(connectionId).toBeNull();
      expect(mockSocket.readyState).toBe(MockWebSocket.CLOSED);
    });

    it('should handle connection disconnection', async () => {
      wsManager.createNamespace('/ws/test', false);
      
      const connectionId = await wsManager.handleConnection(mockSocket, '/ws/test');
      expect(wsManager.getConnectionCount('/ws/test')).toBe(1);
      
      wsManager.handleDisconnection(connectionId!);
      expect(wsManager.getConnectionCount('/ws/test')).toBe(0);
    });

    it('should handle connection with authentication required', async () => {
      const connectionId = await wsManager.handleConnection(mockSocket, '/ws/lockers', 'valid-session-id');
      
      expect(connectionId).toBeTruthy();
      expect(wsManager.getConnectionCount('/ws/lockers')).toBe(1);
    });

    it('should reject connection without valid session', async () => {
      const connectionId = await wsManager.handleConnection(mockSocket, '/ws/lockers', undefined);
      
      expect(connectionId).toBeNull();
      expect(mockSocket.readyState).toBe(MockWebSocket.CLOSED);
    });
  });

  describe('Room Management', () => {
    let connectionId: string;

    beforeEach(async () => {
      wsManager.createNamespace('/ws/test', false);
      connectionId = (await wsManager.handleConnection(mockSocket, '/ws/test'))!;
      mockSocket.messages = []; // Clear connection message
    });

    it('should join room', () => {
      wsManager.joinRoom(connectionId, 'test-room');
      
      expect(mockSocket.messages).toHaveLength(1);
      const message = JSON.parse(mockSocket.messages[0]);
      expect(message.type).toBe('room_joined');
      expect(message.data.room).toBe('test-room');
    });

    it('should leave room', () => {
      wsManager.joinRoom(connectionId, 'test-room');
      mockSocket.messages = []; // Clear join message
      
      wsManager.leaveRoom(connectionId, 'test-room');
      
      expect(mockSocket.messages).toHaveLength(1);
      const message = JSON.parse(mockSocket.messages[0]);
      expect(message.type).toBe('room_left');
      expect(message.data.room).toBe('test-room');
    });

    it('should handle join room message', () => {
      mockSocket.simulateMessage({ type: 'join_room', room: 'test-room' });
      
      expect(mockSocket.messages).toHaveLength(1);
      const message = JSON.parse(mockSocket.messages[0]);
      expect(message.type).toBe('room_joined');
    });

    it('should handle leave room message', () => {
      wsManager.joinRoom(connectionId, 'test-room');
      mockSocket.messages = []; // Clear join message
      
      mockSocket.simulateMessage({ type: 'leave_room', room: 'test-room' });
      
      expect(mockSocket.messages).toHaveLength(1);
      const message = JSON.parse(mockSocket.messages[0]);
      expect(message.type).toBe('room_left');
    });
  });

  describe('Broadcasting', () => {
    let connectionId1: string;
    let connectionId2: string;
    let mockSocket2: MockWebSocket;

    beforeEach(async () => {
      wsManager.createNamespace('/ws/test', false);
      
      connectionId1 = (await wsManager.handleConnection(mockSocket, '/ws/test'))!;
      
      mockSocket2 = new MockWebSocket();
      connectionId2 = (await wsManager.handleConnection(mockSocket2, '/ws/test'))!;
      
      // Clear connection messages
      mockSocket.messages = [];
      mockSocket2.messages = [];
    });

    it('should broadcast to all connections in namespace', () => {
      wsManager.broadcast('/ws/test', 'test-event', { message: 'hello' });
      
      expect(mockSocket.messages).toHaveLength(1);
      expect(mockSocket2.messages).toHaveLength(1);
      
      const message1 = JSON.parse(mockSocket.messages[0]);
      const message2 = JSON.parse(mockSocket2.messages[0]);
      
      expect(message1.type).toBe('test-event');
      expect(message1.data.message).toBe('hello');
      expect(message2.type).toBe('test-event');
      expect(message2.data.message).toBe('hello');
    });

    it('should broadcast to room only', () => {
      wsManager.joinRoom(connectionId1, 'room1');
      wsManager.joinRoom(connectionId2, 'room2');
      
      // Clear room join messages
      mockSocket.messages = [];
      mockSocket2.messages = [];
      
      wsManager.broadcastToRoom('/ws/test', 'room1', 'room-event', { message: 'room1 only' });
      
      expect(mockSocket.messages).toHaveLength(1);
      expect(mockSocket2.messages).toHaveLength(0);
      
      const message = JSON.parse(mockSocket.messages[0]);
      expect(message.type).toBe('room-event');
      expect(message.data.message).toBe('room1 only');
      expect(message.room).toBe('room1');
    });

    it('should not broadcast to closed connections', () => {
      mockSocket2.readyState = MockWebSocket.CLOSED;
      
      wsManager.broadcast('/ws/test', 'test-event', { message: 'hello' });
      
      expect(mockSocket.messages).toHaveLength(1);
      expect(mockSocket2.messages).toHaveLength(0);
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      // Set up connections to all namespaces with valid session IDs
      await wsManager.handleConnection(mockSocket, '/ws/lockers', 'valid-session-id-1');
      
      const mockSocket2 = new MockWebSocket();
      await wsManager.handleConnection(mockSocket2, '/ws/help', 'valid-session-id-2');
      
      const mockSocket3 = new MockWebSocket();
      await wsManager.handleConnection(mockSocket3, '/ws/events', 'valid-session-id-3');
      
      // Clear connection messages
      mockSocket.messages = [];
    });

    it('should emit locker state changed event', async () => {
      await wsManager.emitLockerStateChanged('locker-1', 'closed', 'open', 'kiosk-1');
      
      // Should broadcast to both /ws/lockers and /ws/events
      expect(mockSocket.messages.length).toBeGreaterThan(0);
      
      // Find the locker state changed message (might not be the first due to connection events)
      const lockerMessage = mockSocket.messages
        .map(msg => JSON.parse(msg))
        .find(msg => msg.type === 'locker_state_changed');
      
      expect(lockerMessage).toBeTruthy();
      expect(lockerMessage.data.lockerId).toBe('locker-1');
      expect(lockerMessage.data.oldState).toBe('closed');
      expect(lockerMessage.data.newState).toBe('open');
      expect(lockerMessage.data.kioskId).toBe('kiosk-1');
    });

    it('should emit help requested event', async () => {
      const helpRequest = {
        id: 1,
        kiosk_id: 'kiosk-1',
        category: 'access_issue' as const,
        status: 'open' as const,
        created_at: '2024-01-01T10:00:00.000Z',
        note: 'Cannot open locker'
      };
      
      await wsManager.emitHelpRequested(helpRequest);
      
      // Should broadcast to both /ws/help and /ws/events
      // We can't easily test multiple sockets here, but we can verify the method doesn't throw
      await expect(wsManager.emitHelpRequested(helpRequest)).resolves.not.toThrow();
    });

    it('should emit command applied event', async () => {
      const command = { 
        id: 'cmd-123',
        type: 'open' as const, 
        lockerId: 'locker-1',
        issued_by: 'user-123',
        issued_at: '2024-01-01T10:00:00.000Z'
      };
      const result = { success: true, timestamp: new Date().toISOString() };
      
      await wsManager.emitCommandApplied(command, result);
      
      // Should broadcast to /ws/events
      await expect(wsManager.emitCommandApplied(command, result)).resolves.not.toThrow();
    });
  });

  describe('Message Handling', () => {
    let connectionId: string;

    beforeEach(async () => {
      wsManager.createNamespace('/ws/test', false);
      connectionId = (await wsManager.handleConnection(mockSocket, '/ws/test'))!;
      mockSocket.messages = []; // Clear connection message
    });

    it('should handle ping message', () => {
      mockSocket.simulateMessage({ type: 'ping' });
      
      expect(mockSocket.messages).toHaveLength(1);
      const message = JSON.parse(mockSocket.messages[0]);
      expect(message.type).toBe('pong');
    });

    it('should handle invalid JSON message', () => {
      mockSocket.emit('message', Buffer.from('invalid json'));
      
      expect(mockSocket.messages).toHaveLength(1);
      const message = JSON.parse(mockSocket.messages[0]);
      expect(message.type).toBe('error');
      expect(message.data.message).toBe('Invalid message format');
    });

    it('should handle unknown message type', () => {
      mockSocket.simulateMessage({ type: 'unknown' });
      
      // Should log warning but not crash
      expect(mockFastify.log.warn).toHaveBeenCalled();
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should track connection count', async () => {
      wsManager.createNamespace('/ws/test', false);
      
      expect(wsManager.getConnectionCount()).toBe(0);
      expect(wsManager.getConnectionCount('/ws/test')).toBe(0);
      
      await wsManager.handleConnection(mockSocket, '/ws/test');
      
      expect(wsManager.getConnectionCount()).toBe(1);
      expect(wsManager.getConnectionCount('/ws/test')).toBe(1);
    });

    it('should provide latency metrics', () => {
      const metrics = wsManager.getLatencyMetrics();
      
      expect(metrics).toHaveProperty('median');
      expect(metrics).toHaveProperty('p95');
      expect(metrics).toHaveProperty('p99');
      expect(metrics).toHaveProperty('connection_count');
      expect(metrics.connection_count).toBe(0);
    });
  });

  describe('Error Handling', () => {
    let connectionId: string;

    beforeEach(async () => {
      wsManager.createNamespace('/ws/test', false);
      connectionId = (await wsManager.handleConnection(mockSocket, '/ws/test'))!;
    });

    it('should handle socket error', () => {
      const error = new Error('Socket error');
      mockSocket.simulateError(error);
      
      expect(mockFastify.log.error).toHaveBeenCalledWith(
        `WebSocket error for ${connectionId}:`,
        error
      );
    });

    it('should clean up connection on error', () => {
      expect(wsManager.getConnectionCount('/ws/test')).toBe(1);
      
      const error = new Error('Socket error');
      mockSocket.simulateError(error);
      
      expect(wsManager.getConnectionCount('/ws/test')).toBe(0);
    });
  });

  describe('Cleanup', () => {
    it('should shutdown gracefully', () => {
      expect(() => wsManager.shutdown()).not.toThrow();
    });
  });
});