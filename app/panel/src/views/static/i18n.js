/**
 * Client-side i18n helper for Panel UI
 */
class PanelI18n {
    constructor() {
        this.currentLanguage = 'tr';
        this.messages = {};
        this.init();
    }

    async init() {
        try {
            // Load current language and messages from server
            const response = await fetch('/api/i18n/messages');
            const data = await response.json();
            
            this.currentLanguage = data.language;
            this.messages = data.messages;
            
            this.updateUI();
            this.setupLanguageSelector();
        } catch (error) {
            console.error('Failed to initialize i18n:', error);
        }
    }

    async setLanguage(language) {
        try {
            const response = await fetch('/api/i18n/language', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ language })
            });

            if (response.ok) {
                // Reload messages for new language
                await this.loadMessages();
                this.updateUI();
                this.updateLanguageSelector();
            }
        } catch (error) {
            console.error('Failed to set language:', error);
        }
    }

    async loadMessages() {
        try {
            const response = await fetch('/api/i18n/messages');
            const data = await response.json();
            
            this.currentLanguage = data.language;
            this.messages = data.messages;
        } catch (error) {
            console.error('Failed to load messages:', error);
        }
    }

    get(keyPath, params = {}) {
        const keys = keyPath.split('.');
        let message = this.messages;

        // Navigate through the nested object
        for (const key of keys) {
            if (message && typeof message === 'object' && key in message) {
                message = message[key];
            } else {
                // Return the key path if message not found
                return keyPath;
            }
        }

        if (typeof message !== 'string') {
            return keyPath;
        }

        // Replace parameters in message
        return this.replaceParams(message, params);
    }

    replaceParams(message, params) {
        let result = message;
        Object.keys(params).forEach(param => {
            const regex = new RegExp(`\\{${param}\\}`, 'g');
            result = result.replace(regex, String(params[param]));
        });
        return result;
    }

    updateUI() {
        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const params = this.getElementParams(element);
            element.textContent = this.get(key, params);
        });

        // Update all elements with data-i18n-placeholder attribute
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const params = this.getElementParams(element);
            element.placeholder = this.get(key, params);
        });

        // Update all elements with data-i18n-title attribute
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            const params = this.getElementParams(element);
            element.title = this.get(key, params);
        });

        // Update document language
        document.documentElement.lang = this.currentLanguage;
    }

    getElementParams(element) {
        const params = {};
        // Get parameters from data attributes
        Array.from(element.attributes).forEach(attr => {
            if (attr.name.startsWith('data-i18n-param-')) {
                const paramName = attr.name.replace('data-i18n-param-', '');
                params[paramName] = attr.value;
            }
        });
        return params;
    }

    setupLanguageSelector() {
        const languageSelector = document.getElementById('language-selector');
        if (languageSelector) {
            languageSelector.addEventListener('change', (e) => {
                this.setLanguage(e.target.value);
            });
            
            // Set current language in selector
            languageSelector.value = this.currentLanguage;
        }

        // Setup language buttons if they exist
        const trBtn = document.getElementById('lang-tr');
        const enBtn = document.getElementById('lang-en');
        
        if (trBtn && enBtn) {
            trBtn.addEventListener('click', () => this.setLanguage('tr'));
            enBtn.addEventListener('click', () => this.setLanguage('en'));
            
            this.updateLanguageButtons();
        }
    }

    updateLanguageSelector() {
        const languageSelector = document.getElementById('language-selector');
        if (languageSelector) {
            languageSelector.value = this.currentLanguage;
        }
        
        this.updateLanguageButtons();
    }

    updateLanguageButtons() {
        const trBtn = document.getElementById('lang-tr');
        const enBtn = document.getElementById('lang-en');
        
        if (trBtn && enBtn) {
            trBtn.classList.toggle('active', this.currentLanguage === 'tr');
            enBtn.classList.toggle('active', this.currentLanguage === 'en');
        }
    }

    // Helper method to format messages with dynamic content
    formatMessage(key, params = {}) {
        return this.get(key, params);
    }

    // Helper method to get section messages
    getSection(section) {
        return this.messages[section] || {};
    }
}

// Initialize i18n when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.panelI18n = new PanelI18n();
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PanelI18n;
}