import { WizardOperation } from './wizard-security-service';

export interface ValidationRule {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
  custom?: (value: any) => boolean | string;
}

export interface ValidationSchema {
  [key: string]: ValidationRule;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedData: any;
}

export class WizardInputValidator {
  private static readonly OPERATION_SCHEMAS: Record<WizardOperation, ValidationSchema> = {
    [WizardOperation.SCAN_PORTS]: {},
    
    [WizardOperation.SCAN_DEVICES]: {
      port: {
        required: true,
        type: 'string',
        pattern: /^\/dev\/tty[A-Z0-9]+$|^COM\d+$/,
        maxLength: 50
      },
      startAddress: {
        type: 'number',
        min: 1,
        max: 255
      },
      endAddress: {
        type: 'number',
        min: 1,
        max: 255
      },
      timeout: {
        type: 'number',
        min: 100,
        max: 10000
      }
    },

    [WizardOperation.DETECT_NEW_CARDS]: {
      knownDevices: {
        type: 'array'
      }
    },

    [WizardOperation.SET_SLAVE_ADDRESS]: {
      currentAddress: {
        required: true,
        type: 'number',
        min: 0,
        max: 255
      },
      newAddress: {
        required: true,
        type: 'number',
        min: 1,
        max: 255
      },
      port: {
        required: true,
        type: 'string',
        pattern: /^\/dev\/tty[A-Z0-9]+$|^COM\d+$/,
        maxLength: 50
      }
    },

    [WizardOperation.READ_SLAVE_ADDRESS]: {
      address: {
        required: true,
        type: 'number',
        min: 1,
        max: 255
      },
      port: {
        required: true,
        type: 'string',
        pattern: /^\/dev\/tty[A-Z0-9]+$|^COM\d+$/,
        maxLength: 50
      }
    },

    [WizardOperation.TEST_CARD]: {
      address: {
        required: true,
        type: 'number',
        min: 1,
        max: 255
      },
      port: {
        required: true,
        type: 'string',
        pattern: /^\/dev\/tty[A-Z0-9]+$|^COM\d+$/,
        maxLength: 50
      },
      testType: {
        type: 'string',
        enum: ['communication', 'relay', 'full']
      }
    },

    [WizardOperation.TEST_RELAY]: {
      address: {
        required: true,
        type: 'number',
        min: 1,
        max: 255
      },
      relay: {
        required: true,
        type: 'number',
        min: 1,
        max: 16
      },
      port: {
        required: true,
        type: 'string',
        pattern: /^\/dev\/tty[A-Z0-9]+$|^COM\d+$/,
        maxLength: 50
      },
      duration: {
        type: 'number',
        min: 100,
        max: 5000
      }
    },

    [WizardOperation.VALIDATE_SETUP]: {
      sessionId: {
        required: true,
        type: 'string',
        pattern: /^[a-f0-9-]{36}$/,
        maxLength: 36
      }
    },

    [WizardOperation.CREATE_WIZARD_SESSION]: {
      kioskId: {
        type: 'string',
        maxLength: 50,
        pattern: /^[a-zA-Z0-9_-]+$/
      }
    },

    [WizardOperation.UPDATE_WIZARD_SESSION]: {
      sessionId: {
        required: true,
        type: 'string',
        pattern: /^[a-f0-9-]{36}$/,
        maxLength: 36
      },
      updates: {
        required: true,
        type: 'object'
      }
    },

    [WizardOperation.FINALIZE_WIZARD]: {
      sessionId: {
        required: true,
        type: 'string',
        pattern: /^[a-f0-9-]{36}$/,
        maxLength: 36
      },
      configuration: {
        required: true,
        type: 'object'
      }
    },

    [WizardOperation.MANUAL_CONFIGURATION]: {
      address: {
        required: true,
        type: 'number',
        min: 1,
        max: 255
      },
      register: {
        required: true,
        type: 'number',
        min: 0,
        max: 65535
      },
      value: {
        required: true,
        type: 'number',
        min: 0,
        max: 65535
      },
      functionCode: {
        type: 'number',
        enum: [3, 4, 5, 6, 15, 16]
      }
    },

    [WizardOperation.BULK_CONFIGURATION]: {
      startAddress: {
        required: true,
        type: 'number',
        min: 1,
        max: 255
      },
      count: {
        required: true,
        type: 'number',
        min: 1,
        max: 50
      },
      configuration: {
        required: true,
        type: 'object'
      }
    },

    [WizardOperation.EXPORT_CONFIGURATION]: {
      format: {
        type: 'string',
        enum: ['json', 'yaml', 'xml']
      },
      includeSecrets: {
        type: 'boolean'
      }
    },

    [WizardOperation.IMPORT_CONFIGURATION]: {
      configuration: {
        required: true,
        type: 'object'
      },
      validate: {
        type: 'boolean'
      },
      merge: {
        type: 'boolean'
      }
    }
  };

