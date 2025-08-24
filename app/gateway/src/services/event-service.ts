import { v4 as uuidv4 } from 'uuid';
import {
  WebSocketEvent,
  BaseEvent,
  LockerStateChangedEvent,
  HelpRequestedEvent,
  HelpStatusUpdatedEvent,
  CommandAppliedEvent,
  SystemStatusEvent,
  ConnectionEvent,
  EVENT_SCHEMAS,
  EventValidationSchema,
  CreateEventOptions,
  CURRENT_EVENT_VERSION
} from '../types/events.js';

/**
 * Event validation error
 */
export class EventValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public expectedType?: string,
    public actualValue?: any
  ) {
    super(message);
    this.name = 'EventValidationError';
  }
}

/**
 * Event serialization error
 */
export class EventSerializationError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'EventSerializationError';
  }
}

/**
 * Service for event validation, serialization, and creation
 */
export class EventService {
  /**
   * Create a locker state changed event
   */
  createLockerStateChangedEvent(
    lockerId: string,
    oldState: 'closed' | 'open' | 'reserved' | 'maintenance' | 'error',
    newState: 'closed' | 'open' | 'reserved' | 'maintenance' | 'error',
    kioskId: string,
    options: CreateEventOptions & {
      userId?: string;
      reason?: string;
      metadata?: Record<string, any>;
    } = { namespace: '/ws/lockers' }
  ): LockerStateChangedEvent {
    const event: LockerStateChangedEvent = {
      id: uuidv4(),
      type: 'locker_state_changed',
      timestamp: new Date().toISOString(),
      namespace: options.namespace,
      room: options.room,
      version: options.version || CURRENT_EVENT_VERSION,
      data: {
        lockerId,
        oldState,
        newState,
        kioskId,
        userId: options.userId,
        reason: options.reason,
        metadata: options.metadata
      }
    };

    this.validateEvent(event);
    return event;
  }

  /**
   * Create a help requested event
   */
  createHelpRequestedEvent(
    helpRequest: {
      id: number;
      kiosk_id: string;
      locker_no?: number;
      category: 'access_issue' | 'hardware_problem' | 'payment_issue' | 'other';
      note?: string;
      photo_url?: string;
      status: 'open' | 'assigned' | 'resolved';
      created_at: string;
      user_contact?: string;
    },
    options: CreateEventOptions & {
      priority?: 'low' | 'medium' | 'high' | 'urgent';
    } = { namespace: '/ws/help' }
  ): HelpRequestedEvent {
    const event: HelpRequestedEvent = {
      id: uuidv4(),
      type: 'help_requested',
      timestamp: new Date().toISOString(),
      namespace: options.namespace,
      room: options.room,
      version: options.version || CURRENT_EVENT_VERSION,
      data: {
        ...helpRequest,
        priority: options.priority || 'medium'
      }
    };

    this.validateEvent(event);
    return event;
  }

  /**
   * Create a help status updated event
   */
  createHelpStatusUpdatedEvent(
    id: number,
    oldStatus: 'open' | 'assigned' | 'resolved',
    newStatus: 'open' | 'assigned' | 'resolved',
    options: CreateEventOptions & {
      agentId?: string;
      resolutionNotes?: string;
    } = { namespace: '/ws/help' }
  ): HelpStatusUpdatedEvent {
    const event: HelpStatusUpdatedEvent = {
      id: uuidv4(),
      type: 'help_status_updated',
      timestamp: new Date().toISOString(),
      namespace: options.namespace,
      room: options.room,
      version: options.version || CURRENT_EVENT_VERSION,
      data: {
        id,
        old_status: oldStatus,
        new_status: newStatus,
        agent_id: options.agentId,
        resolution_notes: options.resolutionNotes,
        updated_at: new Date().toISOString()
      }
    };

    this.validateEvent(event);
    return event;
  }

  /**
   * Create a command applied event
   */
  createCommandAppliedEvent(
    command: {
      id: string;
      type: 'open' | 'close' | 'reset' | 'buzzer' | 'status_check';
      lockerId?: string;
      kioskId?: string;
      parameters?: Record<string, any>;
      issued_by: string;
      issued_at: string;
    },
    result: {
      success: boolean;
      message?: string;
      timestamp: string;
      error?: string;
      execution_time_ms?: number;
      response_data?: Record<string, any>;
    },
    options: CreateEventOptions = { namespace: '/ws/events' }
  ): CommandAppliedEvent {
    const event: CommandAppliedEvent = {
      id: uuidv4(),
      type: 'command_applied',
      timestamp: new Date().toISOString(),
      namespace: options.namespace,
      room: options.room,
      version: options.version || CURRENT_EVENT_VERSION,
      data: {
        command,
        result
      }
    };

    this.validateEvent(event);
    return event;
  }

