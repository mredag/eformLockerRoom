import { useEffect, useState, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';

export interface LockerState {
  id: number;
  kiosk_id: string;
  status: 'Free' | 'Reserved' | 'Owned' | 'Opening' | 'Blocked';
  owner_type?: 'rfid' | 'device' | 'vip';
  owner_key?: string;
  reserved_at?: string;
  owned_at?: string;
  is_vip: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface LockerStateChangeEvent {
  lockerId: string;
  oldState: 'closed' | 'open' | 'reserved' | 'maintenance' | 'error';
  newState: 'closed' | 'open' | 'reserved' | 'maintenance' | 'error';
  kioskId: string;
  userId?: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface OptimisticUpdate {
  id: string;
  lockerId: string;
  kioskId: string;
  expectedState: string;
  timestamp: number;
  timeout: NodeJS.Timeout;
}

export function useLockerUpdates() {
  const [lockers, setLockers] = useState<Map<string, LockerState>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const optimisticUpdatesRef = useRef<Map<string, OptimisticUpdate>>(new Map());

  const webSocket = useWebSocket({
    namespace: '/ws/lockers',
    autoReconnect: true,
    maxReconnectAttempts: 10,
    reconnectInterval: 1000,
    maxReconnectInterval: 30000,
    reconnectBackoffMultiplier: 1.5,
    heartbeatInterval: 30000
  });

  // Map WebSocket states to locker statuses
  const mapWebSocketStateToStatus = useCallback((state: string): LockerState['status'] => {
    switch (state) {
      case 'closed':
        return 'Free';
      case 'reserved':
        return 'Reserved';
      case 'open':
        return 'Owned';
      case 'maintenance':
        return 'Blocked';
      case 'error':
      default:
        return 'Free'; // Default fallback
    }
  }, []);

  // Load initial locker data
  const loadLockers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/lockers');
      if (!response.ok) {
        throw new Error(`Failed to load lockers: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to load lockers');
      }

      const lockersMap = new Map<string, LockerState>();
      result.data.forEach((locker: LockerState) => {
        const key = `${locker.kiosk_id}:${locker.id}`;
        lockersMap.set(key, locker);
      });

      setLockers(lockersMap);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error loading lockers';
      setError(errorMessage);
      console.error('Error loading lockers:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle locker state change events
  const handleLockerStateChange = useCallback((eventData: LockerStateChangeEvent) => {
    const { lockerId, newState, kioskId, metadata } = eventData;
    const lockerKey = lockerId; // Already in format "kioskId:lockerId"

    setLockers(prevLockers => {
      const newLockers = new Map(prevLockers);
      const existingLocker = newLockers.get(lockerKey);

      if (existingLocker) {
        // Update existing locker
        const updatedLocker: LockerState = {
          ...existingLocker,
          status: mapWebSocketStateToStatus(newState),
          updated_at: new Date().toISOString(),
          version: existingLocker.version + 1
        };

        // Update ownership information if provided in metadata
        if (metadata?.ownerType) {
          updatedLocker.owner_type = metadata.ownerType;
        }
        if (metadata?.ownerKey) {
          updatedLocker.owner_key = metadata.ownerKey;
        }
        if (newState === 'reserved' && !existingLocker.reserved_at) {
          updatedLocker.reserved_at = new Date().toISOString();
        }
        if (newState === 'open' && !existingLocker.owned_at) {
          updatedLocker.owned_at = new Date().toISOString();
        }
        if (newState === 'closed') {
          // Clear ownership when locker becomes free
          updatedLocker.owner_type = undefined;
          updatedLocker.owner_key = undefined;
          updatedLocker.reserved_at = undefined;
          updatedLocker.owned_at = undefined;
        }

        newLockers.set(lockerKey, updatedLocker);

        // Remove any matching optimistic update
        const optimisticUpdate = optimisticUpdatesRef.current.get(lockerKey);
        if (optimisticUpdate) {
          clearTimeout(optimisticUpdate.timeout);
          optimisticUpdatesRef.current.delete(lockerKey);
        }
      } else {
        // Create new locker entry (shouldn't normally happen, but handle gracefully)
        const [kioskIdPart, lockerIdPart] = lockerId.split(':');
        const newLocker: LockerState = {
          id: parseInt(lockerIdPart),
          kiosk_id: kioskIdPart,
          status: mapWebSocketStateToStatus(newState),
          is_vip: false,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        newLockers.set(lockerKey, newLocker);
      }

      return newLockers;
    });
  }, [mapWebSocketStateToStatus]);

  // Perform optimistic update
  const performOptimisticUpdate = useCallback((
    kioskId: string,
    lockerId: number,
    expectedNewStatus: LockerState['status'],
    rollbackTimeoutMs: number = 5000
  ) => {
    const lockerKey = `${kioskId}:${lockerId}`;
    const updateId = `${lockerKey}-${Date.now()}`;

    // Apply optimistic update
    setLockers(prevLockers => {
      const newLockers = new Map(prevLockers);
      const existingLocker = newLockers.get(lockerKey);

      if (existingLocker) {
        const optimisticLocker: LockerState = {
          ...existingLocker,
          status: expectedNewStatus,
          updated_at: new Date().toISOString()
        };

        newLockers.set(lockerKey, optimisticLocker);
      }

      return newLockers;
    });

    // Set up rollback timeout
    const rollbackTimeout = setTimeout(() => {
      console.warn(`Optimistic update timeout for ${lockerKey}, rolling back`);
      
      // Rollback the optimistic update
      setLockers(prevLockers => {
        const newLockers = new Map(prevLockers);
        const currentLocker = newLockers.get(lockerKey);

        if (currentLocker) {
          // Revert to previous status (this is a simplified rollback)
          // In a real implementation, you might want to store the original state
          loadLockers(); // Reload from server as fallback
        }

        return newLockers;
      });

      optimisticUpdatesRef.current.delete(lockerKey);
    }, rollbackTimeoutMs);

    // Store optimistic update for tracking
    const optimisticUpdate: OptimisticUpdate = {
      id: updateId,
      lockerId: lockerKey,
      kioskId,
      expectedState: expectedNewStatus,
      timestamp: Date.now(),
      timeout: rollbackTimeout
    };

    optimisticUpdatesRef.current.set(lockerKey, optimisticUpdate);

    return updateId;
  }, [loadLockers]);

  // Cancel optimistic update
  const cancelOptimisticUpdate = useCallback((kioskId: string, lockerId: number) => {
    const lockerKey = `${kioskId}:${lockerId}`;
    const optimisticUpdate = optimisticUpdatesRef.current.get(lockerKey);

    if (optimisticUpdate) {
      clearTimeout(optimisticUpdate.timeout);
      optimisticUpdatesRef.current.delete(lockerKey);
    }
  }, []);

  // Get lockers for a specific kiosk
  const getKioskLockers = useCallback((kioskId: string): LockerState[] => {
    const kioskLockers: LockerState[] = [];
    
    lockers.forEach((locker, key) => {
      if (locker.kiosk_id === kioskId) {
        kioskLockers.push(locker);
      }
    });

    return kioskLockers.sort((a, b) => a.id - b.id);
  }, [lockers]);

  // Get locker by key
  const getLocker = useCallback((kioskId: string, lockerId: number): LockerState | undefined => {
    const key = `${kioskId}:${lockerId}`;
    return lockers.get(key);
  }, [lockers]);

  // Get locker statistics
  const getLockerStats = useCallback(() => {
    let total = 0;
    let free = 0;
    let reserved = 0;
    let owned = 0;
    let blocked = 0;
    let vip = 0;

    lockers.forEach(locker => {
      total++;
      switch (locker.status) {
        case 'Free':
          free++;
          break;
        case 'Reserved':
          reserved++;
          break;
        case 'Owned':
          owned++;
          break;
        case 'Blocked':
          blocked++;
          break;
      }
      if (locker.is_vip) {
        vip++;
      }
    });

    return { total, free, reserved, owned, blocked, vip };
  }, [lockers]);

  // Set up WebSocket event listeners
  useEffect(() => {
    if (webSocket.isConnected) {
      // Join the locker updates room
      webSocket.joinRoom('locker_updates');

      // Listen for locker state changes
      const removeListener = webSocket.addEventListener('locker_state_changed', handleLockerStateChange);

      return () => {
        removeListener();
        webSocket.leaveRoom('locker_updates');
      };
    }
  }, [webSocket.isConnected, webSocket, handleLockerStateChange]);

  // Load initial data when component mounts or WebSocket connects
  useEffect(() => {
    loadLockers();
  }, [loadLockers]);

  // Cleanup optimistic updates on unmount
  useEffect(() => {
    return () => {
      optimisticUpdatesRef.current.forEach(update => {
        clearTimeout(update.timeout);
      });
      optimisticUpdatesRef.current.clear();
    };
  }, []);

  return {
    lockers: Array.from(lockers.values()),
    lockersMap: lockers,
    isLoading,
    error,
    isConnected: webSocket.isConnected,
    isConnecting: webSocket.isConnecting,
    reconnectAttempts: webSocket.reconnectAttempts,
    loadLockers,
    getKioskLockers,
    getLocker,
    getLockerStats,
    performOptimisticUpdate,
    cancelOptimisticUpdate,
    webSocketState: {
      isConnected: webSocket.isConnected,
      isConnecting: webSocket.isConnecting,
      error: webSocket.error
    }
  };
}