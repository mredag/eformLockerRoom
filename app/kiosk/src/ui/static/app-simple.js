/**
 * Simplified Kiosk Application - Raspberry Pi Optimized
 * 
 * This is a lightweight, performance-optimized kiosk interface designed specifically
 * for Raspberry Pi hardware. It focuses on:
 * - Minimal memory usage and CPU overhead
 * - Simple, reliable card assignment functionality
 * - 30-second session management with clear timeouts
 * - Touch-friendly interface with immediate feedback
 * - Automatic cleanup and memory management
 */

class SimpleKioskApp {
    constructor() {
        // Basic state management
        this.state = {
            mode: 'idle', // 'idle', 'session', 'loading', 'error'
            sessionId: null,
            countdown: 0,
            selectedCard: null,
            availableLockers: [],
            errorMessage: null,
            errorType: null,
            connectionStatus: 'online'
        };

        // Comprehensive Turkish Error Message Catalog (Requirements 6.1-6.6)
        this.errorMessages = {
            // Card reading errors (Requirement 6.1)
            CARD_READ_FAILED: {
                message: "Kart okunamadı - Tekrar deneyin",
                description: "RFID kartınızı okutucuya daha yakın tutun",
                recovery: "Kartınızı tekrar okutun",
                autoRetry: true,
                retryDelay: 3000
            },
            CARD_INVALID: {
                message: "Geçersiz kart - Görevliye başvurun",
                description: "Bu kart sistemde kayıtlı değil",
                recovery: "Geçerli bir kart kullanın",
                autoRetry: false
            },
            
            // Locker availability errors (Requirement 6.2)
            NO_LOCKERS_AVAILABLE: {
                message: "Müsait dolap yok - Daha sonra deneyin",
                description: "Şu anda tüm dolaplar dolu",
                recovery: "Birkaç dakika sonra tekrar deneyin",
                autoRetry: false
            },
            
            // Assignment errors (Requirement 6.3)
            ASSIGNMENT_FAILED: {
                message: "Dolap atanamadı - Farklı dolap seçin",
                description: "Seçilen dolap başka bir kullanıcı tarafından alındı",
                recovery: "Başka bir dolap seçin",
                autoRetry: false
            },
            LOCKER_UNAVAILABLE: {
                message: "Dolap kullanılamıyor - Farklı dolap seçin",
                description: "Bu dolap şu anda hizmet dışı",
                recovery: "Yeşil renkli başka bir dolap seçin",
                autoRetry: false
            },
            
            // Hardware errors (Requirement 6.4)
            HARDWARE_OFFLINE: {
                message: "Sistem bakımda - Görevliye başvurun",
                description: "Donanım bağlantısı kesildi",
                recovery: "Lütfen görevliye haber verin",
                autoRetry: false
            },
            HARDWARE_ERROR: {
                message: "Donanım hatası - Tekrar deneyin",
                description: "Dolap açma işlemi başarısız",
                recovery: "İşlemi tekrar deneyin",
                autoRetry: true,
                retryDelay: 2000
            },
            LOCKER_OPEN_FAILED: {
                message: "Dolap açılamadı - Görevliye başvurun",
                description: "Mekanik sorun olabilir",
                recovery: "Görevliden yardım isteyin",
                autoRetry: false
            },
            
            // Session errors (Requirement 6.5)
            SESSION_EXPIRED: {
                message: "Süre doldu - Kartınızı tekrar okutun",
                description: "30 saniye içinde seçim yapılmadı",
                recovery: "Kartınızı tekrar okutarak başlayın",
                autoRetry: true,
                retryDelay: 5000
            },
            SESSION_INVALID: {
                message: "Oturum geçersiz - Kartınızı tekrar okutun",
                description: "Oturum bilgileri kayboldu",
                recovery: "Yeni bir oturum başlatın",
                autoRetry: true,
                retryDelay: 3000
            },
            
            // Network errors
            NETWORK_ERROR: {
                message: "Bağlantı hatası - Tekrar deneyin",
                description: "Sunucu ile bağlantı kurulamadı",
                recovery: "Ağ bağlantısı kontrol ediliyor",
                autoRetry: true,
                retryDelay: 5000
            },
            CONNECTION_LOST: {
                message: "Bağlantı kesildi - Yeniden bağlanıyor",
                description: "İnternet bağlantısı kayboldu",
                recovery: "Bağlantı otomatik olarak yenileniyor",
                autoRetry: true,
                retryDelay: 3000
            },
            
            // Server errors
            SERVER_ERROR: {
                message: "Sunucu hatası - Tekrar deneyin",
                description: "Sistem geçici olarak kullanılamıyor",
                recovery: "Birkaç saniye sonra tekrar deneyin",
                autoRetry: true,
                retryDelay: 5000
            },
            
            // Unknown errors
            UNKNOWN_ERROR: {
                message: "Bilinmeyen hata - Görevliye başvurun",
                description: "Beklenmeyen bir sorun oluştu",
                recovery: "Sistemi yeniden başlatın",
                autoRetry: false
            }
        };

        // Connection status messages in Turkish
        this.connectionMessages = {
            online: "Bağlı",
            offline: "Çevrimdışı",
            reconnecting: "Yeniden bağlanıyor...",
            error: "Bağlantı hatası"
        };
        
        // Configuration
        this.kioskId = 'kiosk-1';
        this.sessionTimeoutSeconds = 30; // 30-second session timeout per requirements
        
        // Timers and intervals
        this.sessionTimer = null;
        this.countdownTimer = null;
        this.pollingInterval = null;
        
        // RFID input handling
        this.rfidBuffer = '';
        this.rfidTimeout = null;
        this.rfidDebounceDelay = 500; // Debounce RFID input
        
        // DOM element cache for performance
        this.elements = {};
        
        // Memory management - Pi Optimized
        this.lastCleanup = Date.now();
        this.cleanupInterval = 30000; // Cleanup every 30 seconds for Pi
        this.memoryThreshold = 75; // Trigger cleanup at 75% memory usage
        this.maxLockerCache = 50; // Limit cached locker data
        this.maxSessionHistory = 5; // Limit session history
        
        // Screen size and touch optimization (Requirements 8.4, 8.5, 8.6)
        this.screenInfo = {
            width: window.innerWidth,
            height: window.innerHeight,
            orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
            isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
            pixelRatio: window.devicePixelRatio || 1,
            isSmallScreen: window.innerWidth < 800 || window.innerHeight < 600
        };
        
        console.log('🚀 SimpleKioskApp initializing...');
        console.log('📱 Screen info:', this.screenInfo);
        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        this.cacheElements();
        this.setupEventListeners();
        this.setupRfidListener();
        this.startMemoryManagement();
        this.updateConnectionStatus(navigator.onLine);
        this.showIdleState();
        
        console.log('✅ SimpleKioskApp initialized successfully');
    }

