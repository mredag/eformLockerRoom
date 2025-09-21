import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { LockerStateManager } from '../locker-state-manager';
import { LockerStatus, OwnerType } from '../../types/core-entities';

// Mock database for testing assignment and release logic
class MockDatabase {
  private lockers: Map<string, any> = new Map();
  private events: any[] = [];

  async get<T>(sql: string, params: any[]): Promise<T | undefined> {
    if (sql.includes('SELECT * FROM lockers WHERE kiosk_id = ? AND id = ?')) {
      const key = `${params[0]}:${params[1]}`;
      return this.lockers.get(key) as T;
    }
    if (sql.includes('SELECT * FROM lockers WHERE owner_key = ?')) {
      for (const locker of this.lockers.values()) {
        if (locker.owner_key === params[0] && ['Owned', 'Opening'].includes(locker.status)) {
          return locker as T;
        }
      }
    }
    return undefined;
  }

  async all<T>(sql: string, params: any[]): Promise<T[]> {
    if (sql.includes('SELECT * FROM lockers')) {
      const result: T[] = [];
      for (const [key, locker] of this.lockers.entries()) {
        if (locker.kiosk_id === params[0] && locker.status === 'Free' && !locker.is_vip) {
          result.push(locker as T);
        }
      }
      return result.sort((a: any, b: any) => a.id - b.id);
    }
    return [];
  }

  async run(sql: string, params: any[]): Promise<{ changes: number }> {
    if (sql.includes('UPDATE lockers')) {
      if (sql.includes("SET status = 'Owned'")) {
        const key = `${params[4]}:${params[5]}`;
        const locker = this.lockers.get(key);
        if (locker && locker.status === 'Free' && locker.version === params[6]) {
          locker.status = 'Owned';
          locker.owner_type = params[0];
          locker.owner_key = params[1];
          locker.reserved_at = new Date(params[2]);
          locker.version++;
          return { changes: 1 };
        }
      }
      if (sql.includes('SET status = \'Free\'')) {
        const key = `${params[1]}:${params[2]}`;
        const locker = this.lockers.get(key);
        if (locker && ['Owned', 'Opening'].includes(locker.status) && locker.version === params[3]) {
          locker.status = 'Free';
          locker.owner_type = null;
          locker.owner_key = null;
          locker.reserved_at = null;
          locker.owned_at = null;
          locker.version++;
          return { changes: 1 };
        }
      }
    }
    if (sql.includes('INSERT INTO events')) {
      this.events.push({
        kiosk_id: params[0],
        locker_id: params[1],
        event_type: params[2],
        details: params[3]
      });
    }
    return { changes: 0 };
  }

  createLocker(kioskId: string, id: number, status: LockerStatus = 'Free', isVip: boolean = false) {
    const key = `${kioskId}:${id}`;
    this.lockers.set(key, {
      kiosk_id: kioskId,
      id,
      status,
      owner_type: null,
      owner_key: null,
      reserved_at: null,
      owned_at: null,
      version: 1,
      is_vip: isVip,
      created_at: new Date(),
      updated_at: new Date()
    });
  }

  getEvents() {
    return this.events;
  }

  clear() {
    this.lockers.clear();
    this.events.length = 0;
  }
}

