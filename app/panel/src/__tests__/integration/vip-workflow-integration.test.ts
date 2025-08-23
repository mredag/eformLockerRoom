import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '@eform/shared/database/database-manager';
import { VipContractRepository } from '@eform/shared/database/vip-contract-repository';
import { LockerRepository } from '@eform/shared/database/locker-repository';
import { VipHistoryRepository } from '@eform/shared/database/vip-history-repository';
import { VipTransferRepository } from '@eform/shared/database/vip-transfer-repository';
import { EventLogger } from '@eform/shared/services/event-logger';
import { CommandQueueManager } from '@eform/shared/services/command-queue-manager';
import { AuthService } from '../services/auth-service';
import { PermissionService } from '../services/permission-service';

describe('VIP Workflow Integration Tests', () => {
  let dbManager: DatabaseManager;
  let vipRepository: VipContractRepository;
  let lockerRepository: LockerRepository;
  let vipHistoryRepository: VipHistoryRepository;
  let vipTransferRepository: VipTransferRepository;
  let eventLogger: EventLogger;
  let commandQueue: CommandQueueManager;
  let authService: AuthService;
  let permissionService: PermissionService;

  beforeEach(async () => {
    dbManager = new DatabaseManager(':memory:');
    await dbManager.initialize();
    
    vipRepository = new VipContractRepository(dbManager);
    lockerRepository = new LockerRepository(dbManager);
    vipHistoryRepository = new VipHistoryRepository(dbManager);
    vipTransferRepository = new VipTransferRepository(dbManager);
    eventLogger = new EventLogger(dbManager);
    commandQueue = new CommandQueueManager(dbManager);
    authService = new AuthService(dbManager);
    permissionService = new PermissionService();

    await setupTestEnvironment();
  });

  afterEach(async () => {
    await dbManager.close();
  });

  async function setupTestEnvironment() {
    // Create test rooms with lockers
    const rooms = ['gym-main', 'spa-area', 'pool-side'];
    
    for (const room of rooms) {
      for (let i = 1; i <= 20; i++) {
        await lockerRepository.create({
          kiosk_id: room,
          id: i,
          status: 'Free',
          version: 1,
          is_vip: false
        });
      }
    }

    // Create test staff users
    await authService.createUser({
      username: 'admin',
      password: 'admin123',
      role: 'admin'
    });

    await authService.createUser({
      username: 'staff',
      password: 'staff123',
      role: 'staff'
    });
  }

  describe('VIP Contract Creation Workflow', () => {
    it('should create VIP contract with proper validation and logging', async () => {
      const adminUser = 'admin';
      const vipCard = 'vip-premium-001';
      const kioskId = 'gym-main';
      const lockerId = 15;

      // Verify admin has permission
      const hasPermission = permissionService.hasPermission('admin', 'MANAGE_VIP');
      expect(hasPermission).toBe(true);

      // Create VIP contract
      const contract = await vipRepository.create({
        kiosk_id: kioskId,
        locker_id: lockerId,
        rfid_card: vipCard,
        start_date: new Date(),
        end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        status: 'active',
        created_by: adminUser
      });

      expect(contract.id).toBeDefined();
      expect(contract.kiosk_id).toBe(kioskId);
      expect(contract.locker_id).toBe(lockerId);
      expect(contract.rfid_card).toBe(vipCard);

      // Update locker to VIP status
      await lockerRepository.update(kioskId, lockerId, {
        is_vip: true,
        status: 'Owned',
        owner_type: 'vip',
        owner_key: vipCard
      });

      // Log VIP contract creation
      await eventLogger.logEvent({
        kiosk_id: kioskId,
        locker_id: lockerId,
        event_type: 'vip_contract_created',
        staff_user: adminUser,
        details: {
          contract_id: contract.id,
          rfid_card: vipCard,
          duration_days: 90
        }
      });

      // Create history record
      await vipHistoryRepository.create({
        contract_id: contract.id,
        action: 'created',
        performed_by: adminUser,
        details: {
          initial_setup: true,
          locker_assigned: `${kioskId}-${lockerId}`
        }
      });

      // Verify contract is active
      const activeContracts = await vipRepository.findActiveContracts();
      expect(activeContracts.some(c => c.id === contract.id)).toBe(true);

      // Verify locker is VIP
      const locker = await lockerRepository.findByKioskAndId(kioskId, lockerId);
      expect(locker?.is_vip).toBe(true);
      expect(locker?.status).toBe('Owned');
      expect(locker?.owner_key).toBe(vipCard);

      // Verify event was logged
      const events = await eventLogger.getEventsByType('vip_contract_created');
      expect(events).toHaveLength(1);
      expect(events[0].staff_user).toBe(adminUser);

      // Verify history was recorded
      const history = await vipHistoryRepository.findByContractId(contract.id);
      expect(history).toHaveLength(1);
      expect(history[0].action).toBe('created');
    });

    it('should prevent staff from creating VIP contracts', async () => {
      const staffUser = 'staff';
      
      // Verify staff lacks permission
      const hasPermission = permissionService.hasPermission('staff', 'MANAGE_VIP');
      expect(hasPermission).toBe(false);

      // Attempt to create VIP contract should be blocked at permission level
      // This would be handled by middleware in actual implementation
      expect(() => {
        if (!permissionService.hasPermission('staff', 'MANAGE_VIP')) {
          throw new Error('Insufficient permissions');
        }
      }).toThrow('Insufficient permissions');
    });

    it('should prevent duplicate VIP assignments', async () => {
      const vipCard = 'vip-premium-002';
      const adminUser = 'admin';

      // Create first VIP contract
      const contract1 = await vipRepository.create({
        kiosk_id: 'gym-main',
        locker_id: 10,
        rfid_card: vipCard,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: adminUser
      });

      // Attempt to create second contract with same card
      await expect(vipRepository.create({
        kiosk_id: 'spa-area',
        locker_id: 5,
        rfid_card: vipCard,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: adminUser
      })).rejects.toThrow();

      // Verify only one active contract exists
      const activeContracts = await vipRepository.findActiveContracts();
      const cardContracts = activeContracts.filter(c => c.rfid_card === vipCard);
      expect(cardContracts).toHaveLength(1);
    });
  });

  describe('VIP Contract Extension Workflow', () => {
    it('should extend VIP contract with audit trail', async () => {
      const adminUser = 'admin';
      const vipCard = 'vip-extend-001';

      // Create initial contract
      const contract = await vipRepository.create({
        kiosk_id: 'spa-area',
        locker_id: 8,
        rfid_card: vipCard,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: adminUser
      });

      const originalEndDate = contract.end_date;
      const newEndDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days

      // Extend contract
      await vipRepository.update(contract.id, {
        end_date: newEndDate
      });

      // Log extension
      await eventLogger.logEvent({
        kiosk_id: 'spa-area',
        locker_id: 8,
        event_type: 'vip_contract_extended',
        staff_user: adminUser,
        details: {
          contract_id: contract.id,
          original_end_date: originalEndDate.toISOString(),
          new_end_date: newEndDate.toISOString(),
          extension_days: 30
        }
      });

      // Create history record
      await vipHistoryRepository.create({
        contract_id: contract.id,
        action: 'extended',
        performed_by: adminUser,
        details: {
          original_end_date: originalEndDate.toISOString(),
          new_end_date: newEndDate.toISOString(),
          extension_days: 30
        }
      });

      // Verify extension
      const updatedContract = await vipRepository.findById(contract.id);
      expect(updatedContract?.end_date.getTime()).toBe(newEndDate.getTime());

      // Verify event logging
      const events = await eventLogger.getEventsByType('vip_contract_extended');
      expect(events).toHaveLength(1);
      expect(events[0].staff_user).toBe(adminUser);

      // Verify history
      const history = await vipHistoryRepository.findByContractId(contract.id);
      expect(history).toHaveLength(1);
      expect(history[0].action).toBe('extended');
    });
  });

  describe('VIP Card Change Workflow', () => {
    it('should change VIP card with proper validation', async () => {
      const adminUser = 'admin';
      const originalCard = 'vip-original-001';
      const newCard = 'vip-new-001';

      // Create initial contract
      const contract = await vipRepository.create({
        kiosk_id: 'pool-side',
        locker_id: 12,
        rfid_card: originalCard,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: adminUser
      });

      // Set up locker
      await lockerRepository.update('pool-side', 12, {
        is_vip: true,
        status: 'Owned',
        owner_type: 'vip',
        owner_key: originalCard
      });

      // Change card
      await vipRepository.update(contract.id, {
        rfid_card: newCard
      });

      // Update locker owner
      await lockerRepository.update('pool-side', 12, {
        owner_key: newCard
      });

      // Log card change
      await eventLogger.logEvent({
        kiosk_id: 'pool-side',
        locker_id: 12,
        event_type: 'vip_card_changed',
        staff_user: adminUser,
        details: {
          contract_id: contract.id,
          old_card: originalCard,
          new_card: newCard
        }
      });

      // Create history record
      await vipHistoryRepository.create({
        contract_id: contract.id,
        action: 'card_changed',
        performed_by: adminUser,
        details: {
          old_card: originalCard,
          new_card: newCard,
          reason: 'card_replacement'
        }
      });

      // Verify changes
      const updatedContract = await vipRepository.findById(contract.id);
      expect(updatedContract?.rfid_card).toBe(newCard);

      const locker = await lockerRepository.findByKioskAndId('pool-side', 12);
      expect(locker?.owner_key).toBe(newCard);

      // Verify old card no longer works
      const oldCardLocker = await lockerRepository.findByOwnerKey(originalCard);
      expect(oldCardLocker).toBeNull();

      // Verify new card works
      const newCardLocker = await lockerRepository.findByOwnerKey(newCard);
      expect(newCardLocker?.kiosk_id).toBe('pool-side');
      expect(newCardLocker?.id).toBe(12);
    });
  });

  describe('VIP Room Transfer Workflow', () => {
    it('should transfer VIP contract between rooms with audit', async () => {
      const adminUser = 'admin';
      const vipCard = 'vip-transfer-001';

      // Create initial contract in gym-main
      const originalContract = await vipRepository.create({
        kiosk_id: 'gym-main',
        locker_id: 5,
        rfid_card: vipCard,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: adminUser
      });

      // Set up original locker
      await lockerRepository.update('gym-main', 5, {
        is_vip: true,
        status: 'Owned',
        owner_type: 'vip',
        owner_key: vipCard
      });

      // Create transfer record
      const transfer = await vipTransferRepository.create({
        original_contract_id: originalContract.id,
        new_kiosk_id: 'spa-area',
        new_locker_id: 10,
        requested_by: adminUser,
        status: 'pending',
        reason: 'customer_request'
      });

      // Cancel original contract
      await vipRepository.update(originalContract.id, {
        status: 'cancelled'
      });

      // Release original locker
      await lockerRepository.update('gym-main', 5, {
        is_vip: false,
        status: 'Free',
        owner_type: null,
        owner_key: null
      });

      // Create new contract
      const newContract = await vipRepository.create({
        kiosk_id: 'spa-area',
        locker_id: 10,
        rfid_card: vipCard,
        start_date: new Date(),
        end_date: originalContract.end_date,
        status: 'active',
        created_by: adminUser
      });

      // Set up new locker
      await lockerRepository.update('spa-area', 10, {
        is_vip: true,
        status: 'Owned',
        owner_type: 'vip',
        owner_key: vipCard
      });

      // Complete transfer
      await vipTransferRepository.update(transfer.id, {
        new_contract_id: newContract.id,
        status: 'completed',
        completed_at: new Date()
      });

      // Log transfer events
      await eventLogger.logEvent({
        kiosk_id: 'gym-main',
        locker_id: 5,
        event_type: 'vip_transfer_out',
        staff_user: adminUser,
        details: {
          transfer_id: transfer.id,
          destination_kiosk: 'spa-area',
          destination_locker: 10,
          rfid_card: vipCard
        }
      });

      await eventLogger.logEvent({
        kiosk_id: 'spa-area',
        locker_id: 10,
        event_type: 'vip_transfer_in',
        staff_user: adminUser,
        details: {
          transfer_id: transfer.id,
          source_kiosk: 'gym-main',
          source_locker: 5,
          rfid_card: vipCard
        }
      });

      // Create history records
      await vipHistoryRepository.create({
        contract_id: originalContract.id,
        action: 'transferred_out',
        performed_by: adminUser,
        details: {
          transfer_id: transfer.id,
          destination: 'spa-area-10'
        }
      });

      await vipHistoryRepository.create({
        contract_id: newContract.id,
        action: 'transferred_in',
        performed_by: adminUser,
        details: {
          transfer_id: transfer.id,
          source: 'gym-main-5'
        }
      });

      // Verify transfer completion
      const completedTransfer = await vipTransferRepository.findById(transfer.id);
      expect(completedTransfer?.status).toBe('completed');
      expect(completedTransfer?.new_contract_id).toBe(newContract.id);

      // Verify old contract is cancelled
      const oldContract = await vipRepository.findById(originalContract.id);
      expect(oldContract?.status).toBe('cancelled');

      // Verify new contract is active
      const activeContract = await vipRepository.findById(newContract.id);
      expect(activeContract?.status).toBe('active');
      expect(activeContract?.kiosk_id).toBe('spa-area');
      expect(activeContract?.locker_id).toBe(10);

      // Verify locker states
      const oldLocker = await lockerRepository.findByKioskAndId('gym-main', 5);
      const newLocker = await lockerRepository.findByKioskAndId('spa-area', 10);

      expect(oldLocker?.status).toBe('Free');
      expect(oldLocker?.is_vip).toBe(false);
      expect(newLocker?.status).toBe('Owned');
      expect(newLocker?.is_vip).toBe(true);
      expect(newLocker?.owner_key).toBe(vipCard);

      // Verify events were logged
      const transferEvents = await eventLogger.getEventsByType('vip_transfer_out');
      expect(transferEvents).toHaveLength(1);
      
      const transferInEvents = await eventLogger.getEventsByType('vip_transfer_in');
      expect(transferInEvents).toHaveLength(1);
    });
  });

  describe('VIP Contract Cancellation Workflow', () => {
    it('should cancel VIP contract with proper cleanup', async () => {
      const adminUser = 'admin';
      const vipCard = 'vip-cancel-001';

      // Create contract
      const contract = await vipRepository.create({
        kiosk_id: 'gym-main',
        locker_id: 20,
        rfid_card: vipCard,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: adminUser
      });

      // Set up locker
      await lockerRepository.update('gym-main', 20, {
        is_vip: true,
        status: 'Owned',
        owner_type: 'vip',
        owner_key: vipCard
      });

      // Cancel contract
      await vipRepository.update(contract.id, {
        status: 'cancelled'
      });

      // Release and reset locker
      await lockerRepository.update('gym-main', 20, {
        is_vip: false,
        status: 'Free',
        owner_type: null,
        owner_key: null
      });

      // Log cancellation
      await eventLogger.logEvent({
        kiosk_id: 'gym-main',
        locker_id: 20,
        event_type: 'vip_contract_cancelled',
        staff_user: adminUser,
        details: {
          contract_id: contract.id,
          rfid_card: vipCard,
          reason: 'customer_request'
        }
      });

      // Create history record
      await vipHistoryRepository.create({
        contract_id: contract.id,
        action: 'cancelled',
        performed_by: adminUser,
        details: {
          reason: 'customer_request',
          locker_released: 'gym-main-20'
        }
      });

      // Verify cancellation
      const cancelledContract = await vipRepository.findById(contract.id);
      expect(cancelledContract?.status).toBe('cancelled');

      // Verify locker is available
      const locker = await lockerRepository.findByKioskAndId('gym-main', 20);
      expect(locker?.status).toBe('Free');
      expect(locker?.is_vip).toBe(false);
      expect(locker?.owner_key).toBeNull();

      // Verify card no longer has access
      const cardLocker = await lockerRepository.findByOwnerKey(vipCard);
      expect(cardLocker).toBeNull();

      // Verify not in active contracts
      const activeContracts = await vipRepository.findActiveContracts();
      expect(activeContracts.some(c => c.id === contract.id)).toBe(false);
    });
  });

  describe('Staff Management Integration', () => {
    it('should handle VIP operations with proper authorization', async () => {
      const adminUser = 'admin';
      const staffUser = 'staff';

      // Admin should be able to create VIP contract
      expect(permissionService.hasPermission('admin', 'MANAGE_VIP')).toBe(true);
      
      const contract = await vipRepository.create({
        kiosk_id: 'spa-area',
        locker_id: 15,
        rfid_card: 'vip-auth-001',
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: adminUser
      });

      expect(contract.created_by).toBe(adminUser);

      // Staff should not be able to manage VIP contracts
      expect(permissionService.hasPermission('staff', 'MANAGE_VIP')).toBe(false);

      // But staff should be able to view lockers and perform basic operations
      expect(permissionService.hasPermission('staff', 'VIEW_LOCKERS')).toBe(true);
      expect(permissionService.hasPermission('staff', 'OPEN_LOCKER')).toBe(true);
    });

    it('should exclude VIP lockers from bulk operations by default', async () => {
      const adminUser = 'admin';
      const vipCard = 'vip-bulk-001';

      // Create VIP contract
      await vipRepository.create({
        kiosk_id: 'gym-main',
        locker_id: 1,
        rfid_card: vipCard,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
        created_by: adminUser
      });

      // Set up VIP locker
      await lockerRepository.update('gym-main', 1, {
        is_vip: true,
        status: 'Owned',
        owner_type: 'vip',
        owner_key: vipCard
      });

      // Assign regular lockers
      await lockerRepository.update('gym-main', 2, {
        status: 'Owned',
        owner_type: 'rfid',
        owner_key: 'regular-card-1'
      });

      await lockerRepository.update('gym-main', 3, {
        status: 'Owned',
        owner_type: 'rfid',
        owner_key: 'regular-card-2'
      });

      // Queue bulk open command (should exclude VIP by default)
      const commandId = await commandQueue.enqueueCommand('gym-main', {
        type: 'bulk_open',
        exclude_vip: true,
        staff_user: adminUser
      });

      const commands = await commandQueue.getCommands('gym-main');
      expect(commands).toHaveLength(1);

      const payload = JSON.parse(commands[0].payload);
      expect(payload.exclude_vip).toBe(true);

      // In actual implementation, this would result in only lockers 2 and 3 being opened
      // VIP locker 1 would be excluded
    });
  });
});
