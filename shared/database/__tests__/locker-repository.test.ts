import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../connection.js';
import { LockerRepository } from '../locker-repository.js';
import { OptimisticLockError } from '../base-repository.js';
import { Locker, LockerStatus } from '../../../src/types/core-entities.js';

describe('LockerRepository', () => {
  let db: DatabaseConnection;
  let repository: LockerRepository;

  beforeEach(async () => {
    // Use in-memory database for testing
    DatabaseConnection.resetInstance();
    db = DatabaseConnection.getInstance(':memory:');
    await db.waitForInitialization();
    
    // Create table
    await db.exec(`
      CREATE TABLE lockers (
        kiosk_id TEXT NOT NULL,
        id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Free',
        owner_type TEXT,
        owner_key TEXT,
        reserved_at DATETIME,
        owned_at DATETIME,
        version INTEGER NOT NULL DEFAULT 1,
        is_vip BOOLEAN NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (kiosk_id, id)
      )
    `);

    repository = new LockerRepository(db);
  });

  afterEach(() => {
    DatabaseConnection.resetInstance();
  });

  describe('create', () => {
    it('should create a new locker', async () => {
      const lockerData = {
        kiosk_id: 'kiosk-1',
        id: 1,
        status: 'Free' as LockerStatus,
        is_vip: false
      };

      const locker = await repository.create(lockerData);

      expect(locker).toMatchObject({
        kiosk_id: 'kiosk-1',
        id: 1,
        status: 'Free',
        version: 1,
        is_vip: false
      });
      expect(locker.created_at).toBeInstanceOf(Date);
      expect(locker.updated_at).toBeInstanceOf(Date);
    });

    it('should create a VIP locker', async () => {
      const lockerData = {
        kiosk_id: 'kiosk-1',
        id: 1,
        status: 'Owned' as LockerStatus,
        owner_type: 'vip' as const,
        owner_key: 'card-123',
        is_vip: true,
        owned_at: new Date()
      };

      const locker = await repository.create(lockerData);

      expect(locker.is_vip).toBe(true);
      expect(locker.owner_type).toBe('vip');
      expect(locker.owner_key).toBe('card-123');
    });
  });

  describe('findByKioskAndId', () => {
    it('should find locker by kiosk and id', async () => {
      const lockerData = {
        kiosk_id: 'kiosk-1',
        id: 1,
        status: 'Free' as LockerStatus,
        is_vip: false
      };

      await repository.create(lockerData);
      const found = await repository.findByKioskAndId('kiosk-1', 1);

      expect(found).toMatchObject(lockerData);
    });

    it('should return null for non-existent locker', async () => {
      const found = await repository.findByKioskAndId('kiosk-1', 999);
      expect(found).toBeNull();
    });
  });

  describe('update with optimistic locking', () => {
    it('should update locker successfully', async () => {
      const locker = await repository.create({
        kiosk_id: 'kiosk-1',
        id: 1,
        status: 'Free' as LockerStatus,
        is_vip: false
      });

      const updated = await repository.update('kiosk-1', 1, {
        status: 'Reserved',
        owner_type: 'rfid',
        owner_key: 'card-123',
        reserved_at: new Date()
      }, locker.version);

      expect(updated.status).toBe('Reserved');
      expect(updated.owner_type).toBe('rfid');
      expect(updated.owner_key).toBe('card-123');
      expect(updated.version).toBe(locker.version + 1);
    });

    it('should throw OptimisticLockError on version mismatch', async () => {
      const locker = await repository.create({
        kiosk_id: 'kiosk-1',
        id: 1,
        status: 'Free' as LockerStatus,
        is_vip: false
      });

      // Update with wrong version
      await expect(
        repository.update('kiosk-1', 1, { status: 'Reserved' }, 999)
      ).rejects.toThrow(OptimisticLockError);
    });

    it('should throw error for non-existent locker', async () => {
      await expect(
        repository.update('kiosk-1', 999, { status: 'Reserved' }, 1)
      ).rejects.toThrow('Locker with id kiosk-1:999 not found');
    });
  });

  describe('findAvailable', () => {
    beforeEach(async () => {
      // Create test lockers
      await repository.create({
        kiosk_id: 'kiosk-1',
        id: 1,
        status: 'Free' as LockerStatus,
        is_vip: false
      });
      await repository.create({
        kiosk_id: 'kiosk-1',
        id: 2,
        status: 'Owned' as LockerStatus,
        is_vip: false
      });
      await repository.create({
        kiosk_id: 'kiosk-1',
        id: 3,
        status: 'Free' as LockerStatus,
        is_vip: true
      });
      await repository.create({
        kiosk_id: 'kiosk-1',
        id: 4,
        status: 'Blocked' as LockerStatus,
        is_vip: false
      });
    });

    it('should return only Free, non-VIP lockers', async () => {
      const available = await repository.findAvailable('kiosk-1');

      expect(available).toHaveLength(1);
      expect(available[0].id).toBe(1);
      expect(available[0].status).toBe('Free');
      expect(available[0].is_vip).toBe(false);
    });
  });

  describe('findByOwnerKey', () => {
    it('should find locker by owner key', async () => {
      await repository.create({
        kiosk_id: 'kiosk-1',
        id: 1,
        status: 'Owned' as LockerStatus,
        owner_type: 'rfid',
        owner_key: 'card-123',
        is_vip: false,
        owned_at: new Date()
      });

      const found = await repository.findByOwnerKey('card-123');

      expect(found).not.toBeNull();
      expect(found!.owner_key).toBe('card-123');
      expect(found!.status).toBe('Owned');
    });

    it('should return null for non-existent owner key', async () => {
      const found = await repository.findByOwnerKey('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('cleanupExpiredReservations', () => {
    it('should cleanup expired reservations', async () => {
      // Create expired reservation
      const expiredTime = new Date(Date.now() - 120000); // 2 minutes ago
      await db.run(`
        INSERT INTO lockers (kiosk_id, id, status, owner_key, reserved_at, version)
        VALUES (?, ?, ?, ?, ?, ?)
      `, ['kiosk-1', 1, 'Reserved', 'card-123', expiredTime.toISOString(), 1]);

      const cleanedCount = await repository.cleanupExpiredReservations(90);

      expect(cleanedCount).toBe(1);

      const locker = await repository.findByKioskAndId('kiosk-1', 1);
      expect(locker!.status).toBe('Free');
      expect(locker!.owner_key).toBeNull();
    });
  });

  describe('getStatsByKiosk', () => {
    beforeEach(async () => {
      // Create test lockers with different statuses
      const statuses: LockerStatus[] = ['Free', 'Reserved', 'Owned', 'Blocked'];
      for (let i = 0; i < statuses.length; i++) {
        await repository.create({
          kiosk_id: 'kiosk-1',
          id: i + 1,
          status: statuses[i],
          is_vip: i === 3 // Make locker 4 VIP
        });
      }
    });

    it('should return correct statistics', async () => {
      const stats = await repository.getStatsByKiosk('kiosk-1');

      expect(stats).toEqual({
        total: 4,
        free: 1,
        reserved: 1,
        owned: 1,
        blocked: 1,
        vip: 1
      });
    });
  });
});