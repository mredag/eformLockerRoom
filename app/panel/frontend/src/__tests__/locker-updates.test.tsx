import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLockerUpdates } from '../hooks/useLockerUpdates';
import { useWebSocket } from '../hooks/useWebSocket';

// Mock the WebSocket hook
vi.mock('../hooks/useWebSocket');
const mockUseWebSocket = vi.mocked(useWebSocket);

// Mock fetch
global.fetch = vi.fn();

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

  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 0);
  }

  send(data: string) {
    // Mock send implementation
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }
}

global.WebSocket = MockWebSocket as any;

describe('useLockerUpdates', () => {
  const mockWebSocketState = {
    isConnected: true,
    isConnecting: false,
    error: null,
    reconnectAttempts: 0,
    lastMessage: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
    sendMessage: vi.fn(),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock successful API response
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: [
          {
            id: 1,
            kiosk_id: 'kiosk1',
            status: 'Free',
            is_vip: false,
            version: 1,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z'
          },
          {
            id: 2,
            kiosk_id: 'kiosk1',
            status: 'Owned',
            owner_type: 'rfid',
            owner_key: 'card123',
            is_vip: false,
            version: 1,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z'
          }
        ]
      })
    });

    // Fix the addEventListener mock to return a cleanup function
    mockWebSocketState.addEventListener.mockReturnValue(() => {});
    mockUseWebSocket.mockReturnValue(mockWebSocketState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load initial locker data', async () => {
    const { result } = renderHook(() => useLockerUpdates());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.lockers).toHaveLength(2);
    expect(result.current.lockers[0].id).toBe(1);
    expect(result.current.lockers[0].status).toBe('Free');
    expect(result.current.lockers[1].id).toBe(2);
    expect(result.current.lockers[1].status).toBe('Owned');
  });

  it('should handle WebSocket connection', async () => {
    const { result } = renderHook(() => useLockerUpdates());

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(mockWebSocketState.joinRoom).toHaveBeenCalledWith('locker_updates');
    expect(mockWebSocketState.addEventListener).toHaveBeenCalledWith(
      'locker_state_changed',
      expect.any(Function)
    );
  });

  it('should handle locker state change events', async () => {
    let eventHandler: (data: any) => void;
    
    mockWebSocketState.addEventListener.mockImplementation((eventType, handler) => {
      if (eventType === 'locker_state_changed') {
        eventHandler = handler;
      }
      return vi.fn();
    });

    const { result } = renderHook(() => useLockerUpdates());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Simulate WebSocket event
    act(() => {
      eventHandler!({
        lockerId: 'kiosk1:1',
        oldState: 'closed',
        newState: 'reserved',
        kioskId: 'kiosk1',
        reason: 'assign',
        metadata: { ownerType: 'rfid', ownerKey: 'card456' }
      });
    });

    await waitFor(() => {
      const updatedLocker = result.current.getLocker('kiosk1', 1);
      expect(updatedLocker?.status).toBe('Reserved');
      expect(updatedLocker?.owner_type).toBe('rfid');
      expect(updatedLocker?.owner_key).toBe('card456');
    });
  });

  it('should perform optimistic updates', async () => {
    const { result } = renderHook(() => useLockerUpdates());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.performOptimisticUpdate('kiosk1', 1, 'Reserved', 1000);
    });

    const optimisticLocker = result.current.getLocker('kiosk1', 1);
    expect(optimisticLocker?.status).toBe('Reserved');
  });

  it('should get kiosk lockers correctly', async () => {
    const { result } = renderHook(() => useLockerUpdates());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const kioskLockers = result.current.getKioskLockers('kiosk1');
    expect(kioskLockers).toHaveLength(2);
    expect(kioskLockers[0].id).toBe(1);
    expect(kioskLockers[1].id).toBe(2);
  });

  it('should calculate locker statistics correctly', async () => {
    const { result } = renderHook(() => useLockerUpdates());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const stats = result.current.getLockerStats();
    expect(stats.total).toBe(2);
    expect(stats.free).toBe(1);
    expect(stats.owned).toBe(1);
    expect(stats.reserved).toBe(0);
    expect(stats.blocked).toBe(0);
    expect(stats.vip).toBe(0);
  });

  it('should handle API errors gracefully', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useLockerUpdates());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.lockers).toHaveLength(0);
  });

  it('should handle WebSocket disconnection', async () => {
    const disconnectedState = {
      ...mockWebSocketState,
      isConnected: false,
      error: 'Connection lost'
    };

    mockUseWebSocket.mockReturnValue(disconnectedState);

    const { result } = renderHook(() => useLockerUpdates());

    expect(result.current.webSocketState.isConnected).toBe(false);
    expect(result.current.webSocketState.error).toBe('Connection lost');
  });

  it('should map WebSocket states to locker statuses correctly', async () => {
    let eventHandler: (data: any) => void;
    
    mockWebSocketState.addEventListener.mockImplementation((eventType, handler) => {
      if (eventType === 'locker_state_changed') {
        eventHandler = handler;
      }
      return vi.fn();
    });

    const { result } = renderHook(() => useLockerUpdates());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Test different state mappings
    const testCases = [
      { wsState: 'closed', expectedStatus: 'Free' },
      { wsState: 'reserved', expectedStatus: 'Reserved' },
      { wsState: 'open', expectedStatus: 'Owned' },
      { wsState: 'maintenance', expectedStatus: 'Blocked' },
      { wsState: 'error', expectedStatus: 'Free' }
    ];

    for (const testCase of testCases) {
      act(() => {
        eventHandler!({
          lockerId: 'kiosk1:1',
          oldState: 'closed',
          newState: testCase.wsState,
          kioskId: 'kiosk1'
        });
      });

      await waitFor(() => {
        const updatedLocker = result.current.getLocker('kiosk1', 1);
        expect(updatedLocker?.status).toBe(testCase.expectedStatus);
      });
    }
  });
});