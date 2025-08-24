# Event System Implementation

This document describes the comprehensive event system implemented for the WebSocket communication infrastructure.

## Overview

The event system provides structured, validated, and persistent event broadcasting with replay capabilities for real-time communication between the gateway, panel, and kiosk services.

## Architecture

### Core Components

1. **Event Service** (`event-service.ts`)
   - Event creation and validation
   - Serialization/deserialization
   - Schema management

2. **Event Persistence Service** (`event-persistence-service.ts`)
   - Event storage and TTL management
   - Event replay for reconnecting clients
   - Cleanup and maintenance

3. **Enhanced WebSocket Manager** (`websocket-manager.ts`)
   - Structured event broadcasting
   - Room-based targeting
   - Integration with persistence layer

4. **Event Types** (`types/events.ts`)
   - TypeScript interfaces for all event types
   - Validation schemas
   - Version management

## Event Types

### 1. LockerStateChangedEvent
Emitted when a locker changes state (closed → open, open → closed, etc.)

```typescript
{
  type: 'locker_state_changed',
  data: {
    lockerId: string,
    oldState: 'closed' | 'open' | 'reserved' | 'maintenance' | 'error',
    newState: 'closed' | 'open' | 'reserved' | 'maintenance' | 'error',
    kioskId: string,
    userId?: string,
    reason?: string,
    metadata?: Record<string, any>
  }
}
```

### 2. HelpRequestedEvent
Emitted when a user requests help from a kiosk

```typescript
{
  type: 'help_requested',
  data: {
    id: number,
    kiosk_id: string,
    locker_no?: number,
    category: 'access_issue' | 'hardware_problem' | 'payment_issue' | 'other',
    note?: string,
    photo_url?: string,
    status: 'open' | 'assigned' | 'resolved',
    created_at: string,
    priority: 'low' | 'medium' | 'high' | 'urgent',
    user_contact?: string
  }
}
```

### 3. HelpStatusUpdatedEvent
Emitted when help request status changes

```typescript
{
  type: 'help_status_updated',
  data: {
    id: number,
    old_status: 'open' | 'assigned' | 'resolved',
    new_status: 'open' | 'assigned' | 'resolved',
    agent_id?: string,
    resolution_notes?: string,
    updated_at: string
  }
}
```

### 4. CommandAppliedEvent
Emitted when a remote command is executed

```typescript
{
  type: 'command_applied',
  data: {
    command: {
      id: string,
      type: 'open' | 'close' | 'reset' | 'buzzer' | 'status_check',
      lockerId?: string,
      kioskId?: string,
      parameters?: Record<string, any>,
      issued_by: string,
      issued_at: string
    },
    result: {
      success: boolean,
      message?: string,
      timestamp: string,
      error?: string,
      execution_time_ms?: number,
      response_data?: Record<string, any>
    }
  }
}
```

### 5. SystemStatusEvent
Emitted for system health monitoring

```typescript
{
  type: 'system_status',
  data: {
    component: 'kiosk' | 'gateway' | 'panel' | 'database' | 'websocket',
    status: 'online' | 'offline' | 'degraded' | 'maintenance',
    health_score: number,
    metrics?: {
      cpu_usage?: number,
      memory_usage?: number,
      disk_usage?: number,
      network_latency?: number,
      error_rate?: number
    },
    message?: string,
    details?: Record<string, any>
  }
}
```

### 6. ConnectionEvent
Emitted for client connection/disconnection tracking

```typescript
{
  type: 'connection' | 'disconnection',
  data: {
    connectionId: string,
    userId?: string,
    sessionId?: string,
    namespace: string,
    user_agent?: string,
    ip_address?: string,
    connection_count: number
  }
}
```

## Usage Examples

### Emitting Events

```typescript
// Locker state change
await wsManager.emitLockerStateChanged(
  'locker-1',
  'closed',
  'open',
  'kiosk-1',
  {
    userId: 'user-123',
    reason: 'User opened with RFID',
    metadata: { rfid_card: 'CARD123' }
  }
);

// Help request
await wsManager.emitHelpRequested({
  id: 1,
  kiosk_id: 'kiosk-1',
  category: 'access_issue',
  status: 'open',
  created_at: new Date().toISOString(),
  note: 'Cannot open locker'
}, 'high');

// Command execution
await wsManager.emitCommandApplied(
  {
    id: 'cmd-123',
    type: 'open',
    lockerId: 'locker-1',
    issued_by: 'admin-user',
    issued_at: new Date().toISOString()
  },
  {
    success: true,
    timestamp: new Date().toISOString(),
    execution_time_ms: 150
  }
);
```

