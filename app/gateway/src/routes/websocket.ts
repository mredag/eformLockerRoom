import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocketManager } from '../services/websocket-manager.js';

export interface WebSocketRouteOptions {
  websocketManager: WebSocketManager;
}

export async function websocketRoutes(
  fastify: FastifyInstance,
  options: WebSocketRouteOptions
) {
  const { websocketManager } = options;

  // WebSocket route for lockers namespace
  fastify.register(async function (fastify) {
    fastify.get('/ws/lockers', { websocket: true }, async (connection, request) => {
      const sessionId = extractSessionId(request);
      const connectionId = await websocketManager.handleConnection(
        connection.socket,
        '/ws/lockers',
        sessionId
      );

      if (connectionId) {
        fastify.log.info(`New locker WebSocket connection: ${connectionId}`);
        
        // Auto-join to locker updates room
        websocketManager.joinRoom(connectionId, 'locker_updates');
      }
    });
  });

  // WebSocket route for help namespace
  fastify.register(async function (fastify) {
    fastify.get('/ws/help', { websocket: true }, async (connection, request) => {
      const sessionId = extractSessionId(request);
      const connectionId = await websocketManager.handleConnection(
        connection.socket,
        '/ws/help',
        sessionId
      );

      if (connectionId) {
        fastify.log.info(`New help WebSocket connection: ${connectionId}`);
        
        // Auto-join to help requests room
        websocketManager.joinRoom(connectionId, 'help_requests');
      }
    });
  });

  // WebSocket route for events namespace
  fastify.register(async function (fastify) {
    fastify.get('/ws/events', { websocket: true }, async (connection, request) => {
      const sessionId = extractSessionId(request);
      const connectionId = await websocketManager.handleConnection(
        connection.socket,
        '/ws/events',
        sessionId
      );

      if (connectionId) {
        fastify.log.info(`New events WebSocket connection: ${connectionId}`);
        
        // Auto-join to system events room
        websocketManager.joinRoom(connectionId, 'system_events');
      }
    });
  });

  // WebSocket status endpoint
  fastify.get('/api/websocket/status', async () => {
    const metrics = websocketManager.getLatencyMetrics();
    
    return {
      status: 'active',
      namespaces: {
        '/ws/lockers': websocketManager.getConnectionCount('/ws/lockers'),
        '/ws/help': websocketManager.getConnectionCount('/ws/help'),
        '/ws/events': websocketManager.getConnectionCount('/ws/events')
      },
      total_connections: websocketManager.getConnectionCount(),
      latency_metrics: metrics,
      timestamp: new Date().toISOString()
    };
  });

  // WebSocket health endpoint for polling fallback
  fastify.get('/api/websocket/health', async () => {
    const metrics = websocketManager.getLatencyMetrics();
    const eventStats = websocketManager.getEventStatistics();
    
    // Check if WebSocket is available by testing connection count
    const websocket_available = websocketManager.getConnectionCount() >= 0; // Always true if manager is running
    
    // Get recent events for polling clients (last 30 seconds)
    const recentEvents = await websocketManager.getEventPersistenceService().replayEvents({
      since: new Date(Date.now() - 30000), // Last 30 seconds
      limit: 20,
      includeExpired: false
    });
    
    return {
      websocket_available,
      connection_health: {
        total_connections: websocketManager.getConnectionCount(),
        namespaces: {
          '/ws/lockers': websocketManager.getConnectionCount('/ws/lockers'),
          '/ws/help': websocketManager.getConnectionCount('/ws/help'),
          '/ws/events': websocketManager.getConnectionCount('/ws/events')
        },
        latency_metrics: metrics
      },
      event_statistics: eventStats,
      events: recentEvents.map(event => ({
        type: event.type,
        data: event.data,
        timestamp: event.timestamp,
        namespace: event.namespace,
        room: event.room
      })),
      timestamp: new Date().toISOString()
    };
  });

  // WebSocket broadcast endpoint (for testing and admin use)
  fastify.post('/api/websocket/broadcast', {
    schema: {
      body: {
        type: 'object',
        required: ['namespace', 'event', 'data'],
        properties: {
          namespace: { type: 'string' },
          event: { type: 'string' },
          data: { type: 'object' },
          room: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { namespace, event, data, room } = request.body as {
      namespace: string;
      event: string;
      data: any;
      room?: string;
    };

    if (room) {
      websocketManager.broadcastToRoom(namespace, room, event, data);
    } else {
      websocketManager.broadcast(namespace, event, data);
    }

    return {
      success: true,
      message: `Broadcast sent to ${namespace}${room ? `/${room}` : ''}`,
      timestamp: new Date().toISOString()
    };
  });
}

/**
 * Extract session ID from request cookies or headers
 */
function extractSessionId(request: FastifyRequest): string | undefined {
  // Try to get session ID from cookie
  const cookies = request.headers.cookie;
  if (cookies) {
    const sessionMatch = cookies.match(/sessionId=([^;]+)/);
    if (sessionMatch) {
      return sessionMatch[1];
    }
  }

  // Try to get session ID from Authorization header
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Try to get session ID from query parameter
  const query = request.query as { sessionId?: string };
  return query.sessionId;
}