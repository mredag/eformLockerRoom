import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { EventService } from './event-service.js';
import { EventPersistenceService, EventReplayOptions } from './event-persistence-service.js';
import { WebSocketEvent } from '../types/events.js';

export interface WebSocketConnection {
  id: string;
  socket: WebSocket;
  namespace: string;
  rooms: Set<string>;
  userId?: string;
  sessionId?: string;
  authenticated: boolean;
  connectedAt: Date;
  lastActivity: Date;
}

export interface WebSocketNamespace {
  path: string;
  connections: Map<string, WebSocketConnection>;
  rooms: Map<string, Set<string>>; // room -> connection IDs
  requireAuth: boolean;
}

export interface LatencyMetrics {
  median: number;
  p95: number;
  p99: number;
  connection_count: number;
}

export interface WebSocketEvent {
  type: string;
  data: any;
  timestamp: Date;
  namespace: string;
  room?: string;
}

export class WebSocketManager {
  private namespaces: Map<string, WebSocketNamespace> = new Map();
  private connectionPool: Map<string, WebSocketConnection> = new Map();
  private latencyHistory: number[] = [];
  private cleanupInterval: NodeJS.Timeout;
  private eventService: EventService;
  private eventPersistenceService: EventPersistenceService | null;

  constructor(private fastify?: FastifyInstance) {
    // Initialize event services
    this.eventService = new EventService();
    this.eventPersistenceService = fastify ? new EventPersistenceService(fastify, this.eventService) : null;
    
    // Only create namespaces if fastify instance is provided
    if (fastify) {
      // Initialize default namespaces
      this.createNamespace('/ws/lockers', true);
      this.createNamespace('/ws/help', true);
      this.createNamespace('/ws/events', true);
    }

    // Start cleanup interval for inactive connections
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveConnections();
    }, 30000); // Every 30 seconds
  }

  /**
   * Create a new WebSocket namespace
   */
  createNamespace(path: string, requireAuth: boolean = true): WebSocketNamespace {
    const namespace: WebSocketNamespace = {
      path,
      connections: new Map(),
      rooms: new Map(),
      requireAuth
    };

    this.namespaces.set(path, namespace);
    if (this.fastify) {
      this.fastify.log.info(`WebSocket namespace created: ${path}`);
    } else {
      console.log(`WebSocket namespace created: ${path}`);
    }
    
    return namespace;
  }

  /**
   * Handle new WebSocket connection
   */
  async handleConnection(socket: WebSocket, namespace: string, sessionId?: string): Promise<string | null> {
    const ns = this.namespaces.get(namespace);
    if (!ns) {
      socket.close(1008, 'Invalid namespace');
      return null;
    }

    const connectionId = uuidv4();
    const connection: WebSocketConnection = {
      id: connectionId,
      socket,
      namespace,
      rooms: new Set(),
      sessionId,
      authenticated: false,
      connectedAt: new Date(),
      lastActivity: new Date()
    };

    // Authenticate connection if required
    if (ns.requireAuth) {
      if (!sessionId) {
        socket.close(1008, 'Authentication required');
        return null;
      }
      const authenticated = await this.authenticateConnection(connection, sessionId);
      if (!authenticated) {
        socket.close(1008, 'Authentication failed');
        return null;
      }
    } else {
      connection.authenticated = true;
    }

    // Add connection to namespace and pool
    ns.connections.set(connectionId, connection);
    this.connectionPool.set(connectionId, connection);

    // Set up connection event handlers
    this.setupConnectionHandlers(connection);

    this.fastify.log.info(`WebSocket connection established: ${connectionId} in ${namespace}`);
    
    // Send connection confirmation
    this.sendToConnection(connectionId, 'connection', {
      connectionId,
      namespace,
      authenticated: connection.authenticated,
      timestamp: new Date().toISOString()
    });

    // Create and persist connection event
    const connectionEvent = this.eventService.createConnectionEvent(
      'connection',
      connectionId,
      namespace,
      this.getConnectionCount(),
      {
        userId: connection.userId,
        sessionId: connection.sessionId,
        userAgent: connection.socket.protocol, // Approximate user agent
        ipAddress: 'unknown' // Would need to be passed from request
      }
    );
    
    await this.eventPersistenceService.persistEvent(connectionEvent, 1); // 1 hour TTL for connection events

    // Replay recent events for the new connection
    await this.replayEventsForConnection(connectionId, namespace);

    return connectionId;
  }

  /**
   * Handle connection disconnection
   */
  async handleDisconnection(connectionId: string): Promise<void> {
    const connection = this.connectionPool.get(connectionId);
    if (!connection) return;

    const namespace = this.namespaces.get(connection.namespace);
    if (namespace) {
      // Remove from all rooms
      connection.rooms.forEach(room => {
        this.leaveRoom(connectionId, room);
      });

      // Remove from namespace
      namespace.connections.delete(connectionId);
    }

    // Create and persist disconnection event
    const disconnectionEvent = this.eventService.createConnectionEvent(
      'disconnection',
      connectionId,
      connection.namespace,
      this.getConnectionCount() - 1, // Account for the connection being removed
      {
        userId: connection.userId,
        sessionId: connection.sessionId
      }
    );
    
    await this.eventPersistenceService.persistEvent(disconnectionEvent, 1); // 1 hour TTL

    // Remove from connection pool
    this.connectionPool.delete(connectionId);

    this.fastify.log.info(`WebSocket connection closed: ${connectionId}`);
  }

  /**
   * Authenticate WebSocket connection using session
   */
  private async authenticateConnection(connection: WebSocketConnection, sessionId: string): Promise<boolean> {
    try {
      // This would integrate with the session manager from the panel service
      // For now, we'll implement a basic validation
      if (!sessionId || sessionId.length < 10) {
        return false;
      }

      // TODO: Integrate with actual session validation
      // const sessionManager = new SqliteSessionManager();
      // const session = await sessionManager.validateSession(sessionId);
      // if (!session) return false;

      // For testing purposes, accept any session ID with length >= 10
      // In production, this would validate against the actual session store
      connection.authenticated = true;
      connection.sessionId = sessionId;
      // connection.userId = session.user_id;

      return true;
    } catch (error) {
      this.fastify.log.error('WebSocket authentication error:', error);
      return false;
    }
  }

  /**
   * Set up event handlers for a connection
   */
  private setupConnectionHandlers(connection: WebSocketConnection): void {
    const { socket, id } = connection;

    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(id, message);
        connection.lastActivity = new Date();
      } catch (error) {
        this.fastify.log.error(`Invalid message from ${id}:`, error);
        this.sendToConnection(id, 'error', { message: 'Invalid message format' });
      }
    });

    socket.on('close', () => {
      this.handleDisconnection(id).catch(error => {
        this.fastify.log.error(`Error handling disconnection for ${id}:`, error);
      });
    });

    socket.on('error', (error) => {
      this.fastify.log.error(`WebSocket error for ${id}:`, error);
      this.handleDisconnection(id).catch(disconnectError => {
        this.fastify.log.error(`Error handling disconnection after error for ${id}:`, disconnectError);
      });
    });

    socket.on('pong', () => {
      connection.lastActivity = new Date();
    });
  }

  /**
   * Handle incoming messages from clients
   */
  private handleMessage(connectionId: string, message: any): void {
    const connection = this.connectionPool.get(connectionId);
    if (!connection) return;

    switch (message.type) {
      case 'join_room':
        if (message.room) {
          this.joinRoom(connectionId, message.room);
        }
        break;
      
      case 'leave_room':
        if (message.room) {
          this.leaveRoom(connectionId, message.room);
        }
        break;
      
      case 'ping':
        // Echo back the timestamp for latency calculation
        const pingData = message.data || {};
        this.sendToConnection(connectionId, 'pong', { 
          timestamp: pingData.timestamp || new Date().toISOString(),
          server_timestamp: new Date().toISOString()
        });
        break;
      
      default:
        this.fastify.log.warn(`Unknown message type: ${message.type} from ${connectionId}`);
    }
  }

  /**
   * Join a connection to a room
   */
  joinRoom(connectionId: string, room: string): void {
    const connection = this.connectionPool.get(connectionId);
    if (!connection) return;

    const namespace = this.namespaces.get(connection.namespace);
    if (!namespace) return;

    // Add connection to room
    connection.rooms.add(room);
    
    if (!namespace.rooms.has(room)) {
      namespace.rooms.set(room, new Set());
    }
    namespace.rooms.get(room)!.add(connectionId);

    this.fastify.log.debug(`Connection ${connectionId} joined room ${room}`);
    
    // Notify connection
    this.sendToConnection(connectionId, 'room_joined', { room });
  }

  /**
   * Remove a connection from a room
   */
  leaveRoom(connectionId: string, room: string): void {
    const connection = this.connectionPool.get(connectionId);
    if (!connection) return;

    const namespace = this.namespaces.get(connection.namespace);
    if (!namespace) return;

    // Remove connection from room
    connection.rooms.delete(room);
    
    const roomConnections = namespace.rooms.get(room);
    if (roomConnections) {
      roomConnections.delete(connectionId);
      if (roomConnections.size === 0) {
        namespace.rooms.delete(room);
      }
    }

    this.fastify.log.debug(`Connection ${connectionId} left room ${room}`);
    
    // Notify connection
    this.sendToConnection(connectionId, 'room_left', { room });
  }

  /**
   * Broadcast message to all connections in a namespace
   */
  async broadcast(namespace: string, event: string, data: any): Promise<void> {
    const ns = this.namespaces.get(namespace);
    if (!ns) return;

    const message = JSON.stringify({
      type: event,
      data,
      timestamp: new Date().toISOString(),
      namespace
    });

    let sentCount = 0;
    const startTime = Date.now();

    ns.connections.forEach((connection) => {
      if (connection.socket.readyState === 1) { // WebSocket.OPEN
        connection.socket.send(message);
        sentCount++;
      }
    });

    const latency = Date.now() - startTime;
    this.recordLatency(latency);

    this.fastify.log.debug(`Broadcast to ${namespace}: ${event} (${sentCount} connections, ${latency}ms)`);
  }

  /**
   * Broadcast message to all connections in a specific room
   */
  async broadcastToRoom(namespace: string, room: string, event: string, data: any): Promise<void> {
    const ns = this.namespaces.get(namespace);
    if (!ns) return;

    const roomConnections = ns.rooms.get(room);
    if (!roomConnections || roomConnections.size === 0) return;

    const message = JSON.stringify({
      type: event,
      data,
      timestamp: new Date().toISOString(),
      namespace,
      room
    });

    let sentCount = 0;
    const startTime = Date.now();

    roomConnections.forEach((connectionId) => {
      const connection = this.connectionPool.get(connectionId);
      if (connection && connection.socket.readyState === 1) { // WebSocket.OPEN
        connection.socket.send(message);
        sentCount++;
      }
    });

    const latency = Date.now() - startTime;
    this.recordLatency(latency);

    this.fastify.log.debug(`Broadcast to ${namespace}/${room}: ${event} (${sentCount} connections, ${latency}ms)`);
  }

  /**
   * Send message to a specific connection
   */
  sendToConnection(connectionId: string, event: string, data: any): void {
    const connection = this.connectionPool.get(connectionId);
    if (!connection || connection.socket.readyState !== 1) return; // WebSocket.OPEN

    const message = JSON.stringify({
      type: event,
      data,
      timestamp: new Date().toISOString()
    });

    connection.socket.send(message);
  }

  /**
   * Get connection count for a namespace or all namespaces
   */
  getConnectionCount(namespace?: string): number {
    if (namespace) {
      const ns = this.namespaces.get(namespace);
      return ns ? ns.connections.size : 0;
    }

    return this.connectionPool.size;
  }

  /**
   * Get latency metrics
   */
  getLatencyMetrics(): LatencyMetrics {
    if (this.latencyHistory.length === 0) {
      return {
        median: 0,
        p95: 0,
        p99: 0,
        connection_count: this.connectionPool.size
      };
    }

    const sorted = [...this.latencyHistory].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      median: sorted[Math.floor(len * 0.5)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)],
      connection_count: this.connectionPool.size
    };
  }

  /**
   * Record latency for metrics
   */
  private recordLatency(latency: number): void {
    this.latencyHistory.push(latency);
    
    // Keep only last 1000 measurements
    if (this.latencyHistory.length > 1000) {
      this.latencyHistory = this.latencyHistory.slice(-1000);
    }
  }

  /**
   * Clean up inactive connections
   */
  private cleanupInactiveConnections(): void {
    const now = new Date();
    const timeout = 5 * 60 * 1000; // 5 minutes

    this.connectionPool.forEach((connection, connectionId) => {
      const inactive = now.getTime() - connection.lastActivity.getTime() > timeout;
      const closed = connection.socket.readyState !== 1; // WebSocket.OPEN

      if (inactive || closed) {
        this.fastify.log.info(`Cleaning up inactive connection: ${connectionId}`);
        this.handleDisconnection(connectionId);
      }
    });
  }

  /**
   * Emit locker state changed event
   */
  async emitLockerStateChanged(
    lockerId: string, 
    oldState: 'closed' | 'open' | 'reserved' | 'maintenance' | 'error', 
    newState: 'closed' | 'open' | 'reserved' | 'maintenance' | 'error', 
    kioskId: string,
    options: { userId?: string; reason?: string; metadata?: Record<string, any> } = {}
  ): Promise<void> {
    // Create structured event
    const event = this.eventService.createLockerStateChangedEvent(
      lockerId,
      oldState,
      newState,
      kioskId,
      {
        namespace: '/ws/lockers',
        room: 'locker_updates',
        ...options
      }
    );

    // Persist event for replay
    await this.eventPersistenceService.persistEvent(event, 24); // 24 hour TTL

    // Broadcast to relevant namespaces
    await this.broadcastEvent(event, ['/ws/lockers', '/ws/events']);
  }

  /**
   * Emit help requested event
   */
  async emitHelpRequested(helpRequest: {
    id: number;
    kiosk_id: string;
    locker_no?: number;
    category: 'access_issue' | 'hardware_problem' | 'payment_issue' | 'other';
    note?: string;
    photo_url?: string;
    status: 'open' | 'assigned' | 'resolved';
    created_at: string;
    user_contact?: string;
  }, priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium'): Promise<void> {
    // Create structured event
    const event = this.eventService.createHelpRequestedEvent(
      helpRequest,
      {
        namespace: '/ws/help',
        room: 'help_requests',
        priority
      }
    );

    // Persist event for replay
    await this.eventPersistenceService.persistEvent(event, 48); // 48 hour TTL for help requests

    // Broadcast to relevant namespaces
    await this.broadcastEvent(event, ['/ws/help', '/ws/events']);
  }

  /**
   * Emit command applied event
   */
  async emitCommandApplied(command: {
    id: string;
    type: 'open' | 'close' | 'reset' | 'buzzer' | 'status_check';
    lockerId?: string;
    kioskId?: string;
    parameters?: Record<string, any>;
    issued_by: string;
    issued_at: string;
  }, result: {
    success: boolean;
    message?: string;
    timestamp: string;
    error?: string;
    execution_time_ms?: number;
    response_data?: Record<string, any>;
  }): Promise<void> {
    // Create structured event
    const event = this.eventService.createCommandAppliedEvent(
      command,
      result,
      {
        namespace: '/ws/events',
        room: 'system_events'
      }
    );

    // Persist event for replay
    await this.eventPersistenceService.persistEvent(event, 72); // 72 hour TTL for command events

    // Broadcast to events namespace
    await this.broadcastEvent(event, ['/ws/events']);
  }

  /**
   * Broadcast a structured event to multiple namespaces
   */
  private async broadcastEvent(event: WebSocketEvent, namespaces: string[]): Promise<void> {
    const serializedEvent = this.eventService.serializeEvent(event);
    
    for (const namespace of namespaces) {
      const ns = this.namespaces.get(namespace);
      if (!ns) continue;

      let sentCount = 0;
      const startTime = Date.now();

      // If event has a room, try to broadcast to room first, then fall back to all connections
      if (event.room) {
        const roomConnections = ns.rooms.get(event.room);
        if (roomConnections && roomConnections.size > 0) {
          // Broadcast to specific room
          roomConnections.forEach((connectionId) => {
            const connection = this.connectionPool.get(connectionId);
            if (connection && connection.socket.readyState === 1) {
              connection.socket.send(serializedEvent);
              sentCount++;
            }
          });
        } else {
          // No connections in specific room, broadcast to all connections in namespace
          ns.connections.forEach((connection) => {
            if (connection.socket.readyState === 1) {
              connection.socket.send(serializedEvent);
              sentCount++;
            }
          });
        }
      } else {
        // No room specified, broadcast to all connections in namespace
        ns.connections.forEach((connection) => {
          if (connection.socket.readyState === 1) {
            connection.socket.send(serializedEvent);
            sentCount++;
          }
        });
      }

      const latency = Date.now() - startTime;
      this.recordLatency(latency);

      this.fastify.log.debug(
        `Event broadcast to ${namespace}${event.room ? `/${event.room}` : ''}: ${event.type} (${sentCount} connections, ${latency}ms)`
      );
    }
  }

  /**
   * Replay events for a newly connected client
   */
  private async replayEventsForConnection(connectionId: string, namespace: string): Promise<void> {
    const connection = this.connectionPool.get(connectionId);
    if (!connection) return;

    try {
      // Get recent events for this namespace (last 1 hour)
      const replayOptions: EventReplayOptions = {
        namespace,
        since: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        limit: 50, // Limit to prevent overwhelming the client
        includeExpired: false
      };

      const events = await this.eventPersistenceService.replayEvents(replayOptions);
      
      if (events.length > 0) {
        this.fastify.log.debug(`Replaying ${events.length} events for connection ${connectionId}`);
        
        for (const event of events) {
          if (connection.socket.readyState === 1) { // WebSocket.OPEN
            const serializedEvent = this.eventService.serializeEvent(event);
            connection.socket.send(serializedEvent);
          }
        }
      }
    } catch (error) {
      this.fastify.log.error(`Failed to replay events for connection ${connectionId}:`, error);
    }
  }

  /**
   * Emit help status updated event
   */
  async emitHelpStatusUpdated(
    id: number,
    oldStatus: 'open' | 'assigned' | 'resolved',
    newStatus: 'open' | 'assigned' | 'resolved',
    options: { agentId?: string; resolutionNotes?: string } = {}
  ): Promise<void> {
    const event = this.eventService.createHelpStatusUpdatedEvent(
      id,
      oldStatus,
      newStatus,
      {
        namespace: '/ws/help',
        room: 'help_requests',
        ...options
      }
    );

    await this.eventPersistenceService.persistEvent(event, 48); // 48 hour TTL
    await this.broadcastEvent(event, ['/ws/help', '/ws/events']);
  }

  /**
   * Emit system status event
   */
  async emitSystemStatus(
    component: 'kiosk' | 'gateway' | 'panel' | 'database' | 'websocket',
    status: 'online' | 'offline' | 'degraded' | 'maintenance',
    healthScore: number,
    options: {
      metrics?: {
        cpu_usage?: number;
        memory_usage?: number;
        disk_usage?: number;
        network_latency?: number;
        error_rate?: number;
      };
      message?: string;
      details?: Record<string, any>;
    } = {}
  ): Promise<void> {
    const event = this.eventService.createSystemStatusEvent(
      component,
      status,
      healthScore,
      {
        namespace: '/ws/events',
        room: 'system_events',
        ...options
      }
    );

    await this.eventPersistenceService.persistEvent(event, 24); // 24 hour TTL
    await this.broadcastEvent(event, ['/ws/events']);
  }

  /**
   * Get event service instance
   */
  getEventService(): EventService {
    return this.eventService;
  }

  /**
   * Get event persistence service instance
   */
  getEventPersistenceService(): EventPersistenceService {
    return this.eventPersistenceService;
  }

  /**
   * Get event persistence statistics
   */
  getEventStatistics() {
    return this.eventPersistenceService.getStatistics();
  }

  /**
   * Shutdown the WebSocket manager
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Shutdown event persistence service
    this.eventPersistenceService.shutdown();

    // Close all connections
    this.connectionPool.forEach((connection) => {
      if (connection.socket.readyState === 1) { // WebSocket.OPEN
        connection.socket.close(1001, 'Server shutdown');
      }
    });

    this.connectionPool.clear();
    this.namespaces.clear();
  }
}