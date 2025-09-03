/**
 * Wizard Step Executor
 * Handles execution of step-specific operations with error handling and recovery
 * 
 * Requirements: 2.3, 2.4, 2.5
 */

import { 
  WizardSession, 
  StepResult, 
  WizardStep, 
  WizardError, 
  RelayCardConfig,
  TestResult 
} from './wizard-orchestration-service';
import { HardwareDetectionService } from './hardware-detection-service';
import { SlaveAddressService } from './slave-address-service';
import { HardwareTestingService } from './hardware-testing-service';
import { wizardStepValidator } from './wizard-step-validator';

export interface StepExecutionContext {
  session: WizardSession;
  step: WizardStep;
  retryCount?: number;
  skipValidation?: boolean;
}

export interface StepExecutionResult extends StepResult {
  executionTime: number;
  retryCount: number;
  context?: any;
}

export class WizardStepExecutor {
  private hardwareDetection: HardwareDetectionService;
  private slaveAddress: SlaveAddressService;
  private hardwareTesting: HardwareTestingService;

  constructor() {
    this.hardwareDetection = HardwareDetectionService.getInstance();
    this.slaveAddress = SlaveAddressService.getInstance();
    this.hardwareTesting = HardwareTestingService.getInstance();
  }

  /**
   * Execute step with comprehensive error handling and recovery
   */
  async executeStep(context: StepExecutionContext): Promise<StepExecutionResult> {
    const startTime = Date.now();
    const { session, step, retryCount = 0, skipValidation = false } = context;
    const errors: WizardError[] = [];
    let success = false;
    let data: any = {};
    let nextStep: number | undefined;

    try {
      // Pre-execution validation unless skipped
      if (!skipValidation) {
        const validation = await wizardStepValidator.validateStep(session, step);
        if (!validation.valid) {
          errors.push({
            code: 'STEP_VALIDATION_FAILED',
            severity: 'error',
            message: `Step ${step} validation failed: ${validation.errors.join(', ')}`,
            details: { validation },
            recoverable: true,
            timestamp: new Date(),
            step
          });
          
          return {
            success: false,
            data: {},
            errors,
            canProceed: false,
            executionTime: Date.now() - startTime,
            retryCount
          };
        }
      }

      // Execute step-specific logic
      switch (step) {
        case WizardStep.CHECKLIST:
          ({ success, data, nextStep } = await this.executeChecklistStep(session));
          break;

        case WizardStep.DETECTION:
          ({ success, data, nextStep } = await this.executeDetectionStep(session));
          break;

        case WizardStep.ADDRESS_CONFIG:
          ({ success, data, nextStep } = await this.executeAddressConfigStep(session));
          break;

        case WizardStep.TESTING:
          ({ success, data, nextStep } = await this.executeTestingStep(session));
          break;

        case WizardStep.INTEGRATION:
          ({ success, data, nextStep } = await this.executeIntegrationStep(session));
          break;

        default:
          throw new Error(`Invalid step number: ${step}`);
      }

    } catch (error) {
      success = false;
      errors.push({
        code: 'STEP_EXECUTION_ERROR',
        severity: 'error',
        message: `Step ${step} execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error, step, retryCount },
        recoverable: this.isRecoverableError(error, step),
        suggestedAction: this.getSuggestedAction(error, step),
        timestamp: new Date(),
        step
      });
    }

    const executionTime = Date.now() - startTime;

    return {
      success,
      data,
      errors,
      nextStep,
      canProceed: success && nextStep !== undefined,
      executionTime,
      retryCount,
      context: { step, session: session.sessionId }
    };
  }

  /**
   * Execute step with retry logic
   */
  async executeStepWithRetry(
    context: StepExecutionContext, 
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<StepExecutionResult> {
    let lastResult: StepExecutionResult;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const retryContext = { ...context, retryCount: attempt };
      lastResult = await this.executeStep(retryContext);
      
      if (lastResult.success) {
        return lastResult;
      }

      // Check if errors are recoverable
      const recoverableErrors = lastResult.errors.filter(e => e.recoverable);
      if (recoverableErrors.length === 0 || attempt === maxRetries) {
        break; // No point in retrying non-recoverable errors or max retries reached
      }

      // Wait before retry
      if (attempt < maxRetries) {
        await this.delay(retryDelay * Math.pow(2, attempt)); // Exponential backoff
      }
    }

    return lastResult!;
  }

  /**
   * Get step execution requirements
   */
  getStepRequirements(step: WizardStep): string[] {
    return wizardStepValidator.getStepRequirements(step);
  }

  /**
   * Check if step can be executed
   */
  async canExecuteStep(session: WizardSession, step: WizardStep): Promise<boolean> {
    const validation = await wizardStepValidator.validateStep(session, step);
    return validation.canProceed;
  }

  // Private step execution methods
  private async executeChecklistStep(session: WizardSession): Promise<{ success: boolean; data: any; nextStep?: number }> {
    // Step 1: Pre-setup checklist
    // This is primarily UI-driven validation
    
    const data = {
      checklistCompleted: true,
      message: 'Pre-setup checklist completed successfully',
      requirements: [
        'Power OFF confirmation',
        'Physical connection verification',
        'Safety procedures followed'
      ],
      nextStepInstructions: 'Proceed to hardware detection'
    };

    return {
      success: true,
      data,
      nextStep: WizardStep.DETECTION
    };
  }

  private async executeDetectionStep(session: WizardSession): Promise<{ success: boolean; data: any; nextStep?: number }> {
    // Step 2: Hardware detection
    
    // Scan for available serial ports
    const serialPorts = await this.hardwareDetection.scanSerialPorts();
    
    if (serialPorts.length === 0) {
      throw new Error('No serial ports found. Please check USB-RS485 adapter connection.');
    }

    // Use previously selected port or first available
    const selectedPort = session.cardData.serialPort || serialPorts.find(p => p.available)?.path || serialPorts[0].path;
    
    // Validate selected port
    const portValid = await this.hardwareDetection.validateSerialPort(selectedPort);
    if (!portValid) {
      throw new Error(`Selected serial port is not accessible: ${selectedPort}`);
    }

    // Scan for Modbus devices on selected port
    const devices = await this.hardwareDetection.scanModbusDevices(
      selectedPort,
      { start: 1, end: 10 } // Scan first 10 addresses for new devices
    );

    if (devices.length === 0) {
      throw new Error('No Modbus devices detected. Please check hardware connections and power.');
    }

    // Select the first responding device (typically at address 1 for new cards)
    const detectedDevice = devices[0];
    
    // Try to identify device type and capabilities
    let deviceType = detectedDevice.type;
    let capabilities = detectedDevice.capabilities;

    try {
      if (!deviceType || deviceType.manufacturer === 'unknown') {
        deviceType = await this.hardwareDetection.identifyDeviceType(detectedDevice.address);
      }
      if (!capabilities) {
        capabilities = await this.hardwareDetection.getDeviceCapabilities(detectedDevice.address);
      }
    } catch (error) {
      console.warn('Could not fully identify device:', error);
      // Continue with basic detection info
    }

    const data = {
      deviceDetected: true,
      serialPort: selectedPort,
      detectedAddress: detectedDevice.address,
      deviceType,
      capabilities,
      responseTime: detectedDevice.responseTime,
      availablePorts: serialPorts,
      detectedDevices: devices,
      recommendations: this.generateDetectionRecommendations(devices, serialPorts)
    };

    return {
      success: true,
      data,
      nextStep: WizardStep.ADDRESS_CONFIG
    };
  }

  private async executeAddressConfigStep(session: WizardSession): Promise<{ success: boolean; data: any; nextStep?: number }> {
    // Step 3: Slave address configuration
    
    if (!session.cardData.detectedAddress) {
      throw new Error('No device detected for address configuration');
    }

    const currentAddress = session.cardData.detectedAddress;
    
    // Find next available address in the system
    const nextAddress = await this.slaveAddress.findNextAvailableAddress();
    
    if (nextAddress === currentAddress) {
      // Device is already at a good address, but verify it's not conflicting
      const conflicts = await this.slaveAddress.detectAddressConflicts();
      const hasConflict = conflicts.some(c => c.address === currentAddress);
      
      if (!hasConflict) {
        // No conflict, can use current address
        const data = {
          addressConfigured: true,
          oldAddress: currentAddress,
          newAddress: currentAddress,
          verified: true,
          message: 'Device is already at a suitable address',
          skippedConfiguration: true
        };

        return {
          success: true,
          data,
          nextStep: WizardStep.TESTING
        };
      }
    }

    // Configure new address using broadcast command
    const configSuccess = await this.slaveAddress.configureBroadcastAddress(nextAddress);
    
    if (!configSuccess) {
      throw new Error(`Failed to configure slave address to ${nextAddress}. Check device compatibility and connections.`);
    }

    // Wait a moment for device to process the change
    await this.delay(500);

    // Verify the address configuration
    const verified = await this.slaveAddress.verifyAddressConfiguration(nextAddress);
    
    if (!verified) {
      // Try to rollback to original address
      try {
        await this.slaveAddress.setSlaveAddress(nextAddress, currentAddress);
      } catch (rollbackError) {
        console.warn('Could not rollback address change:', rollbackError);
      }
      
      throw new Error(`Address configuration verification failed. Device may not be responding at new address ${nextAddress}.`);
    }

    const data = {
      addressConfigured: true,
      oldAddress: currentAddress,
      newAddress: nextAddress,
      verified: verified,
      configurationMethod: 'broadcast',
      verificationDelay: 500,
      message: `Successfully configured device address from ${currentAddress} to ${nextAddress}`
    };

    return {
      success: true,
      data,
      nextStep: WizardStep.TESTING
    };
  }

  private async executeTestingStep(session: WizardSession): Promise<{ success: boolean; data: any; nextStep?: number }> {
    // Step 4: Hardware testing
    
    if (!session.cardData.assignedAddress) {
      throw new Error('No assigned address available for testing');
    }

    const address = session.cardData.assignedAddress;
    
    // Run comprehensive hardware test suite
    const testSuite = await this.hardwareTesting.runFullHardwareTest(address);
    
    // Analyze test results
    const failedTests = testSuite.results.filter(t => !t.success);
    const criticalFailures = failedTests.filter(t => 
      t.testName.toLowerCase().includes('communication') || 
      t.testName.toLowerCase().includes('basic')
    );

    if (criticalFailures.length > 0) {
      throw new Error(`Critical hardware tests failed: ${criticalFailures.map(t => t.testName).join(', ')}`);
    }

    // Generate test summary and recommendations
    const testSummary = {
      totalTests: testSuite.totalTests,
      passedTests: testSuite.passedTests,
      failedTests: testSuite.failedTests,
      successRate: (testSuite.passedTests / testSuite.totalTests) * 100,
      duration: testSuite.duration,
      overallSuccess: testSuite.overallSuccess
    };

    const recommendations = this.generateTestingRecommendations(testSuite.results);

    const data = {
      allTestsPassed: testSuite.overallSuccess,
      testSuite,
      testSummary,
      failedTests,
      recommendations,
      message: testSuite.overallSuccess 
        ? 'All hardware tests passed successfully' 
        : `${failedTests.length} tests failed but device is functional`
    };

    return {
      success: testSuite.overallSuccess,
      data,
      nextStep: testSuite.overallSuccess ? WizardStep.INTEGRATION : undefined
    };
  }

  private async executeIntegrationStep(session: WizardSession): Promise<{ success: boolean; data: any; nextStep?: number }> {
    // Step 5: System integration preparation
    
    if (!session.cardData.assignedAddress || !session.cardData.testsPassed) {
      throw new Error('Prerequisites not met for integration: address configuration and testing must be completed');
    }

    // Prepare comprehensive relay card configuration
    const cardConfig: RelayCardConfig = {
      slave_address: session.cardData.assignedAddress,
      channels: session.cardData.capabilities?.maxRelays || 16,
      type: this.determineCardType(session.cardData.deviceType),
      description: this.generateCardDescription(session.cardData),
      enabled: true,
      installation_date: new Date(),
      wizard_configured: true,
      last_tested: new Date(),
      test_results: this.convertTestResultsToSuite(session.testResults, session.cardData.assignedAddress),
      firmware_version: session.cardData.capabilities?.firmwareVersion,
      capabilities: session.cardData.capabilities
    };

    // Calculate system impact
    const systemImpact = {
      newLockerCount: cardConfig.channels,
      newLockerRange: {
        start: this.calculateNextLockerStart(),
        end: this.calculateNextLockerStart() + cardConfig.channels - 1
      },
      totalSystemLockers: this.calculateTotalSystemLockers() + cardConfig.channels,
      layoutUpdate: this.calculateLayoutUpdate(cardConfig.channels)
    };

    const data = {
      integrationComplete: true,
      cardConfiguration: cardConfig,
      systemImpact,
      integrationSteps: [
        'Add relay card to system configuration',
        'Update total locker count',
        'Recalculate locker layout',
        'Restart hardware services',
        'Verify new lockers are accessible'
      ],
      message: 'Card configuration prepared and ready for system integration'
    };

    return {
      success: true,
      data,
      nextStep: undefined // Final step
    };
  }

  // Helper methods
  private isRecoverableError(error: any, step: WizardStep): boolean {
    if (!error) return false;
    
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    
    // Communication errors are often recoverable
    if (errorMessage.includes('timeout') || errorMessage.includes('connection')) {
      return true;
    }
    
    // Hardware detection issues might be temporary
    if (step === WizardStep.DETECTION && errorMessage.includes('no devices')) {
      return true;
    }
    
    // Address configuration might need retry
    if (step === WizardStep.ADDRESS_CONFIG && errorMessage.includes('verification failed')) {
      return true;
    }
    
    // Some test failures might be temporary
    if (step === WizardStep.TESTING && !errorMessage.includes('critical')) {
      return true;
    }
    
    return false;
  }

  private getSuggestedAction(error: any, step: WizardStep): string {
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    
    if (errorMessage.includes('no serial ports')) {
      return 'Check USB-RS485 adapter connection and drivers';
    }
    
    if (errorMessage.includes('no devices')) {
      return 'Verify hardware power and Modbus connections';
    }
    
    if (errorMessage.includes('timeout')) {
      return 'Check cable connections and try again';
    }
    
    if (errorMessage.includes('verification failed')) {
      return 'Retry address configuration or check device compatibility';
    }
    
    if (errorMessage.includes('test failed')) {
      return 'Check hardware connections and power supply';
    }
    
    return 'Review error details and check hardware connections';
  }

  private generateDetectionRecommendations(devices: any[], ports: any[]): string[] {
    const recommendations: string[] = [];
    
    if (devices.length === 0) {
      recommendations.push('No devices detected - check power and connections');
    } else if (devices.length > 1) {
      recommendations.push(`Multiple devices detected (${devices.length}) - ensure only new card is connected`);
    }
    
    if (ports.length > 1) {
      recommendations.push('Multiple serial ports available - select the correct USB-RS485 adapter');
    }
    
    const unknownDevices = devices.filter(d => d.type.manufacturer === 'unknown');
    if (unknownDevices.length > 0) {
      recommendations.push('Some devices could not be identified - they may still be compatible');
    }
    
    return recommendations;
  }

  private generateTestingRecommendations(testResults: TestResult[]): string[] {
    const recommendations: string[] = [];
    const failedTests = testResults.filter(t => !t.success);
    
    if (failedTests.length === 0) {
      recommendations.push('All tests passed - hardware is ready for integration');
      return recommendations;
    }
    
    const commFailures = failedTests.filter(t => t.testName.toLowerCase().includes('communication'));
    if (commFailures.length > 0) {
      recommendations.push('Communication issues detected - check connections and power');
    }
    
    const relayFailures = failedTests.filter(t => t.testName.toLowerCase().includes('relay'));
    if (relayFailures.length > 0) {
      recommendations.push(`${relayFailures.length} relay(s) failed testing - check individual relay connections`);
    }
    
    if (failedTests.length < testResults.length / 2) {
      recommendations.push('Most tests passed - device may still be usable with some limitations');
    }
    
    return recommendations;
  }

  private determineCardType(deviceType: any): string {
    if (!deviceType) return 'generic_modbus';
    
    if (deviceType.manufacturer === 'waveshare') {
      return `waveshare_${deviceType.channels}ch`;
    }
    
    return `${deviceType.manufacturer}_${deviceType.channels}ch`;
  }

  private generateCardDescription(cardData: any): string {
    const address = cardData.assignedAddress;
    const type = cardData.deviceType?.model || 'Unknown';
    const channels = cardData.capabilities?.maxRelays || 16;
    
    return `Wizard-configured ${type} (${channels} channels) at address ${address}`;
  }

  private convertTestResultsToSuite(testResults: TestResult[], address: number): any {
    return {
      address,
      totalTests: testResults.length,
      passedTests: testResults.filter(t => t.success).length,
      failedTests: testResults.filter(t => !t.success).length,
      results: testResults,
      overallSuccess: testResults.every(t => t.success),
      duration: testResults.reduce((sum, t) => sum + t.duration, 0)
    };
  }

  private calculateNextLockerStart(): number {
    // This would need to query the current system configuration
    // For now, return a placeholder
    return 17; // Assuming 16 existing lockers
  }

  private calculateTotalSystemLockers(): number {
    // This would need to query the current system configuration
    // For now, return a placeholder
    return 16; // Assuming 16 existing lockers
  }

  private calculateLayoutUpdate(newChannels: number): { rows: number; columns: number } {
    const totalLockers = this.calculateTotalSystemLockers() + newChannels;
    const rows = Math.ceil(Math.sqrt(totalLockers));
    const columns = Math.ceil(totalLockers / rows);
    return { rows, columns };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const wizardStepExecutor = new WizardStepExecutor();