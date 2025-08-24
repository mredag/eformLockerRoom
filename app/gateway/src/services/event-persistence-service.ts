import { WebSocketEvent } from '../types/events.js';
import { EventService, EventSerializationError } from './event-service.js';
import { FastifyInstance } from 'fastify';

/**
 * Event persistence error
 */
export class EventPersistenceError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'EventPersistenceError';
  }
}

/**
 * Persisted event with metadata
 */
export interface PersistedEvent {
  id: string;
  event_type: string;
  namespace: string;
  room?: string;
  event_data: string; // JSON serialized event
  created_at: string; // ISO timestamp
  expires_at?: string; // ISO timestamp for TTL
  replay_count: number;
  last_replayed_at?: string; // ISO timestamp
}

/**
 * Event replay options
 */
export interface EventReplayOptions {
  namespace?: string;
  room?: string;
  eventTypes?: string[];
  since?: Date;
  limit?: number;
  includeExpired?: boolean;
}

/**
 * Event persistence configuration
 */
export interface EventPersistenceConfig {
  enabled: boolean;
  maxEvents: number; // Maximum events to store
  defaultTtlHours: number; // Default TTL for events
  cleanupIntervalMinutes: number; // How often to clean up expired events
  replayBufferSize: number; // Maximum events to keep for replay
}

/**
 * Service for persisting and replaying WebSocket events
 */
export class EventPersistenceService {
  private events: Map<string, PersistedEvent> = new Map();
  private eventsByNamespace: Map<string, Set<string>> = new Map();
  private eventsByRoom: Map<string, Set<string>> = new Map();
  private eventsByType: Map<string, Set<string>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private config: EventPersistenceConfig;

  constructor(
    private fastify: FastifyInstance,
    private eventService: EventService,
    config: Partial<EventPersistenceConfig> = {}
  ) {
    this.config = {
      enabled: true,
      maxEvents: 10000,
      defaultTtlHours: 24,
      cleanupIntervalMinutes: 30,
      replayBufferSize: 1000,
      ...config
    };

    if (this.config.enabled) {
      this.startCleanupInterval();
    }
  }

