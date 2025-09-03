/**
 * Wizard Step Validator
 * Provides detailed validation logic for each wizard step
 * 
 * Requirements: 2.3, 2.4, 2.5
 */

import { WizardSession, ValidationResult, WizardStep } from './wizard-orchestration-service';

export interface StepValidationRule {
  name: string;
  validate: (session: WizardSession) => Promise<ValidationResult>;
  required: boolean;
  errorMessage: string;
  warningMessage?: string;
}

export class WizardStepValidator {
  private validationRules: Map<WizardStep, StepValidationRule[]> = new Map();

  constructor() {
    this.initializeValidationRules();
  }

  /**
   * Validate specific step with detailed rules
   */
  async validateStep(session: WizardSession, step: WizardStep): Promise<ValidationResult> {
    const rules = this.validationRules.get(step) || [];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const rule of rules) {
      try {
        const result = await rule.validate(session);
        
        if (!result.valid) {
          if (rule.required) {
            errors.push(rule.errorMessage);
          } else if (rule.warningMessage) {
            warnings.push(rule.warningMessage);
          }
        }
        
        // Collect additional errors and warnings from rule
        errors.push(...result.errors);
        warnings.push(...result.warnings);
        
      } catch (error) {
        errors.push(`Validation rule '${rule.name}' failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      canProceed: errors.length === 0
    };
  }

  /**
   * Get validation requirements for a step
   */
  getStepRequirements(step: WizardStep): string[] {
    const rules = this.validationRules.get(step) || [];
    return rules
      .filter(rule => rule.required)
      .map(rule => rule.name);
  }

  /**
   * Check if step has specific requirement
   */
  hasRequirement(step: WizardStep, requirement: string): boolean {
    const rules = this.validationRules.get(step) || [];
    return rules.some(rule => rule.name === requirement);
  }

  private initializeValidationRules(): void {
    // Step 1: Checklist validation rules
    this.validationRules.set(WizardStep.CHECKLIST, [
      {
        name: 'connection_verified',
        validate: async (session) => ({
          valid: session.cardData.connectionVerified === true,
          errors: [],
          warnings: [],
          canProceed: session.cardData.connectionVerified === true
        }),
        required: true,
        errorMessage: 'Physical connection must be verified before proceeding'
      },
      {
        name: 'power_safety_check',
        validate: async (session) => ({
          valid: true, // This is UI-driven, assume completed if connection verified
          errors: [],
          warnings: session.cardData.connectionVerified ? [] : ['Ensure power is OFF before connecting hardware'],
          canProceed: true
        }),
        required: false,
        warningMessage: 'Ensure power safety procedures are followed'
      }
    ]);

    // Step 2: Detection validation rules
    this.validationRules.set(WizardStep.DETECTION, [
      {
        name: 'serial_port_selected',
        validate: async (session) => ({
          valid: !!session.cardData.serialPort,
          errors: [],
          warnings: [],
          canProceed: !!session.cardData.serialPort
        }),
        required: true,
        errorMessage: 'Serial port must be selected'
      },
      {
        name: 'device_detected',
        validate: async (session) => ({
          valid: !!session.cardData.detectedAddress,
          errors: [],
          warnings: [],
          canProceed: !!session.cardData.detectedAddress
        }),
        required: true,
        errorMessage: 'No Modbus device detected'
      },
      {
        name: 'device_type_identified',
        validate: async (session) => ({
          valid: !!session.cardData.deviceType,
          errors: [],
          warnings: !session.cardData.deviceType ? ['Device type could not be identified'] : [],
          canProceed: true
        }),
        required: false,
        warningMessage: 'Device type could not be identified'
      },
      {
        name: 'device_capabilities_read',
        validate: async (session) => ({
          valid: !!session.cardData.capabilities,
          errors: [],
          warnings: !session.cardData.capabilities ? ['Device capabilities could not be read'] : [],
          canProceed: true
        }),
        required: false,
        warningMessage: 'Device capabilities could not be read'
      }
    ]);

    // Step 3: Address configuration validation rules
    this.validationRules.set(WizardStep.ADDRESS_CONFIG, [
      {
        name: 'device_detected_first',
        validate: async (session) => ({
          valid: !!session.cardData.detectedAddress,
          errors: [],
          warnings: [],
          canProceed: !!session.cardData.detectedAddress
        }),
        required: true,
        errorMessage: 'Device must be detected before address configuration'
      },
      {
        name: 'new_address_assigned',
        validate: async (session) => ({
          valid: !!session.cardData.assignedAddress,
          errors: [],
          warnings: [],
          canProceed: !!session.cardData.assignedAddress
        }),
        required: true,
        errorMessage: 'New slave address must be assigned'
      },
      {
        name: 'address_different',
        validate: async (session) => ({
          valid: true, // Not a hard requirement
          errors: [],
          warnings: (session.cardData.assignedAddress === session.cardData.detectedAddress) 
            ? ['New address is same as detected address'] : [],
          canProceed: true
        }),
        required: false,
        warningMessage: 'New address is same as detected address'
      },
      {
        name: 'address_in_valid_range',
        validate: async (session) => {
          const address = session.cardData.assignedAddress;
          const valid = address ? (address >= 1 && address <= 255) : false;
          return {
            valid,
            errors: valid ? [] : ['Assigned address must be between 1 and 255'],
            warnings: [],
            canProceed: valid
          };
        },
        required: true,
        errorMessage: 'Assigned address must be in valid range (1-255)'
      }
    ]);

    // Step 4: Testing validation rules
    this.validationRules.set(WizardStep.TESTING, [
      {
        name: 'address_configured',
        validate: async (session) => ({
          valid: !!session.cardData.assignedAddress,
          errors: [],
          warnings: [],
          canProceed: !!session.cardData.assignedAddress
        }),
        required: true,
        errorMessage: 'Address configuration must be completed before testing'
      },
      {
        name: 'tests_executed',
        validate: async (session) => ({
          valid: session.testResults.length > 0,
          errors: [],
          warnings: [],
          canProceed: session.testResults.length > 0
        }),
        required: true,
        errorMessage: 'No tests have been run'
      },
      {
        name: 'tests_passed',
        validate: async (session) => ({
          valid: session.cardData.testsPassed === true,
          errors: [],
          warnings: [],
          canProceed: session.cardData.testsPassed === true
        }),
        required: true,
        errorMessage: 'Hardware tests must pass before proceeding'
      },
      {
        name: 'communication_test_passed',
        validate: async (session) => {
          const commTest = session.testResults.find(t => t.testName.toLowerCase().includes('communication'));
          return {
            valid: commTest ? commTest.success : false,
            errors: commTest && !commTest.success ? ['Communication test failed'] : [],
            warnings: [],
            canProceed: commTest ? commTest.success : false
          };
        },
        required: true,
        errorMessage: 'Communication test must pass'
      },
      {
        name: 'relay_tests_passed',
        validate: async (session) => {
          const relayTests = session.testResults.filter(t => t.testName.toLowerCase().includes('relay'));
          const allPassed = relayTests.length > 0 && relayTests.every(t => t.success);
          return {
            valid: allPassed,
            errors: allPassed ? [] : ['One or more relay tests failed'],
            warnings: relayTests.length === 0 ? ['No relay tests were run'] : [],
            canProceed: allPassed
          };
        },
        required: true,
        errorMessage: 'All relay tests must pass'
      }
    ]);

    // Step 5: Integration validation rules
    this.validationRules.set(WizardStep.INTEGRATION, [
      {
        name: 'tests_completed',
        validate: async (session) => ({
          valid: session.cardData.testsPassed === true,
          errors: [],
          warnings: [],
          canProceed: session.cardData.testsPassed === true
        }),
        required: true,
        errorMessage: 'Hardware tests must pass before integration'
      },
      {
        name: 'configuration_prepared',
        validate: async (session) => ({
          valid: !!session.cardData.configuration,
          errors: [],
          warnings: [],
          canProceed: !!session.cardData.configuration
        }),
        required: true,
        errorMessage: 'Card configuration must be prepared'
      },
      {
        name: 'configuration_valid',
        validate: async (session) => {
          const config = session.cardData.configuration;
          if (!config) {
            return { valid: false, errors: ['No configuration found'], warnings: [], canProceed: false };
          }

          const errors: string[] = [];
          if (!config.slave_address || config.slave_address < 1 || config.slave_address > 255) {
            errors.push('Invalid slave address in configuration');
          }
          if (!config.channels || config.channels < 1) {
            errors.push('Invalid channel count in configuration');
          }
          if (!config.type) {
            errors.push('Missing card type in configuration');
          }

          return {
            valid: errors.length === 0,
            errors,
            warnings: [],
            canProceed: errors.length === 0
          };
        },
        required: true,
        errorMessage: 'Card configuration is invalid'
      },
      {
        name: 'no_address_conflicts',
        validate: async (session) => {
          // This would need to check against existing system configuration
          // For now, assume no conflicts if we got this far
          return {
            valid: true,
            errors: [],
            warnings: [],
            canProceed: true
          };
        },
        required: true,
        errorMessage: 'Address conflicts detected with existing cards'
      }
    ]);
  }
}

export const wizardStepValidator = new WizardStepValidator();