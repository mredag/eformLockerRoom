/**
 * Accessibility Enhancements for Admin Panel UI
 * Task 7: Validate accessibility and usability improvements
 * 
 * This script adds accessibility features to the existing admin panel
 * to ensure WCAG 2.1 AA compliance and improve usability.
 */

(function() {
    'use strict';

    console.log('🔧 Initializing accessibility enhancements...');

    /**
     * Accessibility Enhancement Manager
     */
    class AccessibilityEnhancer {
        constructor() {
            this.init();
        }

        init() {
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.enhance());
            } else {
                this.enhance();
            }
        }

        enhance() {
            console.log('🎯 Applying accessibility enhancements...');
            
            this.addSkipLinks();
            this.enhanceKeyboardNavigation();
            this.addAriaLabels();
            this.setupLiveRegions();
            this.enhanceColorBlindnessSupport();
            this.improveTouchAccessibility();
            this.setupFocusManagement();
            this.addScreenReaderSupport();
            
            console.log('✅ Accessibility enhancements applied successfully');
        }

        /**
         * Add skip links for keyboard navigation
         */
        addSkipLinks() {
            const skipLinksHtml = `
                <div class="skip-links" style="position: absolute; top: -40px; left: 6px; z-index: 9999;">
                    <a href="#main-content" class="skip-link">Ana içeriğe geç</a>
                    <a href="#locker-grid" class="skip-link">Dolap listesine geç</a>
                    <a href="#filters" class="skip-link">Filtrelere geç</a>
                </div>
            `;

            // Add skip links CSS
            const skipLinksStyle = document.createElement('style');
            skipLinksStyle.textContent = `
                .skip-link {
                    position: absolute;
                    top: -40px;
                    left: 6px;
                    background: #000;
                    color: #fff;
                    padding: 8px;
                    text-decoration: none;
                    border-radius: 4px;
                    z-index: 10000;
                    font-weight: bold;
                }
                .skip-link:focus {
                    top: 6px;
                }
            `;
            document.head.appendChild(skipLinksStyle);

            // Insert skip links at the beginning of body
            document.body.insertAdjacentHTML('afterbegin', skipLinksHtml);

            console.log('✓ Skip links added for keyboard navigation');
        }

        /**
         * Enhance keyboard navigation support
         */
        enhanceKeyboardNavigation() {
            // Add keyboard support to RFID display elements
            const rfidElements = document.querySelectorAll('.locker-owner.selectable');
            rfidElements.forEach(element => {
                element.setAttribute('tabindex', '0');
                element.setAttribute('role', 'button');
                element.setAttribute('aria-label', 'RFID numarasını seç ve kopyala');

                element.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        element.click();
                        this.announceToScreenReader(`RFID numarası seçildi: ${element.textContent}`);
                    }
                });
            });

            // Add arrow key navigation to locker grid
            this.setupGridNavigation();

            // Enhance focus indicators
            const focusStyle = document.createElement('style');
            focusStyle.textContent = `
                .locker-owner.selectable:focus,
                .locker-card:focus,
                button:focus,
                a:focus,
                input:focus,
                select:focus {
                    outline: 2px solid #667eea !important;
                    outline-offset: 2px !important;
                    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.2) !important;
                }
                
                .locker-card:focus {
                    transform: translateY(-2px);
                }
            `;
            document.head.appendChild(focusStyle);

            console.log('✓ Keyboard navigation enhanced');
        }

        /**
         * Setup grid navigation with arrow keys
         */
        setupGridNavigation() {
            const lockerGrid = document.getElementById('locker-grid');
            if (!lockerGrid) return;

            let currentIndex = 0;
            let lockerCards = [];

            const updateLockerCards = () => {
                lockerCards = Array.from(lockerGrid.querySelectorAll('.locker-card'));
                lockerCards.forEach((card, index) => {
                    card.setAttribute('tabindex', index === currentIndex ? '0' : '-1');
                    card.setAttribute('data-grid-index', index.toString());
                });
            };

            const focusCard = (index) => {
                if (index >= 0 && index < lockerCards.length) {
                    currentIndex = index;
                    updateLockerCards();
                    lockerCards[index].focus();
                }
            };

            lockerGrid.addEventListener('keydown', (e) => {
                const cols = Math.floor(lockerGrid.offsetWidth / 220); // Approximate card width
                
                switch (e.key) {
                    case 'ArrowRight':
                        e.preventDefault();
                        focusCard(Math.min(currentIndex + 1, lockerCards.length - 1));
                        break;
                    case 'ArrowLeft':
                        e.preventDefault();
                        focusCard(Math.max(currentIndex - 1, 0));
                        break;
                    case 'ArrowDown':
                        e.preventDefault();
                        focusCard(Math.min(currentIndex + cols, lockerCards.length - 1));
                        break;
                    case 'ArrowUp':
                        e.preventDefault();
                        focusCard(Math.max(currentIndex - cols, 0));
                        break;
                    case 'Home':
                        e.preventDefault();
                        focusCard(0);
                        break;
                    case 'End':
                        e.preventDefault();
                        focusCard(lockerCards.length - 1);
                        break;
                }
            });

            // Update cards when grid changes
            const observer = new MutationObserver(updateLockerCards);
            observer.observe(lockerGrid, { childList: true, subtree: true });

            updateLockerCards();
        }

        /**
         * Add comprehensive ARIA labels and roles
         */
        addAriaLabels() {
            // Add main landmarks
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                mainContent.setAttribute('role', 'main');
                mainContent.setAttribute('id', 'main-content');
                mainContent.setAttribute('aria-label', 'Dolap yönetimi ana içerik');
            }

            const header = document.querySelector('.header');
            if (header) {
                header.setAttribute('role', 'banner');
                header.setAttribute('aria-label', 'Site başlığı ve navigasyon');
            }

            const navLinks = document.querySelector('.nav-links');
            if (navLinks) {
                navLinks.setAttribute('role', 'navigation');
                navLinks.setAttribute('aria-label', 'Ana navigasyon menüsü');
            }

            // Add filters section labels
            const filters = document.querySelector('.filters');
            if (filters) {
                filters.setAttribute('id', 'filters');
                filters.setAttribute('role', 'search');
                filters.setAttribute('aria-label', 'Dolap filtreleme seçenekleri');
            }

            // Add locker grid labels
            const lockerGrid = document.getElementById('locker-grid');
            if (lockerGrid) {
                lockerGrid.setAttribute('role', 'grid');
                lockerGrid.setAttribute('aria-label', 'Dolap listesi');
                lockerGrid.setAttribute('aria-describedby', 'grid-instructions');
                
                // Add grid instructions
                const instructions = document.createElement('div');
                instructions.id = 'grid-instructions';
                instructions.className = 'sr-only';
                instructions.textContent = 'Ok tuşları ile dolaşın, Enter ile seçin, Space ile işlem yapın';
                lockerGrid.parentNode.insertBefore(instructions, lockerGrid);
            }

            // Enhance locker cards with proper ARIA
            this.enhanceLockerCards();

            console.log('✓ ARIA labels and roles added');
        }

        /**
         * Enhance individual locker cards with accessibility features
         */
        enhanceLockerCards() {
            const lockerCards = document.querySelectorAll('.locker-card');
            
            lockerCards.forEach(card => {
                card.setAttribute('role', 'gridcell');
                card.setAttribute('tabindex', '-1');
                
                // Create comprehensive aria-label
                const displayName = card.querySelector('.locker-display-name')?.textContent || '';
                const status = card.querySelector('.locker-state-chip')?.textContent || '';
                const owner = card.querySelector('.locker-owner')?.textContent || 'Yok';
                
                const ariaLabel = `${displayName}, Durum: ${status}, Sahip: ${owner}`;
                card.setAttribute('aria-label', ariaLabel);

                // Add status as aria-describedby
                const statusChip = card.querySelector('.locker-state-chip');
                if (statusChip) {
                    const statusId = `status-${Math.random().toString(36).substr(2, 9)}`;
                    statusChip.setAttribute('id', statusId);
                    statusChip.setAttribute('role', 'status');
                    card.setAttribute('aria-describedby', statusId);
                }

                // Enhance RFID display
                const ownerElement = card.querySelector('.locker-owner');
                if (ownerElement && ownerElement.classList.contains('selectable')) {
                    ownerElement.setAttribute('aria-label', `RFID numarası: ${ownerElement.textContent}. Kopyalamak için tıklayın veya Enter tuşuna basın.`);
                }
            });
        }

        /**
         * Setup live regions for dynamic content updates
         */
        setupLiveRegions() {
            // Create main announcement region
            const announceRegion = document.createElement('div');
            announceRegion.id = 'accessibility-announcements';
            announceRegion.setAttribute('aria-live', 'polite');
            announceRegion.setAttribute('aria-atomic', 'true');
            announceRegion.className = 'sr-only';
            document.body.appendChild(announceRegion);

            // Create urgent announcement region
            const urgentRegion = document.createElement('div');
            urgentRegion.id = 'accessibility-urgent-announcements';
            urgentRegion.setAttribute('aria-live', 'assertive');
            urgentRegion.setAttribute('aria-atomic', 'true');
            urgentRegion.className = 'sr-only';
            document.body.appendChild(urgentRegion);

            // Add screen reader only styles
            const srOnlyStyle = document.createElement('style');
            srOnlyStyle.textContent = `
                .sr-only {
                    position: absolute !important;
                    width: 1px !important;
                    height: 1px !important;
                    padding: 0 !important;
                    margin: -1px !important;
                    overflow: hidden !important;
                    clip: rect(0, 0, 0, 0) !important;
                    white-space: nowrap !important;
                    border: 0 !important;
                }
            `;
            document.head.appendChild(srOnlyStyle);

            console.log('✓ Live regions setup for screen reader announcements');
        }

        /**
         * Enhance support for color blindness
         */
        enhanceColorBlindnessSupport() {
            // Add pattern-based indicators
            const patternStyle = document.createElement('style');
            patternStyle.textContent = `
                /* Pattern-based status indicators for color blindness support */
                .state-bos::before {
                    content: "✓ ";
                    font-weight: bold;
                }
                
                .state-sahipli::before {
                    content: "● ";
                    font-weight: bold;
                }
                
                .state-rezerve::before {
                    content: "⏳ ";
                }
                
                .state-aciliyor::before {
                    content: "🔓 ";
                }
                
                .state-hata::before {
                    content: "⚠️ ";
                }
                
                .state-engelli::before {
                    content: "🚫 ";
                }

                /* High contrast mode support */
                @media (prefers-contrast: high) {
                    .locker-card {
                        border: 2px solid !important;
                    }
                    
                    .locker-state-chip {
                        border: 1px solid !important;
                        font-weight: bold !important;
                    }
                }

                /* Reduced motion support */
                @media (prefers-reduced-motion: reduce) {
                    .locker-card,
                    .locker-state-chip,
                    .locker-owner {
                        transition: none !important;
                        animation: none !important;
                    }
                }
            `;
            document.head.appendChild(patternStyle);

            console.log('✓ Color blindness support enhanced with patterns and icons');
        }

        /**
         * Improve touch accessibility for mobile devices
         */
        improveTouchAccessibility() {
            // Enhance touch targets
            const touchStyle = document.createElement('style');
            touchStyle.textContent = `
                /* Ensure minimum touch target sizes */
                @media (pointer: coarse) {
                    .locker-owner.selectable {
                        min-height: 44px !important;
                        min-width: 44px !important;
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        padding: 8px !important;
                    }
                    
                    .btn-sm {
                        min-height: 44px !important;
                        min-width: 44px !important;
                        padding: 12px 16px !important;
                    }
                    
                    .locker-card {
                        min-height: 120px !important;
                        padding: 16px !important;
                    }
                }

                /* Touch feedback */
                .locker-owner.selectable:active,
                .locker-card:active,
                button:active {
                    transform: scale(0.98) !important;
                    background-color: rgba(102, 126, 234, 0.1) !important;
                }
            `;
            document.head.appendChild(touchStyle);

            console.log('✓ Touch accessibility improved for mobile devices');
        }

        /**
         * Setup comprehensive focus management
         */
        setupFocusManagement() {
            let lastFocusedElement = null;

            // Save focus before modal opens
            document.addEventListener('focusin', (e) => {
                if (!e.target.closest('.modal')) {
                    lastFocusedElement = e.target;
                }
            });

            // Focus management for modals
            const modals = document.querySelectorAll('.modal');
            modals.forEach(modal => {
                modal.setAttribute('role', 'dialog');
                modal.setAttribute('aria-modal', 'true');
                
                modal.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        this.closeModal(modal);
                    }
                });
            });

            // Restore focus when modal closes
            this.restoreFocus = () => {
                if (lastFocusedElement && lastFocusedElement.focus) {
                    lastFocusedElement.focus();
                }
            };

            console.log('✓ Focus management setup completed');
        }

        /**
         * Add comprehensive screen reader support
         */
        addScreenReaderSupport() {
            // Enhance status announcements
            const originalRenderLockerCard = window.renderLockerCard;
            if (originalRenderLockerCard) {
                window.renderLockerCard = (locker) => {
                    const result = originalRenderLockerCard(locker);
                    
                    // Announce status changes
                    const statusText = this.getStatusText(locker.status);
                    this.announceToScreenReader(`Dolap ${locker.display_name || locker.id} durumu güncellendi: ${statusText}`);
                    
                    return result;
                };
            }

            // Enhance form validation messages
            const forms = document.querySelectorAll('form');
            forms.forEach(form => {
                form.addEventListener('submit', (e) => {
                    const invalidFields = form.querySelectorAll(':invalid');
                    if (invalidFields.length > 0) {
                        this.announceToScreenReader(`Form hatası: ${invalidFields.length} alan geçersiz`, true);
                    }
                });
            });

            console.log('✓ Screen reader support enhanced');
        }

        /**
         * Announce message to screen readers
         */
        announceToScreenReader(message, urgent = false) {
            const regionId = urgent ? 'accessibility-urgent-announcements' : 'accessibility-announcements';
            const region = document.getElementById(regionId);
            
            if (region) {
                region.textContent = message;
                
                // Clear after announcement
                setTimeout(() => {
                    region.textContent = '';
                }, 1000);
            }
        }

        /**
         * Get Turkish status text for announcements
         */
        getStatusText(status) {
            const statusMap = {
                'Free': 'Boş',
                'Owned': 'Sahipli',
                'Reserved': 'Rezerve',
                'Opening': 'Açılıyor',
                'Blocked': 'Engelli',
                'Error': 'Hata'
            };
            
            return statusMap[status] || status;
        }

        /**
         * Close modal and restore focus
         */
        closeModal(modal) {
            modal.style.display = 'none';
            this.restoreFocus();
        }
    }

    // Initialize accessibility enhancements
    new AccessibilityEnhancer();

    // Export for testing
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AccessibilityEnhancer;
    }

})();