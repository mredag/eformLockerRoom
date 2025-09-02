import { WebSocket, WebSocketServer } from 'ws';
import { WebSocketMessage, LockerStateUpdate, ConnectionStatus } from '../types/core-entities';

export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private connectionStatus: ConnectionStatus = {
    status: 'offline',
    lastUpdate: new Date(),
    connectedClients: 0
  };

  /**
   * Initialize WebSocket server
   */
  public initialize(port: number = 8080): void {
    this.wss = new WebSocketServer({ 
      port,
      host: '0.0.0.0' // Bind to all interfaces to accept external connections
    });
    
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('🔌 WebSocket client connected');
      this.clients.add(ws);
      this.updateConnectionStatus();

      // Send current connection status to new client
      this.sendToClient(ws, {
        type: 'connection_status',
        timestamp: new Date(),
        data: this.connectionStatus
      });

      ws.on('close', () => {
        console.log('🔌 WebSocket client disconnected');
        this.clients.delete(ws);
        this.updateConnectionStatus();
      });

      ws.on('error', (error: Error) => {
        console.error('🚨 WebSocket client error:', error);
        this.clients.delete(ws);
        this.updateConnectionStatus();
      });

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(ws, message);
        } catch (error) {
          console.error('🚨 Invalid WebSocket message:', error);
        }
      });
    });

    this.wss.on('error', (error: Error) => {
      console.error('🚨 WebSocket server error:', error);
    });

    // Start heartbeat
    this.startHeartbeat();
    
    console.log(`🚀 WebSocket server started on port ${port}`);
  }

  /**
   * Handle incoming client messages
   */
  private handleClientMessage(ws: WebSocket, message: any): void {
    switch (message.type) {
      case 'ping':
        this.sendToClient(ws, {
          type: 'heartbeat',
          timestamp: new Date(),
          data: { pong: true }
        });
        break;
      default:
        console.log('📨 Received unknown message type:', message.type);
    }
  }

  /**
   * Broadcast locker state update to all connected clients
   */
  public broadcastStateUpdate(update: LockerStateUpdate): void {
    const message: WebSocketMessage = {
      type: 'state_update',
      timestamp: new Date(),
      data: update
    };

    console.log(`📡 WebSocket broadcasting state update:`, {
      type: message.type,
      kioskId: update.kioskId,
      lockerId: update.lockerId,
      state: update.state,
      ownerKey: update.ownerKey,
      ownerType: update.ownerType,
      connectedClients: this.clients.size
    });

    this.broadcast(message);
  }

  /**
   * Broadcast connection status update
   */
  public broadcastConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatus = status;
    
    const message: WebSocketMessage = {
      type: 'connection_status',
      timestamp: new Date(),
      data: status
    };

    this.broadcast(message);
  }

  /**
   * Broadcast error message
   */
  public broadcastError(error: string, details?: any): void {
    const message: WebSocketMessage = {
      type: 'error',
      timestamp: new Date(),
      data: { error, details }
    };

    this.broadcast(message);
  }

  /**
   * Send message to all connected clients
   */
  private broadcast(message: WebSocketMessage): void {
    const messageStr = JSON.stringify(message);
    
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
        } catch (error) {
          console.error('🚨 Error sending WebSocket message:', error);
          this.clients.delete(client);
        }
      } else {
        // Remove closed connections
        this.clients.delete(client);
      }
    });

    this.updateConnectionStatus();
  }

  /**
   * Send message to specific client
   */
  private sendToClient(client: WebSocket, message: WebSocketMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(message));
      } catch (error) {
        console.error('🚨 Error sending WebSocket message to client:', error);
        this.clients.delete(client);
      }
    }
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const message: WebSocketMessage = {
        type: 'heartbeat',
        timestamp: new Date(),
        data: { ping: true }
      };

      this.broadcast(message);
    }, 30000); // Send heartbeat every 30 seconds
  }

  /**
   * Update connection status
   */
  private updateConnectionStatus(): void {
    const connectedClients = this.clients.size;
    const status: 'online' | 'offline' = connectedClients > 0 ? 'online' : 'offline';
    
    this.connectionStatus = {
      status,
      lastUpdate: new Date(),
      connectedClients
    };
  }

  /**
   * Get current connection status
   */
  public getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  /**
   * Get connected client count
   */
  public getConnectedClientCount(): number {
    return this.clients.size;
  }

  /**
   * Shutdown WebSocket server
   */
  public shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.wss) {
      // Close all client connections
      this.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.close();
        }
      });
      
      this.clients.clear();
      
      // Close server
      this.wss.close(() => {
        console.log('🔌 WebSocket server closed');
      });
      
      this.wss = null;
    }
  }
}

// Singleton instance
export const webSocketService = new WebSocketService();