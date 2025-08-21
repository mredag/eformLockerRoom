import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '@eform/shared/database/database-manager';
import { LockerCoordinationService } from '../../services/locker-coordination';
import { CommandQueueManager } from '@eform/shared/services/command-queue-manager';
import { HeartbeatManager } from '@eform/shared/services/heartbeat-manager';
import { EventLogger } from '@eform/shared/services/event-logger';
import { LockerRepository } from '@eform/shared/database/locker-repository';
import { VipContractRepository } from '@eform/shared/database/vip-contract-repository';

describe('Multi-Room Coordination Tests', () => {
  let dbManager: DatabaseManager;
  let coordinationService: LockerCoordinationService;
  let commandQueue: CommandQueueManager;
  let heartbeatManager: HeartbeatManager;
  let eventLogger: EventLogger;
  let lockerRepository: LockerRepository;
  let vipRepository: VipContractRepository;

  beforeEach(async () => {
    dbManager = new DatabaseManager(':memory:');
    await dbManager.initialize();
    
    lockerRepository = new LockerRepository(dbManager);
    vipRepository = new VipContractRepository(dbManager);
    commandQueue = new CommandQueueManager(dbManager);
    heartbeatManager = new HeartbeatManager(dbManager);
    eventLogger = new EventLogger(dbManager);
    coordinationService = new LockerCoordinationService(
      lockerRepository,
      vipRepository,
      commandQueue,
      eventLogger
    );

    await setupTestRooms();
  });

  afterEach(async () => {
    await dbManager.close();
  });

  async function setupTestRooms() {
    // Setup 3 rooms with different configurations
    const rooms = [
      { id: 'gym-main', zone: 'Main Gym', lockers: 50 },
      { id: 'spa-area', zone: 'Spa Zone', lockers: 20 },
      { id: 'pool-side', zone: 'Pool Area', lockers: 30 }
    ];

    for (const room of rooms) {
      // Register kiosk
      await heartbeatManager.updateHeartbeat(room.id, room.zone);
      
      // Create lockers
      for (let i = 1; i <= room.lockers; i++) {
        await lockerRepository.create({
          kiosk_id: room.id,
          id: i,
          status: 'Free',
          version: 1,
          is_vip: false
        });
      }
    }
  }

  describe('Cross-Room Locker Assignment Coordination', () => {
    it('should prevent duplicate card assignments across rooms', async () => {
      const cardId = 'member-card-123';

      // Assign locker in gym-main
      const result1 = await coordinationService.assignLockerToCard(
        'gym-main', 
        5, 
        cardId, 
        'rfid'
      );
      expect(result1.success).toBe(true);

      // Try to assign different locker in spa-area with same card
      const result2 = await coordinationService.assignLockerToCard(
        'spa-area', 
        3, 
        cardId, 
        'rfid'
      );
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('already has an active locker');

      // Verify only one assignment exists
      const existingLocker = await lockerRepository.findByOwnerKey(cardId);
      expect(existingLocker?.kiosk_id).toBe('gym-main');
      expect(existingLocker?.id).toBe(5);
    });

    it('should coordinate locker release across rooms', async () => {
      const cardId = 'member-card-456';

      // Assign and then release
      await coordinationService.assignLockerToCard('pool-side', 10, cardId, 'rfid');
      
      const releaseResult = await coordinationService.releaseLockerByCard(cardId);
      expect(releaseResult.success).toBe(true);
      expect(releaseResult.kiosk_id).toBe('pool-side');
      expect(releaseResult.locker_id).toBe(10);

      // Verify locker is now free
      const locker = await lockerRepository.findByKioskAndId('pool-side', 10);
      expect(locker?.status).toBe('Free');
      expect(locker?.owner_key).toBeNull();

      // Should be able to assign new card to same locker
      const newAssignment = await coordinationService.assignLockerToCard(
        'pool-side', 
        10, 
        'different-card', 
        'rfid'
      );
      expect(newAssignment.success).toBe(true);
    });

    it('should handle concurrent assignment attempts', async () => {
      const cardId1 = 'card-001';
      const cardId2 = 'card-002';
      const lockerId = 15;

      // Simulate concurrent assignment attempts to same locker
      const [result1, result2] = await Promise.all([
        coordinationService.assignLockerToCard('gym-main', lockerId, cardId1, 'rfid'),
        coordinationService.assignLockerToCard('gym-main', lockerId, cardId2, 'rfid')
      ]);

      // Only one should succeed
      const successes = [result1, result2].filter(r => r.success);
      const failures = [result1, result2].filter(r => !r.success);

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0].error).toContain('already assigned');

      // Verify final state
      const locker = await lockerRepository.findByKioskAndId('gym-main', lockerId);
      expect(locker?.status).toBe('Owned');
      expect([cardId1, cardId2]).toContain(locker?.owner_key);
    });
  });

  describe('Command Synchronization Across Rooms', () => {
    it('should coordinate bulk operations across multiple rooms', async () => {
      // Setup some owned lockers in each room
      await coordinationService.assignLockerToCard('gym-main', 1, 'card-1', 'rfid');
      await coordinationService.assignLockerToCard('gym-main', 2, 'card-2', 'rfid');
      await coordinationService.assignLockerToCard('spa-area', 1, 'card-3', 'rfid');
      await coordinationService.assignLockerToCard('pool-side', 1, 'card-4', 'rfid');

      // Execute coordinated bulk open across all rooms
      const bulkResult = await coordinationService.executeBulkOpenAllRooms(
        'admin-user',
        { excludeVip: true, maxConcurrent: 2 }
      );

      expect(bulkResult.success).toBe(true);
      expect(bulkResult.roomResults).toHaveLength(3);

      // Verify commands were queued for each room
      const gymCommands = await commandQueue.getCommands('gym-main');
      const spaCommands = await commandQueue.getCommands('spa-area');
      const poolCommands = await commandQueue.getCommands('pool-side');

      expect(gymCommands).toHaveLength(1);
      expect(spaCommands).toHaveLength(1);
      expect(poolCommands).toHaveLength(1);

      // Verify command payloads
      const gymPayload = JSON.parse(gymCommands[0].payload);
      const spaPayload = JSON.parse(spaCommands[0].payload);
      const poolPayload = JSON.parse(poolCommands[0].payload);

      expect(gymPayload.locker_ids).toEqual([1, 2]);
      expect(spaPayload.locker_ids).toEqual([1]);
      expect(poolPayload.locker_ids).toEqual([1]);
    });

    it('should handle room-specific command failures', async () => {
      // Queue commands for multiple rooms
      const gymCommand = await commandQueue.enqueueCommand('gym-main', {
        type: 'open_locker',
        locker_id: 5,
        staff_user: 'admin'
      });

      const spaCommand = await commandQueue.enqueueCommand('spa-area', {
        type: 'open_locker',
        locker_id: 3,
        staff_user: 'admin'
      });

      // Simulate failure in one room
      await commandQueue.markCommandFailed(gymCommand, 'Modbus communication error');
      await commandQueue.markCommandComplete(spaCommand);

      // Check command states
      const gymCommands = await commandQueue.getCommands('gym-main');
      const spaCommands = await commandQueue.getCommands('spa-area');

      expect(gymCommands[0].status).toBe('failed');
      expect(gymCommands[0].retry_count).toBe(1);
      expect(spaCommands).toHaveLength(0); // Completed command removed

      // Verify failure doesn't affect other rooms
      const poolCommands = await commandQueue.getCommands('pool-side');
      expect(poolCommands).toHaveLength(0);
    });

    it('should coordinate end-of-day operations', async () => {
      // Setup mixed locker states across rooms
      await coordinationService.assignLockerToCard('gym-main', 1, 'card-1', 'rfid');
      await coordinationService.assignLockerToCard('gym-main', 2, 'card-2', 'rfid');
      await coordinationService.assignLockerToCard('spa-area', 1, 'card-3', 'rfid');
      
      // Create VIP contract
      await vipRepository.create({
        kiosk_id: 'gym-main',
        locker_id: 10,
        rfid_card: 'vip-card',
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: 'admin'
      });

      await lockerRepository.update('gym-main', 10, {
        is_vip: true,
        status: 'Owned',
        owner_type: 'vip',
        owner_key: 'vip-card'
      });

      // Execute end-of-day operation
      const eodResult = await coordinationService.executeEndOfDayAllRooms(
        'admin-user',
        { excludeVip: true, generateReport: true }
      );

      expect(eodResult.success).toBe(true);
      expect(eodResult.totalRooms).toBe(3);
      expect(eodResult.report).toBeDefined();

      // Verify VIP locker was excluded
      const vipLocker = await lockerRepository.findByKioskAndId('gym-main', 10);
      expect(vipLocker?.status).toBe('Owned'); // Should remain owned
      expect(vipLocker?.owner_key).toBe('vip-card');

      // Verify regular lockers were processed
      const regularLocker1 = await lockerRepository.findByKioskAndId('gym-main', 1);
      const regularLocker2 = await lockerRepository.findByKioskAndId('gym-main', 2);
      const spaLocker = await lockerRepository.findByKioskAndId('spa-area', 1);

      // These should be queued for opening (commands created)
      const gymCommands = await commandQueue.getCommands('gym-main');
      const spaCommands = await commandQueue.getCommands('spa-area');
      
      expect(gymCommands.length).toBeGreaterThan(0);
      expect(spaCommands.length).toBeGreaterThan(0);
    });
  });

  describe('Kiosk Heartbeat and Status Coordination', () => {
    it('should track multi-room kiosk status', async () => {
      // Update heartbeats at different times
      await heartbeatManager.updateHeartbeat('gym-main', 'Main Gym');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await heartbeatManager.updateHeartbeat('spa-area', 'Spa Zone');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await heartbeatManager.updateHeartbeat('pool-side', 'Pool Area');

      // Get all kiosk statuses
      const allKiosks = await heartbeatManager.getAllKiosks();
      expect(allKiosks).toHaveLength(3);

      const kioskMap = allKiosks.reduce((acc, kiosk) => {
        acc[kiosk.kiosk_id] = kiosk;
        return acc;
      }, {} as Record<string, any>);

      expect(kioskMap['gym-main'].status).toBe('online');
      expect(kioskMap['spa-area'].status).toBe('online');
      expect(kioskMap['pool-side'].status).toBe('online');
      expect(kioskMap['gym-main'].zone).toBe('Main Gym');
      expect(kioskMap['spa-area'].zone).toBe('Spa Zone');
      expect(kioskMap['pool-side'].zone).toBe('Pool Area');
    });

    it('should handle partial room offline scenarios', async () => {
      // Initial heartbeats
      await heartbeatManager.updateHeartbeat('gym-main', 'Main Gym');
      await heartbeatManager.updateHeartbeat('spa-area', 'Spa Zone');
      await heartbeatManager.updateHeartbeat('pool-side', 'Pool Area');

      // Simulate spa-area going offline
      await new Promise(resolve => setTimeout(resolve, 100));
      await heartbeatManager.updateHeartbeat('gym-main', 'Main Gym');
      await heartbeatManager.updateHeartbeat('pool-side', 'Pool Area');
      // Don't update spa-area

      // Check offline detection
      const offlineKiosks = await heartbeatManager.getOfflineKiosks(0.05); // 50ms threshold
      
      expect(offlineKiosks).toHaveLength(1);
      expect(offlineKiosks[0].kiosk_id).toBe('spa-area');

      // Verify other rooms still online
      const onlineKiosks = await heartbeatManager.getOnlineKiosks();
      const onlineIds = onlineKiosks.map(k => k.kiosk_id);
      expect(onlineIds).toContain('gym-main');
      expect(onlineIds).toContain('pool-side');
      expect(onlineIds).not.toContain('spa-area');
    });

    it('should queue commands for offline rooms', async () => {
      // Mark spa-area as offline
      await heartbeatManager.updateHeartbeat('gym-main', 'Main Gym');
      await heartbeatManager.updateHeartbeat('pool-side', 'Pool Area');
      // spa-area not updated, will be offline

      // Queue command for offline room
      const commandId = await commandQueue.enqueueCommand('spa-area', {
        type: 'open_locker',
        locker_id: 5,
        staff_user: 'admin',
        reason: 'maintenance'
      });

      // Command should be queued even for offline room
      const commands = await commandQueue.getCommands('spa-area');
      expect(commands).toHaveLength(1);
      expect(commands[0].command_id).toBe(commandId);
      expect(commands[0].status).toBe('pending');

      // When room comes back online, command should still be there
      await heartbeatManager.updateHeartbeat('spa-area', 'Spa Zone');
      const commandsAfterOnline = await commandQueue.getCommands('spa-area');
      expect(commandsAfterOnline).toHaveLength(1);
      expect(commandsAfterOnline[0].command_id).toBe(commandId);
    });
  });

  describe('VIP Contract Cross-Room Management', () => {
    it('should prevent VIP card conflicts across rooms', async () => {
      const vipCard = 'premium-member-001';

      // Create VIP contract in gym-main
      const contract1 = await vipRepository.create({
        kiosk_id: 'gym-main',
        locker_id: 15,
        rfid_card: vipCard,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: 'admin'
      });

      // Try to create another VIP contract with same card in different room
      await expect(vipRepository.create({
        kiosk_id: 'spa-area',
        locker_id: 5,
        rfid_card: vipCard,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: 'admin'
      })).rejects.toThrow();

      // Verify only one contract exists
      const contracts = await vipRepository.findByCard(vipCard);
      expect(contracts).toHaveLength(1);
      expect(contracts[0].kiosk_id).toBe('gym-main');
    });

    it('should handle VIP contract transfers between rooms', async () => {
      const vipCard = 'premium-member-002';

      // Create initial VIP contract
      const originalContract = await vipRepository.create({
        kiosk_id: 'gym-main',
        locker_id: 20,
        rfid_card: vipCard,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: 'admin'
      });

      // Cancel original contract
      await vipRepository.update(originalContract.id, {
        status: 'cancelled'
      });

      // Release original locker
      await lockerRepository.update('gym-main', 20, {
        is_vip: false,
        status: 'Free',
        owner_type: null,
        owner_key: null
      });

      // Create new contract in different room
      const newContract = await vipRepository.create({
        kiosk_id: 'spa-area',
        locker_id: 8,
        rfid_card: vipCard,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: 'admin'
      });

      // Set up new VIP locker
      await lockerRepository.update('spa-area', 8, {
        is_vip: true,
        status: 'Owned',
        owner_type: 'vip',
        owner_key: vipCard
      });

      // Verify transfer
      const activeContracts = await vipRepository.findActiveContracts();
      const vipContracts = activeContracts.filter(c => c.rfid_card === vipCard);
      expect(vipContracts).toHaveLength(1);
      expect(vipContracts[0].kiosk_id).toBe('spa-area');
      expect(vipContracts[0].locker_id).toBe(8);

      // Verify old locker is free
      const oldLocker = await lockerRepository.findByKioskAndId('gym-main', 20);
      expect(oldLocker?.status).toBe('Free');
      expect(oldLocker?.is_vip).toBe(false);

      // Verify new locker is VIP
      const newLocker = await lockerRepository.findByKioskAndId('spa-area', 8);
      expect(newLocker?.status).toBe('Owned');
      expect(newLocker?.is_vip).toBe(true);
      expect(newLocker?.owner_key).toBe(vipCard);
    });
  });

  describe('Event Logging and Audit Trail', () => {
    it('should maintain audit trail across room operations', async () => {
      const staffUser = 'admin-001';

      // Perform operations in different rooms
      await coordinationService.assignLockerToCard('gym-main', 5, 'card-1', 'rfid');
      await coordinationService.assignLockerToCard('spa-area', 3, 'card-2', 'rfid');

      // Staff operations
      await commandQueue.enqueueCommand('gym-main', {
        type: 'staff_open',
        locker_id: 10,
        staff_user: staffUser,
        reason: 'user assistance'
      });

      await commandQueue.enqueueCommand('pool-side', {
        type: 'bulk_open',
        locker_ids: [1, 2, 3],
        staff_user: staffUser
      });

      // Log events
      await eventLogger.logEvent({
        kiosk_id: 'gym-main',
        locker_id: 5,
        event_type: 'rfid_assign',
        rfid_card: 'card-1',
        details: { previous_status: 'Free' }
      });

      await eventLogger.logEvent({
        kiosk_id: 'spa-area',
        locker_id: 3,
        event_type: 'rfid_assign',
        rfid_card: 'card-2',
        details: { previous_status: 'Free' }
      });

      await eventLogger.logEvent({
        kiosk_id: 'gym-main',
        locker_id: 10,
        event_type: 'staff_open',
        staff_user: staffUser,
        details: { reason: 'user assistance', override: false }
      });

      await eventLogger.logEvent({
        kiosk_id: 'pool-side',
        event_type: 'bulk_open',
        staff_user: staffUser,
        details: { total_count: 3, success_count: 3, failed_lockers: [] }
      });

      // Query audit trail by staff user
      const staffEvents = await eventLogger.getEventsByStaffUser(staffUser);
      expect(staffEvents).toHaveLength(2);

      const staffEventsByRoom = staffEvents.reduce((acc, event) => {
        acc[event.kiosk_id] = (acc[event.kiosk_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      expect(staffEventsByRoom['gym-main']).toBe(1);
      expect(staffEventsByRoom['pool-side']).toBe(1);

      // Query all events by room
      const gymEvents = await eventLogger.getEventsByKiosk('gym-main');
      const spaEvents = await eventLogger.getEventsByKiosk('spa-area');
      const poolEvents = await eventLogger.getEventsByKiosk('pool-side');

      expect(gymEvents).toHaveLength(2); // rfid_assign + staff_open
      expect(spaEvents).toHaveLength(1); // rfid_assign
      expect(poolEvents).toHaveLength(1); // bulk_open
    });
  });
});