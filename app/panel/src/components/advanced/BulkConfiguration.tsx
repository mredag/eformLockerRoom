import React, { useState, useEffect } from 'react';
import './BulkConfiguration.css';

interface BulkConfigurationProps {
  onClose: () => void;
}

interface BulkOperation {
  id: string;
  type: 'sequential_addressing' | 'batch_testing' | 'bulk_validation';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  startTime?: Date;
  endTime?: Date;
  results: BulkOperationResult[];
  error?: string;
}

interface BulkOperationResult {
  itemId: string;
  success: boolean;
  error?: string;
  details?: any;
  duration?: number;
}

interface SequentialAddressingConfig {
  startAddress: number;
  endAddress: number;
  deviceCount: number;
  addressStep: number;
  useBroadcast: boolean;
  verifyEach: boolean;
  delayBetweenDevices: number;
}

interface BatchTestingConfig {
  deviceAddresses: number[];
  testTypes: string[];
  iterations: number;
  timeoutPerTest: number;
  continueOnFailure: boolean;
  parallelExecution: boolean;
}

export const BulkConfiguration: React.FC<BulkConfigurationProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'addressing' | 'testing' | 'validation'>('addressing');
  const [currentOperation, setCurrentOperation] = useState<BulkOperation | null>(null);
  const [operationHistory, setOperationHistory] = useState<BulkOperation[]>([]);

  // Sequential addressing configuration
  const [addressingConfig, setAddressingConfig] = useState<SequentialAddressingConfig>({
    startAddress: 1,
    endAddress: 5,
    deviceCount: 5,
    addressStep: 1,
    useBroadcast: true,
    verifyEach: true,
    delayBetweenDevices: 1000
  });

  // Batch testing configuration
  const [testingConfig, setBatchTestingConfig] = useState<BatchTestingConfig>({
    deviceAddresses: [1, 2, 3],
    testTypes: ['communication', 'relay_activation', 'response_time'],
    iterations: 1,
    timeoutPerTest: 5000,
    continueOnFailure: true,
    parallelExecution: false
  });

  useEffect(() => {
    // Load operation history from localStorage
    const saved = localStorage.getItem('bulk-operation-history');
    if (saved) {
      try {
        const history = JSON.parse(saved);
        setOperationHistory(history.map((op: any) => ({
          ...op,
          startTime: op.startTime ? new Date(op.startTime) : undefined,
          endTime: op.endTime ? new Date(op.endTime) : undefined
        })));
      } catch (e) {
        console.warn('Failed to load operation history:', e);
      }
    }
  }, []);

  const saveOperationToHistory = (operation: BulkOperation) => {
    const newHistory = [operation, ...operationHistory].slice(0, 20); // Keep last 20 operations
    setOperationHistory(newHistory);
    localStorage.setItem('bulk-operation-history', JSON.stringify(newHistory));
  };

  const generateOperationId = () => {
    return `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  const startSequentialAddressing = async () => {
    const operation: BulkOperation = {
      id: generateOperationId(),
      type: 'sequential_addressing',
      status: 'running',
      progress: 0,
      totalItems: addressingConfig.deviceCount,
      completedItems: 0,
      failedItems: 0,
      startTime: new Date(),
      results: []
    };

    setCurrentOperation(operation);

    try {
      const response = await fetch('/api/hardware-config/bulk-sequential-addressing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          start_address: addressingConfig.startAddress,
          end_address: addressingConfig.endAddress,
          device_count: addressingConfig.deviceCount,
          address_step: addressingConfig.addressStep,
          use_broadcast: addressingConfig.useBroadcast,
          verify_each: addressingConfig.verifyEach,
          delay_between_devices: addressingConfig.delayBetweenDevices
        })
      });

      if (response.ok) {
        // Handle streaming response for real-time progress
        const reader = response.body?.getReader();
        if (reader) {
          await handleStreamingResponse(reader, operation);
        }
      } else {
        const error = await response.text();
        operation.status = 'failed';
        operation.error = error;
        operation.endTime = new Date();
        setCurrentOperation({ ...operation });
      }
    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : 'Unknown error';
      operation.endTime = new Date();
      setCurrentOperation({ ...operation });
    }

    saveOperationToHistory(operation);
  };

  const startBatchTesting = async () => {
    const operation: BulkOperation = {
      id: generateOperationId(),
      type: 'batch_testing',
      status: 'running',
      progress: 0,
      totalItems: testingConfig.deviceAddresses.length * testingConfig.testTypes.length * testingConfig.iterations,
      completedItems: 0,
      failedItems: 0,
      startTime: new Date(),
      results: []
    };

    setCurrentOperation(operation);

    try {
      const response = await fetch('/api/hardware-config/bulk-batch-testing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          device_addresses: testingConfig.deviceAddresses,
          test_types: testingConfig.testTypes,
          iterations: testingConfig.iterations,
          timeout_per_test: testingConfig.timeoutPerTest,
          continue_on_failure: testingConfig.continueOnFailure,
          parallel_execution: testingConfig.parallelExecution
        })
      });

      if (response.ok) {
        const reader = response.body?.getReader();
        if (reader) {
          await handleStreamingResponse(reader, operation);
        }
      } else {
        const error = await response.text();
        operation.status = 'failed';
        operation.error = error;
        operation.endTime = new Date();
        setCurrentOperation({ ...operation });
      }
    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : 'Unknown error';
      operation.endTime = new Date();
      setCurrentOperation({ ...operation });
    }

    saveOperationToHistory(operation);
  };

  const startBulkValidation = async () => {
    const operation: BulkOperation = {
      id: generateOperationId(),
      type: 'bulk_validation',
      status: 'running',
      progress: 0,
      totalItems: 0, // Will be determined by the server
      completedItems: 0,
      failedItems: 0,
      startTime: new Date(),
      results: []
    };

    setCurrentOperation(operation);

    try {
      const response = await fetch('/api/hardware-config/bulk-validation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          validate_configuration: true,
          validate_connectivity: true,
          validate_addressing: true,
          validate_functionality: true
        })
      });

      if (response.ok) {
        const reader = response.body?.getReader();
        if (reader) {
          await handleStreamingResponse(reader, operation);
        }
      } else {
        const error = await response.text();
        operation.status = 'failed';
        operation.error = error;
        operation.endTime = new Date();
        setCurrentOperation({ ...operation });
      }
    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : 'Unknown error';
      operation.endTime = new Date();
      setCurrentOperation({ ...operation });
    }

    saveOperationToHistory(operation);
  };

  const handleStreamingResponse = async (reader: ReadableStreamDefaultReader<Uint8Array>, operation: BulkOperation) => {
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const update = JSON.parse(line);
              
              if (update.type === 'progress') {
                operation.progress = update.progress;
                operation.completedItems = update.completed;
                operation.failedItems = update.failed;
                operation.totalItems = update.total;
              } else if (update.type === 'result') {
                operation.results.push(update.result);
              } else if (update.type === 'complete') {
                operation.status = 'completed';
                operation.endTime = new Date();
              } else if (update.type === 'error') {
                operation.status = 'failed';
                operation.error = update.error;
                operation.endTime = new Date();
              }

              setCurrentOperation({ ...operation });
            } catch (e) {
              console.warn('Failed to parse streaming update:', line);
            }
          }
        }
      }
    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : 'Streaming error';
      operation.endTime = new Date();
      setCurrentOperation({ ...operation });
    }
  };

  const cancelCurrentOperation = async () => {
    if (!currentOperation || currentOperation.status !== 'running') return;

    try {
      await fetch(`/api/hardware-config/bulk-cancel/${currentOperation.id}`, {
        method: 'POST'
      });

      const updatedOperation = {
        ...currentOperation,
        status: 'cancelled' as const,
        endTime: new Date()
      };

      setCurrentOperation(updatedOperation);
      saveOperationToHistory(updatedOperation);
    } catch (error) {
      console.error('Failed to cancel operation:', error);
    }
  };

  const clearOperationHistory = () => {
    if (confirm('Clear all operation history?')) {
      setOperationHistory([]);
      localStorage.removeItem('bulk-operation-history');
    }
  };

  const formatDuration = (start: Date, end?: Date) => {
    const endTime = end || new Date();
    const duration = endTime.getTime() - start.getTime();
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <i className="fas fa-spinner fa-spin text-primary"></i>;
      case 'completed': return <i className="fas fa-check-circle text-success"></i>;
      case 'failed': return <i className="fas fa-exclamation-circle text-danger"></i>;
      case 'cancelled': return <i className="fas fa-ban text-warning"></i>;
      default: return <i className="fas fa-clock text-muted"></i>;
    }
  };

  return (
    <div className="bulk-configuration">
      <div className="bulk-config-header">
        <div className="header-left">
          <h3>
            <i className="fas fa-layer-group"></i>
            Bulk Configuration Tools
          </h3>
          <p>Configure multiple devices and perform batch operations efficiently</p>
        </div>
        <button className="btn-close" onClick={onClose}>
          <i className="fas fa-times"></i>
        </button>
      </div>

      <div className="config-tabs">
        <button
          className={`tab ${activeTab === 'addressing' ? 'active' : ''}`}
          onClick={() => setActiveTab('addressing')}
        >
          <i className="fas fa-hashtag"></i>
          Sequential Addressing
        </button>
        <button
          className={`tab ${activeTab === 'testing' ? 'active' : ''}`}
          onClick={() => setActiveTab('testing')}
        >
          <i className="fas fa-vial"></i>
          Batch Testing
        </button>
        <button
          className={`tab ${activeTab === 'validation' ? 'active' : ''}`}
          onClick={() => setActiveTab('validation')}
        >
          <i className="fas fa-check-double"></i>
          System Validation
        </button>
      </div>

      <div className="config-content">
        {activeTab === 'addressing' && (
          <div className="sequential-addressing">
            <h4>Sequential Address Assignment</h4>
            <p className="description">
              Configure multiple devices with sequential slave addresses automatically.
            </p>

            <div className="form-grid">
              <div className="form-group">
                <label>Start Address</label>
                <input
                  type="number"
                  min="1"
                  max="247"
                  value={addressingConfig.startAddress}
                  onChange={(e) => setAddressingConfig(prev => ({
                    ...prev,
                    startAddress: parseInt(e.target.value) || 1
                  }))}
                />
              </div>

              <div className="form-group">
                <label>End Address</label>
                <input
                  type="number"
                  min="1"
                  max="247"
                  value={addressingConfig.endAddress}
                  onChange={(e) => setAddressingConfig(prev => ({
                    ...prev,
                    endAddress: parseInt(e.target.value) || 1
                  }))}
                />
              </div>

              <div className="form-group">
                <label>Device Count</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={addressingConfig.deviceCount}
                  onChange={(e) => setAddressingConfig(prev => ({
                    ...prev,
                    deviceCount: parseInt(e.target.value) || 1
                  }))}
                />
              </div>

              <div className="form-group">
                <label>Address Step</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={addressingConfig.addressStep}
                  onChange={(e) => setAddressingConfig(prev => ({
                    ...prev,
                    addressStep: parseInt(e.target.value) || 1
                  }))}
                />
              </div>

              <div className="form-group">
                <label>Delay Between Devices (ms)</label>
                <input
                  type="number"
                  min="100"
                  max="10000"
                  step="100"
                  value={addressingConfig.delayBetweenDevices}
                  onChange={(e) => setAddressingConfig(prev => ({
                    ...prev,
                    delayBetweenDevices: parseInt(e.target.value) || 1000
                  }))}
                />
              </div>
            </div>

            <div className="form-options">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={addressingConfig.useBroadcast}
                  onChange={(e) => setAddressingConfig(prev => ({
                    ...prev,
                    useBroadcast: e.target.checked
                  }))}
                />
                Use Broadcast Commands (Recommended)
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={addressingConfig.verifyEach}
                  onChange={(e) => setAddressingConfig(prev => ({
                    ...prev,
                    verifyEach: e.target.checked
                  }))}
                />
                Verify Each Address Configuration
              </label>
            </div>

            <div className="address-preview">
              <h5>Address Assignment Preview</h5>
              <div className="preview-list">
                {Array.from({ length: addressingConfig.deviceCount }, (_, i) => {
                  const address = addressingConfig.startAddress + (i * addressingConfig.addressStep);
                  return (
                    <div key={i} className="preview-item">
                      Device {i + 1}: Address {address}
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              className="btn-primary"
              onClick={startSequentialAddressing}
              disabled={currentOperation?.status === 'running'}
            >
              <i className="fas fa-play"></i>
              Start Sequential Addressing
            </button>
          </div>
        )}

        {activeTab === 'testing' && (
          <div className="batch-testing">
            <h4>Batch Testing & Validation</h4>
            <p className="description">
              Test multiple devices simultaneously with comprehensive validation.
            </p>

            <div className="form-grid">
              <div className="form-group full-width">
                <label>Device Addresses (comma-separated)</label>
                <input
                  type="text"
                  value={testingConfig.deviceAddresses.join(', ')}
                  onChange={(e) => {
                    const addresses = e.target.value
                      .split(',')
                      .map(addr => parseInt(addr.trim()))
                      .filter(addr => !isNaN(addr) && addr > 0 && addr <= 247);
                    setBatchTestingConfig(prev => ({ ...prev, deviceAddresses: addresses }));
                  }}
                  placeholder="1, 2, 3, 4, 5"
                />
              </div>

              <div className="form-group">
                <label>Iterations</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={testingConfig.iterations}
                  onChange={(e) => setBatchTestingConfig(prev => ({
                    ...prev,
                    iterations: parseInt(e.target.value) || 1
                  }))}
                />
              </div>

              <div className="form-group">
                <label>Timeout per Test (ms)</label>
                <input
                  type="number"
                  min="1000"
                  max="30000"
                  step="1000"
                  value={testingConfig.timeoutPerTest}
                  onChange={(e) => setBatchTestingConfig(prev => ({
                    ...prev,
                    timeoutPerTest: parseInt(e.target.value) || 5000
                  }))}
                />
              </div>
            </div>

            <div className="test-types">
              <label>Test Types</label>
              <div className="checkbox-grid">
                {[
                  { id: 'communication', label: 'Communication Test' },
                  { id: 'relay_activation', label: 'Relay Activation Test' },
                  { id: 'response_time', label: 'Response Time Test' },
                  { id: 'reliability', label: 'Reliability Test' },
                  { id: 'stress_test', label: 'Stress Test' }
                ].map(test => (
                  <label key={test.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={testingConfig.testTypes.includes(test.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBatchTestingConfig(prev => ({
                            ...prev,
                            testTypes: [...prev.testTypes, test.id]
                          }));
                        } else {
                          setBatchTestingConfig(prev => ({
                            ...prev,
                            testTypes: prev.testTypes.filter(t => t !== test.id)
                          }));
                        }
                      }}
                    />
                    {test.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-options">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={testingConfig.continueOnFailure}
                  onChange={(e) => setBatchTestingConfig(prev => ({
                    ...prev,
                    continueOnFailure: e.target.checked
                  }))}
                />
                Continue on Test Failure
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={testingConfig.parallelExecution}
                  onChange={(e) => setBatchTestingConfig(prev => ({
                    ...prev,
                    parallelExecution: e.target.checked
                  }))}
                />
                Parallel Execution (Faster but more resource intensive)
              </label>
            </div>

            <button
              className="btn-primary"
              onClick={startBatchTesting}
              disabled={currentOperation?.status === 'running' || testingConfig.deviceAddresses.length === 0}
            >
              <i className="fas fa-play"></i>
              Start Batch Testing
            </button>
          </div>
        )}

        {activeTab === 'validation' && (
          <div className="system-validation">
            <h4>System Validation</h4>
            <p className="description">
              Comprehensive system validation including configuration, connectivity, and functionality checks.
            </p>

            <div className="validation-checklist">
              <div className="validation-item">
                <i className="fas fa-cog"></i>
                <div>
                  <strong>Configuration Validation</strong>
                  <p>Verify system configuration consistency and completeness</p>
                </div>
              </div>

              <div className="validation-item">
                <i className="fas fa-network-wired"></i>
                <div>
                  <strong>Connectivity Validation</strong>
                  <p>Test communication with all configured devices</p>
                </div>
              </div>

              <div className="validation-item">
                <i className="fas fa-hashtag"></i>
                <div>
                  <strong>Addressing Validation</strong>
                  <p>Verify slave address uniqueness and accessibility</p>
                </div>
              </div>

              <div className="validation-item">
                <i className="fas fa-tools"></i>
                <div>
                  <strong>Functionality Validation</strong>
                  <p>Test relay activation and system integration</p>
                </div>
              </div>
            </div>

            <button
              className="btn-primary"
              onClick={startBulkValidation}
              disabled={currentOperation?.status === 'running'}
            >
              <i className="fas fa-play"></i>
              Start System Validation
            </button>
          </div>
        )}
      </div>

      {currentOperation && (
        <div className="operation-status">
          <div className="status-header">
            <div className="status-info">
              {getStatusIcon(currentOperation.status)}
              <div>
                <strong>
                  {currentOperation.type === 'sequential_addressing' && 'Sequential Addressing'}
                  {currentOperation.type === 'batch_testing' && 'Batch Testing'}
                  {currentOperation.type === 'bulk_validation' && 'System Validation'}
                </strong>
                <p>
                  {currentOperation.status === 'running' && 'Operation in progress...'}
                  {currentOperation.status === 'completed' && 'Operation completed successfully'}
                  {currentOperation.status === 'failed' && 'Operation failed'}
                  {currentOperation.status === 'cancelled' && 'Operation cancelled'}
                </p>
              </div>
            </div>
            {currentOperation.status === 'running' && (
              <button className="btn-cancel" onClick={cancelCurrentOperation}>
                <i className="fas fa-stop"></i>
                Cancel
              </button>
            )}
          </div>

          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${currentOperation.progress}%` }}
            ></div>
          </div>

          <div className="progress-stats">
            <span>Progress: {currentOperation.progress.toFixed(1)}%</span>
            <span>Completed: {currentOperation.completedItems}/{currentOperation.totalItems}</span>
            <span>Failed: {currentOperation.failedItems}</span>
            {currentOperation.startTime && (
              <span>Duration: {formatDuration(currentOperation.startTime, currentOperation.endTime)}</span>
            )}
          </div>

          {currentOperation.error && (
            <div className="operation-error">
              <i className="fas fa-exclamation-circle"></i>
              {currentOperation.error}
            </div>
          )}
        </div>
      )}

      {operationHistory.length > 0 && (
        <div className="operation-history">
          <div className="history-header">
            <h5>Operation History</h5>
            <button className="btn-secondary" onClick={clearOperationHistory}>
              <i className="fas fa-trash"></i>
              Clear History
            </button>
          </div>
          <div className="history-list">
            {operationHistory.slice(0, 10).map((operation) => (
              <div key={operation.id} className="history-item">
                <div className="history-info">
                  {getStatusIcon(operation.status)}
                  <div>
                    <strong>
                      {operation.type === 'sequential_addressing' && 'Sequential Addressing'}
                      {operation.type === 'batch_testing' && 'Batch Testing'}
                      {operation.type === 'bulk_validation' && 'System Validation'}
                    </strong>
                    <p>
                      {operation.completedItems}/{operation.totalItems} items completed
                      {operation.failedItems > 0 && `, ${operation.failedItems} failed`}
                    </p>
                  </div>
                </div>
                <div className="history-meta">
                  {operation.startTime && (
                    <span>{operation.startTime.toLocaleString()}</span>
                  )}
                  {operation.startTime && operation.endTime && (
                    <span>{formatDuration(operation.startTime, operation.endTime)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};