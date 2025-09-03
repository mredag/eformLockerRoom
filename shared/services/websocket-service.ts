import { WebSocket, WebSocketServer } from 'ws';
import { 
  WebSocketMessage, 
  LockerStateUpdate, 
  ConnectionStatus,
  HardwareDetectionUpdate,
  HardwareTestingUpdate,
  HardwareConfigurationUpdate,
  WizardProgressUpdate,
  HardwareErrorUpdate,
  HardwareRecoveryUpdate
} from '../types/core-entities';

export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private connectionStatus: ConnectionStatus = {
    status: 'offline',
    lastUpdate: new Date(),
    connectedClients: 0
  };
  
  // Hardware event tracking
  private sessionClients: Map<string, Set<WebSocket>> = new Map();
  private clientSessions: Map<WebSocket, string> = new Map();
  private lastHardwareEvent: Date | null = null;
  private reconnectionAttempts: Map<WebSocket, number> = new Map();
  private maxReconnectionAttempts: number = 5;
  private reconnectionDelay: number = 1000; // Start with 1 second

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
        this.cleanupClient(ws);
      });

      ws.on('error', (error: Error) => {
        console.error('🚨 WebSocket client error:', error);
        this.cleanupClient(ws);
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
      
      case 'subscribe_session':
        if (message.sessionId) {
          this.subscribeClientToSession(ws, message.sessionId);
        }
        break;
      
      case 'unsubscribe_session':
        if (message.sessionId) {
          this.unsubscribeClientFromSession(ws, message.sessionId);
        }
        break;
      
      case 'get_hardware_status':
        this.sendToClient(ws, {
          type: 'hardware_status',
          timestamp: new Date(),
          data: this.getHardwareEventStats()
        });
        break;
      
      default:
        console.log('📨 Received unknown message type:', message.type);
    }
  }

  /**
   * Subscribe client to session updates
   */
  private subscribeClientToSession(ws: WebSocket, sessionId: string): void {
    // Remove client from previous session if any
    const previousSession = this.clientSessions.get(ws);
    if (previousSession) {
      this.unsubscribeClientFromSession(ws, previousSession);
    }

    // Add to new session
    if (!this.sessionClients.has(sessionId)) {
      this.sessionClients.set(sessionId, new Set());
    }
    
    this.sessionClients.get(sessionId)!.add(ws);
    this.clientSessions.set(ws, sessionId);
    
    console.log(`🔗 Client subscribed to session ${sessionId}`);
    
    // Send confirmation
    this.sendToClient(ws, {
      type: 'session_subscribed',
      timestamp: new Date(),
      data: { sessionId, success: true }
    });
  }

  /**
   * Unsubscribe client from session updates
   */
  private unsubscribeClientFromSession(ws: WebSocket, sessionId: string): void {
    const sessionClients = this.sessionClients.get(sessionId);
    if (sessionClients) {
      sessionClients.delete(ws);
      if (sessionClients.size === 0) {
        this.sessionClients.delete(sessionId);
      }
    }
    
    this.clientSessions.delete(ws);
    console.log(`🔗 Client unsubscribed from session ${sessionId}`);
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

  // ============================================================================
  // HARDWARE WIZARD WEBSOCKET METHODS
  // ============================================================================

  /**
   * Broadcast hardware detection progress update
   */
  public broadcastHardwareDetection(update: HardwareDetectionUpdate): void {
    this.updateLastHardwareEvent();
    
    const message: WebSocketMessage = {
      type: 'hardware_detection',
      timestamp: new Date(),
      data: update
    };

    console.log(`🔍 WebSocket broadcasting hardware detection:`, {
      sessionId: update.sessionId,
      phase: update.phase,
      progress: update.progress,
      currentOperation: update.currentOperation,
      detectedDevices: update.detectedDevices?.length || 0,
      connectedClients: this.clients.size
    });

    // Send to session-specific clients if available, otherwise broadcast to all
    if (this.hasActiveSession(update.sessionId)) {
      this.sendToSession(update.sessionId, message);
    } else {
      this.broadcast(message);
    }
  }

  /**
   * Broadcast hardware testing progress update
   */
  public broadcastHardwareTesting(update: HardwareTestingUpdate): void {
    this.updateLastHardwareEvent();
    
    const message: WebSocketMessage = {
      type: 'hardware_testing',
      timestamp: new Date(),
      data: update
    };

    console.log(`🧪 WebSocket broadcasting hardware testing:`, {
      sessionId: update.sessionId,
      deviceAddress: update.deviceAddress,
      testType: update.testType,
      testName: update.testName,
      status: update.status,
      progress: update.progress,
      connectedClients: this.clients.size
    });

    // Send to session-specific clients if available, otherwise broadcast to all
    if (this.hasActiveSession(update.sessionId)) {
      this.sendToSession(update.sessionId, message);
    } else {
      this.broadcast(message);
    }
  }

  /**
   * Broadcast hardware configuration progress update
   */
  public broadcastHardwareConfiguration(update: HardwareConfigurationUpdate): void {
    this.updateLastHardwareEvent();
    
    const message: WebSocketMessage = {
      type: 'hardware_configuration',
      timestamp: new Date(),
      data: update
    };

    console.log(`⚙️ WebSocket broadcasting hardware configuration:`, {
      sessionId: update.sessionId,
      operation: update.operation,
      deviceAddress: update.deviceAddress,
      newAddress: update.newAddress,
      status: update.status,
      progress: update.progress,
      connectedClients: this.clients.size
    });

    // Send to session-specific clients if available, otherwise broadcast to all
    if (this.hasActiveSession(update.sessionId)) {
      this.sendToSession(update.sessionId, message);
    } else {
      this.broadcast(message);
    }
  }

  /**
   * Broadcast wizard progress update
   */
  public broadcastWizardProgress(update: WizardProgressUpdate): void {
    this.updateLastHardwareEvent();
    
    const message: WebSocketMessage = {
      type: 'wizard_progress',
      timestamp: new Date(),
      data: update
    };

    console.log(`🧙 WebSocket broadcasting wizard progress:`, {
      sessionId: update.sessionId,
      currentStep: update.currentStep,
      stepName: update.stepName,
      stepStatus: update.stepStatus,
      overallProgress: update.overallProgress,
      canProceed: update.canProceed,
      connectedClients: this.clients.size
    });

    // Send to session-specific clients if available, otherwise broadcast to all
    if (this.hasActiveSession(update.sessionId)) {
      this.sendToSession(update.sessionId, message);
    } else {
      this.broadcast(message);
    }
  }

  /**
   * Broadcast hardware error update
   */
  public broadcastHardwareError(update: HardwareErrorUpdate): void {
    this.updateLastHardwareEvent();
    
    const message: WebSocketMessage = {
      type: 'hardware_error',
      timestamp: new Date(),
      data: update
    };

    console.log(`🚨 WebSocket broadcasting hardware error:`, {
      sessionId: update.sessionId,
      errorType: update.errorType,
      severity: update.severity,
      message: update.message,
      recoverable: update.recoverable,
      connectedClients: this.clients.size
    });

    // Send to session-specific clients if available, otherwise broadcast to all
    if (update.sessionId && this.hasActiveSession(update.sessionId)) {
      this.sendToSession(update.sessionId, message);
    } else {
      this.broadcast(message);
    }
  }

  /**
   * Broadcast hardware recovery update
   */
  public broadcastHardwareRecovery(update: HardwareRecoveryUpdate): void {
    this.updateLastHardwareEvent();
    
    const message: WebSocketMessage = {
      type: 'hardware_recovery',
      timestamp: new Date(),
      data: update
    };

    console.log(`🔧 WebSocket broadcasting hardware recovery:`, {
      sessionId: update.sessionId,
      recoveryAction: update.recoveryAction,
      status: update.status,
      message: update.message,
      connectedClients: this.clients.size
    });

    // Send to session-specific clients if available, otherwise broadcast to all
    if (update.sessionId && this.hasActiveSession(update.sessionId)) {
      this.sendToSession(update.sessionId, message);
    } else {
      this.broadcast(message);
    }
  }

  /**
   * Send hardware update to specific session clients
   */
  public sendToSession(sessionId: string, message: WebSocketMessage): void {
    const sessionClients = this.sessionClients.get(sessionId);
    if (!sessionClients || sessionClients.size === 0) {
      console.log(`📤 No clients subscribed to session ${sessionId}`);
      return;
    }

    const messageStr = JSON.stringify(message);
    let sentCount = 0;
    const failedClients: WebSocket[] = [];
    
    sessionClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
          sentCount++;
        } catch (error) {
          console.error('🚨 Error sending WebSocket message to session client:', error);
          failedClients.push(client);
        }
      } else {
        failedClients.push(client);
      }
    });

    // Clean up failed clients
    failedClients.forEach(client => {
      this.cleanupClient(client);
    });

    console.log(`📤 Sent message to session ${sessionId}: ${sentCount} clients`);
    this.updateConnectionStatus();
  }

  /**
   * Clean up client connections and session subscriptions
   */
  private cleanupClient(ws: WebSocket): void {
    // Remove from main clients set
    this.clients.delete(ws);
    
    // Remove from session subscriptions
    const sessionId = this.clientSessions.get(ws);
    if (sessionId) {
      this.unsubscribeClientFromSession(ws, sessionId);
    }
    
    // Clean up reconnection tracking
    this.reconnectionAttempts.delete(ws);
    
    this.updateConnectionStatus();
  }

  /**
   * Handle client reconnection logic
   */
  private handleReconnection(ws: WebSocket): void {
    const attempts = this.reconnectionAttempts.get(ws) || 0;
    
    if (attempts < this.maxReconnectionAttempts) {
      this.reconnectionAttempts.set(ws, attempts + 1);
      
      const delay = this.reconnectionDelay * Math.pow(2, attempts); // Exponential backoff
      
      setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.CLOSED) {
          console.log(`🔄 Attempting reconnection ${attempts + 1}/${this.maxReconnectionAttempts} for client`);
          
          // Send reconnection status to client if still connected
          if (ws.readyState === WebSocket.OPEN) {
            this.sendToClient(ws, {
              type: 'connection_status',
              timestamp: new Date(),
              data: {
                status: 'reconnecting',
                lastUpdate: new Date(),
                connectedClients: this.clients.size,
                reconnectionAttempt: attempts + 1,
                maxAttempts: this.maxReconnectionAttempts
              }
            });
          }
        }
      }, delay);
    } else {
      console.log(`❌ Max reconnection attempts reached for client`);
      this.cleanupClient(ws);
    }
  }

  /**
   * Get hardware event statistics
   */
  public getHardwareEventStats(): {
    totalClients: number;
    activeConnections: number;
    activeSessions: number;
    lastHardwareEvent?: Date;
  } {
    return {
      totalClients: this.clients.size,
      activeConnections: Array.from(this.clients).filter(
        client => client.readyState === WebSocket.OPEN
      ).length,
      activeSessions: this.sessionClients.size,
      lastHardwareEvent: this.lastHardwareEvent || undefined
    };
  }

  /**
   * Update last hardware event timestamp
   */
  private updateLastHardwareEvent(): void {
    this.lastHardwareEvent = new Date();
  }

  /**
   * Get clients subscribed to a specific session
   */
  public getSessionClientCount(sessionId: string): number {
    const sessionClients = this.sessionClients.get(sessionId);
    return sessionClients ? sessionClients.size : 0;
  }

  /**
   * Get all active session IDs
   */
  public getActiveSessions(): string[] {
    return Array.from(this.sessionClients.keys());
  }

  /**
   * Check if a session has active clients
   */
  public hasActiveSession(sessionId: string): boolean {
    const sessionClients = this.sessionClients.get(sessionId);
    return sessionClients ? sessionClients.size > 0 : false;
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
      
      // Clear all data structures
      this.clients.clear();
      this.sessionClients.clear();
      this.clientSessions.clear();
      this.reconnectionAttempts.clear();
      
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