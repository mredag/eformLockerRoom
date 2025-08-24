import React from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useI18n } from '../hooks/useI18n';

interface WebSocketStatusProps {
  namespace: string;
  className?: string;
  showDetails?: boolean;
}

export function WebSocketStatus({ namespace, className = '', showDetails = false }: WebSocketStatusProps) {
  const { t } = useI18n();
  const webSocket = useWebSocket({ namespace });

  const getStatusColor = () => {
    if (webSocket.isConnected) {
      switch (webSocket.connectionHealth) {
        case 'healthy':
          return 'text-green-600 bg-green-100';
        case 'degraded':
          return 'text-yellow-600 bg-yellow-100';
        case 'unhealthy':
          return 'text-red-600 bg-red-100';
        default:
          return 'text-gray-600 bg-gray-100';
      }
    } else if (webSocket.isConnecting) {
      return 'text-blue-600 bg-blue-100';
    } else if (webSocket.isPollingFallback) {
      return 'text-orange-600 bg-orange-100';
    } else {
      return 'text-red-600 bg-red-100';
    }
  };

  const getStatusIcon = () => {
    if (webSocket.isConnected) {
      switch (webSocket.connectionHealth) {
        case 'healthy':
          return '🟢';
        case 'degraded':
          return '🟡';
        case 'unhealthy':
          return '🔴';
        default:
          return '⚪';
      }
    } else if (webSocket.isConnecting) {
      return '🔵';
    } else if (webSocket.isPollingFallback) {
      return '🟠';
    } else {
      return '🔴';
    }
  };

  const getStatusText = () => {
    if (webSocket.isConnected) {
      switch (webSocket.connectionHealth) {
        case 'healthy':
          return t('websocket.status.healthy');
        case 'degraded':
          return t('websocket.status.degraded');
        case 'unhealthy':
          return t('websocket.status.unhealthy');
        default:
          return t('websocket.status.connected');
      }
    } else if (webSocket.isConnecting) {
      return t('websocket.status.connecting');
    } else if (webSocket.isPollingFallback) {
      return t('websocket.status.polling_fallback');
    } else {
      return t('websocket.status.disconnected');
    }
  };

  const getDetailedInfo = () => {
    if (!showDetails) return null;

    return (
      <div className="mt-2 text-xs space-y-1">
        {webSocket.isConnected && (
          <>
            <div>
              {t('websocket.details.latency')}: {webSocket.averageLatency.toFixed(0)}ms
            </div>
            {webSocket.lastPingTime && (
              <div>
                {t('websocket.details.last_ping')}: {new Date(webSocket.lastPingTime).toLocaleTimeString()}
              </div>
            )}
          </>
        )}
        
        {webSocket.messageQueueSize > 0 && (
          <div>
            {t('websocket.details.queued_messages')}: {webSocket.messageQueueSize}
          </div>
        )}
        
        {webSocket.reconnectAttempts > 0 && (
          <div>
            {t('websocket.details.reconnect_attempts')}: {webSocket.reconnectAttempts}
          </div>
        )}
        
        {webSocket.error && (
          <div className="text-red-600">
            {t('websocket.details.error')}: {webSocket.error}
          </div>
        )}
        
        {webSocket.isPollingFallback && (
          <div className="text-orange-600">
            {t('websocket.details.using_polling')}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor()} ${className}`}>
      <span className="text-base">{getStatusIcon()}</span>
      <span>{getStatusText()}</span>
      {showDetails && getDetailedInfo()}
    </div>
  );
}

// Compact version for header/status bar
export function WebSocketStatusIndicator({ namespace, className = '' }: Omit<WebSocketStatusProps, 'showDetails'>) {
  const webSocket = useWebSocket({ namespace });

  const getStatusColor = () => {
    if (webSocket.isConnected) {
      switch (webSocket.connectionHealth) {
        case 'healthy':
          return 'bg-green-500';
        case 'degraded':
          return 'bg-yellow-500';
        case 'unhealthy':
          return 'bg-red-500';
        default:
          return 'bg-gray-500';
      }
    } else if (webSocket.isConnecting) {
      return 'bg-blue-500 animate-pulse';
    } else if (webSocket.isPollingFallback) {
      return 'bg-orange-500';
    } else {
      return 'bg-red-500';
    }
  };

  const getTooltipText = () => {
    let status = '';
    if (webSocket.isConnected) {
      status = `Connected (${webSocket.connectionHealth})`;
      if (webSocket.averageLatency > 0) {
        status += ` - ${webSocket.averageLatency.toFixed(0)}ms`;
      }
    } else if (webSocket.isConnecting) {
      status = 'Connecting...';
    } else if (webSocket.isPollingFallback) {
      status = 'Using polling fallback';
    } else {
      status = 'Disconnected';
    }

    if (webSocket.error) {
      status += ` - Error: ${webSocket.error}`;
    }

    return status;
  };

  return (
    <div 
      className={`w-3 h-3 rounded-full ${getStatusColor()} ${className}`}
      title={getTooltipText()}
    />
  );
}

// Hook for programmatic access to connection status
export function useWebSocketStatus(namespace: string) {
  const webSocket = useWebSocket({ namespace });

  return {
    isHealthy: webSocket.isConnected && webSocket.connectionHealth === 'healthy',
    isDegraded: webSocket.isConnected && webSocket.connectionHealth === 'degraded',
    isUnhealthy: webSocket.isConnected && webSocket.connectionHealth === 'unhealthy',
    isConnected: webSocket.isConnected,
    isConnecting: webSocket.isConnecting,
    isPollingFallback: webSocket.isPollingFallback,
    hasError: !!webSocket.error,
    error: webSocket.error,
    latency: webSocket.averageLatency,
    queueSize: webSocket.messageQueueSize,
    reconnectAttempts: webSocket.reconnectAttempts
  };
}