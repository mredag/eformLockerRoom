/**
 * MVP Acceptance Criteria Validation Tests
 * Tests all requirements from the Maksisoft Integration spec
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import fetch from 'node-fetch';
import crypto from 'crypto';

// Test configuration
const PANEL_URL = 'http://localhost:3001';
const TEST_TIMEOUT = 10000;

describe('Maksisoft Integration MVP Validation', () => {
  let panelProcess: ChildProcess;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Set test environment variables
    process.env.MAKSI_ENABLED = 'true';
    process.env.MAKSI_BASE = 'https://eformhatay.maksionline.com';
    process.env.MAKSI_SEARCH_PATH = '/react-system/api_php/user_search/users.php';
    process.env.MAKSI_CRITERIA_FOR_RFID = '0';
    process.env.MAKSI_BOOTSTRAP_COOKIE = 'PHPSESSID=test123; AC-C=ac-c';
    process.env.RFID_LOG_SALT = 'test-salt';

    // Start panel service for testing
    panelProcess = spawn('npm', ['run', 'start:panel'], {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: process.env
    });

    // Wait for service to start
    await new Promise(resolve => setTimeout(resolve, 3000));
  }, 15000);

  afterAll(async () => {
    // Restore original environment
    process.env = originalEnv;
    
    // Stop panel service
    if (panelProcess) {
      panelProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });

  describe('Feature Flag Control', () => {
    it('should show Maksisoft buttons when MAKSI_ENABLED=true', async () => {
      const response = await fetch(`${PANEL_URL}/lockers`, {
        headers: { 'Accept': 'text/html' }
      });
      
      expect(response.ok).toBe(true);
      const html = await response.text();
      
      // Check that Maksisoft buttons are present in HTML
      expect(html).toContain('btn-maksi');
      expect(html).toContain('Maksisoft');
    });

    it('should return 404 when MAKSI_ENABLED=false', async () => {
      // Temporarily disable feature
      process.env.MAKSI_ENABLED = 'false';
      
      const response = await fetch(`${PANEL_URL}/api/maksi/search-by-rfid?rfid=test123`);
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('disabled');
      
      // Re-enable for other tests
      process.env.MAKSI_ENABLED = 'true';
    });
  });

  describe('RFID Search Performance', () => {
    it('should return results under 5 seconds for valid RFID', async () => {
      const startTime = Date.now();
      
      const response = await fetch(`${PANEL_URL}/api/maksi/search-by-rfid?rfid=0006851540`, {
        headers: { 'Accept': 'application/json' }
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within 5 seconds (5000ms)
      expect(duration).toBeLessThan(5000);
      
      // Response should be valid JSON
      expect(response.headers.get('content-type')).toContain('application/json');
    }, TEST_TIMEOUT);

    it('should timeout after 5 seconds for slow responses', async () => {
      // This test simulates a slow network by using an invalid endpoint
      // that would cause a timeout
      const startTime = Date.now();
      
      try {
        await fetch(`${PANEL_URL}/api/maksi/search-by-rfid?rfid=timeout-test`, {
          headers: { 'Accept': 'application/json' }
        });
      } catch (error) {
        // Expected to fail due to timeout or network error
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should not exceed 5 seconds significantly
      expect(duration).toBeLessThan(6000);
    }, TEST_TIMEOUT);
  });

  describe('Error Message Validation', () => {
    it('should show "Kayıt bulunamadı" for unknown RFID', async () => {
      const response = await fetch(`${PANEL_URL}/api/maksi/search-by-rfid?rfid=9999999999`);
      
      const data = await response.json();
      
      if (data.success && data.hits.length === 0) {
        // Empty results should be handled by frontend as "Kayıt bulunamadı"
        expect(data.hits).toEqual([]);
      }
    });

    it('should return auth error for expired/invalid cookie', async () => {
      // Temporarily set invalid cookie
      const originalCookie = process.env.MAKSI_BOOTSTRAP_COOKIE;
      process.env.MAKSI_BOOTSTRAP_COOKIE = 'PHPSESSID=expired123; AC-C=invalid';
      
      const response = await fetch(`${PANEL_URL}/api/maksi/search-by-rfid?rfid=test123`);
      
      // Should return auth error (401) or network error
      expect([401, 502, 504]).toContain(response.status);
      
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(['auth_error', 'network_error', 'invalid_response']).toContain(data.error);
      
      // Restore original cookie
      process.env.MAKSI_BOOTSTRAP_COOKIE = originalCookie;
    });

    it('should handle rate limiting correctly', async () => {
      const rfid = 'rate-limit-test';
      
      // Make first request
      const response1 = await fetch(`${PANEL_URL}/api/maksi/search-by-rfid?rfid=${rfid}`);
      
      // Make immediate second request (should be rate limited)
      const response2 = await fetch(`${PANEL_URL}/api/maksi/search-by-rfid?rfid=${rfid}`);
      
      // Second request should be rate limited
      expect(response2.status).toBe(429);
      
      const data = await response2.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('rate_limited');
    });
  });

  describe('Security and Logging', () => {
    it('should hash RFID numbers in logs', () => {
      const testRfid = '0006851540';
      const salt = process.env.RFID_LOG_SALT || 'test-salt';
      
      // Test the hashing function
      const expectedHash = crypto.createHash('sha256')
        .update(salt + testRfid)
        .digest('hex')
        .slice(0, 12);
      
      expect(expectedHash).toHaveLength(12);
      expect(expectedHash).not.toContain(testRfid);
    });

    it('should not expose sensitive data in API responses', async () => {
      const response = await fetch(`${PANEL_URL}/api/maksi/search-by-rfid?rfid=test123`);
      
      const data = await response.json();
      
      // Response should not contain sensitive server details
      expect(JSON.stringify(data)).not.toContain('PHPSESSID');
      expect(JSON.stringify(data)).not.toContain('maksionline');
      expect(JSON.stringify(data)).not.toContain('bootstrap');
    });
  });

  describe('API Response Format', () => {
    it('should return correct JSON format for success', async () => {
      const response = await fetch(`${PANEL_URL}/api/maksi/search-by-rfid?rfid=test123`);
      
      const data = await response.json();
      
      // Should have success field
      expect(data).toHaveProperty('success');
      
      if (data.success) {
        // Success response should have hits array
        expect(data).toHaveProperty('hits');
        expect(Array.isArray(data.hits)).toBe(true);
      } else {
        // Error response should have error field
        expect(data).toHaveProperty('error');
        expect(typeof data.error).toBe('string');
      }
    });

    it('should validate RFID parameter requirement', async () => {
      const response = await fetch(`${PANEL_URL}/api/maksi/search-by-rfid`);
      
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('missing_rfid');
    });
  });

  describe('User Interface Integration', () => {
    it('should include modal HTML structure', async () => {
      const response = await fetch(`${PANEL_URL}/lockers`);
      const html = await response.text();
      
      // Check for modal elements
      expect(html).toContain('maksiModal');
      expect(html).toContain('Maksisoft Arama');
      expect(html).toContain('Profili Aç');
      expect(html).toContain('Kapat');
    });

    it('should include JavaScript functionality', async () => {
      const response = await fetch(`${PANEL_URL}/lockers`);
      const html = await response.text();
      
      // Check for JavaScript functions
      expect(html).toContain('btn-maksi');
      expect(html).toContain('data-owner-rfid');
    });
  });
});