describe('Locker Assignment and Release Logic', () => {
  let mockDb: MockDatabase;
  let stateManager: LockerStateManager;

  beforeAll(() => {
    mockDb = new MockDatabase();
    stateManager = new LockerStateManager(mockDb, { autoReleaseHoursOverride: null });
  });

  afterAll(async () => {
    await stateManager.shutdown();
  });

  describe('assignLocker method with ownership validation', () => {
    beforeEach(() => {
      mockDb.clear();
      mockDb.createLocker('kiosk-1', 1, 'Free', false);
      mockDb.createLocker('kiosk-1', 2, 'Free', true); // VIP locker
      mockDb.createLocker('kiosk-1', 3, 'Opening', false);
    });

    it('should assign Free locker successfully', async () => {
      const result = await stateManager.assignLocker('kiosk-1', 1, 'rfid', 'card-123');
      expect(result).toBe(true);

      const locker = await stateManager.getLocker('kiosk-1', 1);
      expect(locker?.status).toBe('Owned');
      expect(locker?.owner_type).toBe('rfid');
      expect(locker?.owner_key).toBe('card-123');
    });

    it('should reject assignment to VIP locker', async () => {
      const result = await stateManager.assignLocker('kiosk-1', 2, 'rfid', 'card-123');
      expect(result).toBe(false);

      const locker = await stateManager.getLocker('kiosk-1', 2);
      expect(locker?.status).toBe('Free');
      expect(locker?.owner_key).toBeNull();
    });

    it('should reject assignment to non-Free locker', async () => {
      const result = await stateManager.assignLocker('kiosk-1', 3, 'rfid', 'card-123');
      expect(result).toBe(false);
    });

    it('should enforce one card, one locker rule', async () => {
      // First assignment should succeed
      const result1 = await stateManager.assignLocker('kiosk-1', 1, 'rfid', 'card-123');
      expect(result1).toBe(true);

      // Add another free locker
      mockDb.createLocker('kiosk-1', 4, 'Free', false);

      // Second assignment with same card should fail
      const result2 = await stateManager.assignLocker('kiosk-1', 4, 'rfid', 'card-123');
      expect(result2).toBe(false);
    });
  });

  describe('releaseLocker with immediate ownership removal', () => {
    beforeEach(() => {
      mockDb.clear();
      mockDb.createLocker('kiosk-1', 1, 'Owned', false);
      mockDb.createLocker('kiosk-1', 2, 'Opening', false);
      
      // Set up ownership
      const locker1 = (mockDb as any).lockers.get('kiosk-1:1');
      if (locker1) {
        locker1.owner_type = 'rfid';
        locker1.owner_key = 'card-123';
        locker1.reserved_at = new Date();
      }
      
      const locker2 = (mockDb as any).lockers.get('kiosk-1:2');
      if (locker2) {
        locker2.owner_type = 'rfid';
        locker2.owner_key = 'card-456';
        locker2.owned_at = new Date();
      }
    });

    it('should release Reserved locker immediately', async () => {
      const result = await stateManager.releaseLocker('kiosk-1', 1, 'card-123');
      expect(result).toBe(true);

      const locker = await stateManager.getLocker('kiosk-1', 1);
      expect(locker?.status).toBe('Free');
      expect(locker?.owner_type).toBeNull();
      expect(locker?.owner_key).toBeNull();
      expect(locker?.reserved_at).toBeNull();
    });

    it('should release Owned locker immediately', async () => {
      const result = await stateManager.releaseLocker('kiosk-1', 2, 'card-456');
      expect(result).toBe(true);

      const locker = await stateManager.getLocker('kiosk-1', 2);
      expect(locker?.status).toBe('Free');
      expect(locker?.owner_type).toBeNull();
      expect(locker?.owner_key).toBeNull();
      expect(locker?.owned_at).toBeNull();
    });

    it('should reject release with wrong owner key', async () => {
      const result = await stateManager.releaseLocker('kiosk-1', 1, 'wrong-card');
      expect(result).toBe(false);

      const locker = await stateManager.getLocker('kiosk-1', 1);
      expect(locker?.status).toBe('Owned');
      expect(locker?.owner_key).toBe('card-123');
    });
  });

  describe('getAvailableLockers filtering', () => {
    beforeEach(() => {
      mockDb.clear();
      mockDb.createLocker('kiosk-1', 1, 'Free', false);      // Available
      mockDb.createLocker('kiosk-1', 2, 'Owned', false);  // Not available
      mockDb.createLocker('kiosk-1', 3, 'Opening', false);     // Not available
      mockDb.createLocker('kiosk-1', 4, 'Blocked', false);   // Not available
      mockDb.createLocker('kiosk-1', 5, 'Free', true);       // Not available (VIP)
      mockDb.createLocker('kiosk-1', 6, 'Free', false);      // Available
    });

    it('should return only Free, non-VIP lockers', async () => {
      const available = await stateManager.getAvailableLockers('kiosk-1');
      
      expect(available).toHaveLength(2);
      expect(available.map(l => l.id)).toEqual([1, 6]);
      
      for (const locker of available) {
        expect(locker.status).toBe('Free');
        expect(locker.is_vip).toBe(false);
      }
    });

    it('should exclude Blocked and Reserved lockers', async () => {
      const available = await stateManager.getAvailableLockers('kiosk-1');
      
      const statuses = available.map(l => l.status);
      expect(statuses).not.toContain('Blocked');
      expect(statuses).not.toContain('Owned');
      expect(statuses).not.toContain('Owned');
    });
  });

  describe('Ownership validation methods', () => {
    beforeEach(() => {
      mockDb.clear();
      mockDb.createLocker('kiosk-1', 1, 'Opening', false);
      
      const locker = (mockDb as any).lockers.get('kiosk-1:1');
      if (locker) {
        locker.owner_type = 'rfid';
        locker.owner_key = 'card-123';
        locker.owned_at = new Date();
      }
    });

    it('should validate correct ownership', async () => {
      const isValid = await stateManager.validateOwnership('kiosk-1', 1, 'card-123', 'rfid');
      expect(isValid).toBe(true);
    });

    it('should reject incorrect owner key', async () => {
      const isValid = await stateManager.validateOwnership('kiosk-1', 1, 'wrong-card', 'rfid');
      expect(isValid).toBe(false);
    });

    it('should reject incorrect owner type', async () => {
      const isValid = await stateManager.validateOwnership('kiosk-1', 1, 'card-123', 'device');
      expect(isValid).toBe(false);
    });

    it('should find existing ownership', async () => {
      const existing = await stateManager.checkExistingOwnership('card-123', 'rfid');
      expect(existing).not.toBeNull();
      expect(existing?.owner_key).toBe('card-123');
    });

    it('should return null for non-existent ownership', async () => {
      const existing = await stateManager.checkExistingOwnership('card-999', 'rfid');
      expect(existing).toBeNull();
    });
  });
});
