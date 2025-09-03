import React, { useState } from 'react';
import {
  ProgressIndicator,
  RealTimeProgressIndicator,
  ConnectionStatusIndicator,
  useWebSocket
} from './index';
import { 
  HardwareErrorUpdate,
  HardwareRecoveryUpdate
} from '../../../../shared/types/core-entities';

/**
 * Example component demonstrating real-time progress indicators
 * This shows how to integrate WebSocket-based progress updates
 * with the hardware configuration wizard
 */
export const ProgressExample: React.FC = () => {
  const [sessionId] = useState(() => `example-${Date.now()}`);
  const [showDetails, setShowDetails] = useState(false);
  const [operationType, setOperationType] = useState<'detection' | 'testing' | 'configuration' | 'wizard' | 'all'>('all');

  // Example handlers
  const handleComplete = (success: boolean, data?: any) => {
    console.log('Operation completed:', { success, data });
  };

  const handleError = (error: HardwareErrorUpdate) => {
    console.error('Hardware error:', error);
  };

  const handleRecovery = (recovery: HardwareRecoveryUpdate) => {
    console.log('Hardware recovery:', recovery);
  };

  const handleCancel = () => {
    console.log('Operation cancelled');
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Real-Time Progress Components Example</h2>
      
      {/* Connection Status */}
      <div style={{ marginBottom: '20px' }}>
        <h3>Connection Status</h3>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '10px' }}>
          <ConnectionStatusIndicator 
            sessionId={sessionId}
            showDetails={showDetails}
            compact={false}
          />
          <ConnectionStatusIndicator 
            sessionId={sessionId}
            compact={true}
          />
        </div>
        <label>
          <input
            type="checkbox"
            checked={showDetails}
            onChange={(e) => setShowDetails(e.target.checked)}
          />
          Show detailed connection information
        </label>
      </div>

      {/* Operation Type Selection */}
      <div style={{ marginBottom: '20px' }}>
        <h3>Operation Type</h3>
        <select 
          value={operationType} 
          onChange={(e) => setOperationType(e.target.value as any)}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
        >
          <option value="all">All Operations</option>
          <option value="detection">Hardware Detection</option>
          <option value="testing">Hardware Testing</option>
          <option value="configuration">Hardware Configuration</option>
          <option value="wizard">Wizard Progress</option>
        </select>
      </div>

      {/* Real-Time Progress Indicators */}
      <div style={{ marginBottom: '20px' }}>
        <h3>Real-Time Progress Indicators</h3>
        
        {/* Linear Progress */}
        <RealTimeProgressIndicator
          sessionId={sessionId}
          operationType={operationType}
          title="Hardware Detection Progress"
          variant="linear"
          size="medium"
          showPercentage={true}
          showElapsedTime={true}
          animated={true}
          onComplete={handleComplete}
          onError={handleError}
          onRecovery={handleRecovery}
          onCancel={handleCancel}
          autoRetry={true}
          maxRetries={3}
        />

        {/* Circular Progress */}
        <RealTimeProgressIndicator
          sessionId={sessionId}
          operationType={operationType}
          title="Hardware Testing Progress"
          variant="circular"
          size="large"
          showPercentage={true}
          showElapsedTime={false}
          animated={true}
          onComplete={handleComplete}
          onError={handleError}
          onRecovery={handleRecovery}
          autoRetry={false}
        />

        {/* Small Progress */}
        <RealTimeProgressIndicator
          sessionId={sessionId}
          operationType={operationType}
          title="Configuration Progress"
          variant="linear"
          size="small"
          showPercentage={false}
          showElapsedTime={true}
          animated={true}
          onComplete={handleComplete}
          onError={handleError}
          onRecovery={handleRecovery}
        />
      </div>

      {/* Static Progress Examples */}
      <div style={{ marginBottom: '20px' }}>
        <h3>Static Progress Indicators</h3>
        
        <ProgressIndicator
          title="Idle Operation"
          progress={0}
          status="idle"
          message="Waiting to start..."
          variant="linear"
          size="medium"
          showPercentage={true}
        />

        <ProgressIndicator
          title="Running Operation"
          progress={65}
          status="running"
          message="Processing hardware detection..."
          variant="linear"
          size="medium"
          showPercentage={true}
          showElapsedTime={true}
          animated={true}
        />

        <ProgressIndicator
          title="Successful Operation"
          progress={100}
          status="success"
          message="Hardware detection completed successfully"
          variant="circular"
          size="medium"
          showPercentage={true}
        />

        <ProgressIndicator
          title="Failed Operation"
          progress={45}
          status="error"
          message="Communication error with device at address 1"
          variant="linear"
          size="medium"
          showPercentage={true}
          onRetry={() => console.log('Retry clicked')}
        />

        <ProgressIndicator
          title="Warning Operation"
          progress={80}
          status="warning"
          message="Some devices not responding, continuing with available devices"
          variant="linear"
          size="medium"
          showPercentage={true}
        />
      </div>

      {/* Usage Instructions */}
      <div style={{ marginTop: '30px', padding: '20px', background: '#f8f9fa', borderRadius: '8px' }}>
        <h3>Usage Instructions</h3>
        <ol>
          <li><strong>Connection Status:</strong> Shows real-time WebSocket connection status</li>
          <li><strong>Real-Time Progress:</strong> Automatically updates based on WebSocket messages</li>
          <li><strong>Operation Types:</strong> Filter which types of hardware events to listen for</li>
          <li><strong>Auto-Retry:</strong> Automatically retry failed operations if they're recoverable</li>
          <li><strong>Session Management:</strong> Each wizard session gets its own progress updates</li>
        </ol>
        
        <h4>WebSocket Message Types:</h4>
        <ul>
          <li><code>hardware_detection</code> - Device scanning and identification</li>
          <li><code>hardware_testing</code> - Communication and relay testing</li>
          <li><code>hardware_configuration</code> - Address assignment and verification</li>
          <li><code>wizard_progress</code> - Overall wizard step progress</li>
          <li><code>hardware_error</code> - Error notifications with recovery suggestions</li>
          <li><code>hardware_recovery</code> - Recovery attempt status updates</li>
        </ul>

        <h4>Integration Example:</h4>
        <pre style={{ background: '#fff', padding: '10px', borderRadius: '4px', overflow: 'auto' }}>
{`// In your wizard component:
import { RealTimeProgressIndicator } from './components/progress';

<RealTimeProgressIndicator
  sessionId={wizardSessionId}
  operationType="detection"
  title="Scanning for Hardware"
  onComplete={(success, data) => {
    if (success) {
      setDetectedDevices(data.detectedDevices);
      proceedToNextStep();
    }
  }}
  onError={(error) => {
    showErrorDialog(error.message);
  }}
  autoRetry={true}
  maxRetries={3}
/>`}
        </pre>
      </div>
    </div>
  );
};

export default ProgressExample;