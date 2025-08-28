/**
 * Maksisoft Integration API Routes
 * 
 * Provides REST API endpoints for Maksisoft member search functionality.
 * Includes rate limiting, error handling, and proper logging.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { searchMaksiByRFID, isMaksiEnabled } from '../services/maksi';
import { rateLimit } from '../middleware/rate-limit';

/**
 * Salt for RFID hashing in logs (to protect PII)
 */
const RFID_LOG_SALT = process.env.RFID_LOG_SALT || 'eform-locker-system';

/**
 * Hash RFID for logging purposes (no PII in logs)
 */
function hashRFID(rfid: string): string {
  return crypto
    .createHash('sha256')
    .update(RFID_LOG_SALT + rfid)
    .digest('hex')
    .slice(0, 12);
}

/**
 * Map internal error codes to HTTP status codes and user-friendly messages
 * 
 * Error codes are mapped to match client-side Turkish message expectations:
 * - network_error → "Bağlantı hatası" (Connection error)
 * - auth_error → "Kimlik doğrulama hatası" (Authentication error)  
 * - rate_limited → "Çok fazla istek" (Too many requests)
 */
function mapErrorToResponse(errorMessage: string): { status: number; error: string } {
  switch (errorMessage) {
    case 'network_timeout':
      return { status: 504, error: 'network_error' };
    case 'network_error':
      return { status: 502, error: 'network_error' };
    case 'invalid_response':
      return { status: 502, error: 'network_error' }; // Treat as network error for user
    case 'upstream_401':
    case 'upstream_403':
      return { status: 401, error: 'auth_error' };
    case 'rate_limited':
      return { status: 429, error: 'rate_limited' };
    case 'maksi_disabled':
      return { status: 404, error: 'disabled' };
    case 'maksi_not_configured':
      return { status: 503, error: 'network_error' }; // Treat as network error for user
    default:
      return { status: 500, error: 'network_error' }; // Default to network error for user
  }
}

/**
 * Request schema for RFID search
 */
const searchByRfidSchema = {
  querystring: {
    type: 'object',
    required: ['rfid'],
    properties: {
      rfid: {
        type: 'string',
        minLength: 1,
        maxLength: 50,
        pattern: '^[a-zA-Z0-9]+$'
      }
    }
  }
};

/**
 * Register Maksisoft API routes
 */
export async function registerMaksiRoutes(fastify: FastifyInstance): Promise<void> {
  // Register rate limiting middleware as a decorator
  fastify.decorate('rateLimitMaksi', rateLimit);
  
  // Extend FastifyInstance type to include our decorator
  interface FastifyInstanceWithMaksi extends FastifyInstance {
    rateLimitMaksi: typeof rateLimit;
  }
  
  const fastifyWithMaksi = fastify as FastifyInstanceWithMaksi;

  /**
   * GET /api/maksi/search-by-rfid
   * 
   * Search for member information by RFID card number
   * 
   * Query Parameters:
   * - rfid: RFID card number (required, alphanumeric, 1-50 chars)
   * 
   * Responses:
   * - 200: Success with member data
   * - 400: Invalid RFID parameter
   * - 401: Authentication error with Maksisoft
   * - 404: Feature disabled
   * - 429: Rate limit exceeded
   * - 502: Network/response error
   * - 504: Request timeout
   */
  fastifyWithMaksi.get('/api/maksi/search-by-rfid', {
    schema: searchByRfidSchema,
    preHandler: [fastifyWithMaksi.rateLimitMaksi]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Check if Maksisoft integration is enabled via MAKSI_ENABLED environment variable
    if (process.env.MAKSI_ENABLED !== 'true') {
      return reply.code(404).send({
        success: false,
        error: 'disabled'
      });
    }

    const query = request.query as { rfid: string };
    const rfid = query.rfid.trim();

    // Additional validation (schema already validates basic format)
    if (!rfid) {
      return reply.code(400).send({
        success: false,
        error: 'missing_rfid'
      });
    }

    const startTime = Date.now();
    const hashedRfid = hashRFID(rfid);

    try {
      // Search for member by RFID
      const result = await searchMaksiByRFID(rfid);
      const duration = Date.now() - startTime;

      // Log successful request (no PII)
      fastify.log.info({
        route: 'maksi_search',
        status: 200,
        duration_ms: duration,
        rfid_hash: hashedRfid,
        hits_count: result.hits.length
      });

      // Return success response
      return reply.send({
        success: true,
        hits: result.hits
      });

    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorResponse = mapErrorToResponse(error.message || 'unknown_error');

      // Log error (no PII)
      fastify.log.warn({
        route: 'maksi_search',
        status: errorResponse.status,
        error: errorResponse.error,
        duration_ms: duration,
        rfid_hash: hashedRfid
      });

      // Return error response
      return reply.code(errorResponse.status).send({
        success: false,
        error: errorResponse.error
      });
    }
  });

  /**
   * GET /api/maksi/status
   * 
   * Get Maksisoft integration status (for debugging/monitoring)
   */
  fastifyWithMaksi.get('/api/maksi/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const enabled = isMaksiEnabled();
    
    return reply.send({
      enabled,
      available: enabled
    });
  });
}