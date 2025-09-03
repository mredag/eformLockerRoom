import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  WebSocketMessage,
  HardwareDetectionUpdate,
  HardwareTestingUpdate,
  HardwareConfigurationUpdate,
  WizardProgressUpdate,
  HardwareErrorUpdate,
  HardwareRecoveryUpdate,
  ConnectionStatus
} from '../../../shared/types/core-entities';

export interface WebSocketHookOptions {
  url?: string;
  sessionId?: string;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  onMessage?: (message: WebSocketMessage) => void;
}

export interface WebSocketHookReturn {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionStatus: ConnectionStatus | null;
  error: string | null;
  
  // Connection control
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
  
  // Session management
  subscribeToSession: (sessionId: string) => void;
  unsubscribeFromSession: (sessionId: string) => void;
  
  // Message sending
  sendMessage: (message: any) => void;
  
  // Event handlers
  onHardwareDetection: (handler: (update: HardwareDetectionUpdate) => void) => () => void;
  onHardwareTesting: (handler: (update: HardwareTestingUpdate) => void) => () => void;
  onHardwareConfiguration: (handler: (update: HardwareConfigurationUpdate) => void) => () => void;
  onWizardProgress: (handler: (update: WizardProgressUpdate) => void) => () => void;
  onHardwareError: (handler: (update: HardwareErrorUpdate) => void) => () => void;
  onHardwareRecovery: (handler: (update: HardwareRecoveryUpdate) => void) => () => void;
  onConnectionStatusChange: (handler: (status: ConnectionStatus) => void) => () => void;
}

