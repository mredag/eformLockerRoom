import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { vipRoutes } from '../routes/vip-routes';
import { AuthService } from '../services/auth-service';
import { SessionManager } from '../services/session-manager';

describe('VIP Routes', () => {
  let fastify: any;
  let dbManager: DatabaseManager;
  let authService: AuthService;
  let sessionManager: SessionManager;

  beforeEach(async () => {
    try {
      // Initialize database with a unique name for each test
      const dbPath = `:memory:`;
      dbManager = new DatabaseManager(dbPath);
      await dbManager.initialize();

      // Initialize services
      authService = new AuthService(dbManager);
      sessionManager = new SessionManager();

      // Create test admin user
      await authService.createUser({
        username: 'admin',
        password: 'password123',
        role: 'admin'
      });

      // Initialize Fastify
      fastify = Fastify({ logger: false });
      
      // Register VIP routes
      await fastify.register(vipRoutes, { 
        prefix: '/api/vip',
        dbManager 
      });

      // Mock authentication middleware
      fastify.addHook('preHandler', async (request: any) => {
        request.user = {
          id: 1,
          username: 'admin',
          role: 'admin'
        };
      });

      await fastify.ready();
    } catch (error) {
      console.error('Setup failed:', error);
      throw error;
    }
  });

  afterEach(async () => {
    try {
      if (fastify) {
        await fastify.close();
      }
      if (dbManager) {
        await dbManager.close();
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  });

  describe('GET /', () => {
    it('should return empty contracts list initially', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/vip'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.contracts).toEqual([]);
      expect(data.total).toBe(0);
    });
  });

  describe('GET /available-lockers/:kioskId', () => {
    it('should return available lockers for VIP assignment', async () => {
      // First create some test lockers
      const db = dbManager.getDatabase();
      db.prepare(`
        INSERT INTO lockers (kiosk_id, id, status, is_vip) 
        VALUES ('kiosk1', 1, 'Free', 0), ('kiosk1', 2, 'Owned', 0), ('kiosk1', 3, 'Free', 1)
      `).run();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/vip/available-lockers/kiosk1'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.lockers).toHaveLength(1); // Only one Free non-VIP locker
      expect(data.lockers[0].id).toBe(1);
      expect(data.lockers[0].status).toBe('Free');
      expect(data.lockers[0].is_vip).toBe(false);
    });
  });

  describe('POST /', () => {
    it('should create a new VIP contract', async () => {
      // Create a test locker
      const db = dbManager.getDatabase();
      db.prepare(`
        INSERT INTO lockers (kiosk_id, id, status, is_vip) 
        VALUES ('kiosk1', 1, 'Free', 0)
      `).run();

      const contractData = {
        kioskId: 'kiosk1',
        lockerId: 1,
        rfidCard: 'card123',
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/vip',
        payload: contractData,
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': 'test-token'
        }
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.contract.kiosk_id).toBe('kiosk1');
      expect(data.contract.locker_id).toBe(1);
      expect(data.contract.rfid_card).toBe('card123');
      expect(data.contract.status).toBe('active');
    });

    it('should reject contract for occupied locker', async () => {
      // Create an occupied locker
      const db = dbManager.getDatabase();
      db.prepare(`
        INSERT INTO lockers (kiosk_id, id, status, is_vip) 
        VALUES ('kiosk1', 1, 'Owned', 0)
      `).run();

      const contractData = {
        kioskId: 'kiosk1',
        lockerId: 1,
        rfidCard: 'card123',
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/vip',
        payload: contractData,
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': 'test-token'
        }
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.error).toContain('not available');
    });
  });

  describe('POST /:id/extend', () => {
    it('should extend an active VIP contract', async () => {
      // Create test data
      const db = dbManager.getDatabase();
      db.prepare(`
        INSERT INTO lockers (kiosk_id, id, status, is_vip) 
        VALUES ('kiosk1', 1, 'Free', 1)
      `).run();

      const contractId = db.prepare(`
        INSERT INTO vip_contracts (kiosk_id, locker_id, rfid_card, start_date, end_date, status, created_by)
        VALUES ('kiosk1', 1, 'card123', '2024-01-01', '2024-06-30', 'active', 'admin')
      `).run().lastInsertRowid;

      const response = await fastify.inject({
        method: 'POST',
        url: `/api/vip/${contractId}/extend`,
        payload: { newEndDate: '2024-12-31' },
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': 'test-token'
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
    });
  });

  describe('POST /:id/cancel', () => {
    it('should cancel an active VIP contract', async () => {
      // Create test data
      const db = dbManager.getDatabase();
      db.prepare(`
        INSERT INTO lockers (kiosk_id, id, status, is_vip) 
        VALUES ('kiosk1', 1, 'Free', 1)
      `).run();

      const contractId = db.prepare(`
        INSERT INTO vip_contracts (kiosk_id, locker_id, rfid_card, start_date, end_date, status, created_by)
        VALUES ('kiosk1', 1, 'card123', '2024-01-01', '2024-12-31', 'active', 'admin')
      `).run().lastInsertRowid;

      const response = await fastify.inject({
        method: 'POST',
        url: `/api/vip/${contractId}/cancel`,
        payload: { reason: 'Test cancellation' },
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': 'test-token'
        }
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);

      // Verify locker is no longer VIP
      const locker = db.prepare('SELECT is_vip FROM lockers WHERE kiosk_id = ? AND id = ?')
        .get('kiosk1', 1);
      expect(locker.is_vip).toBe(0);
    });
  });

  describe('VIP Transfer Workflow', () => {
    describe('POST /:id/transfer', () => {
      it('should create a VIP transfer request', async () => {
        // Create test data
        const db = dbManager.getDatabase();
        
        // Create source and target lockers
        db.prepare(`
          INSERT INTO lockers (kiosk_id, id, status, is_vip) 
          VALUES ('kiosk1', 1, 'Free', 1), ('kiosk2', 2, 'Free', 0)
        `).run();

        const contractId = db.prepare(`
          INSERT INTO vip_contracts (kiosk_id, locker_id, rfid_card, start_date, end_date, status, created_by)
          VALUES ('kiosk1', 1, 'card123', '2024-01-01', '2024-12-31', 'active', 'admin')
        `).run().lastInsertRowid;

        const transferData = {
          toKioskId: 'kiosk2',
          toLockerId: 2,
          newRfidCard: 'newcard456',
          reason: 'Room change request'
        };

        const response = await fastify.inject({
          method: 'POST',
          url: `/api/vip/${contractId}/transfer`,
          payload: transferData,
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': 'test-token'
          }
        });

        expect(response.statusCode).toBe(201);
        const data = JSON.parse(response.payload);
        expect(data.success).toBe(true);
        expect(data.transfer_request).toBeDefined();
        expect(data.transfer_request.status).toBe('pending');
        expect(data.transfer_request.from_kiosk_id).toBe('kiosk1');
        expect(data.transfer_request.to_kiosk_id).toBe('kiosk2');
        expect(data.transfer_request.new_rfid_card).toBe('newcard456');
      });

      it('should reject transfer to occupied locker', async () => {
        // Create test data
        const db = dbManager.getDatabase();
        
        // Create source locker (VIP) and occupied target locker
        db.prepare(`
          INSERT INTO lockers (kiosk_id, id, status, is_vip) 
          VALUES ('kiosk1', 1, 'Free', 1), ('kiosk2', 2, 'Owned', 0)
        `).run();

        const contractId = db.prepare(`
          INSERT INTO vip_contracts (kiosk_id, locker_id, rfid_card, start_date, end_date, status, created_by)
          VALUES ('kiosk1', 1, 'card123', '2024-01-01', '2024-12-31', 'active', 'admin')
        `).run().lastInsertRowid;

        const transferData = {
          toKioskId: 'kiosk2',
          toLockerId: 2,
          reason: 'Room change request'
        };

        const response = await fastify.inject({
          method: 'POST',
          url: `/api/vip/${contractId}/transfer`,
          payload: transferData,
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': 'test-token'
          }
        });

        expect(response.statusCode).toBe(400);
        const data = JSON.parse(response.payload);
        expect(data.error).toContain('not available');
      });

      it('should reject transfer with duplicate card', async () => {
        // Create test data
        const db = dbManager.getDatabase();
        
        // Create lockers and existing contract with card
        db.prepare(`
          INSERT INTO lockers (kiosk_id, id, status, is_vip) 
          VALUES ('kiosk1', 1, 'Free', 1), ('kiosk2', 2, 'Free', 0), ('kiosk3', 3, 'Free', 1)
        `).run();

        const contractId1 = db.prepare(`
          INSERT INTO vip_contracts (kiosk_id, locker_id, rfid_card, start_date, end_date, status, created_by)
          VALUES ('kiosk1', 1, 'card123', '2024-01-01', '2024-12-31', 'active', 'admin')
        `).run().lastInsertRowid;

        db.prepare(`
          INSERT INTO vip_contracts (kiosk_id, locker_id, rfid_card, start_date, end_date, status, created_by)
          VALUES ('kiosk3', 3, 'existingcard', '2024-01-01', '2024-12-31', 'active', 'admin')
        `).run();

        const transferData = {
          toKioskId: 'kiosk2',
          toLockerId: 2,
          newRfidCard: 'existingcard', // This card is already in use
          reason: 'Room change request'
        };

        const response = await fastify.inject({
          method: 'POST',
          url: `/api/vip/${contractId1}/transfer`,
          payload: transferData,
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': 'test-token'
          }
        });

        expect(response.statusCode).toBe(400);
        const data = JSON.parse(response.payload);
        expect(data.error).toContain('already assigned');
      });
    });

    describe('GET /transfers', () => {
      it('should return all transfer requests', async () => {
        // Create test data
        const db = dbManager.getDatabase();
        
        db.prepare(`
          INSERT INTO lockers (kiosk_id, id, status, is_vip) 
          VALUES ('kiosk1', 1, 'Free', 1)
        `).run();

        const contractId = db.prepare(`
          INSERT INTO vip_contracts (kiosk_id, locker_id, rfid_card, start_date, end_date, status, created_by)
          VALUES ('kiosk1', 1, 'card123', '2024-01-01', '2024-12-31', 'active', 'admin')
        `).run().lastInsertRowid;

        db.prepare(`
          INSERT INTO vip_transfer_requests (contract_id, from_kiosk_id, from_locker_id, to_kiosk_id, to_locker_id, reason, requested_by, status)
          VALUES (?, 'kiosk1', 1, 'kiosk2', 2, 'Test transfer', 'admin', 'pending')
        `).run(contractId);

        const response = await fastify.inject({
          method: 'GET',
          url: '/api/vip/transfers'
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        expect(data.transfers).toHaveLength(1);
        expect(data.transfers[0].status).toBe('pending');
        expect(data.transfers[0].reason).toBe('Test transfer');
      });
    });

    describe('POST /transfers/:transferId/approve', () => {
      it('should approve and execute a transfer request', async () => {
        // Create test data
        const db = dbManager.getDatabase();
        
        // Create lockers
        db.prepare(`
          INSERT INTO lockers (kiosk_id, id, status, is_vip) 
          VALUES ('kiosk1', 1, 'Free', 1), ('kiosk2', 2, 'Free', 0)
        `).run();

        const contractId = db.prepare(`
          INSERT INTO vip_contracts (kiosk_id, locker_id, rfid_card, start_date, end_date, status, created_by)
          VALUES ('kiosk1', 1, 'card123', '2024-01-01', '2024-12-31', 'active', 'admin')
        `).run().lastInsertRowid;

        const transferId = db.prepare(`
          INSERT INTO vip_transfer_requests (contract_id, from_kiosk_id, from_locker_id, to_kiosk_id, to_locker_id, reason, requested_by, status)
          VALUES (?, 'kiosk1', 1, 'kiosk2', 2, 'Test transfer', 'admin', 'pending')
        `).run(contractId).lastInsertRowid;

        const response = await fastify.inject({
          method: 'POST',
          url: `/api/vip/transfers/${transferId}/approve`,
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': 'test-token'
          }
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        expect(data.success).toBe(true);

        // Verify transfer was executed
        const updatedContract = db.prepare('SELECT * FROM vip_contracts WHERE id = ?').get(contractId);
        expect(updatedContract.kiosk_id).toBe('kiosk2');
        expect(updatedContract.locker_id).toBe(2);

        // Verify locker VIP status was transferred
        const oldLocker = db.prepare('SELECT is_vip FROM lockers WHERE kiosk_id = ? AND id = ?').get('kiosk1', 1);
        const newLocker = db.prepare('SELECT is_vip FROM lockers WHERE kiosk_id = ? AND id = ?').get('kiosk2', 2);
        expect(oldLocker.is_vip).toBe(0);
        expect(newLocker.is_vip).toBe(1);

        // Verify transfer request status
        const transfer = db.prepare('SELECT status FROM vip_transfer_requests WHERE id = ?').get(transferId);
        expect(transfer.status).toBe('completed');
      });
    });

    describe('POST /transfers/:transferId/reject', () => {
      it('should reject a transfer request', async () => {
        // Create test data
        const db = dbManager.getDatabase();
        
        db.prepare(`
          INSERT INTO lockers (kiosk_id, id, status, is_vip) 
          VALUES ('kiosk1', 1, 'Free', 1)
        `).run();

        const contractId = db.prepare(`
          INSERT INTO vip_contracts (kiosk_id, locker_id, rfid_card, start_date, end_date, status, created_by)
          VALUES ('kiosk1', 1, 'card123', '2024-01-01', '2024-12-31', 'active', 'admin')
        `).run().lastInsertRowid;

        const transferId = db.prepare(`
          INSERT INTO vip_transfer_requests (contract_id, from_kiosk_id, from_locker_id, to_kiosk_id, to_locker_id, reason, requested_by, status)
          VALUES (?, 'kiosk1', 1, 'kiosk2', 2, 'Test transfer', 'admin', 'pending')
        `).run(contractId).lastInsertRowid;

        const response = await fastify.inject({
          method: 'POST',
          url: `/api/vip/transfers/${transferId}/reject`,
          payload: { reason: 'Target location not suitable' },
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': 'test-token'
          }
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        expect(data.success).toBe(true);

        // Verify transfer request was rejected
        const transfer = db.prepare('SELECT status, rejection_reason FROM vip_transfer_requests WHERE id = ?').get(transferId);
        expect(transfer.status).toBe('rejected');
        expect(transfer.rejection_reason).toBe('Target location not suitable');

        // Verify contract was not changed
        const contract = db.prepare('SELECT kiosk_id, locker_id FROM vip_contracts WHERE id = ?').get(contractId);
        expect(contract.kiosk_id).toBe('kiosk1');
        expect(contract.locker_id).toBe(1);
      });
    });
  });

  describe('VIP Audit and History', () => {
    describe('GET /:id/history', () => {
      it('should return comprehensive contract history', async () => {
        // Create test data
        const db = dbManager.getDatabase();
        
        db.prepare(`
          INSERT INTO lockers (kiosk_id, id, status, is_vip) 
          VALUES ('kiosk1', 1, 'Free', 1)
        `).run();

        const contractId = db.prepare(`
          INSERT INTO vip_contracts (kiosk_id, locker_id, rfid_card, start_date, end_date, status, created_by)
          VALUES ('kiosk1', 1, 'card123', '2024-01-01', '2024-12-31', 'active', 'admin')
        `).run().lastInsertRowid;

        // Add some history entries
        db.prepare(`
          INSERT INTO vip_contract_history (contract_id, action_type, performed_by, new_values, details)
          VALUES (?, 'created', 'admin', '{"rfid_card": "card123"}', '{"operation": "create"}')
        `).run(contractId);

        // Add some events
        db.prepare(`
          INSERT INTO events (kiosk_id, locker_id, event_type, staff_user, details)
          VALUES ('kiosk1', 1, 'vip_contract_created', 'admin', '{"contract_id": ' + contractId + '}')
        `).run();

        const response = await fastify.inject({
          method: 'GET',
          url: `/api/vip/${contractId}/history`
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        expect(data.contract).toBeDefined();
        expect(data.history).toBeDefined();
        expect(data.events).toBeDefined();
        expect(data.contract.id).toBe(contractId);
        expect(data.history).toHaveLength(1);
        expect(data.events).toHaveLength(1);
      });

      it('should return 404 for non-existent contract', async () => {
        const response = await fastify.inject({
          method: 'GET',
          url: '/api/vip/99999/history'
        });

        expect(response.statusCode).toBe(404);
        const data = JSON.parse(response.payload);
        expect(data.error).toContain('not found');
      });
    });
  });

  describe('Audit Logging Validation', () => {
    it('should create comprehensive audit logs for all VIP operations', async () => {
      // Create test data
      const db = dbManager.getDatabase();
      
      db.prepare(`
        INSERT INTO lockers (kiosk_id, id, status, is_vip) 
        VALUES ('kiosk1', 1, 'Free', 0)
      `).run();

      // Create contract
      const contractResponse = await fastify.inject({
        method: 'POST',
        url: '/api/vip',
        payload: {
          kioskId: 'kiosk1',
          lockerId: 1,
          rfidCard: 'card123',
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        },
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': 'test-token'
        }
      });

      expect(contractResponse.statusCode).toBe(201);
      const contractData = JSON.parse(contractResponse.payload);
      const contractId = contractData.contract.id;

      // Verify audit logs were created
      const events = db.prepare('SELECT * FROM events WHERE event_type = ? AND staff_user = ?')
        .all('vip_contract_created', 'admin');
      expect(events).toHaveLength(1);
      
      const eventDetails = JSON.parse(events[0].details);
      expect(eventDetails.contract_id).toBe(contractId);
      expect(eventDetails.rfid_card).toBe('card123');
      expect(eventDetails.created_by).toBe('admin');

      // Verify history was created
      const history = db.prepare('SELECT * FROM vip_contract_history WHERE contract_id = ? AND action_type = ?')
        .all(contractId, 'created');
      expect(history).toHaveLength(1);
      expect(history[0].performed_by).toBe('admin');
    });
  });
});
