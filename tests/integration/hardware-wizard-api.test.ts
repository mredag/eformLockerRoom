/**
 * Integration Tests for Hardware Configuration Wizard API Endpoints
 * 
 * Tests all new API endpoints with database integration, WebSocket communication,
 * and real-time updates. Includes wizard session management and state persistence.
 * 
 * Requirements: All API layer requirements (1.1-10.6)
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestServer } from '../helpers/test-server';
import { DatabaseManager } from '../../shared/database/database-manager';
import { ConfigManager } from '../../shared/services/config-manager';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';

// Mock external dependencies
vi.mock('serialport', () => ({
  SerialPort: {
    list: vi.fn().mockResolvedValue([
      {
        path: '/dev/ttyUSB0',
        manufacturer: 'FTDI',
        serialNumber: '12345',
        vendorId: '0403',
        productId: '6001'
      },
      {
        path: '/dev/ttyUSB1',
        manufacturer: 'Prolific',
        serialNumber: '67890',
        vendorId: '067b',
        productId: '2303'
      }
    ])
  }
}));

describe('Hardware Configuration Wizard API - Integration Tests', () => {
  let server: FastifyInstance;
  let dbManager: DatabaseManager;
  let configManager: ConfigManager;
  let wsClient: WebSocket;
  let testSessionId: string;

  beforeAll(async () => {
    // Setup test server
    server = await createTestServer();
    await server.ready();

    // Initialize services
    dbManager = DatabaseManager.getInstance();
    configManager = ConfigManager.getInstance();
    await configManager.initialize();

    // Setup test database
    const db = dbManager.getConnection();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS wizard_sessions (
        session_id TEXT PRIMARY KEY,
        current_step INTEGER NOT NULL,
        max_completed_step INTEGER NOT NULL,
        card_data TEXT,
        test_results TEXT,
        errors TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS hardware_test_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        device_address INTEGER NOT NULL,
        test_type TEXT NOT NULL,
        test_name TEXT NOT NULL,
        success BOOLEAN NOT NULL,
        duration_ms INTEGER,
        details TEXT,
        error_message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES wizard_sessions(session_id)
      );

      CREATE TABLE IF NOT EXISTS configuration_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        change_type TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        success BOOLEAN NOT NULL,
        error_message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES wizard_sessions(session_id)
      );
    `);
  });

  afterAll(async () => {
    if (wsClient) {
      wsClient.close();
    }
    await server.close();
  });

  beforeEach(async () => {
    // Clean test data
    const db = dbManager.getConnection();
    await db.exec('DELETE FROM wizard_sessions');
    await db.exec('DELETE FROM hardware_test_history');
    await db.exec('DELETE FROM configuration_audit');

    // Setup WebSocket connection for real-time tests
    const wsPort = server.server.address()?.port || 3001;
    wsClient = new WebSocket(`ws://localhost:${wsPort}/ws`);
    
    await new Promise((resolve) => {
      wsClient.on('open', resolve);
    });
  });

  afterEach(async () => {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      wsClient.close();
    }
  });

  describe('Hardware Detection API Endpoints', () => {
    describe('GET /api/hardware-config/scan-ports', () => {
      test('should scan and return available serial ports', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/api/hardware-config/scan-ports'
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          ports: expect.any(Array),
          total_found: expect.any(Number),
          usb_rs485_candidates: expect.any(Number),
          scan_timestamp: expect.any(String)
        });

        expect(data.ports).toHaveLength(2);
        expect(data.ports[0]).toMatchObject({
          path: '/dev/ttyUSB0',
          manufacturer: 'FTDI',
          available: true,
          description: expect.any(String)
        });
      });

      test('should handle serial port scan timeout', async () => {
        // Mock timeout scenario
        const { SerialPort } = await import('serialport');
        SerialPort.list = vi.fn().mockImplementation(() => 
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 100)
          )
        );

        const response = await server.inject({
          method: 'GET',
          url: '/api/hardware-config/scan-ports'
        });

        expect(response.statusCode).toBe(500);
        const data = JSON.parse(response.payload);
        expect(data.success).toBe(false);
        expect(data.error).toContain('Timeout');
      });
    });

    describe('GET /api/hardware-config/scan-devices', () => {
      test('should scan Modbus devices on specified port', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/api/hardware-config/scan-devices',
          query: {
            port: '/dev/ttyUSB0',
            start_address: '1',
            end_address: '5',
            timeout: '10000'
          }
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          devices: expect.any(Array),
          scan_range: { start_address: '1', end_address: '5' },
          port: '/dev/ttyUSB0',
          scan_timestamp: expect.any(String)
        });
      });

      test('should require port parameter', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/api/hardware-config/scan-devices'
        });

        expect(response.statusCode).toBe(400);
        const data = JSON.parse(response.payload);
        expect(data.success).toBe(false);
        expect(data.error).toContain('Serial port parameter is required');
      });

      test('should handle scan timeout', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/api/hardware-config/scan-devices',
          query: {
            port: '/dev/ttyUSB0',
            timeout: '1' // Very short timeout
          }
        });

        expect(response.statusCode).toBe(500);
        const data = JSON.parse(response.payload);
        expect(data.success).toBe(false);
        expect(data.error).toContain('timeout');
      });
    });

    describe('GET /api/hardware-config/detect-new-cards', () => {
      test('should detect new relay cards', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/api/hardware-config/detect-new-cards'
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          new_devices: expect.any(Array),
          existing_devices: expect.any(Array),
          total_detected: expect.any(Number),
          known_addresses: expect.any(Array),
          scan_port: expect.any(String),
          scan_timestamp: expect.any(String),
          recommendations: expect.any(Array)
        });
      });
    });
  });

  describe('Slave Address Management API Endpoints', () => {
    describe('POST /api/hardware-config/set-slave-address', () => {
      test('should configure slave address via broadcast', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/set-slave-address',
          payload: {
            current_address: 0, // Broadcast
            new_address: 2,
            verify: true
          }
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          old_address: 0,
          new_address: 2,
          verification_passed: expect.any(Boolean),
          configuration_time_ms: expect.any(Number)
        });
      });

      test('should validate address range', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/set-slave-address',
          payload: {
            current_address: 1,
            new_address: 256 // Invalid address
          }
        });

        expect(response.statusCode).toBe(400);
        const data = JSON.parse(response.payload);
        expect(data.success).toBe(false);
        expect(data.error).toContain('Invalid address');
      });

      test('should require valid payload', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/set-slave-address',
          payload: {} // Missing required fields
        });

        expect(response.statusCode).toBe(400);
        const data = JSON.parse(response.payload);
        expect(data.success).toBe(false);
      });
    });

    describe('GET /api/hardware-config/read-slave-address', () => {
      test('should read current slave address', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/api/hardware-config/read-slave-address',
          query: { address: '1' }
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          address: 1,
          configured_address: expect.any(Number),
          response_time_ms: expect.any(Number)
        });
      });

      test('should handle non-responding device', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/api/hardware-config/read-slave-address',
          query: { address: '99' } // Non-existent address
        });

        expect(response.statusCode).toBe(404);
        const data = JSON.parse(response.payload);
        expect(data.success).toBe(false);
        expect(data.error).toContain('No response');
      });
    });

    describe('GET /api/hardware-config/find-next-address', () => {
      test('should find next available address', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/api/hardware-config/find-next-address',
          query: { exclude: '1,2,3' }
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          next_address: expect.any(Number),
          excluded_addresses: [1, 2, 3],
          scan_range: expect.any(Object)
        });

        expect(data.next_address).toBeGreaterThan(3);
      });
    });
  });

  describe('Hardware Testing API Endpoints', () => {
    describe('POST /api/hardware-config/test-card', () => {
      test('should run comprehensive card test', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/test-card',
          payload: {
            address: 1,
            include_all_relays: false,
            include_performance: true
          }
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          address: 1,
          test_suite: {
            total_tests: expect.any(Number),
            passed_tests: expect.any(Number),
            failed_tests: expect.any(Number),
            results: expect.any(Array),
            overall_success: expect.any(Boolean),
            duration: expect.any(Number)
          }
        });
      });

      test('should emit real-time progress via WebSocket', async () => {
        const progressEvents: any[] = [];
        
        wsClient.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'test_progress') {
            progressEvents.push(message);
          }
        });

        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/test-card',
          payload: { address: 1 }
        });

        expect(response.statusCode).toBe(200);
        
        // Wait for WebSocket messages
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        expect(progressEvents.length).toBeGreaterThan(0);
        expect(progressEvents[0]).toMatchObject({
          type: 'test_progress',
          address: 1,
          progress: expect.any(Number)
        });
      });
    });

    describe('POST /api/hardware-config/test-relay', () => {
      test('should test individual relay', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/test-relay',
          payload: {
            address: 1,
            relay: 5,
            duration_ms: 500
          }
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          address: 1,
          relay: 5,
          test_result: {
            success: expect.any(Boolean),
            duration: expect.any(Number),
            details: expect.any(String)
          }
        });
      });

      test('should validate relay number range', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/test-relay',
          payload: {
            address: 1,
            relay: 17 // Invalid for 16-channel card
          }
        });

        expect(response.statusCode).toBe(400);
        const data = JSON.parse(response.payload);
        expect(data.success).toBe(false);
        expect(data.error).toContain('Invalid relay number');
      });
    });

    describe('POST /api/hardware-config/validate-setup', () => {
      test('should validate complete system setup', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/validate-setup'
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          validation_result: {
            system_healthy: expect.any(Boolean),
            services_running: expect.any(Boolean),
            configuration_valid: expect.any(Boolean),
            hardware_responding: expect.any(Boolean),
            lockers_accessible: expect.any(Boolean),
            issues: expect.any(Array),
            recommendations: expect.any(Array)
          }
        });
      });
    });
  });

  describe('Wizard Session Management API Endpoints', () => {
    describe('POST /api/hardware-config/wizard/create-session', () => {
      test('should create new wizard session', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/wizard/create-session'
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          session: {
            sessionId: expect.stringMatching(/^wizard-[0-9a-f-]+$/),
            currentStep: 1,
            maxCompletedStep: 0,
            status: 'active',
            cardData: expect.any(Object),
            testResults: [],
            errors: [],
            createdAt: expect.any(String),
            lastUpdated: expect.any(String)
          }
        });

        testSessionId = data.session.sessionId;

        // Verify database persistence
        const db = dbManager.getConnection();
        const session = await db.get(
          'SELECT * FROM wizard_sessions WHERE session_id = ?',
          [testSessionId]
        );
        expect(session).toBeTruthy();
      });
    });

    describe('GET /api/hardware-config/wizard/session/:id', () => {
      beforeEach(async () => {
        // Create test session
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/wizard/create-session'
        });
        testSessionId = JSON.parse(response.payload).session.sessionId;
      });

      test('should retrieve existing session', async () => {
        const response = await server.inject({
          method: 'GET',
          url: `/api/hardware-config/wizard/session/${testSessionId}`
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          session: {
            sessionId: testSessionId,
            currentStep: expect.any(Number),
            status: 'active'
          }
        });
      });

      test('should return 404 for non-existent session', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/api/hardware-config/wizard/session/non-existent-id'
        });

        expect(response.statusCode).toBe(404);
        const data = JSON.parse(response.payload);
        expect(data.success).toBe(false);
        expect(data.error).toContain('not found');
      });
    });

    describe('PUT /api/hardware-config/wizard/session/:id', () => {
      beforeEach(async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/wizard/create-session'
        });
        testSessionId = JSON.parse(response.payload).session.sessionId;
      });

      test('should update session data', async () => {
        const updateData = {
          currentStep: 2,
          cardData: {
            serialPort: '/dev/ttyUSB0',
            detectedAddress: 1,
            connectionVerified: true
          }
        };

        const response = await server.inject({
          method: 'PUT',
          url: `/api/hardware-config/wizard/session/${testSessionId}`,
          payload: updateData
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          session: {
            sessionId: testSessionId,
            currentStep: 2,
            cardData: expect.objectContaining({
              serialPort: '/dev/ttyUSB0',
              detectedAddress: 1,
              connectionVerified: true
            })
          }
        });

        // Verify database update
        const db = dbManager.getConnection();
        const session = await db.get(
          'SELECT * FROM wizard_sessions WHERE session_id = ?',
          [testSessionId]
        );
        expect(JSON.parse(session.card_data)).toMatchObject(updateData.cardData);
      });

      test('should emit session update via WebSocket', async () => {
        const updateEvents: any[] = [];
        
        wsClient.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'session_updated') {
            updateEvents.push(message);
          }
        });

        await server.inject({
          method: 'PUT',
          url: `/api/hardware-config/wizard/session/${testSessionId}`,
          payload: { currentStep: 3 }
        });

        await new Promise(resolve => setTimeout(resolve, 100));
        
        expect(updateEvents.length).toBeGreaterThan(0);
        expect(updateEvents[0]).toMatchObject({
          type: 'session_updated',
          sessionId: testSessionId,
          currentStep: 3
        });
      });
    });

    describe('POST /api/hardware-config/wizard/finalize', () => {
      beforeEach(async () => {
        // Create and setup completed session
        const createResponse = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/wizard/create-session'
        });
        testSessionId = JSON.parse(createResponse.payload).session.sessionId;

        // Update session to completed state
        await server.inject({
          method: 'PUT',
          url: `/api/hardware-config/wizard/session/${testSessionId}`,
          payload: {
            maxCompletedStep: 5,
            cardData: {
              testsPassed: true,
              assignedAddress: 2,
              configuration: {
                slave_address: 2,
                channels: 16,
                type: 'waveshare_16ch',
                description: 'Wizard Card 2',
                enabled: true
              }
            }
          }
        });
      });

      test('should finalize wizard and update system configuration', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/wizard/finalize',
          payload: { sessionId: testSessionId }
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          sessionId: testSessionId,
          newCardConfig: expect.objectContaining({
            slave_address: 2,
            channels: 16,
            type: 'waveshare_16ch'
          }),
          systemUpdated: true,
          summary: {
            totalSteps: 5,
            completedSteps: 5
          }
        });

        // Verify configuration audit log
        const db = dbManager.getConnection();
        const auditLog = await db.get(
          'SELECT * FROM configuration_audit WHERE session_id = ? AND change_type = ?',
          [testSessionId, 'add_card']
        );
        expect(auditLog).toBeTruthy();
        expect(auditLog.success).toBe(1);
      });
    });

    describe('POST /api/hardware-config/wizard/validate-step', () => {
      beforeEach(async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/wizard/create-session'
        });
        testSessionId = JSON.parse(response.payload).session.sessionId;
      });

      test('should validate step requirements', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/wizard/validate-step',
          payload: {
            sessionId: testSessionId,
            step: 1
          }
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          validation: {
            valid: expect.any(Boolean),
            canProceed: expect.any(Boolean),
            errors: expect.any(Array),
            warnings: expect.any(Array)
          }
        });
      });
    });

    describe('POST /api/hardware-config/wizard/execute-step', () => {
      beforeEach(async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/wizard/create-session'
        });
        testSessionId = JSON.parse(response.payload).session.sessionId;
      });

      test('should execute step operations', async () => {
        // First setup prerequisites for step 2 (detection)
        await server.inject({
          method: 'PUT',
          url: `/api/hardware-config/wizard/session/${testSessionId}`,
          payload: {
            cardData: { connectionVerified: true }
          }
        });

        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/wizard/execute-step',
          payload: {
            sessionId: testSessionId,
            step: 2
          }
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          result: {
            success: expect.any(Boolean),
            nextStep: expect.any(Number),
            data: expect.any(Object),
            errors: expect.any(Array)
          }
        });
      });
    });

    describe('POST /api/hardware-config/wizard/cancel', () => {
      beforeEach(async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/wizard/create-session'
        });
        testSessionId = JSON.parse(response.payload).session.sessionId;
      });

      test('should cancel wizard session', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/wizard/cancel',
          payload: { sessionId: testSessionId }
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          sessionId: testSessionId,
          message: expect.stringContaining('cancelled')
        });

        // Verify session status update
        const db = dbManager.getConnection();
        const session = await db.get(
          'SELECT status FROM wizard_sessions WHERE session_id = ?',
          [testSessionId]
        );
        expect(session.status).toBe('cancelled');
      });
    });
  });

  describe('Advanced Configuration API Endpoints', () => {
    describe('Manual Configuration', () => {
      test('POST /api/hardware-config/read-register should read device register', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/read-register',
          payload: {
            address: 1,
            register: 0x4000,
            count: 1
          }
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          address: 1,
          register: 0x4000,
          values: expect.any(Array),
          response_time_ms: expect.any(Number)
        });
      });

      test('POST /api/hardware-config/write-register should write device register', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/write-register',
          payload: {
            address: 1,
            register: 0x4000,
            value: 2
          }
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          address: 1,
          register: 0x4000,
          value: 2,
          verification_passed: expect.any(Boolean)
        });
      });
    });

    describe('Bulk Configuration', () => {
      test('POST /api/hardware-config/bulk-sequential-addressing should configure multiple addresses', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/bulk-sequential-addressing',
          payload: {
            start_address: 1,
            count: 3,
            verify: true
          }
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          operation_id: expect.any(String),
          start_address: 1,
          count: 3,
          results: expect.any(Array)
        });

        expect(data.results).toHaveLength(3);
      });

      test('POST /api/hardware-config/bulk-batch-testing should test multiple devices', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/bulk-batch-testing',
          payload: {
            addresses: [1, 2, 3],
            test_types: ['communication', 'relay_basic']
          }
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          operation_id: expect.any(String),
          addresses: [1, 2, 3],
          results: expect.any(Array)
        });
      });
    });

    describe('Configuration Templates', () => {
      test('GET /api/hardware-config/templates should list templates', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/api/hardware-config/templates'
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          templates: expect.any(Array),
          total: expect.any(Number)
        });
      });

      test('POST /api/hardware-config/templates should create template', async () => {
        const templateData = {
          name: 'Test Template',
          description: 'Test configuration template',
          configuration: {
            relay_cards: [
              { slave_address: 1, channels: 16, type: 'waveshare_16ch' }
            ]
          }
        };

        const response = await server.inject({
          method: 'POST',
          url: '/api/hardware-config/templates',
          payload: templateData
        });

        expect(response.statusCode).toBe(200);
        const data = JSON.parse(response.payload);
        
        expect(data).toMatchObject({
          success: true,
          template: expect.objectContaining({
            id: expect.any(String),
            name: 'Test Template',
            description: 'Test configuration template'
          })
        });
      });
    });
  });

  describe('WebSocket Real-Time Communication', () => {
    test('should receive real-time progress updates during operations', async () => {
      const messages: any[] = [];
      
      wsClient.on('message', (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      // Start a long-running operation
      await server.inject({
        method: 'GET',
        url: '/api/hardware-config/scan-devices',
        query: { port: '/dev/ttyUSB0', start_address: '1', end_address: '10' }
      });

      // Wait for messages
      await new Promise(resolve => setTimeout(resolve, 1000));

      const progressMessages = messages.filter(m => m.type === 'scan_progress');
      expect(progressMessages.length).toBeGreaterThan(0);
    });

    test('should receive session state updates', async () => {
      const messages: any[] = [];
      
      wsClient.on('message', (data) => {
        messages.push(JSON.parse(data.toString()));
      });

      // Create session
      const createResponse = await server.inject({
        method: 'POST',
        url: '/api/hardware-config/wizard/create-session'
      });
      const sessionId = JSON.parse(createResponse.payload).session.sessionId;

      // Update session
      await server.inject({
        method: 'PUT',
        url: `/api/hardware-config/wizard/session/${sessionId}`,
        payload: { currentStep: 2 }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const sessionMessages = messages.filter(m => m.type === 'session_updated');
      expect(sessionMessages.length).toBeGreaterThan(0);
      expect(sessionMessages[0]).toMatchObject({
        type: 'session_updated',
        sessionId,
        currentStep: 2
      });
    });
  });

  describe('Database Integration', () => {
    test('should persist wizard session data correctly', async () => {
      // Create session
      const response = await server.inject({
        method: 'POST',
        url: '/api/hardware-config/wizard/create-session'
      });
      const sessionId = JSON.parse(response.payload).session.sessionId;

      // Verify database record
      const db = dbManager.getConnection();
      const session = await db.get(
        'SELECT * FROM wizard_sessions WHERE session_id = ?',
        [sessionId]
      );

      expect(session).toBeTruthy();
      expect(session.session_id).toBe(sessionId);
      expect(session.current_step).toBe(1);
      expect(session.status).toBe('active');
    });

    test('should log hardware test history', async () => {
      // Create session first
      const sessionResponse = await server.inject({
        method: 'POST',
        url: '/api/hardware-config/wizard/create-session'
      });
      const sessionId = JSON.parse(sessionResponse.payload).session.sessionId;

      // Run test
      await server.inject({
        method: 'POST',
        url: '/api/hardware-config/test-card',
        payload: { address: 1, sessionId }
      });

      // Check test history
      const db = dbManager.getConnection();
      const testHistory = await db.all(
        'SELECT * FROM hardware_test_history WHERE session_id = ?',
        [sessionId]
      );

      expect(testHistory.length).toBeGreaterThan(0);
      expect(testHistory[0]).toMatchObject({
        session_id: sessionId,
        device_address: 1,
        test_type: expect.any(String),
        success: expect.any(Number)
      });
    });

    test('should audit configuration changes', async () => {
      // Create and finalize session
      const sessionResponse = await server.inject({
        method: 'POST',
        url: '/api/hardware-config/wizard/create-session'
      });
      const sessionId = JSON.parse(sessionResponse.payload).session.sessionId;

      // Setup completed session
      await server.inject({
        method: 'PUT',
        url: `/api/hardware-config/wizard/session/${sessionId}`,
        payload: {
          maxCompletedStep: 5,
          cardData: {
            testsPassed: true,
            assignedAddress: 2,
            configuration: {
              slave_address: 2,
              channels: 16,
              type: 'waveshare_16ch'
            }
          }
        }
      });

      // Finalize
      await server.inject({
        method: 'POST',
        url: '/api/hardware-config/wizard/finalize',
        payload: { sessionId }
      });

      // Check audit log
      const db = dbManager.getConnection();
      const auditLog = await db.all(
        'SELECT * FROM configuration_audit WHERE session_id = ?',
        [sessionId]
      );

      expect(auditLog.length).toBeGreaterThan(0);
      expect(auditLog[0]).toMatchObject({
        session_id: sessionId,
        change_type: 'add_card',
        success: 1
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle concurrent session operations', async () => {
      // Create session
      const response = await server.inject({
        method: 'POST',
        url: '/api/hardware-config/wizard/create-session'
      });
      const sessionId = JSON.parse(response.payload).session.sessionId;

      // Make concurrent updates
      const promises = [
        server.inject({
          method: 'PUT',
          url: `/api/hardware-config/wizard/session/${sessionId}`,
          payload: { currentStep: 2 }
        }),
        server.inject({
          method: 'PUT',
          url: `/api/hardware-config/wizard/session/${sessionId}`,
          payload: { currentStep: 3 }
        }),
        server.inject({
          method: 'PUT',
          url: `/api/hardware-config/wizard/session/${sessionId}`,
          payload: { currentStep: 4 }
        })
      ];

      const results = await Promise.allSettled(promises);
      
      // At least one should succeed
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThan(0);
    });

    test('should handle malformed requests gracefully', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/hardware-config/set-slave-address',
        payload: { invalid: 'data' }
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    test('should handle service unavailability', async () => {
      // Mock service failure
      vi.doMock('../../shared/services/hardware-detection-service', () => ({
        HardwareDetectionService: {
          getInstance: () => {
            throw new Error('Service unavailable');
          }
        }
      }));

      const response = await server.inject({
        method: 'GET',
        url: '/api/hardware-config/scan-ports'
      });

      expect(response.statusCode).toBe(500);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(false);
    });
  });
});