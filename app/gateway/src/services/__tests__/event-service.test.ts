import { describe, it, expect, beforeEach } from 'vitest';
import { EventService, EventValidationError, EventSerializationError } from '../event-service.js';
import { 
  LockerStateChangedEvent, 
  HelpRequestedEvent, 
  CommandAppliedEvent,
  SystemStatusEvent,
  ConnectionEvent,
  CURRENT_EVENT_VERSION 
} from '../../types/events.js';

describe('EventService', () => {
  let eventService: EventService;

  beforeEach(() => {
    eventService = new EventService();
  });

  describe('Event Creation', () => {
    describe('createLockerStateChangedEvent', () => {
      it('should create a valid locker state changed event', () => {
        const event = eventService.createLockerStateChangedEvent(
          'locker-1',
          'closed',
          'open',
          'kiosk-1',
          {
            namespace: '/ws/lockers',
            userId: 'user-123',
            reason: 'User opened locker'
          }
        );

        expect(event.type).toBe('locker_state_changed');
        expect(event.namespace).toBe('/ws/lockers');
        expect(event.version).toBe(CURRENT_EVENT_VERSION);
        expect(event.data.lockerId).toBe('locker-1');
        expect(event.data.oldState).toBe('closed');
        expect(event.data.newState).toBe('open');
        expect(event.data.kioskId).toBe('kiosk-1');
        expect(event.data.userId).toBe('user-123');
        expect(event.data.reason).toBe('User opened locker');
        expect(event.id).toBeTruthy();
        expect(event.timestamp).toBeTruthy();
      });

      it('should create event with minimal required fields', () => {
        const event = eventService.createLockerStateChangedEvent(
          'locker-2',
          'open',
          'closed',
          'kiosk-2'
        );

        expect(event.type).toBe('locker_state_changed');
        expect(event.namespace).toBe('/ws/lockers');
        expect(event.data.lockerId).toBe('locker-2');
        expect(event.data.oldState).toBe('open');
        expect(event.data.newState).toBe('closed');
        expect(event.data.kioskId).toBe('kiosk-2');
        expect(event.data.userId).toBeUndefined();
        expect(event.data.reason).toBeUndefined();
      });
    });

    describe('createHelpRequestedEvent', () => {
      it('should create a valid help requested event', () => {
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

        const event = eventService.createHelpRequestedEvent(helpRequest, {
          namespace: '/ws/help',
          priority: 'high'
        });

        expect(event.type).toBe('help_requested');
        expect(event.namespace).toBe('/ws/help');
        expect(event.data.id).toBe(1);
        expect(event.data.kiosk_id).toBe('kiosk-1');
        expect(event.data.category).toBe('access_issue');
        expect(event.data.priority).toBe('high');
        expect(event.data.user_contact).toBe('user@example.com');
      });

      it('should use default priority when not specified', () => {
        const helpRequest = {
          id: 2,
          kiosk_id: 'kiosk-2',
          category: 'hardware_problem' as const,
          status: 'open' as const,
          created_at: '2024-01-01T10:00:00.000Z'
        };

        const event = eventService.createHelpRequestedEvent(helpRequest);

        expect(event.data.priority).toBe('medium');
        expect(event.namespace).toBe('/ws/help');
      });
    });

    describe('createCommandAppliedEvent', () => {
      it('should create a valid command applied event', () => {
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
          execution_time_ms: 150
        };

        const event = eventService.createCommandAppliedEvent(command, result);

        expect(event.type).toBe('command_applied');
        expect(event.namespace).toBe('/ws/events');
        expect(event.data.command).toEqual(command);
        expect(event.data.result).toEqual(result);
      });

      it('should handle command failure', () => {
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

        const event = eventService.createCommandAppliedEvent(command, result);

        expect(event.data.result.success).toBe(false);
        expect(event.data.result.error).toBe('Locker is jammed');
      });
    });

    describe('createSystemStatusEvent', () => {
      it('should create a valid system status event', () => {
        const event = eventService.createSystemStatusEvent(
          'kiosk',
          'online',
          95,
          {
            namespace: '/ws/events',
            metrics: {
              cpu_usage: 45.2,
              memory_usage: 67.8,
              network_latency: 12
            },
            message: 'System running normally'
          }
        );

        expect(event.type).toBe('system_status');
        expect(event.data.component).toBe('kiosk');
        expect(event.data.status).toBe('online');
        expect(event.data.health_score).toBe(95);
        expect(event.data.metrics?.cpu_usage).toBe(45.2);
        expect(event.data.message).toBe('System running normally');
      });
    });

    describe('createConnectionEvent', () => {
      it('should create a valid connection event', () => {
        const event = eventService.createConnectionEvent(
          'connection',
          'conn-123',
          '/ws/lockers',
          5,
          {
            userId: 'user-123',
            sessionId: 'session-456',
            userAgent: 'Mozilla/5.0...',
            ipAddress: '192.168.1.100'
          }
        );

        expect(event.type).toBe('connection');
        expect(event.data.connectionId).toBe('conn-123');
        expect(event.data.namespace).toBe('/ws/lockers');
        expect(event.data.connection_count).toBe(5);
        expect(event.data.userId).toBe('user-123');
        expect(event.data.ip_address).toBe('192.168.1.100');
      });

      it('should create a disconnection event', () => {
        const event = eventService.createConnectionEvent(
          'disconnection',
          'conn-123',
          '/ws/lockers',
          4
        );

        expect(event.type).toBe('disconnection');
        expect(event.data.connection_count).toBe(4);
      });
    });
  });

  describe('Event Validation', () => {
    it('should validate a correct locker state changed event', () => {
      const event = eventService.createLockerStateChangedEvent(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      );

      expect(() => eventService.validateEvent(event)).not.toThrow();
    });

    it('should reject event with missing required fields', () => {
      const invalidEvent = {
        id: 'test-id',
        type: 'locker_state_changed',
        // Missing timestamp, namespace, version, data
      } as any;

      expect(() => eventService.validateEvent(invalidEvent))
        .toThrow(EventValidationError);
    });

    it('should reject event with invalid timestamp', () => {
      const event = eventService.createLockerStateChangedEvent(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      );
      
      (event as any).timestamp = 'invalid-timestamp';

      expect(() => eventService.validateEvent(event))
        .toThrow(EventValidationError);
    });

    it('should reject event with invalid enum values', () => {
      const event = eventService.createLockerStateChangedEvent(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      );
      
      (event.data as any).oldState = 'invalid-state';

      expect(() => eventService.validateEvent(event))
        .toThrow(EventValidationError);
    });

    it('should reject command applied event with invalid command structure', () => {
      const event = eventService.createCommandAppliedEvent(
        {
          id: 'cmd-123',
          type: 'open',
          issued_by: 'user-123',
          issued_at: '2024-01-01T10:00:00.000Z'
        },
        {
          success: true,
          timestamp: '2024-01-01T10:00:01.000Z'
        }
      );

      // Make command invalid
      (event.data.command as any).type = 'invalid-command-type';

      expect(() => eventService.validateEvent(event))
        .toThrow(EventValidationError);
    });

    it('should reject event with unknown type', () => {
      const invalidEvent = {
        id: 'test-id',
        type: 'unknown_event_type',
        timestamp: new Date().toISOString(),
        namespace: '/ws/test',
        version: '1.0.0',
        data: {}
      } as any;

      expect(() => eventService.validateEvent(invalidEvent))
        .toThrow(EventValidationError);
    });
  });

  describe('Event Serialization', () => {
    it('should serialize a valid event to JSON', () => {
      const event = eventService.createLockerStateChangedEvent(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      );

      const serialized = eventService.serializeEvent(event);
      const parsed = JSON.parse(serialized);

      expect(parsed.type).toBe('locker_state_changed');
      expect(parsed.data.lockerId).toBe('locker-1');
    });

    it('should deserialize a valid JSON event', () => {
      const originalEvent = eventService.createLockerStateChangedEvent(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      );

      const serialized = eventService.serializeEvent(originalEvent);
      const deserialized = eventService.deserializeEvent(serialized);

      expect(deserialized).toEqual(originalEvent);
    });

    it('should reject invalid JSON during deserialization', () => {
      expect(() => eventService.deserializeEvent('invalid json'))
        .toThrow(EventSerializationError);
    });

    it('should reject invalid event structure during deserialization', () => {
      const invalidJson = JSON.stringify({
        type: 'locker_state_changed',
        // Missing required fields
      });

      expect(() => eventService.deserializeEvent(invalidJson))
        .toThrow(EventValidationError);
    });
  });

  describe('Schema Information', () => {
    it('should return schema for valid event type', () => {
      const schema = eventService.getEventSchema('locker_state_changed');
      
      expect(schema).toBeTruthy();
      expect(schema?.type).toBe('locker_state_changed');
      expect(schema?.required_fields).toContain('id');
      expect(schema?.required_fields).toContain('type');
    });

    it('should return null for invalid event type', () => {
      const schema = eventService.getEventSchema('invalid_type');
      expect(schema).toBeNull();
    });

    it('should return all available event types', () => {
      const types = eventService.getAvailableEventTypes();
      
      expect(types).toContain('locker_state_changed');
      expect(types).toContain('help_requested');
      expect(types).toContain('command_applied');
      expect(types).toContain('system_status');
      expect(types).toContain('connection');
      expect(types).toContain('disconnection');
    });

    it('should validate event type correctly', () => {
      expect(eventService.isValidEventType('locker_state_changed')).toBe(true);
      expect(eventService.isValidEventType('invalid_type')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should provide detailed error information for validation failures', () => {
      const invalidEvent = {
        id: 'test-id',
        type: 'locker_state_changed',
        timestamp: 'invalid-timestamp',
        namespace: '/ws/lockers',
        version: '1.0.0',
        data: {
          lockerId: 'locker-1',
          oldState: 'closed',
          newState: 'open',
          kioskId: 'kiosk-1'
        }
      } as any;

      try {
        eventService.validateEvent(invalidEvent);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(EventValidationError);
        const validationError = error as EventValidationError;
        expect(validationError.field).toBe('timestamp');
        expect(validationError.expectedType).toBe('ISO string');
      }
    });

    it('should handle serialization errors gracefully', () => {
      const invalidEvent = eventService.createLockerStateChangedEvent(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      );

      // Create circular reference to cause serialization error
      (invalidEvent as any).circular = invalidEvent;

      expect(() => eventService.serializeEvent(invalidEvent))
        .toThrow(EventSerializationError);
    });
  });
});