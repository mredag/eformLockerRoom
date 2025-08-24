import { HelpService, CreateHelpRequest, HelpRequest, UpdateHelpRequest, HelpRequestFilter } from '../../../../shared/services/help-service.js';
import { DatabaseConnection } from '../../../../shared/database/connection.js';
import { WebSocketManager } from './websocket-manager.js';

/**
 * Help service with WebSocket integration for real-time notifications
 * This service wraps the core HelpService and adds WebSocket event emission
 */
export class HelpWebSocketService {
  private helpService: HelpService;
  private webSocketManager: WebSocketManager;

  constructor(db?: DatabaseConnection, webSocketManager?: WebSocketManager) {
    this.webSocketManager = webSocketManager!;
    
    // Create event emitter function that uses WebSocket manager
    const eventEmitter = async (event: string, data: any) => {
      if (!this.webSocketManager) return;

      switch (event) {
        case 'help_requested':
          await this.webSocketManager.emitHelpRequested(data, data.priority);
          break;
        case 'help_status_updated':
          await this.webSocketManager.emitHelpStatusUpdated(
            data.id,
            data.old_status,
            data.new_status,
            {
              agentId: data.agent_id,
              resolutionNotes: data.resolution_notes
            }
          );
          break;
        default:
          console.warn(`Unknown help event type: ${event}`);
      }
    };

    this.helpService = new HelpService(db, eventEmitter);
  }

  /**
   * Create a new help request with real-time notification
   */
  async createHelpRequest(request: CreateHelpRequest): Promise<HelpRequest> {
    return this.helpService.createHelpRequest(request);
  }

  /**
   * Assign a help request to an agent with real-time notification
   */
  async assignHelpRequest(id: number, agentId: string): Promise<HelpRequest> {
    return this.helpService.assignHelpRequest(id, agentId);
  }

  /**
   * Resolve a help request with real-time notification
   */
  async resolveHelpRequest(id: number, resolutionNotes: string, agentId?: string): Promise<HelpRequest> {
    return this.helpService.resolveHelpRequest(id, resolutionNotes, agentId);
  }

  /**
   * Update a help request with real-time notification
   */
  async updateHelpRequest(id: number, updates: UpdateHelpRequest): Promise<HelpRequest> {
    return this.helpService.updateHelpRequest(id, updates);
  }

  /**
   * Get help request by ID
   */
  async getHelpRequestById(id: number): Promise<HelpRequest | null> {
    return this.helpService.getHelpRequestById(id);
  }

  /**
   * Get help requests with optional filtering
   */
  async getHelpRequests(filter?: HelpRequestFilter): Promise<HelpRequest[]> {
    return this.helpService.getHelpRequests(filter);
  }

  /**
   * Get help request history for a specific kiosk
   */
  async getHelpHistory(kioskId?: string): Promise<HelpRequest[]> {
    return this.helpService.getHelpHistory(kioskId);
  }

  /**
   * Upload photo and return URL
   */
  async uploadPhoto(photo: File | Buffer): Promise<string> {
    return this.helpService.uploadPhoto(photo);
  }

  /**
   * Get help request statistics
   */
  async getHelpRequestStatistics(): Promise<{
    total: number;
    open: number;
    assigned: number;
    resolved: number;
    by_category: Record<string, number>;
    by_priority: Record<string, number>;
    avg_resolution_time_hours?: number;
  }> {
    return this.helpService.getHelpRequestStatistics();
  }

  /**
   * Get the underlying help service instance
   */
  getHelpService(): HelpService {
    return this.helpService;
  }

  /**
   * Get the WebSocket manager instance
   */
  getWebSocketManager(): WebSocketManager {
    return this.webSocketManager;
  }
}