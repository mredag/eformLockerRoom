# WebSocket Server Infrastructure

This document describes the WebSocket server infrastructure implemented for the eform locker system.

## Overview

The WebSocket system provides real-time communication between the gateway service and connected clients (panel frontend, kiosks). It supports multiple namespaces for different types of events and includes authentication, room management, and comprehensive error handling.

## Architecture

### Namespaces

The system provides three main namespaces:

- `/ws/lockers` - For locker state changes and updates
- `/ws/help` - For help request notifications and status updates  
- `/ws/events` - For general system events and commands

### Authentication

All namespaces require authentication by default. Connections must provide a valid session ID through:
- Cookie: `sessionId=<session-id>`
- Authorization header: `Bearer <session-id>`
- Query parameter: `?sessionId=<session-id>`

## Usage

### Client Connection

```javascript
// Connect to locker updates
const lockerSocket = new WebSocket('ws://localhost:3000/ws/lockers?sessionId=your-session-id');

lockerSocket.onopen = () => {
  console.log('Connected to locker updates');
  
  // Join a specific room for targeted updates
  lockerSocket.send(JSON.stringify({
    type: 'join_room',
    room: 'kiosk-1'
  }));
};

lockerSocket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'locker_state_changed':
      console.log('Locker state changed:', message.data);
      break;
    case 'connection':
      console.log('Connection established:', message.data);
      break;
    case 'room_joined':
      console.log('Joined room:', message.data.room);
      break;
  }
};
```

### Server-side Event Emission

```typescript
import { websocketEvents } from '../index.js';

// Emit locker state change
websocketEvents.emitLockerStateChanged(
  'locker-123',
  'closed',
  'open',
  'kiosk-1'
);

// Emit help request
websocketEvents.emitHelpRequested({
  id: 1,
  kiosk_id: 'kiosk-1',
  category: 'access_issue',
  note: 'Cannot open locker',
  status: 'open',
  created_at: new Date()
});

// Emit command result
websocketEvents.emitCommandApplied(
  { type: 'open', lockerId: 'locker-123' },
  { success: true, timestamp: new Date().toISOString() }
);
```

### Room Management

Clients can join/leave rooms for targeted messaging:

```javascript
// Join a room
socket.send(JSON.stringify({
  type: 'join_room',
  room: 'kiosk-1'
}));

// Leave a room
socket.send(JSON.stringify({
  type: 'leave_room',
  room: 'kiosk-1'
}));
```

Server-side room broadcasting:

```typescript
// Broadcast to all connections in namespace
websocketManager.broadcast('/ws/lockers', 'event_name', data);

// Broadcast to specific room only
websocketManager.broadcastToRoom('/ws/lockers', 'kiosk-1', 'event_name', data);
```

## API Endpoints

### GET /api/websocket/status

Returns WebSocket server status and metrics:

```json
{
  "status": "active",
  "namespaces": {
    "/ws/lockers": 5,
    "/ws/help": 2,
    "/ws/events": 3
  },
  "total_connections": 10,
  "latency_metrics": {
    "median": 45,
    "p95": 120,
    "p99": 200,
    "connection_count": 10
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### POST /api/websocket/broadcast

Broadcast a message to all connections in a namespace:

```json
{
  "namespace": "/ws/lockers",
  "event": "test_event",
  "data": { "message": "Hello world" },
  "room": "optional-room-name"
}
```

## Event Types

### Locker Events

```typescript
interface LockerStateChanged {
  type: 'locker_state_changed';
  data: {
    lockerId: string;
    oldState: string;
    newState: string;
    kioskId: string;
    timestamp: string;
  };
}
```

### Help Events

```typescript
interface HelpRequested {
  type: 'help_requested';
  data: {
    id: number;
    kiosk_id: string;
    locker_no?: number;
    category: string;
    note?: string;
    photo_url?: string;
    status: string;
    created_at: string;
    timestamp: string;
  };
}
```

### Command Events

```typescript
interface CommandApplied {
  type: 'command_applied';
  data: {
    command: {
      type: string;
      lockerId?: string;
      kioskId?: string;
      parameters?: any;
    };
    result: {
      success: boolean;
      message?: string;
      timestamp: string;
      error?: string;
    };
    timestamp: string;
  };
}
```

## Error Handling

The WebSocket system includes comprehensive error handling:

- **Connection Errors**: Automatic cleanup and logging
- **Authentication Errors**: Connection rejection with appropriate error codes
- **Message Errors**: Invalid JSON messages are logged and error responses sent
- **Network Errors**: Automatic reconnection with exponential backoff (client-side)

## Performance

The system is designed to meet the following performance targets:

- **Latency**: Median latency under 150ms for broadcasts
- **Throughput**: Support for 100+ concurrent connections
- **Memory**: Efficient connection pooling and cleanup
- **CPU**: Minimal overhead for message broadcasting

## Monitoring

Connection metrics are tracked and available via:

```typescript
const stats = websocketEvents.getConnectionStats();
console.log(stats);
// {
//   total: 10,
//   lockers: 5,
//   help: 2,
//   events: 3,
//   latency: { median: 45, p95: 120, p99: 200 }
// }
```

## Testing

Comprehensive tests are provided for:

- Connection management and authentication
- Room management and broadcasting
- Event emission and message handling
- Error handling and cleanup
- Performance metrics

Run tests with:
```bash
npm test src/services/__tests__/websocket-manager.test.ts
npm test src/routes/__tests__/websocket.test.ts
```