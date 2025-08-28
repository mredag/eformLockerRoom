/**
 * Unit Tests for Maksisoft Service
 * 
 * Tests the service happy path and timeout scenarios to ensure
 * proper API communication and error handling.
 * 
 * Requirements: Core functionality validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { searchMaksiByRFID, isMaksiEnabled, getMaksiStatus } from '../services/maksi';
import type { MaksiHit } from '../services/maksi-types';

// Mock fetch globally
global.fetch = vi.fn();

describe('Maksisoft Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    
    // Reset environment variables
    process.env = {
      ...originalEnv,
      MAKSI_ENABLED: 'true',
      MAKSI_BASE: 'https://example.com',
      MAKSI_SEARCH_PATH: '/api/search',
      MAKSI_CRITERIA_FOR_RFID: '0',
      MAKSI_BOOTSTRAP_COOKIE: 'PHPSESSID=test123; AC-C=ac-c'
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
  });

  describe('searchMaksiByRFID - Happy Path', () => {
    it('should successfully search and return mapped results', async () => {
      const mockHits: MaksiHit[] = [
        {
          id: 1026,
          name: 'Test User',
          phone: '0532123456',
          type: 1,
          sex: 'Bay',
          gsm: '0506789012',
          photo: 'test.jpg',
          checkListDate: '2024-01-15 10:30',
          checkListStatus: 'in',
          endDate: '2024-12-31',
          proximity: '0006851540',
          tc: '1234567****'
        }
      ];

      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        json: vi.fn().mockResolvedValue(mockHits)
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await searchMaksiByRFID('0006851540');

      expect(result.hits).toHaveLength(1);
      expect(result.hits[0]).toEqual({
        id: 1026,
        fullName: 'Test User',
        phone: '0532123456',
        rfid: '0006851540',
        gender: 'Bay',
        membershipType: 1,
        membershipEndsAt: '2024-12-31',
        lastCheckAt: '2024-01-15 10:30',
        lastCheckStatus: 'in',
        tcMasked: '1234567****',
        photoFile: 'test.jpg'
      });

      // Verify fetch was called with correct parameters
      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/api/search?text=0006851540&criteria=0',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Accept': 'application/json',
            'Cookie': 'PHPSESSID=test123; AC-C=ac-c'
          }),
          redirect: 'manual'
        })
      );
    });

    it('should handle empty results array', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        json: vi.fn().mockResolvedValue([])
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await searchMaksiByRFID('9999999999');

      expect(result.hits).toHaveLength(0);
      expect(result.hits).toEqual([]);
    });

    it('should handle multiple results', async () => {
      const mockHits: MaksiHit[] = [
        {
          id: 1026,
          name: 'User One',
          phone: '0532111111',
          type: 1,
          sex: 'Bay',
          gsm: '',
          photo: '',
          checkListDate: '',
          checkListStatus: '',
          endDate: '',
          proximity: '0006851540',
          tc: ''
        },
        {
          id: 1027,
          name: 'User Two',
          phone: '0532222222',
          type: 2,
          sex: 'Bayan',
          gsm: '',
          photo: '',
          checkListDate: '',
          checkListStatus: '',
          endDate: '',
          proximity: '0006851540',
          tc: ''
        }
      ];

      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        json: vi.fn().mockResolvedValue(mockHits)
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await searchMaksiByRFID('0006851540');

      expect(result.hits).toHaveLength(2);
      expect(result.hits[0].fullName).toBe('User One');
      expect(result.hits[1].fullName).toBe('User Two');
    });
  });

  describe('searchMaksiByRFID - Error Handling', () => {
    it('should throw error when Maksisoft is disabled', async () => {
      process.env.MAKSI_ENABLED = 'false';

      await expect(searchMaksiByRFID('0006851540')).rejects.toThrow('maksi_disabled');
    });

    it('should throw error when not configured', async () => {
      process.env.MAKSI_BASE = '';
      process.env.MAKSI_SEARCH_PATH = '';

      await expect(searchMaksiByRFID('0006851540')).rejects.toThrow('maksi_not_configured');
    });

    it('should handle 401 authentication error', async () => {
      const mockResponse = {
        ok: false,
        status: 401
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await expect(searchMaksiByRFID('0006851540')).rejects.toThrow('upstream_401');
    });

    it('should handle 403 authentication error', async () => {
      const mockResponse = {
        ok: false,
        status: 403
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await expect(searchMaksiByRFID('0006851540')).rejects.toThrow('upstream_401');
    });

    it('should handle 500 server error', async () => {
      const mockResponse = {
        ok: false,
        status: 500
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await expect(searchMaksiByRFID('0006851540')).rejects.toThrow('network_error');
    });

    it('should handle invalid content type', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('text/html')
        }
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await expect(searchMaksiByRFID('0006851540')).rejects.toThrow('invalid_response');
    });

    it('should handle invalid JSON response', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        json: vi.fn().mockResolvedValue({ invalid: 'format' })
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await expect(searchMaksiByRFID('0006851540')).rejects.toThrow('invalid_response');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      (networkError as any).code = 'ENOTFOUND';

      vi.mocked(fetch).mockRejectedValue(networkError);

      await expect(searchMaksiByRFID('0006851540')).rejects.toThrow('network_error');
    });

    it('should handle connection refused', async () => {
      const connectionError = new Error('Connection refused');
      (connectionError as any).code = 'ECONNREFUSED';

      vi.mocked(fetch).mockRejectedValue(connectionError);

      await expect(searchMaksiByRFID('0006851540')).rejects.toThrow('network_error');
    });
  });

  describe('searchMaksiByRFID - Timeout Scenarios', () => {
    it('should timeout after 5 seconds', async () => {
      vi.useFakeTimers();

      // Mock fetch to never resolve
      const neverResolvingPromise = new Promise(() => {});
      vi.mocked(fetch).mockReturnValue(neverResolvingPromise as any);

      const searchPromise = searchMaksiByRFID('0006851540');

      // Advance time by 5 seconds to trigger timeout
      vi.advanceTimersByTime(5000);

      await expect(searchPromise).rejects.toThrow('network_timeout');
    });

    it('should clear timeout on successful response', async () => {
      vi.useFakeTimers();

      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        json: vi.fn().mockResolvedValue([])
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await searchMaksiByRFID('0006851540');

      expect(result.hits).toEqual([]);
      
      // Advance time to ensure timeout was cleared
      vi.advanceTimersByTime(10000);
      
      // No timeout error should occur
    });

    it('should handle AbortError correctly', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      vi.mocked(fetch).mockRejectedValue(abortError);

      await expect(searchMaksiByRFID('0006851540')).rejects.toThrow('network_timeout');
    });
  });

  describe('Configuration and Status', () => {
    it('should return enabled status when MAKSI_ENABLED is true', () => {
      process.env.MAKSI_ENABLED = 'true';

      expect(isMaksiEnabled()).toBe(true);
    });

    it('should return disabled status when MAKSI_ENABLED is false', () => {
      process.env.MAKSI_ENABLED = 'false';

      expect(isMaksiEnabled()).toBe(false);
    });

    it('should return disabled status when MAKSI_ENABLED is not set', () => {
      delete process.env.MAKSI_ENABLED;

      expect(isMaksiEnabled()).toBe(false);
    });

    it('should return correct status when configured', () => {
      process.env.MAKSI_ENABLED = 'true';
      process.env.MAKSI_BASE = 'https://example.com';
      process.env.MAKSI_SEARCH_PATH = '/api/search';

      const status = getMaksiStatus();

      expect(status).toEqual({
        enabled: true,
        configured: true
      });
    });

    it('should return incorrect status when not configured', () => {
      process.env.MAKSI_ENABLED = 'true';
      process.env.MAKSI_BASE = '';
      process.env.MAKSI_SEARCH_PATH = '';

      const status = getMaksiStatus();

      expect(status).toEqual({
        enabled: true,
        configured: false
      });
    });
  });

  describe('URL Encoding', () => {
    it('should properly encode RFID in URL', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        json: vi.fn().mockResolvedValue([])
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await searchMaksiByRFID('test+special&chars');

      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/api/search?text=test%2Bspecial%26chars&criteria=0',
        expect.any(Object)
      );
    });
  });
});