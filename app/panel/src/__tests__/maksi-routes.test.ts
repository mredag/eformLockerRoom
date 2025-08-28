/**
 * Tests for Maksisoft API Routes
 * 
 * Verifies the API endpoint behavior, error handling, and response formats.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import { registerMaksiRoutes } from '../routes/maksi-routes';
import { clearRateLimitStore, stopCleanupTimer } from '../middleware/rate-limit';

describe('Maksisoft API Routes', () => {
  let fastify: any;

  beforeEach(async () => {
    // Clear rate limit store before each test
    clearRateLimitStore();
    
    // Create fresh Fastify instance
    fastify = Fastify({ logger: false });
    
    // Register Maksisoft routes
    await registerMaksiRoutes(fastify);
    
    await fastify.ready();
  });

  afterEach(async () => {
    if (fastify) {
      await fastify.close();
    }
    stopCleanupTimer();
  });

  describe('GET /api/maksi/search-by-rfid', () => {
    it('should return 404 when Maksisoft is disabled', async () => {
      // Temporarily disable Maksisoft
      const originalEnabled = process.env.MAKSI_ENABLED;
      process.env.MAKSI_ENABLED = 'false';

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/maksi/search-by-rfid?rfid=1234567890'
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.payload)).toEqual({
        success: false,
        error: 'disabled'
      });

      // Restore original value
      process.env.MAKSI_ENABLED = originalEnabled;
    });

    it('should return 400 for missing RFID parameter', async () => {
      process.env.MAKSI_ENABLED = 'true';

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/maksi/search-by-rfid'
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for empty RFID parameter', async () => {
      process.env.MAKSI_ENABLED = 'true';

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/maksi/search-by-rfid?rfid='
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid RFID format', async () => {
      process.env.MAKSI_ENABLED = 'true';

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/maksi/search-by-rfid?rfid=invalid-rfid-with-special-chars!'
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle rate limiting', async () => {
      process.env.MAKSI_ENABLED = 'true';
      process.env.MAKSI_BASE = 'https://example.com';
      process.env.MAKSI_SEARCH_PATH = '/api/search';

      // Make first request
      const response1 = await fastify.inject({
        method: 'GET',
        url: '/api/maksi/search-by-rfid?rfid=1234567890',
        headers: {
          'x-forwarded-for': '192.168.1.100'
        }
      });

      // Make second request immediately (should be rate limited)
      const response2 = await fastify.inject({
        method: 'GET',
        url: '/api/maksi/search-by-rfid?rfid=1234567890',
        headers: {
          'x-forwarded-for': '192.168.1.100'
        }
      });

      expect(response2.statusCode).toBe(429);
      expect(JSON.parse(response2.payload)).toEqual({
        success: false,
        error: 'rate_limited'
      });
    });
  });

  describe('GET /api/maksi/status', () => {
    it('should return status when enabled', async () => {
      process.env.MAKSI_ENABLED = 'true';

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/maksi/status'
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        enabled: true,
        available: true
      });
    });

    it('should return status when disabled', async () => {
      const originalEnabled = process.env.MAKSI_ENABLED;
      process.env.MAKSI_ENABLED = 'false';

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/maksi/status'
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        enabled: false,
        available: false
      });

      // Restore original value
      process.env.MAKSI_ENABLED = originalEnabled;
    });
  });
});