import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketManager } from '../websocket-manager.js';
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

// Enhanced Mock WebSocket with better WebSocket interface compatibility
class MockWebSocket extends EventEmitter {
  public readyState = 1; // WebSocket.OPEN
  public messages: string[] = [];
  public protocol = '';
  public url = '';
  public extensions = '';
  public binaryType: 'blob' | 'arraybuffer' = 'blob';
  public bufferedAmount = 0;
  
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  
  constructor() {
    super();
  }
  
  send(data: string | Buffer | ArrayBuffer | Buffer[]) {
    if (this.readyState === MockWebSocket.OPEN) {
      this.messages.push(data.toString());
    }
  }
  
  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close', code, reason);
  }
  
  ping() {
    this.emit('ping');
  }
  
  pong() {
    this.emit('pong');
  }
  
  terminate() {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close');
  }
  
  simulateMessage(data: any) {
    this.emit('message', Buffer.from(JSON.stringify(data)));
  }
  
  simulateError(error: Error) {
    this.emit('error', error);
  }
  
  getLastMessage() {
    return this.messages[this.messages.length - 1];
  }
  
  getLastMessageData() {
    const lastMessage = this.getLastMessage();
    return lastMessage ? JSON.parse(lastMessage) : null;
  }
  
  clearMessages() {
    this.messages = [];
  }
}

