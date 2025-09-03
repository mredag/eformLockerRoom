import React, { useState, useEffect } from 'react';
import './ManualConfiguration.css';

interface RegisterAccess {
  address: number;
  register: number;
  value?: number;
  operation: 'read' | 'write';
}

interface CustomCommand {
  slaveAddress: number;
  functionCode: number;
  data: string; // Hex string
  description: string;
}

interface ManualConfigurationProps {
  onClose: () => void;
  expertMode: boolean;
  onToggleExpertMode: (enabled: boolean) => void;
}

export const ManualConfiguration: React.FC<ManualConfigurationProps> = ({
  onClose,
  expertMode,
  onToggleExpertMode
}) => {
  const [activeTab, setActiveTab] = useState<'address' | 'register' | 'command'>('address');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Manual slave address configuration
  const [addressConfig, setAddressConfig] = useState({
    currentAddress: 1,
    newAddress: 2,
    useBroadcast: true,
    verifyAfter: true
  });

  // Direct register access
  const [registerAccess, setRegisterAccess] = useState<RegisterAccess>({
    address: 1,
    register: 0x4000,
    value: undefined,
    operation: 'read'
  });

  // Custom command execution
  const [customCommand, setCustomCommand] = useState<CustomCommand>({
    slaveAddress: 1,
    functionCode: 0x05,
    data: '00040000',
    description: 'Write Single Coil - Relay 5 OFF'
  });

  const [commandHistory, setCommandHistory] = useState<Array<{
    timestamp: string;
    command: CustomCommand;
    result: any;
    success: boolean;
  }>>([]);

  useEffect(() => {
    // Load command history from localStorage
    const saved = localStorage.getItem('manual-config-history');
    if (saved) {
      try {
        setCommandHistory(JSON.parse(saved));
      } catch (e) {
        console.warn('Failed to load command history:', e);
      }
    }
  }, []);

  const saveCommandToHistory = (command: CustomCommand, result: any, success: boolean) => {
    const entry = {
      timestamp: new Date().toISOString(),
      command: { ...command },
      result,
      success
    };
    
    const newHistory = [entry, ...commandHistory].slice(0, 50); // Keep last 50 commands
    setCommandHistory(newHistory);
    localStorage.setItem('manual-config-history', JSON.stringify(newHistory));
  };

  const handleManualAddressConfig = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const response = await fetch('/api/hardware-config/set-slave-address', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          current_address: addressConfig.useBroadcast ? 0 : addressConfig.currentAddress,
          new_address: addressConfig.newAddress,
          use_broadcast: addressConfig.useBroadcast,
          verify_after: addressConfig.verifyAfter
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setResults({
          type: 'address_config',
          message: `Slave address successfully configured from ${addressConfig.currentAddress} to ${addressConfig.newAddress}`,
          details: result
        });
      } else {
        setError(result.error || 'Address configuration failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterAccess = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const endpoint = registerAccess.operation === 'read' 
        ? '/api/hardware-config/read-register'
        : '/api/hardware-config/write-register';

      const body: any = {
        slave_address: registerAccess.address,
        register: registerAccess.register
      };

      if (registerAccess.operation === 'write' && registerAccess.value !== undefined) {
        body.value = registerAccess.value;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const result = await response.json();
      
      if (result.success) {
        setResults({
          type: 'register_access',
          operation: registerAccess.operation,
          register: registerAccess.register,
          value: result.value,
          details: result
        });
      } else {
        setError(result.error || 'Register access failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomCommand = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const response = await fetch('/api/hardware-config/execute-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          slave_address: customCommand.slaveAddress,
          function_code: customCommand.functionCode,
          data: customCommand.data,
          description: customCommand.description
        })
      });

      const result = await response.json();
      
      saveCommandToHistory(customCommand, result, result.success);
      
      if (result.success) {
        setResults({
          type: 'custom_command',
          command: customCommand,
          response: result.response,
          details: result
        });
      } else {
        setError(result.error || 'Command execution failed');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Network error';
      setError(errorMsg);
      saveCommandToHistory(customCommand, { error: errorMsg }, false);
    } finally {
      setLoading(false);
    }
  };

  const loadPresetCommand = (preset: string) => {
    const presets: Record<string, Partial<CustomCommand>> = {
      'read_coils': {
        functionCode: 0x01,
        data: '00000010',
        description: 'Read Coils - First 16 relays'
      },
      'write_single_coil_on': {
        functionCode: 0x05,
        data: '0004FF00',
        description: 'Write Single Coil - Relay 5 ON'
      },
      'write_single_coil_off': {
        functionCode: 0x05,
        data: '00040000',
        description: 'Write Single Coil - Relay 5 OFF'
      },
      'read_input_registers': {
        functionCode: 0x04,
        data: '40000001',
        description: 'Read Input Register 0x4000 (Slave Address)'
      },
      'write_single_register': {
        functionCode: 0x06,
        data: '40000002',
        description: 'Write Single Register 0x4000 = 2 (Set Slave Address)'
      }
    };

    const presetData = presets[preset];
    if (presetData) {
      setCustomCommand(prev => ({ ...prev, ...presetData }));
    }
  };

  const clearHistory = () => {
    if (confirm('Clear all command history?')) {
      setCommandHistory([]);
      localStorage.removeItem('manual-config-history');
    }
  };

  return (
    <div className="manual-configuration">
      <div className="manual-config-header">
        <div className="header-left">
          <h3>
            <i className="fas fa-cogs"></i>
            Manual Configuration
          </h3>
          <p>Advanced hardware configuration tools for expert users</p>
        </div>
        <div className="header-right">
          <div className="expert-mode-toggle">
            <label className="switch">
              <input
                type="checkbox"
                checked={expertMode}
                onChange={(e) => onToggleExpertMode(e.target.checked)}
              />
              <span className="slider"></span>
            </label>
            <span className="toggle-label">Expert Mode</span>
          </div>
          <button className="btn-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>
      </div>

      {!expertMode && (
        <div className="expert-mode-warning">
          <i className="fas fa-exclamation-triangle"></i>
          <div>
            <strong>Expert Mode Required</strong>
            <p>Enable Expert Mode to access manual configuration features. These tools require advanced knowledge of Modbus protocols.</p>
          </div>
        </div>
      )}

      {expertMode && (
        <>
          <div className="config-tabs">
            <button
              className={`tab ${activeTab === 'address' ? 'active' : ''}`}
              onClick={() => setActiveTab('address')}
            >
              <i className="fas fa-hashtag"></i>
              Slave Address
            </button>
            <button
              className={`tab ${activeTab === 'register' ? 'active' : ''}`}
              onClick={() => setActiveTab('register')}
            >
              <i className="fas fa-memory"></i>
              Register Access
            </button>
            <button
              className={`tab ${activeTab === 'command' ? 'active' : ''}`}
              onClick={() => setActiveTab('command')}
            >
              <i className="fas fa-terminal"></i>
              Custom Commands
            </button>
          </div>

          <div className="config-content">
            {activeTab === 'address' && (
              <div className="address-config">
                <h4>Manual Slave Address Configuration</h4>
                <p className="description">
                  Configure slave addresses using proven Waveshare broadcast method or direct addressing.
                </p>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Current Address</label>
                    <input
                      type="number"
                      min="0"
                      max="247"
                      value={addressConfig.currentAddress}
                      onChange={(e) => setAddressConfig(prev => ({
                        ...prev,
                        currentAddress: parseInt(e.target.value) || 0
                      }))}
                      disabled={addressConfig.useBroadcast}
                    />
                    <small>Use 0 for broadcast (all devices)</small>
                  </div>

                  <div className="form-group">
                    <label>New Address</label>
                    <input
                      type="number"
                      min="1"
                      max="247"
                      value={addressConfig.newAddress}
                      onChange={(e) => setAddressConfig(prev => ({
                        ...prev,
                        newAddress: parseInt(e.target.value) || 1
                      }))}
                    />
                    <small>Target slave address (1-247)</small>
                  </div>
                </div>

                <div className="form-options">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={addressConfig.useBroadcast}
                      onChange={(e) => setAddressConfig(prev => ({
                        ...prev,
                        useBroadcast: e.target.checked
                      }))}
                    />
                    Use Broadcast Address (Recommended)
                  </label>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={addressConfig.verifyAfter}
                      onChange={(e) => setAddressConfig(prev => ({
                        ...prev,
                        verifyAfter: e.target.checked
                      }))}
                    />
                    Verify Configuration After Write
                  </label>
                </div>

                <button
                  className="btn-primary"
                  onClick={handleManualAddressConfig}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      Configuring...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-cog"></i>
                      Configure Address
                    </>
                  )}
                </button>
              </div>
            )}

            {activeTab === 'register' && (
              <div className="register-access">
                <h4>Direct Register Access</h4>
                <p className="description">
                  Read from or write to specific Modbus registers. Use register 0x4000 for slave address storage.
                </p>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Slave Address</label>
                    <input
                      type="number"
                      min="1"
                      max="247"
                      value={registerAccess.address}
                      onChange={(e) => setRegisterAccess(prev => ({
                        ...prev,
                        address: parseInt(e.target.value) || 1
                      }))}
                    />
                  </div>

                  <div className="form-group">
                    <label>Register Address</label>
                    <input
                      type="text"
                      value={`0x${registerAccess.register.toString(16).toUpperCase()}`}
                      onChange={(e) => {
                        const hex = e.target.value.replace('0x', '');
                        const decimal = parseInt(hex, 16);
                        if (!isNaN(decimal)) {
                          setRegisterAccess(prev => ({ ...prev, register: decimal }));
                        }
                      }}
                    />
                    <small>Common: 0x4000 (slave address storage)</small>
                  </div>

                  <div className="form-group">
                    <label>Operation</label>
                    <select
                      value={registerAccess.operation}
                      onChange={(e) => setRegisterAccess(prev => ({
                        ...prev,
                        operation: e.target.value as 'read' | 'write'
                      }))}
                    >
                      <option value="read">Read Register</option>
                      <option value="write">Write Register</option>
                    </select>
                  </div>

                  {registerAccess.operation === 'write' && (
                    <div className="form-group">
                      <label>Value</label>
                      <input
                        type="number"
                        min="0"
                        max="65535"
                        value={registerAccess.value || ''}
                        onChange={(e) => setRegisterAccess(prev => ({
                          ...prev,
                          value: parseInt(e.target.value) || undefined
                        }))}
                      />
                      <small>16-bit value (0-65535)</small>
                    </div>
                  )}
                </div>

                <button
                  className="btn-primary"
                  onClick={handleRegisterAccess}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      Executing...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-play"></i>
                      {registerAccess.operation === 'read' ? 'Read Register' : 'Write Register'}
                    </>
                  )}
                </button>
              </div>
            )}

            {activeTab === 'command' && (
              <div className="custom-command">
                <h4>Custom Command Execution</h4>
                <p className="description">
                  Execute raw Modbus commands with custom function codes and data.
                </p>

                <div className="command-presets">
                  <label>Quick Presets:</label>
                  <div className="preset-buttons">
                    <button onClick={() => loadPresetCommand('read_coils')}>Read Coils</button>
                    <button onClick={() => loadPresetCommand('write_single_coil_on')}>Relay ON</button>
                    <button onClick={() => loadPresetCommand('write_single_coil_off')}>Relay OFF</button>
                    <button onClick={() => loadPresetCommand('read_input_registers')}>Read Address</button>
                    <button onClick={() => loadPresetCommand('write_single_register')}>Write Address</button>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Slave Address</label>
                    <input
                      type="number"
                      min="0"
                      max="247"
                      value={customCommand.slaveAddress}
                      onChange={(e) => setCustomCommand(prev => ({
                        ...prev,
                        slaveAddress: parseInt(e.target.value) || 0
                      }))}
                    />
                  </div>

                  <div className="form-group">
                    <label>Function Code</label>
                    <input
                      type="text"
                      value={`0x${customCommand.functionCode.toString(16).toUpperCase().padStart(2, '0')}`}
                      onChange={(e) => {
                        const hex = e.target.value.replace('0x', '');
                        const decimal = parseInt(hex, 16);
                        if (!isNaN(decimal)) {
                          setCustomCommand(prev => ({ ...prev, functionCode: decimal }));
                        }
                      }}
                    />
                    <small>0x01=Read Coils, 0x05=Write Coil, 0x06=Write Register</small>
                  </div>

                  <div className="form-group full-width">
                    <label>Data (Hex)</label>
                    <input
                      type="text"
                      value={customCommand.data}
                      onChange={(e) => setCustomCommand(prev => ({
                        ...prev,
                        data: e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase()
                      }))}
                      placeholder="00040000"
                    />
                    <small>Hex data without spaces (e.g., 00040000 for coil 4)</small>
                  </div>

                  <div className="form-group full-width">
                    <label>Description</label>
                    <input
                      type="text"
                      value={customCommand.description}
                      onChange={(e) => setCustomCommand(prev => ({
                        ...prev,
                        description: e.target.value
                      }))}
                      placeholder="Describe what this command does"
                    />
                  </div>
                </div>

                <button
                  className="btn-primary"
                  onClick={handleCustomCommand}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      Executing...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-terminal"></i>
                      Execute Command
                    </>
                  )}
                </button>

                {commandHistory.length > 0 && (
                  <div className="command-history">
                    <div className="history-header">
                      <h5>Command History</h5>
                      <button className="btn-secondary" onClick={clearHistory}>
                        <i className="fas fa-trash"></i>
                        Clear History
                      </button>
                    </div>
                    <div className="history-list">
                      {commandHistory.slice(0, 10).map((entry, index) => (
                        <div key={index} className={`history-item ${entry.success ? 'success' : 'error'}`}>
                          <div className="history-command">
                            <strong>{entry.command.description}</strong>
                            <span className="timestamp">
                              {new Date(entry.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <div className="history-details">
                            Addr: {entry.command.slaveAddress}, 
                            Func: 0x{entry.command.functionCode.toString(16).toUpperCase()}, 
                            Data: {entry.command.data}
                          </div>
                          {!entry.success && entry.result.error && (
                            <div className="history-error">{entry.result.error}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="error-message">
              <i className="fas fa-exclamation-circle"></i>
              <div>
                <strong>Error</strong>
                <p>{error}</p>
              </div>
            </div>
          )}

          {results && (
            <div className="results-panel">
              <h5>
                <i className="fas fa-check-circle"></i>
                Operation Results
              </h5>
              
              {results.type === 'address_config' && (
                <div className="result-content">
                  <p><strong>Success:</strong> {results.message}</p>
                  {results.details.verification_passed && (
                    <p><strong>Verification:</strong> Address configuration verified successfully</p>
                  )}
                </div>
              )}

              {results.type === 'register_access' && (
                <div className="result-content">
                  <p><strong>Operation:</strong> {results.operation}</p>
                  <p><strong>Register:</strong> 0x{results.register.toString(16).toUpperCase()}</p>
                  {results.value !== undefined && (
                    <p><strong>Value:</strong> {results.value} (0x{results.value.toString(16).toUpperCase()})</p>
                  )}
                </div>
              )}

              {results.type === 'custom_command' && (
                <div className="result-content">
                  <p><strong>Command:</strong> {results.command.description}</p>
                  <p><strong>Response:</strong> {results.response || 'No response data'}</p>
                  {results.details.raw_response && (
                    <p><strong>Raw Response:</strong> {results.details.raw_response}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};