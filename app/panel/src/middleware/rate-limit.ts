/**
 * Rate Limiting Middleware for Maksisoft Integration
 * 
 * Implements simple in-memory rate limiting to prevent abuse of the Maksisoft API.
 * Limits requests to 1 per second per IP+RFID combination.
 * 
 * Features:
 * - In-memory tracking with automatic cleanup
 * - IP + RFID combination for granular control
 * - Configurable rate limit (default: 1 request per second)
 * - Automatic cleanup of old entries to prevent memory leaks
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Rate limit tracking entry
 */
interface RateLimitEntry {
  /** Timestamp of last request */
  lastRequest: number;
  /** Number of requests in current window */
  count: number;
}

/**
 * In-memory store for rate limit tracking
 * Key format: "IP:RFID"
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Rate limit configuration
 */
const RATE_LIMIT_CONFIG = {
  /** Maximum requests per window */
  maxRequests: 1,
  /** Window duration in milliseconds (1 second) */
  windowMs: 1000,
  /** Cleanup interval in milliseconds (1 minute) */
  cleanupIntervalMs: 60000,
  /** Entry expiry time in milliseconds (5 minutes) */
  entryExpiryMs: 5 * 60 * 1000
};

/**
 * Cleanup old rate limit entries to prevent memory leaks
 */
function cleanupOldEntries(): void {
  const now = Date.now();
  const expiredKeys: string[] = [];
  
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.lastRequest > RATE_LIMIT_CONFIG.entryExpiryMs) {
      expiredKeys.push(key);
    }
  }
  
  for (const key of expiredKeys) {
    rateLimitStore.delete(key);
  }
}

/**
 * Start periodic cleanup of old entries
 */
let cleanupInterval: NodeJS.Timeout | null = null;

function startCleanupTimer(): void {
  if (cleanupInterval) return;
  
  cleanupInterval = setInterval(() => {
    cleanupOldEntries();
  }, RATE_LIMIT_CONFIG.cleanupIntervalMs);
}

/**
 * Stop periodic cleanup (for testing/shutdown)
 */
export function stopCleanupTimer(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Clear all rate limit entries (for testing)
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

/**
 * Get client IP address from request
 */
function getClientIP(request: FastifyRequest): string {
  // Check various headers for real IP
  const forwarded = request.headers['x-forwarded-for'];
  const realIP = request.headers['x-real-ip'];
  
  if (typeof forwarded === 'string') {
    // X-Forwarded-For can contain multiple IPs, take the first one
    return forwarded.split(',')[0].trim();
  }
  
  if (typeof realIP === 'string') {
    return realIP.trim();
  }
  
  // Fallback to connection remote address
  return request.ip || request.socket?.remoteAddress || '0.0.0.0';
}

/**
 * Extract RFID from request (query or body)
 */
function getRFIDFromRequest(request: FastifyRequest): string {
  const query = request.query as any;
  const body = request.body as any;
  
  const rfid = query?.rfid || body?.rfid || '';
  return typeof rfid === 'string' ? rfid.trim() : '';
}

/**
 * Rate limiting middleware for Maksisoft API requests
 * 
 * @param request Fastify request object
 * @param reply Fastify reply object
 * @param next Next function to call if rate limit not exceeded
 */
export function rateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  next: () => void
): void {
  // Start cleanup timer on first use
  startCleanupTimer();
  
  const clientIP = getClientIP(request);
  const rfid = getRFIDFromRequest(request);
  
  // Create unique key for this IP+RFID combination
  const rateLimitKey = `${clientIP}:${rfid}`;
  
  const now = Date.now();
  const existingEntry = rateLimitStore.get(rateLimitKey);
  
  if (existingEntry) {
    const timeSinceLastRequest = now - existingEntry.lastRequest;
    
    // If within rate limit window, check if limit exceeded
    if (timeSinceLastRequest < RATE_LIMIT_CONFIG.windowMs) {
      if (existingEntry.count >= RATE_LIMIT_CONFIG.maxRequests) {
        // Rate limit exceeded
        reply.code(429).send({
          success: false,
          error: 'rate_limited'
        });
        return;
      }
      
      // Increment count within window
      existingEntry.count++;
      existingEntry.lastRequest = now;
    } else {
      // Window expired, reset count
      existingEntry.count = 1;
      existingEntry.lastRequest = now;
    }
  } else {
    // First request for this IP+RFID combination
    rateLimitStore.set(rateLimitKey, {
      lastRequest: now,
      count: 1
    });
  }
  
  // Rate limit not exceeded, continue
  next();
}

/**
 * Get current rate limit statistics (for monitoring/debugging)
 */
export function getRateLimitStats(): {
  totalEntries: number;
  oldestEntry: number | null;
  newestEntry: number | null;
} {
  const entries = Array.from(rateLimitStore.values());
  
  if (entries.length === 0) {
    return {
      totalEntries: 0,
      oldestEntry: null,
      newestEntry: null
    };
  }
  
  const timestamps = entries.map(entry => entry.lastRequest);
  
  return {
    totalEntries: entries.length,
    oldestEntry: Math.min(...timestamps),
    newestEntry: Math.max(...timestamps)
  };
}