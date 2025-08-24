import { WebSocketManager } from '../services/websocket-manager.js';

/**
 * Utility functions for emitting WebSocket events throughout the application
 */
export class WebSocketEvents {
  constructor(private websocketManager: WebSocketManager) {}

  /**
   * Emit locker state change event
   */
  async emitLockerStateChanged(
    lockerId: string, 
    oldState: 'closed' | 'open' | 'reserved' | 'maintenance' | 'error', 
    newState: 'closed' | 'open' | 'reserved' | 'maintenance' | 'error', 
    kioskId: string,
    options: { userId?: string; reason?: string; metadata?: Record<string, any> } = {}
  ): Promise<void> {
    await this.websocketManager.emitLockerStateChanged(lockerId, oldState, newState, kioskId, options);
  }

  /**
   * Emit help request event
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
    await this.websocketManager.emitHelpRequested(helpRequest, priority);
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
    await this.websocketManager.emitHelpStatusUpdated(id, oldStatus, newStatus, options);
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
    await this.websocketManager.emitCommandApplied(command, result);
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
    await this.websocketManager.emitSystemStatus(component, status, healthScore, options);
  }

  /**
   * Emit custom event to specific namespace (legacy support)
   */
  async emitCustomEvent(namespace: string, event: string, data: any): Promise<void> {
    await this.websocketManager.broadcast(namespace, event, data);
  }

  /**
   * Emit custom event to specific room in namespace (legacy support)
   */
  async emitCustomEventToRoom(namespace: string, room: string, event: string, data: any): Promise<void> {
    await this.websocketManager.broadcastToRoom(namespace, room, event, data);
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    total: number;
    lockers: number;
    help: number;
    events: number;
    latency: {
      median: number;
      p95: number;
      p99: number;
    };
  } {
    const metrics = this.websocketManager.getLatencyMetrics();
    
    return {
      total: this.websocketManager.getConnectionCount(),
      lockers: this.websocketManager.getConnectionCount('/ws/lockers'),
      help: this.websocketManager.getConnectionCount('/ws/help'),
      events: this.websocketManager.getConnectionCount('/ws/events'),
      latency: {
        median: metrics.median,
        p95: metrics.p95,
        p99: metrics.p99
      }
    };
  }

  /**
   * Get event persistence statistics
   */
  getEventStatistics() {
    return this.websocketManager.getEventStatistics();
  }
}