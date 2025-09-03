import React, { useState, useEffect, useCallback } from 'react';
import ProgressIndicator, { ProgressIndicatorProps } from './ProgressIndicator';
import useWebSocket from '../../hooks/useWebSocket';
import { 
  HardwareDetectionUpdate,
  HardwareTestingUpdate,
  HardwareConfigurationUpdate,
  WizardProgressUpdate,
  HardwareErrorUpdate,
  HardwareRecoveryUpdate
} from '../../../../shared/types/core-entities';
import './RealTimeProgressIndicator.css';

export interface RealTimeProgressIndicatorProps extends Omit<ProgressIndicatorProps, 'progress' | 'status' | 'message'> {
  sessionId: string;
  operationType: 'detection' | 'testing' | 'configuration' | 'wizard' | 'all';
  onComplete?: (success: boolean, data?: any) => void;
  onError?: (error: HardwareErrorUpdate) => void;
  onRecovery?: (recovery: HardwareRecoveryUpdate) => void;
  autoRetry?: boolean;
  maxRetries?: number;
}

export const RealTimeProgressIndicator: React.FC<RealTimeProgressIndicatorProps> = ({
  sessionId,
  operationType,
  title,
  onComplete,
  onError,
  onRecovery,
  onCancel,
  autoRetry = false,
  maxRetries = 3,
  ...progressProps
}) => {
  // State
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error' | 'warning'>('idle');
  const [message, setMessage] = useState<string>('');
  const [currentOperation, setCurrentOperation] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);
  const [lastError, setLastError] = useState<HardwareErrorUpdate | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // WebSocket connection
  const {
    isConnected,
    error: connectionError,
    onHardwareDetection,
    onHardwareTesting,
    onHardwareConfiguration,
    onWizardProgress,
    onHardwareError,
    onHardwareRecovery,
    subscribeToSession
  } = useWebSocket({
    sessionId,
    autoReconnect: true
  });

  // Handle hardware detection updates
  const handleDetectionUpdate = useCallback((update: HardwareDetectionUpdate) => {
    if (update.sessionId !== sessionId) return;
    
    setProgress(update.progress);
    setCurrentOperation(update.currentOperation);
    setMessage(`${update.phase}: ${update.currentOperation}`);
    
    if (update.progress >= 100) {
      setStatus('success');
      if (onComplete) {
        onComplete(true, {
          detectedDevices: update.detectedDevices,
          serialPorts: update.serialPorts
        });
      }
    } else {
      setStatus('running');
    }
    
    if (update.errors && update.errors.length > 0) {
      setStatus('warning');
      setMessage(`${update.currentOperation} (${update.errors.length} warnings)`);
    }
  }, [sessionId, onComplete]);

  // Handle hardware testing updates
  const handleTestingUpdate = useCallback((update: HardwareTestingUpdate) => {
    if (update.sessionId !== sessionId) return;
    
    setProgress(update.progress);
    setCurrentOperation(update.testName);
    
    switch (update.status) {
      case 'running':
        setStatus('running');
        setMessage(`Testing ${update.testName} on device ${update.deviceAddress}...`);
        break;
      case 'passed':
        setStatus(update.progress >= 100 ? 'success' : 'running');
        setMessage(`✅ ${update.testName} passed${update.duration ? ` (${update.duration}ms)` : ''}`);
        if (update.progress >= 100 && onComplete) {
          onComplete(true, update);
        }
        break;
      case 'failed':
        setStatus('error');
        setMessage(`❌ ${update.testName} failed: ${update.error || 'Unknown error'}`);
        if (onComplete) {
          onComplete(false, update);
        }
        break;
      case 'skipped':
        setStatus('warning');
        setMessage(`⏭️ ${update.testName} skipped`);
        break;
    }
  }, [sessionId, onComplete]);

  // Handle hardware configuration updates
  const handleConfigurationUpdate = useCallback((update: HardwareConfigurationUpdate) => {
    if (update.sessionId !== sessionId) return;
    
    setProgress(update.progress);
    setCurrentOperation(update.operation);
    
    switch (update.status) {
      case 'in_progress':
        setStatus('running');
        setMessage(update.message);
        break;
      case 'success':
        setStatus(update.progress >= 100 ? 'success' : 'running');
        setMessage(`✅ ${update.message}`);
        if (update.progress >= 100 && onComplete) {
          onComplete(true, update);
        }
        break;
      case 'failed':
        setStatus('error');
        setMessage(`❌ ${update.message}${update.error ? `: ${update.error}` : ''}`);
        if (onComplete) {
          onComplete(false, update);
        }
        break;
    }
  }, [sessionId, onComplete]);

  // Handle wizard progress updates
  const handleWizardProgress = useCallback((update: WizardProgressUpdate) => {
    if (update.sessionId !== sessionId) return;
    
    setProgress(update.overallProgress);
    setCurrentOperation(update.stepName);
    
    switch (update.stepStatus) {
      case 'in_progress':
        setStatus('running');
        setMessage(`Step ${update.currentStep}: ${update.stepName}`);
        break;
      case 'completed':
        setStatus(update.overallProgress >= 100 ? 'success' : 'running');
        setMessage(`✅ Step ${update.currentStep}: ${update.stepName} completed`);
        if (update.overallProgress >= 100 && onComplete) {
          onComplete(true, update);
        }
        break;
      case 'failed':
        setStatus('error');
        const errorMsg = update.errors?.join(', ') || 'Unknown error';
        setMessage(`❌ Step ${update.currentStep}: ${update.stepName} failed: ${errorMsg}`);
        if (onComplete) {
          onComplete(false, update);
        }
        break;
      case 'not_started':
        setStatus('idle');
        setMessage(`Step ${update.currentStep}: ${update.stepName} (waiting)`);
        break;
    }
    
    if (update.warnings && update.warnings.length > 0) {
      setStatus('warning');
      setMessage(`⚠️ ${update.stepName}: ${update.warnings.join(', ')}`);
    }
  }, [sessionId, onComplete]);

  // Handle hardware errors
  const handleHardwareError = useCallback((update: HardwareErrorUpdate) => {
    if (update.sessionId && update.sessionId !== sessionId) return;
    
    setLastError(update);
    setStatus('error');
    setMessage(`${update.errorType}: ${update.message}`);
    
    if (onError) {
      onError(update);
    }
    
    // Auto-retry if enabled and error is recoverable
    if (autoRetry && update.recoverable && retryCount < maxRetries) {
      setIsRetrying(true);
      setTimeout(() => {
        setRetryCount(prev => prev + 1);
        setStatus('running');
        setMessage('Retrying...');
        setIsRetrying(false);
      }, 2000);
    }
  }, [sessionId, onError, autoRetry, retryCount, maxRetries]);

  // Handle hardware recovery
  const handleHardwareRecovery = useCallback((update: HardwareRecoveryUpdate) => {
    if (update.sessionId && update.sessionId !== sessionId) return;
    
    switch (update.status) {
      case 'attempting':
        setStatus('warning');
        setMessage(`🔧 ${update.message}`);
        break;
      case 'success':
        setStatus('running');
        setMessage(`✅ Recovery successful: ${update.message}`);
        setLastError(null);
        setRetryCount(0);
        break;
      case 'failed':
        setStatus('error');
        setMessage(`❌ Recovery failed: ${update.message}`);
        break;
    }
    
    if (onRecovery) {
      onRecovery(update);
    }
  }, [sessionId, onRecovery]);

  // Manual retry handler
  const handleRetry = useCallback(() => {
    if (lastError && retryCount < maxRetries) {
      setRetryCount(prev => prev + 1);
      setStatus('running');
      setMessage('Retrying...');
      setLastError(null);
      
      // Trigger retry through WebSocket or callback
      // This would typically send a retry command to the backend
    }
  }, [lastError, retryCount, maxRetries]);

  // Register WebSocket event handlers
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    if (operationType === 'detection' || operationType === 'all') {
      unsubscribers.push(onHardwareDetection(handleDetectionUpdate));
    }
    
    if (operationType === 'testing' || operationType === 'all') {
      unsubscribers.push(onHardwareTesting(handleTestingUpdate));
    }
    
    if (operationType === 'configuration' || operationType === 'all') {
      unsubscribers.push(onHardwareConfiguration(handleConfigurationUpdate));
    }
    
    if (operationType === 'wizard' || operationType === 'all') {
      unsubscribers.push(onWizardProgress(handleWizardProgress));
    }
    
    // Always listen for errors and recovery
    unsubscribers.push(onHardwareError(handleHardwareError));
    unsubscribers.push(onHardwareRecovery(handleHardwareRecovery));

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [
    operationType,
    onHardwareDetection,
    onHardwareTesting,
    onHardwareConfiguration,
    onWizardProgress,
    onHardwareError,
    onHardwareRecovery,
    handleDetectionUpdate,
    handleTestingUpdate,
    handleConfigurationUpdate,
    handleWizardProgress,
    handleHardwareError,
    handleHardwareRecovery
  ]);

  // Connection status message
  const getConnectionMessage = (): string => {
    if (!isConnected) {
      return connectionError || 'Connecting to real-time updates...';
    }
    if (isRetrying) {
      return `Retrying... (attempt ${retryCount + 1}/${maxRetries})`;
    }
    return message || currentOperation || 'Ready';
  };

  // Determine if retry should be shown
  const showRetry = status === 'error' && lastError?.recoverable && retryCount < maxRetries;

  return (
    <div className="real-time-progress-indicator">
      <ProgressIndicator
        {...progressProps}
        sessionId={sessionId}
        title={title}
        progress={progress}
        status={!isConnected ? 'warning' : status}
        message={getConnectionMessage()}
        onCancel={onCancel}
        onRetry={showRetry ? handleRetry : undefined}
      />
      
      {!isConnected && (
        <div className="real-time-progress-indicator__connection-warning">
          ⚠️ Real-time updates unavailable. Progress may not be current.
        </div>
      )}
      
      {lastError && status === 'error' && (
        <div className="real-time-progress-indicator__error-details">
          <div className="real-time-progress-indicator__error-type">
            Error Type: {lastError.errorType}
          </div>
          <div className="real-time-progress-indicator__error-severity">
            Severity: {lastError.severity}
          </div>
          {lastError.suggestedAction && (
            <div className="real-time-progress-indicator__suggested-action">
              Suggested Action: {lastError.suggestedAction}
            </div>
          )}
          {lastError.details && (
            <details className="real-time-progress-indicator__error-details-expand">
              <summary>Technical Details</summary>
              <pre>{JSON.stringify(lastError.details, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

export default RealTimeProgressIndicator;