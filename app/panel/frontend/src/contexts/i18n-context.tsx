import React, { createContext, useState, useEffect, type ReactNode } from 'react';

// Import language files
import enMessages from '../locales/en.json';
import trMessages from '../locales/tr.json';

export interface I18nContextType {
  language: string;
  setLanguage: (language: string) => Promise<void>;
  messages: Record<string, any>;
}

export const I18nContext = createContext<I18nContextType | undefined>(undefined);

interface I18nProviderProps {
  children: ReactNode;
  defaultLanguage?: string;
}

const STORAGE_KEY = 'eform-panel-language';
const SUPPORTED_LANGUAGES = ['en', 'tr'];
const DEFAULT_LANGUAGE = 'en';

// Language messages map
const messagesMap: Record<string, Record<string, any>> = {
  en: enMessages,
  tr: trMessages
};

export function I18nProvider({ children, defaultLanguage = DEFAULT_LANGUAGE }: I18nProviderProps) {
  // Initialize language from localStorage or default
  const [language, setLanguageState] = useState<string>(() => {
    try {
      const savedLanguage = localStorage.getItem(STORAGE_KEY);
      if (savedLanguage && SUPPORTED_LANGUAGES.includes(savedLanguage)) {
        return savedLanguage;
      }
    } catch (error) {
      console.warn('Failed to load language from localStorage:', error);
    }
    
    // Try to detect browser language
    const browserLanguage = navigator.language.split('-')[0];
    if (SUPPORTED_LANGUAGES.includes(browserLanguage)) {
      return browserLanguage;
    }
    
    return defaultLanguage;
  });

  // Get messages for current language
  const messages = messagesMap[language] || messagesMap[DEFAULT_LANGUAGE];

  // Set language and persist to localStorage and backend
  const setLanguage = async (newLanguage: string) => {
    if (!SUPPORTED_LANGUAGES.includes(newLanguage)) {
      console.warn(`Unsupported language: ${newLanguage}. Falling back to ${DEFAULT_LANGUAGE}`);
      newLanguage = DEFAULT_LANGUAGE;
    }

    setLanguageState(newLanguage);
    
    try {
      localStorage.setItem(STORAGE_KEY, newLanguage);
    } catch (error) {
      console.warn('Failed to save language to localStorage:', error);
    }

    // Also persist to backend for session storage
    try {
      await fetch('/api/i18n/language', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ language: newLanguage }),
        credentials: 'include'
      });
    } catch (error) {
      console.warn('Failed to save language to backend:', error);
    }
  };

  // Update document language attribute when language changes
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Update document direction for RTL languages (if needed in the future)
  useEffect(() => {
    // Currently both English and Turkish are LTR languages
    // This can be extended for RTL languages like Arabic
    document.documentElement.dir = 'ltr';
  }, [language]);

  const contextValue: I18nContextType = {
    language,
    setLanguage,
    messages
  };

  return (
    <I18nContext.Provider value={contextValue}>
      {children}
    </I18nContext.Provider>
  );
}

/**
 * Higher-order component to wrap components with I18n provider
 */
export function withI18n<P extends object>(
  Component: React.ComponentType<P>,
  defaultLanguage: string = DEFAULT_LANGUAGE
) {
  return function I18nWrappedComponent(props: P) {
    return (
      <I18nProvider defaultLanguage={defaultLanguage}>
        <Component {...props} />
      </I18nProvider>
    );
  };
}

/**
 * Utility function to get supported languages
 */
export function getSupportedLanguages(): Array<{ code: string; name: string; nativeName: string }> {
  return [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' }
  ];
}

/**
 * Utility function to check if a language is supported
 */
export function isLanguageSupported(language: string): boolean {
  return SUPPORTED_LANGUAGES.includes(language);
}

/**
 * Utility function to get the default language
 */
export function getDefaultLanguage(): string {
  return DEFAULT_LANGUAGE;
}