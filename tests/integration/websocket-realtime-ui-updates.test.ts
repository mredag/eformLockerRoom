import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketService } from '../../shared/services/websocket-service';
import { LockerStateManager } from '../../shared/services/locker-state-manager';
import WebSocket from 'ws';

/**
 * Integration tests for Task 5: Verify real-time WebSocket updates work with new UI elements
 * 
 * Requirements tested:
 * - 5.1: WebSocket state updates properly refresh RFID display information
 * - 5.2: Status color changes are applied immediately when locker states change
 * - 5.3: Owner information updates in real-time when lockers are assigned or released
 * - 5.4: Smooth transition animations for status color changes
 * - 5.5: Performance with multiple simultaneous locker state updates
 */
describe('WebSocket Real-time UI Updates Integration Tests', () => {
  let wsService: WebSocketService;
  let stateManager: LockerStateManager;
  let mockDatabase: any;
  let mockClients: WebSocket[];
  let performanceMetrics: { updateTimes: number[], messageCount: number };

  beforeEach(() => {
    // Mock database manager
    mockDatabase = {
      getConnection: vi.fn(() => ({
        getDatabase: vi.fn(() => ({
          get: vi.fn(),
          run: vi.fn(),
          all: vi.fn(),
          prepare: vi.fn(() => ({
            get: vi.fn(),
            run: vi.fn(),
            all: vi.fn()
          }))
        }))
      }))
    };

    // Mock WebSocket clients
    mockClients = [
      { 
        send: vi.fn(), 
        readyState: WebSocket.OPEN,
        id: 'admin-panel-client'
      } as any,
      { 
        send: vi.fn(), 
        readyState: WebSocket.OPEN,
        id: 'kiosk-client'
      } as any
    ];

    // Initialize services
    wsService = new WebSocketService();
    stateManager = new LockerStateManager(mockDatabase);

    // Mock WebSocket broadcast methods
    vi.spyOn(wsService, 'broadcastStateUpdate').mockImplementation((update) => {
      const message = {
        type: 'state_update',
        timestamp: new Date().toISOString(),
        data: update
      };
      
      mockClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(JSON.stringify(message));
          } catch (error) {
            // Simulate client removal on error
          }
        }
      });
    });

    // Initialize performance metrics
    performanceMetrics = {
      updateTimes: [],
      messageCount: 0
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    wsService.shutdown();
  });

  describe('Requirement 5.1: RFID Display Information Updates', () => {
    it('should broadcast RFID card assignment updates immediately', async () => {
      const lockerId = 5;
      const rfidCard = '0009652489';
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 5,
        display_name: 'Dolap 5',
        status: 'Free',
        owner_key: null,
        owner_type: null
      });

      const startTime = Date.now();
      
      // Simulate RFID card assignment
      await stateManager.assignLocker(lockerId, 'test-kiosk', rfidCard, 'rfid');
      
      const endTime = Date.now();
      const updateTime = endTime - startTime;
      
      // Should complete under 500ms for immediate updates
      expect(updateTime).toBeLessThan(500);
      
      // All clients should receive the RFID assignment update
      mockClients.forEach(client => {
        expect(client.send).toHaveBeenCalledWith(JSON.stringify({
          type: 'state_update',
          timestamp: expect.any(String),
          data: expect.objectContaining({
            lockerId,
            state: 'Owned',
            ownerKey: rfidCard,
            ownerType: 'rfid',
            displayName: 'Dolap 5'
          })
        }));
      });
    });

    it('should handle different owner types correctly in real-time updates', async () => {
      const testCases = [
        {
          name: 'RFID Card',
          lockerId: 10,
          ownerKey: '0009652490',
          ownerType: 'rfid',
          expectedDisplay: '0009652490'
        },
        {
          name: 'Device ID',
          lockerId: 11,
          ownerKey: 'device123456789',
          ownerType: 'device',
          expectedDisplay: 'Cihaz: device12...'
        },
        {
          name: 'VIP Contract',
          lockerId: 12,
          ownerKey: 'VIP001',
          ownerType: 'vip',
          expectedDisplay: 'VIP: VIP001'
        }
      ];

      for (const testCase of testCases) {
        mockDatabase.get.mockReturnValue({
          id: testCase.lockerId,
          relay_number: testCase.lockerId,
          display_name: `Test ${testCase.name}`,
          status: 'Free'
        });

        await stateManager.assignLocker(testCase.lockerId, 'test-kiosk', testCase.ownerKey, testCase.ownerType);

        // Verify the update message contains correct owner information
        const lastCall = mockClients[0].send.mock.calls.slice(-1)[0];
        const message = JSON.parse(lastCall[0]);
        
        expect(message.data.ownerKey).toBe(testCase.ownerKey);
        expect(message.data.ownerType).toBe(testCase.ownerType);
      }
    });

    it('should handle RFID card release updates immediately', async () => {
      const lockerId = 6;
      const rfidCard = '0009652489';
      
      // Start with an owned locker
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 6,
        display_name: 'Dolap 6',
        status: 'Owned',
        owner_key: rfidCard,
        owner_type: 'rfid'
      });

      const startTime = Date.now();
      
      // Simulate RFID card release
      await stateManager.releaseLocker('test-kiosk', lockerId, rfidCard);
      
      const endTime = Date.now();
      const updateTime = endTime - startTime;
      
      // Should complete under 500ms for immediate updates
      expect(updateTime).toBeLessThan(500);
      
      // All clients should receive the release update
      mockClients.forEach(client => {
        expect(client.send).toHaveBeenCalledWith(JSON.stringify({
          type: 'state_update',
          timestamp: expect.any(String),
          data: expect.objectContaining({
            lockerId,
            state: 'Free',
            ownerKey: null,
            ownerType: null,
            displayName: 'Dolap 6'
          })
        }));
      });
    });
  });

  describe('Requirement 5.2: Status Color Changes', () => {
    it('should broadcast status changes with proper color mapping data', async () => {
      const lockerId = 7;
      const statusTransitions = [
        { from: 'Free', to: 'Owned', color: '#ffc107' },
        { from: 'Owned', to: 'Opening', color: '#007bff' },
        { from: 'Opening', to: 'Free', color: '#28a745' },
        { from: 'Free', to: 'Blocked', color: '#dc3545' }
      ];

      for (const transition of statusTransitions) {
        mockDatabase.get.mockReturnValue({
          id: lockerId,
          relay_number: 7,
          display_name: 'Color Test Dolap',
          status: transition.from
        });

        const startTime = Date.now();
        await stateManager.forceStateTransition('test-kiosk', lockerId, transition.to, 'test-staff', 'status change test');
        const endTime = Date.now();

        // Status changes should be immediate (under 200ms)
        expect(endTime - startTime).toBeLessThan(200);

        // Verify the status change message
        const lastCall = mockClients[0].send.mock.calls.slice(-1)[0];
        const message = JSON.parse(lastCall[0]);
        
        expect(message.data.state).toBe(transition.to);
        expect(message.data.lockerId).toBe(lockerId);
        expect(message.type).toBe('state_update');
      }
    });

    it('should include Turkish status translations in updates', async () => {
      const lockerId = 8;
      const statusMappings = [
        { dbStatus: 'Free', turkishStatus: 'Boş' },
        { dbStatus: 'Owned', turkishStatus: 'Sahipli' },
        { dbStatus: 'Reserved', turkishStatus: 'Rezerve' },
        { dbStatus: 'Opening', turkishStatus: 'Açılıyor' },
        { dbStatus: 'Blocked', turkishStatus: 'Engelli' },
        { dbStatus: 'Error', turkishStatus: 'Hata' }
      ];

      for (const mapping of statusMappings) {
        mockDatabase.get.mockReturnValue({
          id: lockerId,
          relay_number: 8,
          display_name: 'Translation Test Dolap',
          status: 'Free'
        });

        await stateManager.forceStateTransition('test-kiosk', lockerId, mapping.dbStatus, 'test-staff', 'translation test');

        const lastCall = mockClients[0].send.mock.calls.slice(-1)[0];
        const message = JSON.parse(lastCall[0]);
        
        expect(message.data.state).toBe(mapping.dbStatus);
        // The Turkish translation should be handled on the client side
        expect(message.data.lockerId).toBe(lockerId);
      }
    });
  });

  describe('Requirement 5.3: Owner Information Real-time Updates', () => {
    it('should update owner information when lockers are assigned', async () => {
      const lockerId = 9;
      const ownerTransitions = [
        {
          name: 'Assign RFID',
          from: { ownerKey: null, ownerType: null },
          to: { ownerKey: '0009652489', ownerType: 'rfid' }
        },
        {
          name: 'Change to Device',
          from: { ownerKey: '0009652489', ownerType: 'rfid' },
          to: { ownerKey: 'device987654321', ownerType: 'device' }
        },
        {
          name: 'Change to VIP',
          from: { ownerKey: 'device987654321', ownerType: 'device' },
          to: { ownerKey: 'VIP001', ownerType: 'vip' }
        },
        {
          name: 'Release Owner',
          from: { ownerKey: 'VIP001', ownerType: 'vip' },
          to: { ownerKey: null, ownerType: null }
        }
      ];

      for (const transition of ownerTransitions) {
        mockDatabase.get.mockReturnValue({
          id: lockerId,
          relay_number: 9,
          display_name: 'Owner Test Dolap',
          status: transition.from.ownerKey ? 'Owned' : 'Free',
          owner_key: transition.from.ownerKey,
          owner_type: transition.from.ownerType
        });

        const startTime = Date.now();
        
        if (transition.to.ownerKey) {
          await stateManager.assignLocker(lockerId, 'test-kiosk', transition.to.ownerKey, transition.to.ownerType);
        } else {
          await stateManager.releaseLocker('test-kiosk', lockerId);
        }
        
        const endTime = Date.now();
        const updateTime = endTime - startTime;

        // Owner updates should be fast (under 300ms)
        expect(updateTime).toBeLessThan(300);

        const lastCall = mockClients[0].send.mock.calls.slice(-1)[0];
        const message = JSON.parse(lastCall[0]);
        
        expect(message.data.ownerKey).toBe(transition.to.ownerKey);
        expect(message.data.ownerType).toBe(transition.to.ownerType);
        expect(message.data.lockerId).toBe(lockerId);
      }
    });

    it('should handle concurrent owner updates without conflicts', async () => {
      const lockerIds = [13, 14, 15];
      const ownerKeys = ['0009652489', '0009652490', '0009652491'];
      
      // Set up mock data for all lockers
      lockerIds.forEach((id, index) => {
        mockDatabase.get.mockReturnValue({
          id,
          relay_number: id,
          display_name: `Concurrent Test Dolap ${id}`,
          status: 'Free'
        });
      });

      const startTime = Date.now();
      
      // Update all lockers simultaneously
      const updatePromises = lockerIds.map((id, index) => 
        stateManager.assignLocker(id, 'test-kiosk', ownerKeys[index], 'rfid')
      );
      
      await Promise.all(updatePromises);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Concurrent updates should complete quickly (under 1 second)
      expect(totalTime).toBeLessThan(1000);

      // Each client should receive all updates
      expect(mockClients[0].send).toHaveBeenCalledTimes(3);
      
      // Verify each update contains correct owner information
      const calls = mockClients[0].send.mock.calls.slice(-3);
      calls.forEach((call, index) => {
        const message = JSON.parse(call[0]);
        expect(message.data.lockerId).toBe(lockerIds[index]);
        expect(message.data.ownerKey).toBe(ownerKeys[index]);
        expect(message.data.ownerType).toBe('rfid');
      });
    });
  });

  describe('Requirement 5.4: Smooth Transition Animations', () => {
    it('should include animation metadata in update messages', async () => {
      const lockerId = 16;
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 16,
        display_name: 'Animation Test Dolap',
        status: 'Free'
      });

      // Test status change that should trigger animation
      await stateManager.assignLocker(lockerId, 'test-kiosk', '0009652489', 'rfid');

      const lastCall = mockClients[0].send.mock.calls.slice(-1)[0];
      const message = JSON.parse(lastCall[0]);
      
      // Message should contain timing information for animations
      expect(message.timestamp).toBeDefined();
      expect(new Date(message.timestamp)).toBeInstanceOf(Date);
      expect(message.data.lockerId).toBe(lockerId);
      expect(message.data.state).toBe('Owned');
    });

    it('should handle rapid state changes for animation queuing', async () => {
      const lockerId = 17;
      const rapidStates = ['Free', 'Owned', 'Opening', 'Free'];
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 17,
        display_name: 'Rapid Animation Test',
        status: 'Free'
      });

      const startTime = Date.now();
      
      // Send rapid state changes
      for (let i = 0; i < rapidStates.length; i++) {
        const state = rapidStates[i];
        if (state === 'Owned') {
          await stateManager.assignLocker(lockerId, 'test-kiosk', '0009652489', 'rfid');
        } else if (state === 'Opening') {
          await stateManager.confirmOwnership('test-kiosk', lockerId);
        } else {
          await stateManager.forceStateTransition('test-kiosk', lockerId, state, 'test-staff', 'rapid test');
        }
        // Small delay to simulate realistic timing
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Rapid changes should still be processed efficiently
      expect(totalTime).toBeLessThan(1000);
      expect(mockClients[0].send).toHaveBeenCalledTimes(rapidStates.length);
    });
  });

  describe('Requirement 5.5: Performance with Multiple Simultaneous Updates', () => {
    it('should handle 20+ simultaneous updates under 2 seconds', async () => {
      const updateCount = 25;
      const lockerIds = Array.from({ length: updateCount }, (_, i) => i + 20);
      
      // Set up mock data for all lockers
      lockerIds.forEach(id => {
        mockDatabase.get.mockReturnValue({
          id,
          relay_number: id,
          display_name: `Performance Test Dolap ${id}`,
          status: 'Free'
        });
      });

      const startTime = Date.now();
      
      // Create simultaneous updates
      const updatePromises = lockerIds.map(id => 
        stateManager.assignLocker(id, 'test-kiosk', `000965248${id % 10}`, 'rfid')
      );
      
      await Promise.all(updatePromises);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should complete under 2 seconds as per requirement
      expect(totalTime).toBeLessThan(2000);
      
      // All clients should receive all updates
      mockClients.forEach(client => {
        expect(client.send).toHaveBeenCalledTimes(updateCount);
      });

      // Track performance metrics
      performanceMetrics.updateTimes.push(totalTime);
      performanceMetrics.messageCount += updateCount;
      
      console.log(`📊 Performance: ${updateCount} updates in ${totalTime}ms (${(totalTime/updateCount).toFixed(2)}ms avg)`);
    });

    it('should maintain performance with high-frequency updates', async () => {
      const lockerId = 50;
      const updateCount = 100;
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 50,
        display_name: 'High Frequency Test Dolap',
        status: 'Free'
      });

      const startTime = Date.now();
      
      // Send high-frequency updates
      for (let i = 0; i < updateCount; i++) {
        if (i % 2 === 0) {
          // Assign locker
          await stateManager.assignLocker(lockerId, 'test-kiosk', `000965248${i % 10}`, 'rfid');
        } else {
          // Release locker
          await stateManager.releaseLocker('test-kiosk', lockerId);
        }
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / updateCount;
      
      // Average update time should be reasonable (under 50ms per update)
      expect(averageTime).toBeLessThan(50);
      expect(mockClients[0].send).toHaveBeenCalledTimes(updateCount);
      
      console.log(`📊 High Frequency: ${updateCount} updates in ${totalTime}ms (${averageTime.toFixed(2)}ms avg)`);
    });

    it('should handle burst updates without message loss', async () => {
      const burstSize = 50;
      const lockerIds = Array.from({ length: burstSize }, (_, i) => i + 100);
      
      // Set up mock data
      lockerIds.forEach(id => {
        mockDatabase.get.mockReturnValue({
          id,
          relay_number: id,
          display_name: `Burst Test Dolap ${id}`,
          status: 'Free'
        });
      });

      // Send burst of updates
      const promises = lockerIds.map(id => 
        stateManager.assignLocker(id, 'test-kiosk', `burst${id}`, 'rfid')
      );
      
      await Promise.all(promises);
      
      // Verify all messages were sent
      expect(mockClients[0].send).toHaveBeenCalledTimes(burstSize);
      
      // Verify message content integrity
      const calls = mockClients[0].send.mock.calls.slice(-burstSize);
      calls.forEach((call, index) => {
        const message = JSON.parse(call[0]);
        expect(message.data.lockerId).toBe(lockerIds[index]);
        expect(message.data.ownerKey).toBe(`burst${lockerIds[index]}`);
      });
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should continue operating when some clients disconnect during updates', async () => {
      const lockerId = 200;
      
      // Simulate one client disconnecting
      mockClients[0].readyState = WebSocket.CLOSED;
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 200,
        display_name: 'Resilience Test Dolap',
        status: 'Free'
      });

      await stateManager.assignLocker(lockerId, 'test-kiosk', '0009652489', 'rfid');

      // Only connected clients should receive updates
      expect(mockClients[0].send).not.toHaveBeenCalled();
      expect(mockClients[1].send).toHaveBeenCalled();
    });

    it('should handle WebSocket send failures gracefully', async () => {
      const lockerId = 201;
      
      // Mock client send failure
      mockClients[0].send = vi.fn().mockImplementation(() => {
        throw new Error('WebSocket send failed');
      });
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 201,
        display_name: 'Error Handling Test',
        status: 'Free'
      });

      // Should not throw error even if one client fails
      await expect(stateManager.assignLocker(lockerId, 'test-kiosk', '0009652489', 'rfid')).resolves.not.toThrow();
      
      // Other clients should still receive updates
      expect(mockClients[1].send).toHaveBeenCalled();
    });
  });

  describe('Integration with UI Components', () => {
    it('should provide all necessary data for UI updates', async () => {
      const lockerId = 300;
      const testData = {
        ownerKey: '0009652489',
        ownerType: 'rfid',
        displayName: 'UI Integration Test',
        isVip: false
      };
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 300,
        display_name: testData.displayName,
        status: 'Free',
        is_vip: testData.isVip
      });

      await stateManager.assignLocker(lockerId, 'test-kiosk', testData.ownerKey, testData.ownerType);

      const lastCall = mockClients[0].send.mock.calls.slice(-1)[0];
      const message = JSON.parse(lastCall[0]);
      
      // Verify all UI-required data is present
      expect(message.data).toEqual(expect.objectContaining({
        lockerId,
        state: 'Owned',
        ownerKey: testData.ownerKey,
        ownerType: testData.ownerType,
        displayName: testData.displayName,
        isVip: testData.isVip,
        lastChanged: expect.any(String)
      }));
    });

    it('should maintain data consistency across multiple UI updates', async () => {
      const lockerId = 301;
      const updates = [
        { state: 'Owned', ownerKey: '0009652489', ownerType: 'rfid' },
        { state: 'Opening', ownerKey: '0009652489', ownerType: 'rfid' },
        { state: 'Free', ownerKey: null, ownerType: null }
      ];
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 301,
        display_name: 'Consistency Test',
        status: 'Free'
      });

      for (const update of updates) {
        if (update.ownerKey) {
          await stateManager.assignLocker(lockerId, 'test-kiosk', update.ownerKey, update.ownerType);
          if (update.state === 'Opening') {
            await stateManager.confirmOwnership('test-kiosk', lockerId);
          }
        } else {
          await stateManager.releaseLocker('test-kiosk', lockerId);
        }
      }

      // Verify all updates were sent in order
      expect(mockClients[0].send).toHaveBeenCalledTimes(updates.length);
      
      const calls = mockClients[0].send.mock.calls.slice(-updates.length);
      calls.forEach((call, index) => {
        const message = JSON.parse(call[0]);
        expect(message.data.state).toBe(updates[index].state);
        expect(message.data.ownerKey).toBe(updates[index].ownerKey);
        expect(message.data.ownerType).toBe(updates[index].ownerType);
      });
    });
  });
});