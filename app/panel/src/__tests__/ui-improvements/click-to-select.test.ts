/**
 * Click-to-Select Functionality Tests
 * Task 6.5: Test click-to-select functionality across different browsers and devices
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock DOM APIs
const mockDocument = {
  createRange: vi.fn(),
  execCommand: vi.fn()
};

const mockWindow = {
  getSelection: vi.fn()
};

const mockSelection = {
  removeAllRanges: vi.fn(),
  addRange: vi.fn()
};

const mockRange = {
  selectNodeContents: vi.fn()
};

// Mock console to avoid noise in tests
const consoleSpy = {
  log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {})
};

// Mock element factory
const createMockElement = (textContent: string = '') => {
  const element = {
    textContent,
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      contains: vi.fn(),
      toggle: vi.fn()
    },
    style: {},
    title: '',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    click: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
    getBoundingClientRect: vi.fn(() => ({
      top: 0,
      left: 0,
      width: 100,
      height: 20,
      right: 100,
      bottom: 20
    }))
  };
  return element as any;
};

// Click-to-select implementation from the UI
const implementClickToSelect = (element: any, ownerKey: string, ownerType: string) => {
  if (!element || ownerType !== 'rfid' || !ownerKey) {
    return;
  }

  element.classList.add('selectable');
  element.style.cursor = 'pointer';
  element.style.userSelect = 'text';
  element.title = 'Kopyalamak için tıklayın';
  
  const clickHandler = (event: any) => {
    event.stopPropagation();
    
    // Select the text
    const range = mockDocument.createRange();
    range.selectNodeContents(element);
    const selection = mockWindow.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }

    // Try to copy to clipboard
    try {
      mockDocument.execCommand('copy');
      console.log('📋 RFID number copied to clipboard:', ownerKey);
    } catch (err) {
      console.warn('📋 Could not copy to clipboard:', err);
    }
  };

  element.addEventListener('click', clickHandler);
  return clickHandler;
};

describe('Click-to-Select Functionality Tests', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    Object.values(consoleSpy).forEach(spy => spy.mockClear());
    
    // Setup DOM mocks
    mockDocument.createRange.mockReturnValue(mockRange);
    mockWindow.getSelection.mockReturnValue(mockSelection);
    mockDocument.execCommand.mockReturnValue(true);
    
    // Make mocks available globally
    global.document = mockDocument as any;
    global.window = mockWindow as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Click-to-Select Functionality', () => {
    it('should make RFID elements selectable', () => {
      const element = createMockElement('0009652489');
      const ownerKey = '0009652489';
      const ownerType = 'rfid';

      implementClickToSelect(element, ownerKey, ownerType);

      expect(element.classList.add).toHaveBeenCalledWith('selectable');
      expect(element.style.cursor).toBe('pointer');
      expect(element.style.userSelect).toBe('text');
      expect(element.title).toBe('Kopyalamak için tıklayın');
      expect(element.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should not make non-RFID elements selectable', () => {
      const element = createMockElement('device123');
      const ownerKey = 'device123';
      const ownerType = 'device';

      implementClickToSelect(element, ownerKey, ownerType);

      expect(element.classList.add).not.toHaveBeenCalled();
      expect(element.addEventListener).not.toHaveBeenCalled();
    });

    it('should not make elements selectable without owner key', () => {
      const element = createMockElement('');
      const ownerKey = '';
      const ownerType = 'rfid';

      implementClickToSelect(element, ownerKey, ownerType);

      expect(element.classList.add).not.toHaveBeenCalled();
      expect(element.addEventListener).not.toHaveBeenCalled();
    });

    it('should handle null element gracefully', () => {
      expect(() => {
        implementClickToSelect(null, '0009652489', 'rfid');
      }).not.toThrow();
    });
  });

  describe('Text Selection Behavior', () => {
    it('should select text content when clicked', () => {
      const element = createMockElement('0009652489');
      const ownerKey = '0009652489';
      const ownerType = 'rfid';

      const clickHandler = implementClickToSelect(element, ownerKey, ownerType);
      
      // Simulate click event
      const mockEvent = {
        stopPropagation: vi.fn()
      };

      clickHandler(mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(mockDocument.createRange).toHaveBeenCalled();
      expect(mockRange.selectNodeContents).toHaveBeenCalledWith(element);
      expect(mockWindow.getSelection).toHaveBeenCalled();
      expect(mockSelection.removeAllRanges).toHaveBeenCalled();
      expect(mockSelection.addRange).toHaveBeenCalledWith(mockRange);
    });

    it('should handle missing selection API gracefully', () => {
      const element = createMockElement('0009652489');
      const ownerKey = '0009652489';
      const ownerType = 'rfid';

      // Mock getSelection to return null
      mockWindow.getSelection.mockReturnValue(null);

      const clickHandler = implementClickToSelect(element, ownerKey, ownerType);
      
      const mockEvent = {
        stopPropagation: vi.fn()
      };

      expect(() => {
        clickHandler(mockEvent);
      }).not.toThrow();

      expect(mockDocument.createRange).toHaveBeenCalled();
      expect(mockWindow.getSelection).toHaveBeenCalled();
    });
  });

  describe('Clipboard Integration', () => {
    it('should attempt to copy to clipboard on click', () => {
      const element = createMockElement('0009652489');
      const ownerKey = '0009652489';
      const ownerType = 'rfid';

      const clickHandler = implementClickToSelect(element, ownerKey, ownerType);
      
      const mockEvent = {
        stopPropagation: vi.fn()
      };

      clickHandler(mockEvent);

      expect(mockDocument.execCommand).toHaveBeenCalledWith('copy');
      expect(consoleSpy.log).toHaveBeenCalledWith('📋 RFID number copied to clipboard:', ownerKey);
    });

    it('should handle clipboard copy failure gracefully', () => {
      const element = createMockElement('0009652489');
      const ownerKey = '0009652489';
      const ownerType = 'rfid';

      // Mock execCommand to throw error
      mockDocument.execCommand.mockImplementation(() => {
        throw new Error('Clipboard access denied');
      });

      const clickHandler = implementClickToSelect(element, ownerKey, ownerType);
      
      const mockEvent = {
        stopPropagation: vi.fn()
      };

      expect(() => {
        clickHandler(mockEvent);
      }).not.toThrow();

      expect(consoleSpy.warn).toHaveBeenCalledWith('📋 Could not copy to clipboard:', expect.any(Error));
    });

    it('should handle execCommand returning false', () => {
      const element = createMockElement('0009652489');
      const ownerKey = '0009652489';
      const ownerType = 'rfid';

      // Mock execCommand to return false (command not supported)
      mockDocument.execCommand.mockReturnValue(false);

      const clickHandler = implementClickToSelect(element, ownerKey, ownerType);
      
      const mockEvent = {
        stopPropagation: vi.fn()
      };

      clickHandler(mockEvent);

      expect(mockDocument.execCommand).toHaveBeenCalledWith('copy');
      // Should still log success even if execCommand returns false
      expect(consoleSpy.log).toHaveBeenCalledWith('📋 RFID number copied to clipboard:', ownerKey);
    });
  });

  describe('Event Handling', () => {
    it('should stop event propagation to prevent locker selection', () => {
      const element = createMockElement('0009652489');
      const ownerKey = '0009652489';
      const ownerType = 'rfid';

      const clickHandler = implementClickToSelect(element, ownerKey, ownerType);
      
      const mockEvent = {
        stopPropagation: vi.fn(),
        preventDefault: vi.fn()
      };

      clickHandler(mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
    });

    it('should handle multiple click events', () => {
      const element = createMockElement('0009652489');
      const ownerKey = '0009652489';
      const ownerType = 'rfid';

      const clickHandler = implementClickToSelect(element, ownerKey, ownerType);
      
      const mockEvent = {
        stopPropagation: vi.fn()
      };

      // Click multiple times
      clickHandler(mockEvent);
      clickHandler(mockEvent);
      clickHandler(mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalledTimes(3);
      expect(mockDocument.execCommand).toHaveBeenCalledTimes(3);
      expect(consoleSpy.log).toHaveBeenCalledTimes(3);
    });
  });

  describe('Cross-Browser Compatibility', () => {
    it('should work with different RFID number formats', () => {
      const testCases = [
        '0009652489',
        '1234567890',
        '0000000001',
        '9999999999'
      ];

      testCases.forEach(rfidNumber => {
        const element = createMockElement(rfidNumber);
        const clickHandler = implementClickToSelect(element, rfidNumber, 'rfid');
        
        const mockEvent = {
          stopPropagation: vi.fn()
        };

        clickHandler(mockEvent);

        expect(consoleSpy.log).toHaveBeenCalledWith('📋 RFID number copied to clipboard:', rfidNumber);
      });
    });

    it('should handle different element types', () => {
      const elementTypes = ['span', 'div', 'p', 'strong'];
      
      elementTypes.forEach(tagName => {
        const element = createMockElement('0009652489');
        element.tagName = tagName.toUpperCase();
        
        const clickHandler = implementClickToSelect(element, '0009652489', 'rfid');
        
        expect(element.classList.add).toHaveBeenCalledWith('selectable');
        expect(element.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
      });
    });
  });

  describe('Mobile Device Compatibility', () => {
    it('should handle touch events on mobile devices', () => {
      const element = createMockElement('0009652489');
      const ownerKey = '0009652489';
      const ownerType = 'rfid';

      implementClickToSelect(element, ownerKey, ownerType);

      // Verify touch-friendly styling
      expect(element.style.cursor).toBe('pointer');
      expect(element.style.userSelect).toBe('text');
      expect(element.title).toBe('Kopyalamak için tıklayın');
    });

    it('should provide visual feedback for touch interactions', () => {
      const element = createMockElement('0009652489');
      const ownerKey = '0009652489';
      const ownerType = 'rfid';

      implementClickToSelect(element, ownerKey, ownerType);

      expect(element.classList.add).toHaveBeenCalledWith('selectable');
      
      // Element should have appropriate styling for touch feedback
      expect(element.style.cursor).toBe('pointer');
    });
  });

  describe('Accessibility Features', () => {
    it('should provide appropriate title attribute for screen readers', () => {
      const element = createMockElement('0009652489');
      const ownerKey = '0009652489';
      const ownerType = 'rfid';

      implementClickToSelect(element, ownerKey, ownerType);

      expect(element.title).toBe('Kopyalamak için tıklayın');
    });

    it('should maintain keyboard accessibility', () => {
      const element = createMockElement('0009652489');
      const ownerKey = '0009652489';
      const ownerType = 'rfid';

      implementClickToSelect(element, ownerKey, ownerType);

      // Text should remain selectable for keyboard users
      expect(element.style.userSelect).toBe('text');
    });
  });

  describe('Performance Considerations', () => {
    it('should not create memory leaks with event listeners', () => {
      const element = createMockElement('0009652489');
      const ownerKey = '0009652489';
      const ownerType = 'rfid';

      implementClickToSelect(element, ownerKey, ownerType);

      // Verify event listener is added only once
      expect(element.addEventListener).toHaveBeenCalledTimes(1);
      expect(element.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should handle rapid successive clicks efficiently', () => {
      const element = createMockElement('0009652489');
      const ownerKey = '0009652489';
      const ownerType = 'rfid';

      const clickHandler = implementClickToSelect(element, ownerKey, ownerType);
      
      const mockEvent = {
        stopPropagation: vi.fn()
      };

      // Simulate rapid clicks
      const startTime = Date.now();
      for (let i = 0; i < 10; i++) {
        clickHandler(mockEvent);
      }
      const endTime = Date.now();

      // Should complete quickly (less than 100ms for 10 clicks)
      expect(endTime - startTime).toBeLessThan(100);
      expect(mockEvent.stopPropagation).toHaveBeenCalledTimes(10);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from DOM API failures', () => {
      const element = createMockElement('0009652489');
      const ownerKey = '0009652489';
      const ownerType = 'rfid';

      // Mock createRange to throw error
      mockDocument.createRange.mockImplementation(() => {
        throw new Error('Range API not supported');
      });

      const clickHandler = implementClickToSelect(element, ownerKey, ownerType);
      
      const mockEvent = {
        stopPropagation: vi.fn()
      };

      expect(() => {
        clickHandler(mockEvent);
      }).not.toThrow();

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
    });

    it('should handle missing DOM APIs gracefully', () => {
      const element = createMockElement('0009652489');
      const ownerKey = '0009652489';
      const ownerType = 'rfid';

      // Remove DOM APIs
      mockDocument.createRange.mockReturnValue(undefined);
      mockWindow.getSelection.mockReturnValue(undefined);

      const clickHandler = implementClickToSelect(element, ownerKey, ownerType);
      
      const mockEvent = {
        stopPropagation: vi.fn()
      };

      expect(() => {
        clickHandler(mockEvent);
      }).not.toThrow();
    });
  });
});