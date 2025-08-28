/**
 * Unit tests for Admin Panel UI Improvements
 * Task 4: Update locker card rendering logic
 */

import { describe, it, expect } from 'vitest';
import { g } from 'vitest/dist/chunks/suite.d.FvehnV49.js';
import { g } from 'vitest/dist/chunks/suite.d.FvehnV49.js';

// Mock services that would be available in the browser environment
const StatusTranslationService = {
  translateStatus: (dbStatus: string) => {
    const translations: Record<string, string> = {
      'Free': 'Boş',
      'Owned': 'Sahipli',
      'Reserved': 'Rezerve',
      'Opening': 'Açılıyor',
      'Blocked': 'Engelli',
      'Error': 'Hata'
    };
    return translations[dbStatus] || dbStatus;
  },
  getStatusClass: (dbStatus: string) => {
    const classes: Record<string, string> = {
      'Free': 'state-bos',
      'Owned': 'state-sahipli',
      'Reserved': 'state-rezerve',
      'Opening': 'state-aciliyor',
      'Blocked': 'state-engelli',
      'Error': 'state-hata'
    };
    return classes[dbStatus] || 'state-bilinmiyor';
  }
};

const RfidDisplayService = {
  formatOwnerDisplay: (ownerKey: string, ownerType: string) => {
    if (!ownerKey || !ownerType) return 'Yok';
    if (ownerType === 'rfid') return ownerKey;
    if (ownerType === 'device') return `Cihaz: ${ownerKey.substring(0, 8)}...`;
    if (ownerType === 'vip') return `VIP: ${ownerKey}`;
    return `${ownerType}: ${ownerKey}`;
  }
};

const selectedLockers = new Set();

