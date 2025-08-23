import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LockerCoordinationService } from '../locker-coordination';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { CommandQueueManager } from '../../../../shared/services/command-queue-manager';
import { EventLogger } from '../../../../shared/services/event-logger';

// Mock dependencies
vi.mock('../../../../shared/database/database-manager.js');
vi.mock('../../../../shared/services/command-queue-manager.js');
vi.mock('../../../../shared/services/event-logger.js');

describe('LockerCoordinationService', () => {
  let service: LockerCoordinationService;
  let mockDbManager: any;
  let mockCommandQueue: any;
  let mockEventLogger: any;

  beforeEach(() => {
    mockDbManager = {
      getLockerRepository: vi.fn().mockReturnValue({
        findByKioskAndId: vi.fn(),
        findByKiosk: vi.fn(),
        updateStatus: vi.fn(),
        findOwnedByCard: vi.fn()
      }),
      getKioskHeartbeatRepository: vi.fn().mockReturnValue({
        findByKiosk: vi.fn(),
        updateLastSeen: vi.fn(),
        findOfflineKiosks: vi.fn()
      })
    };

    mockCommandQueue = {
      enqueueCommand: vi.fn(),
      getCommands: vi.fn(),
      markCommandComplete: vi.fn(),
      retryFailedCommand: vi.fn()
    };

    mockEventLogger = {
      logEvent: vi.fn()
    };

    service = new LockerCoordinationService(
      mockDbManager,
      mockCommandQueue,
      mockEventLogger
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Multi-Room Operations', () => {
    it('should coordinate bulk opening across multiple kiosks', async () => {
      const kioskIds = ['kiosk1', 'kiosk2', 'kiosk3'];
      const staffUser = 'admin';

      // Mock owned lockers in different kiosks
      mockDbManager.getLockerRepository().findByKiosk
        .mockResolvedValueOnce([
          { id: 1, status: 'Owned', owner_key: 'card123' },
          { id: 2, status: 'Owned', owner_key: 'card456' }
        ])
        .mockResolvedValueOnce([
          { id: 1, status: 'Owned', owner_key: 'card789' }
        ])
        .mockResolvedValueOnce([]);

      // Mock command queuing
      mockCommandQueue.enqueueCommand.mockResolvedValue(true);

      const result = await service.coordinateBulkOpening(kioskIds, staffUser);

      expect(result.success).toBe(true);
      expect(result.totalLockers).toBe(3);
      expect(result.commandsQueued).toBe(3);
      expect(mockCommandQueue.enqueueCommand).toHaveBeenCalledTimes(3);
      expect(mockEventLogger.logEvent).toHaveBeenCalledWith(
        'bulk_open',
        null,
        null,
        expect.objectContaining({
          staff_user: staffUser,
          kiosk_count: 3,
          total_lockers: 3
        })
      );
    });

    it('should handle offline kiosks during bulk operations', async () => {
      const kioskIds = ['kiosk1', 'kiosk2'];
      const staffUser = 'admin';

      // Mock one kiosk offline
      mockDbManager.getKioskHeartbeatRepository().findByKiosk
        .mockResolvedValueOnce({ status: 'online', last_seen: new Date() })
        .mockResolvedValueOnce({ status: 'offline', last_seen: new Date(Date.now() - 60000) });

      // Mock lockers
      mockDbManager.getLockerRepository().findByKiosk
        .mockResolvedValueOnce([{ id: 1, status: 'Owned', owner_key: 'card123' }])
        .mockResolvedValueOnce([{ id: 1, status: 'Owned', owner_key: 'card456' }]);

      mockCommandQueue.enqueueCommand.mockResolvedValue(true);

      const result = await service.coordinateBulkOpening(kioskIds, staffUser);

      expect(result.success).toBe(true);
      expect(result.offlineKiosks).toContain('kiosk2');
      expect(result.warnings).toEqual(expect.arrayContaining([
        expect.stringContaining('Some kiosks are offline')
      ]));
    });
  });

  describe('Cross-Room Locker Search', () => {
    it('should find locker owned by card across all kiosks', async () => {
      const cardId = 'card123';

      mockDbManager.getLockerRepository().findOwnedByCard.mockResolvedValue({
        id: 5,
        kiosk_id: 'kiosk2',
        status: 'Owned',
        owner_key: cardId,
        owner_type: 'rfid'
      });

      const result = await service.findLockerByCard(cardId);

      expect(result).toBeDefined();
      expect(result.kiosk_id).toBe('kiosk2');
      expect(result.id).toBe(5);
      expect(result.owner_key).toBe(cardId);
    });

    it('should return null when card has no assigned locker', async () => {
      const cardId = 'card999';

      mockDbManager.getLockerRepository().findOwnedByCard.mockResolvedValue(null);

      const result = await service.findLockerByCard(cardId);

      expect(result).toBeNull();
    });
  });

  describe('Command Synchronization', () => {
    it('should queue commands for online kiosks', async () => {
      const kioskId = 'kiosk1';
      const command = {
        type: 'open_locker',
        payload: { locker_id: 5, reason: 'staff_override' }
      };

      mockDbManager.getKioskHeartbeatRepository().findByKiosk.mockResolvedValue({
        status: 'online',
        last_seen: new Date()
      });

      mockCommandQueue.enqueueCommand.mockResolvedValue(true);

      const result = await service.queueCommand(kioskId, command);

      expect(result.success).toBe(true);
      expect(mockCommandQueue.enqueueCommand).toHaveBeenCalledWith(
        kioskId,
        expect.objectContaining(command)
      );
    });

    it('should queue commands for offline kiosks with warning', async () => {
      const kioskId = 'kiosk1';
      const command = {
        type: 'open_locker',
        payload: { locker_id: 5, reason: 'staff_override' }
      };

      mockDbManager.getKioskHeartbeatRepository().findByKiosk.mockResolvedValue({
        status: 'offline',
        last_seen: new Date(Date.now() - 60000)
      });

      mockCommandQueue.enqueueCommand.mockResolvedValue(true);

      const result = await service.queueCommand(kioskId, command);

      expect(result.success).toBe(true);
      expect(result.warning).toContain('offline');
    });

    it('should handle command queue failures', async () => {
      const kioskId = 'kiosk1';
      const command = {
        type: 'open_locker',
        payload: { locker_id: 5, reason: 'staff_override' }
      };

      mockDbManager.getKioskHeartbeatRepository().findByKiosk.mockResolvedValue({
        status: 'online',
        last_seen: new Date()
      });

      mockCommandQueue.enqueueCommand.mockResolvedValue(false);

      const result = await service.queueCommand(kioskId, command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to queue command');
    });
  });

  describe('Kiosk Health Monitoring', () => {
    it('should identify offline kiosks', async () => {
      const offlineThreshold = 30; // seconds
      const now = new Date();
      const offlineTime = new Date(now.getTime() - 45000); // 45 seconds ago

      mockDbManager.getKioskHeartbeatRepository().findOfflineKiosks.mockResolvedValue([
        {
          kiosk_id: 'kiosk1',
          last_seen: offlineTime,
          status: 'offline'
        },
        {
          kiosk_id: 'kiosk2',
          last_seen: offlineTime,
          status: 'offline'
        }
      ]);

      const offlineKiosks = await service.getOfflineKiosks(offlineThreshold);

      expect(offlineKiosks).toHaveLength(2);
      expect(offlineKiosks.map(k => k.kiosk_id)).toContain('kiosk1');
      expect(offlineKiosks.map(k => k.kiosk_id)).toContain('kiosk2');
    });

    it('should update kiosk heartbeat', async () => {
      const kioskId = 'kiosk1';
      const version = '1.0.0';
      const configHash = 'abc123';

      mockDbManager.getKioskHeartbeatRepository().updateLastSeen.mockResolvedValue(true);

      const result = await service.updateKioskHeartbeat(kioskId, version, configHash);

      expect(result).toBe(true);
      expect(mockDbManager.getKioskHeartbeatRepository().updateLastSeen).toHaveBeenCalledWith(
        kioskId,
        expect.any(Date),
        version,
        configHash
      );
    });
  });

  describe('Zone-Based Operations', () => {
    it('should filter operations by zone', async () => {
      const zone = 'gym-floor-1';
      const staffUser = 'admin';

      // Mock kiosks in zone
      const kioskIds = ['gym-kiosk-1', 'gym-kiosk-2'];
      
      mockDbManager.getLockerRepository().findByKiosk
        .mockResolvedValueOnce([{ id: 1, status: 'Owned', owner_key: 'card1' }])
        .mockResolvedValueOnce([{ id: 2, status: 'Owned', owner_key: 'card2' }]);

      mockCommandQueue.enqueueCommand.mockResolvedValue(true);

      const result = await service.coordinateBulkOpeningByZone(zone, staffUser);

      expect(result.success).toBe(true);
      expect(result.zone).toBe(zone);
      expect(result.totalLockers).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      const cardId = 'card123';

      mockDbManager.getLockerRepository().findOwnedByCard.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(service.findLockerByCard(cardId)).rejects.toThrow('Database connection failed');
    });

    it('should handle command queue errors gracefully', async () => {
      const kioskIds = ['kiosk1'];
      const staffUser = 'admin';

      mockDbManager.getKioskHeartbeatRepository().findByKiosk.mockResolvedValue({
        status: 'online',
        last_seen: new Date()
      });

      mockDbManager.getLockerRepository().findByKiosk.mockResolvedValue([
        { id: 1, status: 'Owned', owner_key: 'card123' }
      ]);

      mockCommandQueue.enqueueCommand.mockRejectedValue(new Error('Queue service unavailable'));

      const result = await service.coordinateBulkOpening(kioskIds, staffUser);

      expect(result.success).toBe(true);
      expect(result.warnings).toEqual(expect.arrayContaining([
        expect.stringContaining('Queue service unavailable')
      ]));
    });
  });

  describe('Performance Optimization', () => {
    it('should batch database operations efficiently', async () => {
      const kioskIds = ['kiosk1', 'kiosk2', 'kiosk3'];
      const staffUser = 'admin';

      // Mock multiple lockers per kiosk
      mockDbManager.getLockerRepository().findByKiosk
        .mockResolvedValueOnce(Array(50).fill(null).map((_, i) => ({
          id: i + 1,
          status: 'Owned',
          owner_key: `card${i}`
        })))
        .mockResolvedValueOnce(Array(30).fill(null).map((_, i) => ({
          id: i + 1,
          status: 'Owned',
          owner_key: `card${i + 50}`
        })))
        .mockResolvedValueOnce([]);

      mockCommandQueue.enqueueCommand.mockResolvedValue(true);

      const startTime = Date.now();
      const result = await service.coordinateBulkOpening(kioskIds, staffUser);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.totalLockers).toBe(80);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});
