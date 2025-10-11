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
        this.kioskZone = this.getKioskZoneFromUrl(); // Get zone from URL parameter or config
        this.sessionTimeoutSeconds = 30; // 30-second session timeout per requirements
        this.openOnlyWindowHours = 1; // Default open-only window before config loads

        // Timers and intervals
        this.sessionTimer = null;
        this.countdownTimer = null;
        this.pollingInterval = null;
        
        // RFID input handling
        this.rfidBuffer = '';
        this.rfidTimeout = null;
        this.rfidDebounceDelay = 500; // Debounce RFID input
        this.pendingCardScan = null;
        this.pendingCardTimeout = null;
        this.pendingCardTtlMs = 8000;
        
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
    async init() {
        this.cacheElements();
        this.setupEventListeners();
        this.setupRfidListener();
        this.startMemoryManagement();
        this.updateConnectionStatus(navigator.onLine);
        
        // Detect zone from server if not specified in URL
        if (!this.kioskZone) {
            await this.detectZoneFromServer();
        } else {
            this.updateZoneDisplay();
        }
        
        this.showIdleState();
        
        console.log('✅ SimpleKioskApp initialized successfully');
    }

    /**
     * Get kiosk zone from URL parameter or detect from server
     * Supports: ?zone=mens, ?zone=womens, or auto-detection
     */
    getKioskZoneFromUrl() {
        // Check URL parameter first
        const urlParams = new URLSearchParams(window.location.search);
        const zoneParam = urlParams.get('zone');
        
        if (zoneParam) {
            console.log(`🎯 Zone detected from URL: ${zoneParam}`);
            return zoneParam;
        }
        
        // No zone specified - will be detected from server health endpoint
        console.log('📋 No zone specified in URL - will auto-detect from server');
        return null;
    }

    /**
     * Detect zone from server health endpoint
     */
    async detectZoneFromServer() {
        try {
            const response = await fetch('/health');
            if (response.ok) {
                const health = await response.json();
                if (health.kiosk_zone) {
                    console.log(`🎯 Zone detected from server: ${health.kiosk_zone}`);
                    this.kioskZone = health.kiosk_zone;
                    this.updateZoneDisplay();
                    return health.kiosk_zone;
                }
            }
        } catch (error) {
            console.warn('⚠️ Could not detect zone from server:', error);
        }
        return null;
    }

    /**
     * Update UI to show zone information
     */
    updateZoneDisplay() {
        if (!this.kioskZone) return;
        
        // Add zone indicator to the UI
        const zoneNames = {
            'mens': 'Erkek Dolap Sistemi',
            'womens': 'Kadın Dolap Sistemi'
        };
        
        const zoneName = zoneNames[this.kioskZone] || this.kioskZone;
        
        // Update page title
        document.title = `${zoneName} - eForm Locker`;
        
        // Add zone indicator to idle screen if it exists
        const idleScreen = this.elements.idleScreen;
        if (idleScreen) {
            let zoneIndicator = idleScreen.querySelector('.zone-indicator');
            if (!zoneIndicator) {
                zoneIndicator = document.createElement('div');
                zoneIndicator.className = 'zone-indicator';
                zoneIndicator.style.cssText = `
                    position: absolute;
                    top: 20px;
                    right: 20px;
                    background: rgba(0, 123, 255, 0.1);
                    color: #007bff;
                    padding: 8px 16px;
                    border-radius: 20px;
                    font-size: 14px;
                    font-weight: bold;
                    border: 2px solid #007bff;
                `;
                idleScreen.appendChild(zoneIndicator);
            }
            zoneIndicator.textContent = zoneName;
        }
        
        console.log(`🎯 Zone display updated: ${zoneName}`);
    }

    /**
     * Get zone-aware error message
     */
    getZoneAwareErrorMessage(errorType) {
        const baseError = this.errorMessages[errorType];
        if (!baseError || !this.kioskZone) {
            return baseError;
        }

        // Add zone context to certain error messages
        const zoneNames = {
            'mens': 'erkek bölgesi',
            'womens': 'kadın bölgesi'
        };
        
        const zoneName = zoneNames[this.kioskZone] || this.kioskZone;
        
        if (errorType === 'NO_LOCKERS_AVAILABLE') {
            return {
                ...baseError,
                message: `${zoneName.charAt(0).toUpperCase() + zoneName.slice(1)} dolapları dolu - Daha sonra deneyin`,
                description: `Şu anda ${zoneName} dolaplarının tümü kullanımda`
            };
        }
        
        return baseError;
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
            'return-button', 'retry-button', 'session-close-button',
            'feedback-screen', 'feedback-icon', 'feedback-text'
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
            this.elements.errorScreen,
            this.elements.feedbackScreen
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

        if (this.elements.sessionCloseButton) {
            this.elements.sessionCloseButton.addEventListener('click', () => {
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

            this.enableTouchScrolling(this.elements.lockerGrid);
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
     * Ensure the locker grid supports direct touch scrolling on kiosks.
     */
    enableTouchScrolling(scrollContainer) {
        if (!scrollContainer || scrollContainer.dataset.touchScroll === 'enabled') {
            return;
        }

        scrollContainer.dataset.touchScroll = 'enabled';

        // Hint browsers that vertical panning is expected for this region.
        scrollContainer.style.touchAction = scrollContainer.style.touchAction || 'pan-y';
        scrollContainer.style.webkitOverflowScrolling = scrollContainer.style.webkitOverflowScrolling || 'touch';

        if (!this.screenInfo.isTouch) {
            return; // Mouse/keyboard scrolling already works.
        }

        let startY = 0;
        let startX = 0;
        let startScrollTop = 0;
        let startScrollLeft = 0;
        let isTouching = false;

        const onTouchStart = (event) => {
            if (event.touches.length !== 1) {
                return;
            }

            isTouching = true;
            startY = event.touches[0].clientY;
            startX = event.touches[0].clientX;
            startScrollTop = scrollContainer.scrollTop;
            startScrollLeft = scrollContainer.scrollLeft;
        };

        const onTouchMove = (event) => {
            if (!isTouching || event.touches.length !== 1) {
                return;
            }

            const currentTouch = event.touches[0];
            const deltaY = startY - currentTouch.clientY;
            const deltaX = startX - currentTouch.clientX;

            if (Math.abs(deltaY) >= Math.abs(deltaX)) {
                scrollContainer.scrollTop = startScrollTop + deltaY;
                event.preventDefault();
            } else if (scrollContainer.scrollWidth > scrollContainer.clientWidth) {
                scrollContainer.scrollLeft = startScrollLeft + deltaX;
                event.preventDefault();
            }
        };

        const onTouchEnd = () => {
            isTouching = false;
        };

        scrollContainer.addEventListener('touchstart', onTouchStart, { passive: true });
        scrollContainer.addEventListener('touchmove', onTouchMove, { passive: false });
        scrollContainer.addEventListener('touchend', onTouchEnd, { passive: true });
        scrollContainer.addEventListener('touchcancel', onTouchEnd, { passive: true });
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

        const now = Date.now();

        // Debounce rapid card scans
        if (this.lastCardScan && (now - this.lastCardScan) < this.rfidDebounceDelay) {
            console.log('🚫 RFID input debounced');
            return;
        }

        // Queue card scans while kiosk is busy
        if (['loading', 'session', 'error'].includes(this.state.mode)) {
            this.lastCardScan = now;
            this.pendingCardScan = { cardId, timestamp: now };

            if (this.pendingCardTimeout) {
                clearTimeout(this.pendingCardTimeout);
            }

            this.pendingCardTimeout = setTimeout(() => {
                if (this.pendingCardScan && (Date.now() - this.pendingCardScan.timestamp) >= this.pendingCardTtlMs) {
                    console.warn('⌛ Pending RFID card scan expired');
                    this.pendingCardScan = null;
                    this.pendingCardTimeout = null;
                }
            }, this.pendingCardTtlMs);

            console.log(`📥 RFID card buffered during ${this.state.mode} state: ${cardId}`);
            return;
        }

        this.lastCardScan = now;
        console.log(`🎯 RFID card detected: ${cardId}`);

        this.handleCardScan(cardId);
    }

    /**
     * Consume pending card scan if available
     */
    consumePendingCardScan() {
        if (!this.pendingCardScan) {
            return;
        }

        const { cardId } = this.pendingCardScan;
        this.pendingCardScan = null;

        if (this.pendingCardTimeout) {
            clearTimeout(this.pendingCardTimeout);
            this.pendingCardTimeout = null;
        }

        this.lastCardScan = Date.now();
        console.log(`📤 Processing buffered RFID card: ${cardId}`);
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
            this.showToast('Kart okundu', `Hoşgeldiniz! Kart: -${cardId}`);

            
            // Check if card already has a locker assigned
            const existingLocker = await this.checkExistingLocker(cardId);
            
            if (existingLocker) {
                // Decision screen: open only vs. finish & release (Idea 5)
                this.state.selectedCard = cardId;
                await this.showOwnedDecision(cardId, existingLocker.lockerId, existingLocker.displayName, {
                    ownedAt: existingLocker.ownedAt,
                    reservedAt: existingLocker.reservedAt
                });
            } else {
                try {
                    const flowResult = await this.requestLockerFlow(cardId);

                    if (flowResult && Array.isArray(flowResult.debug_logs) && flowResult.debug_logs.length > 0) {
                        const groupLabel = `[AUTO-ASSIGN][UI] Decision trace for card ${cardId}`;
                        console.groupCollapsed(groupLabel);
                        flowResult.debug_logs.forEach((entry, index) => {
                            console.log(`↳ [${index + 1}]`, entry);
                        });
                        console.groupEnd();
                    }

                    if (flowResult && flowResult.action === 'open_locker') {
                        this.showFeedbackScreen(flowResult.message || 'Dolap açıldı', 'success');
                        return;
                    }

                    if (flowResult && flowResult.action === 'show_lockers') {
                        await this.startLockerSelection(cardId, flowResult);
                        return;
                    }

                    if (flowResult && flowResult.error) {
                        if (flowResult.error === 'no_lockers') {
                            this.showErrorState('NO_LOCKERS_AVAILABLE');
                            return;
                        }

                        console.warn('Flow response reported error, falling back to manual fetch:', flowResult.error);
                    }
                } catch (flowError) {
                    console.warn('Failed to request locker flow, falling back to manual fetch:', flowError);
                }

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
            if (typeof result.openOnlyWindowHours === 'number') {
                this.setOpenOnlyWindowHours(result.openOnlyWindowHours);
            }
            if (result.hasLocker) {
                const parseTimestamp = (value) => {
                    if (!value) return null;
                    const parsed = Date.parse(value);
                    return Number.isNaN(parsed) ? null : parsed;
                };
                return {
                    hasLocker: true,
                    lockerId: result.lockerId,
                    displayName: result.displayName || null,
                    ownedAt: parseTimestamp(result.ownedAt),
                    reservedAt: parseTimestamp(result.reservedAt),
                    message: result.message
                };
            }

            return null;
            
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

    async requestLockerFlow(cardId) {
        const payload = {
            card_id: cardId,
            kiosk_id: this.kioskId
        };

        if (this.kioskZone) {
            payload.zone = this.kioskZone;
        }

        const response = await fetch('/api/rfid/handle-card', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`FLOW_REQUEST_FAILED:${response.status}`);
        }

        return await response.json();
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
                this.showFeedbackScreen(result.message.replace('ve serbest bırakıldı', '- Eşyalarınızı alın'), 'success');
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
     * Show decision screen for owned locker: Open vs Finish & Release (Idea 5)
     */
    async showOwnedDecision(cardId, lockerId, displayName, ownershipTimestamps = {}) {
        // Build lightweight overlay if not exists
        let overlay = document.getElementById('owned-decision-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'owned-decision-overlay';
            overlay.className = 'owned-decision-overlay';

            const panel = document.createElement('div');
            panel.className = 'owned-decision-panel';

            panel.innerHTML = `
                <div class="owned-decision-shell">
                    <button id="owned-decision-close" class="owned-decision-close" aria-label="Ana ekrana dön">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                    <header class="owned-decision-header">
                        <span class="owned-decision-header-kicker">DOLABINIZ</span>
                        <h2 class="owned-decision-title">
                            <span id="owned-decision-locker" class="owned-decision-title-locker">Dolap</span>
                        </h2>
                        <p id="owned-decision-desc" class="owned-decision-desc">Dolabı tekrar açmak mı istiyorsunuz, yoksa teslim ederek başkalarının kullanımına açmak mı?</p>
                    </header>
                    <div class="owned-decision-buttons">
                        <button id="btn-finish-release" class="owned-decision-button owned-decision-button--primary">
                            <div class="owned-decision-badge" aria-hidden="true">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12" y2="16"></line></svg>
                                <span>SON KEZ AÇILIR</span>
                            </div>
                            <div class="owned-decision-card-icon" aria-hidden="true">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
                            </div>
                            <div class="owned-decision-copy">
                                <span class="owned-decision-button-title">Dolabı teslim et ve kilidi aç</span>
                                <span class="owned-decision-button-subtitle">Dolap kalıcı olarak başkalarının kullanımına açılır</span>
                            </div>
                            <div class="owned-decision-chevron" aria-hidden="true">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>
                            </div>
                        </button>
                        <button id="btn-open-only" class="owned-decision-button owned-decision-button--secondary">
                            <div class="owned-decision-card-icon" aria-hidden="true">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M9 3v18"></path><path d="M13 12h5"></path></svg>
                            </div>
                            <div class="owned-decision-copy">
                                <span class="owned-decision-button-title owned-decision-button-title--glow">Eşya almak için aç</span>
                                <span class="owned-decision-button-subtitle">Teslim etmeden dolabı açıp eşyalarınızı alabilirsiniz</span>
                            </div>
                            <div class="owned-decision-chevron" aria-hidden="true">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>
                            </div>
                        </button>
                    </div>
                    <div id="bottom-info" class="owned-decision-info">Teslim ettiğinizde dolap yeniden kilitlenir ve başkalarının kullanımına açılır.</div>
                </div>
            `;
            overlay.appendChild(panel);
            document.body.appendChild(overlay);
        }

        // Update content with locker id
        const lockerLabel = document.getElementById('owned-decision-locker');
        if (lockerLabel) {
            const resolvedName = displayName || `Dolap ${lockerId}`;
            lockerLabel.textContent = resolvedName;
        }

        overlay.style.display = 'flex';

        // Wire buttons
        const btnFinish = document.getElementById('btn-finish-release');
        const btnClose = document.getElementById('owned-decision-close');
        const btnOpenOnly = document.getElementById('btn-open-only');

        const closeOverlay = () => { overlay.style.display = 'none'; };

        // Ensure old listeners do not stack
        btnFinish.replaceWith(btnFinish.cloneNode(true));
        if (btnClose) {
            btnClose.replaceWith(btnClose.cloneNode(true));
        }
        if (btnOpenOnly) {
            btnOpenOnly.replaceWith(btnOpenOnly.cloneNode(true));
        }

        const btnFinish2 = document.getElementById('btn-finish-release');
        const btnClose2 = document.getElementById('owned-decision-close');
        const btnOpenOnly2 = document.getElementById('btn-open-only');

        const shouldShowOpenOnly = this.shouldShowOpenOnlyButton(ownershipTimestamps.ownedAt, ownershipTimestamps.reservedAt);
        const openOnlyWindowHours = this.getOpenOnlyWindowHours();
        const bottomInfo = document.getElementById('bottom-info');

        if (btnOpenOnly2) {
            if (shouldShowOpenOnly) {
                btnOpenOnly2.style.display = 'flex';
                btnOpenOnly2.addEventListener('click', async () => {
                    closeOverlay();
                    await this.openOwnedLockerOnly(cardId);
                });
            } else {
                btnOpenOnly2.style.display = 'none';
            }
        }

        if (bottomInfo) {
            if (openOnlyWindowHours <= 0) {
                bottomInfo.textContent = 'Bu seçenek şu anda devre dışı. Dolabı yalnızca teslim ederek açabilirsiniz. Teslim ettiğinizde dolap yeniden kilitlenir ve başkalarının kullanımına açılır.';
            } else {
                const windowLabel = this.formatHoursForDisplay(openOnlyWindowHours);
                const windowDuration = this.formatHoursForDuration(openOnlyWindowHours);
                bottomInfo.textContent = shouldShowOpenOnly
                    ? `Eşyalarınızı almak için dolabı açabilirsiniz. İlk ${windowLabel} içinde bu seçenek aktiftir. Teslim etmeyi seçerseniz dolap yeniden kilitlenir ve başkalarının kullanımına açılır.`
                    : `${windowDuration} doldu. Dolabı yalnızca teslim ederek açabilirsiniz. Teslim ettiğinizde dolap yeniden kilitlenir ve başkalarının kullanımına açılır.`;
            }
        }

        btnFinish2.addEventListener('click', async () => {
            closeOverlay();
            await this.openAndReleaseLocker(cardId, lockerId);
        });
        if (btnClose2) {
            btnClose2.addEventListener('click', () => {
                closeOverlay();
                this.handleReturnToMain();
            });
        }
    }

    /**
     * Determine if the open-only button should be visible based on ownership age
     */
    setOpenOnlyWindowHours(value) {
        if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
            return;
        }

        const clamped = Math.max(0, Math.min(24, value));
        this.openOnlyWindowHours = Math.round(clamped * 10) / 10;
    }

    getOpenOnlyWindowHours() {
        const value = typeof this.openOnlyWindowHours === 'number' && Number.isFinite(this.openOnlyWindowHours)
            ? this.openOnlyWindowHours
            : 0;
        return Math.max(0, Math.min(24, value));
    }

    formatHoursForDisplay(hours) {
        const normalized = this.getOpenOnlyWindowHoursFromValue(hours);
        if (normalized === 0) {
            return '0 saat';
        }
        return normalized.toLocaleString('tr-TR', {
            minimumFractionDigits: normalized % 1 === 0 ? 0 : 1,
            maximumFractionDigits: 1
        }) + ' saat';
    }

    formatHoursForDuration(hours) {
        const normalized = this.getOpenOnlyWindowHoursFromValue(hours);
        if (normalized === 0) {
            return 'Belirlenen süre';
        }
        const baseLabel = this.formatHoursForDisplay(normalized);
        return baseLabel.endsWith('saat')
            ? `${baseLabel}lik süre`
            : `${baseLabel} süresi`;
    }

    getOpenOnlyWindowHoursFromValue(value) {
        if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
            return 0;
        }
        const clamped = Math.max(0, Math.min(24, value));
        return Math.round(clamped * 10) / 10;
    }

    shouldShowOpenOnlyButton(ownedAtTimestamp, reservedAtTimestamp) {
        const windowHours = this.getOpenOnlyWindowHours();
        if (windowHours <= 0) {
            return false;
        }

        const windowMs = windowHours * 60 * 60 * 1000;

        const normalize = (value) => {
            if (value === null || value === undefined) {
                return null;
            }
            if (typeof value === 'number') {
                return Number.isNaN(value) ? null : value;
            }
            if (value instanceof Date) {
                return value.getTime();
            }
            const parsed = Date.parse(value);
            return Number.isNaN(parsed) ? null : parsed;
        };

        const referenceTimestamp = normalize(ownedAtTimestamp) ?? normalize(reservedAtTimestamp);

        if (referenceTimestamp === null) {
            return true;
        }

        const elapsed = Date.now() - referenceTimestamp;

        if (elapsed < 0) {
            return true;
        }

        return elapsed <= windowMs;
    }

    /**
     * Open owned locker without releasing (Idea 5)
     */
    async openOwnedLockerOnly(cardId) {
        try {
            this.showLoadingState('Dolap açılıyor...');
            const response = await fetch('/api/locker/open-again', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cardId: cardId, kioskId: this.kioskId })
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
                // Keep ownership; just inform and return to idle shortly
                this.showFeedbackScreen(result.message || 'Dolap açıldı', 'success');
            } else {
                if (result.error === 'hardware_unavailable') {
                    throw new Error('HARDWARE_OFFLINE');
                } else if (result.error === 'hardware_failed') {
                    throw new Error('LOCKER_OPEN_FAILED');
                } else {
                    throw new Error('HARDWARE_ERROR');
                }
            }
        } catch (error) {
            console.error('Open-owned-only error:', error);
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
    async startLockerSelection(cardId, flowPayload = null) {
        try {
            this.showLoadingState('Müsait dolaplar yükleniyor...');

            let payload = flowPayload;

            if (!payload) {
                const zoneParam = this.kioskZone ? `&zone=${encodeURIComponent(this.kioskZone)}` : '';
                const apiUrl = `/api/lockers/available?kiosk_id=${this.kioskId}${zoneParam}`;

                console.log(`🎯 Fetching available lockers: ${apiUrl}`);

                const response = await fetch(apiUrl, {
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

                payload = await response.json();
            }

            const rawLockers = Array.isArray(payload)
                ? payload
                : (payload && payload.lockers)
                    ? payload.lockers
                    : [];

            const sessionId = Array.isArray(payload)
                ? `temp-${Date.now()}`
                : (payload && (payload.session_id || payload.sessionId))
                    ? payload.session_id || payload.sessionId
                    : `temp-${Date.now()}`;

            const timeoutSeconds = (payload && (payload.timeout_seconds || payload.timeoutSeconds))
                ? payload.timeout_seconds || payload.timeoutSeconds
                : this.sessionTimeoutSeconds;

            const fallbackReason = payload && (payload.fallback_reason || payload.fallbackReason)
                ? payload.fallback_reason || payload.fallbackReason
                : null;

            // Normalize to UI shape and keep ONLY available lockers
            const lockers = rawLockers
                .filter(l => (l.status === 'Free' || l.status === 'available' || l.status === 'Boş'))
                .map(l => ({
                    id: l.id,
                    status: 'available',
                    displayName: l.display_name || l.displayName || `Dolap ${l.id}`,
                    is_vip: !!l.is_vip
                }));

            if (lockers.length > 0) {
                this.state.selectedCard = cardId;
                this.state.sessionId = sessionId;
                this.state.availableLockers = lockers;
                if (fallbackReason) {
                    this.showToast('Manuel seçim', 'Otomatik atama tamamlanamadı, lütfen dolap seçin.');
                }
                this.startSession(timeoutSeconds);
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
    startSession(timeoutSeconds = this.sessionTimeoutSeconds) {
        this.state.mode = 'session';
        this.state.countdown = timeoutSeconds;

        const cardIdElement = document.querySelector('.card-id');
        if (cardIdElement) {
            cardIdElement.textContent = `Kart: - ${this.state.selectedCard}`;
        }

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
            const seconds = String(this.state.countdown).padStart(2, '0');
            this.elements.countdownValue.textContent = `0:${seconds}`;
            
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
            // Get dynamic layout from configuration (zone-aware)
            console.log('🔧 Loading dynamic locker layout...');
            const zoneParam = this.kioskZone ? `&zone=${encodeURIComponent(this.kioskZone)}` : '';
            const layoutUrl = `/api/ui/layout?kioskId=${encodeURIComponent(this.kioskId)}${zoneParam}`;
            console.log(`🎯 Layout URL: ${layoutUrl}`);
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

            const layoutLockers = Array.isArray(layoutData.layout?.lockers) ? layoutData.layout.lockers : [];
            const layoutLockerMap = new Map(layoutLockers.map(locker => [locker.id, locker]));
            const hasAvailableLockers = Array.isArray(this.state.availableLockers) && this.state.availableLockers.length > 0;

            if (hasAvailableLockers) {
                const mergedLockers = this.state.availableLockers.map(locker => {
                    const layoutLocker = layoutLockerMap.get(locker.id);
                    const displayName = layoutLocker?.displayName || locker.displayName || `Dolap ${locker.id}`;
                    return {
                        ...locker,
                        displayName,
                        cardId: layoutLocker?.cardId ?? locker.cardId ?? null,
                        relayId: layoutLocker?.relayId ?? locker.relayId ?? null,
                        slaveAddress: layoutLocker?.slaveAddress ?? locker.slaveAddress ?? null,
                        size: layoutLocker?.size ?? locker.size ?? ''
                    };
                });

                mergedLockers.sort((a, b) => {
                    const nameA = a.displayName || `${a.id}`;
                    const nameB = b.displayName || `${b.id}`;
                    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base', numeric: true });
                });

                this.state.availableLockers = mergedLockers;
            }

            const lockersToRender = hasAvailableLockers
                ? this.state.availableLockers
                : layoutLockers.map(locker => ({
                    id: locker.id,
                    displayName: locker.displayName,
                    status: 'available',
                    cardId: locker.cardId,
                    relayId: locker.relayId,
                    slaveAddress: locker.slaveAddress,
                    size: locker.size
                }));

            lockersToRender.forEach(locker => {
                const tile = document.createElement('div');
                const statusClass = locker.status || 'available';
                tile.className = `locker-tile ${statusClass}`;
                tile.dataset.lockerId = locker.id;

                if (locker.cardId !== undefined && locker.cardId !== null) {
                    tile.dataset.cardId = String(locker.cardId);
                }
                if (locker.relayId !== undefined && locker.relayId !== null) {
                    tile.dataset.relayId = String(locker.relayId);
                }
                if (locker.slaveAddress !== undefined && locker.slaveAddress !== null) {
                    tile.dataset.slaveAddress = String(locker.slaveAddress);
                }

                tile.setAttribute('role', 'button');
                tile.setAttribute('tabindex', statusClass === 'available' ? '0' : '-1');
                tile.setAttribute('aria-label', `Dolap ${locker.displayName || locker.id}, ${this.getStatusText(statusClass)}`);

                // Add touch-friendly attributes (Requirements 8.1, 8.2, 8.3)
                tile.setAttribute('data-touch-target', 'true');
                tile.setAttribute('data-status', statusClass);

                // Enhanced visual content with hardware info
                tile.innerHTML = `
                    <div class="locker-number">${locker.displayName || locker.id}</div>
                    <div class="locker-size">${locker.size || ''}</div>
                    <div class="locker-status">${this.getStatusText(statusClass)}</div>
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

            // Update locker statuses if we have state data
            if (this.state.availableLockers) {
                this.updateLockerStatuses(this.state.availableLockers);
            }
            
            // Adjust grid for large locker counts to ensure they fit on screen
            this.adjustGridForLockerCount(lockersToRender.length);

            const renderLogSuffix = hasAvailableLockers ? ' (sorted by display name)' : '';
            console.log(`🎯 Rendered ${lockersToRender.length} locker tiles from hardware config${renderLogSuffix}`);
            console.log(`📊 Hardware: ${layoutData.stats.enabledCards} cards, ${layoutData.stats.totalChannels} channels`);
            
        } catch (error) {
            console.error('❌ Failed to render dynamic locker grid:', error);
            // Fallback to static rendering if dynamic fails
            this.renderStaticLockerGrid();
        }
    }

    /**
     * Dynamically adjust the grid to fit a large number of lockers.
     */
    adjustGridForLockerCount(lockerCount) {
        if (!this.elements.lockerGrid || lockerCount <= 32) { // Only run for large locker counts
            if (this.elements.lockerGrid) {
                // Restore default styles if not adjusting
                this.elements.lockerGrid.style.cssText = '';
            }
            return;
        }

        console.log(`Large locker count (${lockerCount}) detected. Adjusting grid layout.`);

        const grid = this.elements.lockerGrid;

        setTimeout(() => {
            const availableWidth = grid.clientWidth;
            const availableHeight = grid.clientHeight;

            if (availableWidth === 0 || availableHeight === 0) {
                console.warn("Grid dimensions are not available for adjustment.");
                return;
            }

            const gap = 8;

            // Prioritize horizontal fit by determining column count first.
            // Aim for tiles around 100px wide to start.
            let numCols = Math.floor(availableWidth / (100 + gap));
            numCols = Math.max(4, Math.min(12, numCols)); // Clamp between 4 and 12 columns

            let numRows = Math.ceil(lockerCount / numCols);

            // Now calculate height based on fitting all rows.
            let tileHeight = Math.floor(availableHeight / numRows) - gap;
            tileHeight = Math.max(48, tileHeight); // Enforce minimum touch target size.

            console.log(`Adjusting grid for ${lockerCount} lockers: ${numCols} cols x ${numRows} rows, tile height: ${tileHeight}px`);

            // Apply styles that force horizontal fit and control vertical size.
            grid.style.setProperty('display', 'grid', 'important');
            grid.style.setProperty('grid-template-columns', `repeat(${numCols}, 1fr)`, 'important');
            grid.style.setProperty('grid-auto-rows', `${tileHeight}px`, 'important');
            grid.style.setProperty('gap', `${gap}px`, 'important');
            grid.style.setProperty('overflow', 'hidden', 'important');
            grid.style.setProperty('align-content', 'center', 'important');

            const tiles = grid.querySelectorAll('.locker-tile');
            tiles.forEach(tile => {
                tile.style.setProperty('height', `${tileHeight}px`, 'important');
                tile.style.setProperty('width', 'auto', 'important'); // Let grid's 1fr handle width.

                const numberElement = tile.querySelector('.locker-number');
                if (numberElement) {
                    const fontSize = Math.max(10, Math.floor(tileHeight / 4));
                    numberElement.style.setProperty('font-size', `${fontSize}px`, 'important');
                }
                const statusElement = tile.querySelector('.locker-status');
                if (statusElement) {
                    const statusFontSize = Math.max(8, Math.floor(tileHeight / 9));
                    statusElement.style.setProperty('font-size', `${statusFontSize}px`, 'important');
                }
            });
        }, 150);
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

            const legacyHeader = sessionScreen.querySelector('.session-header');
            if (legacyHeader) legacyHeader.style.display = 'none';

            const mainHeader = sessionScreen.querySelector('.session-main-header');

            let title = sessionScreen.querySelector('#session-title-compact');
            if (!title) {
                title = document.createElement('h2');
                title.id = 'session-title-compact';
                title.className = 'session-title-compact';
            }

            if (mainHeader) {
                if (!mainHeader.contains(title)) {
                    mainHeader.insertBefore(title, mainHeader.firstChild || null);
                }
            } else if (title.parentElement !== grid.parentNode || title.nextSibling !== grid) {
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

        const lockers = Array.isArray(this.state.availableLockers) ? this.state.availableLockers : [];
        if (lockers.length === 0) {
            return;
        }

        // Create locker tiles with enhanced visual clarity and touch optimization
        lockers.forEach(locker => {
            const statusClass = locker.status || 'available';
            const displayName = locker.displayName || `Dolap ${locker.id}`;
            const statusText = this.getStatusText(statusClass);
            const tile = document.createElement('div');
            tile.className = `locker-tile ${statusClass}`;
            tile.dataset.lockerId = locker.id;

            // Add accessibility attributes
            tile.setAttribute('role', 'button');
            tile.setAttribute('tabindex', statusClass === 'available' ? '0' : '-1');
            tile.setAttribute('aria-label', `Dolap ${displayName}, ${statusText}`);

            // Add touch-friendly attributes (Requirements 8.1, 8.2, 8.3)
            if (statusClass === 'available') {
                tile.setAttribute('aria-describedby', 'touch-hint');
                tile.style.cursor = 'pointer';
            }

            // Enhanced visual content
            tile.innerHTML = `
                <div class="locker-number">${displayName}</div>
                <div class="locker-status">${statusText}</div>
            `;

            // Add visual state indicators
            if (statusClass === 'available') {
                tile.setAttribute('aria-describedby', 'Seçmek için dokunun');
            } else if (statusClass === 'occupied') {
                tile.setAttribute('aria-describedby', 'Dolu - seçilemez');
            } else if (statusClass === 'disabled') {
                tile.setAttribute('aria-describedby', 'Kapalı - seçilemez');
            }

            this.elements.lockerGrid.appendChild(tile);
        });

        console.log(`🎯 Rendered ${lockers.length} locker tiles (static fallback)`);
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

        this.consumePendingCardScan();
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
        
        // Get zone-aware error details from catalog
        const errorInfo = this.getZoneAwareErrorMessage(errorCode) || this.errorMessages.UNKNOWN_ERROR;
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
     * Show a dedicated feedback screen.
     */
    showFeedbackScreen(message, type = 'success') {
        this.state.mode = 'feedback';

        const iconContainer = this.elements.feedbackIcon;
        const textElement = this.elements.feedbackText;

        if (!iconContainer || !textElement) {
            console.error("Feedback screen elements not found!");
            // Fallback to loading screen
            this.showLoadingState(message);
            return;
        }

        // Set message
        textElement.textContent = message;

        // Set icon based on type
        iconContainer.innerHTML = ''; // Clear previous icon
        iconContainer.className = `feedback-icon ${type}`;
        if (type === 'success') {
            iconContainer.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
            `;
        } else { // error
            iconContainer.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
            `;
        }

        this.showScreen('feedback');

        // Automatically return to idle screen after a delay
        setTimeout(() => {
            if (this.state.mode === 'feedback') {
                this.showIdleState();
            }
        }, 3000);
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

    showToast(title, message) {
        const toastContainer = document.getElementById('toasts');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = 'toast';

        toast.innerHTML = `
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
        `;

        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 500);
        }, 3000);
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
