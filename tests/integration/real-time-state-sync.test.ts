import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LockerStateManager } from '../../shared/services/locker-state-manager';
import { WebSocketService } from '../../shared/services/websocket-service';
import { LockerNamingService } from '../../shared/services/locker-naming-service';
import WebSocket from 'ws';

describe('Real-time State Synchronization Integration Tests', () => {
  let stateManager: LockerStateManager;
  let wsService: WebSocketService;
  let namingService: LockerNamingService;
  let mockDatabase: any;
  let mockClients: WebSocket[];

  beforeEach(() => {
    // Mock database
    mockDatabase = {
      get: vi.fn(),
      run: vi.fn(),
      all: vi.fn(),
      prepare: vi.fn(() => ({
        get: vi.fn(),
        run: vi.fn(),
        all: vi.fn()
      }))
    };

    // Mock WebSocket clients
    mockClients = [
      { send: vi.fn(), readyState: WebSocket.OPEN } as any,
      { send: vi.fn(), readyState: WebSocket.OPEN } as any,
      { send: vi.fn(), readyState: WebSocket.OPEN } as any
    ];

    // Initialize services with proper mocking
    stateManager = new LockerStateManager();
    wsService = new WebSocketService();
    namingService = new LockerNamingService(mockDatabase);

    // Mock WebSocket clients
    vi.spyOn(wsService, 'getClients').mockReturnValue(mockClients);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Locker State Updates', () => {
    it('should broadcast state changes to all connected clients under 2 seconds', async () => {
      const lockerId = 5;
      const newState = 'Açılıyor';
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 5,
        display_name: 'Dolap 5',
        status: 'Free'
      });

      const startTime = Date.now();
      
      // Update locker state
      await stateManager.updateLockerState(lockerId, newState);
      
      const endTime = Date.now();
      const updateTime = endTime - startTime;
      
      // Should complete under 2 seconds (2000ms)
      expect(updateTime).toBeLessThan(2000);
      
      // All clients should receive the update
      mockClients.forEach(client => {
        expect(client.send).toHaveBeenCalledWith(JSON.stringify({
          type: 'locker_state_change',
          timestamp: expect.any(String),
          data: {
            lockerId,
            newState,
            displayName: 'Dolap 5',
            relayNumber: 5
          }
        }));
      });
    });

    it('should maintain consistent state across kiosk and admin interfaces', async () => {
      const lockerId = 3;
      const states = ['Boş', 'Dolu', 'Açılıyor', 'Hata', 'Engelli'];
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 3,
        display_name: 'Kapı A3',
        status: 'Free'
      });

      for (const state of states) {
        await stateManager.updateLockerState(lockerId, state);
        
        // Verify all clients receive consistent state
        mockClients.forEach(client => {
          const lastCall = (client.send as any).mock.calls.slice(-1)[0];
          const message = JSON.parse(lastCall[0]);
          
          expect(message.data.newState).toBe(state);
          expect(message.data.lockerId).toBe(lockerId);
        });
      }
    });

    it('should handle multiple simultaneous state updates', async () => {
      const lockerIds = [1, 2, 3, 4, 5];
      const promises = lockerIds.map(async (id) => {
        mockDatabase.get.mockReturnValue({
          id,
          relay_number: id,
          display_name: `Dolap ${id}`,
          status: 'Free'
        });
        
        return stateManager.updateLockerState(id, 'Dolu');
      });
      
      await Promise.all(promises);
      
      // Each client should receive all 5 updates
      mockClients.forEach(client => {
        expect(client.send).toHaveBeenCalledTimes(5);
      });
    });
  });

  describe('Connection Status Monitoring', () => {
    it('should detect and broadcast offline status', async () => {
      // Simulate connection loss
      mockClients.forEach(client => {
        client.readyState = WebSocket.CLOSED;
      });
      
      await wsService.broadcast({
        type: 'system_status',
        timestamp: new Date(),
        data: { connectionStatus: 'offline' }
      });
      
      // Should not attempt to send to closed connections
      mockClients.forEach(client => {
        expect(client.send).not.toHaveBeenCalled();
      });
    });

    it('should broadcast reconnection status', async () => {
      // Simulate reconnection
      mockClients.forEach(client => {
        client.readyState = WebSocket.OPEN;
      });
      
      await wsService.broadcast({
        type: 'system_status',
        timestamp: new Date(),
        data: { connectionStatus: 'online' }
      });
      
      mockClients.forEach(client => {
        expect(client.send).toHaveBeenCalledWith(JSON.stringify({
          type: 'system_status',
          timestamp: expect.any(String),
          data: { connectionStatus: 'online' }
        }));
      });
    });

    it('should show last update timestamp', async () => {
      const lockerId = 7;
      const updateTime = new Date();
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 7,
        display_name: 'Dolap 7',
        status: 'Free',
        last_state_change: updateTime.toISOString()
      });
      
      await stateManager.updateLockerState(lockerId, 'Boş');
      
      mockClients.forEach(client => {
        const lastCall = (client.send as any).mock.calls.slice(-1)[0];
        const message = JSON.parse(lastCall[0]);
        
        expect(message.timestamp).toBeDefined();
        expect(new Date(message.timestamp)).toBeInstanceOf(Date);
      });
    });
  });

  describe('Display Name Synchronization', () => {
    it('should sync display name changes across all interfaces', async () => {
      const lockerId = 4;
      const newName = 'Kapı B4';
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 4,
        display_name: 'Dolap 4',
        status: 'Free'
      });
      
      // Update display name
      await namingService.setDisplayName(lockerId, newName, 'admin');
      
      // Should broadcast name change
      mockClients.forEach(client => {
        expect(client.send).toHaveBeenCalledWith(JSON.stringify({
          type: 'locker_name_change',
          timestamp: expect.any(String),
          data: {
            lockerId,
            newName,
            relayNumber: 4,
            updatedBy: 'admin'
          }
        }));
      });
    });

    it('should maintain name consistency during state changes', async () => {
      const lockerId = 6;
      const displayName = 'Özel Dolap';
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 6,
        display_name: displayName,
        status: 'Free'
      });
      
      await stateManager.updateLockerState(lockerId, 'Dolu');
      
      mockClients.forEach(client => {
        const lastCall = (client.send as any).mock.calls.slice(-1)[0];
        const message = JSON.parse(lastCall[0]);
        
        expect(message.data.displayName).toBe(displayName);
      });
    });
  });

  describe('Performance Requirements', () => {
    it('should update kiosk grid under 2 seconds', async () => {
      const lockerId = 8;
      const startTime = Date.now();
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 8,
        display_name: 'Dolap 8',
        status: 'Free'
      });
      
      await stateManager.updateLockerState(lockerId, 'Açılıyor');
      
      const endTime = Date.now();
      const updateTime = endTime - startTime;
      
      expect(updateTime).toBeLessThan(2000);
    });

    it('should update admin panel under 2 seconds', async () => {
      const lockerIds = [1, 2, 3, 4, 5, 6, 7, 8];
      const startTime = Date.now();
      
      const promises = lockerIds.map(async (id) => {
        mockDatabase.get.mockReturnValue({
          id,
          relay_number: id,
          display_name: `Dolap ${id}`,
          status: 'Free'
        });
        
        return stateManager.updateLockerState(id, 'Boş');
      });
      
      await Promise.all(promises);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      expect(totalTime).toBeLessThan(2000);
    });

    it('should handle high-frequency updates without performance degradation', async () => {
      const lockerId = 9;
      const updateCount = 50;
      const startTime = Date.now();
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 9,
        display_name: 'Dolap 9',
        status: 'Free'
      });
      
      const promises = Array.from({ length: updateCount }, (_, i) => {
        const state = i % 2 === 0 ? 'Boş' : 'Dolu';
        return stateManager.updateLockerState(lockerId, state);
      });
      
      await Promise.all(promises);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / updateCount;
      
      // Average update time should be reasonable
      expect(averageTime).toBeLessThan(100); // 100ms per update
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should continue operating when some clients disconnect', async () => {
      const lockerId = 10;
      
      // Simulate one client disconnecting
      mockClients[0].readyState = WebSocket.CLOSED;
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 10,
        display_name: 'Dolap 10',
        status: 'Free'
      });
      
      await stateManager.updateLockerState(lockerId, 'Hata');
      
      // Only connected clients should receive updates
      expect(mockClients[0].send).not.toHaveBeenCalled();
      expect(mockClients[1].send).toHaveBeenCalled();
      expect(mockClients[2].send).toHaveBeenCalled();
    });

    it('should sync state after reconnection', async () => {
      const lockerId = 11;
      
      mockDatabase.all.mockReturnValue([
        {
          id: lockerId,
          relay_number: 11,
          display_name: 'Dolap 11',
          status: 'Dolu',
          last_state_change: new Date().toISOString()
        }
      ]);
      
      // Simulate client reconnection
      await wsService.syncClientState(mockClients[0]);
      
      expect(mockClients[0].send).toHaveBeenCalledWith(JSON.stringify({
        type: 'full_state_sync',
        timestamp: expect.any(String),
        data: {
          lockers: expect.arrayContaining([
            expect.objectContaining({
              id: lockerId,
              status: 'Dolu'
            })
          ])
        }
      }));
    });

    it('should handle WebSocket send failures gracefully', async () => {
      const lockerId = 12;
      
      // Mock client send failure
      mockClients[0].send = vi.fn().mockImplementation(() => {
        throw new Error('WebSocket send failed');
      });
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 12,
        display_name: 'Dolap 12',
        status: 'Free'
      });
      
      // Should not throw error even if one client fails
      await expect(stateManager.updateLockerState(lockerId, 'Boş')).resolves.not.toThrow();
      
      // Other clients should still receive updates
      expect(mockClients[1].send).toHaveBeenCalled();
      expect(mockClients[2].send).toHaveBeenCalled();
    });

    it('should handle database connection loss and recovery', async () => {
      const lockerId = 13;
      
      // Simulate database connection loss
      mockDatabase.get.mockImplementation(() => {
        throw new Error('Database connection lost');
      });
      
      await expect(stateManager.updateLockerState(lockerId, 'Hata')).rejects.toThrow('Database connection lost');
      
      // Simulate database recovery
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 13,
        display_name: 'Dolap 13',
        status: 'Free'
      });
      
      // Should work again after recovery
      await expect(stateManager.updateLockerState(lockerId, 'Boş')).resolves.not.toThrow();
    });
  });

  describe('State Consistency and Validation', () => {
    it('should validate state transitions are consistent', async () => {
      const lockerId = 14;
      const validStates = ['Boş', 'Dolu', 'Açılıyor', 'Hata', 'Engelli'];
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 14,
        display_name: 'Dolap 14',
        status: 'Free'
      });
      
      // Test all valid state transitions
      for (const state of validStates) {
        await stateManager.updateLockerState(lockerId, state);
        
        // Verify state was broadcast correctly
        const lastCall = mockClients[0].send.mock.calls.slice(-1)[0];
        const message = JSON.parse(lastCall[0]);
        
        expect(message.data.newState).toBe(state);
        expect(validStates).toContain(message.data.newState);
      }
    });

    it('should maintain state consistency across multiple updates', async () => {
      const lockerIds = [15, 16, 17];
      const states = ['Boş', 'Dolu', 'Açılıyor'];
      
      // Set up mock data for all lockers
      lockerIds.forEach(id => {
        mockDatabase.get.mockReturnValue({
          id,
          relay_number: id,
          display_name: `Dolap ${id}`,
          status: 'Free'
        });
      });
      
      // Update all lockers simultaneously
      const updatePromises = lockerIds.map((id, index) => 
        stateManager.updateLockerState(id, states[index])
      );
      
      await Promise.all(updatePromises);
      
      // Verify all updates were broadcast
      expect(mockClients[0].send).toHaveBeenCalledTimes(3);
      
      // Verify each update contains correct data
      const calls = mockClients[0].send.mock.calls;
      calls.forEach((call, index) => {
        const message = JSON.parse(call[0]);
        expect(message.data.lockerId).toBe(lockerIds[index]);
        expect(message.data.newState).toBe(states[index]);
      });
    });

    it('should validate timestamp consistency in updates', async () => {
      const lockerId = 18;
      const startTime = Date.now();
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 18,
        display_name: 'Dolap 18',
        status: 'Free'
      });
      
      await stateManager.updateLockerState(lockerId, 'Dolu');
      
      const endTime = Date.now();
      const lastCall = mockClients[0].send.mock.calls.slice(-1)[0];
      const message = JSON.parse(lastCall[0]);
      const messageTime = new Date(message.timestamp).getTime();
      
      // Timestamp should be within the test execution window
      expect(messageTime).toBeGreaterThanOrEqual(startTime);
      expect(messageTime).toBeLessThanOrEqual(endTime);
    });
  });

  describe('Load Testing and Scalability', () => {
    it('should handle burst updates without performance degradation', async () => {
      const lockerId = 19;
      const updateCount = 100;
      const startTime = Date.now();
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 19,
        display_name: 'Dolap 19',
        status: 'Free'
      });
      
      // Create burst of updates
      const promises = Array.from({ length: updateCount }, (_, i) => {
        const state = i % 2 === 0 ? 'Boş' : 'Dolu';
        return stateManager.updateLockerState(lockerId, state);
      });
      
      await Promise.all(promises);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / updateCount;
      
      // Should handle burst efficiently
      expect(averageTime).toBeLessThan(50); // 50ms per update
      expect(mockClients[0].send).toHaveBeenCalledTimes(updateCount);
    });

    it('should handle multiple clients efficiently', async () => {
      const lockerId = 20;
      const clientCount = 10;
      
      // Create additional mock clients
      const additionalClients = Array.from({ length: clientCount }, () => ({
        send: vi.fn(),
        readyState: WebSocket.OPEN
      }));
      
      vi.spyOn(wsService, 'getClients').mockReturnValue([...mockClients, ...additionalClients]);
      
      mockDatabase.get.mockReturnValue({
        id: lockerId,
        relay_number: 20,
        display_name: 'Dolap 20',
        status: 'Free'
      });
      
      const startTime = Date.now();
      await stateManager.updateLockerState(lockerId, 'Açılıyor');
      const endTime = Date.now();
      
      const updateTime = endTime - startTime;
      
      // Should handle multiple clients efficiently
      expect(updateTime).toBeLessThan(1000); // Under 1 second
      
      // All clients should receive the update
      [...mockClients, ...additionalClients].forEach(client => {
        expect(client.send).toHaveBeenCalledTimes(1);
      });
    });

    it('should maintain performance with large locker counts', async () => {
      const lockerCount = 50;
      const lockerIds = Array.from({ length: lockerCount }, (_, i) => i + 1);
      
      // Mock database to return different lockers
      mockDatabase.get.mockImplementation((sql, params) => {
        const lockerId = params[0];
        return {
          id: lockerId,
          relay_number: lockerId,
          display_name: `Dolap ${lockerId}`,
          status: 'Free'
        };
      });
      
      const startTime = Date.now();
      
      // Update all lockers
      const promises = lockerIds.map(id => 
        stateManager.updateLockerState(id, 'Boş')
      );
      
      await Promise.all(promises);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should handle large locker counts efficiently
      expect(totalTime).toBeLessThan(5000); // Under 5 seconds for 50 lockers
      expect(mockClients[0].send).toHaveBeenCalledTimes(lockerCount);
    });
  });
});