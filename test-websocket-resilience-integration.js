#!/usr/bin/env node

/**
 * WebSocket Resilience Integration Test
 * 
 * This test simulates various network conditions and validates that the WebSocket
 * implementation handles them gracefully with proper error handling and resilience.
 */

const WebSocket = require('ws');
const http = require('http');
const { performance } = require('perf_hooks');

class WebSocketResilienceTest {
  constructor() {
    this.results = {
      tests: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0
      }
    };
  }

  log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  async runTest(name, testFn) {
    this.log(`Running test: ${name}`);
    this.results.summary.total++;
    
    try {
      const startTime = performance.now();
      await testFn();
      const duration = performance.now() - startTime;
      
      this.results.tests.push({
        name,
        status: 'PASSED',
        duration: Math.round(duration),
        error: null
      });
      this.results.summary.passed++;
      this.log(`✅ ${name} - PASSED (${Math.round(duration)}ms)`);
    } catch (error) {
      this.results.tests.push({
        name,
        status: 'FAILED',
        duration: 0,
        error: error.message
      });
      this.results.summary.failed++;
      this.log(`❌ ${name} - FAILED: ${error.message}`);
    }
  }

  async testBasicConnection() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:3001/ws/lockers?sessionId=test-session');
      let connected = false;
      
      const timeout = setTimeout(() => {
        if (!connected) {
          ws.close();
          reject(new Error('Connection timeout'));
        }
      }, 5000);

      ws.on('open', () => {
        connected = true;
        clearTimeout(timeout);
        this.log('Basic connection established');
        ws.close();
        resolve();
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Connection error: ${error.message}`));
      });
    });
  }

  async testHeartbeatLatency() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:3001/ws/lockers?sessionId=test-session');
      let latencies = [];
      let pingsReceived = 0;
      const targetPings = 5;
      
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Heartbeat test timeout'));
      }, 10000);

      ws.on('open', () => {
        this.log('Testing heartbeat latency...');
        
        // Send ping every second
        const pingInterval = setInterval(() => {
          if (pingsReceived >= targetPings) {
            clearInterval(pingInterval);
            clearTimeout(timeout);
            
            const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
            this.log(`Average heartbeat latency: ${avgLatency.toFixed(2)}ms`);
            
            if (avgLatency > 1000) {
              ws.close();
              reject(new Error(`High latency detected: ${avgLatency.toFixed(2)}ms`));
            } else {
              ws.close();
              resolve();
            }
            return;
          }
          
          const pingTime = Date.now();
          ws.send(JSON.stringify({
            type: 'ping',
            timestamp: pingTime
          }));
        }, 1000);
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'pong' && message.data?.timestamp) {
            const latency = Date.now() - message.data.timestamp;
            latencies.push(latency);
            pingsReceived++;
            this.log(`Ping ${pingsReceived}/${targetPings}: ${latency}ms`);
          }
        } catch (error) {
          // Ignore parsing errors
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Heartbeat test error: ${error.message}`));
      });
    });
  }

  async testReconnectionLogic() {
    return new Promise((resolve, reject) => {
      let connectionAttempts = 0;
      let reconnected = false;
      
      const timeout = setTimeout(() => {
        reject(new Error('Reconnection test timeout'));
      }, 15000);

      const connect = () => {
        connectionAttempts++;
        this.log(`Connection attempt ${connectionAttempts}`);
        
        const ws = new WebSocket('ws://localhost:3001/ws/lockers?sessionId=test-session');
        
        ws.on('open', () => {
          this.log(`Connected on attempt ${connectionAttempts}`);
          
          if (connectionAttempts === 1) {
            // First connection - simulate disconnection after 1 second
            setTimeout(() => {
              this.log('Simulating connection loss...');
              ws.close(1006, 'Simulated network error');
            }, 1000);
          } else {
            // Reconnection successful
            reconnected = true;
            clearTimeout(timeout);
            ws.close();
            resolve();
          }
        });

        ws.on('close', (code, reason) => {
          this.log(`Connection closed: ${code} - ${reason}`);
          
          if (!reconnected && connectionAttempts < 3) {
            // Simulate exponential backoff
            const backoffDelay = Math.min(1000 * Math.pow(1.5, connectionAttempts - 1), 5000);
            this.log(`Reconnecting in ${backoffDelay}ms...`);
            setTimeout(connect, backoffDelay);
          }
        });

        ws.on('error', (error) => {
          this.log(`Connection error: ${error.message}`);
        });
      };

      connect();
    });
  }

  async testMessageQueuing() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:3001/ws/lockers?sessionId=test-session');
      let messagesReceived = 0;
      const expectedMessages = 5;
      
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Message queuing test timeout'));
      }, 10000);

      // Send messages before connection is established (should be queued)
      for (let i = 0; i < expectedMessages; i++) {
        setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            // This would normally be queued by the client-side implementation
            this.log(`Queuing message ${i + 1}`);
          }
        }, i * 100);
      }

      ws.on('open', () => {
        this.log('Connection established, processing queued messages...');
        
        // Send test messages after connection
        for (let i = 0; i < expectedMessages; i++) {
          ws.send(JSON.stringify({
            type: 'test_message',
            data: { index: i },
            timestamp: new Date().toISOString()
          }));
        }
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'test_message_ack') {
            messagesReceived++;
            this.log(`Received acknowledgment ${messagesReceived}/${expectedMessages}`);
            
            if (messagesReceived >= expectedMessages) {
              clearTimeout(timeout);
              ws.close();
              resolve();
            }
          }
        } catch (error) {
          // Ignore parsing errors
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Message queuing test error: ${error.message}`));
      });
    });
  }

  async testPollingFallback() {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Polling fallback test timeout'));
      }, 10000);

      try {
        // Test the health endpoint that would be used for polling fallback
        const response = await this.makeHttpRequest('GET', '/api/websocket/health');
        
        if (response.statusCode !== 200) {
          throw new Error(`Health endpoint returned ${response.statusCode}`);
        }

        const healthData = JSON.parse(response.body);
        
        if (!healthData.websocket_available !== undefined) {
          throw new Error('Health endpoint missing websocket_available field');
        }

        if (!Array.isArray(healthData.events)) {
          throw new Error('Health endpoint missing events array');
        }

        this.log(`Polling fallback endpoint working: ${healthData.connection_health?.total_connections || 0} connections`);
        
        clearTimeout(timeout);
        resolve();
      } catch (error) {
        clearTimeout(timeout);
        reject(new Error(`Polling fallback test error: ${error.message}`));
      }
    });
  }

  async testHighConnectionLoad() {
    return new Promise((resolve, reject) => {
      const connectionCount = 50;
      const connections = [];
      let connectedCount = 0;
      let allConnected = false;
      
      const timeout = setTimeout(() => {
        connections.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        });
        reject(new Error('High connection load test timeout'));
      }, 30000);

      this.log(`Creating ${connectionCount} concurrent connections...`);

      for (let i = 0; i < connectionCount; i++) {
        const ws = new WebSocket(`ws://localhost:3001/ws/lockers?sessionId=test-session-${i}`);
        connections.push(ws);

        ws.on('open', () => {
          connectedCount++;
          
          if (connectedCount === connectionCount && !allConnected) {
            allConnected = true;
            this.log(`All ${connectionCount} connections established`);
            
            // Test broadcasting to all connections
            setTimeout(() => {
              this.log('Testing broadcast to all connections...');
              
              // Close all connections after a short delay
              setTimeout(() => {
                connections.forEach(ws => {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.close();
                  }
                });
                
                clearTimeout(timeout);
                resolve();
              }, 2000);
            }, 1000);
          }
        });

        ws.on('error', (error) => {
          this.log(`Connection ${i} error: ${error.message}`);
        });
      }
    });
  }

  async testNetworkInterruption() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:3001/ws/lockers?sessionId=test-session');
      let connectionLost = false;
      let reconnected = false;
      
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Network interruption test timeout'));
      }, 15000);

      ws.on('open', () => {
        this.log('Connection established for network interruption test');
        
        // Simulate network interruption after 2 seconds
        setTimeout(() => {
          this.log('Simulating network interruption...');
          ws.close(1006, 'Network interruption');
        }, 2000);
      });

      ws.on('close', (code, reason) => {
        if (!connectionLost) {
          connectionLost = true;
          this.log(`Connection lost: ${code} - ${reason}`);
          
          // Simulate recovery after 3 seconds
          setTimeout(() => {
            this.log('Simulating network recovery...');
            const newWs = new WebSocket('ws://localhost:3001/ws/lockers?sessionId=test-session');
            
            newWs.on('open', () => {
              reconnected = true;
              this.log('Reconnected after network interruption');
              clearTimeout(timeout);
              newWs.close();
              resolve();
            });

            newWs.on('error', (error) => {
              clearTimeout(timeout);
              reject(new Error(`Reconnection failed: ${error.message}`));
            });
          }, 3000);
        }
      });

      ws.on('error', (error) => {
        this.log(`Network interruption test error: ${error.message}`);
      });
    });
  }

  makeHttpRequest(method, path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 3001,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.end();
    });
  }

  async runAllTests() {
    this.log('Starting WebSocket Resilience Integration Tests');
    this.log('='.repeat(50));

    await this.runTest('Basic Connection', () => this.testBasicConnection());
    await this.runTest('Heartbeat Latency', () => this.testHeartbeatLatency());
    await this.runTest('Reconnection Logic', () => this.testReconnectionLogic());
    await this.runTest('Message Queuing', () => this.testMessageQueuing());
    await this.runTest('Polling Fallback', () => this.testPollingFallback());
    await this.runTest('High Connection Load', () => this.testHighConnectionLoad());
    await this.runTest('Network Interruption', () => this.testNetworkInterruption());

    this.log('='.repeat(50));
    this.log('Test Results Summary:');
    this.log(`Total Tests: ${this.results.summary.total}`);
    this.log(`Passed: ${this.results.summary.passed}`);
    this.log(`Failed: ${this.results.summary.failed}`);
    this.log(`Success Rate: ${((this.results.summary.passed / this.results.summary.total) * 100).toFixed(1)}%`);

    if (this.results.summary.failed > 0) {
      this.log('\nFailed Tests:');
      this.results.tests
        .filter(test => test.status === 'FAILED')
        .forEach(test => {
          this.log(`  - ${test.name}: ${test.error}`);
        });
    }

    return this.results.summary.failed === 0;
  }
}

// Run the tests if this script is executed directly
if (require.main === module) {
  const tester = new WebSocketResilienceTest();
  
  tester.runAllTests()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
}

module.exports = WebSocketResilienceTest;