  /**
   * Create a system status event
   */
  createSystemStatusEvent(
    component: 'kiosk' | 'gateway' | 'panel' | 'database' | 'websocket',
    status: 'online' | 'offline' | 'degraded' | 'maintenance',
    healthScore: number,
    options: CreateEventOptions & {
      metrics?: {
        cpu_usage?: number;
        memory_usage?: number;
        disk_usage?: number;
        network_latency?: number;
        error_rate?: number;
      };
      message?: string;
      details?: Record<string, any>;
    } = { namespace: '/ws/events' }
  ): SystemStatusEvent {
    const event: SystemStatusEvent = {
      id: uuidv4(),
      type: 'system_status',
      timestamp: new Date().toISOString(),
      namespace: options.namespace,
      room: options.room,
      version: options.version || CURRENT_EVENT_VERSION,
      data: {
        component,
        status,
        health_score: healthScore,
        metrics: options.metrics,
        message: options.message,
        details: options.details
      }
    };

    this.validateEvent(event);
    return event;
  }

  /**
   * Create a connection event
   */
  createConnectionEvent(
    type: 'connection' | 'disconnection',
    connectionId: string,
    namespace: string,
    connectionCount: number,
    options: {
      userId?: string;
      sessionId?: string;
      userAgent?: string;
      ipAddress?: string;
      room?: string;
      version?: string;
    } = {}
  ): ConnectionEvent {
    const event: ConnectionEvent = {
      id: uuidv4(),
      type,
      timestamp: new Date().toISOString(),
      namespace,
      room: options.room,
      version: options.version || CURRENT_EVENT_VERSION,
      data: {
        connectionId,
        userId: options.userId,
        sessionId: options.sessionId,
        namespace,
        user_agent: options.userAgent,
        ip_address: options.ipAddress,
        connection_count: connectionCount
      }
    };

    this.validateEvent(event);
    return event;
  }

  /**
   * Validate an event against its schema
   */
  validateEvent(event: WebSocketEvent): void {
    const schema = EVENT_SCHEMAS[event.type];
    if (!schema) {
      throw new EventValidationError(`Unknown event type: ${event.type}`);
    }

    // Validate base event fields
    this.validateBaseEvent(event, schema);

    // Validate event-specific data
    this.validateEventData(event, schema);
  }

  /**
   * Validate base event fields
   */
  private validateBaseEvent(event: BaseEvent, schema: EventValidationSchema): void {
    // Check required fields
    for (const field of schema.required_fields) {
      if (!(field in event) || event[field as keyof BaseEvent] === undefined) {
        throw new EventValidationError(`Missing required field: ${field}`, field);
      }
    }

    // Validate field types
    if (typeof event.id !== 'string' || event.id.length === 0) {
      throw new EventValidationError('Event id must be a non-empty string', 'id', 'string', event.id);
    }

    if (typeof event.type !== 'string' || event.type.length === 0) {
      throw new EventValidationError('Event type must be a non-empty string', 'type', 'string', event.type);
    }

    if (typeof event.timestamp !== 'string' || !this.isValidISOString(event.timestamp)) {
      throw new EventValidationError('Event timestamp must be a valid ISO string', 'timestamp', 'ISO string', event.timestamp);
    }

    if (typeof event.namespace !== 'string' || event.namespace.length === 0) {
      throw new EventValidationError('Event namespace must be a non-empty string', 'namespace', 'string', event.namespace);
    }

    if (typeof event.version !== 'string' || event.version.length === 0) {
      throw new EventValidationError('Event version must be a non-empty string', 'version', 'string', event.version);
    }

    if (event.room !== undefined && (typeof event.room !== 'string' || event.room.length === 0)) {
      throw new EventValidationError('Event room must be a non-empty string if provided', 'room', 'string', event.room);
    }
  }

