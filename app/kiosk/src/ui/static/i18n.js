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
            // Fallback to comprehensive Turkish error catalog
            this.messages = {
                kiosk: {
                    // Basic UI Messages - Exact Turkish copy as per requirements
                    scan_card: this.currentLanguage === 'tr' ? 'Kart okutunuz' : 'Scan your card',
                    card_detected: this.currentLanguage === 'tr' ? 'Kart okundu. Seçim için dokunun' : 'Card detected. Touch to select',
                    session_timeout: this.currentLanguage === 'tr' ? 'Oturum zaman aşımı' : 'Session timeout',
                    locker_opening: this.currentLanguage === 'tr' ? 'Dolap açılıyor' : 'Locker opening',
                    locker_opened: this.currentLanguage === 'tr' ? 'Dolap açıldı' : 'Locker opened',
                    locker_failed: this.currentLanguage === 'tr' ? 'Açılamadı' : 'Failed to open',
                    
                    // Comprehensive Error Messages - Requirements 7.1-7.5
                    hardware_disconnected: this.currentLanguage === 'tr' ? 'Donanım bağlı değil. Sistem bakımda' : 'Hardware not connected. System under maintenance',
                    locker_busy: this.currentLanguage === 'tr' ? 'Dolap dolu' : 'Locker busy',
                    general_error: this.currentLanguage === 'tr' ? 'İşlem yapılamadı' : 'Operation failed',
                    network_error: this.currentLanguage === 'tr' ? 'Ağ hatası' : 'Network error',
                    system_error: this.currentLanguage === 'tr' ? 'Sistem hatası' : 'System error',
                    
                    // Connection Status Messages - Requirements 6.3-6.5
                    connection_lost: this.currentLanguage === 'tr' ? 'Çevrimdışı' : 'Offline',
                    connection_restored: this.currentLanguage === 'tr' ? 'Yeniden bağlandı' : 'Reconnected',
                    last_update: this.currentLanguage === 'tr' ? 'Son güncelleme' : 'Last update',
                    
                    // Session Management Messages
                    new_card_detected: this.currentLanguage === 'tr' ? 'Yeni kart okundu. Önceki oturum kapatıldı.' : 'New card detected. Previous session closed.',
                    
                    // Recovery Suggestions - Requirements 7.5
                    try_different_locker: this.currentLanguage === 'tr' ? 'Farklı dolap seçin' : 'Try a different locker',
                    try_again: this.currentLanguage === 'tr' ? 'Tekrar deneyin' : 'Try again',
                    contact_staff: this.currentLanguage === 'tr' ? 'Görevliye başvurun' : 'Contact staff',
                    
                    // Additional Error Types
                    no_lockers_available: this.currentLanguage === 'tr' ? 'Müsait dolap yok' : 'No lockers available',
                    locker_not_available: this.currentLanguage === 'tr' ? 'Dolap müsait değil' : 'Locker not available',
                    invalid_selection: this.currentLanguage === 'tr' ? 'Geçersiz seçim' : 'Invalid selection',
                    operation_timeout: this.currentLanguage === 'tr' ? 'İşlem zaman aşımı' : 'Operation timeout',
                    service_unavailable: this.currentLanguage === 'tr' ? 'Servis kullanılamıyor' : 'Service unavailable',
                    
                    // Status Messages
                    connecting: this.currentLanguage === 'tr' ? 'Bağlanıyor...' : 'Connecting...',
                    reconnecting: this.currentLanguage === 'tr' ? 'Yeniden bağlanıyor...' : 'Reconnecting...',
                    loading: this.currentLanguage === 'tr' ? 'Yükleniyor...' : 'Loading...',
                    processing: this.currentLanguage === 'tr' ? 'İşleniyor...' : 'Processing...'
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
    
    /**
     * Display error message with recovery suggestions
     * @param {string} errorType - Error type key from ERROR_MESSAGES
     * @param {string} recoveryType - Recovery suggestion key from RECOVERY_SUGGESTIONS
     * @param {number} duration - Display duration in milliseconds (default: 5000)
     */
    showError(errorType, recoveryType = null, duration = 5000) {
        const errorMessage = this.get(errorType);
        const recoveryMessage = recoveryType ? this.get(recoveryType) : null;
        
        // Create error banner if it doesn't exist
        let errorBanner = document.getElementById('error-banner');
        if (!errorBanner) {
            errorBanner = document.createElement('div');
            errorBanner.id = 'error-banner';
            errorBanner.className = 'error-banner hidden';
            document.body.appendChild(errorBanner);
        }
        
        // Set error content
        errorBanner.innerHTML = `
            <div class="error-content">
                <div class="error-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                </div>
                <div class="error-text">
                    <div class="error-message">${errorMessage}</div>
                    ${recoveryMessage ? `<div class="recovery-suggestion">${recoveryMessage}</div>` : ''}
                </div>
                <button class="error-close" onclick="this.parentElement.parentElement.classList.add('hidden')">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        `;
        
        // Show error banner
        errorBanner.classList.remove('hidden');
        
        // Auto-hide after duration
        if (duration > 0) {
            setTimeout(() => {
                errorBanner.classList.add('hidden');
            }, duration);
        }
        
        console.error(`🚨 Error: ${errorMessage}${recoveryMessage ? ` | Recovery: ${recoveryMessage}` : ''}`);
    }
    
    /**
     * Display connection status indicator
     * @param {string} status - Connection status: 'online', 'offline', 'reconnecting'
     */
    showConnectionStatus(status) {
        let statusIndicator = document.getElementById('connection-status');
        if (!statusIndicator) {
            statusIndicator = document.createElement('div');
            statusIndicator.id = 'connection-status';
            statusIndicator.className = 'connection-status';
            document.body.appendChild(statusIndicator);
        }
        
        // Update status content based on connection state
        switch (status) {
            case 'offline':
                statusIndicator.innerHTML = `
                    <div class="status-content offline">
                        <div class="status-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </div>
                        <span>${this.get('connection_lost')}</span>
                    </div>
                `;
                statusIndicator.classList.remove('hidden');
                break;
                
            case 'reconnecting':
                statusIndicator.innerHTML = `
                    <div class="status-content reconnecting">
                        <div class="status-icon spinner">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 12a9 9 0 11-6.219-8.56"/>
                            </svg>
                        </div>
                        <span>${this.get('reconnecting')}</span>
                    </div>
                `;
                statusIndicator.classList.remove('hidden');
                break;
                
            case 'online':
                // Show reconnected message briefly, then hide
                statusIndicator.innerHTML = `
                    <div class="status-content online">
                        <div class="status-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 12l2 2 4-4"/>
                            </svg>
                        </div>
                        <span>${this.get('connection_restored')}</span>
                    </div>
                `;
                statusIndicator.classList.remove('hidden');
                
                // Hide after 3 seconds
                setTimeout(() => {
                    statusIndicator.classList.add('hidden');
                }, 3000);
                break;
                
            default:
                statusIndicator.classList.add('hidden');
        }
    }
    
    /**
     * Update and display "Son güncelleme" timestamp
     * @param {Date} timestamp - Last update timestamp
     */
    updateLastUpdateTime(timestamp = new Date()) {
        let lastUpdateElement = document.getElementById('last-update-time');
        if (!lastUpdateElement) {
            lastUpdateElement = document.createElement('div');
            lastUpdateElement.id = 'last-update-time';
            lastUpdateElement.className = 'last-update-time';
            
            // Add to legend bar
            const legendBar = document.getElementById('legend-bar');
            if (legendBar) {
                legendBar.appendChild(lastUpdateElement);
            } else {
                document.body.appendChild(lastUpdateElement);
            }
        }
        
        const timeString = timestamp.toLocaleTimeString(this.currentLanguage === 'tr' ? 'tr-TR' : 'en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        lastUpdateElement.innerHTML = `
            <span class="update-label">${this.get('last_update')}:</span>
            <span class="update-time">${timeString}</span>
        `;
    }
    
    /**
     * Get error message with recovery suggestion
     * @param {string} errorType - Error type
     * @returns {object} Object with error message and suggested recovery
     */
    getErrorWithRecovery(errorType) {
        const errorMessages = {
            hardware_disconnected: { error: 'hardware_disconnected', recovery: 'contact_staff' },
            locker_busy: { error: 'locker_busy', recovery: 'try_different_locker' },
            general_error: { error: 'general_error', recovery: 'try_again' },
            network_error: { error: 'network_error', recovery: 'try_again' },
            system_error: { error: 'system_error', recovery: 'contact_staff' },
            operation_timeout: { error: 'operation_timeout', recovery: 'try_again' },
            service_unavailable: { error: 'service_unavailable', recovery: 'contact_staff' }
        };
        
        const errorConfig = errorMessages[errorType] || { error: errorType, recovery: 'try_again' };
        
        return {
            message: this.get(errorConfig.error),
            recovery: this.get(errorConfig.recovery)
        };
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