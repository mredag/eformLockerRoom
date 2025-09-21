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

    mockDb.get.mockReset().mockResolvedValue(undefined);
    mockDb.all.mockReset().mockResolvedValue([]);
    mockDb.run.mockReset().mockResolvedValue({ changes: 0 });

    // Create state manager with mock database
    stateManager = new LockerStateManager(mockDb, { autoReleaseHoursOverride: null });
  });

  afterEach(async () => {
    await stateManager.shutdown();
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
      const createdAt = new Date('2025-01-01T00:00:00Z');
      const reservedAt = new Date('2025-01-01T01:00:00Z');
      const updatedAt = new Date('2025-01-01T02:00:00Z');

      mockDb.get
        .mockResolvedValueOnce({
          id: 1,
          kiosk_id: 'kiosk-1',
          status: 'Free',
          version: 1,
          is_vip: false,
          created_at: createdAt,
          updated_at: createdAt
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          id: 1,
          kiosk_id: 'kiosk-1',
          status: 'Owned',
          version: 2,
          is_vip: false,
          owner_type: 'rfid',
          owner_key: 'card123',
          reserved_at: reservedAt,
          created_at: createdAt,
          updated_at: updatedAt
        });

      mockDb.run.mockResolvedValue({ changes: 1 });

      await stateManager.assignLocker('kiosk-1', 1, 'rfid', 'card123');

      expect(webSocketService.broadcastStateUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          kioskId: 'kiosk-1',
          lockerId: 1,
          displayName: 'Dolap 1',
          state: 'Owned',
          ownerKey: 'card123',
          ownerType: 'rfid',
          reservedAt: reservedAt.toISOString(),
          ownedAt: null,
          isVip: false,
          lastChanged: expect.anything()
        })
      );
    });
  });

  describe('Enhanced locker data', () => {
    it('should get enhanced locker with display name', async () => {
      const createdAt = new Date('2025-01-01T00:00:00Z');
      const updatedAt = new Date('2025-01-01T00:30:00Z');

      mockDb.get.mockResolvedValue({
        id: 1,
        kiosk_id: 'kiosk-1',
        status: 'Free',
        version: 1,
        is_vip: false,
        reserved_at: null,
        owned_at: null,
        owner_type: null,
        owner_key: null,
        created_at: createdAt,
        updated_at: updatedAt
      });

      const enhancedLocker = await stateManager.getEnhancedLocker('kiosk-1', 1);

      expect(enhancedLocker).toEqual(
        expect.objectContaining({
          id: 1,
          kiosk_id: 'kiosk-1',
          status: 'Free',
          version: 1,
          displayName: 'Dolap 1',
          is_vip: false,
          reserved_at: null,
          owned_at: null,
          owner_type: null,
          owner_key: null
        })
      );
      expect(enhancedLocker?.created_at).toBeInstanceOf(Date);
      expect(enhancedLocker?.updated_at).toBeInstanceOf(Date);

      expect(mockNamingService.getDisplayName).toHaveBeenCalledWith('kiosk-1', 1);
    });

    it('should get enhanced kiosk lockers with display names', async () => {
      mockDb.all.mockResolvedValue([
        {
          id: 1,
          kiosk_id: 'kiosk-1',
          status: 'Free',
          version: 1,
          is_vip: false,
          reserved_at: null,
          owned_at: null,
          owner_type: null,
          owner_key: null,
          created_at: new Date('2025-01-01T00:00:00Z'),
          updated_at: new Date('2025-01-01T00:10:00Z')
        },
        {
          id: 2,
          kiosk_id: 'kiosk-1',
          status: 'Owned',
          version: 1,
          is_vip: false,
          reserved_at: new Date('2025-01-01T00:05:00Z'),
          owned_at: null,
          owner_type: 'rfid',
          owner_key: 'card-1',
          created_at: new Date('2025-01-01T00:00:00Z'),
          updated_at: new Date('2025-01-01T00:12:00Z')
        }
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
        version: 1,
        is_vip: false,
        reserved_at: null,
        owned_at: null,
        owner_type: null,
        owner_key: null,
        created_at: new Date('2025-01-01T00:00:00Z'),
        updated_at: new Date('2025-01-01T00:05:00Z')
      });
      
      mockDb.run.mockResolvedValue({ changes: 1 });

      const result = await stateManager.setLockerError('kiosk-1', 1, 'Hardware failure');
      
      expect(result).toBe(true);
      expect(webSocketService.broadcastStateUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          kioskId: 'kiosk-1',
          lockerId: 1,
          displayName: 'Dolap 1',
          state: 'Error',
          isVip: false,
          reservedAt: null,
          ownedAt: null,
          ownerKey: undefined,
          ownerType: undefined,
          lastChanged: expect.anything()
        })
      );
    });

    it('should resolve locker error', async () => {
      mockDb.get.mockResolvedValue({
        id: 1,
        kiosk_id: 'kiosk-1',
        status: 'Error',
        version: 1,
        is_vip: false,
        reserved_at: null,
        owned_at: null,
        owner_type: null,
        owner_key: null,
        created_at: new Date('2025-01-01T00:00:00Z'),
        updated_at: new Date('2025-01-01T00:05:00Z')
      });
      
      mockDb.run.mockResolvedValue({ changes: 1 });

      const result = await stateManager.resolveLockerError('kiosk-1', 1, 'staff-user');
      
      expect(result).toBe(true);
      expect(webSocketService.broadcastStateUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          kioskId: 'kiosk-1',
          lockerId: 1,
          displayName: 'Dolap 1',
          state: 'Free',
          isVip: false,
          reservedAt: null,
          ownedAt: null,
          ownerKey: undefined,
          ownerType: undefined,
          lastChanged: expect.anything()
        })
      );
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