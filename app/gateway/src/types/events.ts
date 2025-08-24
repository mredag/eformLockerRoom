/**
 * Event schema definitions for WebSocket communication
 * These interfaces define the structure of events that can be broadcast through the WebSocket system
 */

// Base event interface that all events must implement
export interface BaseEvent {
  id: string;
  type: string;
  timestamp: string;
  namespace: string;
  room?: string;
  version: string; // For schema versioning
}

// Locker state change event
export interface LockerStateChangedEvent extends BaseEvent {
  type: 'locker_state_changed';
  data: {
    lockerId: string;
    oldState: 'closed' | 'open' | 'reserved' | 'maintenance' | 'error';
    newState: 'closed' | 'open' | 'reserved' | 'maintenance' | 'error';
    kioskId: string;
    userId?: string; // User who triggered the change
    reason?: string; // Reason for state change
    metadata?: Record<string, any>; // Additional context
  };
}

// Help request event
export interface HelpRequestedEvent extends BaseEvent {
  type: 'help_requested';
  data: {
    id: number;
    kiosk_id: string;
    locker_no?: number;
    category: 'access_issue' | 'hardware_problem' | 'payment_issue' | 'other';
    note?: string;
    photo_url?: string;
    status: 'open' | 'assigned' | 'resolved';
    created_at: string; // ISO string
    priority: 'low' | 'medium' | 'high' | 'urgent';
    user_contact?: string; // Optional contact info
  };
}

// Help status update event
export interface HelpStatusUpdatedEvent extends BaseEvent {
  type: 'help_status_updated';
  data: {
    id: number;
    old_status: 'open' | 'assigned' | 'resolved';
    new_status: 'open' | 'assigned' | 'resolved';
    agent_id?: string;
    resolution_notes?: string;
    updated_at: string; // ISO string
  };
}

// Command applied event
export interface CommandAppliedEvent extends BaseEvent {
  type: 'command_applied';
  data: {
    command: {
      id: string;
      type: 'open' | 'close' | 'reset' | 'buzzer' | 'status_check';
      lockerId?: string;
      kioskId?: string;
      parameters?: Record<string, any>;
      issued_by: string; // User or system that issued the command
      issued_at: string; // ISO string
    };
    result: {
      success: boolean;
      message?: string;
      timestamp: string; // ISO string
      error?: string;
      execution_time_ms?: number;
      response_data?: Record<string, any>;
    };
  };
}

// System status event
export interface SystemStatusEvent extends BaseEvent {
  type: 'system_status';
  data: {
    component: 'kiosk' | 'gateway' | 'panel' | 'database' | 'websocket';
    status: 'online' | 'offline' | 'degraded' | 'maintenance';
    health_score: number; // 0-100
    metrics?: {
      cpu_usage?: number;
      memory_usage?: number;
      disk_usage?: number;
      network_latency?: number;
      error_rate?: number;
    };
    message?: string;
    details?: Record<string, any>;
  };
}

// Connection event (for client connection/disconnection)
export interface ConnectionEvent extends BaseEvent {
  type: 'connection' | 'disconnection';
  data: {
    connectionId: string;
    userId?: string;
    sessionId?: string;
    namespace: string;
    user_agent?: string;
    ip_address?: string;
    connection_count: number; // Total connections after this event
  };
}

// Union type of all possible events
export type WebSocketEvent = 
  | LockerStateChangedEvent
  | HelpRequestedEvent
  | HelpStatusUpdatedEvent
  | CommandAppliedEvent
  | SystemStatusEvent
  | ConnectionEvent;

// Event validation schemas using a simple validation approach
export interface EventValidationSchema {
  type: string;
  required_fields: string[];
  optional_fields: string[];
  data_schema: Record<string, any>;
}

// Event schemas for validation
export const EVENT_SCHEMAS: Record<string, EventValidationSchema> = {
  locker_state_changed: {
    type: 'locker_state_changed',
    required_fields: ['id', 'type', 'timestamp', 'namespace', 'version', 'data'],
    optional_fields: ['room'],
    data_schema: {
      required: ['lockerId', 'oldState', 'newState', 'kioskId'],
      optional: ['userId', 'reason', 'metadata'],
      enums: {
        oldState: ['closed', 'open', 'reserved', 'maintenance', 'error'],
        newState: ['closed', 'open', 'reserved', 'maintenance', 'error']
      }
    }
  },
  help_requested: {
    type: 'help_requested',
    required_fields: ['id', 'type', 'timestamp', 'namespace', 'version', 'data'],
    optional_fields: ['room'],
    data_schema: {
      required: ['id', 'kiosk_id', 'category', 'status', 'created_at', 'priority'],
      optional: ['locker_no', 'note', 'photo_url', 'user_contact'],
      enums: {
        category: ['access_issue', 'hardware_problem', 'payment_issue', 'other'],
        status: ['open', 'assigned', 'resolved'],
        priority: ['low', 'medium', 'high', 'urgent']
      }
    }
  },
  help_status_updated: {
    type: 'help_status_updated',
    required_fields: ['id', 'type', 'timestamp', 'namespace', 'version', 'data'],
    optional_fields: ['room'],
    data_schema: {
      required: ['id', 'old_status', 'new_status', 'updated_at'],
      optional: ['agent_id', 'resolution_notes'],
      enums: {
        old_status: ['open', 'assigned', 'resolved'],
        new_status: ['open', 'assigned', 'resolved']
      }
    }
  },
  command_applied: {
    type: 'command_applied',
    required_fields: ['id', 'type', 'timestamp', 'namespace', 'version', 'data'],
    optional_fields: ['room'],
    data_schema: {
      required: ['command', 'result'],
      optional: [],
      command_schema: {
        required: ['id', 'type', 'issued_by', 'issued_at'],
        optional: ['lockerId', 'kioskId', 'parameters'],
        enums: {
          type: ['open', 'close', 'reset', 'buzzer', 'status_check']
        }
      },
      result_schema: {
        required: ['success', 'timestamp'],
        optional: ['message', 'error', 'execution_time_ms', 'response_data']
      }
    }
  },
  system_status: {
    type: 'system_status',
    required_fields: ['id', 'type', 'timestamp', 'namespace', 'version', 'data'],
    optional_fields: ['room'],
    data_schema: {
      required: ['component', 'status', 'health_score'],
      optional: ['metrics', 'message', 'details'],
      enums: {
        component: ['kiosk', 'gateway', 'panel', 'database', 'websocket'],
        status: ['online', 'offline', 'degraded', 'maintenance']
      }
    }
  },
  connection: {
    type: 'connection',
    required_fields: ['id', 'type', 'timestamp', 'namespace', 'version', 'data'],
    optional_fields: ['room'],
    data_schema: {
      required: ['connectionId', 'namespace', 'connection_count'],
      optional: ['userId', 'sessionId', 'user_agent', 'ip_address']
    }
  },
  disconnection: {
    type: 'disconnection',
    required_fields: ['id', 'type', 'timestamp', 'namespace', 'version', 'data'],
    optional_fields: ['room'],
    data_schema: {
      required: ['connectionId', 'namespace', 'connection_count'],
      optional: ['userId', 'sessionId', 'user_agent', 'ip_address']
    }
  }
};

// Event creation helpers
export interface CreateEventOptions {
  namespace: string;
  room?: string;
  version?: string;
}

// Current event schema version
export const CURRENT_EVENT_VERSION = '1.0.0';