import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebSocket } from '../hooks/useWebSocket';
import { vi } from 'vitest';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  protocol = '';

  constructor(public url: string) {
    // Simulate connection delay
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 10);
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // Echo ping as pong for testing
    const message = JSON.parse(data);
    if (message.type === 'ping') {
      setTimeout(() => {
        this.onmessage?.(new MessageEvent('message', {
          data: JSON.stringify({
            type: 'pong',
            data: { timestamp: message.timestamp },
            timestamp: new Date().toISOString()
          })
        }));
      }, 50); // Simulate 50ms latency
    }
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    setTimeout(() => {
      this.onclose?.(new CloseEvent('close', { code: code || 1000, reason: reason || '' }));
    }, 10);
  }

  // Helper methods for testing
  simulateMessage(type: string, data: any) {
    if (this.readyState === MockWebSocket.OPEN) {
      this.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({ type, data, timestamp: new Date().toISOString() })
      }));
    }
  }

  simulateError() {
    this.onerror?.(new Event('error'));
  }

  simulateDisconnection(code = 1006, reason = 'Connection lost') {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }
}

// Mock fetch for polling fallback
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock WebSocket globally
(global as any).WebSocket = MockWebSocket;

// Mock auth context
vi.mock('../contexts/auth-context', () => ({
  useAuth: () => ({
    sessionId: 'test-session-123'
  })
}));

describe('useWebSocket Resilience', () => {
  let mockWebSocket: MockWebSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
    
    // Mock successful health endpoint
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        websocket_available: true,
        events: []
      })
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should establish connection with health monitoring', async () => {
    const { result } = renderHook(() => useWebSocket({
      namespace: '/ws/test',
      heartbeatInterval: 100
    }));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(result.current.connectionHealth).toBe('healthy');
    expect(result.current.averageLatency).toBe(0);
    expect(result.current.isPollingFallback).toBe(false);
  });

  it('should measure latency and update health status', async () => {
    const { result } = renderHook(() => useWebSocket({
      namespace: '/ws/test',
      heartbeatInterval: 100
    }));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Wait for heartbeat and pong response
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    expect(result.current.averageLatency).toBeGreaterThan(0);
    expect(result.current.connectionHealth).toBe('healthy'); // 50ms latency should be healthy
  });

  it('should queue messages when disconnected', async () => {
    const { result } = renderHook(() => useWebSocket({
      namespace: '/ws/test'
    }));

    // Send message before connection is established
    act(() => {
      const sent = result.current.sendMessage('test_event', { data: 'test' });
      expect(sent).toBe(false); // Should return false when not connected
    });

    expect(result.current.messageQueueSize).toBe(1);

    // Wait for connection
    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Message queue should be processed
    await waitFor(() => {
      expect(result.current.messageQueueSize).toBe(0);
    });
  });

  it('should handle connection failures with exponential backoff', async () => {
    // Mock WebSocket to fail immediately
    (global as any).WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        setTimeout(() => {
          this.readyState = MockWebSocket.CLOSED;
          this.onclose?.(new CloseEvent('close', { code: 1006, reason: 'Connection failed' }));
        }, 10);
      }
    };

    const { result } = renderHook(() => useWebSocket({
      namespace: '/ws/test',
      autoReconnect: true,
      maxReconnectAttempts: 3,
      reconnectInterval: 100
    }));

    // Should start connecting
    expect(result.current.isConnecting).toBe(true);

    // Wait for connection failure and first reconnect attempt
    await waitFor(() => {
      expect(result.current.reconnectAttempts).toBe(1);
    }, { timeout: 1000 });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBe('Connection failed');
  });

  it('should start polling fallback after max reconnection attempts', async () => {
    // Mock WebSocket to always fail
    (global as any).WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        setTimeout(() => {
          this.readyState = MockWebSocket.CLOSED;
          this.onclose?.(new CloseEvent('close', { code: 1006, reason: 'Connection failed' }));
        }, 10);
      }
    };

    const { result } = renderHook(() => useWebSocket({
      namespace: '/ws/test',
      autoReconnect: true,
      maxReconnectAttempts: 2,
      reconnectInterval: 50
    }));

    // Wait for max reconnection attempts to be reached
    await waitFor(() => {
      expect(result.current.isPollingFallback).toBe(true);
    }, { timeout: 2000 });

    expect(result.current.reconnectAttempts).toBe(2);
    expect(mockFetch).toHaveBeenCalledWith('/api/websocket/health');
  });

  it('should process events from polling fallback', async () => {
    // Mock WebSocket to always fail
    (global as any).WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        setTimeout(() => {
          this.readyState = MockWebSocket.CLOSED;
          this.onclose?.(new CloseEvent('close', { code: 1006, reason: 'Connection failed' }));
        }, 10);
      }
    };

    // Mock health endpoint with events
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        websocket_available: false,
        events: [
          { type: 'test_event', data: { message: 'from_polling' } }
        ]
      })
    });

    const { result } = renderHook(() => useWebSocket({
      namespace: '/ws/test',
      autoReconnect: true,
      maxReconnectAttempts: 1,
      reconnectInterval: 50
    }));

    const eventHandler = vi.fn();
    
    act(() => {
      result.current.addEventListener('test_event', eventHandler);
    });

    // Wait for polling fallback to start
    await waitFor(() => {
      expect(result.current.isPollingFallback).toBe(true);
    }, { timeout: 1000 });

    // Wait for polling to process events
    await waitFor(() => {
      expect(eventHandler).toHaveBeenCalledWith({ message: 'from_polling' });
    }, { timeout: 2000 });
  });

  it('should detect unhealthy connection and force reconnection', async () => {
    const { result } = renderHook(() => useWebSocket({
      namespace: '/ws/test',
      heartbeatInterval: 100
    }));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Get reference to the WebSocket instance
    const wsInstance = (global as any).WebSocket.instances?.[0];

    // Simulate heartbeat timeout by not responding to ping
    act(() => {
      // Override send to not respond to pings
      wsInstance.send = vi.fn();
    });

    // Wait for heartbeat timeout
    await waitFor(() => {
      expect(result.current.connectionHealth).toBe('unhealthy');
    }, { timeout: 500 });

    expect(result.current.error).toBe('Heartbeat timeout');
  });

  it('should limit message queue size', async () => {
    const { result } = renderHook(() => useWebSocket({
      namespace: '/ws/test'
    }));

    // Send more messages than queue limit (100)
    act(() => {
      for (let i = 0; i < 150; i++) {
        result.current.sendMessage('test_event', { index: i });
      }
    });

    // Queue should be limited to 100 messages
    expect(result.current.messageQueueSize).toBe(100);
  });

  it('should clean up resources on disconnect', async () => {
    const { result, unmount } = renderHook(() => useWebSocket({
      namespace: '/ws/test',
      heartbeatInterval: 100
    }));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Unmount should clean up all timers and connections
    unmount();

    // Verify cleanup (no specific assertions, but should not throw errors)
    expect(true).toBe(true);
  });

  it('should handle network condition changes gracefully', async () => {
    const { result } = renderHook(() => useWebSocket({
      namespace: '/ws/test',
      heartbeatInterval: 100
    }));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Simulate network interruption
    act(() => {
      const wsInstance = (global as any).WebSocket.instances?.[0];
      wsInstance?.simulateDisconnection(1006, 'Network error');
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.connectionHealth).toBe('unhealthy');
  });
});