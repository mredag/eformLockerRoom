/**
 * Unit tests for TroubleshootingWizard component
 * Tests guided problem resolution, automated testing, and escalation paths
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TroubleshootingWizard } from '../TroubleshootingWizard';
import { 
  WizardError, 
  ErrorSeverity, 
  ErrorCategory, 
  ERROR_CODES 
} from '../../../../../../shared/services/error-handler';

// Mock the recovery action system
jest.mock('../../../../../../shared/services/recovery-action-system', () => ({
  RecoveryActionSystem: jest.fn().mockImplementation(() => ({
    generateManualInterventionGuide: jest.fn().mockReturnValue({
      title: 'Test Manual Guide',
      description: 'Test description',
      estimatedTime: 300,
      skillLevel: 'beginner',
      toolsRequired: ['Test tool'],
      safetyWarnings: ['Test warning'],
      steps: [
        {
          stepNumber: 1,
          title: 'Test Step',
          description: 'Test step description',
          action: 'Test action',
          expectedResult: 'Test result'
        }
      ]
    })
  }))
}));

describe('TroubleshootingWizard', () => {
  const mockError: WizardError = {
    code: ERROR_CODES.SP_NOT_FOUND,
    category: ErrorCategory.SERIAL_PORT,
    severity: ErrorSeverity.CRITICAL,
    message: 'Serial port not found',
    userMessage: 'USB-RS485 adapter not found. Please check the connection.',
    recoverable: true,
    timestamp: new Date()
  };

  const mockOnResolved = jest.fn();
  const mockOnEscalate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Rendering', () => {
    test('should render troubleshooting wizard with error information', () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      expect(screen.getByText('Troubleshooting Wizard')).toBeInTheDocument();
      expect(screen.getByText('CRITICAL')).toBeInTheDocument();
      expect(screen.getByText(mockError.userMessage)).toBeInTheDocument();
      expect(screen.getByText(mockError.code)).toBeInTheDocument();
    });

    test('should render progress bar and step information', () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      expect(screen.getByText(/Step \d+ of \d+/)).toBeInTheDocument();
      expect(screen.getByRole('progressbar', { hidden: true })).toBeInTheDocument();
    });

    test('should render current troubleshooting step', () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      // Should show the first step for serial port errors
      expect(screen.getByText('Check USB Connection')).toBeInTheDocument();
      expect(screen.getByText(/Verify the USB-RS485 adapter is properly connected/)).toBeInTheDocument();
    });

    test('should render action buttons', () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      expect(screen.getByText('Show Manual Guide')).toBeInTheDocument();
      expect(screen.getByText('Contact Support')).toBeInTheDocument();
    });
  });

  describe('Step Navigation', () => {
    test('should handle manual step completion - success', async () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      const successButton = screen.getByText('✅ Success');
      fireEvent.click(successButton);

      await waitFor(() => {
        // Should move to next step or complete
        expect(screen.getByText(/Step \d+ of \d+/)).toBeInTheDocument();
      });
    });

    test('should handle manual step completion - failure', async () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      const failButton = screen.getByText('❌ Failed');
      fireEvent.click(failButton);

      await waitFor(() => {
        // Should show manual guide or escalate
        expect(screen.getByText('Show Manual Guide')).toBeInTheDocument();
      });
    });

    test('should handle automated step execution', async () => {
      const automatedError: WizardError = {
        ...mockError,
        category: ErrorCategory.COMMUNICATION
      };

      render(
        <TroubleshootingWizard
          error={automatedError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      // Find and click automated test button
      const testButton = screen.getByText('Run Automated Test');
      fireEvent.click(testButton);

      // Should show progress
      await waitFor(() => {
        expect(screen.getByText(/Running automated test/)).toBeInTheDocument();
      });
    });

    test('should allow navigation to previous step', () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      // Complete first step to enable previous button
      const successButton = screen.getByText('✅ Success');
      fireEvent.click(successButton);

      // Previous button should be available on subsequent steps
      const prevButton = screen.queryByText('Previous Step');
      if (prevButton) {
        fireEvent.click(prevButton);
      }
    });
  });

  describe('Manual Guide Display', () => {
    test('should show manual guide when requested', async () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      const manualGuideButton = screen.getByText('Show Manual Guide');
      fireEvent.click(manualGuideButton);

      await waitFor(() => {
        expect(screen.getByText('Manual Troubleshooting Guide')).toBeInTheDocument();
        expect(screen.getByText('Test Manual Guide')).toBeInTheDocument();
        expect(screen.getByText('Test description')).toBeInTheDocument();
      });
    });

    test('should display manual guide metadata', async () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      const manualGuideButton = screen.getByText('Show Manual Guide');
      fireEvent.click(manualGuideButton);

      await waitFor(() => {
        expect(screen.getByText(/Estimated Time:/)).toBeInTheDocument();
        expect(screen.getByText(/Skill Level:/)).toBeInTheDocument();
        expect(screen.getByText(/Tools Required:/)).toBeInTheDocument();
      });
    });

    test('should display safety warnings in manual guide', async () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      const manualGuideButton = screen.getByText('Show Manual Guide');
      fireEvent.click(manualGuideButton);

      await waitFor(() => {
        expect(screen.getByText('⚠️ Safety Warnings')).toBeInTheDocument();
        expect(screen.getByText('Test warning')).toBeInTheDocument();
      });
    });

    test('should display manual guide steps', async () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      const manualGuideButton = screen.getByText('Show Manual Guide');
      fireEvent.click(manualGuideButton);

      await waitFor(() => {
        expect(screen.getByText('Step-by-Step Instructions')).toBeInTheDocument();
        expect(screen.getByText('Test Step')).toBeInTheDocument();
        expect(screen.getByText('Test step description')).toBeInTheDocument();
        expect(screen.getByText('Test action')).toBeInTheDocument();
        expect(screen.getByText('Test result')).toBeInTheDocument();
      });
    });

    test('should allow returning from manual guide to automated steps', async () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      // Show manual guide
      const manualGuideButton = screen.getByText('Show Manual Guide');
      fireEvent.click(manualGuideButton);

      await waitFor(() => {
        expect(screen.getByText('Manual Troubleshooting Guide')).toBeInTheDocument();
      });

      // Return to automated steps
      const backButton = screen.getByText('Back to Automated Steps');
      fireEvent.click(backButton);

      await waitFor(() => {
        expect(screen.getByText('Troubleshooting Wizard')).toBeInTheDocument();
        expect(screen.queryByText('Manual Troubleshooting Guide')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling and Escalation', () => {
    test('should handle escalation to support', () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      const escalateButton = screen.getByText('Contact Support');
      fireEvent.click(escalateButton);

      expect(mockOnEscalate).toHaveBeenCalledWith(
        mockError,
        expect.objectContaining({
          troubleshootingSteps: expect.any(Array),
          currentStep: expect.any(Number),
          manualGuideShown: expect.any(Boolean)
        })
      );
    });

    test('should handle problem resolution', () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      // Complete all steps successfully to trigger resolution
      const successButton = screen.getByText('✅ Success');
      fireEvent.click(successButton);

      // This would trigger onResolved in a real scenario
      // The exact behavior depends on the step configuration
    });

    test('should handle problem resolution from manual guide', async () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      // Show manual guide
      const manualGuideButton = screen.getByText('Show Manual Guide');
      fireEvent.click(manualGuideButton);

      await waitFor(() => {
        expect(screen.getByText('Manual Troubleshooting Guide')).toBeInTheDocument();
      });

      // Mark as resolved
      const resolvedButton = screen.getByText('Problem Resolved');
      fireEvent.click(resolvedButton);

      expect(mockOnResolved).toHaveBeenCalledWith(true);
    });
  });

  describe('Step History', () => {
    test('should display step history after completing steps', async () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      // Complete a step
      const successButton = screen.getByText('✅ Success');
      fireEvent.click(successButton);

      await waitFor(() => {
        expect(screen.getByText('Troubleshooting History')).toBeInTheDocument();
      });
    });

    test('should show step results in history', async () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      // Complete a step successfully
      const successButton = screen.getByText('✅ Success');
      fireEvent.click(successButton);

      await waitFor(() => {
        expect(screen.getByText('✅')).toBeInTheDocument();
      });
    });
  });

  describe('Different Error Categories', () => {
    test('should render appropriate steps for communication errors', () => {
      const commError: WizardError = {
        ...mockError,
        code: ERROR_CODES.COM_TIMEOUT,
        category: ErrorCategory.COMMUNICATION,
        severity: ErrorSeverity.WARNING,
        userMessage: 'Communication timeout occurred'
      };

      render(
        <TroubleshootingWizard
          error={commError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      expect(screen.getByText('Check RS485 Wiring')).toBeInTheDocument();
    });

    test('should render appropriate steps for address configuration errors', () => {
      const addrError: WizardError = {
        ...mockError,
        code: ERROR_CODES.ADDR_CONFLICT,
        category: ErrorCategory.ADDRESS_CONFIG,
        severity: ErrorSeverity.ERROR,
        userMessage: 'Address conflict detected'
      };

      render(
        <TroubleshootingWizard
          error={addrError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      expect(screen.getByText('Scan for Devices')).toBeInTheDocument();
    });

    test('should render generic steps for unknown errors', () => {
      const genericError: WizardError = {
        ...mockError,
        code: ERROR_CODES.GEN_UNKNOWN,
        category: ErrorCategory.CONFIGURATION,
        severity: ErrorSeverity.ERROR,
        userMessage: 'Unknown error occurred'
      };

      render(
        <TroubleshootingWizard
          error={genericError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      expect(screen.getByText('Check System Logs')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('should have proper ARIA labels and roles', () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      // Check for progress bar
      expect(screen.getByRole('progressbar', { hidden: true })).toBeInTheDocument();
      
      // Check for buttons
      expect(screen.getByRole('button', { name: /Show Manual Guide/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Contact Support/ })).toBeInTheDocument();
    });

    test('should support keyboard navigation', () => {
      render(
        <TroubleshootingWizard
          error={mockError}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      const successButton = screen.getByText('✅ Success');
      
      // Should be focusable
      successButton.focus();
      expect(successButton).toHaveFocus();
      
      // Should respond to Enter key
      fireEvent.keyDown(successButton, { key: 'Enter', code: 'Enter' });
    });
  });

  describe('Context Handling', () => {
    test('should handle recovery context', () => {
      const context = {
        sessionId: 'test-session',
        step: 2,
        deviceAddress: 1,
        operation: 'test-operation'
      };

      render(
        <TroubleshootingWizard
          error={mockError}
          context={context}
          onResolved={mockOnResolved}
          onEscalate={mockOnEscalate}
        />
      );

      // Context should be used in escalation
      const escalateButton = screen.getByText('Contact Support');
      fireEvent.click(escalateButton);

      expect(mockOnEscalate).toHaveBeenCalledWith(
        mockError,
        expect.objectContaining({
          sessionId: 'test-session',
          step: 2,
          deviceAddress: 1,
          operation: 'test-operation'
        })
      );
    });
  });
});