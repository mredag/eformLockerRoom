import React, { useState } from 'react';

interface RelayCard {
  slave_address: number;
  channels: number;
  type: string;
  description: string;
  enabled: boolean;
  dip_switches: string;
  last_tested?: string;
  health_status?: 'healthy' | 'warning' | 'error';
  response_time?: number;
}

interface DeviceStatusCardProps {
  card: RelayCard;
  index: number;
  onTest: (address: number) => void;
  onConfigure: (address: number) => void;
}

export const DeviceStatusCard: React.FC<DeviceStatusCardProps> = ({
  card,
  index,
  onTest,
  onConfigure
}) => {
  const [testing, setTesting] = useState(false);

  // Calculate locker range for this card
  const getLockerRange = () => {
    const startLocker = (index * 16) + 1;
    const endLocker = startLocker + card.channels - 1;
    return `${startLocker}-${endLocker}`;
  };

  // Get health status color and icon
  const getHealthStatus = () => {
    if (!card.enabled) {
      return { color: 'secondary', icon: 'fa-power-off', text: 'Disabled' };
    }
    
    const status = card.health_status || 'healthy';
    switch (status) {
      case 'healthy':
        return { color: 'success', icon: 'fa-check-circle', text: 'Healthy' };
      case 'warning':
        return { color: 'warning', icon: 'fa-exclamation-triangle', text: 'Warning' };
      case 'error':
        return { color: 'danger', icon: 'fa-times-circle', text: 'Error' };
      default:
        return { color: 'secondary', icon: 'fa-question-circle', text: 'Unknown' };
    }
  };

  // Format last tested time
  const formatLastTested = () => {
    if (!card.last_tested) {
      return 'Never tested';
    }
    
    const date = new Date(card.last_tested);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours > 24) {
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  };

  // Handle individual card test
  const handleTest = async () => {
    try {
      setTesting(true);
      
      // Test communication with this specific card
      const response = await fetch('/api/hardware-config/test-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          slave_address: card.slave_address,
          test_type: 'communication'
        })
      });

      if (!response.ok) {
        throw new Error('Card test failed');
      }

      const result = await response.json();
      
      if (result.success) {
        alert(`Card ${card.slave_address} test successful! Response time: ${result.response_time || 'N/A'}ms`);
      } else {
        alert(`Card ${card.slave_address} test failed: ${result.error}`);
      }

      onTest(card.slave_address);
    } catch (error) {
      console.error('Error testing card:', error);
      alert(`Card test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTesting(false);
    }
  };

  const healthStatus = getHealthStatus();

  return (
    <div className={`device-status-card ${!card.enabled ? 'disabled' : ''}`}>
      {/* Card Header */}
      <div className="card-header">
        <div className="card-title">
          <h4>
            <i className="fas fa-microchip me-2"></i>
            Card {card.slave_address}
          </h4>
          <span className={`status-badge badge bg-${healthStatus.color}`}>
            <i className={`fas ${healthStatus.icon} me-1`}></i>
            {healthStatus.text}
          </span>
        </div>
        
        <div className="card-actions">
          <button
            className="btn btn-sm btn-outline-primary"
            onClick={handleTest}
            disabled={testing || !card.enabled}
            title="Test card communication"
          >
            {testing ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <i className="fas fa-vial"></i>
            )}
          </button>
          
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => onConfigure(card.slave_address)}
            disabled={!card.enabled}
            title="Configure card settings"
          >
            <i className="fas fa-cog"></i>
          </button>
        </div>
      </div>

      {/* Card Details */}
      <div className="card-body">
        <div className="card-info">
          <div className="info-row">
            <span className="info-label">Address:</span>
            <span className="info-value">{card.slave_address}</span>
          </div>
          
          <div className="info-row">
            <span className="info-label">Type:</span>
            <span className="info-value">{card.type}</span>
          </div>
          
          <div className="info-row">
            <span className="info-label">Channels:</span>
            <span className="info-value">{card.channels}</span>
          </div>
          
          <div className="info-row">
            <span className="info-label">Lockers:</span>
            <span className="info-value">{getLockerRange()}</span>
          </div>
          
          <div className="info-row">
            <span className="info-label">DIP Switches:</span>
            <span className="info-value dip-switches">{card.dip_switches}</span>
          </div>
        </div>

        <div className="card-description">
          <p>{card.description}</p>
        </div>

        {/* Performance Metrics */}
        <div className="performance-metrics">
          <div className="metric">
            <span className="metric-label">Response Time:</span>
            <span className="metric-value">
              {card.response_time ? `${card.response_time}ms` : 'N/A'}
            </span>
          </div>
          
          <div className="metric">
            <span className="metric-label">Last Tested:</span>
            <span className="metric-value">{formatLastTested()}</span>
          </div>
        </div>
      </div>

      {/* Card Footer */}
      <div className="card-footer">
        <div className="footer-actions">
          <button
            className="btn btn-sm btn-outline-success"
            onClick={handleTest}
            disabled={testing || !card.enabled}
          >
            {testing ? 'Testing...' : 'Quick Test'}
          </button>
          
          <button
            className="btn btn-sm btn-outline-info"
            onClick={() => {
              // Navigate to detailed card view
              window.location.href = `/panel/hardware-config?card=${card.slave_address}`;
            }}
          >
            View Details
          </button>
        </div>
        
        <div className="footer-status">
          {card.enabled ? (
            <span className="text-success">
              <i className="fas fa-check-circle me-1"></i>
              Active
            </span>
          ) : (
            <span className="text-secondary">
              <i className="fas fa-power-off me-1"></i>
              Disabled
            </span>
          )}
        </div>
      </div>
    </div>
  );
};