import React, { useState, useEffect } from 'react';
import useWebSocket from '../../hooks/useWebSocket';
import { ConnectionStatus } from '../../../../shared/types/core-entities';
import './ConnectionStatusIndicator.css';

export interface ConnectionStatusIndicatorProps {
  sessionId?: string;
  showDetails?: boolean;
  compact?: boolean;
  onStatusChange?: (status: ConnectionStatus) => void;
}

export const ConnectionStatusIndicator: React.FC<ConnectionStatusIndicatorProps> = ({
  sessionId,
  showDetails = false,
  compact = false,
  onStatusChange
}) => {
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [stats, setStats] = useState<{
    totalClients: number;
    activeConnections: number;
    activeSessions: number;
    lastHardwareEvent?: Date;
  } | null>(null);

  const {
    isConnected,
    isConnecting,
    connectionStatus,
    error,
    onConnectionStatusChange,
    sendMessage,
    reconnect
  } = useWebSocket({
    sessionId,
    autoReconnect: true,
    onConnect: () => {
      // Request hardware status when connected
      sendMessage({ type: 'get_hardware_status' });
    }
  });

  // Handle connection status changes
  useEffect(() => {
    const unsubscribe = onConnectionStatusChange((status: ConnectionStatus) => {
      setLastUpdate(new Date());
      if (onStatusChange) {
        onStatusChange(status);
      }
    });

    return unsubscribe;
  }, [onConnectionStatusChange, onStatusChange]);

  // Periodically request hardware status
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      sendMessage({ type: 'get_hardware_status' });
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [isConnected, sendMessage]);

  const getStatusColor = (): string => {
    if (error) return '#dc3545';
    if (isConnecting) return '#ffc107';
    if (isConnected) return '#28a745';
    return '#6c757d';
  };

  const getStatusText = (): string => {
    if (error) return 'Error';
    if (isConnecting) return 'Connecting';
    if (isConnected) return 'Connected';
    return 'Disconnected';
  };

  const getStatusIcon = (): string => {
    if (error) return '❌';
    if (isConnecting) return '🔄';
    if (isConnected) return '🟢';
    return '🔴';
  };

  const formatTimestamp = (date: Date): string => {
    return date.toLocaleTimeString();
  };

  const formatDuration = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ago`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s ago`;
    } else {
      return `${seconds}s ago`;
    }
  };

  if (compact) {
    return (
      <div 
        className={`connection-status-indicator connection-status-indicator--compact`}
        title={`${getStatusText()}${error ? `: ${error}` : ''}`}
      >
        <span 
          className="connection-status-indicator__dot"
          style={{ backgroundColor: getStatusColor() }}
        />
        <span className="connection-status-indicator__text">
          {getStatusText()}
        </span>
      </div>
    );
  }

  return (
    <div className="connection-status-indicator">
      <div className="connection-status-indicator__header">
        <div className="connection-status-indicator__status">
          <span className="connection-status-indicator__icon">
            {getStatusIcon()}
          </span>
          <span 
            className="connection-status-indicator__text"
            style={{ color: getStatusColor() }}
          >
            {getStatusText()}
          </span>
        </div>
        
        {isConnected && (
          <button
            className="connection-status-indicator__refresh"
            onClick={() => sendMessage({ type: 'get_hardware_status' })}
            title="Refresh status"
          >
            🔄
          </button>
        )}
        
        {!isConnected && !isConnecting && (
          <button
            className="connection-status-indicator__reconnect"
            onClick={reconnect}
            title="Reconnect"
          >
            🔌
          </button>
        )}
      </div>

      {error && (
        <div className="connection-status-indicator__error">
          <span className="connection-status-indicator__error-icon">⚠️</span>
          <span className="connection-status-indicator__error-text">{error}</span>
        </div>
      )}

      {showDetails && connectionStatus && (
        <div className="connection-status-indicator__details">
          <div className="connection-status-indicator__detail">
            <span className="connection-status-indicator__detail-label">Status:</span>
            <span className="connection-status-indicator__detail-value">
              {connectionStatus.status}
            </span>
          </div>
          
          <div className="connection-status-indicator__detail">
            <span className="connection-status-indicator__detail-label">Clients:</span>
            <span className="connection-status-indicator__detail-value">
              {connectionStatus.connectedClients}
            </span>
          </div>
          
          <div className="connection-status-indicator__detail">
            <span className="connection-status-indicator__detail-label">Last Update:</span>
            <span className="connection-status-indicator__detail-value">
              {formatTimestamp(connectionStatus.lastUpdate)}
            </span>
          </div>
          
          {lastUpdate && (
            <div className="connection-status-indicator__detail">
              <span className="connection-status-indicator__detail-label">Updated:</span>
              <span className="connection-status-indicator__detail-value">
                {formatDuration(lastUpdate)}
              </span>
            </div>
          )}
        </div>
      )}

      {showDetails && stats && (
        <div className="connection-status-indicator__stats">
          <div className="connection-status-indicator__stats-title">
            Hardware Status
          </div>
          
          <div className="connection-status-indicator__detail">
            <span className="connection-status-indicator__detail-label">Active Sessions:</span>
            <span className="connection-status-indicator__detail-value">
              {stats.activeSessions}
            </span>
          </div>
          
          <div className="connection-status-indicator__detail">
            <span className="connection-status-indicator__detail-label">Total Clients:</span>
            <span className="connection-status-indicator__detail-value">
              {stats.totalClients}
            </span>
          </div>
          
          {stats.lastHardwareEvent && (
            <div className="connection-status-indicator__detail">
              <span className="connection-status-indicator__detail-label">Last Event:</span>
              <span className="connection-status-indicator__detail-value">
                {formatDuration(stats.lastHardwareEvent)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConnectionStatusIndicator;