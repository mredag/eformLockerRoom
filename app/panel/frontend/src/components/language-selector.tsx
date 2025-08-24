import React, { useState, useRef, useEffect } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';
import { Button } from './ui/button';

interface LanguageSelectorProps {
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function LanguageSelector({ 
  variant = 'ghost', 
  size = 'default',
  showLabel = false,
  className = ''
}: LanguageSelectorProps) {
  const { language, changeLanguage, getAvailableLanguages, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const availableLanguages = getAvailableLanguages();
  const currentLanguage = availableLanguages.find(lang => lang.code === language);

  const handleLanguageChange = async (languageCode: string) => {
    await changeLanguage(languageCode);
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <Button 
        variant={variant} 
        size={size}
        className={`gap-2 ${className}`}
        aria-label={t('settings.language')}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Globe className="h-4 w-4" />
        {showLabel && (
          <span className="hidden sm:inline">
            {currentLanguage?.nativeName || language.toUpperCase()}
          </span>
        )}
        {!showLabel && (
          <span className="text-xs font-medium">
            {language.toUpperCase()}
          </span>
        )}
        <ChevronDown className="h-3 w-3 opacity-50" />
      </Button>
      
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-md shadow-md z-50">
          <div className="p-1">
            {availableLanguages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
              >
                <div className="flex flex-col items-start">
                  <span className="font-medium">{lang.nativeName}</span>
                  <span className="text-xs text-muted-foreground">{lang.name}</span>
                </div>
                {language === lang.code && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact language selector for mobile or space-constrained areas
 */
export function CompactLanguageSelector({ className = '' }: { className?: string }) {
  const { language, changeLanguage, getAvailableLanguages } = useI18n();
  const availableLanguages = getAvailableLanguages();

  const handleLanguageChange = async (languageCode: string) => {
    await changeLanguage(languageCode);
  };

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {availableLanguages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => handleLanguageChange(lang.code)}
          className={`
            px-2 py-1 text-xs font-medium rounded transition-colors
            ${language === lang.code 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }
          `}
          aria-label={`Switch to ${lang.name}`}
        >
          {lang.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/**
 * Language selector for settings page with more detailed options
 */
export function SettingsLanguageSelector({ className = '' }: { className?: string }) {
  const { language, changeLanguage, getAvailableLanguages, t } = useI18n();
  const availableLanguages = getAvailableLanguages();

  const handleLanguageChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    await changeLanguage(event.target.value);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <label htmlFor="language-select" className="text-sm font-medium">
        {t('settings.language')}
      </label>
      <select
        id="language-select"
        value={language}
        onChange={handleLanguageChange}
        className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
      >
        {availableLanguages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.nativeName} ({lang.name})
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        {t('settings.language')} - {t('common.description')}
      </p>
    </div>
  );
}