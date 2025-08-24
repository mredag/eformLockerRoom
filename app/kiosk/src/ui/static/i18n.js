// Internationalization system for Kiosk UI
class I18n {
    constructor() {
        this.currentLanguage = 'tr';
        this.messages = {
            kiosk: {},
            qr: {}
        };
        
        this.init();
    }
    
    async init() {
        // Load saved language preference
        const savedLang = localStorage.getItem('kiosk-language');
        if (savedLang) {
            this.currentLanguage = savedLang;
        }
        
        // Load messages from server
        await this.loadMessages();
        this.updateUI();
        this.setupLanguageButtons();
    }

    async loadMessages() {
        try {
            const response = await fetch('/api/i18n/kiosk');
            const data = await response.json();
            
            this.currentLanguage = data.currentLanguage;
            this.messages = data.messages;
        } catch (error) {
            console.error('Failed to load i18n messages:', error);
            // Fallback to basic messages if server is unavailable
            this.messages = {
                kiosk: {
                    scan_card: this.currentLanguage === 'tr' ? 'Kart okutunuz' : 'Scan your card',
                    error_network: this.currentLanguage === 'tr' ? 'Ağ hatası' : 'Network error',
                    text_size_toggle: this.currentLanguage === 'tr' ? 'Metin Boyutu' : 'Text Size',
                    text_size: this.currentLanguage === 'tr' ? 'A' : 'A',
                    text_size_large: this.currentLanguage === 'tr' ? 'Büyük metin boyutu' : 'Large text size',
                    text_size_normal: this.currentLanguage === 'tr' ? 'Normal metin boyutu' : 'Normal text size',
                    lock_failure_title: this.currentLanguage === 'tr' ? 'Dolap Açılamadı' : 'Lock Failed',
                    lock_failure_message: this.currentLanguage === 'tr' ? 'Dolap açılırken bir sorun oluştu' : 'There was a problem opening the locker',
                    lock_failure_description: this.currentLanguage === 'tr' ? 'Lütfen tekrar deneyin veya yardım isteyin.' : 'Please try again or request help.',
                    retry: this.currentLanguage === 'tr' ? 'Tekrar Dene' : 'Retry',
                    get_help: this.currentLanguage === 'tr' ? 'Yardım İste' : 'Get Help',
                    retry_failed: this.currentLanguage === 'tr' ? 'Tekrar deneme başarısız' : 'Retry failed',
                    lock_failure_help_note: this.currentLanguage === 'tr' ? 'Dolap açılmadı, yardıma ihtiyacım var.' : 'Locker failed to open, I need help.',
                    back: this.currentLanguage === 'tr' ? 'Geri' : 'Back',
                    skip_to_main: this.currentLanguage === 'tr' ? 'Ana içeriğe geç' : 'Skip to main content',
                    category_lock_problem: this.currentLanguage === 'tr' ? 'Dolap Sorunu' : 'Lock Problem',
                    category_other: this.currentLanguage === 'tr' ? 'Diğer' : 'Other'
                },
                qr: {}
            };
        }
    }
    
    async setLanguage(lang) {
        try {
            const response = await fetch('/api/i18n/kiosk/language', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ language: lang })
            });

            if (response.ok) {
                const data = await response.json();
                this.currentLanguage = data.currentLanguage;
                this.messages = data.messages;
                localStorage.setItem('kiosk-language', lang);
                this.updateUI();
                this.updateLanguageButtons();
                
                // Trigger custom event for other components to react to language change
                window.dispatchEvent(new CustomEvent('languageChanged', {
                    detail: { language: lang, messages: this.messages }
                }));
            }
        } catch (error) {
            console.error('Failed to set language:', error);
        }
    }
    
    get(key, params = {}) {
        // Check if key has section prefix (e.g., 'kiosk.scan_card')
        let message;
        if (key.includes('.')) {
            const [section, messageKey] = key.split('.');
            message = this.messages[section]?.[messageKey] || key;
        } else {
            // Default to kiosk section for backward compatibility
            message = this.messages.kiosk?.[key] || key;
        }
        
        // Replace parameters in message
        Object.keys(params).forEach(param => {
            message = message.replace(new RegExp(`\\{${param}\\}`, 'g'), params[param]);
        });
        
        return message;
    }
    
    updateUI() {
        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translatedText = this.get(key);
            
            // Handle different element types
            if (element.tagName === 'INPUT' && element.type === 'text') {
                element.placeholder = translatedText;
            } else if (element.tagName === 'INPUT' && element.type === 'number') {
                element.placeholder = translatedText;
            } else if (element.tagName === 'TEXTAREA') {
                element.placeholder = translatedText;
            } else {
                element.textContent = translatedText;
            }
        });
        
        // Update document language
        document.documentElement.lang = this.currentLanguage;
        
        // Update title attributes for accessibility
        document.querySelectorAll('[title]').forEach(element => {
            const titleKey = element.getAttribute('data-title-i18n');
            if (titleKey) {
                element.title = this.get(titleKey);
            }
        });
    }
    
    setupLanguageButtons() {
        const trBtn = document.getElementById('lang-tr');
        const enBtn = document.getElementById('lang-en');
        
        if (trBtn && enBtn) {
            trBtn.addEventListener('click', () => this.setLanguage('tr'));
            enBtn.addEventListener('click', () => this.setLanguage('en'));
            
            this.updateLanguageButtons();
        }
    }
    
    updateLanguageButtons() {
        const trBtn = document.getElementById('lang-tr');
        const enBtn = document.getElementById('lang-en');
        
        if (trBtn && enBtn) {
            trBtn.classList.toggle('active', this.currentLanguage === 'tr');
            enBtn.classList.toggle('active', this.currentLanguage === 'en');
        }
    }
}

// Initialize i18n when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    window.i18n = new I18n();
    await window.i18n.init();
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = I18n;
}