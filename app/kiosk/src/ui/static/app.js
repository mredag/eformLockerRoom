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
        this.isLargeText = false;
        this.lastFailedLockerId = null;
        this.helpRequest = {
            category: null,
            lockerNumber: null,
            note: '',
            contact: '',
            photo: null
        };
        this.lockoutTimerInterval = null;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupAccessibilityFeatures();
        this.setupKeyboardNavigation();
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
        
        document.getElementById('back-to-main-from-help')?.addEventListener('click', () => {
            this.showScreen('main-screen');
            this.resetHelpForm();
        });
        
        document.getElementById('back-to-main-from-success')?.addEventListener('click', () => {
            this.showScreen('main-screen');
        });
        
        document.getElementById('back-to-main-from-failure')?.addEventListener('click', () => {
            this.showScreen('main-screen');
        });
        
        // Lock failure screen buttons
        document.getElementById('retry-lock-btn')?.addEventListener('click', () => {
            this.retryLockOperation();
        });
        
        document.getElementById('help-from-failure-btn')?.addEventListener('click', () => {
            this.showScreen('help-request-screen');
            this.resetHelpForm();
            // Pre-fill with lock problem category and locker number
            if (this.lastFailedLockerId) {
                this.helpRequest.category = 'lock_problem';
                this.helpRequest.lockerNumber = this.lastFailedLockerId;
                this.updateHelpFormFromFailure();
            }
            this.checkCameraAvailability();
        });
        
        // Help button
        document.getElementById('help-btn')?.addEventListener('click', () => {
            this.showScreen('help-request-screen');
            this.resetHelpForm();
            this.checkCameraAvailability();
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
        
        // Help form
        this.setupHelpForm();
        
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
        
        // Handle language changes
        window.addEventListener('languageChanged', (e) => {
            this.onLanguageChanged(e.detail);
        });
    }
    
    setupAccessibilityFeatures() {
        // Text size toggle
        const textSizeToggle = document.getElementById('text-size-toggle');
        if (textSizeToggle) {
            textSizeToggle.addEventListener('click', () => {
                this.toggleTextSize();
            });
        }
        
        // Load saved text size preference
        const savedTextSize = localStorage.getItem('kiosk-text-size');
        if (savedTextSize === 'large') {
            this.enableLargeText();
        }
    }
    
    setupKeyboardNavigation() {
        // Add keyboard event listeners for navigation
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardNavigation(e);
        });
        
        // Ensure all interactive elements are focusable
        this.ensureFocusableElements();
    }
    
    handleKeyboardNavigation(e) {
        switch (e.key) {
            case 'Escape':
                // Go back to main screen or previous screen
                if (this.currentScreen !== 'main-screen') {
                    this.showScreen('main-screen');
                }
                break;
            case 'Enter':
                // Activate focused element
                if (document.activeElement && document.activeElement.click) {
                    document.activeElement.click();
                }
                break;
            case 'Tab':
                // Let default tab behavior work, but ensure proper focus management
                this.manageFocus(e);
                break;
            case 'ArrowUp':
            case 'ArrowDown':
            case 'ArrowLeft':
            case 'ArrowRight':
                // Navigate between locker buttons or PIN buttons
                this.handleArrowNavigation(e);
                break;
        }
    }
    
    manageFocus(e) {
        // Ensure focus stays within the current screen
        const currentScreenEl = document.getElementById(this.currentScreen);
        if (!currentScreenEl) return;
        
        const focusableElements = currentScreenEl.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        
        if (focusableElements.length === 0) return;
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
        }
    }
    
    handleArrowNavigation(e) {
        // Handle arrow key navigation for grids (lockers, PIN pad)
        if (this.currentScreen === 'locker-selection-screen' || this.currentScreen === 'master-locker-screen') {
            this.navigateLockerGrid(e);
        } else if (this.currentScreen === 'master-pin-screen') {
            this.navigatePinKeypad(e);
        }
    }
    
    navigateLockerGrid(e) {
        const grid = this.currentScreen === 'locker-selection-screen' 
            ? document.getElementById('locker-grid')
            : document.getElementById('master-locker-grid');
        
        if (!grid) return;
        
        const buttons = Array.from(grid.querySelectorAll('.locker-btn:not([disabled])'));
        const currentIndex = buttons.indexOf(document.activeElement);
        
        if (currentIndex === -1) return;
        
        let newIndex = currentIndex;
        const gridWidth = Math.floor(grid.offsetWidth / buttons[0].offsetWidth);
        
        switch (e.key) {
            case 'ArrowLeft':
                newIndex = Math.max(0, currentIndex - 1);
                break;
            case 'ArrowRight':
                newIndex = Math.min(buttons.length - 1, currentIndex + 1);
                break;
            case 'ArrowUp':
                newIndex = Math.max(0, currentIndex - gridWidth);
                break;
            case 'ArrowDown':
                newIndex = Math.min(buttons.length - 1, currentIndex + gridWidth);
                break;
        }
        
        if (newIndex !== currentIndex) {
            e.preventDefault();
            buttons[newIndex].focus();
        }
    }
    
    navigatePinKeypad(e) {
        const keypad = document.querySelector('.pin-keypad');
        if (!keypad) return;
        
        const buttons = Array.from(keypad.querySelectorAll('.pin-btn'));
        const currentIndex = buttons.indexOf(document.activeElement);
        
        if (currentIndex === -1) return;
        
        let newIndex = currentIndex;
        
        switch (e.key) {
            case 'ArrowLeft':
                newIndex = currentIndex > 0 ? currentIndex - 1 : buttons.length - 1;
                break;
            case 'ArrowRight':
                newIndex = currentIndex < buttons.length - 1 ? currentIndex + 1 : 0;
                break;
            case 'ArrowUp':
                newIndex = currentIndex >= 3 ? currentIndex - 3 : currentIndex + 9;
                if (newIndex >= buttons.length) newIndex = currentIndex;
                break;
            case 'ArrowDown':
                newIndex = currentIndex + 3;
                if (newIndex >= buttons.length) newIndex = currentIndex % 3;
                break;
        }
        
        if (newIndex !== currentIndex && newIndex < buttons.length) {
            e.preventDefault();
            buttons[newIndex].focus();
        }
    }
    
    ensureFocusableElements() {
        // Ensure all interactive elements have proper tabindex
        document.querySelectorAll('button, input, textarea').forEach(element => {
            if (!element.hasAttribute('tabindex') && !element.disabled) {
                element.setAttribute('tabindex', '0');
            }
        });
    }
    
    toggleTextSize() {
        this.isLargeText = !this.isLargeText;
        
        if (this.isLargeText) {
            this.enableLargeText();
        } else {
            this.disableLargeText();
        }
        
        // Save preference
        localStorage.setItem('kiosk-text-size', this.isLargeText ? 'large' : 'normal');
    }
    
    enableLargeText() {
        document.body.classList.add('large-text');
        const toggleBtn = document.getElementById('text-size-toggle');
        if (toggleBtn) {
            toggleBtn.classList.add('large-text');
            toggleBtn.setAttribute('title', window.i18n?.get('text_size_normal') || 'Normal metin boyutu');
            toggleBtn.setAttribute('data-title-i18n', 'text_size_normal');
        }
        this.isLargeText = true;
    }
    
    disableLargeText() {
        document.body.classList.remove('large-text');
        const toggleBtn = document.getElementById('text-size-toggle');
        if (toggleBtn) {
            toggleBtn.classList.remove('large-text');
            toggleBtn.setAttribute('title', window.i18n?.get('text_size_large') || 'Büyük metin boyutu');
            toggleBtn.setAttribute('data-title-i18n', 'text_size_large');
        }
        this.isLargeText = false;
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
            } else if (response.status === 429) {
                // Locked out by server
                this.hideLoading();
                this.handleServerLockout(result.remaining_seconds || 0);
            } else {
                // PIN incorrect
                this.hideLoading();
                
                if (result.attempts_remaining !== undefined) {
                    if (result.attempts_remaining === 0) {
                        this.handleServerLockout(result.remaining_seconds || 0);
                    } else {
                        this.updatePinStatus('pin_attempts_remaining', { attempts: result.attempts_remaining }, true);
                        this.clearPin();
                    }
                } else {
                    // Fallback to client-side attempt tracking
                    this.pinAttempts++;
                    if (this.pinAttempts >= this.maxPinAttempts) {
                        this.lockPinEntry();
                    } else {
                        const remaining = this.maxPinAttempts - this.pinAttempts;
                        this.updatePinStatus('pin_attempts_remaining', { attempts: remaining }, true);
                        this.clearPin();
                    }
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
        this.startLockoutTimer();
        this.disablePinKeypad();
        
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
        this.stopLockoutTimer();
        this.enablePinKeypad();
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
                this.startLockoutTimer();
                
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
    
    startLockoutTimer() {
        if (this.lockoutTimerInterval) {
            clearInterval(this.lockoutTimerInterval);
        }
        
        this.lockoutTimerInterval = setInterval(() => {
            if (this.lockoutEndTime && Date.now() < this.lockoutEndTime) {
                const remainingMs = this.lockoutEndTime - Date.now();
                const remainingSeconds = Math.ceil(remainingMs / 1000);
                const minutes = Math.floor(remainingSeconds / 60);
                const seconds = remainingSeconds % 60;
                
                const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                this.updatePinStatus('pin_locked_timer', { time: timeString }, true);
            } else {
                this.unlockPinEntry();
            }
        }, 1000);
    }
    
    handleServerLockout(remainingSeconds) {
        this.isLocked = true;
        this.lockoutEndTime = Date.now() + (remainingSeconds * 1000);
        localStorage.setItem('pin-lockout-end', this.lockoutEndTime.toString());
        
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        this.updatePinStatus('pin_locked_timer', { time: timeString }, true);
        this.clearPin();
        this.startLockoutTimer();
        this.disablePinKeypad();
        
        // Set timer to unlock
        setTimeout(() => {
            this.unlockPinEntry();
        }, remainingSeconds * 1000);
    }
    
    stopLockoutTimer() {
        if (this.lockoutTimerInterval) {
            clearInterval(this.lockoutTimerInterval);
            this.lockoutTimerInterval = null;
        }
    }
    
    disablePinKeypad() {
        const pinEntry = document.querySelector('.pin-entry');
        if (pinEntry) {
            pinEntry.classList.add('locked');
        }
    }
    
    enablePinKeypad() {
        const pinEntry = document.querySelector('.pin-entry');
        if (pinEntry) {
            pinEntry.classList.remove('locked');
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
                this.lastFailedLockerId = event.locker_id;
                this.showLockFailureScreen(event.locker_id);
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
        status.textContent = window.i18n?.get(`status_${locker.status.toLowerCase()}`) || locker.status;
        
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
                    kiosk_id: this.kioskId
                })
            });
            
            const result = await response.json();
            this.hideLoading();
            
            if (result.success) {
                this.showStatusMessage('opening', { id: lockerId }, 'info');
                this.showScreen('main-screen');
            } else {
                this.lastFailedLockerId = lockerId;
                this.showLockFailureScreen(lockerId);
            }
        } catch (error) {
            console.error('Locker selection error:', error);
            this.hideLoading();
            this.lastFailedLockerId = lockerId;
            this.showLockFailureScreen(lockerId);
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
    
    // Help Request Methods
    setupHelpForm() {
        // Category selection
        const categoryButtons = document.getElementById('category-buttons');
        if (categoryButtons) {
            categoryButtons.addEventListener('click', (e) => {
                const btn = e.target.closest('.category-btn');
                if (btn) {
                    // Remove previous selection
                    categoryButtons.querySelectorAll('.category-btn').forEach(b => {
                        b.classList.remove('selected');
                    });
                    
                    // Select current category
                    btn.classList.add('selected');
                    this.helpRequest.category = btn.getAttribute('data-category');
                    this.updateSubmitButton();
                }
            });
        }
        
        // Form inputs
        const lockerNumberInput = document.getElementById('help-locker-number');
        if (lockerNumberInput) {
            lockerNumberInput.addEventListener('input', (e) => {
                this.helpRequest.lockerNumber = e.target.value ? parseInt(e.target.value) : null;
            });
        }
        
        const noteTextarea = document.getElementById('help-note');
        const charCount = document.getElementById('note-char-count');
        if (noteTextarea && charCount) {
            noteTextarea.addEventListener('input', (e) => {
                this.helpRequest.note = e.target.value;
                charCount.textContent = e.target.value.length;
            });
        }
        
        const contactInput = document.getElementById('help-contact');
        if (contactInput) {
            contactInput.addEventListener('input', (e) => {
                this.helpRequest.contact = e.target.value;
            });
        }
        
        // Photo capture (placeholder for now)
        const capturePhotoBtn = document.getElementById('capture-photo-btn');
        if (capturePhotoBtn) {
            capturePhotoBtn.addEventListener('click', () => {
                this.capturePhoto();
            });
        }
        
        const removePhotoBtn = document.getElementById('remove-photo-btn');
        if (removePhotoBtn) {
            removePhotoBtn.addEventListener('click', () => {
                this.removePhoto();
            });
        }
        
        // Form actions
        const cancelBtn = document.getElementById('cancel-help-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.showScreen('main-screen');
                this.resetHelpForm();
            });
        }
        
        const submitBtn = document.getElementById('submit-help-btn');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => {
                this.submitHelpRequest();
            });
        }
    }
    
    resetHelpForm() {
        this.helpRequest = {
            category: null,
            lockerNumber: null,
            note: '',
            contact: '',
            photo: null
        };
        
        // Reset form elements
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        
        const lockerNumberInput = document.getElementById('help-locker-number');
        if (lockerNumberInput) lockerNumberInput.value = '';
        
        const noteTextarea = document.getElementById('help-note');
        const charCount = document.getElementById('note-char-count');
        if (noteTextarea) noteTextarea.value = '';
        if (charCount) charCount.textContent = '0';
        
        const contactInput = document.getElementById('help-contact');
        if (contactInput) contactInput.value = '';
        
        this.removePhoto();
        this.updateSubmitButton();
    }
    
    updateSubmitButton() {
        const submitBtn = document.getElementById('submit-help-btn');
        if (submitBtn) {
            submitBtn.disabled = !this.helpRequest.category;
        }
    }
    
    async checkCameraAvailability() {
        try {
            const photoSection = document.getElementById('photo-section');
            if (!photoSection) return;
            
            // Check if camera is available
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasCamera = devices.some(device => device.kind === 'videoinput');
            
            if (hasCamera) {
                photoSection.style.display = 'block';
            } else {
                photoSection.style.display = 'none';
            }
        } catch (error) {
            console.log('Camera check failed:', error);
            // Hide photo section if camera check fails
            const photoSection = document.getElementById('photo-section');
            if (photoSection) photoSection.style.display = 'none';
        }
    }
    
    async capturePhoto() {
        try {
            // For now, simulate photo capture
            // In a real implementation, this would use getUserMedia to capture from camera
            this.showStatusMessage('photo_capture_not_implemented', {}, 'info', 3000);
            
            // Placeholder implementation - would be replaced with actual camera capture
            /*
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } 
            });
            
            const video = document.createElement('video');
            video.srcObject = stream;
            video.play();
            
            // Create canvas to capture frame
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Wait for video to load
            video.addEventListener('loadedmetadata', () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0);
                
                // Convert to blob
                canvas.toBlob((blob) => {
                    this.helpRequest.photo = blob;
                    this.showPhotoPreview(URL.createObjectURL(blob));
                    
                    // Stop camera stream
                    stream.getTracks().forEach(track => track.stop());
                }, 'image/jpeg', 0.8);
            });
            */
        } catch (error) {
            console.error('Photo capture error:', error);
            this.showStatusMessage('photo_capture_failed', {}, 'error', 3000);
        }
    }
    
    showPhotoPreview(imageUrl) {
        const preview = document.getElementById('photo-preview');
        const previewImage = document.getElementById('preview-image');
        const captureBtn = document.getElementById('capture-photo-btn');
        
        if (preview && previewImage && captureBtn) {
            previewImage.src = imageUrl;
            preview.style.display = 'block';
            captureBtn.style.display = 'none';
        }
    }
    
    removePhoto() {
        this.helpRequest.photo = null;
        
        const preview = document.getElementById('photo-preview');
        const previewImage = document.getElementById('preview-image');
        const captureBtn = document.getElementById('capture-photo-btn');
        
        if (preview && previewImage && captureBtn) {
            preview.style.display = 'none';
            previewImage.src = '';
            captureBtn.style.display = 'flex';
        }
    }
    
    async submitHelpRequest() {
        if (!this.helpRequest.category) {
            this.showStatusMessage('help_category_required', {}, 'error', 3000);
            return;
        }
        
        this.showLoading('Submitting help request...');
        
        try {
            const requestData = {
                kiosk_id: this.kioskId,
                category: this.helpRequest.category,
                locker_no: this.helpRequest.lockerNumber,
                note: this.helpRequest.note || undefined,
                user_contact: this.helpRequest.contact || undefined,
                priority: 'medium'
            };
            
            const response = await fetch('/api/help', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });
            
            const result = await response.json();
            this.hideLoading();
            
            if (response.ok && result.success) {
                // Show success screen
                const requestNumber = document.getElementById('help-request-number');
                if (requestNumber) {
                    requestNumber.textContent = `#${result.data.id}`;
                }
                
                this.showScreen('help-success-screen');
                this.resetHelpForm();
            } else {
                this.showStatusMessage(result.error || 'help_submit_failed', {}, 'error', 5000);
            }
        } catch (error) {
            console.error('Help request submission error:', error);
            this.hideLoading();
            this.showStatusMessage('error_network', {}, 'error', 5000);
        }
    }
    
    showLockFailureScreen(lockerId) {
        this.hideLoading();
        this.lastFailedLockerId = lockerId;
        this.showScreen('lock-failure-screen');
        
        // Focus on the retry button for accessibility
        setTimeout(() => {
            const retryBtn = document.getElementById('retry-lock-btn');
            if (retryBtn) {
                retryBtn.focus();
            }
        }, 300);
    }
    
    async retryLockOperation() {
        if (!this.lastFailedLockerId) {
            this.showScreen('main-screen');
            return;
        }
        
        // Try to open the locker again
        this.showLoading('Retrying locker operation...');
        
        try {
            const response = await fetch('/api/lockers/retry', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    locker_id: this.lastFailedLockerId,
                    kiosk_id: this.kioskId
                })
            });
            
            const result = await response.json();
            this.hideLoading();
            
            if (result.success) {
                this.showStatusMessage('opening', { id: this.lastFailedLockerId }, 'info');
                this.showScreen('main-screen');
                this.lastFailedLockerId = null;
            } else {
                // Still failed, stay on failure screen
                this.showStatusMessage('retry_failed', {}, 'error', 3000);
            }
        } catch (error) {
            console.error('Retry operation error:', error);
            this.hideLoading();
            this.showStatusMessage('error_network', {}, 'error', 3000);
        }
    }
    
    updateHelpFormFromFailure() {
        // Pre-select lock problem category
        const lockProblemBtn = document.querySelector('[data-category="lock_problem"]');
        if (lockProblemBtn) {
            document.querySelectorAll('.category-btn').forEach(btn => {
                btn.classList.remove('selected');
            });
            lockProblemBtn.classList.add('selected');
        }
        
        // Pre-fill locker number
        const lockerNumberInput = document.getElementById('help-locker-number');
        if (lockerNumberInput && this.lastFailedLockerId) {
            lockerNumberInput.value = this.lastFailedLockerId;
        }
        
        // Pre-fill note with failure context
        const noteTextarea = document.getElementById('help-note');
        if (noteTextarea) {
            noteTextarea.value = window.i18n?.get('lock_failure_help_note') || 'Dolap açılmadı, yardıma ihtiyacım var.';
            const charCount = document.getElementById('note-char-count');
            if (charCount) {
                charCount.textContent = noteTextarea.value.length;
            }
        }
        
        this.updateSubmitButton();
    }
    
    onLanguageChanged(detail) {
        // Update any dynamic content that might not be caught by the i18n updateUI
        // Update locker grid if visible
        if (this.currentScreen === 'locker-selection-screen' && this.availableLockers.length > 0) {
            this.renderLockerGrid();
        } else if (this.currentScreen === 'master-locker-screen' && this.allLockers.length > 0) {
            this.renderMasterLockerGrid();
        }
        
        // Update text size button title based on current state
        if (this.isLargeText) {
            this.enableLargeText();
        } else {
            this.disableLargeText();
        }
        
        // Update any status messages that might be showing
        const statusMessage = document.getElementById('status-message');
        if (statusMessage && statusMessage.classList.contains('show')) {
            // Re-render status message if it's currently showing
            // This would require storing the message key and params, which we don't currently do
            // For now, just hide it to avoid showing outdated language
            statusMessage.classList.remove('show');
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