  /**
   * Validate input data for a specific operation
   */
  static validateInput(operation: WizardOperation, data: any): ValidationResult {
    const schema = this.OPERATION_SCHEMAS[operation];
    if (!schema) {
      return {
        valid: true,
        errors: [],
        sanitizedData: data
      };
    }

    const errors: string[] = [];
    const sanitizedData: any = {};

    // Validate each field in the schema
    for (const [fieldName, rule] of Object.entries(schema)) {
      const value = data[fieldName];
      const fieldResult = this.validateField(fieldName, value, rule);
      
      if (!fieldResult.valid) {
        errors.push(...fieldResult.errors);
      } else {
        sanitizedData[fieldName] = fieldResult.sanitizedValue;
      }
    }

    // Check for unexpected fields
    for (const fieldName of Object.keys(data)) {
      if (!schema[fieldName]) {
        errors.push(`Unexpected field: ${fieldName}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitizedData
    };
  }

  /**
   * Validate a single field
   */
  private static validateField(fieldName: string, value: any, rule: ValidationRule): {
    valid: boolean;
    errors: string[];
    sanitizedValue: any;
  } {
    const errors: string[] = [];
    let sanitizedValue = value;

    // Check required
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push(`Field ${fieldName} is required`);
      return { valid: false, errors, sanitizedValue: null };
    }

    // Skip further validation if value is not provided and not required
    if (value === undefined || value === null) {
      return { valid: true, errors: [], sanitizedValue: null };
    }

    // Type validation and sanitization
    if (rule.type) {
      const typeResult = this.validateType(fieldName, value, rule.type);
      if (!typeResult.valid) {
        errors.push(...typeResult.errors);
      } else {
        sanitizedValue = typeResult.sanitizedValue;
      }
    }

    // String validations
    if (rule.type === 'string' && typeof sanitizedValue === 'string') {
      // Sanitize string (remove dangerous characters)
      sanitizedValue = this.sanitizeString(sanitizedValue);

      if (rule.minLength && sanitizedValue.length < rule.minLength) {
        errors.push(`Field ${fieldName} must be at least ${rule.minLength} characters long`);
      }
      if (rule.maxLength && sanitizedValue.length > rule.maxLength) {
        errors.push(`Field ${fieldName} must be at most ${rule.maxLength} characters long`);
      }
      if (rule.pattern && !rule.pattern.test(sanitizedValue)) {
        errors.push(`Field ${fieldName} format is invalid`);
      }
    }

    // Number validations
    if (rule.type === 'number' && typeof sanitizedValue === 'number') {
      if (rule.min !== undefined && sanitizedValue < rule.min) {
        errors.push(`Field ${fieldName} must be at least ${rule.min}`);
      }
      if (rule.max !== undefined && sanitizedValue > rule.max) {
        errors.push(`Field ${fieldName} must be at most ${rule.max}`);
      }
    }

    // Enum validation
    if (rule.enum && !rule.enum.includes(sanitizedValue)) {
      errors.push(`Field ${fieldName} must be one of: ${rule.enum.join(', ')}`);
    }

    // Custom validation
    if (rule.custom) {
      const customResult = rule.custom(sanitizedValue);
      if (customResult !== true) {
        errors.push(typeof customResult === 'string' ? customResult : `Field ${fieldName} failed custom validation`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitizedValue
    };
  }

  /**
   * Validate and convert type
   */
  private static validateType(fieldName: string, value: any, expectedType: string): {
    valid: boolean;
    errors: string[];
    sanitizedValue: any;
  } {
    const errors: string[] = [];
    let sanitizedValue = value;

    switch (expectedType) {
      case 'string':
        if (typeof value !== 'string') {
          // Try to convert to string
          sanitizedValue = String(value);
        }
        break;

      case 'number':
        if (typeof value === 'string') {
          const parsed = parseFloat(value);
          if (isNaN(parsed)) {
            errors.push(`Field ${fieldName} must be a valid number`);
          } else {
            sanitizedValue = parsed;
          }
        } else if (typeof value !== 'number') {
          errors.push(`Field ${fieldName} must be a number`);
        }
        break;

      case 'boolean':
        if (typeof value === 'string') {
          if (value.toLowerCase() === 'true') {
            sanitizedValue = true;
          } else if (value.toLowerCase() === 'false') {
            sanitizedValue = false;
          } else {
            errors.push(`Field ${fieldName} must be a boolean`);
          }
        } else if (typeof value !== 'boolean') {
          errors.push(`Field ${fieldName} must be a boolean`);
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`Field ${fieldName} must be an array`);
        }
        break;

      case 'object':
        if (typeof value !== 'object' || Array.isArray(value) || value === null) {
          errors.push(`Field ${fieldName} must be an object`);
        }
        break;

      default:
        errors.push(`Unknown type: ${expectedType}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitizedValue
    };
  }

  /**
   * Sanitize string input to prevent injection attacks
   */
  private static sanitizeString(input: string): string {
    // Remove null bytes
    let sanitized = input.replace(/\0/g, '');
    
    // Remove control characters except newline, carriage return, and tab
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Limit length to prevent DoS
    if (sanitized.length > 10000) {
      sanitized = sanitized.substring(0, 10000);
    }
    
    return sanitized;
  }

  /**
   * Sanitize object recursively
   */
  static sanitizeObject(obj: any, maxDepth: number = 10): any {
    if (maxDepth <= 0) {
      return null; // Prevent deep recursion
    }

    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item, maxDepth - 1));
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = this.sanitizeString(key);
        if (sanitizedKey.length > 0) {
          sanitized[sanitizedKey] = this.sanitizeObject(value, maxDepth - 1);
        }
      }
      return sanitized;
    }

    return obj;
  }

  /**
   * Validate hardware address
   */
  static validateHardwareAddress(address: number): boolean {
    return Number.isInteger(address) && address >= 1 && address <= 255;
  }

  /**
   * Validate serial port path
   */
  static validateSerialPort(port: string): boolean {
    // Unix/Linux serial ports
    if (/^\/dev\/tty[A-Z0-9]+$/.test(port)) {
      return true;
    }
    
    // Windows COM ports
    if (/^COM\d+$/.test(port)) {
      return true;
    }
    
    return false;
  }

  /**
   * Validate UUID format
   */
  static validateUUID(uuid: string): boolean {
    return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(uuid);
  }

  /**
   * Validate IP address
   */
  static validateIPAddress(ip: string): boolean {
    // IPv4
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (ipv4Regex.test(ip)) {
      return true;
    }
    
    // IPv6 (basic validation)
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    if (ipv6Regex.test(ip)) {
      return true;
    }
    
    return false;
  }
}