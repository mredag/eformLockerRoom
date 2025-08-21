import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { DatabaseManager } from '../../../../shared/database/database-manager.js';
import { VipContractRepository } from '../../../../shared/database/vip-contract-repository.js';
import { VipTransferRepository } from '../../../../shared/database/vip-transfer-repository.js';
import { VipHistoryRepository } from '../../../../shared/database/vip-history-repository.js';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager.js';
import { EventRepository } from '../../../../shared/database/event-repository.js';
import { requirePermission, requireCsrfToken } from '../middleware/auth-middleware.js';
import { Permission } from '../services/permission-service.js';
import { User } from '../services/auth-service.js';

interface VipRouteOptions extends FastifyPluginOptions {
  dbManager: DatabaseManager;
}

export async function vipRoutes(fastify: FastifyInstance, options: VipRouteOptions) {
  const { dbManager } = options;
  const vipRepository = new VipContractRepository(dbManager);
  const vipTransferRepository = new VipTransferRepository(dbManager);
  const vipHistoryRepository = new VipHistoryRepository(dbManager);
  const lockerStateManager = new LockerStateManager(dbManager);
  const eventRepository = new EventRepository(dbManager);

  // Get all VIP contracts
  fastify.get('/', {
    preHandler: [requirePermission(Permission.MANAGE_VIP)]
  }, async (request, reply) => {
    const query = request.query as {
      status?: string;
      expiringSoon?: string;
    };

    try {
      let contracts = await vipRepository.getAllContracts();

      // Filter by status if provided
      if (query.status) {
        contracts = contracts.filter(c => c.status === query.status);
      }

      // Filter expiring soon (within 7 days)
      if (query.expiringSoon === 'true') {
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
        
        contracts = contracts.filter(c => 
          c.status === 'active' && 
          new Date(c.end_date) <= sevenDaysFromNow
        );
      }

      reply.send({
        contracts,
        total: contracts.length
      });
    } catch (error) {
      fastify.log.error('Failed to get VIP contracts:', error);
      reply.code(500).send({ error: 'Failed to retrieve VIP contracts' });
    }
  });

  // Get VIP contract by ID
  fastify.get('/:id', {
    preHandler: [requirePermission(Permission.MANAGE_VIP)]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const contract = await vipRepository.getContract(parseInt(id));
      if (!contract) {
        reply.code(404).send({ error: 'VIP contract not found' });
        return;
      }

      reply.send({ contract });
    } catch (error) {
      fastify.log.error('Failed to get VIP contract:', error);
      reply.code(500).send({ error: 'Failed to retrieve VIP contract' });
    }
  });

  // Create new VIP contract
  fastify.post('/', {
    preHandler: [requirePermission(Permission.MANAGE_VIP), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        required: ['kioskId', 'lockerId', 'rfidCard', 'startDate', 'endDate'],
        properties: {
          kioskId: { type: 'string', minLength: 1 },
          lockerId: { type: 'number', minimum: 1 },
          rfidCard: { type: 'string', minLength: 1 },
          backupCard: { type: 'string' },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request, reply) => {
    const { kioskId, lockerId, rfidCard, backupCard, startDate, endDate } = request.body as {
      kioskId: string;
      lockerId: number;
      rfidCard: string;
      backupCard?: string;
      startDate: string;
      endDate: string;
    };
    const user = (request as any).user as User;

    try {
      // Validate dates
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (end <= start) {
        reply.code(400).send({ error: 'End date must be after start date' });
        return;
      }

      // Check if locker exists and is available
      const locker = await lockerStateManager.getLocker(kioskId, lockerId);
      if (!locker) {
        reply.code(404).send({ error: 'Locker not found' });
        return;
      }

      if (locker.status !== 'Free') {
        reply.code(400).send({ error: 'Locker is not available for VIP assignment' });
        return;
      }

      // Check if RFID card is already in use
      const existingContract = await vipRepository.getActiveContractByCard(rfidCard);
      if (existingContract) {
        reply.code(400).send({ error: 'RFID card is already assigned to another VIP contract' });
        return;
      }

      // Check if locker already has an active VIP contract
      const existingLockerContract = await vipRepository.getActiveContractByLocker(kioskId, lockerId);
      if (existingLockerContract) {
        reply.code(400).send({ error: 'Locker already has an active VIP contract' });
        return;
      }

      // Create the contract
      const contract = await vipRepository.createContract({
        kiosk_id: kioskId,
        locker_id: lockerId,
        rfid_card: rfidCard,
        backup_card: backupCard,
        start_date: start,
        end_date: end,
        created_by: user.username
      });

      // Mark locker as VIP
      const db = dbManager.getDatabase();
      db.prepare(
        'UPDATE lockers SET is_vip = 1, updated_at = ? WHERE kiosk_id = ? AND id = ?'
      ).run(new Date().toISOString(), kioskId, lockerId);

      // Log the event with comprehensive audit details
      await eventRepository.logEvent({
        kiosk_id: kioskId,
        locker_id: lockerId,
        event_type: 'vip_contract_created',
        staff_user: user.username,
        details: {
          contract_id: contract.id,
          rfid_card: rfidCard,
          backup_card: backupCard,
          start_date: startDate,
          end_date: endDate,
          duration_days: Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)),
          created_by: user.username,
          ip_address: (request as any).ip,
          user_agent: request.headers['user-agent']
        }
      });

      reply.code(201).send({
        success: true,
        contract
      });
    } catch (error) {
      fastify.log.error('Failed to create VIP contract:', error);
      reply.code(500).send({ error: 'Failed to create VIP contract' });
    }
  });

  // Extend VIP contract
  fastify.post('/:id/extend', {
    preHandler: [requirePermission(Permission.MANAGE_VIP), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        required: ['newEndDate'],
        properties: {
          newEndDate: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { newEndDate } = request.body as { newEndDate: string };
    const user = (request as any).user as User;

    try {
      const contract = await vipRepository.getContract(parseInt(id));
      if (!contract) {
        reply.code(404).send({ error: 'VIP contract not found' });
        return;
      }

      if (contract.status !== 'active') {
        reply.code(400).send({ error: 'Can only extend active contracts' });
        return;
      }

      const newEnd = new Date(newEndDate);
      const currentEnd = new Date(contract.end_date);

      if (newEnd <= currentEnd) {
        reply.code(400).send({ error: 'New end date must be after current end date' });
        return;
      }

      // Update the contract
      await vipRepository.extendContract(parseInt(id), newEnd, user.username, 'Contract extension requested');

      // Log the event with comprehensive audit details
      await eventRepository.logEvent({
        kiosk_id: contract.kiosk_id,
        locker_id: contract.locker_id,
        event_type: 'vip_contract_extended',
        staff_user: user.username,
        details: {
          contract_id: parseInt(id),
          old_end_date: contract.end_date,
          new_end_date: newEndDate,
          extension_days: Math.ceil((new Date(newEndDate).getTime() - new Date(contract.end_date).getTime()) / (1000 * 60 * 60 * 24)),
          extended_by: user.username,
          ip_address: (request as any).ip,
          user_agent: request.headers['user-agent']
        }
      });

      reply.send({
        success: true,
        message: 'VIP contract extended successfully'
      });
    } catch (error) {
      fastify.log.error('Failed to extend VIP contract:', error);
      reply.code(500).send({ error: 'Failed to extend VIP contract' });
    }
  });

  // Change VIP contract card
  fastify.post('/:id/change-card', {
    preHandler: [requirePermission(Permission.MANAGE_VIP), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        required: ['newCard'],
        properties: {
          newCard: { type: 'string', minLength: 1 },
          reason: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { newCard, reason } = request.body as { newCard: string; reason?: string };
    const user = (request as any).user as User;

    try {
      const contract = await vipRepository.getContract(parseInt(id));
      if (!contract) {
        reply.code(404).send({ error: 'VIP contract not found' });
        return;
      }

      if (contract.status !== 'active') {
        reply.code(400).send({ error: 'Can only change cards for active contracts' });
        return;
      }

      // Check if new card is already in use
      const existingContract = await vipRepository.getActiveContractByCard(newCard);
      if (existingContract && existingContract.id !== parseInt(id)) {
        reply.code(400).send({ error: 'New RFID card is already assigned to another VIP contract' });
        return;
      }

      const oldCard = contract.rfid_card;

      // Update the contract
      await vipRepository.changeCard(parseInt(id), newCard, user.username, reason);

      // Log the event with comprehensive audit details
      await eventRepository.logEvent({
        kiosk_id: contract.kiosk_id,
        locker_id: contract.locker_id,
        event_type: 'vip_card_changed',
        staff_user: user.username,
        details: {
          contract_id: parseInt(id),
          old_card: oldCard,
          new_card: newCard,
          reason: reason || 'Card change requested',
          changed_by: user.username,
          change_timestamp: new Date().toISOString(),
          ip_address: (request as any).ip,
          user_agent: request.headers['user-agent']
        }
      });

      reply.send({
        success: true,
        message: 'VIP contract card changed successfully'
      });
    } catch (error) {
      fastify.log.error('Failed to change VIP contract card:', error);
      reply.code(500).send({ error: 'Failed to change VIP contract card' });
    }
  });

  // Cancel VIP contract
  fastify.post('/:id/cancel', {
    preHandler: [requirePermission(Permission.MANAGE_VIP), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = request.body as { reason: string };
    const user = (request as any).user as User;

    try {
      const contract = await vipRepository.getContract(parseInt(id));
      if (!contract) {
        reply.code(404).send({ error: 'VIP contract not found' });
        return;
      }

      if (contract.status !== 'active') {
        reply.code(400).send({ error: 'Contract is already cancelled or expired' });
        return;
      }

      // Cancel the contract
      await vipRepository.cancelContract(parseInt(id), user.username, reason);

      // Remove VIP status from locker
      const db = dbManager.getDatabase();
      db.prepare(
        'UPDATE lockers SET is_vip = 0, updated_at = ? WHERE kiosk_id = ? AND id = ?'
      ).run(new Date().toISOString(), contract.kiosk_id, contract.locker_id);

      // Log the event with comprehensive audit details
      await eventRepository.logEvent({
        kiosk_id: contract.kiosk_id,
        locker_id: contract.locker_id,
        event_type: 'vip_contract_cancelled',
        staff_user: user.username,
        details: {
          contract_id: parseInt(id),
          reason,
          cancelled_date: new Date().toISOString(),
          cancelled_by: user.username,
          original_end_date: contract.end_date,
          days_remaining: Math.ceil((new Date(contract.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
          rfid_card: contract.rfid_card,
          ip_address: (request as any).ip,
          user_agent: request.headers['user-agent']
        }
      });

      reply.send({
        success: true,
        message: 'VIP contract cancelled successfully'
      });
    } catch (error) {
      fastify.log.error('Failed to cancel VIP contract:', error);
      reply.code(500).send({ error: 'Failed to cancel VIP contract' });
    }
  });

  // Get available lockers for VIP assignment
  fastify.get('/available-lockers/:kioskId?', {
    preHandler: [requirePermission(Permission.MANAGE_VIP)]
  }, async (request, reply) => {
    const { kioskId } = request.params as { kioskId?: string };

    try {
      const lockers = await lockerStateManager.getAllLockers(kioskId, 'Free');
      const availableLockers = lockers.filter(locker => !locker.is_vip);

      reply.send({
        lockers: availableLockers
      });
    } catch (error) {
      fastify.log.error('Failed to get available lockers:', error);
      reply.code(500).send({ error: 'Failed to retrieve available lockers' });
    }
  });

  // Get VIP contract history
  fastify.get('/:id/history', {
    preHandler: [requirePermission(Permission.MANAGE_VIP)]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const contract = await vipRepository.getContract(parseInt(id));
      if (!contract) {
        reply.code(404).send({ error: 'VIP contract not found' });
        return;
      }

      // Get detailed history from the history repository
      const history = await vipHistoryRepository.getContractHistory(parseInt(id));

      // Get related events from the events table
      const db = dbManager.getDatabase();
      const events = db.prepare(`
        SELECT * FROM events 
        WHERE kiosk_id = ? AND locker_id = ? 
        AND (event_type LIKE 'vip_%' OR JSON_EXTRACT(details, '$.contract_id') = ?)
        ORDER BY timestamp DESC 
        LIMIT 50
      `).all(contract.kiosk_id, contract.locker_id, parseInt(id));

      reply.send({
        contract,
        history,
        events
      });
    } catch (error) {
      fastify.log.error('Failed to get VIP contract history:', error);
      reply.code(500).send({ error: 'Failed to retrieve VIP contract history' });
    }
  });

  // Request VIP contract transfer
  fastify.post('/:id/transfer', {
    preHandler: [requirePermission(Permission.MANAGE_VIP), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        required: ['toKioskId', 'toLockerId', 'reason'],
        properties: {
          toKioskId: { type: 'string', minLength: 1 },
          toLockerId: { type: 'number', minimum: 1 },
          newRfidCard: { type: 'string' },
          reason: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { toKioskId, toLockerId, newRfidCard, reason } = request.body as {
      toKioskId: string;
      toLockerId: number;
      newRfidCard?: string;
      reason: string;
    };
    const user = (request as any).user as User;

    try {
      const contract = await vipRepository.getContract(parseInt(id));
      if (!contract) {
        reply.code(404).send({ error: 'VIP contract not found' });
        return;
      }

      if (contract.status !== 'active') {
        reply.code(400).send({ error: 'Can only transfer active contracts' });
        return;
      }

      // Check if target locker exists and is available
      const targetLocker = await lockerStateManager.getLocker(toKioskId, toLockerId);
      if (!targetLocker) {
        reply.code(404).send({ error: 'Target locker not found' });
        return;
      }

      if (targetLocker.status !== 'Free' || targetLocker.is_vip) {
        reply.code(400).send({ error: 'Target locker is not available for VIP assignment' });
        return;
      }

      // Check if new card is already in use (if provided)
      if (newRfidCard) {
        const existingContract = await vipRepository.getActiveContractByCard(newRfidCard);
        if (existingContract && existingContract.id !== parseInt(id)) {
          reply.code(400).send({ error: 'New RFID card is already assigned to another VIP contract' });
          return;
        }
      }

      // Check for pending transfers on either locker
      const hasPendingTransfers = await vipTransferRepository.hasLockerPendingTransfers(contract.kiosk_id, contract.locker_id) ||
                                  await vipTransferRepository.hasLockerPendingTransfers(toKioskId, toLockerId);
      
      if (hasPendingTransfers) {
        reply.code(400).send({ error: 'There are pending transfers involving one of the lockers' });
        return;
      }

      // Create transfer request
      const transferRequest = await vipTransferRepository.create({
        contract_id: parseInt(id),
        from_kiosk_id: contract.kiosk_id,
        from_locker_id: contract.locker_id,
        to_kiosk_id: toKioskId,
        to_locker_id: toLockerId,
        new_rfid_card: newRfidCard,
        reason,
        requested_by: user.username,
        status: 'pending'
      });

      // Log the transfer request event with comprehensive audit details
      await eventRepository.logEvent({
        kiosk_id: contract.kiosk_id,
        locker_id: contract.locker_id,
        event_type: 'vip_transfer_requested',
        staff_user: user.username,
        details: {
          contract_id: parseInt(id),
          transfer_request_id: transferRequest.id,
          from_location: `${contract.kiosk_id}:${contract.locker_id}`,
          to_location: `${toKioskId}:${toLockerId}`,
          new_card: newRfidCard,
          old_card: contract.rfid_card,
          card_will_change: !!newRfidCard,
          reason,
          requested_by: user.username,
          request_timestamp: new Date().toISOString(),
          ip_address: (request as any).ip,
          user_agent: request.headers['user-agent']
        }
      });

      reply.code(201).send({
        success: true,
        transfer_request: transferRequest,
        message: 'VIP transfer request created successfully'
      });
    } catch (error) {
      fastify.log.error('Failed to create VIP transfer request:', error);
      reply.code(500).send({ error: 'Failed to create VIP transfer request' });
    }
  });

  // Get VIP transfer requests
  fastify.get('/transfers', {
    preHandler: [requirePermission(Permission.MANAGE_VIP)]
  }, async (request, reply) => {
    const query = request.query as {
      status?: string;
      contractId?: string;
    };

    try {
      const filter: any = {};
      
      if (query.status) {
        filter.status = query.status;
      }
      
      if (query.contractId) {
        filter.contract_id = parseInt(query.contractId);
      }

      const transfers = await vipTransferRepository.findAll(filter);

      reply.send({
        transfers,
        total: transfers.length
      });
    } catch (error) {
      fastify.log.error('Failed to get VIP transfer requests:', error);
      reply.code(500).send({ error: 'Failed to retrieve VIP transfer requests' });
    }
  });

  // Approve VIP transfer request
  fastify.post('/transfers/:transferId/approve', {
    preHandler: [requirePermission(Permission.MANAGE_VIP), requireCsrfToken()]
  }, async (request, reply) => {
    const { transferId } = request.params as { transferId: string };
    const user = (request as any).user as User;

    try {
      const transfer = await vipTransferRepository.findById(parseInt(transferId));
      if (!transfer) {
        reply.code(404).send({ error: 'Transfer request not found' });
        return;
      }

      if (transfer.status !== 'pending') {
        reply.code(400).send({ error: 'Transfer request is not pending' });
        return;
      }

      // Approve the transfer
      await vipTransferRepository.approveTransfer(parseInt(transferId), user.username);

      // Execute the transfer
      await executeVipTransfer(transfer, user.username);

      reply.send({
        success: true,
        message: 'VIP transfer approved and executed successfully'
      });
    } catch (error) {
      fastify.log.error('Failed to approve VIP transfer:', error);
      reply.code(500).send({ error: 'Failed to approve VIP transfer' });
    }
  });

  // Reject VIP transfer request
  fastify.post('/transfers/:transferId/reject', {
    preHandler: [requirePermission(Permission.MANAGE_VIP), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { transferId } = request.params as { transferId: string };
    const { reason } = request.body as { reason: string };
    const user = (request as any).user as User;

    try {
      const transfer = await vipTransferRepository.findById(parseInt(transferId));
      if (!transfer) {
        reply.code(404).send({ error: 'Transfer request not found' });
        return;
      }

      if (transfer.status !== 'pending') {
        reply.code(400).send({ error: 'Transfer request is not pending' });
        return;
      }

      // Reject the transfer
      await vipTransferRepository.rejectTransfer(parseInt(transferId), user.username, reason);

      // Log the rejection event with comprehensive audit details
      await eventRepository.logEvent({
        kiosk_id: transfer.from_kiosk_id,
        locker_id: transfer.from_locker_id,
        event_type: 'vip_transfer_rejected',
        staff_user: user.username,
        details: {
          contract_id: transfer.contract_id,
          transfer_request_id: parseInt(transferId),
          rejection_reason: reason,
          rejected_by: user.username,
          rejection_timestamp: new Date().toISOString(),
          original_request: {
            from_location: `${transfer.from_kiosk_id}:${transfer.from_locker_id}`,
            to_location: `${transfer.to_kiosk_id}:${transfer.to_locker_id}`,
            requested_by: transfer.requested_by,
            reason: transfer.reason
          },
          ip_address: (request as any).ip,
          user_agent: request.headers['user-agent']
        }
      });

      reply.send({
        success: true,
        message: 'VIP transfer rejected successfully'
      });
    } catch (error) {
      fastify.log.error('Failed to reject VIP transfer:', error);
      reply.code(500).send({ error: 'Failed to reject VIP transfer' });
    }
  });

  // Helper function to execute VIP transfer
  async function executeVipTransfer(transfer: any, approvedBy: string) {
    const db = dbManager.getDatabase();
    
    try {
      // Start transaction
      db.exec('BEGIN TRANSACTION');

      // Remove VIP status from old locker
      db.prepare(
        'UPDATE lockers SET is_vip = 0, updated_at = ? WHERE kiosk_id = ? AND id = ?'
      ).run(new Date().toISOString(), transfer.from_kiosk_id, transfer.from_locker_id);

      // Set VIP status on new locker
      db.prepare(
        'UPDATE lockers SET is_vip = 1, updated_at = ? WHERE kiosk_id = ? AND id = ?'
      ).run(new Date().toISOString(), transfer.to_kiosk_id, transfer.to_locker_id);

      // Transfer the contract
      await vipRepository.transferContract(
        transfer.contract_id,
        transfer.to_kiosk_id,
        transfer.to_locker_id,
        approvedBy,
        transfer.new_rfid_card,
        `Transfer approved: ${transfer.reason}`
      );

      // Mark transfer as completed
      await vipTransferRepository.completeTransfer(transfer.id);

      // Log the completion events with comprehensive audit details
      await eventRepository.logEvent({
        kiosk_id: transfer.from_kiosk_id,
        locker_id: transfer.from_locker_id,
        event_type: 'vip_transfer_completed',
        staff_user: approvedBy,
        details: {
          contract_id: transfer.contract_id,
          transfer_request_id: transfer.id,
          from_location: `${transfer.from_kiosk_id}:${transfer.from_locker_id}`,
          to_location: `${transfer.to_kiosk_id}:${transfer.to_locker_id}`,
          old_card: transfer.new_rfid_card ? 'replaced' : 'kept',
          new_card: transfer.new_rfid_card,
          card_changed: !!transfer.new_rfid_card,
          approved_by: approvedBy,
          completion_timestamp: new Date().toISOString(),
          original_request: {
            requested_by: transfer.requested_by,
            reason: transfer.reason,
            requested_at: transfer.created_at
          }
        }
      });

      // Also log to the new location
      await eventRepository.logEvent({
        kiosk_id: transfer.to_kiosk_id,
        locker_id: transfer.to_locker_id,
        event_type: 'vip_transfer_completed',
        staff_user: approvedBy,
        details: {
          contract_id: transfer.contract_id,
          transfer_request_id: transfer.id,
          from_location: `${transfer.from_kiosk_id}:${transfer.from_locker_id}`,
          to_location: `${transfer.to_kiosk_id}:${transfer.to_locker_id}`,
          old_card: transfer.new_rfid_card ? 'replaced' : 'kept',
          new_card: transfer.new_rfid_card,
          card_changed: !!transfer.new_rfid_card,
          approved_by: approvedBy,
          completion_timestamp: new Date().toISOString(),
          transfer_direction: 'incoming'
        }
      });

      // Commit transaction
      db.exec('COMMIT');
    } catch (error) {
      // Rollback transaction
      db.exec('ROLLBACK');
      throw error;
    }
  }
}