export const useWebSocket = (options: WebSocketHookOptions = {}): WebSocketHookReturn => {
  const {
    url = `ws://${window.location.hostname}:8080`,
    sessionId,
    autoReconnect = true,
    maxReconnectAttempts = 5,
    reconnectDelay = 1000,
    onConnect,
    onDisconnect,
    onError,
    onMessage
  } = options;

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const eventHandlersRef = useRef<Map<string, Set<Function>>>(new Map());

  // Event handler management
  const addEventListener = useCallback((eventType: string, handler: Function): (() => void) => {
    if (!eventHandlersRef.current.has(eventType)) {
      eventHandlersRef.current.set(eventType, new Set());
    }
    eventHandlersRef.current.get(eventType)!.add(handler);

    // Return cleanup function
    return () => {
      const handlers = eventHandlersRef.current.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          eventHandlersRef.current.delete(eventType);
        }
      }
    };
  }, []);

  const triggerEventHandlers = useCallback((eventType: string, data: any) => {
    const handlers = eventHandlersRef.current.get(eventType);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in WebSocket event handler for ${eventType}:`, error);
        }
      });
    }
  }, []);

  // WebSocket message handler
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      // Trigger general message handler
      if (onMessage) {
        onMessage(message);
      }

      // Trigger specific event handlers
      switch (message.type) {
        case 'hardware_detection':
          triggerEventHandlers('hardware_detection', message.data as HardwareDetectionUpdate);
          break;
        case 'hardware_testing':
          triggerEventHandlers('hardware_testing', message.data as HardwareTestingUpdate);
          break;
        case 'hardware_configuration':
          triggerEventHandlers('hardware_configuration', message.data as HardwareConfigurationUpdate);
          break;
        case 'wizard_progress':
          triggerEventHandlers('wizard_progress', message.data as WizardProgressUpdate);
          break;
        case 'hardware_error':
          triggerEventHandlers('hardware_error', message.data as HardwareErrorUpdate);
          break;
        case 'hardware_recovery':
          triggerEventHandlers('hardware_recovery', message.data as HardwareRecoveryUpdate);
          break;
        case 'connection_status':
          const status = message.data as ConnectionStatus;
          setConnectionStatus(status);
          triggerEventHandlers('connection_status', status);
          break;
        case 'heartbeat':
          // Handle heartbeat silently
          break;
        default:
          console.log('Received unknown WebSocket message type:', message.type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
      setError('Failed to parse WebSocket message');
    }
  }, [onMessage, triggerEventHandlers]);

  // Connection management
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      return; // Already connecting
    }

    setIsConnecting(true);
    setError(null);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('🔌 WebSocket connected');
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttemptsRef.current = 0;

        // Subscribe to session if provided
        if (sessionId) {
          ws.send(JSON.stringify({
            type: 'subscribe_session',
            sessionId
          }));
        }

        if (onConnect) {
          onConnect();
        }
      };

      ws.onclose = (event) => {
        console.log('🔌 WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);
        wsRef.current = null;

        if (onDisconnect) {
          onDisconnect();
        }

        // Auto-reconnect if enabled and not a clean close
        if (autoReconnect && event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = reconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
          console.log(`🔄 Attempting reconnection in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setError('Max reconnection attempts reached');
        }
      };

      ws.onerror = (event) => {
        console.error('🚨 WebSocket error:', event);
        setError('WebSocket connection error');
        setIsConnecting(false);

        if (onError) {
          onError(event);
        }
      };

      ws.onmessage = handleMessage;

    } catch (error) {
      console.error('🚨 Failed to create WebSocket connection:', error);
      setError('Failed to create WebSocket connection');
      setIsConnecting(false);
    }
  }, [url, sessionId, autoReconnect, maxReconnectAttempts, reconnectDelay, onConnect, onDisconnect, onError, handleMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    reconnectAttemptsRef.current = 0;
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(connect, 100);
  }, [disconnect, connect]);

  // Session management
  const subscribeToSession = useCallback((sessionId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe_session',
        sessionId
      }));
    }
  }, []);

  const unsubscribeFromSession = useCallback((sessionId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'unsubscribe_session',
        sessionId
      }));
    }
  }, []);

  // Message sending
  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, cannot send message:', message);
    }
  }, []);

  // Event handler registration
  const onHardwareDetection = useCallback((handler: (update: HardwareDetectionUpdate) => void) => {
    return addEventListener('hardware_detection', handler);
  }, [addEventListener]);

  const onHardwareTesting = useCallback((handler: (update: HardwareTestingUpdate) => void) => {
    return addEventListener('hardware_testing', handler);
  }, [addEventListener]);

  const onHardwareConfiguration = useCallback((handler: (update: HardwareConfigurationUpdate) => void) => {
    return addEventListener('hardware_configuration', handler);
  }, [addEventListener]);

  const onWizardProgress = useCallback((handler: (update: WizardProgressUpdate) => void) => {
    return addEventListener('wizard_progress', handler);
  }, [addEventListener]);

  const onHardwareError = useCallback((handler: (update: HardwareErrorUpdate) => void) => {
    return addEventListener('hardware_error', handler);
  }, [addEventListener]);

  const onHardwareRecovery = useCallback((handler: (update: HardwareRecoveryUpdate) => void) => {
    return addEventListener('hardware_recovery', handler);
  }, [addEventListener]);

  const onConnectionStatusChange = useCallback((handler: (status: ConnectionStatus) => void) => {
    return addEventListener('connection_status', handler);
  }, [addEventListener]);

  // Auto-connect on mount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Session subscription effect
  useEffect(() => {
    if (sessionId && isConnected) {
      subscribeToSession(sessionId);
    }
  }, [sessionId, isConnected, subscribeToSession]);

  return {
    // Connection state
    isConnected,
    isConnecting,
    connectionStatus,
    error,
    
    // Connection control
    connect,
    disconnect,
    reconnect,
    
    // Session management
    subscribeToSession,
    unsubscribeFromSession,
    
    // Message sending
    sendMessage,
    
    // Event handlers
    onHardwareDetection,
    onHardwareTesting,
    onHardwareConfiguration,
    onWizardProgress,
    onHardwareError,
    onHardwareRecovery,
    onConnectionStatusChange
  };
};

export default useWebSocket;