import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../contexts/auth-context';

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
  namespace?: string;
  room?: string;
}

export interface WebSocketOptions {
  namespace: string;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
  maxReconnectInterval?: number;
  reconnectBackoffMultiplier?: number;
  heartbeatInterval?: number;
}

export interface WebSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnectAttempts: number;
  lastMessage: WebSocketMessage | null;
  connectionHealth: 'healthy' | 'degraded' | 'unhealthy';
  lastPingTime: number | null;
  averageLatency: number;
  messageQueueSize: number;
  isPollingFallback: boolean;
}

export function useWebSocket(options: WebSocketOptions) {
  const {
    namespace,
    autoReconnect = true,
    maxReconnectAttempts = 10,
    reconnectInterval = 1000,
    maxReconnectInterval = 30000,
    reconnectBackoffMultiplier = 1.5,
    heartbeatInterval = 30000
  } = options;

  const { sessionId } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const healthCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageQueueRef = useRef<WebSocketMessage[]>([]);
  const eventListenersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());
  const latencyHistoryRef = useRef<number[]>([]);
  const lastPingTimeRef = useRef<number | null>(null);
  const connectionAttemptsRef = useRef<number>(0);
  const maxQueueSizeRef = useRef<number>(100);
  const pollingIntervalRef = useRef<number>(5000); // 5 seconds
  const connectRef = useRef<(() => void) | null>(null);

  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    reconnectAttempts: 0,
    lastMessage: null,
    connectionHealth: 'unhealthy',
    lastPingTime: null,
    averageLatency: 0,
    messageQueueSize: 0,
    isPollingFallback: false
  });

  // Calculate next reconnect interval with exponential backoff
  const getReconnectInterval = useCallback((attempt: number) => {
    const interval = Math.min(
      reconnectInterval * Math.pow(reconnectBackoffMultiplier, attempt),
      maxReconnectInterval
    );
    // Add jitter to prevent thundering herd
    return interval + Math.random() * 1000;
  }, [reconnectInterval, reconnectBackoffMultiplier, maxReconnectInterval]);

  // Calculate connection health based on latency and connection stability
  const calculateConnectionHealth = useCallback((latency: number): 'healthy' | 'degraded' | 'unhealthy' => {
    if (latency < 100) return 'healthy';
    if (latency < 500) return 'degraded';
    return 'unhealthy';
  }, []);

  // Update latency metrics
  const updateLatencyMetrics = useCallback((latency: number) => {
    latencyHistoryRef.current.push(latency);
    // Keep only last 10 measurements
    if (latencyHistoryRef.current.length > 10) {
      latencyHistoryRef.current = latencyHistoryRef.current.slice(-10);
    }
    
    const averageLatency = latencyHistoryRef.current.reduce((sum, l) => sum + l, 0) / latencyHistoryRef.current.length;
    const health = calculateConnectionHealth(averageLatency);
    
    setState(prev => ({
      ...prev,
      averageLatency,
      connectionHealth: health,
      lastPingTime: Date.now()
    }));
  }, [calculateConnectionHealth]);

  // Start polling fallback when WebSocket is unavailable
  const startPollingFallback = useCallback(async () => {
    if (pollingTimeoutRef.current) return; // Already polling
    
    setState(prev => ({ ...prev, isPollingFallback: true }));
    
    const poll = async () => {
      try {
        // Attempt to fetch latest data via REST API
        const response = await fetch('/api/websocket/health');
        if (response.ok) {
          const data = await response.json();
          
          // If WebSocket is available again, try to reconnect
          if (data.websocket_available && !wsRef.current) {
            console.log('WebSocket available again, attempting reconnection');
            setState(prev => ({ ...prev, isPollingFallback: false }));
            // Trigger reconnection by clearing state and letting useEffect handle it
            setState(prev => ({ ...prev, reconnectAttempts: 0 }));
            return;
          }
          
          // Process any queued events from the server
          if (data.events && Array.isArray(data.events)) {
            data.events.forEach((event: any) => {
              const listeners = eventListenersRef.current.get(event.type);
              if (listeners) {
                listeners.forEach(listener => {
                  try {
                    listener(event.data);
                  } catch (error) {
                    console.error('Error in polling fallback listener:', error);
                  }
                });
              }
            });
          }
        }
      } catch (error) {
        console.error('Polling fallback error:', error);
      }
      
      // Schedule next poll
      pollingTimeoutRef.current = setTimeout(poll, pollingIntervalRef.current);
    };
    
    poll();
  }, []);

  // Stop polling fallback
  const stopPollingFallback = useCallback(() => {
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
    setState(prev => ({ ...prev, isPollingFallback: false }));
  }, []);

  // Enhanced message queuing with size limits
  const queueMessage = useCallback((message: WebSocketMessage) => {
    if (messageQueueRef.current.length >= maxQueueSizeRef.current) {
      // Remove oldest message to make room
      messageQueueRef.current.shift();
    }
    messageQueueRef.current.push(message);
    setState(prev => ({ ...prev, messageQueueSize: messageQueueRef.current.length }));
  }, []);

  // Send heartbeat ping with latency measurement
  const sendHeartbeat = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      lastPingTimeRef.current = Date.now();
      wsRef.current.send(JSON.stringify({ 
        type: 'ping',
        timestamp: lastPingTimeRef.current
      }));
      
      // Set up health check timeout
      if (healthCheckTimeoutRef.current) {
        clearTimeout(healthCheckTimeoutRef.current);
      }
      
      healthCheckTimeoutRef.current = setTimeout(() => {
        console.warn('Heartbeat timeout - connection may be unhealthy');
        setState(prev => ({ 
          ...prev, 
          connectionHealth: 'unhealthy',
          error: 'Heartbeat timeout'
        }));
        
        // If we haven't received a pong in a while, consider reconnecting
        if (Date.now() - (lastPingTimeRef.current || 0) > heartbeatInterval * 2) {
          console.log('Forcing reconnection due to heartbeat timeout');
          wsRef.current?.close(1006, 'Heartbeat timeout');
        }
      }, heartbeatInterval / 2); // Timeout after half the heartbeat interval
    }
  }, [heartbeatInterval]);

  // Start heartbeat timer
  const startHeartbeat = useCallback(() => {
    if (heartbeatTimeoutRef.current) {
      clearInterval(heartbeatTimeoutRef.current);
    }
    heartbeatTimeoutRef.current = setInterval(sendHeartbeat, heartbeatInterval);
  }, [sendHeartbeat, heartbeatInterval]);

  // Stop heartbeat timer
  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimeoutRef.current) {
      clearInterval(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  // Process queued messages after reconnection
  const processMessageQueue = useCallback(() => {
    const queue = messageQueueRef.current;
    messageQueueRef.current = [];
    
    queue.forEach(message => {
      const listeners = eventListenersRef.current.get(message.type);
      if (listeners) {
        listeners.forEach(listener => {
          try {
            listener(message.data);
          } catch (error) {
            console.error('Error in WebSocket message listener:', error);
          }
        });
      }
    });
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!sessionId) {
      setState(prev => ({ ...prev, error: 'No session ID available' }));
      return;
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING || 
        wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}${namespace}?sessionId=${sessionId}`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`WebSocket connected to ${namespace}`);
        connectionAttemptsRef.current = 0;
        
        setState(prev => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          error: null,
          reconnectAttempts: 0,
          connectionHealth: 'healthy',
          messageQueueSize: messageQueueRef.current.length
        }));
        
        // Stop polling fallback if it was active
        stopPollingFallback();
        
        startHeartbeat();
        processMessageQueue();
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          setState(prev => ({ ...prev, lastMessage: message }));

          // Handle special message types
          if (message.type === 'pong') {
            // Calculate latency and update health metrics
            if (lastPingTimeRef.current && message.data?.timestamp) {
              const latency = Date.now() - message.data.timestamp;
              updateLatencyMetrics(latency);
            }
            
            // Clear health check timeout
            if (healthCheckTimeoutRef.current) {
              clearTimeout(healthCheckTimeoutRef.current);
              healthCheckTimeoutRef.current = null;
            }
            
            return;
          }

          if (message.type === 'connection') {
            console.log('WebSocket connection confirmed:', message.data);
            return;
          }

          if (message.type === 'room_joined' || message.type === 'room_left') {
            console.log(`WebSocket room event: ${message.type}`, message.data);
            return;
          }

          // Dispatch to event listeners
          const listeners = eventListenersRef.current.get(message.type);
          if (listeners) {
            listeners.forEach(listener => {
              try {
                listener(message.data);
              } catch (error) {
                console.error('Error in WebSocket message listener:', error);
              }
            });
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log(`WebSocket disconnected from ${namespace}:`, event.code, event.reason);
        connectionAttemptsRef.current++;
        
        setState(prev => ({
          ...prev,
          isConnected: false,
          isConnecting: false,
          error: event.reason || 'Connection closed',
          connectionHealth: 'unhealthy'
        }));
        
        stopHeartbeat();
        
        // Clear health check timeout
        if (healthCheckTimeoutRef.current) {
          clearTimeout(healthCheckTimeoutRef.current);
          healthCheckTimeoutRef.current = null;
        }

        // Attempt reconnection if enabled and not a normal closure
        if (autoReconnect && event.code !== 1000 && state.reconnectAttempts < maxReconnectAttempts) {
          const nextInterval = getReconnectInterval(state.reconnectAttempts);
          console.log(`Reconnecting in ${nextInterval}ms (attempt ${state.reconnectAttempts + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            setState(prev => ({ ...prev, reconnectAttempts: prev.reconnectAttempts + 1 }));
            // Use setTimeout to break the circular dependency
            setTimeout(() => connect(), 0);
          }, nextInterval);
        } else if (state.reconnectAttempts >= maxReconnectAttempts) {
          // Max reconnection attempts reached, start polling fallback
          console.log('Max reconnection attempts reached, starting polling fallback');
          startPollingFallback();
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setState(prev => ({
          ...prev,
          error: 'WebSocket connection error',
          isConnecting: false
        }));
      };

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to create WebSocket connection',
        isConnecting: false
      }));
    }
  }, [sessionId, namespace, autoReconnect, maxReconnectAttempts, getReconnectInterval, startHeartbeat, processMessageQueue, state.reconnectAttempts]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (healthCheckTimeoutRef.current) {
      clearTimeout(healthCheckTimeoutRef.current);
      healthCheckTimeoutRef.current = null;
    }
    
    stopHeartbeat();
    stopPollingFallback();

    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      reconnectAttempts: 0,
      connectionHealth: 'unhealthy',
      messageQueueSize: 0
    }));
    
    // Clear message queue on manual disconnect
    messageQueueRef.current = [];
  }, [stopHeartbeat, stopPollingFallback]);

  // Send message with enhanced queuing
  const sendMessage = useCallback((type: string, data: any) => {
    const message: WebSocketMessage = {
      type,
      data,
      timestamp: new Date().toISOString(),
      namespace
    };

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } else {
      // Queue message for later if not connected
      queueMessage(message);
      console.log(`Message queued: ${type} (queue size: ${messageQueueRef.current.length})`);
      return false;
    }
  }, [namespace, queueMessage]);

  // Join room
  const joinRoom = useCallback((room: string) => {
    return sendMessage('join_room', { room });
  }, [sendMessage]);

  // Leave room
  const leaveRoom = useCallback((room: string) => {
    return sendMessage('leave_room', { room });
  }, [sendMessage]);

  // Add event listener
  const addEventListener = useCallback((eventType: string, listener: (data: any) => void) => {
    if (!eventListenersRef.current.has(eventType)) {
      eventListenersRef.current.set(eventType, new Set());
    }
    eventListenersRef.current.get(eventType)!.add(listener);

    // Return cleanup function
    return () => {
      const listeners = eventListenersRef.current.get(eventType);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          eventListenersRef.current.delete(eventType);
        }
      }
    };
  }, []);

  // Remove event listener
  const removeEventListener = useCallback((eventType: string, listener: (data: any) => void) => {
    const listeners = eventListenersRef.current.get(eventType);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        eventListenersRef.current.delete(eventType);
      }
    }
  }, []);

  // Manual reconnect
  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(() => {
      setState(prev => ({ ...prev, reconnectAttempts: 0 }));
      connect();
    }, 100);
  }, [disconnect, connect]);

  // Auto-connect on mount and session change
  useEffect(() => {
    if (sessionId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [sessionId, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (healthCheckTimeoutRef.current) {
        clearTimeout(healthCheckTimeoutRef.current);
      }
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
      }
      stopHeartbeat();
      stopPollingFallback();
    };
  }, [stopHeartbeat, stopPollingFallback]);

  return {
    ...state,
    connect,
    disconnect,
    reconnect,
    sendMessage,
    joinRoom,
    leaveRoom,
    addEventListener,
    removeEventListener
  };
}