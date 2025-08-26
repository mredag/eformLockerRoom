// Main Kiosk Application
class KioskApp {
    constructor() {
        this.currentScreen = 'main-screen';
        this.kioskId = 'kiosk-1';
        this.currentPin = '';
        this.pinAttempts = 0;
        this.maxPinAttempts = 5;
        this.pinLockoutMinutes = 5;
        this.isLocked = false;
        this.lockoutEndTime = null;
        this.availableLockers = [];
        this.allLockers = [];
        this.currentSessionId = null; // Track current RFID session
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupRfidKeyboardListener(); // Add RFID keyboard capture
        this.startClock();
        this.loadKioskInfo();
        this.checkPinLockout();
        
        // Show main screen initially
        this.showScreen('main-screen');
        
        // Start polling for RFID events and locker updates
        this.startPolling();
    }
    
    setupEventListeners() {
        // Navigation buttons
        document.getElementById('back-to-main')?.addEventListener('click', () => {
            this.showScreen('main-screen');
        });
        
        document.getElementById('back-to-main-from-master')?.addEventListener('click', () => {
            this.showScreen('main-screen');
            this.resetPin();
        });
        
        document.getElementById('back-to-main-from-lockers')?.addEventListener('click', () => {
            this.showScreen('main-screen');
        });
        
        // Master access button
        document.getElementById('master-btn')?.addEventListener('click', () => {
            if (this.isLocked) {
                this.showPinLockoutMessage();
            } else {
                this.showScreen('master-pin-screen');
                this.resetPin();
            }
        });
        
        // PIN keypad
        this.setupPinKeypad();
        
        // Handle window focus/blur for polling
        window.addEventListener('focus', () => this.startPolling());
        window.addEventListener('blur', () => this.stopPolling());
        
        // Handle visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopPolling();
            } else {
                this.startPolling();
            }
        });
    }
    
    setupRfidKeyboardListener() {
        let rfidBuffer = '';
        let rfidTimeout = null;
        
        console.log('🔧 Setting up RFID keyboard listener...');
        
        // Listen for keyboard events (RFID reader input)
        document.addEventListener('keydown', (event) => {
            // Only capture RFID input on main screen
            if (this.currentScreen !== 'main-screen') return;
            
            // Ignore if user is typing in an input field
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
            
            // Handle Enter key (end of RFID scan)
            if (event.key === 'Enter') {
                event.preventDefault();
                
                if (rfidBuffer.length > 0) {
                    console.log(`🔍 RFID Card Detected: ${rfidBuffer}`);
                    this.handleRfidCardInput(rfidBuffer.trim());
                    rfidBuffer = '';
                }
                
                if (rfidTimeout) {
                    clearTimeout(rfidTimeout);
                    rfidTimeout = null;
                }
                return;
            }
            
            // Handle numeric input (RFID card data)
            if (event.key >= '0' && event.key <= '9') {
                event.preventDefault();
                rfidBuffer += event.key;
                
                // Clear buffer after 2 seconds if no Enter received
                if (rfidTimeout) {
                    clearTimeout(rfidTimeout);
                }
                
                rfidTimeout = setTimeout(() => {
                    console.log('⏰ RFID input timeout - clearing buffer');
                    rfidBuffer = '';
                    rfidTimeout = null;
                }, 2000);
                
                return;
            }
            
            // Handle other characters that might be in RFID data
            if (event.key.length === 1 && /[A-Za-z0-9]/.test(event.key)) {
                event.preventDefault();
                rfidBuffer += event.key;
                
                // Reset timeout
                if (rfidTimeout) {
                    clearTimeout(rfidTimeout);
                }
                
                rfidTimeout = setTimeout(() => {
                    console.log('⏰ RFID input timeout - clearing buffer');
                    rfidBuffer = '';
                    rfidTimeout = null;
                }, 2000);
            }
        });
        
        console.log('✅ RFID keyboard listener ready');
    }
    
    async handleRfidCardInput(cardId) {
        console.log(`🎯 Processing RFID card: ${cardId}`);
        
        // Show visual feedback
        this.showStatusMessage('card_detected', { card: cardId }, 'info');
        
        // Process the card
        await this.handleCardScanned(cardId);
    }
    
    setupPinKeypad() {
        const keypad = document.querySelector('.pin-keypad');
        if (!keypad) return;
        
        keypad.addEventListener('click', (e) => {
            const btn = e.target.closest('.pin-btn');
            if (!btn || this.isLocked) return;
            
            const digit = btn.getAttribute('data-digit');
            const action = btn.getAttribute('data-action');
            
            if (digit) {
                this.addPinDigit(digit);
            } else if (action === 'clear') {
                this.clearPin();
            } else if (action === 'enter') {
                this.submitPin();
            }
        });
    }
    
    addPinDigit(digit) {
        if (this.currentPin.length < 4) {
            this.currentPin += digit;
            this.updatePinDisplay();
            
            // Auto-submit when 4 digits entered
            if (this.currentPin.length === 4) {
                setTimeout(() => this.submitPin(), 300);
            }
        }
    }
    
    clearPin() {
        this.currentPin = '';
        this.updatePinDisplay();
        this.updatePinStatus('enter_master_pin');
    }
    
    resetPin() {
        this.currentPin = '';
        this.updatePinDisplay();
        this.updatePinStatus('enter_master_pin');
    }
    
    updatePinDisplay() {
        const dots = document.querySelectorAll('.pin-dot');
        dots.forEach((dot, index) => {
            dot.classList.toggle('filled', index < this.currentPin.length);
        });
    }
    
    updatePinStatus(messageKey, params = {}, isError = false) {
        const statusEl = document.getElementById('pin-status');
        if (statusEl) {
            const p = statusEl.querySelector('p');
            if (p) {
                p.textContent = window.i18n.get(messageKey, params);
                p.className = isError ? 'error' : '';
            }
        }
    }
    
    async submitPin() {
        if (this.currentPin.length !== 4) return;
        
        this.showLoading('Verifying PIN...');
        
        try {
            const response = await fetch('/api/master/verify-pin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    pin: this.currentPin,
                    kiosk_id: this.kioskId
                })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                // PIN correct - show master locker screen
                this.pinAttempts = 0;
                this.hideLoading();
                await this.loadAllLockers();
                this.showScreen('master-locker-screen');
                this.resetPin();
            } else {
                // PIN incorrect
                this.pinAttempts++;
                this.hideLoading();
                
                if (this.pinAttempts >= this.maxPinAttempts) {
                    this.lockPinEntry();
                } else {
                    const remaining = this.maxPinAttempts - this.pinAttempts;
                    this.updatePinStatus('pin_attempts_remaining', { attempts: remaining }, true);
                    this.clearPin();
                }
            }
        } catch (error) {
            console.error('PIN verification error:', error);
            this.hideLoading();
            this.updatePinStatus('error_network', {}, true);
            this.clearPin();
        }
    }
    
    lockPinEntry() {
        this.isLocked = true;
        this.lockoutEndTime = Date.now() + (this.pinLockoutMinutes * 60 * 1000);
        localStorage.setItem('pin-lockout-end', this.lockoutEndTime.toString());
        
        this.updatePinStatus('pin_locked', { minutes: this.pinLockoutMinutes }, true);
        this.clearPin();
        
        // Set timer to unlock
        setTimeout(() => {
            this.unlockPinEntry();
        }, this.pinLockoutMinutes * 60 * 1000);
    }
    
    unlockPinEntry() {
        this.isLocked = false;
        this.lockoutEndTime = null;
        this.pinAttempts = 0;
        localStorage.removeItem('pin-lockout-end');
        this.updatePinStatus('enter_master_pin');
    }
    
    checkPinLockout() {
        const lockoutEnd = localStorage.getItem('pin-lockout-end');
        if (lockoutEnd) {
            const endTime = parseInt(lockoutEnd);
            if (Date.now() < endTime) {
                this.isLocked = true;
                this.lockoutEndTime = endTime;
                const remainingMs = endTime - Date.now();
                const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
                
                this.updatePinStatus('pin_locked', { minutes: remainingMinutes }, true);
                
                // Set timer to unlock
                setTimeout(() => {
                    this.unlockPinEntry();
                }, remainingMs);
            } else {
                localStorage.removeItem('pin-lockout-end');
            }
        }
    }
    
    showPinLockoutMessage() {
        if (this.lockoutEndTime) {
            const remainingMs = this.lockoutEndTime - Date.now();
            const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
            this.showStatusMessage('pin_locked', { minutes: remainingMinutes }, 'error');
        }
    }
    
    showScreen(screenId) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        // Show target screen
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
            this.currentScreen = screenId;
        }
    }
    
    showLoading(message = 'Loading...') {
        const overlay = document.getElementById('loading-overlay');
        const text = document.getElementById('loading-text');
        
        if (overlay && text) {
            text.textContent = message;
            overlay.classList.add('show');
        }
    }
    
    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.remove('show');
        }
    }
    
    showStatusMessage(messageKey, params = {}, type = 'info', duration = 5000) {
        const messageEl = document.getElementById('status-message');
        if (!messageEl) return;
        
        messageEl.textContent = window.i18n.get(messageKey, params);
        messageEl.className = `status-message show ${type}`;
        
        // Auto-hide after duration
        setTimeout(() => {
            messageEl.classList.remove('show');
        }, duration);
    }
    
    startClock() {
        const updateClock = () => {
            const now = new Date();
            const timeString = now.toLocaleTimeString('tr-TR', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const timeEl = document.getElementById('current-time');
            if (timeEl) {
                timeEl.textContent = timeString;
            }
        };
        
        updateClock();
        setInterval(updateClock, 1000);
    }
    
    async loadKioskInfo() {
        try {
            const response = await fetch('/health');
            const data = await response.json();
            
            if (data.kiosk_id) {
                this.kioskId = data.kiosk_id;
                const kioskEl = document.getElementById('kiosk-id');
                if (kioskEl) {
                    kioskEl.textContent = `Kiosk: ${this.kioskId}`;
                }
            }
        } catch (error) {
            console.error('Failed to load kiosk info:', error);
        }
    }
    
    startPolling() {
        if (this.pollingInterval) return;
        
        this.pollingInterval = setInterval(() => {
            this.pollForUpdates();
        }, 2000); // Poll every 2 seconds
    }
    
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }
    
    async pollForUpdates() {
        try {
            // Check for RFID events
            await this.checkRfidEvents();
            
            // Update locker status if on relevant screens
            if (this.currentScreen === 'locker-selection-screen') {
                await this.loadAvailableLockers();
            } else if (this.currentScreen === 'master-locker-screen') {
                await this.loadAllLockers();
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
    }
    
    async checkRfidEvents() {
        try {
            const response = await fetch(`/api/rfid/events?kiosk_id=${this.kioskId}`);
            if (response.ok) {
                const events = await response.json();
                
                for (const event of events) {
                    await this.handleRfidEvent(event);
                }
            }
        } catch (error) {
            console.error('RFID event check error:', error);
        }
    }
    
    async handleRfidEvent(event) {
        switch (event.type) {
            case 'card_scanned':
                await this.handleCardScanned(event.card_id);
                break;
            case 'locker_assigned':
                this.showStatusMessage('opening', { id: event.locker_id }, 'info');
                break;
            case 'locker_opened':
                this.showStatusMessage('opened_released', { id: event.locker_id }, 'success');
                break;
            case 'locker_failed':
                this.showStatusMessage('failed_open', {}, 'error');
                break;
        }
    }
    
    async handleCardScanned(cardId) {
        if (this.currentScreen !== 'main-screen') return;
        
        this.showLoading('Processing card...');
        
        try {
            const response = await fetch('/api/rfid/handle-card', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    card_id: cardId,
                    kiosk_id: this.kioskId
                })
            });
            
            const result = await response.json();
            this.hideLoading();
            
            if (result.action === 'show_lockers') {
                this.availableLockers = result.lockers;
                this.currentSessionId = result.session_id; // Store session ID
                this.renderLockerGrid();
                this.showScreen('locker-selection-screen');
            } else if (result.action === 'open_locker') {
                this.showStatusMessage('opening', { id: result.locker_id }, 'info');
            } else if (result.error) {
                this.showStatusMessage(result.error, {}, 'error');
            }
        } catch (error) {
            console.error('Card handling error:', error);
            this.hideLoading();
            this.showStatusMessage('error_network', {}, 'error');
        }
    }
    
    async loadAvailableLockers() {
        try {
            const response = await fetch(`/api/lockers/available?kiosk_id=${this.kioskId}`);
            if (response.ok) {
                const lockers = await response.json();
                this.availableLockers = lockers;
                this.renderLockerGrid();
            }
        } catch (error) {
            console.error('Failed to load available lockers:', error);
        }
    }
    
    async loadAllLockers() {
        try {
            const response = await fetch(`/api/lockers/all?kiosk_id=${this.kioskId}`);
            if (response.ok) {
                const lockers = await response.json();
                this.allLockers = lockers;
                this.renderMasterLockerGrid();
            }
        } catch (error) {
            console.error('Failed to load all lockers:', error);
        }
    }
    
    renderLockerGrid() {
        const grid = document.getElementById('locker-grid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        if (this.availableLockers.length === 0) {
            const noLockersMsg = document.createElement('div');
            noLockersMsg.className = 'no-lockers-message';
            noLockersMsg.textContent = window.i18n.get('no_lockers');
            grid.appendChild(noLockersMsg);
            return;
        }
        
        this.availableLockers.forEach(locker => {
            const btn = this.createLockerButton(locker, true);
            grid.appendChild(btn);
        });
    }
    
    renderMasterLockerGrid() {
        const grid = document.getElementById('master-locker-grid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        this.allLockers.forEach(locker => {
            const btn = this.createLockerButton(locker, false);
            grid.appendChild(btn);
        });
    }
    
    createLockerButton(locker, isSelectable) {
        const btn = document.createElement('button');
        btn.className = `locker-btn ${locker.status.toLowerCase()}`;
        
        if (isSelectable && locker.status === 'Free') {
            btn.addEventListener('click', () => this.selectLocker(locker.id));
        } else if (!isSelectable) {
            btn.addEventListener('click', () => this.masterOpenLocker(locker.id));
        }
        
        const number = document.createElement('div');
        number.className = 'locker-number';
        number.textContent = locker.id;
        
        const status = document.createElement('div');
        status.className = 'locker-status';
        status.textContent = window.i18n.get(`status_${locker.status.toLowerCase()}`);
        
        btn.appendChild(number);
        btn.appendChild(status);
        
        return btn;
    }
    
    async selectLocker(lockerId) {
        this.showLoading('Assigning locker...');
        
        try {
            const response = await fetch('/api/lockers/select', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    locker_id: lockerId,
                    kiosk_id: this.kioskId,
                    session_id: this.currentSessionId // Include session ID
                })
            });
            
            const result = await response.json();
            this.hideLoading();
            
            if (result.success) {
                this.showStatusMessage('opening', { id: lockerId }, 'info');
                this.currentSessionId = null; // Clear session after use
                this.showScreen('main-screen');
            } else {
                this.showStatusMessage(result.error || 'error_unknown', {}, 'error');
            }
        } catch (error) {
            console.error('Locker selection error:', error);
            this.hideLoading();
            this.showStatusMessage('error_network', {}, 'error');
        }
    }
    
    async masterOpenLocker(lockerId) {
        this.showLoading('Opening locker...');
        
        try {
            const response = await fetch('/api/master/open-locker', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    locker_id: lockerId,
                    kiosk_id: this.kioskId
                })
            });
            
            const result = await response.json();
            this.hideLoading();
            
            if (result.success) {
                this.showStatusMessage('locker_opened', {}, 'success');
                // Refresh the grid to show updated status
                await this.loadAllLockers();
            } else {
                this.showStatusMessage(result.error || 'error_unknown', {}, 'error');
            }
        } catch (error) {
            console.error('Master open error:', error);
            this.hideLoading();
            this.showStatusMessage('error_network', {}, 'error');
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.kioskApp = new KioskApp();
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KioskApp;
}