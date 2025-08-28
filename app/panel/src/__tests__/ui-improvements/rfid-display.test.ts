/**
 * Unit Tests for RFID Display Service
 * Task 6.2: Create tests for RFID number formatting and display logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the RfidDisplayService from lockers.html
const RfidDisplayService = {
  formatOwnerDisplay: function(ownerKey: string, ownerType: string): string {
    try {
      if (!ownerKey || !ownerType) {
        return 'Yok';
      }

      if (ownerType === 'rfid') {
        // Validate RFID format (basic validation)
        if (!/^\d{10}$/.test(ownerKey)) {
          console.warn(`Invalid RFID format: ${ownerKey}`);
          return `RFID: ${ownerKey}`; // Show anyway with prefix
        }
        return ownerKey;
      }

      if (ownerType === 'device') {
        return `Cihaz: ${ownerKey.substring(0, 8)}...`;
      }

      if (ownerType === 'vip') {
        return `VIP: ${ownerKey}`;
      }

      return `${ownerType}: ${ownerKey}`;
    } catch (error) {
      console.error('Error formatting owner:', error);
      return 'Hata';
    }
  },

  makeSelectable: function(element: HTMLElement, ownerKey: string, ownerType: string): void {
    if (!element || ownerType !== 'rfid' || !ownerKey) {
      return;
    }

    element.classList.add('selectable');
    element.style.cursor = 'pointer';
    element.style.userSelect = 'text';
    element.title = 'Kopyalamak için tıklayın';
    
    element.addEventListener('click', function(event) {
      event.stopPropagation();
      
      // Select the text
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }

      // Try to copy to clipboard
      try {
        document.execCommand('copy');
        console.log('📋 RFID number copied to clipboard:', ownerKey);
      } catch (err) {
        console.warn('📋 Could not copy to clipboard:', err);
      }
    });
  },

  addTooltipForLongText: function(element: HTMLElement, fullText: string, maxLength: number = 15): void {
    if (!element || !fullText || fullText.length <= maxLength) {
      return;
    }

    element.classList.add('truncated');
    element.title = fullText;
    element.textContent = fullText.substring(0, maxLength) + '...';
  }
};

describe('RfidDisplayService', () => {
  describe('formatOwnerDisplay function', () => {
    describe('RFID card formatting', () => {
      it('should display valid RFID numbers directly', () => {
        expect(RfidDisplayService.formatOwnerDisplay('0009652489', 'rfid')).toBe('0009652489');
      });

      it('should display another valid RFID number', () => {
        expect(RfidDisplayService.formatOwnerDisplay('1234567890', 'rfid')).toBe('1234567890');
      });

      it('should handle invalid RFID format with prefix', () => {
        expect(RfidDisplayService.formatOwnerDisplay('123', 'rfid')).toBe('RFID: 123');
      });

      it('should handle non-numeric RFID with prefix', () => {
        expect(RfidDisplayService.formatOwnerDisplay('abc1234567', 'rfid')).toBe('RFID: abc1234567');
      });

      it('should handle RFID with special characters', () => {
        expect(RfidDisplayService.formatOwnerDisplay('123-456-789', 'rfid')).toBe('RFID: 123-456-789');
      });
    });

    describe('Device ID formatting', () => {
      it('should truncate device IDs correctly', () => {
        expect(RfidDisplayService.formatOwnerDisplay('device123456789', 'device')).toBe('Cihaz: device12...');
      });

      it('should handle short device IDs', () => {
        expect(RfidDisplayService.formatOwnerDisplay('dev123', 'device')).toBe('Cihaz: dev123...');
      });

      it('should handle very long device IDs', () => {
        const longDeviceId = 'verylongdeviceid123456789';
        expect(RfidDisplayService.formatOwnerDisplay(longDeviceId, 'device')).toBe('Cihaz: verylongd...');
      });

      it('should handle device ID with exactly 8 characters', () => {
        expect(RfidDisplayService.formatOwnerDisplay('device12', 'device')).toBe('Cihaz: device12...');
      });
    });

    describe('VIP owner formatting', () => {
      it('should format VIP owners correctly', () => {
        expect(RfidDisplayService.formatOwnerDisplay('vip-contract-123', 'vip')).toBe('VIP: vip-contract-123');
      });

      it('should handle numeric VIP IDs', () => {
        expect(RfidDisplayService.formatOwnerDisplay('12345', 'vip')).toBe('VIP: 12345');
      });

      it('should handle VIP with special characters', () => {
        expect(RfidDisplayService.formatOwnerDisplay('VIP_USER_001', 'vip')).toBe('VIP: VIP_USER_001');
      });
    });

    describe('Unknown owner types', () => {
      it('should handle unknown owner types with generic format', () => {
        expect(RfidDisplayService.formatOwnerDisplay('somekey', 'unknown')).toBe('unknown: somekey');
      });

      it('should handle custom owner types', () => {
        expect(RfidDisplayService.formatOwnerDisplay('customvalue', 'custom')).toBe('custom: customvalue');
      });
    });

    describe('Empty or null values', () => {
      it('should return "Yok" for null owner key', () => {
        expect(RfidDisplayService.formatOwnerDisplay(null as any, 'rfid')).toBe('Yok');
      });

      it('should return "Yok" for undefined owner key', () => {
        expect(RfidDisplayService.formatOwnerDisplay(undefined as any, 'rfid')).toBe('Yok');
      });

      it('should return "Yok" for empty owner key', () => {
        expect(RfidDisplayService.formatOwnerDisplay('', 'rfid')).toBe('Yok');
      });

      it('should return "Yok" for null owner type', () => {
        expect(RfidDisplayService.formatOwnerDisplay('1234567890', null as any)).toBe('Yok');
      });

      it('should return "Yok" for undefined owner type', () => {
        expect(RfidDisplayService.formatOwnerDisplay('1234567890', undefined as any)).toBe('Yok');
      });

      it('should return "Yok" for empty owner type', () => {
        expect(RfidDisplayService.formatOwnerDisplay('1234567890', '')).toBe('Yok');
      });

      it('should return "Yok" for both null values', () => {
        expect(RfidDisplayService.formatOwnerDisplay(null as any, null as any)).toBe('Yok');
      });
    });

    describe('Error handling', () => {
      it('should handle exceptions gracefully', () => {
        // Mock console.error to avoid noise in tests
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        
        // Force an error by passing an object that will cause substring to fail
        const result = RfidDisplayService.formatOwnerDisplay({ toString: () => { throw new Error('Test error'); } } as any, 'device');
        
        expect(result).toBe('Hata');
        expect(consoleSpy).toHaveBeenCalled();
        
        consoleSpy.mockRestore();
      });
    });
  });

  describe('makeSelectable function', () => {
    let mockElement: HTMLElement;

    beforeEach(() => {
      // Create a mock DOM element
      mockElement = {
        classList: {
          add: vi.fn()
        },
        style: {},
        addEventListener: vi.fn(),
        title: ''
      } as any;
    });

    it('should make RFID elements selectable', () => {
      RfidDisplayService.makeSelectable(mockElement, '1234567890', 'rfid');
      
      expect(mockElement.classList.add).toHaveBeenCalledWith('selectable');
      expect(mockElement.style.cursor).toBe('pointer');
      expect(mockElement.style.userSelect).toBe('text');
      expect(mockElement.title).toBe('Kopyalamak için tıklayın');
      expect(mockElement.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should not make non-RFID elements selectable', () => {
      RfidDisplayService.makeSelectable(mockElement, 'device123', 'device');
      
      expect(mockElement.classList.add).not.toHaveBeenCalled();
      expect(mockElement.addEventListener).not.toHaveBeenCalled();
    });

    it('should not make elements selectable without owner key', () => {
      RfidDisplayService.makeSelectable(mockElement, '', 'rfid');
      
      expect(mockElement.classList.add).not.toHaveBeenCalled();
      expect(mockElement.addEventListener).not.toHaveBeenCalled();
    });

    it('should not make elements selectable without element', () => {
      expect(() => {
        RfidDisplayService.makeSelectable(null as any, '1234567890', 'rfid');
      }).not.toThrow();
    });
  });

  describe('addTooltipForLongText function', () => {
    let mockElement: HTMLElement;

    beforeEach(() => {
      mockElement = {
        classList: {
          add: vi.fn()
        },
        title: '',
        textContent: ''
      } as any;
    });

    it('should add tooltip for long text', () => {
      const longText = 'This is a very long text that exceeds the maximum length';
      RfidDisplayService.addTooltipForLongText(mockElement, longText, 15);
      
      expect(mockElement.classList.add).toHaveBeenCalledWith('truncated');
      expect(mockElement.title).toBe(longText);
      expect(mockElement.textContent).toBe('This is a very ...');
    });

    it('should not add tooltip for short text', () => {
      const shortText = 'Short text';
      RfidDisplayService.addTooltipForLongText(mockElement, shortText, 15);
      
      expect(mockElement.classList.add).not.toHaveBeenCalled();
      expect(mockElement.title).toBe('');
      expect(mockElement.textContent).toBe('');
    });

    it('should use default max length of 15', () => {
      const text = 'This is exactly 16 chars';
      RfidDisplayService.addTooltipForLongText(mockElement, text);
      
      expect(mockElement.classList.add).toHaveBeenCalledWith('truncated');
      expect(mockElement.title).toBe(text);
      expect(mockElement.textContent).toBe('This is exactly...');
    });

    it('should handle null element gracefully', () => {
      expect(() => {
        RfidDisplayService.addTooltipForLongText(null as any, 'some text', 10);
      }).not.toThrow();
    });

    it('should handle null text gracefully', () => {
      expect(() => {
        RfidDisplayService.addTooltipForLongText(mockElement, null as any, 10);
      }).not.toThrow();
    });

    it('should handle empty text gracefully', () => {
      RfidDisplayService.addTooltipForLongText(mockElement, '', 10);
      
      expect(mockElement.classList.add).not.toHaveBeenCalled();
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete RFID display workflow', () => {
      const ownerKey = '0009652489';
      const ownerType = 'rfid';
      
      // Format the display
      const displayText = RfidDisplayService.formatOwnerDisplay(ownerKey, ownerType);
      expect(displayText).toBe('0009652489');
      
      // Create mock element
      const mockElement = {
        classList: { add: vi.fn() },
        style: {},
        addEventListener: vi.fn(),
        title: '',
        textContent: displayText
      } as any;
      
      // Make it selectable
      RfidDisplayService.makeSelectable(mockElement, ownerKey, ownerType);
      expect(mockElement.classList.add).toHaveBeenCalledWith('selectable');
      
      // Add tooltip if needed (shouldn't be needed for short RFID)
      RfidDisplayService.addTooltipForLongText(mockElement, displayText, 15);
      expect(mockElement.title).toBe('Kopyalamak için tıklayın'); // From makeSelectable, not tooltip
    });

    it('should handle complete device display workflow', () => {
      const ownerKey = 'verylongdeviceid123456789';
      const ownerType = 'device';
      
      // Format the display
      const displayText = RfidDisplayService.formatOwnerDisplay(ownerKey, ownerType);
      expect(displayText).toBe('Cihaz: verylongd...');
      
      // Create mock element
      const mockElement = {
        classList: { add: vi.fn() },
        style: {},
        addEventListener: vi.fn(),
        title: '',
        textContent: displayText
      } as any;
      
      // Should not make it selectable (not RFID)
      RfidDisplayService.makeSelectable(mockElement, ownerKey, ownerType);
      expect(mockElement.classList.add).not.toHaveBeenCalledWith('selectable');
      
      // Add tooltip for the full device ID
      RfidDisplayService.addTooltipForLongText(mockElement, ownerKey, 15);
      expect(mockElement.classList.add).toHaveBeenCalledWith('truncated');
      expect(mockElement.title).toBe(ownerKey);
    });
  });
});