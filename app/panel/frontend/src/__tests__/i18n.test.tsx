import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '../contexts/i18n-context'
import { useI18n } from '../hooks/useI18n'

// Test component that uses i18n
function TestComponent() {
  const { t, language, changeLanguage, formatDate, formatNumber, formatCurrency } = useI18n()

  return (
    <div>
      <div data-testid="current-language">{language}</div>
      <div data-testid="translated-text">{t('common.loading')}</div>
      <div data-testid="parameterized-text">{t('lockers.lockerNumber', { number: '42' })}</div>
      <div data-testid="formatted-date">{formatDate(new Date('2024-01-15'))}</div>
      <div data-testid="formatted-number">{formatNumber(1234.56)}</div>
      <div data-testid="formatted-currency">{formatCurrency(99.99)}</div>
      <button onClick={() => changeLanguage('tr')} data-testid="change-to-turkish">
        Change to Turkish
      </button>
      <button onClick={() => changeLanguage('en')} data-testid="change-to-english">
        Change to English
      </button>
    </div>
  )
}

describe('I18n System', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
  })

  it('should render with default English language', () => {
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    )

    expect(screen.getByTestId('current-language')).toHaveTextContent('en')
    expect(screen.getByTestId('translated-text')).toHaveTextContent('Loading...')
  })

  it('should handle parameterized messages', () => {
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    )

    expect(screen.getByTestId('parameterized-text')).toHaveTextContent('Locker #42')
  })

  it('should change language when requested', () => {
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    )

    // Initially English
    expect(screen.getByTestId('current-language')).toHaveTextContent('en')
    expect(screen.getByTestId('translated-text')).toHaveTextContent('Loading...')

    // Change to Turkish
    fireEvent.click(screen.getByTestId('change-to-turkish'))
    
    expect(screen.getByTestId('current-language')).toHaveTextContent('tr')
    expect(screen.getByTestId('translated-text')).toHaveTextContent('Yükleniyor...')

    // Change back to English
    fireEvent.click(screen.getByTestId('change-to-english'))
    
    expect(screen.getByTestId('current-language')).toHaveTextContent('en')
    expect(screen.getByTestId('translated-text')).toHaveTextContent('Loading...')
  })

  it('should format dates according to language', () => {
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    )

    const formattedDate = screen.getByTestId('formatted-date').textContent
    expect(formattedDate).toMatch(/1\/15\/2024|15\.1\.2024/) // US or other format

    // Change to Turkish and check date format
    fireEvent.click(screen.getByTestId('change-to-turkish'))
    
    const turkishFormattedDate = screen.getByTestId('formatted-date').textContent
    expect(turkishFormattedDate).toMatch(/15\.01\.2024|15\/1\/2024/) // Turkish format
  })

  it('should format numbers according to language', () => {
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    )

    const formattedNumber = screen.getByTestId('formatted-number').textContent
    expect(formattedNumber).toMatch(/1,234\.56|1\.234,56/) // US or European format
  })

  it('should format currency according to language', () => {
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    )

    const formattedCurrency = screen.getByTestId('formatted-currency').textContent
    expect(formattedCurrency).toMatch(/\$99\.99|\$\s*99\.99/) // USD format

    // Change to Turkish and check currency format
    fireEvent.click(screen.getByTestId('change-to-turkish'))
    
    const turkishFormattedCurrency = screen.getByTestId('formatted-currency').textContent
    expect(turkishFormattedCurrency).toMatch(/₺99,99|99,99\s*₺/) // TRY format
  })

  it('should persist language preference in localStorage', () => {
    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    )

    // Change to Turkish
    fireEvent.click(screen.getByTestId('change-to-turkish'))
    
    // Check localStorage
    expect(localStorage.getItem('eform-panel-language')).toBe('tr')

    // Change back to English
    fireEvent.click(screen.getByTestId('change-to-english'))
    
    // Check localStorage
    expect(localStorage.getItem('eform-panel-language')).toBe('en')
  })

  it('should handle missing translation keys gracefully', () => {
    function TestMissingKey() {
      const { t } = useI18n()
      return <div data-testid="missing-key">{t('nonexistent.key')}</div>
    }

    render(
      <I18nProvider>
        <TestMissingKey />
      </I18nProvider>
    )

    // Should return the key itself when translation is missing
    expect(screen.getByTestId('missing-key')).toHaveTextContent('nonexistent.key')
  })

  it('should initialize with saved language from localStorage', () => {
    // Pre-set Turkish in localStorage
    localStorage.setItem('eform-panel-language', 'tr')

    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    )

    expect(screen.getByTestId('current-language')).toHaveTextContent('tr')
    expect(screen.getByTestId('translated-text')).toHaveTextContent('Yükleniyor...')
  })

  it('should fall back to default language for unsupported languages', () => {
    // Pre-set unsupported language in localStorage
    localStorage.setItem('eform-panel-language', 'fr')

    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>
    )

    // Should fall back to English
    expect(screen.getByTestId('current-language')).toHaveTextContent('en')
    expect(screen.getByTestId('translated-text')).toHaveTextContent('Loading...')
  })
})