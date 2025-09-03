import React, { useState, useEffect } from 'react';

interface HardwareStats {
  total_lockers: number;
  total_cards: number;
  enabled_cards: number;
  total_channels: number;
  config_mismatch: boolean;
  maintenance_mode: boolean;
}

interface SystemConfig {
  hardware: {
    relay_cards: any[];
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

interface SystemHealth {
  overall_status: 'healthy' | 'warning' | 'error';
  hardware_status: 'online' | 'offline' | 'degraded';
  communication_status: 'good' | 'poor' | 'failed';
  performance_metrics: {
    avg_response_time: number;
    success_rate: number;
    uptime_hours: number;
  };
  issues: Array<{
    severity: 'info' | 'warning' | 'error';
    message: string;
    recommendation?: string;
  }>;
}

interface SystemHealthMonitorProps {
  config: SystemConfig | null;
  stats: HardwareStats | null;
  wsConnected: boolean;
}

export const SystemHealthMonitor: React.FC<SystemHealthMonitorProps> = ({
  config,
  stats,
  wsConnected
}) => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // Load system health data
  const loadHealthData = async () => {
    try {
      setLoading(true);

      // Simulate health check - in real implementation, this would call actual health endpoints
      const healthData: SystemHealth = {
        overall_status: 'healthy',
        hardware_status: 'online',
        communication_status: 'good',
        performance_metrics: {
          avg_response_time: 85,
          success_rate: 98.5,
          uptime_hours: 168
        },
        issues: []
      };

      // Analyze configuration and stats to determine health
      if (stats) {
        // Check for configuration mismatch
        if (stats.config_mismatch) {
          healthData.issues.push({
            severity: 'warning',
            message: 'Hardware configuration mismatch detected',
            recommendation: 'Update locker count to match available hardware channels'
          });
          healthData.overall_status = 'warning';
        }

        // Check maintenance mode
        if (stats.maintenance_mode) {
          healthData.issues.push({
            severity: 'info',
            message: 'System is in maintenance mode',
            recommendation: 'Disable maintenance mode when ready for normal operation'
          });
        }

        // Check for disabled cards
        const disabledCards = stats.total_cards - stats.enabled_cards;
        if (disabledCards > 0) {
          healthData.issues.push({
            severity: 'warning',
            message: `${disabledCards} relay card(s) are disabled`,
            recommendation: 'Enable disabled cards or remove them from configuration'
          });
        }
      }

      // Check WebSocket connection
      if (!wsConnected) {
        healthData.issues.push({
          severity: 'warning',
          message: 'Real-time updates are not available',
          recommendation: 'Check WebSocket service and network connectivity'
        });
        healthData.communication_status = 'poor';
      }

      // Simulate hardware communication check
      try {
        const response = await fetch('/api/hardware-config/test-modbus', {
          method: 'POST'
        });
        
        if (!response.ok) {
          healthData.hardware_status = 'offline';
          healthData.overall_status = 'error';
          healthData.issues.push({
            severity: 'error',
            message: 'Hardware communication failed',
            recommendation: 'Check Modbus connection and serial port configuration'
          });
        }
      } catch (error) {
        healthData.hardware_status = 'degraded';
        healthData.communication_status = 'failed';
        healthData.overall_status = 'error';
        healthData.issues.push({
          severity: 'error',
          message: 'Unable to communicate with hardware service',
          recommendation: 'Restart hardware service or check system connectivity'
        });
      }

      setHealth(healthData);
    } catch (error) {
      console.error('Error loading health data:', error);
      setHealth({
        overall_status: 'error',
        hardware_status: 'offline',
        communication_status: 'failed',
        performance_metrics: {
          avg_response_time: 0,
          success_rate: 0,
          uptime_hours: 0
        },
        issues: [{
          severity: 'error',
          message: 'Failed to load system health data',
          recommendation: 'Check system status and try refreshing the page'
        }]
      });
    } finally {
      setLoading(false);
    }
  };

  // Get status color and icon
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'online':
      case 'good':
        return { color: 'success', icon: 'fa-check-circle', text: 'Healthy' };
      case 'warning':
      case 'degraded':
      case 'poor':
        return { color: 'warning', icon: 'fa-exclamation-triangle', text: 'Warning' };
      case 'error':
      case 'offline':
      case 'failed':
        return { color: 'danger', icon: 'fa-times-circle', text: 'Error' };
      default:
        return { color: 'secondary', icon: 'fa-question-circle', text: 'Unknown' };
    }
  };

  // Format uptime
  const formatUptime = (hours: number) => {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    
    if (days > 0) {
      return `${days}d ${remainingHours}h`;
    } else {
      return `${remainingHours}h`;
    }
  };

  // Load health data on component mount and periodically
  useEffect(() => {
    loadHealthData();
    
    // Refresh health data every 30 seconds
    const interval = setInterval(loadHealthData, 30000);
    
    return () => clearInterval(interval);
  }, [stats, wsConnected]);

  if (loading) {
    return (
      <div className="system-health-monitor loading">
        <div className="loading-content">
          <i className="fas fa-spinner fa-spin me-2"></i>
          Loading system health...
        </div>
      </div>
    );
  }

  if (!health) {
    return null;
  }

  const overallStatus = getStatusDisplay(health.overall_status);
  const hardwareStatus = getStatusDisplay(health.hardware_status);
  const commStatus = getStatusDisplay(health.communication_status);

  return (
    <div className="system-health-monitor">
      <div className="health-header" onClick={() => setExpanded(!expanded)}>
        <h2>
          <i className="fas fa-heartbeat me-2"></i>
          System Health Monitor
        </h2>
        
        <div className="health-summary">
          <div className={`overall-status status-${overallStatus.color}`}>
            <i className={`fas ${overallStatus.icon} me-1`}></i>
            {overallStatus.text}
          </div>
          
          <button className="btn btn-sm btn-outline-secondary expand-btn">
            <i className={`fas fa-chevron-${expanded ? 'up' : 'down'}`}></i>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="health-details">
          {/* Status Overview */}
          <div className="status-overview">
            <div className="status-item">
              <div className="status-icon">
                <i className={`fas ${hardwareStatus.icon} text-${hardwareStatus.color}`}></i>
              </div>
              <div className="status-content">
                <h4>Hardware Status</h4>
                <p className={`text-${hardwareStatus.color}`}>{hardwareStatus.text}</p>
              </div>
            </div>

            <div className="status-item">
              <div className="status-icon">
                <i className={`fas ${commStatus.icon} text-${commStatus.color}`}></i>
              </div>
              <div className="status-content">
                <h4>Communication</h4>
                <p className={`text-${commStatus.color}`}>{commStatus.text}</p>
              </div>
            </div>

            <div className="status-item">
              <div className="status-icon">
                <i className={`fas fa-wifi text-${wsConnected ? 'success' : 'warning'}`}></i>
              </div>
              <div className="status-content">
                <h4>Real-time Updates</h4>
                <p className={`text-${wsConnected ? 'success' : 'warning'}`}>
                  {wsConnected ? 'Connected' : 'Disconnected'}
                </p>
              </div>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="performance-section">
            <h3>Performance Metrics</h3>
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-icon">
                  <i className="fas fa-clock"></i>
                </div>
                <div className="metric-content">
                  <h4>{health.performance_metrics.avg_response_time}ms</h4>
                  <p>Avg Response Time</p>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-icon">
                  <i className="fas fa-check-circle"></i>
                </div>
                <div className="metric-content">
                  <h4>{health.performance_metrics.success_rate}%</h4>
                  <p>Success Rate</p>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-icon">
                  <i className="fas fa-arrow-up"></i>
                </div>
                <div className="metric-content">
                  <h4>{formatUptime(health.performance_metrics.uptime_hours)}</h4>
                  <p>System Uptime</p>
                </div>
              </div>
            </div>
          </div>

          {/* Issues and Recommendations */}
          {health.issues.length > 0 && (
            <div className="issues-section">
              <h3>Issues & Recommendations</h3>
              <div className="issues-list">
                {health.issues.map((issue, index) => (
                  <div key={index} className={`issue-item alert alert-${issue.severity === 'info' ? 'info' : issue.severity === 'warning' ? 'warning' : 'danger'}`}>
                    <div className="issue-header">
                      <i className={`fas ${
                        issue.severity === 'info' ? 'fa-info-circle' :
                        issue.severity === 'warning' ? 'fa-exclamation-triangle' :
                        'fa-times-circle'
                      } me-2`}></i>
                      <strong>{issue.message}</strong>
                    </div>
                    {issue.recommendation && (
                      <div className="issue-recommendation">
                        <i className="fas fa-lightbulb me-1"></i>
                        <em>{issue.recommendation}</em>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Diagnostic Actions */}
          <div className="diagnostic-actions">
            <h3>Diagnostic Tools</h3>
            <div className="action-buttons">
              <button 
                className="btn btn-outline-primary"
                onClick={() => window.open('/docs/kiosk-troubleshooting-guide.md', '_blank')}
              >
                <i className="fas fa-book me-1"></i>
                Troubleshooting Guide
              </button>
              
              <button 
                className="btn btn-outline-info"
                onClick={() => window.location.href = '/panel/performance'}
              >
                <i className="fas fa-chart-line me-1"></i>
                Performance Dashboard
              </button>
              
              <button 
                className="btn btn-outline-warning"
                onClick={loadHealthData}
              >
                <i className="fas fa-sync-alt me-1"></i>
                Refresh Health Check
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};