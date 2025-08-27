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
        this.lastGridSize = 0; // Track grid size to reduce logging
        this.currentSessionId = null; // Track current RFID session
        this.sessionCountdownTimer = null; // Track countdown timer
        this.sessionTimeoutSeconds = 20; // Default session timeout
        
        // Connection monitoring - Task 8
        this.connectionStatus = 'online';
        this.lastUpdateTime = new Date();
        this.connectionCheckInterval = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        // WebSocket connection for real-time updates - Task 12
        this.websocket = null;
        this.wsReconnectAttempts = 0;
        this.maxWsReconnectAttempts = 10;
        this.wsReconnectDelay = 1000; // Start with 1 second
        this.wsMaxReconnectDelay = 30000; // Max 30 seconds
        
        // Audio feedback system
        this.audioContext = null;
        this.audioEnabled = true;
        this.initAudioSystem();
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupRfidKeyboardListener(); // Add RFID keyboard capture
        this.startClock();
        this.loadKioskInfo();
        this.checkPinLockout();
        
        // Initialize background grid for always-visible locker status
        this.renderBackgroundGrid();
        
        // Show main screen initially
        this.showScreen('main-screen');
        
        // Check for active session on startup
        this.checkActiveSession();
        
        // Start polling for RFID events and locker updates
        this.startPolling();
        
        // Initialize connection monitoring - Task 8
        this.initConnectionMonitoring();
        
        // Initialize WebSocket connection for real-time updates - Task 12
        this.initWebSocketConnection();
        
        // Setup cleanup on page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    /**
     * Initialize audio feedback system
     */
    initAudioSystem() {
        try {
            // Initialize Web Audio API
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('🔊 Audio system initialized');
        } catch (error) {
            console.warn('⚠️ Audio system not available:', error);
            this.audioEnabled = false;
        }
    }

    /**
     * Play audio feedback based on type
     */
    playAudioFeedback(type, volume = 0.7) {
        if (!this.audioEnabled || !this.audioContext) return;

        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Set volume
            gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
            
            // Set frequency and duration based on feedback type
            switch (type) {
                case 'success':
                    // Pleasant ascending tone
                    oscillator.frequency.setValueAtTime(523, this.audioContext.currentTime); // C5
                    oscillator.frequency.exponentialRampToValueAtTime(659, this.audioContext.currentTime + 0.1); // E5
                    oscillator.frequency.exponentialRampToValueAtTime(784, this.audioContext.currentTime + 0.2); // G5
                    oscillator.type = 'sine';
                    break;
                case 'error':
                    // Lower warning tone
                    oscillator.frequency.setValueAtTime(220, this.audioContext.currentTime); // A3
                    oscillator.frequency.exponentialRampToValueAtTime(196, this.audioContext.currentTime + 0.3); // G3
                    oscillator.type = 'square';
                    break;
                case 'warning':
                    // Medium warning tone
                    oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime); // A4
                    oscillator.frequency.exponentialRampToValueAtTime(392, this.audioContext.currentTime + 0.2); // G4
                    oscillator.type = 'triangle';
                    break;
                case 'info':
                default:
                    // Simple notification tone
                    oscillator.frequency.setValueAtTime(523, this.audioContext.currentTime); // C5
                    oscillator.type = 'sine';
                    break;
            }
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.5);
            
        } catch (error) {
            console.warn('⚠️ Failed to play audio feedback:', error);
        }
    }

    /**
     * Initialize connection monitoring - Task 8
     */
    initConnectionMonitoring() {
        // Check connection status every 10 seconds
        this.connectionCheckInterval = setInterval(() => {
            this.checkConnectionStatus();
        }, 10000);
        
        // Initial connection check
        this.checkConnectionStatus();
    }

    /**
     * Check connection status by pinging health endpoint
     */
    async checkConnectionStatus() {
        try {
            const response = await fetch('/health', {
                method: 'GET',
                timeout: 5000
            });
            
            if (response.ok) {
                this.handleConnectionRestored();
            } else {
                this.handleConnectionLost();
            }
        } catch (error) {
            console.warn('⚠️ Connection check failed:', error);
            this.handleConnectionLost();
        }
    }

    /**
     * Handle connection lost
     */
    handleConnectionLost() {
        if (this.connectionStatus === 'online') {
            console.warn('🔌 Connection lost');
            this.connectionStatus = 'offline';
            this.reconnectAttempts = 0;
            
            // Show offline status
            if (window.i18n) {
                window.i18n.showConnectionStatus('offline');
            }
            
            // Start reconnection attempts
            this.startReconnectionAttempts();
        }
    }

    /**
     * Handle connection restored
     */
    handleConnectionRestored() {
        if (this.connectionStatus !== 'online') {
            console.log('🔌 Connection restored');
            this.connectionStatus = 'online';
            this.reconnectAttempts = 0;
            this.lastUpdateTime = new Date();
            
            // Show reconnected status
            if (window.i18n) {
                window.i18n.showConnectionStatus('online');
                window.i18n.updateLastUpdateTime(this.lastUpdateTime);
            }
            
            // Refresh data after reconnection
            this.loadAllLockers();
        }
    }

    /**
     * Start reconnection attempts
     */
    startReconnectionAttempts() {
        if (this.connectionStatus === 'offline' && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.connectionStatus = 'reconnecting';
            this.reconnectAttempts++;
            
            // Show reconnecting status
            if (window.i18n) {
                window.i18n.showConnectionStatus('reconnecting');
            }
            
            // Try to reconnect after delay
            setTimeout(() => {
                this.checkConnectionStatus();
            }, 2000 * this.reconnectAttempts); // Exponential backoff
        }
    }

    /**
     * Show error with recovery suggestion - Task 8
     */
    showErrorWithRecovery(errorType, duration = 5000) {
        if (window.i18n) {
            const errorInfo = window.i18n.getErrorWithRecovery(errorType);
            window.i18n.showError(errorType, errorInfo.recovery, duration);
            
            // Play error audio feedback
            this.playAudioFeedback('error');
        }
    }

    /**
     * Initialize WebSocket connection for real-time updates - Task 12
     */
    initWebSocketConnection() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsPort = 8080; // Default WebSocket port
        const wsUrl = `${wsProtocol}//${window.location.hostname}:${wsPort}`;
        
        console.log('🔌 Initializing WebSocket connection to:', wsUrl);
        
        try {
            this.websocket = new WebSocket(wsUrl);
            
            this.websocket.onopen = () => {
                console.log('✅ WebSocket connected');
                this.wsReconnectAttempts = 0;
                this.wsReconnectDelay = 1000; // Reset delay
                
                // Update connection status
                this.handleWebSocketConnected();
            };
            
            this.websocket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleWebSocketMessage(message);
                } catch (error) {
                    console.error('🚨 Failed to parse WebSocket message:', error);
                }
            };
            
            this.websocket.onclose = (event) => {
                console.warn('🔌 WebSocket connection closed:', event.code, event.reason);
                this.handleWebSocketDisconnected();
            };
            
            this.websocket.onerror = (error) => {
                console.error('🚨 WebSocket error:', error);
                this.handleWebSocketError();
            };
            
        } catch (error) {
            console.error('🚨 Failed to create WebSocket connection:', error);
            this.scheduleWebSocketReconnect();
        }
    }

    /**
     * Handle WebSocket connection established
     */
    handleWebSocketConnected() {
        if (window.i18n) {
            window.i18n.showConnectionStatus('online');
            window.i18n.updateLastUpdateTime(new Date());
        }
    }

    /**
     * Handle WebSocket connection lost
     */
    handleWebSocketDisconnected() {
        this.websocket = null;
        
        if (window.i18n) {
            window.i18n.showConnectionStatus('offline');
        }
        
        // Schedule reconnection
        this.scheduleWebSocketReconnect();
    }

    /**
     * Handle WebSocket error
     */
    handleWebSocketError() {
        if (this.websocket) {
            this.websocket.close();
        }
    }

    /**
     * Schedule WebSocket reconnection with exponential backoff
     */
    scheduleWebSocketReconnect() {
        if (this.wsReconnectAttempts >= this.maxWsReconnectAttempts) {
            console.error('🚨 Max WebSocket reconnection attempts reached');
            if (window.i18n) {
                window.i18n.showConnectionStatus('offline');
            }
            return;
        }
        
        this.wsReconnectAttempts++;
        
        if (window.i18n) {
            window.i18n.showConnectionStatus('reconnecting');
        }
        
        console.log(`🔄 Scheduling WebSocket reconnection attempt ${this.wsReconnectAttempts} in ${this.wsReconnectDelay}ms`);
        
        setTimeout(() => {
            this.initWebSocketConnection();
        }, this.wsReconnectDelay);
        
        // Exponential backoff with jitter
        this.wsReconnectDelay = Math.min(
            this.wsReconnectDelay * 2 + Math.random() * 1000,
            this.wsMaxReconnectDelay
        );
    }

    /**
     * Handle incoming WebSocket messages
     */
    handleWebSocketMessage(message) {
        console.log('📨 WebSocket message received:', message.type);
        
        switch (message.type) {
            case 'state_update':
                this.handleLockerStateUpdate(message.data);
                break;
            case 'connection_status':
                this.handleConnectionStatusUpdate(message.data);
                break;
            case 'heartbeat':
                // Respond to heartbeat if needed
                if (message.data.ping && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    this.websocket.send(JSON.stringify({
                        type: 'ping',
                        timestamp: new Date().toISOString()
                    }));
                }
                break;
            case 'error':
                console.error('🚨 WebSocket server error:', message.data);
                this.showErrorWithRecovery('service_error');
                break;
            default:
                console.log('📨 Unknown WebSocket message type:', message.type);
        }
    }

    /**
     * Handle real-time locker state updates
     */
    handleLockerStateUpdate(update) {
        console.log('🔄 Locker state update:', update);
        
        // Update last update time
        this.lastUpdateTime = new Date(update.lastChanged);
        if (window.i18n) {
            window.i18n.updateLastUpdateTime(this.lastUpdateTime);
        }
        
        // Update background grid immediately
        this.renderBackgroundGrid();
        
        // Update current screen if relevant
        if (this.currentScreen === 'locker-selection-screen') {
            this.loadAvailableLockers();
        } else if (this.currentScreen === 'master-locker-screen') {
            this.loadAllLockers();
        }
        
        // Show visual feedback for state changes if locker is visible
        this.showLockerStateChangeAnimation(update);
    }

    /**
     * Handle connection status updates
     */
    handleConnectionStatusUpdate(status) {
        console.log('🔌 Connection status update:', status);
        
        if (window.i18n) {
            window.i18n.showConnectionStatus(status.status);
            window.i18n.updateLastUpdateTime(new Date(status.lastUpdate));
        }
    }

    /**
     * Show visual animation for locker state changes
     */
    showLockerStateChangeAnimation(update) {
        // Find the locker tile in the background grid
        const lockerTile = document.querySelector(`[data-locker-id="${update.lockerId}"]`);
        if (lockerTile) {
            // Add a brief highlight animation
            lockerTile.classList.add('state-changed');
            setTimeout(() => {
                lockerTile.classList.remove('state-changed');
            }, 1000);
        }
    }

    /**
     * Memory optimization for Raspberry Pi
     */
    optimizeMemoryUsage() {
        // Clear old locker data to prevent memory leaks
        if (this.allLockers.length > 100) {
            this.allLockers = this.allLockers.slice(-50); // Keep only recent 50
        }
        
        // Clear old session data
        const sessionKeys = Object.keys(localStorage).filter(key => key.startsWith('session-'));
        if (sessionKeys.length > 10) {
            sessionKeys.slice(0, -5).forEach(key => localStorage.removeItem(key));
        }
        
        // Force garbage collection if available (development/testing)
        if (window.performanceTracker) {
            const stats = window.performanceTracker.getStats();
            if (stats.memory && stats.memory.usagePercent > 85) {
                console.log('🧹 High memory usage detected, optimizing...');
                window.performanceTracker.forceGarbageCollection();
            }
        }
    }

    /**
     * Cleanup method for intervals and timers
     */
    cleanup() {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
        
        if (this.sessionCountdownTimer) {
            clearInterval(this.sessionCountdownTimer);
            this.sessionCountdownTimer = null;
        }
        
        // Close WebSocket connection
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        
        // Memory cleanup
        this.optimizeMemoryUsage();
        
        // Clear large arrays
        this.allLockers = [];
        this.availableLockers = [];
    }

    /**
     * Enhanced transition effects with 200-300ms duration
     */
    applyTransition(element, transitionType, duration = 300) {
        if (!element) return Promise.resolve();

        return new Promise((resolve) => {
            element.style.transition = `all ${duration}ms ease-in-out`;
            
            switch (transitionType) {
                case 'fade-out':
                    element.style.opacity = '0';
                    break;
                case 'fade-in':
                    element.style.opacity = '1';
                    break;
                case 'scale-up':
                    element.style.transform = 'scale(1.05)';
                    break;
                case 'scale-down':
                    element.style.transform = 'scale(0.95)';
                    break;
                case 'scale-normal':
                    element.style.transform = 'scale(1)';
                    break;
                case 'blur-remove':
                    element.classList.remove('blurred');
                    break;
                case 'blur-add':
                    element.classList.add('blurred');
                    break;
            }
            
            setTimeout(resolve, duration);
        });
    }

    /**
     * Enhanced big feedback with smooth animations
     */
    async showBigFeedbackEnhanced(message, type = 'info', duration = 3000) {
        const bigFeedback = document.getElementById('big-feedback');
        const feedbackMessage = bigFeedback?.querySelector('.feedback-message');
        const feedbackIcon = bigFeedback?.querySelector('.feedback-icon');
        
        if (!bigFeedback || !feedbackMessage) return;
        
        feedbackMessage.textContent = message;
        
        // Set icon based on type with enhanced styling
        if (feedbackIcon) {
            let iconHtml = '';
            let iconColor = '';
            
            switch (type) {
                case 'success':
                    iconHtml = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c2.12 0 4.07.74 5.61 1.98"/></svg>';
                    iconColor = '#10b981';
                    break;
                case 'opening':
                    iconHtml = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>';
                    iconColor = '#f59e0b';
                    feedbackIcon.style.animation = 'spin 1s linear infinite';
                    break;
                case 'warning':
                    iconHtml = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
                    iconColor = '#f59e0b';
                    break;
                case 'error':
                    iconHtml = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
                    iconColor = '#dc2626';
                    break;
                default:
                    iconHtml = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
                    iconColor = '#2563eb';
            }
            
            feedbackIcon.innerHTML = iconHtml;
            feedbackIcon.style.background = iconColor;
            feedbackIcon.style.color = 'white';
        }
        
        // Show with fade and scale animation
        bigFeedback.style.opacity = '0';
        bigFeedback.style.transform = 'scale(0.9)';
        bigFeedback.classList.remove('hidden');
        
        // Animate in
        await this.applyTransition(bigFeedback, 'fade-in', 200);
        await this.applyTransition(bigFeedback, 'scale-normal', 200);
        
        // Auto-hide after duration
        setTimeout(async () => {
            await this.applyTransition(bigFeedback, 'fade-out', 200);
            await this.applyTransition(bigFeedback, 'scale-down', 200);
            bigFeedback.classList.add('hidden');
            
            // Clear icon animation
            if (feedbackIcon) {
                feedbackIcon.style.animation = '';
            }
        }, duration);
    }
    
    setupEventListeners() {
        // Navigation buttons
        document.getElementById('back-to-main')?.addEventListener('click', () => {
            // Cancel active session if any
            if (this.currentSessionId) {
                this.cancelCurrentSession('Kullanıcı geri tuşuna bastı');
            }
            this.endSessionMode();
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
            
            // Show enhanced error with recovery - Task 8
            this.showErrorWithRecovery('network_error');
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
            // Show service unavailable error - Task 8
            this.showErrorWithRecovery('service_unavailable');
        }
    }
    
    startPolling() {
        if (this.pollingInterval) return;
        
        this.pollingInterval = setInterval(() => {
            this.pollForUpdates();
        }, 2000); // Poll every 2 seconds
        
        // Start memory optimization timer for Raspberry Pi
        if (this.memoryOptimizationInterval) {
            clearInterval(this.memoryOptimizationInterval);
        }
        
        this.memoryOptimizationInterval = setInterval(() => {
            this.optimizeMemoryUsage();
        }, 60000); // Optimize memory every minute
    }
    
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        
        if (this.memoryOptimizationInterval) {
            clearInterval(this.memoryOptimizationInterval);
            this.memoryOptimizationInterval = null;
        }
    }
    
    async pollForUpdates() {
        try {
            // Check for RFID events
            await this.checkRfidEvents();
            
            // Always update background grid for real-time state visualization
            await this.renderBackgroundGrid();
            
            // Update locker status if on relevant screens
            if (this.currentScreen === 'locker-selection-screen') {
                await this.loadAvailableLockers();
            } else if (this.currentScreen === 'master-locker-screen') {
                await this.loadAllLockers();
            }
        } catch (error) {
            console.error('Polling error:', error);
            // Connection monitoring will handle this
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
            // Show hardware error if RFID system fails - Task 8
            this.showErrorWithRecovery('hardware_disconnected');
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
            
            // Play audio feedback if provided
            if (result.audio) {
                this.playAudioFeedback(result.audio.type, result.audio.volume);
            }
            
            if (result.action === 'show_lockers') {
                this.availableLockers = result.lockers;
                this.currentSessionId = result.session_id;
                this.sessionTimeoutSeconds = result.timeout_seconds || 20;
                
                // Update last update time - Task 8
                this.lastUpdateTime = new Date();
                if (window.i18n) {
                    window.i18n.updateLastUpdateTime(this.lastUpdateTime);
                }
                
                // Apply smooth transitions
                if (result.transitions) {
                    const frontOverlay = document.getElementById('front-overlay');
                    const backgroundGrid = document.getElementById('background-grid');
                    
                    if (result.transitions.overlay_fade && frontOverlay) {
                        await this.applyTransition(frontOverlay, 'fade-out', result.transitions.overlay_fade.duration);
                    }
                    
                    if (result.transitions.blur_remove && backgroundGrid) {
                        await this.applyTransition(backgroundGrid, 'blur-remove', result.transitions.blur_remove.duration);
                    }
                }
                
                // Show session UI with countdown
                this.startSessionMode(result.message || 'Kart okundu. Seçim için dokunun');
                this.renderLockerGrid();
                this.showScreen('locker-selection-screen');
                
            } else if (result.action === 'open_locker') {
                // Show enhanced feedback sequence
                if (result.feedback && result.feedback.length > 0) {
                    for (let i = 0; i < result.feedback.length; i++) {
                        const feedback = result.feedback[i];
                        await this.showBigFeedbackEnhanced(feedback.message, feedback.type, feedback.duration);
                        
                        // Wait between feedback messages
                        if (i < result.feedback.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, feedback.duration));
                        }
                    }
                } else {
                    // Fallback to original behavior
                    await this.showBigFeedbackEnhanced('Dolap açılıyor', 'opening', 1500);
                    await this.showBigFeedbackEnhanced(result.message || 'Dolap açıldı', 'success', 3000);
                }
                
            } else if (result.error) {
                // Show enhanced error feedback
                if (result.feedback && result.feedback.length > 0) {
                    const feedback = result.feedback[0];
                    await this.showBigFeedbackEnhanced(feedback.message, feedback.type, feedback.duration);
                } else {
                    this.showStatusMessage(result.error, {}, 'error');
                }
            }
        } catch (error) {
            console.error('Card handling error:', error);
            this.hideLoading();
            this.playAudioFeedback('error');
            
            // Show enhanced network error with recovery - Task 8
            this.showErrorWithRecovery('network_error');
            await this.showBigFeedbackEnhanced(window.i18n ? window.i18n.get('network_error') : 'Ağ hatası', 'error', 3000);
        }
    }
    
    async loadAvailableLockers() {
        try {
            const response = await fetch(`/api/lockers/available?kiosk_id=${this.kioskId}`);
            if (response.ok) {
                const lockers = await response.json();
                this.availableLockers = lockers;
                this.renderLockerGrid();
                
                // Update last update time - Task 8
                this.lastUpdateTime = new Date();
                if (window.i18n) {
                    window.i18n.updateLastUpdateTime(this.lastUpdateTime);
                }
            } else {
                // Handle specific HTTP error codes - Task 8
                if (response.status === 503) {
                    this.showErrorWithRecovery('service_unavailable');
                } else if (response.status >= 500) {
                    this.showErrorWithRecovery('system_error');
                } else {
                    this.showErrorWithRecovery('general_error');
                }
            }
        } catch (error) {
            console.error('Failed to load available lockers:', error);
            // Show network error for connection failures - Task 8
            this.showErrorWithRecovery('network_error');
        }
    }
    
    async loadAllLockers() {
        try {
            const response = await fetch(`/api/lockers/all?kiosk_id=${this.kioskId}`);
            if (response.ok) {
                const lockers = await response.json();
                this.allLockers = lockers;
                this.renderMasterLockerGrid();
                
                // Update last update time - Task 8
                this.lastUpdateTime = new Date();
                if (window.i18n) {
                    window.i18n.updateLastUpdateTime(this.lastUpdateTime);
                }
            } else {
                // Handle specific HTTP error codes - Task 8
                if (response.status === 503) {
                    this.showErrorWithRecovery('service_unavailable');
                } else if (response.status >= 500) {
                    this.showErrorWithRecovery('system_error');
                } else {
                    this.showErrorWithRecovery('general_error');
                }
            }
        } catch (error) {
            console.error('Failed to load all lockers:', error);
            // Show network error for connection failures - Task 8
            this.showErrorWithRecovery('network_error');
        }
    }
    
    renderLockerGrid() {
        const startTime = performance.now();
        
        try {
            const grid = document.getElementById('locker-grid');
            if (!grid) return;
            
            if (this.availableLockers.length === 0) {
                grid.innerHTML = '';
                const noLockersMsg = document.createElement('div');
                noLockersMsg.className = 'no-lockers-message';
                noLockersMsg.textContent = window.i18n.get('no_lockers');
                grid.appendChild(noLockersMsg);
                return;
            }
            
            // Use efficient update method instead of full re-render
            this.updateGridTiles(grid, this.availableLockers, true);
            
            // Also update the interactive grid
            this.renderInteractiveGrid();
            
            // Track performance
            if (window.performanceTracker) {
                window.performanceTracker.trackUIRender(startTime, true);
            }
        } catch (error) {
            // Track error
            if (window.performanceTracker) {
                window.performanceTracker.trackUIRender(startTime, false, error.message);
            }
            throw error;
        }
    }
    
    /**
     * Render the interactive grid for session mode
     */
    renderInteractiveGrid() {
        const grid = document.getElementById('interactive-locker-grid');
        if (!grid) return;
        
        if (this.availableLockers.length === 0) {
            grid.innerHTML = '';
            const noLockersMsg = document.createElement('div');
            noLockersMsg.className = 'no-lockers-message';
            noLockersMsg.textContent = window.i18n.get('no_lockers');
            grid.appendChild(noLockersMsg);
            return;
        }
        
        // Use efficient update method instead of full re-render
        this.updateGridTiles(grid, this.availableLockers, true);
    }
    
    /**
     * Render the always-visible background grid
     */
    async renderBackgroundGrid() {
        const startTime = performance.now();
        
        try {
            const grid = document.getElementById('background-locker-grid');
            if (!grid) return;
            
            // Load all lockers for background display
            const response = await fetch(`/api/lockers/all?kiosk_id=${this.kioskId}`);
            if (!response.ok) return;
            
            const allLockers = await response.json();
            
            // Update existing tiles instead of full re-render for better performance
            this.updateGridTiles(grid, allLockers, false);
            
            // Reduced logging to avoid console spam
            if (allLockers.length !== this.lastGridSize) {
                console.log(`🔄 Background grid updated with ${allLockers.length} lockers`);
                this.lastGridSize = allLockers.length;
            }
            
            // Track successful state update performance
            if (window.performanceTracker) {
                window.performanceTracker.trackStateUpdate(startTime, true);
            }
        } catch (error) {
            console.error('Failed to render background grid:', error);
            
            // Track failed state update performance
            if (window.performanceTracker) {
                window.performanceTracker.trackStateUpdate(startTime, false, error.message);
            }
        }
    }
    
    /**
     * Update grid tiles efficiently without full re-render
     */
    updateGridTiles(grid, lockers, isSelectable) {
        const existingTiles = grid.querySelectorAll('.locker-tile');
        const existingTileMap = new Map();
        
        // Map existing tiles by locker ID
        existingTiles.forEach(tile => {
            const lockerId = tile.getAttribute('data-locker-id');
            if (lockerId) {
                existingTileMap.set(parseInt(lockerId), tile);
            }
        });
        
        // Update or create tiles
        lockers.forEach(locker => {
            const existingTile = existingTileMap.get(locker.id);
            
            if (existingTile) {
                // Update existing tile if state changed
                const currentState = existingTile.getAttribute('data-state');
                const newState = this.getLockerState(locker.status);
                
                if (currentState !== newState) {
                    this.updateTileState(existingTile, locker, isSelectable);
                }
                
                // Update display name if changed
                const displayNameEl = existingTile.querySelector('.tile-display-name');
                const newDisplayName = locker.displayName || `Dolap ${locker.id}`;
                if (displayNameEl && displayNameEl.textContent !== newDisplayName) {
                    displayNameEl.textContent = newDisplayName;
                    displayNameEl.title = newDisplayName;
                }
                
                existingTileMap.delete(locker.id);
            } else {
                // Create new tile
                const newTile = this.createLockerButton(locker, isSelectable);
                grid.appendChild(newTile);
            }
        });
        
        // Remove tiles for lockers that no longer exist
        existingTileMap.forEach(tile => {
            tile.remove();
        });
    }
    
    /**
     * Get consistent state name from locker status
     */
    getLockerState(status) {
        const stateMap = {
            'Free': 'bos',
            'Occupied': 'dolu', 
            'Opening': 'aciliyor',
            'Error': 'hata',
            'Disabled': 'engelli'
        };
        return stateMap[status] || 'hata';
    }
    
    /**
     * Update individual tile state with smooth animation
     */
    updateTileState(tile, locker, isSelectable) {
        const newState = this.getLockerState(locker.status);
        const oldState = tile.getAttribute('data-state');
        
        if (oldState === newState) return;
        
        // Remove old state class and add new one
        tile.classList.remove(`state-${oldState}`);
        tile.classList.add(`state-${newState}`);
        tile.setAttribute('data-state', newState);
        
        // Update icon
        const iconEl = tile.querySelector('.tile-icon');
        if (iconEl) {
            iconEl.classList.remove('spinner');
            
            switch (newState) {
                case 'bos':
                    iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 12l2 2 4-4"/>
                    </svg>`;
                    break;
                case 'dolu':
                    iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>`;
                    break;
                case 'aciliyor':
                    iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12a9 9 0 11-6.219-8.56"/>
                    </svg>`;
                    iconEl.classList.add('spinner');
                    break;
                case 'hata':
                    iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>`;
                    break;
                case 'engelli':
                    iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>`;
                    break;
            }
        }
        
        // Update cursor and click handlers
        if (isSelectable && newState === 'bos') {
            tile.style.cursor = 'pointer';
            // Re-add click handler if needed
            tile.onclick = () => this.selectLocker(locker.id);
        } else if (!isSelectable) {
            tile.style.cursor = 'pointer';
            tile.onclick = () => this.masterOpenLocker(locker.id);
        } else {
            tile.style.cursor = 'not-allowed';
            tile.onclick = null;
        }
        
        // Add subtle animation to indicate state change
        tile.style.transform = 'scale(1.05)';
        setTimeout(() => {
            tile.style.transform = 'scale(1)';
        }, 200);
        
        console.log(`🔄 Updated locker ${locker.id} state: ${oldState} → ${newState}`);
    }
    
    /**
     * Handle real-time locker state update
     * This method can be called from WebSocket events or polling
     */
    updateLockerStateRealtime(lockerId, newStatus, displayName = null) {
        const newState = this.getLockerState(newStatus);
        
        // Update all grids that might contain this locker
        const grids = [
            document.getElementById('background-locker-grid'),
            document.getElementById('locker-grid'),
            document.getElementById('interactive-locker-grid'),
            document.getElementById('master-locker-grid')
        ];
        
        grids.forEach(grid => {
            if (!grid) return;
            
            const tile = grid.querySelector(`[data-locker-id="${lockerId}"]`);
            if (tile) {
                const mockLocker = {
                    id: lockerId,
                    status: newStatus,
                    displayName: displayName
                };
                
                // Determine if this grid is selectable
                const isSelectable = grid.id === 'locker-grid' || grid.id === 'interactive-locker-grid';
                
                this.updateTileState(tile, mockLocker, isSelectable);
            }
        });
        
        console.log(`🔄 Real-time update: Locker ${lockerId} → ${newState}`);
    }
    
    /**
     * Batch update multiple locker states for efficiency
     */
    updateMultipleLockerStates(updates) {
        updates.forEach(update => {
            this.updateLockerStateRealtime(update.lockerId, update.status, update.displayName);
        });
    }
    
    renderMasterLockerGrid() {
        const grid = document.getElementById('master-locker-grid');
        if (!grid) return;
        
        // Use efficient update method instead of full re-render
        this.updateGridTiles(grid, this.allLockers, false);
    }
    
    createLockerButton(locker, isSelectable) {
        const btn = document.createElement('button');
        
        // Map locker status to consistent state names
        const stateMap = {
            'Free': 'bos',
            'Occupied': 'dolu', 
            'Opening': 'aciliyor',
            'Error': 'hata',
            'Disabled': 'engelli'
        };
        
        const state = stateMap[locker.status] || 'hata';
        btn.className = `locker-tile state-${state}`;
        btn.setAttribute('data-locker-id', locker.id);
        btn.setAttribute('data-state', state);
        
        // Add click handlers based on selectability and state
        if (isSelectable && state === 'bos') {
            btn.addEventListener('click', () => this.selectLocker(locker.id));
            btn.style.cursor = 'pointer';
        } else if (!isSelectable) {
            btn.addEventListener('click', () => this.masterOpenLocker(locker.id));
            btn.style.cursor = 'pointer';
        } else {
            btn.style.cursor = 'not-allowed';
        }
        
        // Create tile icon based on state
        const icon = document.createElement('div');
        icon.className = 'tile-icon';
        
        switch (state) {
            case 'bos':
                icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 12l2 2 4-4"/>
                </svg>`;
                break;
            case 'dolu':
                icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>`;
                break;
            case 'aciliyor':
                icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                </svg>`;
                icon.classList.add('spinner');
                break;
            case 'hata':
                icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>`;
                break;
            case 'engelli':
                icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>`;
                break;
        }
        
        // Create display name (use custom name or fallback to "Dolap [id]")
        const displayName = document.createElement('div');
        displayName.className = 'tile-display-name';
        displayName.textContent = locker.displayName || `Dolap ${locker.id}`;
        displayName.title = locker.displayName || `Dolap ${locker.id}`; // Tooltip for truncated names
        
        // Create relay number (small, bottom-left)
        const relayNumber = document.createElement('div');
        relayNumber.className = 'tile-relay-number';
        relayNumber.textContent = `#${locker.id}`;
        
        // Assemble tile
        btn.appendChild(icon);
        btn.appendChild(displayName);
        btn.appendChild(relayNumber);
        
        // Add interaction effects for selectable tiles
        if (isSelectable && state === 'bos') {
            btn.addEventListener('mouseenter', () => {
                btn.style.outline = '3px solid rgba(16, 185, 129, 0.5)';
                btn.style.outlineOffset = '2px';
            });
            
            btn.addEventListener('mouseleave', () => {
                btn.style.outline = 'none';
                btn.style.outlineOffset = '0';
            });
        }
        
        return btn;
    }
    
    async selectLocker(lockerId) {
        const startTime = performance.now();
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
                    session_id: this.currentSessionId
                })
            });
            
            const result = await response.json();
            this.hideLoading();
            
            // Play audio feedback if provided
            if (result.audio) {
                this.playAudioFeedback(result.audio.type, result.audio.volume);
            }
            
            if (result.success) {
                // Track successful locker selection performance
                if (window.performanceTracker) {
                    window.performanceTracker.trackLockerSelection(startTime, true);
                }
                
                // End session mode
                this.endSessionMode();
                
                // Show enhanced feedback sequence
                if (result.feedback && result.feedback.length > 0) {
                    for (let i = 0; i < result.feedback.length; i++) {
                        const feedback = result.feedback[i];
                        await this.showBigFeedbackEnhanced(feedback.message, feedback.type, feedback.duration);
                        
                        // Wait between feedback messages
                        if (i < result.feedback.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, feedback.duration));
                        }
                    }
                } else {
                    // Fallback to original behavior
                    await this.showBigFeedbackEnhanced('Dolap açılıyor', 'opening', 1500);
                    await this.showBigFeedbackEnhanced(result.message || `Dolap ${lockerId} açıldı`, 'success', 3000);
                }
                
                // Apply return to idle transition
                if (result.transitions && result.transitions.return_to_idle) {
                    await this.applyTransition(document.getElementById('main-screen'), 'fade-in', 300);
                }
                
                // Return to main screen
                setTimeout(() => {
                    this.showScreen('main-screen');
                }, 1000);
                
            } else {
                // Track failed locker selection performance
                if (window.performanceTracker) {
                    window.performanceTracker.trackLockerSelection(startTime, false, result.error || 'Selection failed');
                }
                
                // Show enhanced error feedback with recovery suggestions - Task 8
                if (result.feedback && result.feedback.length > 0) {
                    const feedback = result.feedback[0];
                    await this.showBigFeedbackEnhanced(feedback.message, feedback.type, feedback.duration);
                } else {
                    // Handle specific error types
                    const errorType = result.error || 'general_error';
                    if (errorType.includes('busy') || errorType.includes('occupied') || errorType.includes('dolu')) {
                        this.showErrorWithRecovery('locker_busy');
                        await this.showBigFeedbackEnhanced(window.i18n ? window.i18n.get('locker_busy') : 'Dolap dolu', 'error', 3000);
                    } else {
                        this.showErrorWithRecovery('general_error');
                        this.showStatusMessage(errorType, {}, 'error');
                    }
                }
            }
        } catch (error) {
            console.error('Locker selection error:', error);
            this.hideLoading();
            this.playAudioFeedback('error');
            
            // Track network error performance
            if (window.performanceTracker) {
                window.performanceTracker.trackLockerSelection(startTime, false, error.message);
            }
            
            // Show enhanced network error with recovery - Task 8
            this.showErrorWithRecovery('network_error');
            await this.showBigFeedbackEnhanced(window.i18n ? window.i18n.get('network_error') : 'Ağ hatası', 'error', 3000);
        }
    }

    /**
     * Start session mode with countdown timer
     */
    startSessionMode(message) {
        const startTime = performance.now();
        console.log('🔑 Starting session mode:', message);
        
        try {
            // Hide front overlay and remove blur from background
            const frontOverlay = document.getElementById('front-overlay');
            const backgroundGrid = document.getElementById('background-grid');
            const sessionCountdown = document.getElementById('session-countdown');
            
            if (frontOverlay) frontOverlay.classList.add('hidden');
            if (backgroundGrid) backgroundGrid.classList.remove('blurred');
            if (sessionCountdown) sessionCountdown.classList.remove('hidden');
            
            // Start countdown timer
            this.startCountdownTimer();
            
            // Show status message
            this.showStatusMessage('card_detected', { message }, 'info', 2000);
            
            // Track successful session start performance
            if (window.performanceTracker) {
                window.performanceTracker.trackSessionStart(startTime, true);
            }
        } catch (error) {
            // Track failed session start performance
            if (window.performanceTracker) {
                window.performanceTracker.trackSessionStart(startTime, false, error.message);
            }
            throw error;
        }
    }

    /**
     * End session mode and return to idle
     */
    endSessionMode() {
        console.log('🔚 Ending session mode');
        
        // Clear session data
        this.currentSessionId = null;
        this.stopCountdownTimer();
        
        // Show front overlay and blur background
        const frontOverlay = document.getElementById('front-overlay');
        const backgroundGrid = document.getElementById('background-grid');
        const sessionCountdown = document.getElementById('session-countdown');
        
        if (frontOverlay) frontOverlay.classList.remove('hidden');
        if (backgroundGrid) backgroundGrid.classList.add('blurred');
        if (sessionCountdown) sessionCountdown.classList.add('hidden');
    }

    /**
     * Start countdown timer display
     */
    startCountdownTimer() {
        let remainingSeconds = this.sessionTimeoutSeconds;
        const countdownElement = document.getElementById('countdown-timer');
        
        if (!countdownElement) return;
        
        // Update initial display
        countdownElement.textContent = remainingSeconds;
        
        // Clear any existing timer
        this.stopCountdownTimer();
        
        // Start new timer
        this.sessionCountdownTimer = setInterval(() => {
            remainingSeconds--;
            countdownElement.textContent = remainingSeconds;
            
            // Change color when time is running out
            const badge = countdownElement.closest('.countdown-badge');
            if (badge) {
                if (remainingSeconds <= 5) {
                    badge.style.background = '#dc2626'; // Red
                    badge.style.animation = 'pulse-countdown 0.5s infinite';
                } else if (remainingSeconds <= 10) {
                    badge.style.background = '#f59e0b'; // Orange
                }
            }
            
            // Handle timeout
            if (remainingSeconds <= 0) {
                this.handleSessionTimeout();
            }
        }, 1000);
    }

    /**
     * Stop countdown timer
     */
    stopCountdownTimer() {
        if (this.sessionCountdownTimer) {
            clearInterval(this.sessionCountdownTimer);
            this.sessionCountdownTimer = null;
        }
        
        // Reset countdown display
        const countdownElement = document.getElementById('countdown-timer');
        const badge = countdownElement?.closest('.countdown-badge');
        if (badge) {
            badge.style.background = '#dc2626';
            badge.style.animation = 'pulse-countdown 1s infinite';
        }
    }

    /**
     * Handle session timeout with enhanced feedback
     */
    async handleSessionTimeout() {
        console.log('⏰ Session timeout');
        
        // Play warning audio
        this.playAudioFeedback('warning');
        
        // Show timeout message with enhanced feedback
        await this.showBigFeedbackEnhanced('Oturum zaman aşımı', 'warning', 3000);
        
        // End session mode
        this.endSessionMode();
        
        // Return to main screen with smooth transition
        setTimeout(() => {
            this.showScreen('main-screen');
        }, 1000);
    }

    /**
     * Show big feedback message
     */
    showBigFeedback(message, type = 'info') {
        const bigFeedback = document.getElementById('big-feedback');
        const feedbackMessage = bigFeedback?.querySelector('.feedback-message');
        const feedbackIcon = bigFeedback?.querySelector('.feedback-icon');
        
        if (!bigFeedback || !feedbackMessage) return;
        
        feedbackMessage.textContent = message;
        
        // Set icon based on type
        if (feedbackIcon) {
            let iconHtml = '';
            let iconColor = '';
            
            switch (type) {
                case 'success':
                    iconHtml = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c2.12 0 4.07.74 5.61 1.98"/></svg>';
                    iconColor = '#10b981';
                    break;
                case 'opening':
                    iconHtml = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>';
                    iconColor = '#f59e0b';
                    feedbackIcon.style.animation = 'spin 1s linear infinite';
                    break;
                case 'warning':
                    iconHtml = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
                    iconColor = '#f59e0b';
                    break;
                case 'error':
                    iconHtml = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
                    iconColor = '#dc2626';
                    break;
                default:
                    iconHtml = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
                    iconColor = '#2563eb';
            }
            
            feedbackIcon.innerHTML = iconHtml;
            feedbackIcon.style.background = iconColor;
            feedbackIcon.style.color = 'white';
        }
        
        bigFeedback.classList.remove('hidden');
    }

    /**
     * Hide big feedback message
     */
    hideBigFeedback() {
        const bigFeedback = document.getElementById('big-feedback');
        const feedbackIcon = bigFeedback?.querySelector('.feedback-icon');
        
        if (bigFeedback) {
            bigFeedback.classList.add('hidden');
        }
        
        // Clear icon animation
        if (feedbackIcon) {
            feedbackIcon.style.animation = '';
        }
    }

    /**
     * Cancel current session
     */
    async cancelCurrentSession(reason = 'Manuel iptal') {
        if (!this.currentSessionId) return;
        
        try {
            const response = await fetch('/api/session/cancel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    kiosk_id: this.kioskId,
                    reason: reason
                })
            });
            
            const result = await response.json();
            console.log('Session cancellation result:', result);
        } catch (error) {
            console.error('Error cancelling session:', error);
        }
    }

    /**
     * Check for active session on page load/refresh
     */
    async checkActiveSession() {
        try {
            const response = await fetch(`/api/session/status?kiosk_id=${this.kioskId}`);
            const result = await response.json();
            
            if (result.has_session && result.remaining_seconds > 0) {
                // Resume active session
                this.currentSessionId = result.session_id;
                this.sessionTimeoutSeconds = result.remaining_seconds;
                
                // Load available lockers
                await this.loadAvailableLockers();
                
                // Start session mode
                this.startSessionMode(result.message || 'Oturum devam ediyor');
                this.showScreen('locker-selection-screen');
            }
        } catch (error) {
            console.error('Error checking active session:', error);
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