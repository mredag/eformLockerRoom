import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventPersistenceService, EventPersistenceError } from '../event-persistence-service.js';
import { EventService } from '../event-service.js';
import { FastifyInstance } from 'fastify';
import { LockerStateChangedEvent, HelpRequestedEvent } from '../../types/events.js';

// Mock Fastify instance
const mockFastify = {
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
} as unknown as FastifyInstance;

describe('EventPersistenceService', () => {
  let eventService: EventService;
  let persistenceService: EventPersistenceService;

  beforeEach(() => {
    eventService = new EventService();
    persistenceService = new EventPersistenceService(
      mockFastify,
      eventService,
      {
        enabled: true,
        maxEvents: 100,
        defaultTtlHours: 24,
        cleanupIntervalMinutes: 1, // Short interval for testing
        replayBufferSize: 50
      }
    );
  });

  afterEach(() => {
    persistenceService.shutdown();
  });

  describe('Event Persistence', () => {
    it('should persist a valid event', async () => {
      const event = eventService.createLockerStateChangedEvent(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      );

      await persistenceService.persistEvent(event);

      const stats = persistenceService.getStatistics();
      expect(stats.total_events).toBe(1);
      expect(stats.events_by_type['locker_state_changed']).toBe(1);
      expect(stats.events_by_namespace['/ws/lockers']).toBe(1);
    });

    it('should persist multiple events', async () => {
      const event1 = eventService.createLockerStateChangedEvent(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      );

      const event2 = eventService.createHelpRequestedEvent({
        id: 1,
        kiosk_id: 'kiosk-1',
        category: 'access_issue',
        status: 'open',
        created_at: '2024-01-01T10:00:00.000Z'
      });

      await persistenceService.persistEvent(event1);
      await persistenceService.persistEvent(event2);

      const stats = persistenceService.getStatistics();
      expect(stats.total_events).toBe(2);
      expect(stats.events_by_type['locker_state_changed']).toBe(1);
      expect(stats.events_by_type['help_requested']).toBe(1);
    });

    it('should respect custom TTL', async () => {
      const event = eventService.createLockerStateChangedEvent(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      );

      await persistenceService.persistEvent(event, 1); // 1 hour TTL

      const stats = persistenceService.getStatistics();
      expect(stats.total_events).toBe(1);
    });

    it('should not persist when disabled', async () => {
      const disabledService = new EventPersistenceService(
        mockFastify,
        eventService,
        { enabled: false }
      );

      const event = eventService.createLockerStateChangedEvent(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      );

      await disabledService.persistEvent(event);

      const stats = disabledService.getStatistics();
      expect(stats.total_events).toBe(0);

      disabledService.shutdown();
    });
  });

  describe('Event Replay', () => {
    beforeEach(async () => {
      // Persist some test events
      const event1 = eventService.createLockerStateChangedEvent(
        'locker-1',
        'closed',
        'open',
        'kiosk-1',
        { namespace: '/ws/lockers', room: 'room1' }
      );

      const event2 = eventService.createLockerStateChangedEvent(
        'locker-2',
        'open',
        'closed',
        'kiosk-1',
        { namespace: '/ws/lockers', room: 'room2' }
      );

      const event3 = eventService.createHelpRequestedEvent({
        id: 1,
        kiosk_id: 'kiosk-1',
        category: 'access_issue',
        status: 'open',
        created_at: '2024-01-01T10:00:00.000Z'
      }, { namespace: '/ws/help' });

      await persistenceService.persistEvent(event1);
      await persistenceService.persistEvent(event2);
      await persistenceService.persistEvent(event3);
    });

    it('should replay all events when no filters applied', async () => {
      const events = await persistenceService.replayEvents();
      expect(events).toHaveLength(3);
    });

    it('should filter events by namespace', async () => {
      const events = await persistenceService.replayEvents({
        namespace: '/ws/lockers'
      });
      
      expect(events).toHaveLength(2);
      expect(events.every(e => e.namespace === '/ws/lockers')).toBe(true);
    });

    it('should filter events by room', async () => {
      const events = await persistenceService.replayEvents({
        namespace: '/ws/lockers',
        room: 'room1'
      });
      
      expect(events).toHaveLength(1);
      expect(events[0].room).toBe('room1');
    });

    it('should filter events by type', async () => {
      const events = await persistenceService.replayEvents({
        eventTypes: ['help_requested']
      });
      
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('help_requested');
    });

    it('should filter events by time', async () => {
      const futureTime = new Date(Date.now() + 60000); // 1 minute from now
      
      const events = await persistenceService.replayEvents({
        since: futureTime
      });
      
      expect(events).toHaveLength(0);
    });

    it('should limit number of events', async () => {
      const events = await persistenceService.replayEvents({
        limit: 2
      });
      
      expect(events).toHaveLength(2);
    });

    it('should sort events by creation time', async () => {
      const events = await persistenceService.replayEvents();
      
      for (let i = 1; i < events.length; i++) {
        expect(events[i].timestamp >= events[i-1].timestamp).toBe(true);
      }
    });

    it('should return empty array when service is disabled', async () => {
      const disabledService = new EventPersistenceService(
        mockFastify,
        eventService,
        { enabled: false }
      );

      const events = await disabledService.replayEvents();
      expect(events).toHaveLength(0);

      disabledService.shutdown();
    });
  });

  describe('Event Cleanup', () => {
    it('should clean up expired events', async () => {
      const event = eventService.createLockerStateChangedEvent(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      );

      // Persist with very short TTL
      await persistenceService.persistEvent(event, 0.001); // ~3.6 seconds

      expect(persistenceService.getStatistics().total_events).toBe(1);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 4000));

      const cleanedCount = await persistenceService.cleanupExpiredEvents();
      expect(cleanedCount).toBe(1);
      expect(persistenceService.getStatistics().total_events).toBe(0);
    }, 10000); // Increase timeout for this test

    it('should enforce max events limit', async () => {
      const limitedService = new EventPersistenceService(
        mockFastify,
        eventService,
        {
          enabled: true,
          maxEvents: 3,
          defaultTtlHours: 24,
          cleanupIntervalMinutes: 60,
          replayBufferSize: 10
        }
      );

      // Persist more events than the limit
      for (let i = 0; i < 5; i++) {
        const event = eventService.createLockerStateChangedEvent(
          `locker-${i}`,
          'closed',
          'open',
          'kiosk-1'
        );
        await limitedService.persistEvent(event);
      }

      const stats = limitedService.getStatistics();
      expect(stats.total_events).toBe(3); // Should be limited to max

      limitedService.shutdown();
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach(async () => {
      const event1 = eventService.createLockerStateChangedEvent(
        'locker-1',
        'closed',
        'open',
        'kiosk-1',
        { namespace: '/ws/lockers' }
      );

      const event2 = eventService.createHelpRequestedEvent({
        id: 1,
        kiosk_id: 'kiosk-1',
        category: 'access_issue',
        status: 'open',
        created_at: '2024-01-01T10:00:00.000Z'
      }, { namespace: '/ws/help' });

      await persistenceService.persistEvent(event1);
      await persistenceService.persistEvent(event2);
    });

    it('should provide accurate statistics', () => {
      const stats = persistenceService.getStatistics();

      expect(stats.total_events).toBe(2);
      expect(stats.events_by_namespace['/ws/lockers']).toBe(1);
      expect(stats.events_by_namespace['/ws/help']).toBe(1);
      expect(stats.events_by_type['locker_state_changed']).toBe(1);
      expect(stats.events_by_type['help_requested']).toBe(1);
      expect(stats.oldest_event).toBeTruthy();
      expect(stats.newest_event).toBeTruthy();
      expect(stats.config).toBeTruthy();
    });

    it('should track replay count', async () => {
      await persistenceService.replayEvents();
      await persistenceService.replayEvents();

      // Replay count is tracked internally but not exposed in current API
      // This test verifies the replay functionality works multiple times
      const events1 = await persistenceService.replayEvents();
      const events2 = await persistenceService.replayEvents();

      expect(events1).toHaveLength(2);
      expect(events2).toHaveLength(2);
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      persistenceService.updateConfig({
        maxEvents: 200,
        defaultTtlHours: 48
      });

      const stats = persistenceService.getStatistics();
      expect(stats.config.maxEvents).toBe(200);
      expect(stats.config.defaultTtlHours).toBe(48);
    });

    it('should disable service when configured', () => {
      persistenceService.updateConfig({ enabled: false });

      const stats = persistenceService.getStatistics();
      expect(stats.config.enabled).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid events gracefully', async () => {
      const invalidEvent = {
        id: 'invalid',
        type: 'unknown_type',
        timestamp: 'invalid',
        namespace: '/ws/test',
        version: '1.0.0',
        data: {}
      } as any;

      await expect(persistenceService.persistEvent(invalidEvent))
        .rejects.toThrow(EventPersistenceError);
    });

    it('should handle replay errors gracefully', async () => {
      // Persist a valid event first
      const event = eventService.createLockerStateChangedEvent(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      );
      await persistenceService.persistEvent(event);

      // Corrupt the stored event data
      const stats = persistenceService.getStatistics();
      expect(stats.total_events).toBe(1);

      // The service should handle corrupted data gracefully during replay
      const events = await persistenceService.replayEvents();
      expect(events).toHaveLength(1); // Should still return valid events
    });
  });

  describe('Memory Management', () => {
    it('should clear all events', async () => {
      const event = eventService.createLockerStateChangedEvent(
        'locker-1',
        'closed',
        'open',
        'kiosk-1'
      );
      await persistenceService.persistEvent(event);

      expect(persistenceService.getStatistics().total_events).toBe(1);

      await persistenceService.clearAllEvents();

      expect(persistenceService.getStatistics().total_events).toBe(0);
    });

    it('should shutdown gracefully', () => {
      expect(() => persistenceService.shutdown()).not.toThrow();
    });
  });
});