  /**
   * Persist an event for replay capability
   */
  async persistEvent(event: WebSocketEvent, ttlHours?: number): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      // Validate and serialize the event
      const eventData = this.eventService.serializeEvent(event);
      
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (ttlHours || this.config.defaultTtlHours) * 60 * 60 * 1000);

      const persistedEvent: PersistedEvent = {
        id: event.id,
        event_type: event.type,
        namespace: event.namespace,
        room: event.room,
        event_data: eventData,
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        replay_count: 0
      };

      // Store the event
      this.events.set(event.id, persistedEvent);

      // Update indexes
      this.updateIndexes(persistedEvent);

      // Enforce max events limit
      await this.enforceMaxEventsLimit();

      this.fastify.log.debug(`Event persisted: ${event.type} (${event.id})`);
    } catch (error) {
      throw new EventPersistenceError(
        `Failed to persist event ${event.id}`,
        error as Error
      );
    }
  }

  /**
   * Replay events for a reconnecting client
   */
  async replayEvents(options: EventReplayOptions = {}): Promise<WebSocketEvent[]> {
    if (!this.config.enabled) {
      return [];
    }

    try {
      const events = this.getEventsForReplay(options);
      const replayedEvents: WebSocketEvent[] = [];

      for (const persistedEvent of events) {
        try {
          const event = this.eventService.deserializeEvent(persistedEvent.event_data);
          replayedEvents.push(event);

          // Update replay statistics
          persistedEvent.replay_count++;
          persistedEvent.last_replayed_at = new Date().toISOString();
        } catch (error) {
          this.fastify.log.error(`Failed to deserialize event ${persistedEvent.id}:`, error);
          // Remove corrupted event
          this.removeEvent(persistedEvent.id);
        }
      }

      this.fastify.log.debug(`Replayed ${replayedEvents.length} events`, options);
      return replayedEvents;
    } catch (error) {
      throw new EventPersistenceError('Failed to replay events', error as Error);
    }
  }

  /**
   * Get events for replay based on options
   */
  private getEventsForReplay(options: EventReplayOptions): PersistedEvent[] {
    let candidateEvents: PersistedEvent[] = [];

    // Filter by namespace
    if (options.namespace) {
      const namespaceEventIds = this.eventsByNamespace.get(options.namespace);
      if (namespaceEventIds) {
        candidateEvents = Array.from(namespaceEventIds)
          .map(id => this.events.get(id))
          .filter((event): event is PersistedEvent => event !== undefined);
      }
    } else {
      candidateEvents = Array.from(this.events.values());
    }

    // Filter by room
    if (options.room) {
      const roomKey = `${options.namespace || '*'}:${options.room}`;
      const roomEventIds = this.eventsByRoom.get(roomKey);
      if (roomEventIds) {
        candidateEvents = candidateEvents.filter(event => 
          roomEventIds.has(event.id)
        );
      } else {
        candidateEvents = [];
      }
    }

    // Filter by event types
    if (options.eventTypes && options.eventTypes.length > 0) {
      candidateEvents = candidateEvents.filter(event =>
        options.eventTypes!.includes(event.event_type)
      );
    }

    // Filter by time
    if (options.since) {
      const sinceIso = options.since.toISOString();
      candidateEvents = candidateEvents.filter(event =>
        event.created_at >= sinceIso
      );
    }

    // Filter expired events unless explicitly included
    if (!options.includeExpired) {
      const now = new Date().toISOString();
      candidateEvents = candidateEvents.filter(event =>
        !event.expires_at || event.expires_at > now
      );
    }

    // Sort by creation time (oldest first)
    candidateEvents.sort((a, b) => a.created_at.localeCompare(b.created_at));

    // Apply limit
    if (options.limit && options.limit > 0) {
      candidateEvents = candidateEvents.slice(0, options.limit);
    }

    return candidateEvents;
  }

  /**
   * Update indexes for efficient querying
   */
  private updateIndexes(event: PersistedEvent): void {
    // Index by namespace
    if (!this.eventsByNamespace.has(event.namespace)) {
      this.eventsByNamespace.set(event.namespace, new Set());
    }
    this.eventsByNamespace.get(event.namespace)!.add(event.id);

    // Index by room
    if (event.room) {
      const roomKey = `${event.namespace}:${event.room}`;
      if (!this.eventsByRoom.has(roomKey)) {
        this.eventsByRoom.set(roomKey, new Set());
      }
      this.eventsByRoom.get(roomKey)!.add(event.id);
    }

    // Index by event type
    if (!this.eventsByType.has(event.event_type)) {
      this.eventsByType.set(event.event_type, new Set());
    }
    this.eventsByType.get(event.event_type)!.add(event.id);
  }

  /**
   * Remove an event and update indexes
   */
  private removeEvent(eventId: string): void {
    const event = this.events.get(eventId);
    if (!event) return;

    // Remove from main storage
    this.events.delete(eventId);

    // Remove from indexes
    this.eventsByNamespace.get(event.namespace)?.delete(eventId);
    this.eventsByType.get(event.event_type)?.delete(eventId);

    if (event.room) {
      const roomKey = `${event.namespace}:${event.room}`;
      this.eventsByRoom.get(roomKey)?.delete(eventId);
    }
  }

  /**
   * Enforce maximum events limit by removing oldest events
   */
  private async enforceMaxEventsLimit(): Promise<void> {
    if (this.events.size <= this.config.maxEvents) {
      return;
    }

    const eventsToRemove = this.events.size - this.config.maxEvents;
    const sortedEvents = Array.from(this.events.values())
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    for (let i = 0; i < eventsToRemove; i++) {
      this.removeEvent(sortedEvents[i].id);
    }

    this.fastify.log.debug(`Removed ${eventsToRemove} old events to enforce limit`);
  }

  /**
   * Clean up expired events
   */
  async cleanupExpiredEvents(): Promise<number> {
    if (!this.config.enabled) {
      return 0;
    }

    const now = new Date().toISOString();
    const expiredEventIds: string[] = [];

    for (const [id, event] of this.events.entries()) {
      if (event.expires_at && event.expires_at <= now) {
        expiredEventIds.push(id);
      }
    }

    for (const id of expiredEventIds) {
      this.removeEvent(id);
    }

    if (expiredEventIds.length > 0) {
      this.fastify.log.debug(`Cleaned up ${expiredEventIds.length} expired events`);
    }

    return expiredEventIds.length;
  }

  /**
   * Start the cleanup interval
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredEvents();
      } catch (error) {
        this.fastify.log.error('Error during event cleanup:', error);
      }
    }, this.config.cleanupIntervalMinutes * 60 * 1000);
  }

  /**
   * Get persistence statistics
   */
  getStatistics(): {
    total_events: number;
    events_by_namespace: Record<string, number>;
    events_by_type: Record<string, number>;
    oldest_event: string | null;
    newest_event: string | null;
    config: EventPersistenceConfig;
  } {
    const events = Array.from(this.events.values());
    const sortedByTime = events.sort((a, b) => a.created_at.localeCompare(b.created_at));

    const eventsByNamespace: Record<string, number> = {};
    for (const [namespace, eventIds] of this.eventsByNamespace.entries()) {
      eventsByNamespace[namespace] = eventIds.size;
    }

    const eventsByType: Record<string, number> = {};
    for (const [type, eventIds] of this.eventsByType.entries()) {
      eventsByType[type] = eventIds.size;
    }

    return {
      total_events: this.events.size,
      events_by_namespace: eventsByNamespace,
      events_by_type: eventsByType,
      oldest_event: sortedByTime[0]?.created_at || null,
      newest_event: sortedByTime[sortedByTime.length - 1]?.created_at || null,
      config: this.config
    };
  }

  /**
   * Clear all persisted events
   */
  async clearAllEvents(): Promise<void> {
    this.events.clear();
    this.eventsByNamespace.clear();
    this.eventsByRoom.clear();
    this.eventsByType.clear();
    
    this.fastify.log.info('All persisted events cleared');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<EventPersistenceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (this.config.enabled && !this.cleanupInterval) {
      this.startCleanupInterval();
    } else if (!this.config.enabled && this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}