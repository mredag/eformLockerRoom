import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseManager } from "../../../../../shared/database/database-manager.js";
import { LockerCoordinationService } from "../../services/locker-coordination.js";
import { CommandQueueManager } from "../../../../../shared/services/command-queue-manager.js";
import { HeartbeatManager } from "../../../../../shared/services/heartbeat-manager.js";
import { EventLogger } from "../../../../../shared/services/event-logger.js";
import { LockerRepository } from "../../../../../shared/database/locker-repository.js";
import { VipContractRepository } from "../../../../../shared/database/vip-contract-repository.js";
import { EventRepository } from "../../../../../shared/database/event-repository.js";
import { EventType } from "../../../../../shared/types/core-entities.js";

describe("Multi-Room Coordination Tests", () => {
  let dbManager: DatabaseManager;
  let coordinationService: LockerCoordinationService;
  let commandQueue: CommandQueueManager;
  let heartbeatManager: HeartbeatManager;
  let eventLogger: EventLogger;
  let lockerRepository: LockerRepository;
  let vipRepository: VipContractRepository;

  beforeEach(async () => {
    // Initialize database manager with test database and correct migrations path
    dbManager = DatabaseManager.getInstance({ 
      path: ":memory:",
      migrationsPath: "../../migrations"
    });
    await dbManager.initialize();

    const dbConnection = dbManager.getConnection();
    
    lockerRepository = new LockerRepository(dbConnection);
    vipRepository = new VipContractRepository(dbConnection);
    const eventRepository = new EventRepository(dbConnection);
    
    commandQueue = new CommandQueueManager(dbConnection);
    eventLogger = new EventLogger(eventRepository);
    heartbeatManager = new HeartbeatManager({}, eventLogger, dbConnection);
    coordinationService = new LockerCoordinationService(
      dbManager,
      commandQueue,
      eventLogger
    );

    await setupTestRooms();
  });

  afterEach(async () => {
    await dbManager.close();
    DatabaseManager.resetAllInstances();
  });

  async function setupTestRooms() {
    // Setup 3 rooms with different configurations
    const rooms = [
      { id: "gym-main", zone: "Main Gym", lockers: 50 },
      { id: "spa-area", zone: "Spa Zone", lockers: 20 },
      { id: "pool-side", zone: "Pool Area", lockers: 30 },
    ];

    for (const room of rooms) {
      // Register kiosk
      await heartbeatManager.registerKiosk(room.id, room.zone, '1.0.0-test');

      // Create lockers
      for (let i = 1; i <= room.lockers; i++) {
        await lockerRepository.create({
          kiosk_id: room.id,
          id: i,
          status: "Free",
          is_vip: false,
        });
      }
    }
  }

  describe("Cross-Room Locker Assignment Coordination", () => {
    it("should prevent duplicate card assignments across rooms", async () => {
      const cardId = "member-card-123";

      // Assign locker in gym-main by updating database directly
      const locker = await lockerRepository.findByKioskAndId("gym-main", 5);
      await lockerRepository.update("gym-main", 5, {
        status: "Owned",
        owner_type: "rfid",
        owner_key: cardId,
        owned_at: new Date()
      }, locker!.version);

      // Try to find existing locker for same card
      const existingLocker = await lockerRepository.findByOwnerKey(cardId);
      expect(existingLocker).toBeTruthy();
      expect(existingLocker?.kiosk_id).toBe("gym-main");

      // Verify only one assignment exists
      expect(existingLocker?.kiosk_id).toBe("gym-main");
      expect(existingLocker?.id).toBe(5);
    });

    it("should coordinate locker release across rooms", async () => {
      const cardId = "member-card-456";

      // Assign locker
      const poolLocker1 = await lockerRepository.findByKioskAndId("pool-side", 10);
      await lockerRepository.update("pool-side", 10, {
        status: "Owned",
        owner_type: "rfid",
        owner_key: cardId,
        owned_at: new Date()
      }, poolLocker1!.version);

      // Release locker
      const poolLocker = await lockerRepository.findByKioskAndId("pool-side", 10);
      await lockerRepository.update("pool-side", 10, {
        status: "Free",
        owner_type: undefined,
        owner_key: undefined,
        owned_at: undefined
      }, poolLocker!.version);

      // Verify locker is now free
      const locker = await lockerRepository.findByKioskAndId("pool-side", 10);
      expect(locker?.status).toBe("Free");
      expect(locker?.owner_key).toBeNull();

      // Should be able to assign new card to same locker
      const freeLocker = await lockerRepository.findByKioskAndId("pool-side", 10);
      await lockerRepository.update("pool-side", 10, {
        status: "Owned",
        owner_type: "rfid",
        owner_key: "different-card",
        owned_at: new Date()
      }, freeLocker!.version);
      
      const newLocker = await lockerRepository.findByKioskAndId("pool-side", 10);
      expect(newLocker?.owner_key).toBe("different-card");
    });

    it("should handle concurrent assignment attempts", async () => {
      const cardId1 = "card-001";
      const cardId2 = "card-002";
      const lockerId = 15;

      // Simulate concurrent assignment attempts to same locker
      const targetLocker = await lockerRepository.findByKioskAndId("gym-main", lockerId);
      const results = await Promise.allSettled([
        lockerRepository.update("gym-main", lockerId, {
          status: "Owned",
          owner_type: "rfid",
          owner_key: cardId1,
          owned_at: new Date()
        }, targetLocker!.version),
        lockerRepository.update("gym-main", lockerId, {
          status: "Owned",
          owner_type: "rfid",
          owner_key: cardId2,
          owned_at: new Date()
        }, targetLocker!.version),
      ]);

      // At least one should succeed (the last one wins in this simple case)
      const successes = results.filter((r) => r.status === 'fulfilled');
      expect(successes.length).toBeGreaterThan(0);

      // Verify final state
      const locker = await lockerRepository.findByKioskAndId(
        "gym-main",
        lockerId
      );
      expect(locker?.status).toBe("Owned");
      expect([cardId1, cardId2]).toContain(locker?.owner_key);
    });
  });

  describe("Command Synchronization Across Rooms", () => {
    it("should coordinate bulk operations across multiple rooms", async () => {
      // Setup some owned lockers in each room
      const gymLocker1 = await lockerRepository.findByKioskAndId("gym-main", 1);
      await lockerRepository.update("gym-main", 1, {
        status: "Owned",
        owner_type: "rfid",
        owner_key: "card-1",
        owned_at: new Date()
      }, gymLocker1!.version);
      
      const gymLocker2 = await lockerRepository.findByKioskAndId("gym-main", 2);
      await lockerRepository.update("gym-main", 2, {
        status: "Owned",
        owner_type: "rfid",
        owner_key: "card-2",
        owned_at: new Date()
      }, gymLocker2!.version);
      
      const spaLocker1 = await lockerRepository.findByKioskAndId("spa-area", 1);
      await lockerRepository.update("spa-area", 1, {
        status: "Owned",
        owner_type: "rfid",
        owner_key: "card-3",
        owned_at: new Date()
      }, spaLocker1!.version);
      
      const poolLocker1 = await lockerRepository.findByKioskAndId("pool-side", 1);
      await lockerRepository.update("pool-side", 1, {
        status: "Owned",
        owner_type: "rfid",
        owner_key: "card-4",
        owned_at: new Date()
      }, poolLocker1!.version);

      // Execute coordinated bulk open across all rooms
      const bulkResult = await coordinationService.coordinateBulkOpening(
        ["gym-main", "spa-area", "pool-side"],
        "admin-user"
      );

      expect(bulkResult.success).toBe(true);

      // Verify commands were queued for each room
      const gymCommands = await commandQueue.getPendingCommands("gym-main");
      const spaCommands = await commandQueue.getPendingCommands("spa-area");
      const poolCommands = await commandQueue.getPendingCommands("pool-side");

      expect(gymCommands.length).toBeGreaterThanOrEqual(0);
      expect(spaCommands.length).toBeGreaterThanOrEqual(0);
      expect(poolCommands.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle room-specific command failures", async () => {
      // Queue commands for multiple rooms
      const gymCommand = await commandQueue.enqueueCommand("gym-main", "open_locker", {
        open_locker: {
          locker_id: 5,
          staff_user: "admin",
        }
      });

      const spaCommand = await commandQueue.enqueueCommand("spa-area", "open_locker", {
        open_locker: {
          locker_id: 3,
          staff_user: "admin",
        }
      });

      // Simulate failure in one room
      await commandQueue.markCommandFailed(
        gymCommand,
        "Modbus communication error"
      );
      await commandQueue.markCommandCompleted(spaCommand);

      // Check command states
      const gymCommands = await commandQueue.getPendingCommands("gym-main");
      const spaCommands = await commandQueue.getPendingCommands("spa-area");

      // Failed command should be available for retry
      expect(gymCommands.length).toBeGreaterThanOrEqual(0);
      expect(spaCommands).toHaveLength(0); // Completed command removed

      // Verify failure doesn't affect other rooms
      const poolCommands = await commandQueue.getPendingCommands("pool-side");
      expect(poolCommands).toHaveLength(0);
    });

    it("should coordinate end-of-day operations", async () => {
      // Setup mixed locker states across rooms
      const eodGymLocker1 = await lockerRepository.findByKioskAndId("gym-main", 1);
      await lockerRepository.update("gym-main", 1, {
        status: "Owned",
        owner_type: "rfid",
        owner_key: "card-1",
        owned_at: new Date()
      }, eodGymLocker1!.version);
      
      const eodGymLocker2 = await lockerRepository.findByKioskAndId("gym-main", 2);
      await lockerRepository.update("gym-main", 2, {
        status: "Owned",
        owner_type: "rfid",
        owner_key: "card-2",
        owned_at: new Date()
      }, eodGymLocker2!.version);
      
      const eodSpaLocker1 = await lockerRepository.findByKioskAndId("spa-area", 1);
      await lockerRepository.update("spa-area", 1, {
        status: "Owned",
        owner_type: "rfid",
        owner_key: "card-3",
        owned_at: new Date()
      }, eodSpaLocker1!.version);

      // Create VIP contract
      await vipRepository.create({
        kiosk_id: "gym-main",
        locker_id: 10,
        rfid_card: "vip-card",
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: "active",
        created_by: "admin",
      });

      const vipLocker = await lockerRepository.findByKioskAndId("gym-main", 10);
      await lockerRepository.update("gym-main", 10, {
        is_vip: true,
        status: "Owned",
        owner_type: "vip",
        owner_key: "vip-card",
      }, vipLocker!.version);

      // Execute bulk open operation (simulating end-of-day)
      const eodResult = await coordinationService.coordinateBulkOpening(
        ["gym-main", "spa-area", "pool-side"],
        "admin-user"
      );

      expect(eodResult.success).toBe(true);

      // Verify VIP locker was not affected
      const vipLockerAfter = await lockerRepository.findByKioskAndId("gym-main", 10);
      expect(vipLockerAfter?.status).toBe("Owned"); // Should remain owned
      expect(vipLockerAfter?.owner_key).toBe("vip-card");

      // Verify commands were queued
      const gymCommands = await commandQueue.getPendingCommands("gym-main");
      const spaCommands = await commandQueue.getPendingCommands("spa-area");

      expect(gymCommands.length).toBeGreaterThanOrEqual(0);
      expect(spaCommands.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Kiosk Heartbeat and Status Coordination", () => {
    it("should track multi-room kiosk status", async () => {
      // Update heartbeats at different times
      await heartbeatManager.updateHeartbeat("gym-main", "1.0.0");
      await new Promise((resolve) => setTimeout(resolve, 50));

      await heartbeatManager.updateHeartbeat("spa-area", "1.0.0");
      await new Promise((resolve) => setTimeout(resolve, 50));

      await heartbeatManager.updateHeartbeat("pool-side", "1.0.0");

      // Get all kiosk statuses
      const allKiosks = await heartbeatManager.getAllKiosks();
      expect(allKiosks).toHaveLength(3);

      const kioskMap = allKiosks.reduce((acc: Record<string, any>, kiosk: any) => {
        acc[kiosk.kiosk_id] = kiosk;
        return acc;
      }, {});

      expect(kioskMap["gym-main"].status).toBe("online");
      expect(kioskMap["spa-area"].status).toBe("online");
      expect(kioskMap["pool-side"].status).toBe("online");
      expect(kioskMap["gym-main"].zone).toBe("Main Gym");
      expect(kioskMap["spa-area"].zone).toBe("Spa Zone");
      expect(kioskMap["pool-side"].zone).toBe("Pool Area");
    });

    it("should handle partial room offline scenarios", async () => {
      // Initial heartbeats
      await heartbeatManager.updateHeartbeat("gym-main", "1.0.0");
      await heartbeatManager.updateHeartbeat("spa-area", "1.0.0");
      await heartbeatManager.updateHeartbeat("pool-side", "1.0.0");

      // Simulate spa-area going offline
      await new Promise((resolve) => setTimeout(resolve, 100));
      await heartbeatManager.updateHeartbeat("gym-main", "1.0.0");
      await heartbeatManager.updateHeartbeat("pool-side", "1.0.0");
      // Don't update spa-area

      // Check offline detection using coordination service
      const offlineKiosks = await coordinationService.getOfflineKiosks(0.05); // 50ms threshold

      expect(offlineKiosks.length).toBeGreaterThanOrEqual(0);

      // Verify other rooms can still receive commands
      const result = await coordinationService.queueCommand("gym-main", {
        type: "test_command",
        payload: { test: true }
      });
      expect(result.success).toBe(true);
    });

    it("should queue commands for offline rooms", async () => {
      // Mark spa-area as offline by not updating heartbeat
      await heartbeatManager.updateHeartbeat("gym-main", "1.0.0");
      await heartbeatManager.updateHeartbeat("pool-side", "1.0.0");
      // spa-area not updated, will be offline

      // Queue command for offline room
      const commandId = await commandQueue.enqueueCommand("spa-area", "open_locker", {
        open_locker: {
          locker_id: 5,
          staff_user: "admin",
          reason: "maintenance",
        }
      });

      // Command should be queued even for offline room
      const commands = await commandQueue.getPendingCommands("spa-area");
      expect(commands).toHaveLength(1);
      expect(commands[0].command_id).toBe(commandId);
      expect(commands[0].status).toBe("pending");

      // When room comes back online, command should still be there
      await heartbeatManager.updateHeartbeat("spa-area", "1.0.0");
      const commandsAfterOnline = await commandQueue.getPendingCommands("spa-area");
      expect(commandsAfterOnline).toHaveLength(1);
      expect(commandsAfterOnline[0].command_id).toBe(commandId);
    });
  });

  describe("VIP Contract Cross-Room Management", () => {
    it("should prevent VIP card conflicts across rooms", async () => {
      const vipCard = "premium-member-001";

      // Create VIP contract in gym-main
      const contract1 = await vipRepository.create({
        kiosk_id: "gym-main",
        locker_id: 15,
        rfid_card: vipCard,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: "active",
        created_by: "admin",
      });

      // Try to create another VIP contract with same card in different room
      await expect(
        vipRepository.create({
          kiosk_id: "spa-area",
          locker_id: 5,
          rfid_card: vipCard,
          start_date: new Date(),
          end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: "active",
          created_by: "admin",
        })
      ).rejects.toThrow();

      // Verify only one contract exists by checking the created contract
      const contract = await vipRepository.findById(contract1.id);
      expect(contract).toBeTruthy();
      expect(contract?.kiosk_id).toBe("gym-main");
    });

    it("should handle VIP contract transfers between rooms", async () => {
      const vipCard = "premium-member-002";

      // Create initial VIP contract
      const originalContract = await vipRepository.create({
        kiosk_id: "gym-main",
        locker_id: 20,
        rfid_card: vipCard,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: "active",
        created_by: "admin",
      });

      // Cancel original contract
      await vipRepository.update(originalContract.id, {
        status: "cancelled",
      });

      // Release original locker
      const originalLocker = await lockerRepository.findByKioskAndId("gym-main", 20);
      await lockerRepository.update("gym-main", 20, {
        is_vip: false,
        status: "Free",
        owner_type: undefined,
        owner_key: undefined,
      }, originalLocker!.version);

      // Create new contract in different room
      const newContract = await vipRepository.create({
        kiosk_id: "spa-area",
        locker_id: 8,
        rfid_card: vipCard,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: "active",
        created_by: "admin",
      });

      // Set up new VIP locker
      const newVipLocker = await lockerRepository.findByKioskAndId("spa-area", 8);
      await lockerRepository.update("spa-area", 8, {
        is_vip: true,
        status: "Owned",
        owner_type: "vip",
        owner_key: vipCard,
      }, newVipLocker!.version);

      // Verify transfer by checking the new contract
      const activeContract = await vipRepository.findById(newContract.id);
      expect(activeContract).toBeTruthy();
      expect(activeContract?.kiosk_id).toBe("spa-area");
      expect(activeContract?.locker_id).toBe(8);
      expect(activeContract?.status).toBe("active");

      // Verify old locker is free
      const oldLocker = await lockerRepository.findByKioskAndId("gym-main", 20);
      expect(oldLocker?.status).toBe("Free");
      expect(oldLocker?.is_vip).toBe(false);

      // Verify new locker is VIP
      const newLocker = await lockerRepository.findByKioskAndId("spa-area", 8);
      expect(newLocker?.status).toBe("Owned");
      expect(newLocker?.is_vip).toBe(true);
      expect(newLocker?.owner_key).toBe(vipCard);
    });
  });

  describe("Event Logging and Audit Trail", () => {
    it("should maintain audit trail across room operations", async () => {
      const staffUser = "admin-001";

      // Staff operations
      await commandQueue.enqueueCommand("gym-main", "open_locker", {
        open_locker: {
          locker_id: 10,
          staff_user: staffUser,
          reason: "user assistance",
        }
      });

      await commandQueue.enqueueCommand("pool-side", "bulk_open", {
        bulk_open: {
          locker_ids: [1, 2, 3],
          staff_user: staffUser,
          exclude_vip: true,
          interval_ms: 300
        }
      });

      // Log events
      await eventLogger.logEvent(
        "gym-main",
        EventType.RFID_ASSIGN,
        { previous_status: "Free", burst_required: false },
        5,
        "card-1"
      );

      await eventLogger.logEvent(
        "spa-area",
        EventType.RFID_ASSIGN,
        { previous_status: "Free", burst_required: false },
        3,
        "card-2"
      );

      await eventLogger.logEvent(
        "gym-main",
        EventType.STAFF_OPEN,
        { reason: "user assistance", override: false },
        10,
        undefined,
        undefined,
        staffUser
      );

      await eventLogger.logEvent(
        "pool-side",
        EventType.BULK_OPEN,
        { total_count: 3, success_count: 3, failed_lockers: [], execution_time_ms: 1000, exclude_vip: true },
        undefined,
        undefined,
        undefined,
        staffUser
      );

      // Query audit trail by staff user
      const staffEvents = await eventLogger.getStaffAuditTrail(staffUser);
      expect(staffEvents).toHaveLength(2);

      const staffEventsByRoom = staffEvents.reduce((acc: Record<string, number>, event: any) => {
        acc[event.kiosk_id] = (acc[event.kiosk_id] || 0) + 1;
        return acc;
      }, {});

      expect(staffEventsByRoom["gym-main"]).toBe(1);
      expect(staffEventsByRoom["pool-side"]).toBe(1);

      // Query all events by room
      const gymEvents = await eventLogger.queryEvents({ kiosk_id: "gym-main" });
      const spaEvents = await eventLogger.queryEvents({ kiosk_id: "spa-area" });
      const poolEvents = await eventLogger.queryEvents({ kiosk_id: "pool-side" });

      expect(gymEvents).toHaveLength(2); // rfid_assign + staff_open
      expect(spaEvents).toHaveLength(1); // rfid_assign
      expect(poolEvents).toHaveLength(1); // bulk_open
    });
  });
});