const escapeHtml = (text: any) => {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// Helper function to create error cards for malformed data
const createErrorCard = (errorMessage: string) => {
  return `
    <div class="locker-card error" data-status="error" data-error="true">
      <div class="locker-header">
        <div class="locker-display-name">Hata</div>
        <div class="locker-state-chip state-hata">Hata</div>
      </div>
      <div class="locker-details">
        <div style="color: #dc3545; font-weight: 500;">${escapeHtml(errorMessage)}</div>
      </div>
    </div>
  `;
};

// Enhanced Locker Card Rendering Logic - Task 4
const renderLockerCard = (locker: any) => {
  try {
    // Validate locker data - Task 4.4: Proper error handling for missing or malformed data
    if (!locker || typeof locker !== 'object') {
      console.error('renderLockerCard: Invalid locker data provided:', locker);
      return createErrorCard('Invalid locker data');
    }

    // Validate required fields
    const requiredFields = ['kiosk_id', 'id', 'status'];
    const missingFields = requiredFields.filter(field => !locker.hasOwnProperty(field) || locker[field] === null || locker[field] === undefined);
    
    if (missingFields.length > 0) {
      console.error('renderLockerCard: Missing required fields:', missingFields, 'in locker:', locker);
      return createErrorCard(`Missing fields: ${missingFields.join(', ')}`);
    }

    // Task 4.1: Use enhanced owner information from API response
    const ownerKey = locker.owner_key || null;
    const ownerType = locker.owner_type || null;
    
    // Get display name or fallback to "Dolap [id]"
    const displayName = locker.display_name || `Dolap ${locker.id}`;
    
    // Task 4.2: Ensure proper status class application based on database status values
    const turkishState = StatusTranslationService.translateStatus(locker.status);
    const statusClass = StatusTranslationService.getStatusClass(locker.status);
    
    // Format last change time with error handling
    let lastChanged = 'Bilinmiyor';
    try {
      if (locker.updated_at) {
        lastChanged = new Date(locker.updated_at).toLocaleString('tr-TR', {
          day: '2-digit',
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    } catch (dateError) {
      console.warn('renderLockerCard: Invalid date format for locker', locker.kiosk_id, locker.id, ':', locker.updated_at);
      lastChanged = 'Geçersiz tarih';
    }

    // Format owner information using RfidDisplayService with enhanced error handling
    let ownerDisplay = 'Yok';
    let ownerElementId = '';
    let ownerClasses = 'locker-owner';
    
    try {
      ownerDisplay = RfidDisplayService.formatOwnerDisplay(ownerKey, ownerType);
      ownerElementId = `owner-${locker.kiosk_id}-${locker.id}`;
      const isRfidSelectable = ownerType === 'rfid' && ownerKey;
      ownerClasses = isRfidSelectable ? 'locker-owner selectable' : 'locker-owner';
    } catch (ownerError) {
      console.error('renderLockerCard: Error formatting owner display for locker', locker.kiosk_id, locker.id, ':', ownerError);
      ownerDisplay = 'Hata';
    }

    // Determine selection state
    const isSelected = selectedLockers.has(locker.kiosk_id + '-' + locker.id);
    
    // Task 4.3: Add data attributes for easier testing and debugging
    const dataAttributes = [
      `data-status="${escapeHtml(locker.status)}"`,
      `data-kiosk-id="${escapeHtml(locker.kiosk_id)}"`,
      `data-locker-id="${locker.id}"`,
      `data-owner-type="${escapeHtml(ownerType || '')}"`,
      `data-owner-key="${escapeHtml(ownerKey || '')}"`,
      `data-is-vip="${locker.is_vip ? 'true' : 'false'}"`,
      `data-display-name="${escapeHtml(displayName)}"`,
      `data-last-updated="${escapeHtml(locker.updated_at || '')}"`,
      `data-version="${locker.version || 1}"`
    ].join(' ');

    // Build CSS classes with proper status class application
    const cardClasses = [
      'locker-card',
      locker.status.toLowerCase(), // Legacy class for backward compatibility
      isSelected ? 'selected' : ''
    ].filter(Boolean).join(' ');

    return `
      <div class="${cardClasses}" 
           onclick="toggleLocker('${escapeHtml(locker.kiosk_id)}', ${locker.id})"
           ${dataAttributes}>
        <div class="locker-header">
          <div class="locker-display-name">${escapeHtml(displayName)}</div>
          <div class="locker-state-chip ${statusClass}">${escapeHtml(turkishState)}</div>
        </div>
        <div class="locker-relay-number">Röle: ${locker.id}</div>
        <div class="locker-details">
          ${locker.is_vip ? '<div><strong>VIP Dolap</strong></div>' : ''}
          ${ownerDisplay !== 'Yok' ? 
            `<div>Sahip: <span id="${ownerElementId}" class="${ownerClasses}">${escapeHtml(ownerDisplay)}</span></div>` : 
            '<div>Sahip: Yok</div>'
          }
          <div class="last-change-time">Son değişiklik: ${escapeHtml(lastChanged)}</div>
        </div>
        <div class="locker-actions" onclick="event.stopPropagation()">
          <button class="btn btn-sm btn-primary" onclick="openSingleLocker('${escapeHtml(locker.kiosk_id)}', ${locker.id})" 
                  title="Komut kuyruğu ile aç">
            🔓 Aç
          </button>
          <button class="btn btn-sm btn-success" onclick="directOpenLocker(${locker.id})" 
                  title="Doğrudan donanım aktivasyonu">
            ⚡ Direkt
          </button>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('renderLockerCard: Unexpected error rendering locker card:', error, 'locker data:', locker);
    return createErrorCard('Rendering error');
  }
};

describe('Admin Panel UI Improvements - Task 4: Locker Card Rendering', () => {

  describe('Task 4.1: Enhanced owner information from API response', () => {
    it('should display RFID card numbers correctly', () => {
      const locker = {
        kiosk_id: 'test-kiosk',
        id: 1,
        status: 'Owned',
        owner_type: 'rfid',
        owner_key: '0009652489',
        is_vip: false,
        updated_at: '2025-01-27T10:00:00Z',
        version: 1
      };

      const html = renderLockerCard(locker);
      expect(html).toContain('0009652489');
      expect(html).toContain('data-owner-type="rfid"');
      expect(html).toContain('data-owner-key="0009652489"');
    });

    it('should display device IDs with truncation', () => {
      const locker = {
        kiosk_id: 'test-kiosk',
        id: 2,
        status: 'Owned',
        owner_type: 'device',
        owner_key: 'device123456789',
        is_vip: false,
        updated_at: '2025-01-27T10:00:00Z',
        version: 1
      };

      const html = renderLockerCard(locker);
      expect(html).toContain('Cihaz: device12...');
      expect(html).toContain('data-owner-type="device"');
    });

    it('should display VIP owner information', () => {
      const locker = {
        kiosk_id: 'test-kiosk',
        id: 3,
        status: 'Owned',
        owner_type: 'vip',
        owner_key: 'vip-contract-123',
        is_vip: true,
        updated_at: '2025-01-27T10:00:00Z',
        version: 1
      };

      const html = renderLockerCard(locker);
      expect(html).toContain('VIP: vip-contract-123');
      expect(html).toContain('data-is-vip="true"');
      expect(html).toContain('<strong>VIP Dolap</strong>');
    });

    it('should handle empty owner information', () => {
      const locker = {
        kiosk_id: 'test-kiosk',
        id: 4,
        status: 'Free',
        is_vip: false,
        updated_at: '2025-01-27T10:00:00Z',
        version: 1
      };

      const html = renderLockerCard(locker);
      expect(html).toContain('Sahip: Yok');
      expect(html).toContain('data-owner-type=""');
      expect(html).toContain('data-owner-key=""');
    });
  });

  describe('Task 4.2: Proper status class application', () => {
    it('should apply correct CSS classes for Free status', () => {
      const locker = {
        kiosk_id: 'test-kiosk',
        id: 1,
        status: 'Free',
        is_vip: false,
        updated_at: '2025-01-27T10:00:00Z',
        version: 1
      };

      const html = renderLockerCard(locker);
      expect(html).toContain('class="locker-card free"');
      expect(html).toContain('locker-state-chip state-bos');
      expect(html).toContain('>Boş<');
    });

    it('should apply correct CSS classes for Owned status', () => {
      const locker = {
        kiosk_id: 'test-kiosk',
        id: 2,
        status: 'Owned',
        owner_type: 'rfid',
        owner_key: '1234567890',
        is_vip: false,
        updated_at: '2025-01-27T10:00:00Z',
        version: 1
      };

      const html = renderLockerCard(locker);
      expect(html).toContain('class="locker-card owned"');
      expect(html).toContain('locker-state-chip state-sahipli');
      expect(html).toContain('>Sahipli<');
    });

    it('should apply correct CSS classes for Blocked status', () => {
      const locker = {
        kiosk_id: 'test-kiosk',
        id: 3,
        status: 'Blocked',
        is_vip: false,
        updated_at: '2025-01-27T10:00:00Z',
        version: 1
      };

      const html = renderLockerCard(locker);
      expect(html).toContain('class="locker-card blocked"');
      expect(html).toContain('locker-state-chip state-engelli');
      expect(html).toContain('>Engelli<');
    });
  });

  describe('Task 4.3: Data attributes for testing and debugging', () => {
    it('should include all required data attributes', () => {
      const locker = {
        kiosk_id: 'test-kiosk-1',
        id: 5,
        status: 'Owned',
        owner_type: 'rfid',
        owner_key: '0009652489',
        is_vip: false,
        display_name: 'Custom Locker Name',
        updated_at: '2025-01-27T10:30:00Z',
        version: 2
      };

      const html = renderLockerCard(locker);
      
      expect(html).toContain('data-status="Owned"');
      expect(html).toContain('data-kiosk-id="test-kiosk-1"');
      expect(html).toContain('data-locker-id="5"');
      expect(html).toContain('data-owner-type="rfid"');
      expect(html).toContain('data-owner-key="0009652489"');
      expect(html).toContain('data-is-vip="false"');
      expect(html).toContain('data-display-name="Custom Locker Name"');
      expect(html).toContain('data-last-updated="2025-01-27T10:30:00Z"');
      expect(html).toContain('data-version="2"');
    });

    it('should escape HTML in data attributes', () => {
      const locker = {
        kiosk_id: 'test<script>alert("xss")</script>',
        id: 1,
        status: 'Free',
        display_name: 'Name with "quotes" & symbols',
        is_vip: false,
        updated_at: '2025-01-27T10:00:00Z',
        version: 1
      };

      const html = renderLockerCard(locker);
      
      expect(html).not.toContain('<script>');
      expect(html).toContain('data-kiosk-id="test&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"');
      expect(html).toContain('data-display-name="Name with &quot;quotes&quot; &amp; symbols"');
    });
  });

  describe('Task 4.4: Error handling for missing or malformed data', () => {
    it('should handle null locker data', () => {
      const html = renderLockerCard(null);
      expect(html).toContain('data-error="true"');
      expect(html).toContain('Invalid locker data');
    });

    it('should handle missing required fields', () => {
      const locker = {
        kiosk_id: 'test-kiosk',
        // Missing id and status
        is_vip: false
      };

      const html = renderLockerCard(locker);
      expect(html).toContain('data-error="true"');
      expect(html).toContain('Missing fields: id, status');
    });

    it('should handle invalid date formats gracefully', () => {
      const locker = {
        kiosk_id: 'test-kiosk',
        id: 1,
        status: 'Free',
        updated_at: 'invalid-date',
        is_vip: false,
        version: 1
      };

      const html = renderLockerCard(locker);
      expect(html).toContain('Geçersiz tarih');
    });


  describe('Task 4.5: {
    it('should render Free lock {
      const lo= {
        kiosk_id: 'test-,
        id: 1,
        status: 'Free',
        is_vip: false,
        updated_at: '2025-01-27T10:00:00Z',
        version: 1
      };

      const html = renderLockerCard(locker);
      expect(html).toContain('state-bos');
      expect(html).toContain('Sahip: Yok');
    });

    it('should render Owned locker with RFID owner', () => {
      const locker = {
       ,
       id: 2,
ned',
        owner_type: 'rfid',
        owner_key: '0009652489',
        is_vip: false,
        updated_at: '2025-01-27',
        versio 1
      };

      const html = renderLockerCard(locker)
      expect(html)
      ex');
');
    });

    it('should render VIP locker with VIP o> {
      c
,
        id: 3,
        status: 'Owned
        owner_type: 'vip',
        owner_123',
        is_vip: true,
        updated_at: '2025-0
        version: 1
      };

      const html =);
      ex;
');
      expect(html).toContain('<strong>VIP Dolap</strong>');
      expect(html).toContain('data-is-vip="tru"');
    });

    it(> {
{
        kiosk_id: 'test-kiosk',
        id: 4,
        status: 'Blocked',
        is_vipse,
        updated_at: '202Z',
        version: 1
      };

      const html = renderLockerCard(locker);
      expect(html);
      ex;


    it('should render Opening locker', () => {
      const locker = {
        kiosk_id: 'test-kiosk',
        id: 5,
       g',
,
        owner_key: '1234567890',
        is_vip: false,
        updated_at: '2025-01-27
        versio 1
      };

      const html = renderLockerCard(locker);
      expect(html)
      ex;


    it('should render Error locker', () => {
      const locker = {
       ,

        status: 'Error',
        is_vip: false,
        updated_at: '2025-01-270:00Z',
        version: 1
      };

      const html = renderLockerC;
      expect(html).toC');
      expect(html).toContain('>Hata<');
    });
  });

  describe('Display name handling', () => {
    it('should use custom display name when ava{
      const locker = {
       -kiosk',

        status: 'Free',
        display_name:  İsmi',
        is_vip: false,
        update0Z',
        version: 1
      };

      const html =r);
      ex;
mi"');
    });

    it('should fallback to default name () => {
      c
     ,

        status: 'Free',
        is_vip: false,
        updated_at: '2,
        version: 1
      };

      const html = renderLockerCard(lock
      expect(html).toColap 8');
      expect(html).toContain('data-display-"');
    });
  });
});