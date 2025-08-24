import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketManager } from '../websocket-manager.js';
import { EventService } from '../event-service.js';
import { EventPersistenceService } from '../event-persistence-service.js';
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

// Enhanced Mock WebSocket
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
  
  clearMessages() {
    this.messages = [];
  }
  
  getMessages() {
    return this.messages.map(msg => JSON.parse(msg));
  }
  
  getMessagesByType(type: string) {
    return this.getMessages().filter(msg => msg.type === type);
  }
}

describe('Event System Integration', () => {
  let wsManager: WebSocketManager;
  let eventService: EventService;
  let persistenceService: EventPersistenceService;
  let lockersSocket: MockWebSocket;
  let helpSocket: MockWebSocket;
  let eventsSocket: MockWebSocket;
  let lockersConnectionId: string;
  let helpConnectionId: string;
  let eventsConnectionId: string;

  beforeEach(async () => {
    // Initialize the complete event system
    wsManager = new WebSocketManager(mockFastify);
    eventService = wsManager.getEventService();
    persistenceService = wsManager.getEventPersistenceService();

    // Create connections to all namespaces
    lockersSocket = new MockWebSocket();
    helpSocket = new MockWebSocket();
    eventsSocket = new MockWebSocket();

    lockersConnectionId = (await wsManager.handleConnection(
      lockersSocket as any,
      '/ws/lockers',
      'session-lockers'
    ))!;

    helpConnectionId = (await wsManager.handleConnection(
      helpSocket as any,
      '/ws/help',
      'session-help'
    ))!;

    eventsConnectionId = (await wsManager.handleConnection(
      eventsSocket as any,
      '/ws/events',
      'session-events'
    ))!;

    // Clear connection messages
    lockersSocket.clearMessages();
    helpSocket.clearMessages();
    eventsSocket.clearMessages();
  });

  afterEach(() => {
    wsManager.shutdown();
  });

  describe('Complete Locker Workflow', () => {
    it('should handle complete locker state change workflow with persistence and replay', async () => {
      // Step 1: Emit locker state change
      await wsManager.emitLockerStateChanged(
        'locker-1',
        'closed',
        'open',
        'kiosk-1',
        {
          userId: 'user-123',
          reason: 'User opened locker with RFID card',
          metadata: { rfid_card: 'CARD123', voltage: 12.5 }
        }
      );

      // Verify broadcasting
      const lockersMessages = lockersSocket.getMessagesByType('locker_state_changed');
      const eventsMessages = eventsSocket.getMessagesByType('locker_state_changed');

      expect(lockersMessages).toHaveLength(1);
      expect(eventsMessages).toHaveLength(1);

      const lockerMessage = lockersMessages[0];
      expect(lockerMessage.data.lockerId).toBe('locker-1');
      expect(lockerMessage.data.oldState).toBe('closed');
      expect(lockerMessage.data.newState).toBe('open');
      expect(lockerMessage.data.userId).toBe('user-123');
      expect(lockerMessage.data.reason).toBe('User opened locker with RFID card');
      expect(lockerMessage.data.metadata.rfid_card).toBe('CARD123');

      // Verify event persistence
      const stats = persistenceService.getStatistics();
      expect(stats.total_events).toBeGreaterThan(0);
      expect(stats.events_by_type['locker_state_changed']).toBeGreaterThan(0);

      // Step 2: Create new connection and verify replay
      const newSocket = new MockWebSocket();
      const newConnectionId = await wsManager.handleConnection(
        newSocket as any,
        '/ws/lockers',
        'session-new'
      );

      // Give time for replay
      await new Promise(resolve => setTimeout(resolve, 100));

      const replayedMessages = newSocket.getMessagesByType('locker_state_changed');
      expect(replayedMessages.length).toBeGreaterThan(0);

      const replayedMessage = replayedMessages[0];
      expect(replayedMessage.data.lockerId).toBe('locker-1');
      expect(replayedMessage.data.oldState).toBe('closed');
      expect(replayedMessage.data.newState).toBe('open');
    });
  });

  describe('Complete Help Request Workflow', () => {
    it('should handle complete help request workflow from creation to resolution', async () => {
      // Step 1: Create help request
      const helpRequest = {
        id: 1,
        kiosk_id: 'kiosk-1',
        locker_no: 5,
        category: 'access_issue' as const,
        note: 'Cannot open locker, RFID not working',
        status: 'open' as const,
        created_at: '2024-01-01T10:00:00.000Z',
        user_contact: 'user@example.com'
      };

      await wsManager.emitHelpRequested(helpRequest, 'high');

      // Verify initial help request broadcast
      const helpMessages = helpSocket.getMessagesByType('help_requested');
      const eventsMessages = eventsSocket.getMessagesByType('help_requested');

      expect(helpMessages).toHaveLength(1);
      expect(eventsMessages).toHaveLength(1);

      const helpMessage = helpMessages[0];
      expect(helpMessage.data.id).toBe(1);
      expect(helpMessage.data.category).toBe('access_issue');
      expect(helpMessage.data.priority).toBe('high');
      expect(helpMessage.data.user_contact).toBe('user@example.com');

      // Step 2: Assign help request
      helpSocket.clearMessages();
      eventsSocket.clearMessages();

      await wsManager.emitHelpStatusUpdated(
        1,
        'open',
        'assigned',
        {
          agentId: 'agent-456',
          resolutionNotes: 'Assigned to maintenance team'
        }
      );

      // Verify status update broadcast
      const statusMessages = helpSocket.getMessagesByType('help_status_updated');
      expect(statusMessages).toHaveLength(1);

      const statusMessage = statusMessages[0];
      expect(statusMessage.data.id).toBe(1);
      expect(statusMessage.data.old_status).toBe('open');
      expect(statusMessage.data.new_status).toBe('assigned');
      expect(statusMessage.data.agent_id).toBe('agent-456');

      // Step 3: Resolve help request
      helpSocket.clearMessages();
      eventsSocket.clearMessages();

      await wsManager.emitHelpStatusUpdated(
        1,
        'assigned',
        'resolved',
        {
          agentId: 'agent-456',
          resolutionNotes: 'Replaced RFID reader, issue resolved'
        }
      );

      // Verify resolution broadcast
      const resolutionMessages = helpSocket.getMessagesByType('help_status_updated');
      expect(resolutionMessages).toHaveLength(1);

      const resolutionMessage = resolutionMessages[0];
      expect(resolutionMessage.data.new_status).toBe('resolved');
      expect(resolutionMessage.data.resolution_notes).toBe('Replaced RFID reader, issue resolved');

      // Verify complete workflow is persisted
      const events = await persistenceService.replayEvents({
        eventTypes: ['help_requested', 'help_status_updated']
      });

      expect(events.length).toBeGreaterThanOrEqual(3); // Initial request + 2 status updates
    });
  });

  describe('Command Execution Workflow', () => {
    it('should handle remote command execution with full audit trail', async () => {
      // Step 1: Execute successful command
      const command = {
        id: 'cmd-123',
        type: 'open' as const,
        lockerId: 'locker-2',
        kioskId: 'kiosk-1',
        issued_by: 'admin-user',
        issued_at: '2024-01-01T10:00:00.000Z',
        parameters: { force: true, reason: 'Emergency access' }
      };

      const result = {
        success: true,
        message: 'Locker opened successfully',
        timestamp: '2024-01-01T10:00:01.000Z',
        execution_time_ms: 150,
        response_data: { voltage: 12.3, temperature: 22.5 }
      };

      await wsManager.emitCommandApplied(command, result);

      // Verify command broadcast
      const commandMessages = eventsSocket.getMessagesByType('command_applied');
      expect(commandMessages).toHaveLength(1);

      const commandMessage = commandMessages[0];
      expect(commandMessage.data.command.id).toBe('cmd-123');
      expect(commandMessage.data.command.type).toBe('open');
      expect(commandMessage.data.result.success).toBe(true);
      expect(commandMessage.data.result.execution_time_ms).toBe(150);

      // Step 2: Execute failed command
      eventsSocket.clearMessages();

      const failedCommand = {
        id: 'cmd-456',
        type: 'open' as const,
        lockerId: 'locker-3',
        kioskId: 'kiosk-1',
        issued_by: 'admin-user',
        issued_at: '2024-01-01T10:01:00.000Z'
      };

      const failedResult = {
        success: false,
        error: 'Locker mechanism jammed',
        timestamp: '2024-01-01T10:01:02.000Z',
        execution_time_ms: 5000
      };

      await wsManager.emitCommandApplied(failedCommand, failedResult);

      // Verify failed command broadcast
      const failedMessages = eventsSocket.getMessagesByType('command_applied');
      expect(failedMessages).toHaveLength(1);

      const failedMessage = failedMessages[0];
      expect(failedMessage.data.result.success).toBe(false);
      expect(failedMessage.data.result.error).toBe('Locker mechanism jammed');

      // Verify audit trail persistence
      const commandEvents = await persistenceService.replayEvents({
        eventTypes: ['command_applied']
      });

      expect(commandEvents.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('System Status Monitoring', () => {
    it('should handle system status events with metrics', async () => {
      // Emit system status for different components
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
          details: { uptime: 86400, last_restart: '2024-01-01T00:00:00.000Z' }
        }
      );

      await wsManager.emitSystemStatus(
        'gateway',
        'degraded',
        75,
        {
          metrics: {
            cpu_usage: 85.5,
            memory_usage: 90.2,
            error_rate: 2.5
          },
          message: 'High resource usage detected',
          details: { active_connections: 150 }
        }
      );

      // Verify status broadcasts
      const statusMessages = eventsSocket.getMessagesByType('system_status');
      expect(statusMessages).toHaveLength(2);

      const kioskStatus = statusMessages.find(msg => msg.data.component === 'kiosk');
      const gatewayStatus = statusMessages.find(msg => msg.data.component === 'gateway');

      expect(kioskStatus.data.status).toBe('online');
      expect(kioskStatus.data.health_score).toBe(95);
      expect(kioskStatus.data.metrics.cpu_usage).toBe(45.2);

      expect(gatewayStatus.data.status).toBe('degraded');
      expect(gatewayStatus.data.health_score).toBe(75);
      expect(gatewayStatus.data.metrics.cpu_usage).toBe(85.5);
    });
  });

  describe('Room-based Broadcasting', () => {
    it('should handle room-based event targeting correctly', async () => {
      // Join connections to specific rooms
      wsManager.joinRoom(lockersConnectionId, 'zone_a');
      wsManager.joinRoom(helpConnectionId, 'maintenance_team');

      // Create additional connection in different room
      const zoneSocket = new MockWebSocket();
      const zoneConnectionId = await wsManager.handleConnection(
        zoneSocket as any,
        '/ws/lockers',
        'session-zone'
      );
      wsManager.joinRoom(zoneConnectionId, 'zone_b');

      // Clear all messages
      lockersSocket.clearMessages();
      helpSocket.clearMessages();
      eventsSocket.clearMessages();
      zoneSocket.clearMessages();

      // Emit locker event (should broadcast to all locker connections due to fallback)
      await wsManager.emitLockerStateChanged(
        'locker-zone-a',
        'closed',
        'open',
        'kiosk-zone-a'
      );

      // All locker namespace connections should receive the event
      expect(lockersSocket.getMessagesByType('locker_state_changed')).toHaveLength(1);
      expect(zoneSocket.getMessagesByType('locker_state_changed')).toHaveLength(1);
      expect(eventsSocket.getMessagesByType('locker_state_changed')).toHaveLength(1);
      expect(helpSocket.getMessagesByType('locker_state_changed')).toHaveLength(0);
    });
  });

  describe('Event Validation and Error Handling', () => {
    it('should handle event validation errors gracefully', async () => {
      // Test invalid locker state
      await expect(wsManager.emitLockerStateChanged(
        'locker-1',
        'invalid-state' as any,
        'open',
        'kiosk-1'
      )).rejects.toThrow();

      // Test invalid help request
      await expect(wsManager.emitHelpRequested({
        id: 1,
        kiosk_id: 'kiosk-1',
        category: 'invalid-category' as any,
        status: 'open',
        created_at: '2024-01-01T10:00:00.000Z'
      })).rejects.toThrow();

      // Test invalid command
      await expect(wsManager.emitCommandApplied(
        {
          id: 'cmd-123',
          type: 'invalid-command' as any,
          issued_by: 'user',
          issued_at: '2024-01-01T10:00:00.000Z'
        },
        {
          success: true,
          timestamp: '2024-01-01T10:00:01.000Z'
        }
      )).rejects.toThrow();
    });

    it('should handle connection failures during broadcast', async () => {
      // Close one connection
      lockersSocket.readyState = MockWebSocket.CLOSED;

      // Should still broadcast to other connections
      await expect(wsManager.emitLockerStateChanged(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      )).resolves.not.toThrow();

      // Closed connection should not receive messages
      expect(lockersSocket.messages).toHaveLength(0);
      
      // Other connections should still receive messages
      expect(eventsSocket.getMessagesByType('locker_state_changed')).toHaveLength(1);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent events efficiently', async () => {
      const startTime = Date.now();
      const promises = [];

      // Generate multiple concurrent events
      for (let i = 0; i < 50; i++) {
        promises.push(wsManager.emitLockerStateChanged(
          `locker-${i}`,
          'closed',
          'open',
          'kiosk-1',
          { userId: `user-${i}` }
        ));
      }

      await Promise.all(promises);
      const endTime = Date.now();

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(1000); // Less than 1 second

      // Verify all events were broadcast
      const lockerMessages = lockersSocket.getMessagesByType('locker_state_changed');
      expect(lockerMessages).toHaveLength(50);

      // Verify all events were persisted
      const stats = persistenceService.getStatistics();
      expect(stats.events_by_type['locker_state_changed']).toBeGreaterThanOrEqual(50);

      // Verify latency metrics
      const metrics = wsManager.getLatencyMetrics();
      expect(metrics.median).toBeLessThan(100); // Less than 100ms median
    });
  });

  describe('Event Replay and Recovery', () => {
    it('should replay events correctly for reconnecting clients', async () => {
      // Generate some events
      await wsManager.emitLockerStateChanged('locker-1', 'closed', 'open', 'kiosk-1');
      await wsManager.emitLockerStateChanged('locker-2', 'open', 'closed', 'kiosk-1');
      
      const helpRequest = {
        id: 1,
        kiosk_id: 'kiosk-1',
        category: 'access_issue' as const,
        status: 'open' as const,
        created_at: '2024-01-01T10:00:00.000Z'
      };
      await wsManager.emitHelpRequested(helpRequest);

      // Simulate client reconnection
      const reconnectSocket = new MockWebSocket();
      await wsManager.handleConnection(
        reconnectSocket as any,
        '/ws/lockers',
        'session-reconnect'
      );

      // Give time for replay
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have received replayed events
      const replayedEvents = reconnectSocket.getMessages();
      const lockerEvents = replayedEvents.filter(msg => msg.type === 'locker_state_changed');
      
      expect(lockerEvents.length).toBeGreaterThan(0);
      expect(lockerEvents.some(event => event.data.lockerId === 'locker-1')).toBe(true);
      expect(lockerEvents.some(event => event.data.lockerId === 'locker-2')).toBe(true);
    });
  });
});