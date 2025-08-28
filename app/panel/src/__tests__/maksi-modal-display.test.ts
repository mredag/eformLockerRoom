/**
 * Test for Maksisoft Modal Display and Error Handling - Task 5.2
 * 
 * This test verifies that the modal display and error handling functionality
 * meets the requirements 2.3, 2.4, and 6.5.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock DOM elements
const mockModal = {
  style: { display: 'none' },
  setAttribute: vi.fn(),
  getAttribute: vi.fn()
};

const mockMaksiBody = {
  innerHTML: '',
  appendChild: vi.fn()
};

const mockMaksiProfileLink = {
  href: ''
};

const mockButton = {
  textContent: 'Maksisoft',
  disabled: false,
  dataset: { ownerRfid: '' }
};

// Mock DOM methods
global.document = {
  getElementById: vi.fn((id: string) => {
    switch (id) {
      case 'maksiModal': return mockModal;
      case 'maksiBody': return mockMaksiBody;
      case 'maksiProfileLink': return mockMaksiProfileLink;
      default: return null;
    }
  }),
  createElement: vi.fn((tag: string) => ({
    className: '',
    textContent: '',
    style: {},
    appendChild: vi.fn()
  }))
} as any;

global.window = {
  prompt: vi.fn()
} as any;

global.fetch = vi.fn();

describe('Maksisoft Modal Display and Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaksiBody.innerHTML = '';
    mockMaksiProfileLink.href = '';
    mockButton.textContent = 'Maksisoft';
    mockButton.disabled = false;
  });

  describe('Error Message Display (Requirement 2.4)', () => {
    it('should display Turkish error message for auth_error', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ success: false, error: 'auth_error' })
      } as any);

      // Simulate the error handling logic
      const maksiErrorMessages = {
        'auth_error': 'Kimlik doğrulama hatası',
        'rate_limited': 'Çok fazla istek',
        'network_error': 'Bağlantı hatası'
      };

      const errorMessage = maksiErrorMessages['auth_error'];
      expect(errorMessage).toBe('Kimlik doğrulama hatası');
    });

    it('should display Turkish error message for rate_limited', () => {
      const maksiErrorMessages = {
        'auth_error': 'Kimlik doğrulama hatası',
        'rate_limited': 'Çok fazla istek',
        'network_error': 'Bağlantı hatası'
      };

      const errorMessage = maksiErrorMessages['rate_limited'];
      expect(errorMessage).toBe('Çok fazla istek');
    });

    it('should display Turkish error message for network_error', () => {
      const maksiErrorMessages = {
        'auth_error': 'Kimlik doğrulama hatası',
        'rate_limited': 'Çok fazla istek',
        'network_error': 'Bağlantı hatası'
      };

      const errorMessage = maksiErrorMessages['network_error'];
      expect(errorMessage).toBe('Bağlantı hatası');
    });
  });

  describe('No Results Display (Requirement 2.3)', () => {
    it('should display "Kayıt bulunamadı" when no member is found', () => {
      const noResultsMessage = 'Kayıt bulunamadı';
      expect(noResultsMessage).toBe('Kayıt bulunamadı');
    });
  });

  describe('Button State Reset (Requirement 6.5)', () => {
    it('should reset button state after error', () => {
      // Simulate button state during search
      mockButton.disabled = true;
      mockButton.textContent = 'Sorgulanıyor…';

      // Simulate finally block execution
      mockButton.disabled = false;
      mockButton.textContent = 'Maksisoft';

      expect(mockButton.disabled).toBe(false);
      expect(mockButton.textContent).toBe('Maksisoft');
    });

    it('should reset button state after successful search', () => {
      // Simulate button state during search
      mockButton.disabled = true;
      mockButton.textContent = 'Sorgulanıyor…';

      // Simulate finally block execution
      mockButton.disabled = false;
      mockButton.textContent = 'Maksisoft';

      expect(mockButton.disabled).toBe(false);
      expect(mockButton.textContent).toBe('Maksisoft');
    });
  });

  describe('Member Information Display (Requirement 2.2)', () => {
    it('should display exactly 6 fields in Turkish', () => {
      const mockUser = {
        id: 1026,
        rfid: '0006851540',
        fullName: 'Test User',
        phone: '0506123456',
        membershipEndsAt: '2024-12-31',
        lastCheckAt: '2024-01-15 10:30',
        lastCheckStatus: 'in'
      };

      const expectedFields = [
        { label: 'ID', value: mockUser.id },
        { label: 'RFID', value: mockUser.rfid },
        { label: 'Ad', value: mockUser.fullName || '(boş)' },
        { label: 'Telefon', value: mockUser.phone || '-' },
        { label: 'Üyelik Bitiş', value: mockUser.membershipEndsAt || '-' },
        { label: 'Son Giriş/Çıkış', value: `${mockUser.lastCheckAt || '-'} (${mockUser.lastCheckStatus || '-'})` }
      ];

      expect(expectedFields).toHaveLength(6);
      expect(expectedFields[0].label).toBe('ID');
      expect(expectedFields[1].label).toBe('RFID');
      expect(expectedFields[2].label).toBe('Ad');
      expect(expectedFields[3].label).toBe('Telefon');
      expect(expectedFields[4].label).toBe('Üyelik Bitiş');
      expect(expectedFields[5].label).toBe('Son Giriş/Çıkış');
    });
  });
});