/**
 * Zone Validation Middleware for Kiosk Service
 * Provides reusable zone validation functions and consistent error responses
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { ConfigManager } from '../../../../shared/services/config-manager';
import { findZoneForLocker, validateZoneConfiguration } from '../../../../shared/services/zone-helpers';

/**
 * Generate a unique trace ID for error tracking
 */
export function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `trace-${timestamp}-${random}`;
}

/**
 * Standard error response format for zone validation
 */
export interface ZoneValidationError {
  success: false;
  error: string;
  error_code: string;
  trace_id: string;
  zone_context?: {
    requested_zone?: string;
    available_zones?: string[];
    locker_id?: number;
    actual_zone?: string;
  };
  timestamp: string;
}

/**
 * Zone validation middleware class
 */
export class ZoneValidationMiddleware {
  private configManager: ConfigManager;

  constructor() {
    this.configManager = ConfigManager.getInstance();
  }

  /**
   * Validate zone parameter in request query
   */
  async validateZoneParameter(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<{ valid: boolean; zoneId?: string; error?: ZoneValidationError }> {
    const { zone } = request.query as { zone?: string };
    const traceId = generateTraceId();

    // If no zone specified, validation passes (backward compatibility)
    if (!zone) {
      return { valid: true };
    }

    try {
      await this.configManager.initialize();
      const config = this.configManager.getConfiguration();

      // Check if zones are enabled
      if (!config.features?.zones_enabled || !config.zones) {
        const error: ZoneValidationError = {
          success: false,
          error: 'Zone functionality is not enabled on this system',
          error_code: 'ZONES_DISABLED',
          trace_id: traceId,
          timestamp: new Date().toISOString()
        };
        return { valid: false, error };
      }

      // Check if requested zone exists and is enabled
      const requestedZone = config.zones.find(z => z.id === zone && z.enabled);
      if (!requestedZone) {
        const availableZones = config.zones
          .filter(z => z.enabled)
          .map(z => z.id);

        const error: ZoneValidationError = {
          success: false,
          error: `Unknown or disabled zone: '${zone}'`,
          error_code: 'INVALID_ZONE',
          trace_id: traceId,
          zone_context: {
            requested_zone: zone,
            available_zones: availableZones
          },
          timestamp: new Date().toISOString()
        };
        return { valid: false, error };
      }

      // Validate zone configuration consistency
      const validation = validateZoneConfiguration(config);
      if (!validation.valid) {
        const error: ZoneValidationError = {
          success: false,
          error: `Zone configuration is invalid: ${validation.errors.join(', ')}`,
          error_code: 'ZONE_CONFIG_INVALID',
          trace_id: traceId,
          zone_context: {
            requested_zone: zone
          },
          timestamp: new Date().toISOString()
        };
        return { valid: false, error };
      }

      return { valid: true, zoneId: zone };

    } catch (error) {
      const validationError: ZoneValidationError = {
        success: false,
        error: `Zone validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error_code: 'ZONE_VALIDATION_ERROR',
        trace_id: traceId,
        zone_context: {
          requested_zone: zone
        },
        timestamp: new Date().toISOString()
      };
      return { valid: false, error: validationError };
    }
  }

  /**
   * Validate that a locker belongs to the specified zone
   */
  async validateLockerInZone(
    lockerId: number,
    zoneId?: string
  ): Promise<{ valid: boolean; error?: ZoneValidationError }> {
    const traceId = generateTraceId();

    // If no zone specified, validation passes (backward compatibility)
    if (!zoneId) {
      return { valid: true };
    }

    try {
      await this.configManager.initialize();
      const config = this.configManager.getConfiguration();

      // Find the actual zone for this locker
      const actualZone = findZoneForLocker(lockerId, config);
      
      if (!actualZone) {
        const error: ZoneValidationError = {
          success: false,
          error: `Locker ${lockerId} is not assigned to any zone`,
          error_code: 'LOCKER_NOT_IN_ZONE',
          trace_id: traceId,
          zone_context: {
            requested_zone: zoneId,
            locker_id: lockerId
          },
          timestamp: new Date().toISOString()
        };
        return { valid: false, error };
      }

      if (actualZone.id !== zoneId) {
        const error: ZoneValidationError = {
          success: false,
          error: `Locker ${lockerId} belongs to zone '${actualZone.id}', not '${zoneId}'`,
          error_code: 'LOCKER_ZONE_MISMATCH',
          trace_id: traceId,
          zone_context: {
            requested_zone: zoneId,
            locker_id: lockerId,
            actual_zone: actualZone.id
          },
          timestamp: new Date().toISOString()
        };
        return { valid: false, error };
      }

      return { valid: true };

    } catch (error) {
      const validationError: ZoneValidationError = {
        success: false,
        error: `Locker zone validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error_code: 'LOCKER_ZONE_VALIDATION_ERROR',
        trace_id: traceId,
        zone_context: {
          requested_zone: zoneId,
          locker_id: lockerId
        },
        timestamp: new Date().toISOString()
      };
      return { valid: false, error: validationError };
    }
  }

  /**
   * Create Fastify preHandler for zone parameter validation
   */
  createZoneParameterValidator() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const validation = await this.validateZoneParameter(request, reply);
      
      if (!validation.valid && validation.error) {
        // Log the validation error with zone context
        console.error('🚫 Zone parameter validation failed:', {
          trace_id: validation.error.trace_id,
          error_code: validation.error.error_code,
          zone_context: validation.error.zone_context,
          url: request.url,
          method: request.method
        });

        // Return appropriate HTTP status code
        const statusCode = validation.error.error_code === 'INVALID_ZONE' ? 400 : 422;
        return reply.status(statusCode).send(validation.error);
      }

      // Store validated zone ID in request context for use in handlers
      (request as any).validatedZone = validation.zoneId;
    };
  }

  /**
   * Create Fastify preHandler for locker-zone validation
   */
  createLockerZoneValidator() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const { locker_id } = request.body as { locker_id?: number };
      const { zone } = request.query as { zone?: string };

      if (!locker_id) {
        // Let the main handler deal with missing locker_id
        return;
      }

      const validation = await this.validateLockerInZone(locker_id, zone);
      
      if (!validation.valid && validation.error) {
        // Log the validation error with zone context
        console.error('🚫 Locker zone validation failed:', {
          trace_id: validation.error.trace_id,
          error_code: validation.error.error_code,
          zone_context: validation.error.zone_context,
          url: request.url,
          method: request.method
        });

        // Return 422 for zone mismatch errors
        return reply.status(422).send(validation.error);
      }
    };
  }

  /**
   * Log zone context for successful operations
   */
  logZoneContext(
    operation: string,
    zoneId?: string,
    lockerId?: number,
    additionalContext?: Record<string, any>
  ): void {
    if (zoneId || lockerId) {
      console.log(`🎯 Zone-aware operation: ${operation}`, {
        zone_id: zoneId || 'none',
        locker_id: lockerId,
        timestamp: new Date().toISOString(),
        ...additionalContext
      });
    }
  }
}

// Export singleton instance
export const zoneValidationMiddleware = new ZoneValidationMiddleware();