### Event Validation

All events are automatically validated against their schemas:

```typescript
const eventService = new EventService();

// This will throw EventValidationError if invalid
const event = eventService.createLockerStateChangedEvent(
  'locker-1',
  'invalid-state', // This will cause validation error
  'open',
  'kiosk-1'
);
```

### Event Persistence and Replay

Events are automatically persisted with configurable TTL:

```typescript
// Events are persisted automatically when emitted
await wsManager.emitLockerStateChanged('locker-1', 'closed', 'open', 'kiosk-1');

// New connections automatically receive recent events
const connectionId = await wsManager.handleConnection(socket, '/ws/lockers', sessionId);
// Client will receive replayed events from the last hour

// Manual replay
const events = await persistenceService.replayEvents({
  namespace: '/ws/lockers',
  since: new Date(Date.now() - 60 * 60 * 1000), // Last hour
  limit: 50
});
```

## Broadcasting Strategy

### Namespace-based Broadcasting

Events are broadcast to specific namespaces:
- `/ws/lockers` - Locker-related events
- `/ws/help` - Help request events  
- `/ws/events` - System events and commands

### Room-based Targeting

Events can target specific rooms within namespaces:
- `locker_updates` - Locker state changes
- `help_requests` - Help workflow events
- `system_events` - System status and commands

### Fallback Strategy

If no connections exist in a specific room, events fall back to broadcasting to all connections in the namespace.

## Performance Features

### Latency Tracking
- Median, P95, and P99 latency metrics
- Target: <150ms median latency on LAN

### Event Persistence
- Configurable TTL (default 24 hours)
- Automatic cleanup of expired events
- Memory-efficient storage with indexing

### Connection Management
- Automatic reconnection handling
- Message replay for reconnecting clients
- Connection health monitoring

## Error Handling

### Validation Errors
- Detailed error messages with field information
- Schema version compatibility checking
- Graceful degradation for invalid events

### Network Errors
- Automatic retry with exponential backoff
- Message queuing during disconnection
- Connection state monitoring

### Persistence Errors
- Graceful handling of storage failures
- Automatic cleanup and recovery
- Event corruption detection and removal

## Testing

The event system includes comprehensive tests:

- **Unit Tests**: Event creation, validation, serialization
- **Integration Tests**: WebSocket broadcasting, persistence
- **Performance Tests**: Concurrent event handling, latency measurement
- **Error Handling Tests**: Validation failures, network issues

### Running Tests

```bash
# Run all event system tests
npm test src/services/__tests__/event-service.test.ts
npm test src/services/__tests__/event-persistence-service.test.ts
npm test src/services/__tests__/websocket-event-broadcasting.test.ts
npm test src/services/__tests__/event-system-integration.test.ts
```

## Configuration

### Event Persistence Configuration

```typescript
const config = {
  enabled: true,
  maxEvents: 10000,
  defaultTtlHours: 24,
  cleanupIntervalMinutes: 30,
  replayBufferSize: 1000
};
```

### WebSocket Configuration

```typescript
// Namespaces are automatically created:
// - /ws/lockers (requires auth)
// - /ws/help (requires auth)  
// - /ws/events (requires auth)
```

## Monitoring and Observability

### Metrics Available

- Connection counts per namespace
- Event broadcast latency (median, P95, P99)
- Event persistence statistics
- Error rates and types

### Health Checks

- WebSocket connection health
- Event persistence service status
- Memory usage and cleanup efficiency

## Future Enhancements

1. **Database Persistence**: Move from in-memory to SQLite/PostgreSQL
2. **Event Sourcing**: Complete event sourcing implementation
3. **Horizontal Scaling**: Multi-instance event distribution
4. **Advanced Filtering**: Complex event filtering and routing
5. **Metrics Export**: Prometheus/Grafana integration

## Requirements Satisfied

This implementation satisfies requirement **3.3** from the system modernization specification:

- ✅ TypeScript interfaces for LockerStateChanged, HelpRequested, CommandApplied events
- ✅ Event validation and serialization/deserialization  
- ✅ Event broadcasting system with room-based targeting
- ✅ Event persistence and replay capability for reconnecting clients
- ✅ Unit tests for all event types and broadcasting logic