describe('WebSocket Event Broadcasting', () => {
  let wsManager: WebSocketManager;
  let mockSocket1: MockWebSocket;
  let mockSocket2: MockWebSocket;
  let connectionId1: string;
  let connectionId2: string;

  beforeEach(async () => {
    wsManager = new WebSocketManager(mockFastify);
    mockSocket1 = new MockWebSocket();
    mockSocket2 = new MockWebSocket();

    // Create connections
    connectionId1 = (await wsManager.handleConnection(
      mockSocket1 as any,
      '/ws/lockers',
      'valid-session-1'
    ))!;
    
    connectionId2 = (await wsManager.handleConnection(
      mockSocket2 as any,
      '/ws/help',
      'valid-session-2'
    ))!;

    // Clear connection messages
    mockSocket1.clearMessages();
    mockSocket2.clearMessages();
  });

  afterEach(() => {
    wsManager.shutdown();
  });

  describe('Locker State Changed Events', () => {
    it('should broadcast locker state changed event with proper structure', async () => {
      await wsManager.emitLockerStateChanged(
        'locker-1',
        'closed',
        'open',
        'kiosk-1',
        {
          userId: 'user-123',
          reason: 'User opened locker',
          metadata: { force: false }
        }
      );

      // Should broadcast to locker connections
      expect(mockSocket1.messages.length).toBeGreaterThan(0);
      
      const message = mockSocket1.getLastMessageData();
      expect(message.type).toBe('locker_state_changed');
      expect(message.data.lockerId).toBe('locker-1');
      expect(message.data.oldState).toBe('closed');
      expect(message.data.newState).toBe('open');
      expect(message.data.kioskId).toBe('kiosk-1');
      expect(message.data.userId).toBe('user-123');
      expect(message.data.reason).toBe('User opened locker');
      expect(message.data.metadata.force).toBe(false);
      expect(message.id).toBeTruthy();
      expect(message.timestamp).toBeTruthy();
      expect(message.version).toBeTruthy();
    });

    it('should broadcast to multiple namespaces', async () => {
      // Connect to events namespace
      const mockSocket3 = new MockWebSocket();
      const connectionId3 = await wsManager.handleConnection(
        mockSocket3 as any,
        '/ws/events',
        'valid-session-3'
      );
      mockSocket3.clearMessages();

      await wsManager.emitLockerStateChanged(
        'locker-2',
        'open',
        'closed',
        'kiosk-2'
      );

      // Should broadcast to both lockers and events namespaces
      expect(mockSocket1.messages.length).toBeGreaterThan(0);
      expect(mockSocket3.messages.length).toBeGreaterThan(0);
      
      const lockersMessage = mockSocket1.getLastMessageData();
      const eventsMessage = mockSocket3.getLastMessageData();
      
      expect(lockersMessage.type).toBe('locker_state_changed');
      expect(eventsMessage.type).toBe('locker_state_changed');
      expect(lockersMessage.data.lockerId).toBe('locker-2');
      expect(eventsMessage.data.lockerId).toBe('locker-2');
    });

    it('should validate locker state values', async () => {
      // This should not throw as the event service validates the states
      await expect(wsManager.emitLockerStateChanged(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      )).resolves.not.toThrow();

      // Invalid states should be caught by the event service validation
      await expect(wsManager.emitLockerStateChanged(
        'locker-1',
        'invalid-state' as any,
        'open',
        'kiosk-1'
      )).rejects.toThrow();
    });
  });

  describe('Help Request Events', () => {
    it('should broadcast help requested event with proper structure', async () => {
      const helpRequest = {
        id: 1,
        kiosk_id: 'kiosk-1',
        locker_no: 5,
        category: 'access_issue' as const,
        note: 'Cannot open locker',
        status: 'open' as const,
        created_at: '2024-01-01T10:00:00.000Z',
        user_contact: 'user@example.com'
      };

      await wsManager.emitHelpRequested(helpRequest, 'high');

      expect(mockSocket2.messages.length).toBeGreaterThan(0);
      
      const message = mockSocket2.getLastMessageData();
      expect(message.type).toBe('help_requested');
      expect(message.data.id).toBe(1);
      expect(message.data.kiosk_id).toBe('kiosk-1');
      expect(message.data.category).toBe('access_issue');
      expect(message.data.priority).toBe('high');
      expect(message.data.user_contact).toBe('user@example.com');
    });

    it('should broadcast help status updated event', async () => {
      await wsManager.emitHelpStatusUpdated(
        1,
        'open',
        'assigned',
        {
          agentId: 'agent-123',
          resolutionNotes: 'Assigned to technician'
        }
      );

      expect(mockSocket2.messages.length).toBeGreaterThan(0);
      
      const message = mockSocket2.getLastMessageData();
      expect(message.type).toBe('help_status_updated');
      expect(message.data.id).toBe(1);
      expect(message.data.old_status).toBe('open');
      expect(message.data.new_status).toBe('assigned');
      expect(message.data.agent_id).toBe('agent-123');
      expect(message.data.resolution_notes).toBe('Assigned to technician');
    });

    it('should use default priority when not specified', async () => {
      const helpRequest = {
        id: 2,
        kiosk_id: 'kiosk-2',
        category: 'hardware_problem' as const,
        status: 'open' as const,
        created_at: '2024-01-01T10:00:00.000Z'
      };

      await wsManager.emitHelpRequested(helpRequest);

      const message = mockSocket2.getLastMessageData();
      expect(message.data.priority).toBe('medium');
    });
  });

  describe('Command Applied Events', () => {
    it('should broadcast command applied event with proper structure', async () => {
      // Connect to events namespace
      const mockSocket3 = new MockWebSocket();
      await wsManager.handleConnection(
        mockSocket3 as any,
        '/ws/events',
        'valid-session-3'
      );
      mockSocket3.clearMessages();

      const command = {
        id: 'cmd-123',
        type: 'open' as const,
        lockerId: 'locker-1',
        kioskId: 'kiosk-1',
        issued_by: 'user-123',
        issued_at: '2024-01-01T10:00:00.000Z',
        parameters: { force: true }
      };

      const result = {
        success: true,
        message: 'Locker opened successfully',
        timestamp: '2024-01-01T10:00:01.000Z',
        execution_time_ms: 150,
        response_data: { voltage: 12.5 }
      };

      await wsManager.emitCommandApplied(command, result);

      expect(mockSocket3.messages.length).toBeGreaterThan(0);
      
      const message = mockSocket3.getLastMessageData();
      expect(message.type).toBe('command_applied');
      expect(message.data.command).toEqual(command);
      expect(message.data.result).toEqual(result);
    });

    it('should handle command failure events', async () => {
      const mockSocket3 = new MockWebSocket();
      await wsManager.handleConnection(
        mockSocket3 as any,
        '/ws/events',
        'valid-session-3'
      );
      mockSocket3.clearMessages();

      const command = {
        id: 'cmd-456',
        type: 'open' as const,
        lockerId: 'locker-2',
        issued_by: 'user-456',
        issued_at: '2024-01-01T10:00:00.000Z'
      };

      const result = {
        success: false,
        error: 'Locker is jammed',
        timestamp: '2024-01-01T10:00:01.000Z'
      };

      await wsManager.emitCommandApplied(command, result);

      const message = mockSocket3.getLastMessageData();
      expect(message.data.result.success).toBe(false);
      expect(message.data.result.error).toBe('Locker is jammed');
    });
  });

  describe('System Status Events', () => {
    it('should broadcast system status event with metrics', async () => {
      const mockSocket3 = new MockWebSocket();
      await wsManager.handleConnection(
        mockSocket3 as any,
        '/ws/events',
        'valid-session-3'
      );
      mockSocket3.clearMessages();

      await wsManager.emitSystemStatus(
        'kiosk',
        'online',
        95,
        {
          metrics: {
            cpu_usage: 45.2,
            memory_usage: 67.8,
            network_latency: 12,
            error_rate: 0.1
          },
          message: 'System running normally',
          details: { uptime: 86400 }
        }
      );

      expect(mockSocket3.messages.length).toBeGreaterThan(0);
      
      const message = mockSocket3.getLastMessageData();
      expect(message.type).toBe('system_status');
      expect(message.data.component).toBe('kiosk');
      expect(message.data.status).toBe('online');
      expect(message.data.health_score).toBe(95);
      expect(message.data.metrics.cpu_usage).toBe(45.2);
      expect(message.data.message).toBe('System running normally');
      expect(message.data.details.uptime).toBe(86400);
    });
  });

  describe('Event Persistence and Replay', () => {
    it('should persist events for replay', async () => {
      await wsManager.emitLockerStateChanged(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      );

      const stats = wsManager.getEventStatistics();
      expect(stats.total_events).toBeGreaterThan(0);
      expect(stats.events_by_type['locker_state_changed']).toBeGreaterThan(0);
    });

    it('should replay events for new connections', async () => {
      // Emit some events first
      await wsManager.emitLockerStateChanged(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      );

      await wsManager.emitLockerStateChanged(
        'locker-2',
        'open',
        'closed',
        'kiosk-1'
      );

      // Create a new connection - it should receive replayed events
      const mockSocket3 = new MockWebSocket();
      const connectionId3 = await wsManager.handleConnection(
        mockSocket3 as any,
        '/ws/lockers',
        'valid-session-3'
      );

      // Give some time for replay to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have received connection confirmation plus replayed events
      expect(mockSocket3.messages.length).toBeGreaterThan(1);
      
      // Check if any of the messages are locker state changes (replayed events)
      const hasReplayedEvents = mockSocket3.messages.some(msg => {
        try {
          const parsed = JSON.parse(msg);
          return parsed.type === 'locker_state_changed';
        } catch {
          return false;
        }
      });
      
      expect(hasReplayedEvents).toBe(true);
    });
  });

  describe('Room-based Broadcasting', () => {
    beforeEach(() => {
      // Join connections to specific rooms
      wsManager.joinRoom(connectionId1, 'locker_updates');
      wsManager.joinRoom(connectionId2, 'help_requests');
      
      // Clear room join messages
      mockSocket1.clearMessages();
      mockSocket2.clearMessages();
    });

    it('should broadcast to specific rooms', async () => {
      await wsManager.emitLockerStateChanged(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      );

      // Should broadcast to locker_updates room
      expect(mockSocket1.messages.length).toBeGreaterThan(0);
      
      const message = mockSocket1.getLastMessageData();
      expect(message.room).toBe('locker_updates');
    });

    it('should not broadcast to wrong rooms', async () => {
      // Create connection in different room
      const mockSocket3 = new MockWebSocket();
      const connectionId3 = await wsManager.handleConnection(
        mockSocket3 as any,
        '/ws/lockers',
        'valid-session-3'
      );
      wsManager.joinRoom(connectionId3, 'different_room');
      mockSocket3.clearMessages();

      await wsManager.emitLockerStateChanged(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      );

      // mockSocket1 should receive (in locker_updates room)
      expect(mockSocket1.messages.length).toBeGreaterThan(0);
      
      // mockSocket3 should not receive (in different_room)
      expect(mockSocket3.messages.length).toBe(0);
    });
  });

  describe('Event Validation and Error Handling', () => {
    it('should handle invalid event data gracefully', async () => {
      // This should be caught by the event service validation
      await expect(wsManager.emitLockerStateChanged(
        'locker-1',
        'invalid-state' as any, // Invalid state
        'open',
        'kiosk-1'
      )).rejects.toThrow();
    });

    it('should handle connection errors during broadcast', async () => {
      // Close one of the connections
      mockSocket1.readyState = MockWebSocket.CLOSED;

      // Should still broadcast to other connections without error
      await expect(wsManager.emitLockerStateChanged(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      )).resolves.not.toThrow();

      // Closed connection should not receive message
      expect(mockSocket1.messages.length).toBe(0);
    });
  });

  describe('Performance and Latency', () => {
    it('should track broadcast latency', async () => {
      await wsManager.emitLockerStateChanged(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      );

      const metrics = wsManager.getLatencyMetrics();
      expect(typeof metrics.median).toBe('number');
      expect(typeof metrics.p95).toBe('number');
      expect(typeof metrics.p99).toBe('number');
    });

    it('should handle multiple concurrent broadcasts', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(wsManager.emitLockerStateChanged(
          `locker-${i}`,
          'closed',
          'open',
          'kiosk-1'
        ));
      }

      await expect(Promise.all(promises)).resolves.not.toThrow();
      
      // Should have received multiple messages
      expect(mockSocket1.messages.length).toBeGreaterThanOrEqual(10);
    });
  });
});