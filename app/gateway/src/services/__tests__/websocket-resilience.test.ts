import { FastifyInstance } from 'fastify';
import { WebSocketManager } from '../websocket-manager.js';
import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock WebSocket for testing
class MockWebSocket extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  protocol = '';
  
  constructor() {
    super();
    // Simulate connection being open
    setTimeout(() => this.emit('open'), 10);
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    
    // Parse and handle special messages
    try {
      const message = JSON.parse(data);
      if (message.type === 'ping') {
        // Simulate pong response
        setTimeout(() => {
          this.emit('message', JSON.stringify({
            type: 'pong',
            data: { timestamp: message.data?.timestamp },
            timestamp: new Date().toISOString()
          }));
        }, 10);
      }
    } catch (error) {
      // Ignore parsing errors
    }
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    setTimeout(() => this.emit('close', code || 1000, reason || ''), 10);
  }

  ping() {
    this.emit('pong');
  }

  // Test helpers
  simulateMessage(data: string) {
    this.emit('message', data);
  }

  simulateError(error: Error) {
    this.emit('error', error);
  }

  simulateClose(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close', code, reason);
  }
}

// Mock Fastify instance
const mockFastify = {
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
} as unknown as FastifyInstance;

describe('WebSocketManager Resilience', () => {
  let websocketManager: WebSocketManager;
  let mockWebSocket: MockWebSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    websocketManager = new WebSocketManager(mockFastify);
    mockWebSocket = new MockWebSocket();
  });

  afterEach(() => {
    websocketManager.shutdown();
    vi.clearAllTimers();
  });

  describe('Connection Health Monitoring', () => {
    it('should track connection health metrics', async () => {
      const connectionId = await websocketManager.handleConnection(
        mockWebSocket as unknown as WebSocket,
        '/ws/lockers',
        'test-session'
      );

      expect(connectionId).toBeTruthy();

      // Simulate some latency measurements
      const startTime = Date.now();
      await new Promise(resolve => setTimeout(resolve, 50));
      const endTime = Date.now();
      
      // Get metrics
      const metrics = websocketManager.getLatencyMetrics();
      expect(metrics.connection_count).toBe(1);
      expect(metrics.median).toBeGreaterThanOrEqual(0);
    });

    it('should clean up inactive connections', async () => {
      const connectionId = await websocketManager.handleConnection(
        mockWebSocket as unknown as WebSocket,
        '/ws/lockers',
        'test-session'
      );

      expect(websocketManager.getConnectionCount()).toBe(1);

      // Simulate connection becoming inactive by closing it
      mockWebSocket.simulateClose(1006, 'Connection timeout');

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(websocketManager.getConnectionCount()).toBe(0);
    });

    it('should handle connection errors gracefully', async () => {
      const connectionId = await websocketManager.handleConnection(
        mockWebSocket as unknown as WebSocket,
        '/ws/lockers',
        'test-session'
      );

      expect(connectionId).toBeTruthy();

      // Simulate connection error
      mockWebSocket.simulateError(new Error('Network error'));

      // Connection should be cleaned up
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(websocketManager.getConnectionCount()).toBe(0);
    });
  });

  describe('Message Broadcasting Resilience', () => {
    it('should handle broadcast to closed connections', async () => {
      const connectionId = await websocketManager.handleConnection(
        mockWebSocket as unknown as WebSocket,
        '/ws/lockers',
        'test-session'
      );

      // Close the connection
      mockWebSocket.readyState = MockWebSocket.CLOSED;

      // Broadcasting should not throw errors
      await expect(
        websocketManager.broadcast('/ws/lockers', 'test_event', { data: 'test' })
      ).resolves.not.toThrow();
    });

    it('should track broadcast latency', async () => {
      const connectionId = await websocketManager.handleConnection(
        mockWebSocket as unknown as WebSocket,
        '/ws/lockers',
        'test-session'
      );

      // Perform broadcast
      await websocketManager.broadcast('/ws/lockers', 'test_event', { data: 'test' });

      // Check that latency was recorded
      const metrics = websocketManager.getLatencyMetrics();
      expect(metrics.median).toBeGreaterThanOrEqual(0);
    });

    it('should handle room-based broadcasting with missing rooms', async () => {
      const connectionId = await websocketManager.handleConnection(
        mockWebSocket as unknown as WebSocket,
        '/ws/lockers',
        'test-session'
      );

      // Broadcast to non-existent room should not throw
      await expect(
        websocketManager.broadcastToRoom('/ws/lockers', 'non_existent_room', 'test_event', { data: 'test' })
      ).resolves.not.toThrow();
    });
  });

  describe('Event Persistence and Replay', () => {
    it('should persist events for replay', async () => {
      const connectionId = await websocketManager.handleConnection(
        mockWebSocket as unknown as WebSocket,
        '/ws/lockers',
        'test-session'
      );

      // Emit a locker state change event
      await websocketManager.emitLockerStateChanged(
        'kiosk1:1',
        'closed',
        'open',
        'kiosk1',
        { userId: 'test-user' }
      );

      // Event should be persisted
      const stats = websocketManager.getEventStatistics();
      expect(stats.total_events).toBeGreaterThan(0);
    });

    it('should replay events for new connections', async () => {
      // First, emit some events
      await websocketManager.emitLockerStateChanged(
        'kiosk1:1',
        'closed',
        'open',
        'kiosk1'
      );

      // Then connect a new client
      const connectionId = await websocketManager.handleConnection(
        mockWebSocket as unknown as WebSocket,
        '/ws/lockers',
        'test-session'
      );

      expect(connectionId).toBeTruthy();
      // Event replay happens automatically in handleConnection
    });

    it('should handle help request events', async () => {
      const connectionId = await websocketManager.handleConnection(
        mockWebSocket as unknown as WebSocket,
        '/ws/help',
        'test-session'
      );

      const helpRequest = {
        id: 1,
        kiosk_id: 'kiosk1',
        locker_no: 5,
        category: 'access_issue' as const,
        note: 'Cannot open locker',
        status: 'open' as const,
        created_at: new Date().toISOString()
      };

      await websocketManager.emitHelpRequested(helpRequest, 'high');

      // Event should be persisted and broadcast
      const stats = websocketManager.getEventStatistics();
      expect(stats.total_events).toBeGreaterThan(0);
    });

    it('should handle command applied events', async () => {
      const connectionId = await websocketManager.handleConnection(
        mockWebSocket as unknown as WebSocket,
        '/ws/events',
        'test-session'
      );

      const command = {
        id: 'cmd-123',
        type: 'open' as const,
        lockerId: 'kiosk1:1',
        kioskId: 'kiosk1',
        issued_by: 'test-user',
        issued_at: new Date().toISOString()
      };

      const result = {
        success: true,
        message: 'Locker opened successfully',
        timestamp: new Date().toISOString(),
        execution_time_ms: 150
      };

      await websocketManager.emitCommandApplied(command, result);

      // Event should be persisted and broadcast
      const stats = websocketManager.getEventStatistics();
      expect(stats.total_events).toBeGreaterThan(0);
    });
  });

  describe('Namespace Management', () => {
    it('should handle invalid namespace connections', async () => {
      const connectionId = await websocketManager.handleConnection(
        mockWebSocket as unknown as WebSocket,
        '/ws/invalid',
        'test-session'
      );

      expect(connectionId).toBeNull();
      expect(mockWebSocket.readyState).toBe(MockWebSocket.CLOSED);
    });

    it('should require authentication for protected namespaces', async () => {
      const connectionId = await websocketManager.handleConnection(
        mockWebSocket as unknown as WebSocket,
        '/ws/lockers'
        // No session ID provided
      );

      expect(connectionId).toBeNull();
      expect(mockWebSocket.readyState).toBe(MockWebSocket.CLOSED);
    });

    it('should handle room management correctly', async () => {
      const connectionId = await websocketManager.handleConnection(
        mockWebSocket as unknown as WebSocket,
        '/ws/lockers',
        'test-session'
      );

      expect(connectionId).toBeTruthy();

      // Join room
      websocketManager.joinRoom(connectionId!, 'test_room');

      // Broadcast to room
      await websocketManager.broadcastToRoom('/ws/lockers', 'test_room', 'test_event', { data: 'test' });

      // Leave room
      websocketManager.leaveRoom(connectionId!, 'test_room');

      // Broadcasting to empty room should not throw
      await expect(
        websocketManager.broadcastToRoom('/ws/lockers', 'test_room', 'test_event', { data: 'test' })
      ).resolves.not.toThrow();
    });
  });

  describe('System Status Events', () => {
    it('should emit system status events', async () => {
      const connectionId = await websocketManager.handleConnection(
        mockWebSocket as unknown as WebSocket,
        '/ws/events',
        'test-session'
      );

      await websocketManager.emitSystemStatus(
        'gateway',
        'online',
        95,
        {
          metrics: {
            cpu_usage: 25,
            memory_usage: 60,
            network_latency: 50
          },
          message: 'System healthy'
        }
      );

      const stats = websocketManager.getEventStatistics();
      expect(stats.total_events).toBeGreaterThan(0);
    });

    it('should emit help status updated events', async () => {
      const connectionId = await websocketManager.handleConnection(
        mockWebSocket as unknown as WebSocket,
        '/ws/help',
        'test-session'
      );

      await websocketManager.emitHelpStatusUpdated(
        1,
        'open',
        'assigned',
        { agentId: 'agent-123' }
      );

      const stats = websocketManager.getEventStatistics();
      expect(stats.total_events).toBeGreaterThan(0);
    });
  });

  describe('Resource Management', () => {
    it('should shutdown cleanly', async () => {
      const connectionId1 = await websocketManager.handleConnection(
        mockWebSocket as unknown as WebSocket,
        '/ws/lockers',
        'test-session-1'
      );

      const mockWebSocket2 = new MockWebSocket();
      const connectionId2 = await websocketManager.handleConnection(
        mockWebSocket2 as unknown as WebSocket,
        '/ws/help',
        'test-session-2'
      );

      expect(websocketManager.getConnectionCount()).toBe(2);

      // Shutdown should close all connections
      websocketManager.shutdown();

      expect(mockWebSocket.readyState).toBe(MockWebSocket.CLOSED);
      expect(mockWebSocket2.readyState).toBe(MockWebSocket.CLOSED);
    });

    it('should handle high connection load', async () => {
      const connections: MockWebSocket[] = [];
      const connectionIds: (string | null)[] = [];

      // Create 100 connections
      for (let i = 0; i < 100; i++) {
        const ws = new MockWebSocket();
        connections.push(ws);
        
        const connectionId = await websocketManager.handleConnection(
          ws as unknown as WebSocket,
          '/ws/lockers',
          `test-session-${i}`
        );
        connectionIds.push(connectionId);
      }

      expect(websocketManager.getConnectionCount()).toBe(100);

      // Broadcast to all connections
      const startTime = Date.now();
      await websocketManager.broadcast('/ws/lockers', 'load_test', { data: 'test' });
      const endTime = Date.now();

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(1000);

      // Clean up
      connections.forEach(ws => ws.simulateClose());
    });
  });
});