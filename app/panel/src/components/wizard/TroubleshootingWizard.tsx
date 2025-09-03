/**
 * Hardware Configuration Wizard - Troubleshooting Wizard Component
 * 
 * Provides guided problem resolution with step-by-step diagnostic procedures,
 * automated testing, and escalation paths for unresolvable issues.
 * 
 * Based on requirements 7.5, 7.6, and 7.7 from the Hardware Configuration Wizard spec.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  WizardError, 
  TroubleshootingStep, 
  ErrorSeverity,
  ErrorCategory 
} from '../../../../../shared/services/error-handler';
import { 
  RecoveryActionSystem,
  ManualInterventionGuide,
  RecoveryResult,
  RecoveryContext
} from '../../../../../shared/services/recovery-action-system';

interface TroubleshootingWizardProps {
  error: WizardError;
  context?: RecoveryContext;
  onResolved: (resolved: boolean) => void;
  onEscalate: (error: WizardError, context: any) => void;
  className?: string;
}

interface StepResult {
  stepId: string;
  success: boolean;
  userConfirmed: boolean;
  notes?: string;
  timestamp: Date;
}

interface DiagnosticTest {
  id: string;
  name: string;
  description: string;
  automated: boolean;
  execute: () => Promise<boolean>;
  estimatedDuration: number;
}

export const TroubleshootingWizard: React.FC<TroubleshootingWizardProps> = ({
  error,
  context = {},
  onResolved,
  onEscalate,
  className = ''
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [troubleshootingSteps, setTroubleshootingSteps] = useState<TroubleshootingStep[]>([]);
  const [manualGuide, setManualGuide] = useState<ManualInterventionGuide | null>(null);
  const [stepResults, setStepResults] = useState<StepResult[]>([]);
  const [isExecutingTest, setIsExecutingTest] = useState(false);
  const [testProgress, setTestProgress] = useState(0);
  const [showManualGuide, setShowManualGuide] = useState(false);
  const [diagnosticTests, setDiagnosticTests] = useState<DiagnosticTest[]>([]);
  const [recoverySystem] = useState(() => new RecoveryActionSystem());

  // Initialize troubleshooting steps and manual guide
  useEffect(() => {
    const initializeTroubleshooting = async () => {
      try {
        // Get troubleshooting steps from error handler
        const steps = generateTroubleshootingSteps(error);
        setTroubleshootingSteps(steps);

        // Get manual intervention guide
        const guide = recoverySystem.generateManualInterventionGuide(error, context);
        setManualGuide(guide);

        // Generate diagnostic tests
        const tests = generateDiagnosticTests(error, context);
        setDiagnosticTests(tests);

      } catch (err) {
        console.error('Failed to initialize troubleshooting:', err);
      }
    };

    initializeTroubleshooting();
  }, [error, context, recoverySystem]);

  // Generate troubleshooting steps based on error type
  const generateTroubleshootingSteps = (error: WizardError): TroubleshootingStep[] => {
    // This would normally use the ErrorHandler, but for now we'll generate steps directly
    const baseSteps: TroubleshootingStep[] = [];

    switch (error.category) {
      case ErrorCategory.SERIAL_PORT:
        baseSteps.push(
          {
            id: 'sp_check_connection',
            title: 'Check USB Connection',
            description: 'Verify the USB-RS485 adapter is properly connected',
            action: 'Disconnect and reconnect the USB cable firmly',
            expectedResult: 'USB device should be recognized by the system',
            nextStepOnSuccess: 'sp_test_port',
            nextStepOnFailure: 'sp_try_different_port',
            isAutomated: false,
            estimatedTime: 30
          },
          {
            id: 'sp_test_port',
            title: 'Test Serial Port Access',
            description: 'Verify the application can access the serial port',
            action: 'Run automated port access test',
            expectedResult: 'Port should open and close without errors',
            isAutomated: true,
            estimatedTime: 5
          }
        );
        break;

      case ErrorCategory.COMMUNICATION:
        baseSteps.push(
          {
            id: 'com_check_wiring',
            title: 'Check RS485 Wiring',
            description: 'Verify A+, B-, and GND connections are correct',
            action: 'Check wiring against connection diagram',
            expectedResult: 'All connections should match the diagram',
            nextStepOnSuccess: 'com_test_basic',
            nextStepOnFailure: 'com_fix_wiring',
            isAutomated: false,
            estimatedTime: 120
          },
          {
            id: 'com_test_basic',
            title: 'Test Basic Communication',
            description: 'Send a simple Modbus command to test connectivity',
            action: 'Run automated communication test',
            expectedResult: 'Device should respond with valid data',
            isAutomated: true,
            estimatedTime: 10
          }
        );
        break;

      case ErrorCategory.ADDRESS_CONFIG:
        baseSteps.push(
          {
            id: 'addr_scan_devices',
            title: 'Scan for Devices',
            description: 'Identify all devices currently on the bus',
            action: 'Run automated device scan',
            expectedResult: 'List of responding devices and addresses',
            isAutomated: true,
            estimatedTime: 30
          },
          {
            id: 'addr_resolve_conflicts',
            title: 'Resolve Address Conflicts',
            description: 'Automatically assign unique addresses',
            action: 'Run automated address resolution',
            expectedResult: 'All devices should have unique addresses',
            isAutomated: true,
            estimatedTime: 60
          }
        );
        break;

      default:
        baseSteps.push(
          {
            id: 'gen_check_logs',
            title: 'Check System Logs',
            description: 'Review logs for additional error information',
            action: 'Open and review application logs',
            expectedResult: 'Logs should provide more context',
            isAutomated: false,
            estimatedTime: 60
          }
        );
    }

    return baseSteps;
  };

  // Generate diagnostic tests for automated verification
  const generateDiagnosticTests = (error: WizardError, context: RecoveryContext): DiagnosticTest[] => {
    const tests: DiagnosticTest[] = [];

    switch (error.category) {
      case ErrorCategory.SERIAL_PORT:
        tests.push({
          id: 'test_port_access',
          name: 'Serial Port Access Test',
          description: 'Test if the serial port can be opened and closed',
          automated: true,
          execute: async () => {
            // Simulate port access test
            await new Promise(resolve => setTimeout(resolve, 2000));
            return Math.random() > 0.3; // 70% success rate
          },
          estimatedDuration: 3
        });
        break;

      case ErrorCategory.COMMUNICATION:
        tests.push({
          id: 'test_communication',
          name: 'Modbus Communication Test',
          description: 'Send a basic Modbus command and verify response',
          automated: true,
          execute: async () => {
            await new Promise(resolve => setTimeout(resolve, 3000));
            return Math.random() > 0.4; // 60% success rate
          },
          estimatedDuration: 5
        });
        break;

      case ErrorCategory.ADDRESS_CONFIG:
        tests.push({
          id: 'test_address_scan',
          name: 'Address Scan Test',
          description: 'Scan for devices and check for address conflicts',
          automated: true,
          execute: async () => {
            await new Promise(resolve => setTimeout(resolve, 5000));
            return Math.random() > 0.2; // 80% success rate
          },
          estimatedDuration: 10
        });
        break;
    }

    return tests;
  };

  // Execute automated diagnostic test
  const executeAutomatedTest = useCallback(async (step: TroubleshootingStep) => {
    const test = diagnosticTests.find(t => t.id === `test_${step.id.split('_').slice(1).join('_')}`);
    if (!test) return false;

    setIsExecutingTest(true);
    setTestProgress(0);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setTestProgress(prev => Math.min(prev + 10, 90));
      }, test.estimatedDuration * 100);

      const result = await test.execute();
      
      clearInterval(progressInterval);
      setTestProgress(100);

      // Record step result
      const stepResult: StepResult = {
        stepId: step.id,
        success: result,
        userConfirmed: true,
        timestamp: new Date()
      };

      setStepResults(prev => [...prev, stepResult]);

      return result;

    } catch (error) {
      console.error('Automated test failed:', error);
      return false;
    } finally {
      setIsExecutingTest(false);
      setTimeout(() => setTestProgress(0), 1000);
    }
  }, [diagnosticTests]);

  // Handle step completion
  const handleStepComplete = useCallback(async (success: boolean, notes?: string) => {
    const currentStep = troubleshootingSteps[currentStepIndex];
    if (!currentStep) return;

    // Record step result
    const stepResult: StepResult = {
      stepId: currentStep.id,
      success,
      userConfirmed: true,
      notes,
      timestamp: new Date()
    };

    setStepResults(prev => [...prev, stepResult]);

    // Determine next step
    if (success) {
      if (currentStep.nextStepOnSuccess) {
        const nextStepIndex = troubleshootingSteps.findIndex(s => s.id === currentStep.nextStepOnSuccess);
        if (nextStepIndex !== -1) {
          setCurrentStepIndex(nextStepIndex);
          return;
        }
      }
      
      // If no specific next step, go to next in sequence or complete
      if (currentStepIndex < troubleshootingSteps.length - 1) {
        setCurrentStepIndex(currentStepIndex + 1);
      } else {
        // All steps completed successfully
        onResolved(true);
      }
    } else {
      if (currentStep.nextStepOnFailure) {
        const nextStepIndex = troubleshootingSteps.findIndex(s => s.id === currentStep.nextStepOnFailure);
        if (nextStepIndex !== -1) {
          setCurrentStepIndex(nextStepIndex);
          return;
        }
      }
      
      // If no failure path, show manual guide or escalate
      setShowManualGuide(true);
    }
  }, [currentStepIndex, troubleshootingSteps, onResolved]);

  // Handle automated step execution
  const handleAutomatedStep = useCallback(async () => {
    const currentStep = troubleshootingSteps[currentStepIndex];
    if (!currentStep || !currentStep.isAutomated) return;

    const success = await executeAutomatedTest(currentStep);
    await handleStepComplete(success);
  }, [currentStepIndex, troubleshootingSteps, executeAutomatedTest, handleStepComplete]);

  // Handle escalation to support
  const handleEscalate = useCallback(() => {
    const escalationContext = {
      ...context,
      troubleshootingSteps: stepResults,
      currentStep: currentStepIndex,
      manualGuideShown: showManualGuide
    };

    onEscalate(error, escalationContext);
  }, [context, stepResults, currentStepIndex, showManualGuide, error, onEscalate]);

  // Get current step
  const currentStep = troubleshootingSteps[currentStepIndex];

  // Calculate progress
  const progress = troubleshootingSteps.length > 0 
    ? ((currentStepIndex + 1) / troubleshootingSteps.length) * 100 
    : 0;

  if (showManualGuide && manualGuide) {
    return (
      <div className={`troubleshooting-wizard manual-guide ${className}`}>
        <div className="wizard-header">
          <h2>Manual Troubleshooting Guide</h2>
          <div className="error-info">
            <span className={`error-severity ${error.severity}`}>
              {error.severity.toUpperCase()}
            </span>
            <span className="error-code">{error.code}</span>
          </div>
        </div>

        <div className="manual-guide-content">
          <div className="guide-overview">
            <h3>{manualGuide.title}</h3>
            <p>{manualGuide.description}</p>
            
            <div className="guide-metadata">
              <div className="metadata-item">
                <strong>Estimated Time:</strong> {Math.ceil(manualGuide.estimatedTime / 60)} minutes
              </div>
              <div className="metadata-item">
                <strong>Skill Level:</strong> {manualGuide.skillLevel}
              </div>
              {manualGuide.toolsRequired && (
                <div className="metadata-item">
                  <strong>Tools Required:</strong> {manualGuide.toolsRequired.join(', ')}
                </div>
              )}
            </div>

            {manualGuide.safetyWarnings && manualGuide.safetyWarnings.length > 0 && (
              <div className="safety-warnings">
                <h4>⚠️ Safety Warnings</h4>
                <ul>
                  {manualGuide.safetyWarnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="guide-steps">
            <h4>Step-by-Step Instructions</h4>
            {manualGuide.steps.map((step, index) => (
              <div key={step.stepNumber} className="manual-step">
                <div className="step-header">
                  <span className="step-number">{step.stepNumber}</span>
                  <h5>{step.title}</h5>
                </div>
                <div className="step-content">
                  <p className="step-description">{step.description}</p>
                  <div className="step-action">
                    <strong>Action:</strong> {step.action}
                  </div>
                  <div className="step-expected">
                    <strong>Expected Result:</strong> {step.expectedResult}
                  </div>
                  {step.troubleshooting && (
                    <div className="step-troubleshooting">
                      <strong>Troubleshooting:</strong> {step.troubleshooting}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="guide-actions">
            <button 
              className="btn btn-success"
              onClick={() => onResolved(true)}
            >
              Problem Resolved
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => setShowManualGuide(false)}
            >
              Back to Automated Steps
            </button>
            <button 
              className="btn btn-warning"
              onClick={handleEscalate}
            >
              Contact Support
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`troubleshooting-wizard ${className}`}>
      <div className="wizard-header">
        <h2>Troubleshooting Wizard</h2>
        <div className="error-info">
          <span className={`error-severity ${error.severity}`}>
            {error.severity.toUpperCase()}
          </span>
          <span className="error-message">{error.userMessage}</span>
          <span className="error-code">{error.code}</span>
        </div>
      </div>

      <div className="wizard-progress">
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="progress-text">
          Step {currentStepIndex + 1} of {troubleshootingSteps.length}
        </div>
      </div>

      {currentStep && (
        <div className="current-step">
          <div className="step-header">
            <h3>{currentStep.title}</h3>
            {currentStep.estimatedTime && (
              <span className="estimated-time">
                ~{currentStep.estimatedTime} seconds
              </span>
            )}
          </div>

          <div className="step-content">
            <p className="step-description">{currentStep.description}</p>
            
            {currentStep.action && (
              <div className="step-action">
                <strong>Action Required:</strong> {currentStep.action}
              </div>
            )}

            {currentStep.expectedResult && (
              <div className="step-expected">
                <strong>Expected Result:</strong> {currentStep.expectedResult}
              </div>
            )}

            {currentStep.isAutomated ? (
              <div className="automated-step">
                {isExecutingTest ? (
                  <div className="test-progress">
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${testProgress}%` }}
                      />
                    </div>
                    <p>Running automated test... {testProgress}%</p>
                  </div>
                ) : (
                  <button 
                    className="btn btn-primary"
                    onClick={handleAutomatedStep}
                  >
                    Run Automated Test
                  </button>
                )}
              </div>
            ) : (
              <div className="manual-step-actions">
                <p><strong>Please complete the action above, then indicate the result:</strong></p>
                <div className="step-buttons">
                  <button 
                    className="btn btn-success"
                    onClick={() => handleStepComplete(true)}
                  >
                    ✅ Success
                  </button>
                  <button 
                    className="btn btn-danger"
                    onClick={() => handleStepComplete(false)}
                  >
                    ❌ Failed
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="wizard-actions">
        <button 
          className="btn btn-secondary"
          onClick={() => setShowManualGuide(true)}
          disabled={!manualGuide}
        >
          Show Manual Guide
        </button>
        
        <button 
          className="btn btn-warning"
          onClick={handleEscalate}
        >
          Contact Support
        </button>

        {currentStepIndex > 0 && (
          <button 
            className="btn btn-outline"
            onClick={() => setCurrentStepIndex(currentStepIndex - 1)}
          >
            Previous Step
          </button>
        )}
      </div>

      {stepResults.length > 0 && (
        <div className="step-history">
          <h4>Troubleshooting History</h4>
          <div className="history-list">
            {stepResults.map((result, index) => (
              <div key={index} className={`history-item ${result.success ? 'success' : 'failed'}`}>
                <span className="step-name">
                  {troubleshootingSteps.find(s => s.id === result.stepId)?.title || result.stepId}
                </span>
                <span className={`result ${result.success ? 'success' : 'failed'}`}>
                  {result.success ? '✅' : '❌'}
                </span>
                <span className="timestamp">
                  {result.timestamp.toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};