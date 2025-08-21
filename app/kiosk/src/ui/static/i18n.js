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
                    error_network: this.currentLanguage === 'tr' ? 'Ağ hatası' : 'Network error'
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
            element.textContent = this.get(key);
        });
        
        // Update document language
        document.documentElement.lang = this.currentLanguage;
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