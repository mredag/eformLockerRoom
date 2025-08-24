import { LockerStateManager, WebSocketEventEmitter } from '../../../../shared/services/locker-state-manager.js';
import { WebSocketManager } from './websocket-manager.js';
import { DatabaseManager } from '../../../../shared/database/database-manager.js';

/**
 * Service that integrates LockerStateManager with WebSocket events
 * This service acts as a bridge between locker state changes and real-time updates
 */
export class LockerWebSocketService implements WebSocketEventEmitter {
  private lockerStateManager: LockerStateManager;
  private webSocketManager: WebSocketManager;

  constructor(
    private dbManager: DatabaseManager,
    webSocketManager: WebSocketManager
  ) {
    this.webSocketManager = webSocketManager;
    // Initialize LockerStateManager with WebSocket event emitter
    this.lockerStateManager = new LockerStateManager(dbManager, this);
  }

  /**
   * Implementation of WebSocketEventEmitter interface
   * This method is called by LockerStateManager when locker states change
   */
  async emitLockerStateChanged(
    lockerId: string,
    oldState: 'closed' | 'open' | 'reserved' | 'maintenance' | 'error',
    newState: 'closed' | 'open' | 'reserved' | 'maintenance' | 'error',
    kioskId: string,
    options: { userId?: string; reason?: string; metadata?: Record<string, any> } = {}
  ): Promise<void> {
    try {
      // Use the WebSocketManager's emitLockerStateChanged method
      await this.webSocketManager.emitLockerStateChanged(
        lockerId,
        oldState,
        newState,
        kioskId,
        options
      );
    } catch (error) {
      console.error('Failed to emit locker state change via WebSocket:', error);
      throw error;
    }
  }

  /**
   * Get the LockerStateManager instance
   */
  getLockerStateManager(): LockerStateManager {
    return this.lockerStateManager;
  }

  /**
   * Get all lockers with optional filtering
   */
  async getAllLockers(kioskId?: string, status?: string) {
    return this.lockerStateManager.getAllLockers(kioskId, status);
  }

  /**
   * Get locker by kiosk and locker ID
   */
  async getLocker(kioskId: string, lockerId: number) {
    return this.lockerStateManager.getLocker(kioskId, lockerId);
  }

  /**
   * Get available lockers for a kiosk
   */
  async getAvailableLockers(kioskId: string) {
    return this.lockerStateManager.getAvailableLockers(kioskId);
  }

  /**
   * Get locker statistics for a kiosk
   */
  async getKioskStats(kioskId: string) {
    return this.lockerStateManager.getKioskStats(kioskId);
  }

  /**
   * Assign locker to owner (with WebSocket event emission)
   */
  async assignLocker(kioskId: string, lockerId: number, ownerType: any, ownerKey: string) {
    return this.lockerStateManager.assignLocker(kioskId, lockerId, ownerType, ownerKey);
  }

  /**
   * Release locker (with WebSocket event emission)
   */
  async releaseLocker(kioskId: string, lockerId: number, ownerKey?: string) {
    return this.lockerStateManager.releaseLocker(kioskId, lockerId, ownerKey);
  }

  /**
   * Block locker (with WebSocket event emission)
   */
  async blockLocker(kioskId: string, lockerId: number, staffUser?: string, reason?: string) {
    return this.lockerStateManager.blockLocker(kioskId, lockerId, staffUser, reason);
  }

  /**
   * Unblock locker (with WebSocket event emission)
   */
  async unblockLocker(kioskId: string, lockerId: number, staffUser?: string) {
    return this.lockerStateManager.unblockLocker(kioskId, lockerId, staffUser);
  }

  /**
   * Force state transition (with WebSocket event emission)
   */
  async forceStateTransition(
    kioskId: string,
    lockerId: number,
    newStatus: any,
    staffUser: string,
    reason: string
  ) {
    return this.lockerStateManager.forceStateTransition(kioskId, lockerId, newStatus, staffUser, reason);
  }

  /**
   * Cleanup expired reservations (with WebSocket event emission)
   */
  async cleanupExpiredReservations() {
    return this.lockerStateManager.cleanupExpiredReservations();
  }

  /**
   * Initialize lockers for a kiosk
   */
  async initializeKioskLockers(kioskId: string, lockerCount: number = 30) {
    return this.lockerStateManager.initializeKioskLockers(kioskId, lockerCount);
  }

  /**
   * Shutdown the service
   */
  async shutdown() {
    return this.lockerStateManager.shutdown();
  }
}