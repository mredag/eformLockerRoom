import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebSocket } from '../hooks/useWebSocket';
import { AuthProvider } from '../contexts/auth-context';
import React from 'react';

// Mock the auth context
const mockAuthContext = {
  user: { id: '1', username: 'testuser', role: 'admin' },
  sessionId: 'test-session-123',
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn()
};

vi.mock('../contexts/auth-context', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockAuthContext
}));

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
  url: string;

  constructor(url: string) {
    this.url = url;
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 10);
  }

  send(data: string) {
    // Mock send implementation
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }

  // Simulate receiving a message
  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  // Simulate connection error
  simulateError() {
    this.onerror?.(new Event('error'));
  }
}

global.WebSocket = MockWebSocket as any;

describe('useWebSocket', () => {
  let mockWebSocket: MockWebSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        protocol: 'http:',
        host: 'localhost:3000'
      },
      writable: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should connect to WebSocket with correct URL', async () => {
    const { result } = renderHook(() => 
      useWebSocket({ namespace: '/ws/test' })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(result.current.isConnecting).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('should handle connection with session ID', async () => {
    const { result } = renderHook(() => 
      useWebSocket({ namespace: '/ws/lockers' })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Check that WebSocket was created with session ID in URL
    expect(global.WebSocket).toHaveBeenCalledWith(
      'ws://localhost:3000/ws/lockers?sessionId=test-session-123'
    );
  });

  it('should handle incoming messages', async () => {
    const { result } = renderHook(() => 
      useWebSocket({ namespace: '/ws/test' })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    const messageHandler = vi.fn();
    act(() => {
      result.current.addEventListener('test_event', messageHandler);
    });

    // Simulate receiving a message
    const mockWs = (global.WebSocket as any).mock.instances[0];
    act(() => {
      mockWs.simulateMessage({
        type: 'test_event',
        data: { message: 'Hello World' },
        timestamp: new Date().toISOString()
      });
    });

    expect(messageHandler).toHaveBeenCalledWith({ message: 'Hello World' });
  });

  it('should send messages when connected', async () => {
    const { result } = renderHook(() => 
      useWebSocket({ namespace: '/ws/test' })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    const mockWs = (global.WebSocket as any).mock.instances[0];
    const sendSpy = vi.spyOn(mockWs, 'send');

    act(() => {
      const sent = result.current.sendMessage('test_type', { data: 'test' });
      expect(sent).toBe(true);
    });

    expect(sendSpy).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'test_type',
        data: { data: 'test' },
        timestamp: expect.any(String)
      })
    );
  });

  it('should queue messages when not connected', async () => {
    const { result } = renderHook(() => 
      useWebSocket({ namespace: '/ws/test' })
    );

    // Send message before connection is established
    act(() => {
      const sent = result.current.sendMessage('test_type', { data: 'test' });
      expect(sent).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Message should be processed when connection is established
    const mockWs = (global.WebSocket as any).mock.instances[0];
    const sendSpy = vi.spyOn(mockWs, 'send');
    
    // The queued message should be sent automatically
    await waitFor(() => {
      expect(sendSpy).toHaveBeenCalled();
    });
  });

  it('should handle room operations', async () => {
    const { result } = renderHook(() => 
      useWebSocket({ namespace: '/ws/test' })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    const mockWs = (global.WebSocket as any).mock.instances[0];
    const sendSpy = vi.spyOn(mockWs, 'send');

    act(() => {
      result.current.joinRoom('test_room');
    });

    expect(sendSpy).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'join_room',
        data: { room: 'test_room' },
        timestamp: expect.any(String)
      })
    );

    act(() => {
      result.current.leaveRoom('test_room');
    });

    expect(sendSpy).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'leave_room',
        data: { room: 'test_room' },
        timestamp: expect.any(String)
      })
    );
  });

  it('should handle connection errors and reconnection', async () => {
    const { result } = renderHook(() => 
      useWebSocket({ 
        namespace: '/ws/test',
        autoReconnect: true,
        maxReconnectAttempts: 3,
        reconnectInterval: 100
      })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    const mockWs = (global.WebSocket as any).mock.instances[0];

    // Simulate connection error
    act(() => {
      mockWs.simulateError();
      mockWs.close(1006, 'Connection lost');
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
    });

    expect(result.current.error).toBe('Connection lost');

    // Should attempt reconnection
    await waitFor(() => {
      expect(result.current.reconnectAttempts).toBeGreaterThan(0);
    }, { timeout: 1000 });
  });

  it('should handle heartbeat', async () => {
    const { result } = renderHook(() => 
      useWebSocket({ 
        namespace: '/ws/test',
        heartbeatInterval: 100
      })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    const mockWs = (global.WebSocket as any).mock.instances[0];
    const sendSpy = vi.spyOn(mockWs, 'send');

    // Wait for heartbeat to be sent
    await waitFor(() => {
      expect(sendSpy).toHaveBeenCalledWith(
        JSON.stringify({ type: 'ping' })
      );
    }, { timeout: 200 });
  });

  it('should handle special message types', async () => {
    const { result } = renderHook(() => 
      useWebSocket({ namespace: '/ws/test' })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    const mockWs = (global.WebSocket as any).mock.instances[0];

    // Test pong message (should not trigger event listeners)
    const messageHandler = vi.fn();
    act(() => {
      result.current.addEventListener('pong', messageHandler);
    });

    act(() => {
      mockWs.simulateMessage({
        type: 'pong',
        data: {},
        timestamp: new Date().toISOString()
      });
    });

    expect(messageHandler).not.toHaveBeenCalled();

    // Test connection confirmation message
    act(() => {
      mockWs.simulateMessage({
        type: 'connection',
        data: { connectionId: 'test-123' },
        timestamp: new Date().toISOString()
      });
    });

    // Should not trigger regular event listeners
    expect(messageHandler).not.toHaveBeenCalled();
  });

  it('should clean up on unmount', async () => {
    const { result, unmount } = renderHook(() => 
      useWebSocket({ namespace: '/ws/test' })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    const mockWs = (global.WebSocket as any).mock.instances[0];
    const closeSpy = vi.spyOn(mockWs, 'close');

    unmount();

    expect(closeSpy).toHaveBeenCalledWith(1000, 'Manual disconnect');
  });

  it('should handle manual reconnect', async () => {
    const { result } = renderHook(() => 
      useWebSocket({ namespace: '/ws/test' })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    act(() => {
      result.current.reconnect();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
    });

    // Should reconnect
    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
  });

  it('should handle exponential backoff for reconnection', async () => {
    const { result } = renderHook(() => 
      useWebSocket({ 
        namespace: '/ws/test',
        autoReconnect: true,
        reconnectInterval: 100,
        reconnectBackoffMultiplier: 2,
        maxReconnectInterval: 1000
      })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    const mockWs = (global.WebSocket as any).mock.instances[0];

    // Simulate multiple connection failures
    for (let i = 0; i < 3; i++) {
      act(() => {
        mockWs.close(1006, 'Connection lost');
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(false);
      });

      // Wait for reconnection attempt
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    expect(result.current.reconnectAttempts).toBeGreaterThan(0);
  });
});