    /**
     * Cache DOM elements for performance - Pi Optimized
     */
    cacheElements() {
        // Cache all elements in a single pass to minimize DOM queries
        const elementIds = [
            'idle-screen', 'session-screen', 'loading-screen', 'error-screen',
            'locker-grid', 'session-timer', 'countdown-value', 'connection-status',
            'loading-text', 'error-text', 'error-description', 'error-recovery',
            'return-button', 'retry-button'
        ];
        
        this.elements = {};
        
        // Single DOM query pass for all elements
        elementIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                // Convert kebab-case to camelCase for object keys
                const key = id.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
                this.elements[key] = element;
            }
        });
        
        // Cache frequently accessed nested elements
        if (this.elements.connectionStatus) {
            this.elements.statusDot = this.elements.connectionStatus.querySelector('.status-dot');
            this.elements.statusText = this.elements.connectionStatus.querySelector('.status-text');
        }
        
        // Cache all screens for efficient switching
        this.screens = [
            this.elements.idleScreen,
            this.elements.sessionScreen,
            this.elements.loadingScreen,
            this.elements.errorScreen
        ].filter(Boolean);
        
        console.log('📋 DOM elements cached efficiently for Pi');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Return to main button
        if (this.elements.returnButton) {
            this.elements.returnButton.addEventListener('click', () => {
                this.handleReturnToMain();
            });
        }
        
        // Retry button for error recovery
        const retryButton = document.getElementById('retry-button');
        if (retryButton) {
            retryButton.addEventListener('click', () => {
                this.handleRetryAction();
            });
        }
        
        // Locker grid click handling (event delegation)
        if (this.elements.lockerGrid) {
            this.elements.lockerGrid.addEventListener('click', (event) => {
                this.handleLockerClick(event);
            });
        }
        
        // Window focus/blur for memory management
        window.addEventListener('focus', () => {
            this.handleWindowFocus();
        });
        
        window.addEventListener('blur', () => {
            this.handleWindowBlur();
        });
        
        // Page unload cleanup
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
        
        // Screen resize and orientation change handling (Requirements 8.4, 8.5)
        window.addEventListener('resize', () => {
            this.handleScreenResize();
        });
        
        window.addEventListener('orientationchange', () => {
            // Delay to allow orientation change to complete
            setTimeout(() => {
                this.handleOrientationChange();
            }, 100);
        });
        
        // Enhanced network status monitoring with Turkish messages
        window.addEventListener('online', () => {
            console.log('🌐 Network connection restored');
            this.updateConnectionStatus('online');
            
            // If we were in a connection error, try to recover
            if (this.state.mode === 'error' && 
                (this.state.errorType === 'CONNECTION_LOST' || this.state.errorType === 'NETWORK_ERROR')) {
                this.handleErrorRecovery(this.state.errorType);
            }
        });
        
        window.addEventListener('offline', () => {
            console.log('🌐 Network connection lost');
            this.updateConnectionStatus('offline');
        });
        
        // Periodic connection monitoring
        this.startConnectionMonitoring();
        
        console.log('🎯 Event listeners setup complete');
    }

    /**
     * Update connection status indicator with Turkish messages
     */
    updateConnectionStatus(status) {
        const statusElement = this.elements.connectionStatus;
        if (!statusElement) return;
        
        // Handle both boolean and string status - declare at method scope
        let statusKey;
        if (typeof status === 'boolean') {
            statusKey = status ? 'online' : 'offline';
        } else {
            statusKey = status;
        }
        
        const statusDot = statusElement.querySelector('.status-dot');
        const statusText = statusElement.querySelector('.status-text');
        
        if (statusDot && statusText) {
            // Update connection state
            this.state.connectionStatus = statusKey;
            
            // Update visual indicators
            switch (statusKey) {
                case 'online':
                    statusDot.className = 'status-dot';
                    statusText.textContent = this.connectionMessages.online;
                    break;
                case 'offline':
                    statusDot.className = 'status-dot offline';
                    statusText.textContent = this.connectionMessages.offline;
                    break;
                case 'reconnecting':
                    statusDot.className = 'status-dot reconnecting';
                    statusText.textContent = this.connectionMessages.reconnecting;
                    break;
                case 'error':
                    statusDot.className = 'status-dot offline';
                    statusText.textContent = this.connectionMessages.error;
                    break;
                default:
                    statusDot.className = 'status-dot offline';
                    statusText.textContent = this.connectionMessages.offline;
            }
        }
        
        console.log(`🌐 Connection status updated: ${statusKey} (${this.connectionMessages[statusKey] || statusKey})`);
        
        // Show connection error if offline
        if (statusKey === 'offline' && this.state.mode === 'idle') {
            this.showErrorState('CONNECTION_LOST');
        }
    }

    /**
     * Setup RFID card input listener with debouncing
     */
    setupRfidListener() {
        document.addEventListener('keydown', (event) => {
            // Only process RFID input in idle mode
            if (this.state.mode !== 'idle') return;
            
            // Ignore input if user is in an input field
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
            
            // Handle Enter key (end of RFID scan)
            if (event.key === 'Enter') {
                event.preventDefault();
                this.processRfidInput();
                return;
            }
            
            // Handle alphanumeric characters (RFID card data)
            if (event.key.length === 1 && /[A-Za-z0-9]/.test(event.key)) {
                event.preventDefault();
                this.addToRfidBuffer(event.key);
            }
        });
        
        console.log('🔍 RFID listener setup complete');
    }

    /**
     * Add character to RFID buffer with timeout
     */
    addToRfidBuffer(char) {
        this.rfidBuffer += char;
        
        // Clear existing timeout
        if (this.rfidTimeout) {
            clearTimeout(this.rfidTimeout);
        }
        
        // Set new timeout to clear buffer
        this.rfidTimeout = setTimeout(() => {
            this.rfidBuffer = '';
            this.rfidTimeout = null;
        }, 2000);
    }

    /**
     * Process RFID input with debouncing
     */
    processRfidInput() {
        if (this.rfidBuffer.length === 0) return;
        
        const cardId = this.rfidBuffer.trim();
        this.rfidBuffer = '';
        
        if (this.rfidTimeout) {
            clearTimeout(this.rfidTimeout);
            this.rfidTimeout = null;
        }
        
        // Debounce rapid card scans
        if (this.lastCardScan && (Date.now() - this.lastCardScan) < this.rfidDebounceDelay) {
            console.log('🚫 RFID input debounced');
            return;
        }
        
        this.lastCardScan = Date.now();
        console.log(`🎯 RFID card detected: ${cardId}`);
        
        this.handleCardScan(cardId);
    }

    /**
     * Handle RFID card scan with session cancellation
     */
    async handleCardScan(cardId) {
        try {
            // Cancel any existing session when new card is scanned (Requirement 3.5)
            if (this.state.mode === 'session' && this.state.sessionId) {
                console.log('🔄 New card scanned, cancelling existing session');
                this.endSession();
                await this.cancelExistingSession();
            }
            
            this.showLoadingState('Kart kontrol ediliyor...');
            
            // Check if card already has a locker assigned
            const existingLocker = await this.checkExistingLocker(cardId);
            
            if (existingLocker) {
                // Open existing locker and release assignment
                await this.openAndReleaseLocker(cardId, existingLocker.lockerId);
            } else {
                // Start new session for locker selection
                await this.startLockerSelection(cardId);
            }
            
        } catch (error) {
            console.error('🚨 Card scan error:', error);
            
            // Determine specific error type based on error details
            if (error.message.includes('network') || error.message.includes('fetch')) {
                this.showErrorState('NETWORK_ERROR');
            } else if (error.message.includes('timeout')) {
                this.showErrorState('CONNECTION_LOST');
            } else {
                this.showErrorState('CARD_READ_FAILED');
            }
        }
    }

    /**
     * Cancel existing session on server
     */
    async cancelExistingSession() {
        try {
            const response = await fetch('/api/session/cancel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    kiosk_id: this.kioskId,
                    reason: 'Yeni kart okundu'
                })
            });
            
            if (response.ok) {
                console.log('✅ Existing session cancelled on server');
            }
        } catch (error) {
            console.warn('⚠️ Failed to cancel session on server:', error);
            // Don't throw error, continue with new session
        }
    }

    /**
     * Check if card has existing locker assignment with enhanced error handling
     */
    async checkExistingLocker(cardId) {
        try {
            const response = await fetch(`/api/card/${cardId}/locker`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                if (response.status === 404) {
                    return null; // Card not found, not an error
                } else if (response.status >= 500) {
                    throw new Error('SERVER_ERROR');
                } else if (response.status === 401 || response.status === 403) {
                    throw new Error('CARD_INVALID');
                } else {
                    throw new Error('NETWORK_ERROR');
                }
            }
            
            const result = await response.json();
            return result.hasLocker ? result : null;
            
        } catch (error) {
            if (error.name === 'TypeError' || error.message.includes('fetch')) {
                throw new Error('CONNECTION_LOST');
            } else if (error.message.includes('timeout')) {
                throw new Error('NETWORK_ERROR');
            } else {
                throw error;
            }
        }
    }

    /**
     * Open existing locker and release assignment with enhanced error handling
     */
    async openAndReleaseLocker(cardId, lockerId) {
        try {
            this.showLoadingState('Dolap açılıyor...');
            
            const response = await fetch('/api/locker/release', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    cardId: cardId,
                    kioskId: this.kioskId
                })
            });
            
            if (!response.ok) {
                if (response.status >= 500) {
                    throw new Error('SERVER_ERROR');
                } else if (response.status === 404) {
                    throw new Error('LOCKER_UNAVAILABLE');
                } else {
                    throw new Error('HARDWARE_ERROR');
                }
            }
            
            const result = await response.json();
            
            if (result.success) {
                // Use the server's message which contains the correct display name
                this.showLoadingState(result.message.replace('ve serbest bırakıldı', '- Eşyalarınızı alın'));
                setTimeout(() => {
                    this.showIdleState();
                }, 3000);
            } else {
                // Check for specific error types from server response
                if (result.error === 'hardware_unavailable') {
                    throw new Error('HARDWARE_OFFLINE');
                } else if (result.error === 'hardware_failed') {
                    throw new Error('LOCKER_OPEN_FAILED');
                } else {
                    throw new Error('HARDWARE_ERROR');
                }
            }
            
        } catch (error) {
            console.error('🚨 Open and release error:', error);
            
            if (error.name === 'TypeError' || error.message.includes('fetch')) {
                this.showErrorState('CONNECTION_LOST');
            } else if (error.message.includes('timeout')) {
                this.showErrorState('NETWORK_ERROR');
            } else {
                this.showErrorState(error.message);
            }
        }
    }

    /**
     * Start locker selection session with enhanced error handling
     */
    async startLockerSelection(cardId) {
        try {
            this.showLoadingState('Müsait dolaplar yükleniyor...');
            
            const response = await fetch(`/api/lockers/available?kioskId=${this.kioskId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                if (response.status >= 500) {
                    throw new Error('SERVER_ERROR');
                } else if (response.status === 404) {
                    throw new Error('NO_LOCKERS_AVAILABLE');
                } else {
                    throw new Error('NETWORK_ERROR');
                }
            }
            
            const result = await response.json();
            
            if (result.lockers && result.lockers.length > 0) {
                this.state.selectedCard = cardId;
                this.state.sessionId = result.sessionId;
                this.state.availableLockers = result.lockers;
                this.startSession();
            } else {
                this.showErrorState('NO_LOCKERS_AVAILABLE');
            }
            
        } catch (error) {
            console.error('🚨 Start locker selection error:', error);
            
            if (error.name === 'TypeError' || error.message.includes('fetch')) {
                this.showErrorState('CONNECTION_LOST');
            } else if (error.message.includes('timeout')) {
                this.showErrorState('NETWORK_ERROR');
            } else {
                this.showErrorState(error.message);
            }
        }
    }

    /**
     * Start session mode with countdown
     */
    startSession() {
        this.state.mode = 'session';
        this.state.countdown = this.sessionTimeoutSeconds;
        
        this.renderLockerGrid();
        this.showSessionState();
        this.ensureCompactSessionTitle();
        this.startCountdown();
        
        console.log(`⏱️ Session started: ${this.state.sessionId}`);
    }

    /**
     * Start countdown timer
     */
    startCountdown() {
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
        }
        
        this.updateCountdownDisplay();
        
        this.countdownTimer = setInterval(() => {
            this.state.countdown--;
            this.updateCountdownDisplay();
            
            if (this.state.countdown <= 0) {
                this.handleSessionTimeout();
            }
        }, 1000);
    }

    /**
     * Update countdown display - Simple without animations
     */
    updateCountdownDisplay() {
        if (this.elements.countdownValue) {
            this.elements.countdownValue.textContent = this.state.countdown;
            
            // Add warning style when countdown is low (last 10 seconds)
            if (this.elements.sessionTimer) {
                if (this.state.countdown <= 10) {
                    this.elements.sessionTimer.classList.add('warning');
                } else {
                    this.elements.sessionTimer.classList.remove('warning');
                }
            }
        }
    }

    /**
     * Handle session timeout with proper error handling
     */
    handleSessionTimeout() {
        console.log('⏰ Session timeout');
        this.endSession();
        this.showErrorState('SESSION_EXPIRED');
    }

    /**
     * Handle locker click with visual feedback (Requirements 5.2, 5.3)
     */
    handleLockerClick(event) {
        const lockerTile = event.target.closest('.locker-tile');
        if (!lockerTile) {
            return;
        }
        
        // Provide immediate visual feedback for touch
        this.provideTouchFeedback(lockerTile);
        
        // Only allow selection of available lockers (Requirement 5.2)
        if (!lockerTile.classList.contains('available')) {
            console.log('🚫 Non-available locker clicked');
            return;
        }
        
        const lockerId = parseInt(lockerTile.dataset.lockerId);
        if (lockerId && this.state.mode === 'session') {
            this.selectLocker(lockerId);
        }
    }

    /**
     * Provide immediate touch feedback (Requirements 8.2, 8.3)
     */
    provideTouchFeedback(element) {
        // Prevent multiple simultaneous feedback animations
        if (element.dataset.feedbackActive === 'true') {
            return;
        }
        
        element.dataset.feedbackActive = 'true';
        
        // Add immediate visual feedback with enhanced animation
        element.style.transform = 'scale(0.95)';
        element.style.transition = 'transform 0.05s ease-out';
        element.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
        
        // Add haptic feedback if available (for mobile devices)
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
        
        // Reset feedback after animation
        setTimeout(() => {
            element.style.transform = '';
            element.style.boxShadow = '';
            element.style.transition = '';
            element.dataset.feedbackActive = 'false';
        }, 150);
        
        // Add ripple effect for enhanced visual feedback
        this.addRippleEffect(element);
    }

    /**
     * Add ripple effect for enhanced touch feedback (Requirement 8.2)
     */
    addRippleEffect(element) {
        // Create ripple element
        const ripple = document.createElement('div');
        ripple.className = 'touch-ripple';
        
        // Position ripple at touch point
        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = rect.width / 2 - size / 2;
        const y = rect.height / 2 - size / 2;
        
        ripple.style.cssText = `
            position: absolute;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.3);
            transform: scale(0);
            animation: ripple 0.3s ease-out;
            left: ${x}px;
            top: ${y}px;
            width: ${size}px;
            height: ${size}px;
            pointer-events: none;
            z-index: 1;
        `;
        
        // Add ripple to element
        element.style.position = 'relative';
        element.style.overflow = 'hidden';
        element.appendChild(ripple);
        
        // Remove ripple after animation
        setTimeout(() => {
            if (ripple.parentNode) {
                ripple.parentNode.removeChild(ripple);
            }
        }, 300);
    }

    /**
     * Handle screen resize events (Requirements 8.4, 8.5)
     */
    handleScreenResize() {
        const newWidth = window.innerWidth;
        const newHeight = window.innerHeight;
        
        // Update screen info
        this.screenInfo.width = newWidth;
        this.screenInfo.height = newHeight;
        this.screenInfo.orientation = newWidth > newHeight ? 'landscape' : 'portrait';
        this.screenInfo.isSmallScreen = newWidth < 800 || newHeight < 600;
        
        console.log('📱 Screen resized:', this.screenInfo);
        
        // Re-render locker grid if in session mode
        if (this.state.mode === 'session') {
            this.optimizeLockerGridForScreen();
        }
        
        // Adjust UI elements for new screen size
        this.adjustUIForScreenSize();
    }

    /**
     * Handle orientation change events (Requirements 8.4, 8.5)
     */
    handleOrientationChange() {
        console.log('🔄 Orientation changed to:', this.screenInfo.orientation);
        
        // Force layout recalculation
        document.body.style.display = 'none';
        document.body.offsetHeight; // Trigger reflow
        document.body.style.display = '';
        
        // Re-optimize for new orientation
        this.handleScreenResize();
    }

    /**
     * Optimize locker grid layout for current screen (Requirements 8.4, 8.5, 8.6)
     */
    optimizeLockerGridForScreen() {
        if (!this.elements.lockerGrid) return;
        
        const { width, height, orientation, isSmallScreen } = this.screenInfo;
        
        // Calculate optimal tile size and spacing
        let tileSize, gap, columns;
        
        if (isSmallScreen) {
            tileSize = 80;
            gap = 8;
            columns = Math.floor((width - 40) / (tileSize + gap));
        } else if (orientation === 'landscape') {
            tileSize = 120;
            gap = 12;
            columns = Math.floor((width - 80) / (tileSize + gap));
        } else {
            tileSize = 100;
            gap = 10;
            columns = Math.floor((width - 60) / (tileSize + gap));
        }
        
        // Ensure minimum columns and reasonable maximum for wide screens
        columns = Math.max(3, Math.min(10, columns));
        
        // Apply optimized layout
        this.elements.lockerGrid.style.gridTemplateColumns = `repeat(${columns}, ${tileSize}px)`;
        this.elements.lockerGrid.style.gap = `${gap}px`;
        
        // Update tile sizes
        const tiles = this.elements.lockerGrid.querySelectorAll('.locker-tile');
        tiles.forEach(tile => {
            tile.style.width = `${tileSize}px`;
            tile.style.height = `${tileSize}px`;
            // Ensure minimum touch target size
            tile.style.minWidth = '60px';
            tile.style.minHeight = '60px';
        });
        
        console.log(`📐 Optimized grid: ${columns} columns, ${tileSize}px tiles, ${gap}px gap`);
    }

    /**
     * Adjust UI elements for current screen size (Requirements 8.4, 8.6)
     */
    adjustUIForScreenSize() {
        const { isSmallScreen, pixelRatio } = this.screenInfo;
        
        // Adjust font sizes for small screens
        if (isSmallScreen) {
            document.documentElement.style.setProperty('--base-font-scale', '0.9');
        } else {
            document.documentElement.style.setProperty('--base-font-scale', '1.0');
        }
        
        // Adjust for high-DPI screens
        if (pixelRatio > 1.5) {
            document.documentElement.style.setProperty('--border-width', '1px');
            document.documentElement.style.setProperty('--icon-scale', '1.1');
        } else {
            document.documentElement.style.setProperty('--border-width', '2px');
            document.documentElement.style.setProperty('--icon-scale', '1.0');
        }
    }

    /**
     * Select and assign locker with comprehensive error handling
     */
    async selectLocker(lockerId) {
        try {
            this.showLoadingState('Dolap atanıyor...');
            
            const response = await fetch('/api/locker/assign', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    cardId: this.state.selectedCard,
                    lockerId: lockerId,
                    kioskId: this.kioskId
                })
            });
            
            if (!response.ok) {
                if (response.status >= 500) {
                    throw new Error('SERVER_ERROR');
                } else if (response.status === 409) {
                    throw new Error('LOCKER_UNAVAILABLE');
                } else if (response.status === 404) {
                    throw new Error('SESSION_INVALID');
                } else {
                    throw new Error('NETWORK_ERROR');
                }
            }
            
            const result = await response.json();
            
            if (result.success) {
                this.endSession();
                // Use the server's message which contains the correct display name
                this.showLoadingState(result.message.replace('ve atandı', '- Eşyalarınızı yerleştirin'));
                setTimeout(() => {
                    this.showIdleState();
                }, 3000);
            } else {
                // Handle specific server error responses
                if (result.error === 'assignment_failed') {
                    throw new Error('ASSIGNMENT_FAILED');
                } else if (result.error === 'hardware_unavailable') {
                    throw new Error('HARDWARE_OFFLINE');
                } else if (result.error === 'hardware_failed') {
                    throw new Error('LOCKER_OPEN_FAILED');
                } else if (result.error === 'session_expired') {
                    throw new Error('SESSION_EXPIRED');
                } else if (result.error === 'locker_unavailable') {
                    throw new Error('LOCKER_UNAVAILABLE');
                } else {
                    throw new Error('ASSIGNMENT_FAILED');
                }
            }
            
        } catch (error) {
            console.error('🚨 Locker assignment error:', error);
            
            if (error.name === 'TypeError' || error.message.includes('fetch')) {
                this.showErrorState('CONNECTION_LOST');
            } else if (error.message.includes('timeout')) {
                this.showErrorState('NETWORK_ERROR');
            } else {
                this.showErrorState(error.message);
            }
        }
    }

    /**
     * Render locker grid with clear visual indicators (Requirements 5.1, 5.2, 5.3, 8.1, 8.3)
     * Now uses dynamic layout based on Modbus configuration
     */
    async renderLockerGrid() {
        if (!this.elements.lockerGrid) {
            return;
        }
        
        try {
            // Get dynamic layout from configuration
            console.log('🔧 Loading dynamic locker layout...');
            const layoutUrl = `/api/ui/layout?kioskId=${encodeURIComponent(this.kioskId)}`;
            const layoutResponse = await fetch(layoutUrl);
            if (!layoutResponse.ok) {
                throw new Error('Failed to fetch layout configuration');
            }
            
            const layoutData = await layoutResponse.json();
            if (!layoutData.success) {
                throw new Error(layoutData.error || 'Layout fetch failed');
            }
            
            console.log('✅ Dynamic layout loaded successfully');
            console.log('📊 Hardware stats:', layoutData.stats);
            
            // Apply dynamic CSS
            this.applyDynamicGridCSS(layoutData.gridCSS);
            
            // Clear existing grid
            this.elements.lockerGrid.innerHTML = '';
            
            // Create locker tiles based on hardware configuration
            layoutData.layout.lockers.forEach(locker => {
                const tile = document.createElement('div');
                tile.className = `locker-tile available`; // Default to available, will be updated by status
                tile.dataset.lockerId = locker.id;
                tile.dataset.cardId = locker.cardId;
                tile.dataset.relayId = locker.relayId;
                tile.dataset.slaveAddress = locker.slaveAddress;
                
                tile.setAttribute('role', 'button');
                tile.setAttribute('tabindex', '0');
                tile.setAttribute('aria-label', `Dolap ${locker.displayName}, Boş`);
                
                // Add touch-friendly attributes (Requirements 8.1, 8.2, 8.3)
                tile.setAttribute('data-touch-target', 'true');
                tile.setAttribute('data-status', 'available');
                
                // Enhanced visual content with hardware info
                tile.innerHTML = `
                    <div class="locker-number">${locker.displayName}</div>
                    <div class="locker-status">BOŞ</div>
                    <div class="locker-hardware" style="font-size: 0.7em; opacity: 0.7; margin-top: 2px;">
                        C${locker.cardId}R${locker.relayId}
                    </div>
                `;
                
                // Add keyboard support
                tile.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        this.handleLockerClick(event);
                    }
                });
                
                this.elements.lockerGrid.appendChild(tile);
            });
            
            // Hide tiles not available (session shows only available)
            try {
                const availableSet = new Set((this.state.availableLockers || []).map(l => l.id));
                if (availableSet.size > 0) {
                    const tiles = this.elements.lockerGrid.querySelectorAll('.locker-tile');
                    tiles.forEach(t => {
                        const id = parseInt(t.dataset.lockerId);
                        if (!availableSet.has(id)) t.style.display = 'none';
                    });
                }
            } catch (_) {}

            // Update locker statuses if we have state data
            if (this.state.availableLockers) {
                this.updateLockerStatuses(this.state.availableLockers);
            }
            
            console.log(`🎯 Rendered ${layoutData.layout.lockers.length} locker tiles from hardware config`);
            console.log(`📊 Hardware: ${layoutData.stats.enabledCards} cards, ${layoutData.stats.totalChannels} channels`);
            
        } catch (error) {
            console.error('❌ Failed to render dynamic locker grid:', error);
            // Fallback to static rendering if dynamic fails
            this.renderStaticLockerGrid();
        }
    }
    
    /**
     * Apply dynamic CSS for grid layout
     */
    applyDynamicGridCSS(cssText) {
        // Remove existing dynamic styles
        const existingStyle = document.getElementById('dynamic-locker-grid-styles');
        if (existingStyle) {
            existingStyle.remove();
        }
        
        // Add new dynamic styles
        const style = document.createElement('style');
        style.id = 'dynamic-locker-grid-styles';
        style.textContent = cssText;
        document.head.appendChild(style);
    }

    /** Ensure compact session title exists and reads 'Dolap seçiniz' */
    ensureCompactSessionTitle() {
        try {
            const sessionScreen = this.elements.sessionScreen || document.getElementById('session-screen');
            const grid = this.elements.lockerGrid;
            if (!sessionScreen || !grid) return;

            // Hide legacy header if present
            const legacyHeader = sessionScreen.querySelector('.session-header');
            if (legacyHeader) legacyHeader.style.display = 'none';

            // Create or update compact title element
            let title = sessionScreen.querySelector('#session-title-compact');
            if (!title) {
                title = document.createElement('h2');
                title.id = 'session-title-compact';
                title.className = 'session-title-compact';
                grid.parentNode.insertBefore(title, grid);
            }
            title.textContent = 'Dolap seçiniz';
        } catch (_) {}
    }

    /**
     * Update locker statuses on existing tiles
     */
    updateLockerStatuses(lockers) {
        lockers.forEach(locker => {
            const tile = this.elements.lockerGrid.querySelector(`[data-locker-id="${locker.id}"]`);
            if (tile) {
                tile.className = `locker-tile ${locker.status}`;
                tile.dataset.status = locker.status;
                tile.setAttribute('aria-label', `Dolap ${locker.displayName || locker.id}, ${this.getStatusText(locker.status)}`);
                
                const statusElement = tile.querySelector('.locker-status');
                if (statusElement) {
                    statusElement.textContent = this.getStatusText(locker.status);
                }
                
                // Update tabindex based on availability
                tile.setAttribute('tabindex', locker.status === 'available' ? '0' : '-1');
            }
        });
    }
    
    /**
     * Fallback static rendering for compatibility
     */
    renderStaticLockerGrid() {
        if (!this.elements.lockerGrid || !this.state.availableLockers) {
            return;
        }
        
        console.log('⚠️ Using fallback static locker grid rendering');
        
        // Clear existing grid
        this.elements.lockerGrid.innerHTML = '';
        
        // Optimize grid layout for current screen
        this.optimizeLockerGridForScreen();
        
        // Create locker tiles with enhanced visual clarity and touch optimization
        this.state.availableLockers.forEach(locker => {
            const tile = document.createElement('div');
            tile.className = `locker-tile ${locker.status}`;
            tile.dataset.lockerId = locker.id;
            
            // Add accessibility attributes
            tile.setAttribute('role', 'button');
            tile.setAttribute('tabindex', locker.status === 'available' ? '0' : '-1');
            tile.setAttribute('aria-label', `Dolap ${locker.displayName || locker.id}, ${this.getStatusText(locker.status)}`);
            
            // Add touch-friendly attributes (Requirements 8.1, 8.2, 8.3)
            if (locker.status === 'available') {
                tile.setAttribute('aria-describedby', 'touch-hint');
                tile.style.cursor = 'pointer';
            }
            
            // Enhanced visual content
            tile.innerHTML = `
                <div class="locker-number">${locker.displayName || locker.id}</div>
                <div class="locker-status">${this.getStatusText(locker.status)}</div>
            `;
            
            // Add visual state indicators
            if (locker.status === 'available') {
                tile.setAttribute('aria-describedby', 'Seçmek için dokunun');
            } else if (locker.status === 'occupied') {
                tile.setAttribute('aria-describedby', 'Dolu - seçilemez');
            } else if (locker.status === 'disabled') {
                tile.setAttribute('aria-describedby', 'Kapalı - seçilemez');
            }
            
            this.elements.lockerGrid.appendChild(tile);
        });
        
        console.log(`🎯 Rendered ${this.state.availableLockers.length} locker tiles (static fallback)`);
    }

    /**
     * Get status text for locker - Clear visual indicators (Requirement 5.1)
     */
    getStatusText(status) {
        switch (status) {
            // Normalized UI status values
            case 'available': return 'BOŞ';
            case 'occupied': return 'DOLU';
            case 'disabled': return 'KAPALI';
            case 'opening': return 'AÇILIYOR';
            case 'error': return 'HATA';
            
            // Fallback for database status values (should not occur with normalization)
            case 'Free':
            case 'Boş': return 'BOŞ';
            case 'Dolu':
            case 'Occupied': return 'DOLU';
            case 'Engelli':
            case 'Disabled':
            case 'Blocked': return 'KAPALI';
            case 'Açılıyor':
            case 'Opening': return 'AÇILIYOR';
            case 'Hata':
            case 'Error': return 'HATA';
            
            default: return 'BİLİNMİYOR';
        }
    }

    /**
     * Get locker display name by ID
     */
    getLockerDisplayName(lockerId) {
        if (!this.state.availableLockers) {
            return `Dolap ${lockerId}`;
        }
        
        const locker = this.state.availableLockers.find(l => l.id === lockerId);
        return locker ? (locker.displayName || `Dolap ${lockerId}`) : `Dolap ${lockerId}`;
    }

    /**
     * Show idle state
     */
    showIdleState() {
        this.state.mode = 'idle';
        this.endSession();
        this.showScreen('idle');
        console.log('💤 Showing idle state');
    }

    /**
     * Show session state
     */
    showSessionState() {
        this.showScreen('session');
        
        // Show session timer
        if (this.elements.sessionTimer) {
            this.elements.sessionTimer.style.display = 'block';
        }
        
        console.log('🎯 Showing session state');
    }

    /**
     * Show loading state
     */
    showLoadingState(message) {
        this.state.mode = 'loading';
        
        if (this.elements.loadingText) {
            this.elements.loadingText.textContent = message;
        }
        
        this.showScreen('loading');
        console.log(`⏳ Loading: ${message}`);
    }

    /**
     * Show error state with comprehensive Turkish error handling (Requirements 6.1-6.6)
     */
    showErrorState(errorCode, customMessage = null) {
        this.state.mode = 'error';
        this.state.errorType = errorCode;
        
        // Get error details from catalog
        const errorInfo = this.errorMessages[errorCode] || this.errorMessages.UNKNOWN_ERROR;
        const message = customMessage || errorInfo.message;
        
        this.state.errorMessage = message;
        
        // Update error display with enhanced information
        this.updateErrorDisplay(errorInfo, message);
        
        this.showScreen('error');
        console.log(`🚨 Error [${errorCode}]: ${message}`);
        
        // Handle auto-retry if configured
        if (errorInfo.autoRetry && errorInfo.retryDelay) {
            console.log(`🔄 Auto-retry scheduled in ${errorInfo.retryDelay}ms`);
            setTimeout(() => {
                if (this.state.mode === 'error' && this.state.errorType === errorCode) {
                    this.handleErrorRecovery(errorCode);
                }
            }, errorInfo.retryDelay);
        } else {
            // Auto-return to idle after 10 seconds for non-retry errors
            setTimeout(() => {
                if (this.state.mode === 'error') {
                    this.showIdleState();
                }
            }, 10000);
        }
    }

    /**
     * Update error display with comprehensive information
     */
    updateErrorDisplay(errorInfo, message) {
        if (this.elements.errorText) {
            this.elements.errorText.textContent = message;
        }
        
        // Update error description
        if (this.elements.errorDescription && errorInfo.description) {
            this.elements.errorDescription.textContent = errorInfo.description;
            this.elements.errorDescription.style.display = 'block';
        } else if (this.elements.errorDescription) {
            this.elements.errorDescription.style.display = 'none';
        }
        
        // Update recovery instructions
        if (this.elements.errorRecovery && errorInfo.recovery) {
            this.elements.errorRecovery.textContent = errorInfo.recovery;
            this.elements.errorRecovery.style.display = 'block';
        } else if (this.elements.errorRecovery) {
            this.elements.errorRecovery.style.display = 'none';
        }
        
        // Show/hide retry button based on error type
        if (this.elements.retryButton) {
            if (errorInfo.autoRetry) {
                this.elements.retryButton.style.display = 'block';
                this.elements.retryButton.textContent = 'Tekrar Dene';
            } else {
                this.elements.retryButton.style.display = 'none';
            }
        }
        
        // Always show "Ana ekrana dön" button (Requirement 6.6)
        if (this.elements.returnButton) {
            this.elements.returnButton.style.display = 'block';
            this.elements.returnButton.textContent = 'Ana ekrana dön';
        }
    }

    /**
     * Handle error recovery based on error type
     */
    handleErrorRecovery(errorCode) {
        const errorInfo = this.errorMessages[errorCode];
        
        switch (errorCode) {
            case 'CARD_READ_FAILED':
                console.log('🔄 Recovering from card read failure - returning to idle');
                this.showIdleState();
                break;
                
            case 'SESSION_EXPIRED':
            case 'SESSION_INVALID':
                console.log('🔄 Recovering from session error - returning to idle');
                this.showIdleState();
                break;
                
            case 'NETWORK_ERROR':
            case 'CONNECTION_LOST':
                console.log('🔄 Recovering from network error - checking connection');
                this.checkConnectionAndRetry();
                break;
                
            case 'HARDWARE_ERROR':
                console.log('🔄 Recovering from hardware error - returning to idle');
                this.showIdleState();
                break;
                
            case 'SERVER_ERROR':
                console.log('🔄 Recovering from server error - returning to idle');
                this.showIdleState();
                break;
                
            default:
                console.log('🔄 Default recovery - returning to idle');
                this.showIdleState();
                break;
        }
    }

    /**
     * Check connection status and retry if online
     */
    async checkConnectionAndRetry() {
        try {
            // Test connection with a simple health check
            const response = await fetch('/health', {
                method: 'GET',
                timeout: 3000
            });
            
            if (response.ok) {
                console.log('✅ Connection restored');
                this.updateConnectionStatus(true);
                this.showIdleState();
            } else {
                throw new Error('Health check failed');
            }
        } catch (error) {
            console.log('❌ Connection still down, staying in error state');
            this.updateConnectionStatus(false);
            // Stay in error state, will retry again if auto-retry is enabled
        }
    }

    /**
     * Show specific screen - Pi Optimized with minimal DOM queries
     */
    showScreen(screenName) {
        // Use cached screens array for efficient switching
        const targetScreen = this.elements[`${screenName}Screen`];
        
        if (!targetScreen) {
            console.warn(`Screen not found: ${screenName}Screen`);
            return;
        }
        
        // Single pass through cached screens - much more efficient than Object.values
        this.screens.forEach(screen => {
            if (screen === targetScreen) {
                if (!screen.classList.contains('active')) {
                    screen.classList.add('active');
                }
            } else {
                if (screen.classList.contains('active')) {
                    screen.classList.remove('active');
                }
            }
        });
    }

    /**
     * Handle return to main - Always available (Requirement 6.6)
     */
    handleReturnToMain() {
        console.log('🏠 Returning to main screen');
        this.endSession(); // Clean up any active session
        this.showIdleState();
    }

    /**
     * Handle retry action for recoverable errors
     */
    handleRetryAction() {
        const errorType = this.state.errorType;
        console.log(`🔄 Manual retry requested for error: ${errorType}`);
        
        if (errorType && this.errorMessages[errorType]) {
            this.handleErrorRecovery(errorType);
        } else {
            // Default retry - return to idle
            this.showIdleState();
        }
    }

    /**
     * Start periodic connection monitoring
     */
    startConnectionMonitoring() {
        // Check connection every 30 seconds
        setInterval(async () => {
            try {
                const response = await fetch('/health', {
                    method: 'GET',
                    timeout: 5000
                });
                
                if (response.ok) {
                    if (this.state.connectionStatus !== 'online') {
                        console.log('🌐 Connection restored via monitoring');
                        this.updateConnectionStatus('online');
                    }
                } else {
                    throw new Error('Health check failed');
                }
            } catch (error) {
                if (this.state.connectionStatus === 'online') {
                    console.log('🌐 Connection lost via monitoring');
                    this.updateConnectionStatus('offline');
                }
            }
        }, 30000);
        
        console.log('🔍 Connection monitoring started');
    }

    /**
     * Handle window focus
     */
    handleWindowFocus() {
        // Resume any paused operations
        console.log('👁️ Window focused');
    }

    /**
     * Handle window blur
     */
    handleWindowBlur() {
        // Pause non-critical operations
        console.log('👁️ Window blurred');
    }

    /**
     * End current session with complete cleanup
     */
    endSession() {
        // Clear all timers
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
        
        if (this.sessionTimer) {
            clearTimeout(this.sessionTimer);
            this.sessionTimer = null;
        }
        
        // Hide session timer and remove warning styles
        if (this.elements.sessionTimer) {
            this.elements.sessionTimer.style.display = 'none';
            this.elements.sessionTimer.classList.remove('warning');
        }
        
        // Clear session state completely
        this.state.sessionId = null;
        this.state.selectedCard = null;
        this.state.availableLockers = [];
        this.state.countdown = 0;
        
        // Clear locker grid
        if (this.elements.lockerGrid) {
            this.elements.lockerGrid.innerHTML = '';
        }
        
        // Reset countdown display
        if (this.elements.countdownValue) {
            this.elements.countdownValue.textContent = '30';
        }
        
        console.log('🔚 Session ended with complete cleanup');
    }

    /**
     * Start memory management - Pi Optimized
     */
    startMemoryManagement() {
        // Regular cleanup interval
        setInterval(() => {
            this.performMemoryCleanup();
        }, this.cleanupInterval);
        
        // Memory monitoring for Pi
        if (window.performanceTracker) {
            setInterval(() => {
                this.monitorMemoryUsage();
            }, 15000); // Check memory every 15 seconds
        }
        
        console.log('🧹 Pi-optimized memory management started');
    }

    /**
     * Perform memory cleanup and session state management - Pi Optimized
     */
    performMemoryCleanup() {
        const now = Date.now();
        
        // Clear old RFID buffer
        if (this.rfidTimeout && (now - this.lastCardScan) > 10000) {
            this.rfidBuffer = '';
            if (this.rfidTimeout) {
                clearTimeout(this.rfidTimeout);
                this.rfidTimeout = null;
            }
        }
        
        // Clear old error states
        if (this.state.mode === 'error' && (now - this.lastCleanup) > 30000) {
            this.showIdleState();
        }
        
        // Ensure session state is properly cleared if expired
        if (this.state.mode === 'session' && this.state.countdown <= 0) {
            console.log('🧹 Cleaning up expired session state');
            this.endSession();
            this.showIdleState();
        }
        
        // Clear any orphaned session data
        if (this.state.sessionId && this.state.mode === 'idle') {
            console.log('🧹 Clearing orphaned session data');
            this.state.sessionId = null;
            this.state.selectedCard = null;
            this.state.availableLockers = [];
        }
        
        // Pi-specific memory optimizations
        this.optimizeMemoryUsage();
        
        this.lastCleanup = now;
        
        // Force garbage collection if available (development)
        if (window.gc && typeof window.gc === 'function') {
            try {
                window.gc();
            } catch (e) {
                // Ignore errors
            }
        }
        
        console.log('🧹 Pi-optimized memory cleanup performed');
    }

    /**
     * Monitor memory usage and trigger cleanup if needed - Pi Specific
     */
    monitorMemoryUsage() {
        if (!window.performanceTracker) return;
        
        const stats = window.performanceTracker.getStats();
        if (stats.memory && stats.memory.usagePercent > this.memoryThreshold) {
            console.warn(`⚠️ High memory usage detected: ${stats.memory.usagePercent}%`);
            this.optimizeMemoryUsage();
            
            // Force immediate cleanup
            this.performMemoryCleanup();
        }
    }

    /**
     * Optimize memory usage for Raspberry Pi
     */
    optimizeMemoryUsage() {
        // Limit cached locker data
        if (this.state.availableLockers && this.state.availableLockers.length > this.maxLockerCache) {
            this.state.availableLockers = this.state.availableLockers.slice(-this.maxLockerCache);
            console.log('🧹 Trimmed locker cache for Pi memory optimization');
        }
        
        // Clear localStorage if it gets too large
        try {
            const storageKeys = Object.keys(localStorage);
            const sessionKeys = storageKeys.filter(key => key.startsWith('session-'));
            
            if (sessionKeys.length > this.maxSessionHistory) {
                // Keep only the most recent sessions
                sessionKeys.slice(0, -this.maxSessionHistory).forEach(key => {
                    localStorage.removeItem(key);
                });
                console.log('🧹 Cleaned old session data from localStorage');
            }
            
            // Remove old performance data
            const perfKeys = storageKeys.filter(key => key.startsWith('perf-'));
            if (perfKeys.length > 20) {
                perfKeys.slice(0, -10).forEach(key => {
                    localStorage.removeItem(key);
                });
                console.log('🧹 Cleaned old performance data');
            }
        } catch (error) {
            console.warn('⚠️ Error cleaning localStorage:', error);
        }
        
        // Clear any large objects that might be hanging around
        if (this.elements.lockerGrid && this.elements.lockerGrid.children.length > 100) {
            // If we have too many locker tiles, clear and re-render
            console.log('🧹 Clearing excessive locker tiles for memory optimization');
            this.elements.lockerGrid.innerHTML = '';
        }
    }

    /**
     * Cleanup all resources
     */
    cleanup() {
        // Clear all timers
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
        }
        
        if (this.sessionTimer) {
            clearTimeout(this.sessionTimer);
        }
        
        if (this.rfidTimeout) {
            clearTimeout(this.rfidTimeout);
        }
        
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        
        // Clear state
        this.state = {
            mode: 'idle',
            sessionId: null,
            countdown: 0,
            selectedCard: null,
            availableLockers: [],
            errorMessage: null
        };
        
        // Clear buffers
        this.rfidBuffer = '';
        
        console.log('🧹 Cleanup completed');
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM loaded, initializing SimpleKioskApp...');
    window.kioskApp = new SimpleKioskApp();
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SimpleKioskApp;
}
