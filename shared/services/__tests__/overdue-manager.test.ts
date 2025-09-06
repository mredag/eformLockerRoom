/**
 * Unit tests for OverdueManager
 * Tests overdue locker marking, retrieval logic, and suspected occupied reporting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OverdueManager } from '../overdue-manager';
import { DatabaseConnection } from '../../database/connection';
import { ConfigurationManager } from '../configuration-manager';

// Mock dependencies
vi.mock('../../database/connection');
vi.mock('../configuration-manager');

describe('OverdueManager', () => {
  let overdueManager: OverdueManager;
  let mockDb: vi.Mocked<DatabaseConnection>;
  let mockConfig: vi.Mocked<ConfigurationManager>;

  beforeEach(() => {
    mockDb = {
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
    } as any;

    mockConfig = {
      getEffectiveConfig: vi.fn(),
    } as any;

    overdueManager = new OverdueManager(mockDb, mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('markLockerOverdue', () => {
    it('should mark locker as overdue with time_limit reason', async () => {
      mockDb.run.mockResolvedValue(undefined);

      await overdueManager.markLockerOverdue('kiosk-1', 5, 'card123', 'time_limit');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lockers SET overdue_from = ?, overdue_reason = ?'),
        expect.arrayContaining([expect.any(String), 'time_limit', 'kiosk-1', 5])
      );
    });

    it('should mark locker as overdue with user_report reason', async () => {
      mockDb.run.mockResolvedValue(undefined);

      await overdueManager.markLockerOverdue('kiosk-1', 8, 'card456', 'user_report');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lockers SET overdue_from = ?, overdue_reason = ?'),
        expect.arrayContaining([expect.any(String), 'user_report', 'kiosk-1', 8])
      );
    });

    it('should emit locker_overdue event', async () => {
      mockDb.run.mockResolvedValue(undefined);
      const eventSpy = vi.fn();
      overdueManager.on('locker_overdue', eventSpy);

      await overdueManager.markLockerOverdue('kiosk-1', 5, 'card123', 'time_limit');

      expect(eventSpy).toHaveBeenCalledWith({
        kioskId: 'kiosk-1',
        lockerId: 5,
        cardId: 'card123',
        reason: 'time_limit',
        overdueFrom: expect.any(Date)
      });
    });
  });

  describe('canRetrieveOverdue', () => {
    it('should allow retrieval for overdue owner who has not retrieved yet', async () => {
      mockDb.get.mockResolvedValue({
        kiosk_id: 'kiosk-1',
        id: 5,
        owner_key: 'card123',
        overdue_from: new Date().toISOString(),
        cleared_by: null
      });

      const result = await overdueManager.canRetrieveOverdue('kiosk-1', 5, 'card123');

      expect(result.allowed).toBe(true);
    });

    it('should deny retrieval if already retrieved once', async () => {
      mockDb.get.mockResolvedValue({
        kiosk_id: 'kiosk-1',
        id: 5,
        owner_key: 'card123',
        overdue_from: new Date().toISOString(),
        cleared_by: 'card123'
      });

      const result = await overdueManager.canRetrieveOverdue('kiosk-1', 5, 'card123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Already retrieved once');
    });

    it('should deny retrieval if not overdue owner', async () => {
      mockDb.get.mockResolvedValue(null);

      const result = await overdueManager.canRetrieveOverdue('kiosk-1', 5, 'card123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Not overdue owner or locker not found');
    });
  });

  describe('processOverdueRetrieval', () => {
    it('should clear overdue status and apply quarantine', async () => {
      mockDb.run.mockResolvedValue(undefined);

      await overdueManager.processOverdueRetrieval('kiosk-1', 5, 'card123');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lockers SET overdue_from = NULL'),
        expect.arrayContaining(['card123', expect.any(String), 'kiosk-1', 5])
      );
    });

    it('should emit overdue_retrieved event', async () => {
      mockDb.run.mockResolvedValue(undefined);
      const eventSpy = vi.fn();
      overdueManager.on('overdue_retrieved', eventSpy);

      await overdueManager.processOverdueRetrieval('kiosk-1', 5, 'card123');

      expect(eventSpy).toHaveBeenCalledWith({
        kioskId: 'kiosk-1',
        lockerId: 5,
        cardId: 'card123',
        retrievedAt: expect.any(Date),
        quarantineUntil: expect.any(Date)
      });
    });
  });

  describe('reportSuspectedOccupied', () => {
    it('should accept report when under daily limit', async () => {
      mockDb.get.mockResolvedValueOnce({ count: 1 }); // getUserReportsToday
      mockDb.get.mockResolvedValueOnce({ kiosk_id: 'kiosk-1', id: 5 }); // locker exists
      mockDb.run.mockResolvedValue(undefined);

      const result = await overdueManager.reportSuspectedOccupied('kiosk-1', 5, 'card123');

      expect(result.accepted).toBe(true);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lockers SET suspected_occupied = 1'),
        ['kiosk-1', 5]
      );
    });

    it('should reject report when daily limit reached', async () => {
      mockDb.get.mockResolvedValue({ count: 2 }); // At daily limit

      const result = await overdueManager.reportSuspectedOccupied('kiosk-1', 5, 'card123');

      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('Daily report limit reached');
    });

    it('should emit suspected_occupied_reported event', async () => {
      mockDb.get.mockResolvedValueOnce({ count: 0 }); // Under limit
      mockDb.get.mockResolvedValueOnce({ kiosk_id: 'kiosk-1', id: 5 }); // locker exists
      mockDb.run.mockResolvedValue(undefined);
      const eventSpy = vi.fn();
      overdueManager.on('suspected_occupied_reported', eventSpy);

      await overdueManager.reportSuspectedOccupied('kiosk-1', 5, 'card123');

      expect(eventSpy).toHaveBeenCalledWith({
        kioskId: 'kiosk-1',
        lockerId: 5,
        cardId: 'card123',
        reportedAt: expect.any(Date)
      });
    });
  });

  describe('getUserReportsToday', () => {
    it('should return correct count of reports today', async () => {
      mockDb.get.mockResolvedValue({ count: 1 });

      const count = await overdueManager.getUserReportsToday('card123');

      expect(count).toBe(1);
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) as count FROM user_reports'),
        expect.arrayContaining(['card123', expect.any(String), expect.any(String)])
      );
    });

    it('should return 0 when no reports found', async () => {
      mockDb.get.mockResolvedValue(null);

      const count = await overdueManager.getUserReportsToday('card123');

      expect(count).toBe(0);
    });
  });

  describe('shouldExcludeFromAssignment', () => {
    it('should exclude overdue lockers', async () => {
      mockDb.get.mockResolvedValue({
        overdue_from: new Date().toISOString(),
        suspected_occupied: 0
      });

      const result = await overdueManager.shouldExcludeFromAssignment('kiosk-1', 5);

      expect(result.exclude).toBe(true);
      expect(result.reason).toBe('Locker is overdue');
    });

    it('should exclude suspected occupied lockers', async () => {
      mockDb.get.mockResolvedValue({
        overdue_from: null,
        suspected_occupied: 1
      });

      const result = await overdueManager.shouldExcludeFromAssignment('kiosk-1', 5);

      expect(result.exclude).toBe(true);
      expect(result.reason).toBe('Locker is suspected occupied');
    });

    it('should not exclude normal lockers', async () => {
      mockDb.get.mockResolvedValue({
        overdue_from: null,
        suspected_occupied: 0
      });

      const result = await overdueManager.shouldExcludeFromAssignment('kiosk-1', 5);

      expect(result.exclude).toBe(false);
    });
  });

  describe('getOverdueLockers', () => {
    it('should return list of overdue lockers', async () => {
      const mockRows = [
        {
          kiosk_id: 'kiosk-1',
          locker_id: 5,
          card_id: 'card123',
          overdue_from: new Date().toISOString(),
          overdue_reason: 'time_limit',
          cleared_by: null
        }
      ];
      mockDb.all.mockResolvedValue(mockRows);

      const result = await overdueManager.getOverdueLockers();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kioskId: 'kiosk-1',
        lockerId: 5,
        cardId: 'card123',
        reason: 'time_limit',
        retrievalAllowed: true
      });
    });

    it('should filter by kiosk when provided', async () => {
      mockDb.all.mockResolvedValue([]);

      await overdueManager.getOverdueLockers('kiosk-1');

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('AND kiosk_id = ?'),
        ['kiosk-1']
      );
    });
  });

  describe('clearSuspectedOccupied', () => {
    it('should clear suspected flag and record admin action', async () => {
      mockDb.run.mockResolvedValue(undefined);

      await overdueManager.clearSuspectedOccupied('kiosk-1', 5, 'admin');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lockers SET suspected_occupied = 0'),
        ['admin', 'kiosk-1', 5]
      );
    });

    it('should emit suspected_cleared event', async () => {
      mockDb.run.mockResolvedValue(undefined);
      const eventSpy = vi.fn();
      overdueManager.on('suspected_cleared', eventSpy);

      await overdueManager.clearSuspectedOccupied('kiosk-1', 5, 'admin');

      expect(eventSpy).toHaveBeenCalledWith({
        kioskId: 'kiosk-1',
        lockerId: 5,
        adminUser: 'admin',
        clearedAt: expect.any(Date)
      });
    });
  });

  describe('forceCloseOverdue', () => {
    it('should force clear overdue locker and apply quarantine', async () => {
      mockDb.run.mockResolvedValue(undefined);

      await overdueManager.forceCloseOverdue('kiosk-1', 5, 'admin');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE lockers SET overdue_from = NULL'),
        ['admin', 'kiosk-1', 5]
      );
    });

    it('should emit overdue_force_cleared event', async () => {
      mockDb.run.mockResolvedValue(undefined);
      const eventSpy = vi.fn();
      overdueManager.on('overdue_force_cleared', eventSpy);

      await overdueManager.forceCloseOverdue('kiosk-1', 5, 'admin');

      expect(eventSpy).toHaveBeenCalledWith({
        kioskId: 'kiosk-1',
        lockerId: 5,
        adminUser: 'admin',
        clearedAt: expect.any(Date)
      });
    });
  });
});