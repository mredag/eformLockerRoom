import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketService } from '../websocket-service';
import { LockerStateUpdate } from '../../types/core-entities';

// Mock the ws module
vi.mock('ws', () => ({
  WebSocketServer: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn()
  })),
  WebSocket: {
    OPEN: 1
  }
}));

describe('WebSocketService', () => {
  let webSocketService: WebSocketService;

  beforeEach(() => {
    webSocketService = new WebSocketService();
  });

  afterEach(() => {
    webSocketService.shutdown();
  });

  describe('initialization', () => {
    it('should initialize without errors', () => {
      expect(() => {
        webSocketService.initialize(8080);
      }).not.toThrow();
    });
  });

  describe('connection status', () => {
    it('should return initial connection status', () => {
      const status = webSocketService.getConnectionStatus();
      expect(status.status).toBe('offline');
      expect(status.connectedClients).toBe(0);
    });

    it('should return connected client count', () => {
      const count = webSocketService.getConnectedClientCount();
      expect(count).toBe(0);
    });
  });

  describe('broadcasting', () => {
    it('should broadcast state update without errors', () => {
      const update: LockerStateUpdate = {
        kioskId: 'kiosk-1',
        lockerId: 1,
        displayName: 'Dolap 1',
        state: 'Boş',
        lastChanged: new Date()
      };

      expect(() => {
        webSocketService.broadcastStateUpdate(update);
      }).not.toThrow();
    });

    it('should broadcast error without errors', () => {
      expect(() => {
        webSocketService.broadcastError('Test error', { detail: 'test' });
      }).not.toThrow();
    });
  });

  describe('shutdown', () => {
    it('should shutdown without errors', () => {
      expect(() => {
        webSocketService.shutdown();
      }).not.toThrow();
    });
  });
});