/**
 * Real-time State Synchronization Tests
 * Tests WebSocket integration and real-time updates between backend and frontend
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { webSocketService } from '../../shared/services/websocket-service';
import { LockerStateManager } from '../../shared/services/locker-state-manager';
import { SessionManager } from '../../app/kiosk/src/controllers/session-manager';

describe('Real-time State Synchronization', () => {
  let lockerStateManager: LockerStateManager;
  let sessionManager: SessionManager;
  let wsPort: number;
  let testClient: WebSocket;

  const TEST_KIOSK_ID = 'test-kiosk-realtime';
  const TEST_CARD_ID = '0009652489';
  const TEST_LOCKER_ID = 7;

  beforeAll(async () => {
    // Initialize services
    lockerStateManager = new LockerStateManager();
    sessionManager = new SessionManager({
      defaultTimeoutSeconds: 30,
      cleanupIntervalMs: 5000,
      maxSessionsPerKiosk: 1
    });

    // Initialize WebSocket service on random port
    wsPort = 8083 + Math.floor(Math.random() * 100);
    webSocketService.initialize(wsPort);

    // Initialize test data
    await lockerStateManager.initializeKioskLockers(TEST_KIOSK_ID, 10);

    // Wait for WebSocket server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    sessionManager.shutdown();
    await lockerStateManager.shutdown();
    webSocketService.shutdown();
  });

  beforeEach(async () => {
    // Reset test locker states
    for (let i = 1; i <= 10; i++) {
      await lockerStateManager.releaseLocker(TEST_KIOSK_ID, i);
    }
  });

  afterEach(() => {
    if (testClient && testClient.readyState === WebSocket.OPEN) {
      testClient.close();
    }
    sessionManager.clearKioskSessions(TEST_KIOSK_ID);
  });

  describe('WebSocket Connection Management', () => {
    it('should establish WebSocket connection successfully', (done) => {
      testClient = new WebSocket(`ws://localhost:${wsPort}`);

      testClient.on('open', () => {
        expect(testClient.readyState).toBe(WebSocket.OPEN);
        
        // Check connection status
        const status = webSocketService.getConnectionStatus();
        expect(status.connectedClients).toBeGreaterThan(0);
        expect(status.status).toBe('online');
        
        done();
      });

      testClient.on('error', (error) => {
        done(error);
      });
    });

    it('should handle multiple client connections', (done) => {
      const clients: WebSocket[] = [];
      let connectedCount = 0;
      const targetConnections = 3;

      for (let i = 0; i < targetConnections; i++) {
        const client = new WebSocket(`ws://localhost:${wsPort}`);
        clients.push(client);

        client.on('open', () => {
          connectedCount++;
          if (connectedCount === targetConnections) {
            const status = webSocketService.getConnectionStatus();
            expect(status.connectedClients).toBe(targetConnections);
            
            // Close all clients
            clients.forEach(c => c.close());
            done();
          }
        });

        client.on('error', (error) => {
          done(error);
        });
      }
    });

    it('should handle client disconnections gracefully', (done) => {
      testClient = new WebSocket(`ws://localhost:${wsPort}`);

      testClient.on('open', () => {
        const initialStatus = webSocketService.getConnectionStatus();
        expect(initialStatus.connectedClients).toBeGreaterThan(0);

        testClient.close();
      });

      testClient.on('close', () => {
        // Wait a moment for the server to process the disconnection
        setTimeout(() => {
          const finalStatus = webSocketService.getConnectionStatus();
          expect(finalStatus.connectedClients).toBe(0);
          expect(finalStatus.status).toBe('offline');
          done();
        }, 100);
      });
    });
  });

  describe('Real-time State Updates', () => {
    it('should broadcast locker state changes in real-time', (done) => {
      testClient = new WebSocket(`ws://localhost:${wsPort}`);
      let messageReceived = false;

      testClient.on('open', async () => {
        // Trigger a state change
        await lockerStateManager.assignLocker(TEST_KIOSK_ID, TEST_LOCKER_ID, 'rfid', TEST_CARD_ID);
      });

      testClient.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'state_update' && !messageReceived) {
          messageReceived = true;
          
          expect(message.data).toBeDefined();
          expect(message.data.kioskId).toBe(TEST_KIOSK_ID);
          expect(message.data.lockerId).toBe(TEST_LOCKER_ID);
          expect(message.data.state).toBe('Dolu');
          expect(message.timestamp).toBeDefined();
          
          done();
        }
      });

      testClient.on('error', (error) => {
        done(error);
      });

      // Timeout fallback
      setTimeout(() => {
        if (!messageReceived) {
          done(new Error('State update message not received within timeout'));
        }
      }, 5000);
    });

    it('should broadcast locker release events', (done) => {
      testClient = new WebSocket(`ws://localhost:${wsPort}`);
      let assignmentReceived = false;
      let releaseReceived = false;

      testClient.on('open', async () => {
        // First assign, then release
        await lockerStateManager.assignLocker(TEST_KIOSK_ID, TEST_LOCKER_ID, 'rfid', TEST_CARD_ID);
      });

      testClient.on('message', async (data: Buffer) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'state_update') {
          if (message.data.state === 'Dolu' && !assignmentReceived) {
            assignmentReceived = true;
            // Trigger release
            await lockerStateManager.releaseLocker(TEST_KIOSK_ID, TEST_LOCKER_ID, TEST_CARD_ID);
          } else if (message.data.state === 'Boş' && assignmentReceived && !releaseReceived) {
            releaseReceived = true;
            
            expect(message.data.kioskId).toBe(TEST_KIOSK_ID);
            expect(message.data.lockerId).toBe(TEST_LOCKER_ID);
            expect(message.data.state).toBe('Boş');
            
            done();
          }
        }
      });

      testClient.on('error', (error) => {
        done(error);
      });

      // Timeout fallback
      setTimeout(() => {
        if (!releaseReceived) {
          done(new Error('Release event not received within timeout'));
        }
      }, 5000);
    });

    it('should broadcast hardware error states', (done) => {
      testClient = new WebSocket(`ws://localhost:${wsPort}`);
      let errorReceived = false;

      testClient.on('open', async () => {
        // Trigger hardware error
        await lockerStateManager.handleHardwareError(TEST_KIOSK_ID, TEST_LOCKER_ID, 'Test hardware error');
      });

      testClient.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'state_update' && message.data.state === 'Hata' && !errorReceived) {
          errorReceived = true;
          
          expect(message.data.kioskId).toBe(TEST_KIOSK_ID);
          expect(message.data.lockerId).toBe(TEST_LOCKER_ID);
          expect(message.data.state).toBe('Hata');
          
          done();
        }
      });

      testClient.on('error', (error) => {
        done(error);
      });

      // Timeout fallback
      setTimeout(() => {
        if (!errorReceived) {
          done(new Error('Hardware error state not received within timeout'));
        }
      }, 5000);
    });
  });

  describe('Session State Synchronization', () => {
    it('should broadcast session creation events', (done) => {
      testClient = new WebSocket(`ws://localhost:${wsPort}`);
      let sessionEventReceived = false;

      // Listen for session events from session manager
      sessionManager.on('session_created', (event) => {
        if (!sessionEventReceived) {
          sessionEventReceived = true;
          
          expect(event.sessionId).toBeDefined();
          expect(event.data.session.kioskId).toBe(TEST_KIOSK_ID);
          expect(event.data.session.cardId).toBe(TEST_CARD_ID);
          expect(event.data.session.status).toBe('active');
          
          done();
        }
      });

      testClient.on('open', () => {
        // Create a session
        sessionManager.createSession(TEST_KIOSK_ID, TEST_CARD_ID, [1, 2, 3, 4, 5]);
      });

      testClient.on('error', (error) => {
        done(error);
      });

      // Timeout fallback
      setTimeout(() => {
        if (!sessionEventReceived) {
          done(new Error('Session creation event not received within timeout'));
        }
      }, 3000);
    });

    it('should broadcast session timeout events', (done) => {
      testClient = new WebSocket(`ws://localhost:${wsPort}`);
      let timeoutEventReceived = false;

      // Listen for session timeout events
      sessionManager.on('session_expired', (event) => {
        if (!timeoutEventReceived) {
          timeoutEventReceived = true;
          
          expect(event.sessionId).toBeDefined();
          expect(event.data.session.status).toBe('expired');
          
          done();
        }
      });

      testClient.on('open', () => {
        // Create a session and immediately expire it for testing
        const session = sessionManager.createSession(TEST_KIOSK_ID, TEST_CARD_ID, [1, 2, 3]);
        
        // Force expiration after a short delay
        setTimeout(() => {
          sessionManager.cancelSession(session.id, 'Test timeout');
        }, 100);
      });

      testClient.on('error', (error) => {
        done(error);
      });

      // Timeout fallback
      setTimeout(() => {
        if (!timeoutEventReceived) {
          done(new Error('Session timeout event not received within timeout'));
        }
      }, 3000);
    });
  });

  describe('Connection Status Broadcasting', () => {
    it('should broadcast connection status updates', (done) => {
      testClient = new WebSocket(`ws://localhost:${wsPort}`);
      let statusReceived = false;

      testClient.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'connection_status' && !statusReceived) {
          statusReceived = true;
          
          expect(message.data).toBeDefined();
          expect(message.data.status).toBeDefined();
          expect(message.data.connectedClients).toBeDefined();
          expect(message.data.lastUpdate).toBeDefined();
          expect(typeof message.data.connectedClients).toBe('number');
          
          done();
        }
      });

      testClient.on('error', (error) => {
        done(error);
      });

      // Timeout fallback
      setTimeout(() => {
        if (!statusReceived) {
          done(new Error('Connection status not received within timeout'));
        }
      }, 3000);
    });

    it('should handle heartbeat messages', (done) => {
      testClient = new WebSocket(`ws://localhost:${wsPort}`);
      let heartbeatReceived = false;

      testClient.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'heartbeat' && !heartbeatReceived) {
          heartbeatReceived = true;
          
          expect(message.data).toBeDefined();
          expect(message.timestamp).toBeDefined();
          
          // Send ping response
          testClient.send(JSON.stringify({
            type: 'ping',
            timestamp: new Date()
          }));
          
          done();
        }
      });

      testClient.on('error', (error) => {
        done(error);
      });

      // Timeout fallback
      setTimeout(() => {
        if (!heartbeatReceived) {
          done(new Error('Heartbeat not received within timeout'));
        }
      }, 35000); // Heartbeat interval is 30 seconds
    });
  });

  describe('Error Broadcasting', () => {
    it('should broadcast error messages', (done) => {
      testClient = new WebSocket(`ws://localhost:${wsPort}`);
      let errorReceived = false;

      testClient.on('open', () => {
        // Trigger an error broadcast
        webSocketService.broadcastError('Test error message', { 
          component: 'test',
          severity: 'high'
        });
      });

      testClient.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'error' && !errorReceived) {
          errorReceived = true;
          
          expect(message.data).toBeDefined();
          expect(message.data.error).toBe('Test error message');
          expect(message.data.details).toBeDefined();
          expect(message.data.details.component).toBe('test');
          
          done();
        }
      });

      testClient.on('error', (error) => {
        done(error);
      });

      // Timeout fallback
      setTimeout(() => {
        if (!errorReceived) {
          done(new Error('Error message not received within timeout'));
        }
      }, 3000);
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle rapid state changes without message loss', (done) => {
      testClient = new WebSocket(`ws://localhost:${wsPort}`);
      const expectedUpdates = 5;
      const receivedUpdates: any[] = [];

      testClient.on('open', async () => {
        // Trigger multiple rapid state changes
        for (let i = 1; i <= expectedUpdates; i++) {
          await lockerStateManager.assignLocker(TEST_KIOSK_ID, i, 'rfid', `card${i}`);
          // Small delay to ensure order
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      });

      testClient.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'state_update' && message.data.state === 'Dolu') {
          receivedUpdates.push(message.data);
          
          if (receivedUpdates.length === expectedUpdates) {
            // Verify all updates were received
            expect(receivedUpdates.length).toBe(expectedUpdates);
            
            // Verify unique locker IDs
            const lockerIds = receivedUpdates.map(u => u.lockerId);
            const uniqueIds = new Set(lockerIds);
            expect(uniqueIds.size).toBe(expectedUpdates);
            
            done();
          }
        }
      });

      testClient.on('error', (error) => {
        done(error);
      });

      // Timeout fallback
      setTimeout(() => {
        if (receivedUpdates.length < expectedUpdates) {
          done(new Error(`Only received ${receivedUpdates.length}/${expectedUpdates} updates`));
        }
      }, 10000);
    });

    it('should maintain connection stability under load', (done) => {
      const clients: WebSocket[] = [];
      const clientCount = 10;
      let connectedClients = 0;
      let messagesReceived = 0;
      const expectedMessages = clientCount;

      // Create multiple clients
      for (let i = 0; i < clientCount; i++) {
        const client = new WebSocket(`ws://localhost:${wsPort}`);
        clients.push(client);

        client.on('open', () => {
          connectedClients++;
          
          if (connectedClients === clientCount) {
            // All clients connected, trigger a broadcast
            webSocketService.broadcastStateUpdate({
              kioskId: TEST_KIOSK_ID,
              lockerId: TEST_LOCKER_ID,
              displayName: 'Load Test Locker',
              state: 'Dolu',
              lastChanged: new Date()
            });
          }
        });

        client.on('message', (data: Buffer) => {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'state_update') {
            messagesReceived++;
            
            if (messagesReceived === expectedMessages) {
              // All clients received the message
              clients.forEach(c => c.close());
              done();
            }
          }
        });

        client.on('error', (error) => {
          done(error);
        });
      }

      // Timeout fallback
      setTimeout(() => {
        clients.forEach(c => c.close());
        if (messagesReceived < expectedMessages) {
          done(new Error(`Only ${messagesReceived}/${expectedMessages} clients received the message`));
        }
      }, 10000);
    });
  });
});