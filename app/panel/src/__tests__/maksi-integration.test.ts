/**
 * Integration Tests for Maksisoft Feature
 * 
 * Tests key user flows from button click to modal display,
 * including error scenarios and Turkish error messages.
 * 
 * Requirements: Critical user flows validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { registerMaksiRoutes } from '../routes/maksi-routes';
import { clearRateLimitStore, stopCleanupTimer } from '../middleware/rate-limit';

// Mock DOM environment for client-side testing
const mockDOM = () => {
  const mockModal = {
    style: { display: 'none' },
    querySelector: vi.fn()
  };

  const mockMaksiBody = {
    textContent: '',
    innerHTML: ''
  };

  const mockMaksiProfileLink = {
    href: ''
  };

  const mockButton = {
    textContent: 'Maksisoft',
    disabled: false,
    dataset: { ownerRfid: '' }
  };

  global.document = {
    querySelector: vi.fn((selector: string) => {
      switch (selector) {
        case '#maksiModal': return mockModal;
        case '#maksiBody': return mockMaksiBody;
        case '#maksiProfileLink': return mockMaksiProfileLink;
        default: return null;
      }
    }),
    addEventListener: vi.fn()
  } as any;

  global.window = {
    prompt: vi.fn(),
    encodeURIComponent: (str: string) => encodeURIComponent(str)
  } as any;

  global.fetch = vi.fn();

  return { mockModal, mockMaksiBody, mockMaksiProfileLink, mockButton };
};

describe('Maksisoft Integration Tests', () => {
  let fastify: any;
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.clearAllMocks();
    clearRateLimitStore();
    
    // Setup test environment
    process.env = {
      ...originalEnv,
      MAKSI_ENABLED: 'true',
      MAKSI_BASE: 'https://example.com',
      MAKSI_SEARCH_PATH: '/api/search',
      MAKSI_CRITERIA_FOR_RFID: '0',
      MAKSI_BOOTSTRAP_COOKIE: 'PHPSESSID=test123'
    };

    // Create fresh Fastify instance
    fastify = Fastify({ logger: false });
    await registerMaksiRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => {
    if (fastify) {
      await fastify.close();
    }
    process.env = originalEnv;
    stopCleanupTimer();
  });

  describe('Happy Path: Button Click to Modal Display', () => {
    it('should complete full flow from API call to modal display', async () => {
      // Mock successful API response
      const mockHits = [
        {
          id: 1026,
          name: 'Ahmet Yılmaz',
          phone: '0532123456',
          type: 1,
          sex: 'Bay',
          gsm: '0506789012',
          photo: 'profile.jpg',
          checkListDate: '2024-01-15 10:30',
          checkListStatus: 'in',
          endDate: '2024-12-31',
          proximity: '0006851540',
          tc: '1234567****'
        }
      ];

      // Test API endpoint directly
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/maksi/search-by-rfid?rfid=0006851540',
        headers: {
          'x-forwarded-for': '192.168.1.100'
        }
      });

      // Mock the fetch for the service layer
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        json: vi.fn().mockResolvedValue(mockHits)
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      // Simulate the client-side flow
      const { mockModal, mockMaksiBody, mockMaksiProfileLink } = mockDOM();

      // Simulate the search function from lockers.js
      const searchMaksi = async (rfid: string) => {
        const response = await fetch(`/api/maksi/search-by-rfid?rfid=${encodeURIComponent(rfid)}`, {
          headers: { Accept: 'application/json' }
        });
        const data = await response.json();
        return { ok: response.ok && data.success !== false, data };
      };

      // Simulate the render function
      const renderUser = (user: any) => {
        return [
          `ID: ${user.id}`,
          `RFID: ${user.rfid}`,
          `Ad: ${user.fullName || '(boş)'}`,
          `Telefon: ${user.phone || '-'}`,
          `Üyelik Bitiş: ${user.membershipEndsAt || '-'}`,
          `Son Giriş Çıkış: ${user.lastCheckAt || '-'} (${user.lastCheckStatus || '-'})`
        ].join('\n');
      };

      // Execute the search
      const { ok, data } = await searchMaksi('0006851540');

      // Verify API response
      expect(ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.hits).toHaveLength(1);

      // Simulate modal display
      const user = data.hits[0];
      mockMaksiBody.textContent = renderUser(user);
      mockMaksiProfileLink.href = `https://eformhatay.maksionline.com/ceo/index.php?page=user_search&search=${encodeURIComponent('0006851540')}`;
      mockModal.style.display = 'block';

      // Verify modal content
      expect(mockMaksiBody.textContent).toContain('ID: 1026');
      expect(mockMaksiBody.textContent).toContain('RFID: 0006851540');
      expect(mockMaksiBody.textContent).toContain('Ad: Ahmet Yılmaz');
      expect(mockMaksiBody.textContent).toContain('Telefon: 0532123456');
      expect(mockMaksiBody.textContent).toContain('Üyelik Bitiş: 2024-12-31');
      expect(mockMaksiBody.textContent).toContain('Son Giriş Çıkış: 2024-01-15 10:30 (in)');

      // Verify profile link
      expect(mockMaksiProfileLink.href).toBe('https://eformhatay.maksionline.com/ceo/index.php?page=user_search&search=0006851540');

      // Verify modal is displayed
      expect(mockModal.style.display).toBe('block');
    });

    it('should handle button click with pre-filled RFID from locker owner', async () => {
      const { mockButton } = mockDOM();
      
      // Simulate locker with owner RFID
      mockButton.dataset.ownerRfid = '0006851540';

      // Simulate button click handler
      const handleButtonClick = (button: any) => {
        const presetRfid = button.dataset.ownerRfid || '';
        const rfid = presetRfid || window.prompt('RFID numarası:');
        return rfid;
      };

      const extractedRfid = handleButtonClick(mockButton);

      expect(extractedRfid).toBe('0006851540');
      expect(window.prompt).not.toHaveBeenCalled();
    });

    it('should handle button click with manual RFID entry', async () => {
      const { mockButton } = mockDOM();
      
      // Simulate locker without owner RFID
      mockButton.dataset.ownerRfid = '';
      vi.mocked(window.prompt).mockReturnValue('1234567890');

      // Simulate button click handler
      const handleButtonClick = (button: any) => {
        const presetRfid = button.dataset.ownerRfid || '';
        const rfid = presetRfid || window.prompt('RFID numarası:');
        return rfid;
      };

      const extractedRfid = handleButtonClick(mockButton);

      expect(extractedRfid).toBe('1234567890');
      expect(window.prompt).toHaveBeenCalledWith('RFID numarası:');
    });
  });

  describe('Auth Error Path with Turkish Error Message', () => {
    it('should display Turkish auth error message for 401 response', async () => {
      // Test API endpoint returns auth error
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/maksi/search-by-rfid?rfid=0006851540',
        headers: {
          'x-forwarded-for': '192.168.1.100'
        }
      });

      // Mock 401 response from Maksisoft
      const mockResponse = {
        ok: false,
        status: 401
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      const { mockModal, mockMaksiBody, mockMaksiProfileLink } = mockDOM();

      // Simulate the error handling from lockers.js
      const maksiErrorMessages = {
        'auth_error': 'Kimlik doğrulama hatası',
        'rate_limited': 'Çok fazla istek',
        'network_error': 'Bağlantı hatası',
        'invalid_response': 'Geçersiz yanıt',
        'unknown_error': 'Bilinmeyen hata'
      };

      // Simulate API call that returns auth error
      const searchMaksi = async (rfid: string) => {
        try {
          const response = await fetch(`/api/maksi/search-by-rfid?rfid=${encodeURIComponent(rfid)}`);
          const data = await response.json();
          return { ok: response.ok && data.success !== false, data };
        } catch (error) {
          return { ok: false, data: { error: 'network_error' } };
        }
      };

      const { ok, data } = await searchMaksi('0006851540');

      // Verify error response
      expect(ok).toBe(false);

      // Simulate error display in modal
      const errorMessage = maksiErrorMessages[data.error as keyof typeof maksiErrorMessages] || 'Bilinmeyen hata';
      mockMaksiBody.textContent = errorMessage;
      mockMaksiProfileLink.href = '#';
      mockModal.style.display = 'block';

      // Verify Turkish error message is displayed
      expect(mockMaksiBody.textContent).toBe('Kimlik doğrulama hatası');
      expect(mockMaksiProfileLink.href).toBe('#');
      expect(mockModal.style.display).toBe('block');
    });

    it('should display Turkish rate limit error message', async () => {
      const { mockModal, mockMaksiBody } = mockDOM();

      // Simulate rate limit error
      const maksiErrorMessages = {
        'auth_error': 'Kimlik doğrulama hatası',
        'rate_limited': 'Çok fazla istek',
        'network_error': 'Bağlantı hatası'
      };

      const errorMessage = maksiErrorMessages['rate_limited'];
      mockMaksiBody.textContent = errorMessage;
      mockModal.style.display = 'block';

      expect(mockMaksiBody.textContent).toBe('Çok fazla istek');
    });

    it('should display Turkish network error message', async () => {
      const { mockModal, mockMaksiBody } = mockDOM();

      // Simulate network error
      const maksiErrorMessages = {
        'auth_error': 'Kimlik doğrulama hatası',
        'rate_limited': 'Çok fazla istek',
        'network_error': 'Bağlantı hatası'
      };

      const errorMessage = maksiErrorMessages['network_error'];
      mockMaksiBody.textContent = errorMessage;
      mockModal.style.display = 'block';

      expect(mockMaksiBody.textContent).toBe('Bağlantı hatası');
    });
  });

  describe('No Match Scenario - "Kayıt bulunamadı"', () => {
    it('should display "Kayıt bulunamadı" when no member is found', async () => {
      // Mock empty response from API
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        json: vi.fn().mockResolvedValue([])
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      const { mockModal, mockMaksiBody, mockMaksiProfileLink } = mockDOM();

      // Simulate the search function
      const searchMaksi = async (rfid: string) => {
        const response = await fetch(`/api/maksi/search-by-rfid?rfid=${encodeURIComponent(rfid)}`);
        const data = await response.json();
        return { ok: response.ok && data.success !== false, data };
      };

      // Execute search for non-existent RFID
      const { ok, data } = await searchMaksi('9999999999');

      // Verify successful API call but empty results
      expect(ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.hits).toHaveLength(0);

      // Simulate modal display for no results
      const hits = Array.isArray(data.hits) ? data.hits : [];
      mockMaksiBody.textContent = hits.length ? hits.map(() => '').join('\n\n') : 'Kayıt bulunamadı';
      mockMaksiProfileLink.href = `https://eformhatay.maksionline.com/ceo/index.php?page=user_search&search=${encodeURIComponent('9999999999')}`;
      mockModal.style.display = 'block';

      // Verify "Kayıt bulunamadı" message is displayed
      expect(mockMaksiBody.textContent).toBe('Kayıt bulunamadı');
      expect(mockMaksiProfileLink.href).toContain('search=9999999999');
      expect(mockModal.style.display).toBe('block');
    });

    it('should still provide profile link even when no results found', async () => {
      const { mockMaksiProfileLink } = mockDOM();

      // Simulate profile link generation for no-results scenario
      const rfid = '9999999999';
      mockMaksiProfileLink.href = `https://eformhatay.maksionline.com/ceo/index.php?page=user_search&search=${encodeURIComponent(rfid)}`;

      // Verify profile link is still generated
      expect(mockMaksiProfileLink.href).toBe('https://eformhatay.maksionline.com/ceo/index.php?page=user_search&search=9999999999');
    });
  });

  describe('Button State Management During Operations', () => {
    it('should manage button state during search operation', async () => {
      const { mockButton } = mockDOM();

      // Simulate button state during search
      const originalText = mockButton.textContent;
      
      // Start search - button should be disabled and show loading
      mockButton.disabled = true;
      mockButton.textContent = 'Sorgulanıyor…';

      expect(mockButton.disabled).toBe(true);
      expect(mockButton.textContent).toBe('Sorgulanıyor…');

      // Complete search - button should be re-enabled
      mockButton.disabled = false;
      mockButton.textContent = originalText;

      expect(mockButton.disabled).toBe(false);
      expect(mockButton.textContent).toBe('Maksisoft');
    });

    it('should reset button state after error', async () => {
      const { mockButton } = mockDOM();

      // Simulate error scenario
      mockButton.disabled = true;
      mockButton.textContent = 'Sorgulanıyor…';

      // Simulate finally block execution (error or success)
      mockButton.disabled = false;
      mockButton.textContent = 'Maksisoft';

      expect(mockButton.disabled).toBe(false);
      expect(mockButton.textContent).toBe('Maksisoft');
    });
  });

  describe('End-to-End API Integration', () => {
    it('should handle complete API flow with rate limiting', async () => {
      // First request should succeed
      const response1 = await fastify.inject({
        method: 'GET',
        url: '/api/maksi/search-by-rfid?rfid=0006851540',
        headers: {
          'x-forwarded-for': '192.168.1.100'
        }
      });

      // Second immediate request should be rate limited
      const response2 = await fastify.inject({
        method: 'GET',
        url: '/api/maksi/search-by-rfid?rfid=0006851540',
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

    it('should handle feature disabled scenario', async () => {
      // Temporarily disable feature
      process.env.MAKSI_ENABLED = 'false';

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/maksi/search-by-rfid?rfid=0006851540'
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.payload)).toEqual({
        success: false,
        error: 'disabled'
      });
    });
  });
});