  /**
   * Validate event-specific data
   */
  private validateEventData(event: WebSocketEvent, schema: EventValidationSchema): void {
    if (!event.data || typeof event.data !== 'object') {
      throw new EventValidationError('Event data must be an object', 'data', 'object', event.data);
    }

    const { data_schema } = schema;
    
    // Check required data fields
    if (data_schema.required) {
      for (const field of data_schema.required) {
        if (!(field in event.data) || (event.data as any)[field] === undefined) {
          throw new EventValidationError(`Missing required data field: ${field}`, `data.${field}`);
        }
      }
    }

    // Validate enum values
    if (data_schema.enums) {
      for (const [field, allowedValues] of Object.entries(data_schema.enums)) {
        const value = (event.data as any)[field];
        if (value !== undefined && !allowedValues.includes(value)) {
          throw new EventValidationError(
            `Invalid value for ${field}: ${value}. Allowed values: ${allowedValues.join(', ')}`,
            `data.${field}`,
            `one of: ${allowedValues.join(', ')}`,
            value
          );
        }
      }
    }

    // Special validation for command_applied events
    if (event.type === 'command_applied') {
      this.validateCommandAppliedData(event as CommandAppliedEvent, data_schema);
    }
  }

  /**
   * Validate command applied event data
   */
  private validateCommandAppliedData(event: CommandAppliedEvent, dataSchema: any): void {
    const { command, result } = event.data;

    // Validate command structure
    if (!command || typeof command !== 'object') {
      throw new EventValidationError('Command must be an object', 'data.command', 'object', command);
    }

    const commandSchema = dataSchema.command_schema;
    if (commandSchema) {
      for (const field of commandSchema.required) {
        if (!(field in command) || command[field as keyof typeof command] === undefined) {
          throw new EventValidationError(`Missing required command field: ${field}`, `data.command.${field}`);
        }
      }

      if (commandSchema.enums?.type && !commandSchema.enums.type.includes(command.type)) {
        throw new EventValidationError(
          `Invalid command type: ${command.type}. Allowed values: ${commandSchema.enums.type.join(', ')}`,
          'data.command.type',
          `one of: ${commandSchema.enums.type.join(', ')}`,
          command.type
        );
      }
    }

    // Validate result structure
    if (!result || typeof result !== 'object') {
      throw new EventValidationError('Result must be an object', 'data.result', 'object', result);
    }

    const resultSchema = dataSchema.result_schema;
    if (resultSchema) {
      for (const field of resultSchema.required) {
        if (!(field in result) || result[field as keyof typeof result] === undefined) {
          throw new EventValidationError(`Missing required result field: ${field}`, `data.result.${field}`);
        }
      }
    }

    if (typeof result.success !== 'boolean') {
      throw new EventValidationError('Result success must be a boolean', 'data.result.success', 'boolean', result.success);
    }
  }

  /**
   * Serialize an event to JSON string
   */
  serializeEvent(event: WebSocketEvent): string {
    try {
      this.validateEvent(event);
      return JSON.stringify(event);
    } catch (error) {
      if (error instanceof EventValidationError) {
        throw error;
      }
      throw new EventSerializationError('Failed to serialize event', error as Error);
    }
  }

  /**
   * Deserialize an event from JSON string
   */
  deserializeEvent(eventJson: string): WebSocketEvent {
    try {
      const event = JSON.parse(eventJson) as WebSocketEvent;
      this.validateEvent(event);
      return event;
    } catch (error) {
      if (error instanceof EventValidationError) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        throw new EventSerializationError('Invalid JSON format', error);
      }
      throw new EventSerializationError('Failed to deserialize event', error as Error);
    }
  }

  /**
   * Check if a string is a valid ISO date string
   */
  private isValidISOString(dateString: string): boolean {
    try {
      const date = new Date(dateString);
      return date.toISOString() === dateString;
    } catch {
      return false;
    }
  }

  /**
   * Get event schema for a given event type
   */
  getEventSchema(eventType: string): EventValidationSchema | null {
    return EVENT_SCHEMAS[eventType] || null;
  }

  /**
   * Get all available event types
   */
  getAvailableEventTypes(): string[] {
    return Object.keys(EVENT_SCHEMAS);
  }

  /**
   * Check if an event type is valid
   */
  isValidEventType(eventType: string): boolean {
    return eventType in EVENT_SCHEMAS;
  }
}