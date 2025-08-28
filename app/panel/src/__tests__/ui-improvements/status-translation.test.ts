/**
 * Unit Tests for Status Translation Service
 * Task 6.1: Write unit tests for status translation functions to ensure correct Turkish mappings
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Mock the StatusTranslationService from lockers.html
const StatusTranslationService = {
  statusTranslations: {
    'Free': 'Boş',
    'Owned': 'Sahipli',
    'Reserved': 'Rezerve', 
    'Opening': 'Açılıyor',
    'Blocked': 'Engelli',
    'Error': 'Hata'
  },

  statusClasses: {
    'Free': 'state-bos',
    'Owned': 'state-sahipli',
    'Reserved': 'state-rezerve',
    'Opening': 'state-aciliyor', 
    'Blocked': 'state-engelli',
    'Error': 'state-hata'
  },

  translateStatus: function(dbStatus: string): string {
    if (!dbStatus || typeof dbStatus !== 'string') {
      console.warn('StatusTranslationService: Invalid status provided:', dbStatus);
      return 'Bilinmiyor';
    }
    
    return this.statusTranslations[dbStatus] || dbStatus;
  },

  getStatusClass: function(dbStatus: string): string {
    if (!dbStatus || typeof dbStatus !== 'string') {
      console.warn('StatusTranslationService: Invalid status for CSS class:', dbStatus);
      return 'state-bilinmiyor';
    }
    
    return this.statusClasses[dbStatus] || 'state-bilinmiyor';
  },

  getAllStatuses: function(): string[] {
    return Object.keys(this.statusTranslations);
  }
};

describe('StatusTranslationService', () => {
  describe('translateStatus function', () => {
    it('should translate Free status to Turkish', () => {
      expect(StatusTranslationService.translateStatus('Free')).toBe('Boş');
    });

    it('should translate Owned status to Turkish', () => {
      expect(StatusTranslationService.translateStatus('Owned')).toBe('Sahipli');
    });

    it('should translate Reserved status to Turkish', () => {
      expect(StatusTranslationService.translateStatus('Reserved')).toBe('Rezerve');
    });

    it('should translate Opening status to Turkish', () => {
      expect(StatusTranslationService.translateStatus('Opening')).toBe('Açılıyor');
    });

    it('should translate Blocked status to Turkish', () => {
      expect(StatusTranslationService.translateStatus('Blocked')).toBe('Engelli');
    });

    it('should translate Error status to Turkish', () => {
      expect(StatusTranslationService.translateStatus('Error')).toBe('Hata');
    });

    it('should handle unknown status gracefully', () => {
      expect(StatusTranslationService.translateStatus('UnknownStatus')).toBe('UnknownStatus');
    });

    it('should handle null status', () => {
      expect(StatusTranslationService.translateStatus(null as any)).toBe('Bilinmiyor');
    });

    it('should handle undefined status', () => {
      expect(StatusTranslationService.translateStatus(undefined as any)).toBe('Bilinmiyor');
    });

    it('should handle empty string status', () => {
      expect(StatusTranslationService.translateStatus('')).toBe('Bilinmiyor');
    });

    it('should handle non-string status', () => {
      expect(StatusTranslationService.translateStatus(123 as any)).toBe('Bilinmiyor');
    });
  });

  describe('getStatusClass function', () => {
    it('should return correct CSS class for Free status', () => {
      expect(StatusTranslationService.getStatusClass('Free')).toBe('state-bos');
    });

    it('should return correct CSS class for Owned status', () => {
      expect(StatusTranslationService.getStatusClass('Owned')).toBe('state-sahipli');
    });

    it('should return correct CSS class for Reserved status', () => {
      expect(StatusTranslationService.getStatusClass('Reserved')).toBe('state-rezerve');
    });

    it('should return correct CSS class for Opening status', () => {
      expect(StatusTranslationService.getStatusClass('Opening')).toBe('state-aciliyor');
    });

    it('should return correct CSS class for Blocked status', () => {
      expect(StatusTranslationService.getStatusClass('Blocked')).toBe('state-engelli');
    });

    it('should return correct CSS class for Error status', () => {
      expect(StatusTranslationService.getStatusClass('Error')).toBe('state-hata');
    });

    it('should return fallback class for unknown status', () => {
      expect(StatusTranslationService.getStatusClass('UnknownStatus')).toBe('state-bilinmiyor');
    });

    it('should return fallback class for null status', () => {
      expect(StatusTranslationService.getStatusClass(null as any)).toBe('state-bilinmiyor');
    });

    it('should return fallback class for undefined status', () => {
      expect(StatusTranslationService.getStatusClass(undefined as any)).toBe('state-bilinmiyor');
    });

    it('should return fallback class for empty string status', () => {
      expect(StatusTranslationService.getStatusClass('')).toBe('state-bilinmiyor');
    });
  });

  describe('getAllStatuses function', () => {
    it('should return all available status keys', () => {
      const statuses = StatusTranslationService.getAllStatuses();
      expect(statuses).toEqual(['Free', 'Owned', 'Reserved', 'Opening', 'Blocked', 'Error']);
    });

    it('should return an array', () => {
      const statuses = StatusTranslationService.getAllStatuses();
      expect(Array.isArray(statuses)).toBe(true);
    });

    it('should return non-empty array', () => {
      const statuses = StatusTranslationService.getAllStatuses();
      expect(statuses.length).toBeGreaterThan(0);
    });
  });

  describe('Status mapping consistency', () => {
    it('should have matching keys in translations and classes', () => {
      const translationKeys = Object.keys(StatusTranslationService.statusTranslations);
      const classKeys = Object.keys(StatusTranslationService.statusClasses);
      
      expect(translationKeys.sort()).toEqual(classKeys.sort());
    });

    it('should have all required statuses defined', () => {
      const requiredStatuses = ['Free', 'Owned', 'Reserved', 'Opening', 'Blocked', 'Error'];
      const translationKeys = Object.keys(StatusTranslationService.statusTranslations);
      
      requiredStatuses.forEach(status => {
        expect(translationKeys).toContain(status);
      });
    });

    it('should have Turkish translations for all statuses', () => {
      const translations = StatusTranslationService.statusTranslations;
      
      expect(translations['Free']).toBe('Boş');
      expect(translations['Owned']).toBe('Sahipli');
      expect(translations['Reserved']).toBe('Rezerve');
      expect(translations['Opening']).toBe('Açılıyor');
      expect(translations['Blocked']).toBe('Engelli');
      expect(translations['Error']).toBe('Hata');
    });

    it('should have CSS classes for all statuses', () => {
      const classes = StatusTranslationService.statusClasses;
      
      expect(classes['Free']).toBe('state-bos');
      expect(classes['Owned']).toBe('state-sahipli');
      expect(classes['Reserved']).toBe('state-rezerve');
      expect(classes['Opening']).toBe('state-aciliyor');
      expect(classes['Blocked']).toBe('state-engelli');
      expect(classes['Error']).toBe('state-hata');
    });
  });
});