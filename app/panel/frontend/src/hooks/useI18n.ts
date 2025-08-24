import { useContext } from 'react';
import { I18nContext } from '../contexts/i18n-context';

export interface I18nParams {
  [key: string]: string | number;
}

export function useI18n() {
  const context = useContext(I18nContext);
  
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }

  const { language, setLanguage, messages } = context;

  /**
   * Get a translated message by key path
   * @param key - Dot-separated key path (e.g., 'common.loading', 'auth.loginError')
   * @param params - Optional parameters for message interpolation
   * @returns Translated message with interpolated parameters
   */
  const t = (key: string, params?: I18nParams): string => {
    // Split the key path and traverse the messages object
    const keys = key.split('.');
    let value: any = messages;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Return the key if translation is not found (fallback)
        console.warn(`Translation key not found: ${key}`);
        return key;
      }
    }
    
    // If the final value is not a string, return the key
    if (typeof value !== 'string') {
      console.warn(`Translation value is not a string for key: ${key}`);
      return key;
    }
    
    // Interpolate parameters if provided
    if (params) {
      return interpolateMessage(value, params);
    }
    
    return value;
  };

  /**
   * Get the current language code
   */
  const getCurrentLanguage = (): string => language;

  /**
   * Change the current language
   * @param newLanguage - Language code ('en' or 'tr')
   */
  const changeLanguage = async (newLanguage: string): Promise<void> => {
    await setLanguage(newLanguage);
  };

  /**
   * Get available languages
   */
  const getAvailableLanguages = (): Array<{ code: string; name: string; nativeName: string }> => [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' }
  ];

  /**
   * Format a date according to the current language
   * @param date - Date to format
   * @param options - Intl.DateTimeFormatOptions
   */
  const formatDate = (date: Date, options?: Intl.DateTimeFormatOptions): string => {
    const locale = language === 'tr' ? 'tr-TR' : 'en-US';
    return new Intl.DateTimeFormat(locale, options).format(date);
  };

  /**
   * Format a number according to the current language
   * @param number - Number to format
   * @param options - Intl.NumberFormatOptions
   */
  const formatNumber = (number: number, options?: Intl.NumberFormatOptions): string => {
    const locale = language === 'tr' ? 'tr-TR' : 'en-US';
    return new Intl.NumberFormat(locale, options).format(number);
  };

  /**
   * Format currency according to the current language
   * @param amount - Amount to format
   * @param currency - Currency code (default: 'TRY' for Turkish, 'USD' for English)
   */
  const formatCurrency = (amount: number, currency?: string): string => {
    const locale = language === 'tr' ? 'tr-TR' : 'en-US';
    const defaultCurrency = language === 'tr' ? 'TRY' : 'USD';
    
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || defaultCurrency
    }).format(amount);
  };

  /**
   * Get relative time string (e.g., "2 hours ago", "in 3 days")
   * @param date - Date to compare
   * @param baseDate - Base date for comparison (default: now)
   */
  const getRelativeTime = (date: Date, baseDate: Date = new Date()): string => {
    const diffInSeconds = Math.floor((baseDate.getTime() - date.getTime()) / 1000);
    const absDiff = Math.abs(diffInSeconds);
    
    // Less than a minute
    if (absDiff < 60) {
      return t('time.justNow');
    }
    
    // Minutes
    if (absDiff < 3600) {
      const minutes = Math.floor(absDiff / 60);
      if (minutes === 1) {
        return diffInSeconds > 0 ? t('time.minuteAgo') : t('time.minuteAgo');
      }
      return diffInSeconds > 0 
        ? t('time.minutesAgo', { count: minutes.toString() })
        : t('time.minutesAgo', { count: minutes.toString() });
    }
    
    // Hours
    if (absDiff < 86400) {
      const hours = Math.floor(absDiff / 3600);
      if (hours === 1) {
        return diffInSeconds > 0 ? t('time.hourAgo') : t('time.hourAgo');
      }
      return diffInSeconds > 0 
        ? t('time.hoursAgo', { count: hours.toString() })
        : t('time.hoursAgo', { count: hours.toString() });
    }
    
    // Days
    if (absDiff < 604800) {
      const days = Math.floor(absDiff / 86400);
      if (days === 1) {
        return diffInSeconds > 0 ? t('time.dayAgo') : t('time.dayAgo');
      }
      return diffInSeconds > 0 
        ? t('time.daysAgo', { count: days.toString() })
        : t('time.daysAgo', { count: days.toString() });
    }
    
    // Weeks
    if (absDiff < 2629746) {
      const weeks = Math.floor(absDiff / 604800);
      if (weeks === 1) {
        return diffInSeconds > 0 ? t('time.weekAgo') : t('time.weekAgo');
      }
      return diffInSeconds > 0 
        ? t('time.weeksAgo', { count: weeks.toString() })
        : t('time.weeksAgo', { count: weeks.toString() });
    }
    
    // Months
    if (absDiff < 31556952) {
      const months = Math.floor(absDiff / 2629746);
      if (months === 1) {
        return diffInSeconds > 0 ? t('time.monthAgo') : t('time.monthAgo');
      }
      return diffInSeconds > 0 
        ? t('time.monthsAgo', { count: months.toString() })
        : t('time.monthsAgo', { count: months.toString() });
    }
    
    // Years
    const years = Math.floor(absDiff / 31556952);
    if (years === 1) {
      return diffInSeconds > 0 ? t('time.yearAgo') : t('time.yearAgo');
    }
    return diffInSeconds > 0 
      ? t('time.yearsAgo', { count: years.toString() })
      : t('time.yearsAgo', { count: years.toString() });
  };

  return {
    t,
    language,
    changeLanguage,
    getCurrentLanguage,
    getAvailableLanguages,
    formatDate,
    formatNumber,
    formatCurrency,
    getRelativeTime
  };
}

/**
 * Interpolate parameters in a message string
 * Supports {param} syntax for parameter replacement
 * @param message - Message template with {param} placeholders
 * @param params - Parameters to interpolate
 */
function interpolateMessage(message: string, params: I18nParams): string {
  return message.replace(/\{(\w+)\}/g, (match, key) => {
    if (key in params) {
      return String(params[key]);
    }
    return match; // Return the placeholder if parameter is not found
  });
}