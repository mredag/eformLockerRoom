import React, { useState, useEffect, useCallback } from 'react';
import { DeviceStatusCard } from './DeviceStatusCard';
import { SystemHealthMonitor } from './SystemHealthMonitor';
import { webSocketService } from '../../../../../shared/services/websocket-service';

interface HardwareStats {
  total_lockers: number;
  total_cards: number;
  enabled_cards: number;
  total_channels: number;
  config_mismatch: boolean;
  maintenance_mode: boolean;
}

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

interface SystemConfig {
  hardware: {
    relay_cards: RelayCard[];
    modbus: {
      port: string;
      baudrate: number;
      timeout_ms: number;
    };
  };
  lockers: {
    total_count: number;
    maintenance_mode: boolean;
  };
}

export const HardwareDashboard: React.FC = () => {
  const [stats, setStats] = useState<HardwareStats | null>(null);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  // Load hardware configuration and stats
  const loadHardwareData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load configuration
      const configResponse = await fetch('/api/hardware-config');
      if (!configResponse.ok) {
        throw new Error('Failed to load hardware configuration');
      }
      const configData = await configResponse.json();
      setConfig(configData);

      // Load statistics
      const statsResponse = await fetch('/api/hardware-config/stats');
      if (!statsResponse.ok) {
        throw new Error('Failed to load hardware statistics');
      }
      const statsData = await statsResponse.json();
      setStats(statsData.stats);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load hardware data');
      console.error('Error loading hardware data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Scan for new devices
  const handleScanDevices = async () => {
    try {
      setScanning(true);
      setError(null);

      const response = await fetch('/api/hardware-config/detect-new-cards');
      if (!response.ok) {
        throw new Error('Device scan failed');
      }

      const result = await response.json();
      
      if (result.new_devices && result.new_devices.length > 0) {
        alert(`Found ${result.new_devices.length} new device(s)! Check the recommendations for configuration.`);
      } else {
        alert('No new devices found.');
      }

      // Reload data to show any changes
      await loadHardwareData();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Device scan failed');
      console.error('Error scanning devices:', err);
    } finally {
      setScanning(false);
    }
  };

  // Start hardware wizard
  const handleStartWizard = () => {
    window.location.href = '/panel/hardware-wizard';
  };

  // Test all hardware
  const handleTestHardware = async () => {
    try {
      setTesting(true);
      setError(null);

      const response = await fetch('/api/hardware-config/test-all-lockers', {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Hardware test failed');
      }

      const result = await response.json();
      
      if (result.success) {
        alert(`Hardware test completed: ${result.successful}/${result.total} lockers passed`);
      } else {
        throw new Error(result.error || 'Hardware test failed');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hardware test failed');
      console.error('Error testing hardware:', err);
    } finally {
      setTesting(false);
    }
  };

  // Initialize WebSocket connection for real-time updates
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        // Connect to WebSocket for real-time updates
        const ws = new WebSocket(`ws://${window.location.hostname}:8080`);
        
        ws.onopen = () => {
          console.log('🔌 WebSocket connected to hardware dashboard');
          setWsConnected(true);
        };

        ws.onclose = () => {
          console.log('🔌 WebSocket disconnected from hardware dashboard');
          setWsConnected(false);
          // Attempt to reconnect after 5 seconds
          setTimeout(connectWebSocket, 5000);
        };

        ws.onerror = (error) => {
          console.error('🚨 WebSocket error:', error);
          setWsConnected(false);
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            // Handle hardware-related real-time updates
            if (message.type === 'hardware_status_update') {
              loadHardwareData(); // Refresh data when hardware status changes
            } else if (message.type === 'state_update') {
              // Update locker states in real-time
              loadHardwareData();
            }
          } catch (err) {
            console.error('Error parsing WebSocket message:', err);
          }
        };

        return ws;
      } catch (err) {
        console.error('Failed to connect WebSocket:', err);
        setWsConnected(false);
        return null;
      }
    };

    const ws = connectWebSocket();
    
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [loadHardwareData]);

  // Load initial data
  useEffect(() => {
    loadHardwareData();
  }, [loadHardwareData]);

  if (loading) {
    return (
      <div className="hardware-dashboard loading">
        <div className="loading-spinner">
          <i className="fas fa-spinner fa-spin"></i>
          <p>Loading hardware configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hardware-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-content">
          <h1>
            <i className="fas fa-microchip me-2"></i>
            Hardware Configuration Dashboard
          </h1>
          <p>Monitor and manage your Modbus relay cards and locker system</p>
        </div>
        
        <div className="header-actions">
          <button 
            className="btn btn-primary"
            onClick={handleStartWizard}
            disabled={scanning || testing}
          >
            <i className="fas fa-magic me-1"></i>
            Add New Card
          </button>
          
          <button 
            className="btn btn-outline-primary"
            onClick={handleScanDevices}
            disabled={scanning || testing}
          >
            {scanning ? (
              <>
                <i className="fas fa-spinner fa-spin me-1"></i>
                Scanning...
              </>
            ) : (
              <>
                <i className="fas fa-search me-1"></i>
                Scan Devices
              </>
            )}
          </button>
          
          <button 
            className="btn btn-outline-success"
            onClick={handleTestHardware}
            disabled={scanning || testing}
          >
            {testing ? (
              <>
                <i className="fas fa-spinner fa-spin me-1"></i>
                Testing...
              </>
            ) : (
              <>
                <i className="fas fa-vial me-1"></i>
                Test Hardware
              </>
            )}
          </button>
          
          <button 
            className="btn btn-outline-secondary"
            onClick={loadHardwareData}
            disabled={scanning || testing}
          >
            <i className="fas fa-sync-alt me-1"></i>
            Refresh
          </button>
        </div>
      </div>

      {/* Connection Status */}
      <div className={`connection-status ${wsConnected ? 'connected' : 'disconnected'}`}>
        <i className={`fas ${wsConnected ? 'fa-wifi' : 'fa-wifi-slash'} me-1`}></i>
        {wsConnected ? 'Real-time updates active' : 'Real-time updates unavailable'}
      </div>

      {/* Error Display */}
      {error && (
        <div className="alert alert-danger" role="alert">
          <i className="fas fa-exclamation-triangle me-2"></i>
          {error}
          <button 
            type="button" 
            className="btn-close" 
            onClick={() => setError(null)}
          ></button>
        </div>
      )}

      {/* System Overview */}
      {stats && (
        <div className="system-overview">
          <div className="overview-cards">
            <div className="overview-card">
              <div className="card-icon">
                <i className="fas fa-archive"></i>
              </div>
              <div className="card-content">
                <h3>{stats.total_lockers}</h3>
                <p>Total Lockers</p>
              </div>
              <div className={`card-status ${stats.config_mismatch ? 'warning' : 'success'}`}>
                <i className={`fas ${stats.config_mismatch ? 'fa-exclamation-triangle' : 'fa-check-circle'}`}></i>
              </div>
            </div>

            <div className="overview-card">
              <div className="card-icon">
                <i className="fas fa-microchip"></i>
              </div>
              <div className="card-content">
                <h3>{stats.enabled_cards}/{stats.total_cards}</h3>
                <p>Active Cards</p>
              </div>
              <div className="card-status success">
                <i className="fas fa-check-circle"></i>
              </div>
            </div>

            <div className="overview-card">
              <div className="card-icon">
                <i className="fas fa-plug"></i>
              </div>
              <div className="card-content">
                <h3>{stats.total_channels}</h3>
                <p>Total Channels</p>
              </div>
              <div className="card-status success">
                <i className="fas fa-check-circle"></i>
              </div>
            </div>

            <div className="overview-card">
              <div className="card-icon">
                <i className="fas fa-tools"></i>
              </div>
              <div className="card-content">
                <h3>{stats.maintenance_mode ? 'ON' : 'OFF'}</h3>
                <p>Maintenance Mode</p>
              </div>
              <div className={`card-status ${stats.maintenance_mode ? 'warning' : 'success'}`}>
                <i className={`fas ${stats.maintenance_mode ? 'fa-exclamation-triangle' : 'fa-check-circle'}`}></i>
              </div>
            </div>
          </div>

          {/* Configuration Mismatch Warning */}
          {stats.config_mismatch && (
            <div className="alert alert-warning mt-3" role="alert">
              <i className="fas fa-exclamation-triangle me-2"></i>
              <strong>Configuration Mismatch:</strong> Your hardware has {stats.total_channels} channels 
              but {stats.total_lockers} lockers are configured. Consider updating your configuration 
              for optimal performance.
            </div>
          )}
        </div>
      )}

      {/* Device Status Cards */}
      {config && (
        <div className="device-section">
          <h2>
            <i className="fas fa-list me-2"></i>
            Relay Cards ({config.hardware.relay_cards.length})
          </h2>
          
          <div className="device-grid">
            {config.hardware.relay_cards.map((card, index) => (
              <DeviceStatusCard 
                key={`card-${card.slave_address}`}
                card={card}
                index={index}
                onTest={() => {/* Handle individual card test */}}
                onConfigure={() => {/* Handle individual card configuration */}}
              />
            ))}
          </div>
        </div>
      )}

      {/* System Health Monitor */}
      <SystemHealthMonitor 
        config={config}
        stats={stats}
        wsConnected={wsConnected}
      />
    </div>
  );
};