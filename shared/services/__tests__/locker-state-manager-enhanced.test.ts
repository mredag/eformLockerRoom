import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LockerStateManager } from '../locker-state-manager';
import { LockerNamingService } from '../locker-naming-service';
import { webSocketService } from '../websocket-service';

// Mock dependencies
vi.mock('../websocket-service', () => ({
  webSocketService: {
    broadcastStateUpdate: vi.fn(),
    initialize: vi.fn(),
    shutdown: vi.fn(),
    getConnectionStatus: vi.fn(() => ({
      status: 'online',
      connectedClients: 1,
      lastUpdate: new Date()
    }))
  }
}));

vi.mock('../locker-naming-service');

// Mock database
const mockDb = {
  get: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
  close: vi.fn()
};

describe('LockerStateManager - Enhanced Features', () => {
  let stateManager: LockerStateManager;
  let mockNamingService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock LockerNamingService
    mockNamingService = {
      getDisplayName: vi.fn().mockResolvedValue('Dolap 1')
    };
    vi.mocked(LockerNamingService).mockImplementation(() => mockNamingService);

    // Create state manager with mock database
    stateManager = new LockerStateManager({
      getConnection: () => ({
        getDatabase: () => mockDb
      })
    });
  });

  afterEach(() => {
    stateManager.shutdown();
  });

  describe('Turkish state names', () => {
    it('should use Turkish state names in transitions', () => {
      const transitions = stateManager.getValidTransitions();
      
      // Check that Turkish states are used
      const turkishStates = ['Free', 'Owned', 'Opening', 'Error', 'Blocked'];
      const transitionStates = transitions.flatMap(t => [t.from, t.to]);
      
      turkishStates.forEach(state => {
        expect(transitionStates).toContain(state);
      });
    });

    it('should get possible next states for Boş', () => {
      const nextStates = stateManager.getPossibleNextStates('Free');
      expect(nextStates).toContain('Owned');
      expect(nextStates).toContain('Blocked');
      expect(nextStates).toContain('Error');
    });

    it('should get possible next states for Dolu', () => {
      const nextStates = stateManager.getPossibleNextStates('Owned');
      expect(nextStates).toContain('Opening');
      expect(nextStates).toContain('Free');
      expect(nextStates).toContain('Blocked');
      expect(nextStates).toContain('Error');
    });
  });

  describe('WebSocket integration', () => {
    it('should initialize WebSocket service', () => {
      stateManager.initializeWebSocket(8080);
      expect(webSocketService.initialize).toHaveBeenCalledWith(8080);
    });

    it('should get WebSocket status', () => {
      const status = stateManager.getWebSocketStatus();
      expect(status.connected).toBe(true);
      expect(status.clientCount).toBe(1);
    });

    it('should broadcast state update on locker assignment', async () => {
      // Mock database responses
      mockDb.get.mockResolvedValue({
        id: 1,
        kiosk_id: 'kiosk-1',
        status: 'Free',
        version: 1,
        is_vip: false
      });
      
      mockDb.run.mockResolvedValue({ changes: 1 });

      await stateManager.assignLocker('kiosk-1', 1, 'rfid', 'card123');

      expect(webSocketService.broadcastStateUpdate).toHaveBeenCalledWith({
        kioskId: 'kiosk-1',
        lockerId: 1,
        displayName: 'Dolap 1',
        state: 'Owned',
        lastChanged: expect.any(Date),
        ownerKey: 'card123',
        ownerType: 'rfid'
      });
    });
  });

  describe('Enhanced locker data', () => {
    it('should get enhanced locker with display name', async () => {
      mockDb.get.mockResolvedValue({
        id: 1,
        kiosk_id: 'kiosk-1',
        status: 'Free',
        version: 1
      });

      const enhancedLocker = await stateManager.getEnhancedLocker('kiosk-1', 1);
      
      expect(enhancedLocker).toEqual({
        id: 1,
        kiosk_id: 'kiosk-1',
        status: 'Free',
        version: 1,
        displayName: 'Dolap 1'
      });
      
      expect(mockNamingService.getDisplayName).toHaveBeenCalledWith('kiosk-1', 1);
    });

    it('should get enhanced kiosk lockers with display names', async () => {
      mockDb.all.mockResolvedValue([
        { id: 1, kiosk_id: 'kiosk-1', status: 'Free', version: 1 },
        { id: 2, kiosk_id: 'kiosk-1', status: 'Owned', version: 1 }
      ]);

      mockNamingService.getDisplayName
        .mockResolvedValueOnce('Dolap 1')
        .mockResolvedValueOnce('Dolap 2');

      const enhancedLockers = await stateManager.getEnhancedKioskLockers('kiosk-1');
      
      expect(enhancedLockers).toHaveLength(2);
      expect(enhancedLockers[0].displayName).toBe('Dolap 1');
      expect(enhancedLockers[1].displayName).toBe('Dolap 2');
    });
  });

  describe('Error state management', () => {
    it('should set locker to error state', async () => {
      mockDb.get.mockResolvedValue({
        id: 1,
        kiosk_id: 'kiosk-1',
        status: 'Free',
        version: 1
      });
      
      mockDb.run.mockResolvedValue({ changes: 1 });

      const result = await stateManager.setLockerError('kiosk-1', 1, 'Hardware failure');
      
      expect(result).toBe(true);
      expect(webSocketService.broadcastStateUpdate).toHaveBeenCalledWith({
        kioskId: 'kiosk-1',
        lockerId: 1,
        displayName: 'Dolap 1',
        state: 'Error',
        lastChanged: expect.any(Date)
      });
    });

    it('should resolve locker error', async () => {
      mockDb.get.mockResolvedValue({
        id: 1,
        kiosk_id: 'kiosk-1',
        status: 'Error',
        version: 1
      });
      
      mockDb.run.mockResolvedValue({ changes: 1 });

      const result = await stateManager.resolveLockerError('kiosk-1', 1, 'staff-user');
      
      expect(result).toBe(true);
      expect(webSocketService.broadcastStateUpdate).toHaveBeenCalledWith({
        kioskId: 'kiosk-1',
        lockerId: 1,
        displayName: 'Dolap 1',
        state: 'Free',
        lastChanged: expect.any(Date)
      });
    });
  });

  describe('Statistics with Turkish states', () => {
    it('should get kiosk stats with Turkish state names', async () => {
      mockDb.get.mockResolvedValue({
        total: 10,
        bos: 5,
        dolu: 2,
        aciliyor: 1,
        hata: 1,
        engelli: 1,
        vip: 2
      });

      const stats = await stateManager.getKioskStats('kiosk-1');
      
      expect(stats).toEqual({
        total: 10,
        bos: 5,
        dolu: 2,
        aciliyor: 1,
        hata: 1,
        engelli: 1,
        vip: 2
      });
    });
  });
});