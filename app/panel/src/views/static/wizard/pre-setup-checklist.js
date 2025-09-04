/**
 * Pre-Setup Checklist Component
 * Interactive checklist with visual indicators and validation
 * Implements accessibility features and safety requirements
 */

class PreSetupChecklist {
    constructor(containerId, onStateChange) {
        this.containerId = containerId;
        this.onStateChange = onStateChange || (() => {});
        this.checklistItems = this.getChecklistItems();
        this.state = {};
        
        this.init();
    }

    /**
     * Get checklist items configuration
     */
    getChecklistItems() {
        return [
            {
                id: 'power_off',
                title: 'Sistem Gücünü Kapatın',
                description: 'Güvenlik için tüm röle kartlarının ve sistem gücünün kapatıldığından emin olun',
                detailedInstructions: [
                    'Ana güç anahtarını kapatın',
                    'Röle kartlarının LED\'lerinin söndüğünü kontrol edin',
                    'UPS varsa, UPS\'i de kapatın',
                    'En az 30 saniye bekleyin'
                ],
                icon: 'fas fa-power-off',
                iconColor: 'text-danger',
                required: true,
                category: 'safety',
                estimatedTime: '2 dakika'
            },
            {
                id: 'usb_connection',
                title: 'USB-RS485 Adaptörünü Bağlayın',
                description: 'USB-RS485 adaptörünü bilgisayara bağlayın ve sürücülerin yüklendiğinden emin olun',
                detailedInstructions: [
                    'USB-RS485 adaptörünü boş bir USB portuna takın',
                    'Windows\'un cihazı tanımasını bekleyin',
                    'Cihaz Yöneticisi\'nden COM port numarasını kontrol edin',
                    'Gerekirse sürücüleri yükleyin'
                ],
                icon: 'fas fa-usb',
                iconColor: 'text-primary',
                required: true,
                category: 'connection',
                estimatedTime: '3 dakika',
                troubleshooting: [
                    'Cihaz tanınmıyorsa farklı USB port deneyin',
                    'USB 3.0 yerine USB 2.0 port kullanmayı deneyin',
                    'Sürücü CD\'si varsa sürücüleri manuel yükleyin'
                ]
            },
            {
                id: 'modbus_wiring',
                title: 'Modbus Kablolarını Bağlayın',
                description: 'A ve B terminallerini doğru şekilde bağlayın (A+ ve B- veya Data+ ve Data-)',
                detailedInstructions: [
                    'USB-RS485 adaptörünün A terminalini röle kartının A+ terminaline bağlayın',
                    'USB-RS485 adaptörünün B terminalini röle kartının B- terminaline bağlayın',
                    'Kablo bağlantılarının sıkı olduğundan emin olun',
                    'Kablo uzunluğunun 1200 metreden az olduğunu kontrol edin'
                ],
                icon: 'fas fa-plug',
                iconColor: 'text-warning',
                required: true,
                category: 'connection',
                estimatedTime: '5 dakika',
                diagram: '/static/images/modbus-wiring-diagram.png',
                troubleshooting: [
                    'A ve B kablolarının yer değiştirmediğinden emin olun',
                    'Kablo hasarı olup olmadığını kontrol edin',
                    'Terminal bağlantılarının gevşek olmadığından emin olun'
                ]
            },
            {
                id: 'power_supply',
                title: 'Röle Kartı Güç Kaynağını Bağlayın',
                description: 'Röle kartının güç kaynağını bağlayın (genellikle 12V veya 24V DC)',
                detailedInstructions: [
                    'Röle kartının güç gereksinimlerini kontrol edin (12V/24V DC)',
                    'Uygun güç kaynağını seçin (minimum 2A önerilir)',
                    'Pozitif (+) ve negatif (-) kutupları doğru bağlayın',
                    'Güç kaynağını prize takın ama henüz açmayın'
                ],
                icon: 'fas fa-battery-full',
                iconColor: 'text-success',
                required: true,
                category: 'power',
                estimatedTime: '3 dakika',
                troubleshooting: [
                    'Güç kaynağının voltaj ve amper değerlerini kontrol edin',
                    'Kutup bağlantılarını tekrar kontrol edin',
                    'Güç kaynağının çalıştığından emin olun'
                ]
            },
            {
                id: 'safety_check',
                title: 'Güvenlik Kontrolü',
                description: 'Tüm bağlantıların güvenli olduğundan ve kısa devre riski olmadığından emin olun',
                detailedInstructions: [
                    'Tüm kablo bağlantılarını görsel olarak kontrol edin',
                    'Çıplak tel uçlarının birbirine değmediğinden emin olun',
                    'Su veya nem kaynağı olmadığından emin olun',
                    'Çalışma alanının temiz ve düzenli olduğunu kontrol edin'
                ],
                icon: 'fas fa-shield-alt',
                iconColor: 'text-info',
                required: true,
                category: 'safety',
                estimatedTime: '2 dakika'
            },
            {
                id: 'documentation',
                title: 'Dokümantasyonu Hazır Bulundurun',
                description: 'Röle kartının kullanım kılavuzunu ve teknik özelliklerini hazır bulundurun',
                detailedInstructions: [
                    'Röle kartının kullanım kılavuzunu bulun',
                    'Teknik özellikler sayfasını açık tutun',
                    'DIP switch ayarları tablosunu hazır bulundurun',
                    'Sorun giderme bölümünü işaretleyin'
                ],
                icon: 'fas fa-book',
                iconColor: 'text-secondary',
                required: false,
                category: 'preparation',
                estimatedTime: '1 dakika'
            }
        ];
    }

    /**
     * Initialize the checklist component
     */
    init() {
        this.render();
        this.setupEventListeners();
        this.initializeState();
    }

    /**
     * Render the checklist
     */
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('Checklist container not found:', this.containerId);
            return;
        }

        let html = `
            <div class="checklist-header mb-4">
                <div class="row">
                    <div class="col-md-8">
                        <h4><i class="fas fa-clipboard-check me-2"></i>Ön Hazırlık Kontrol Listesi</h4>
                        <p class="text-muted">Donanım kurulumuna başlamadan önce aşağıdaki adımları tamamlayın</p>
                    </div>
                    <div class="col-md-4 text-end">
                        <div class="checklist-progress">
                            <div class="progress mb-2">
                                <div class="progress-bar" id="checklistProgressBar" role="progressbar" style="width: 0%"></div>
                            </div>
                            <small class="text-muted">
                                <span id="checklistProgressText">0 / ${this.getRequiredItemsCount()} gerekli öğe tamamlandı</span>
                            </small>
                        </div>
                    </div>
                </div>
            </div>

            <div class="checklist-categories">
        `;

        // Group items by category
        const categories = this.groupItemsByCategory();
        
        Object.entries(categories).forEach(([category, items]) => {
            html += this.renderCategory(category, items);
        });

        html += `
            </div>
            
            <div class="checklist-footer mt-4">
                <div class="alert alert-info">
                    <div class="row align-items-center">
                        <div class="col-md-8">
                            <i class="fas fa-info-circle me-2"></i>
                            <strong>Önemli:</strong> Tüm gerekli kontrol listesi öğelerini tamamlamadan sonraki adıma geçemezsiniz.
                        </div>
                        <div class="col-md-4 text-end">
                            <button class="btn btn-outline-primary btn-sm" onclick="preSetupChecklist.showSafetyGuidelines()">
                                <i class="fas fa-shield-alt me-1"></i>Güvenlik Kuralları
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    /**
     * Group items by category
     */
    groupItemsByCategory() {
        const categories = {};
        
        this.checklistItems.forEach(item => {
            const category = item.category || 'general';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(item);
        });

        return categories;
    }

    /**
     * Render a category section
     */
    renderCategory(category, items) {
        const categoryTitles = {
            safety: 'Güvenlik',
            connection: 'Bağlantılar',
            power: 'Güç Kaynağı',
            preparation: 'Hazırlık'
        };

        const categoryIcons = {
            safety: 'fas fa-shield-alt text-danger',
            connection: 'fas fa-plug text-warning',
            power: 'fas fa-battery-full text-success',
            preparation: 'fas fa-clipboard-list text-info'
        };

        let html = `
            <div class="checklist-category mb-4">
                <h5 class="category-title">
                    <i class="${categoryIcons[category] || 'fas fa-list'} me-2"></i>
                    ${categoryTitles[category] || category.charAt(0).toUpperCase() + category.slice(1)}
                </h5>
                <div class="category-items">
        `;

        items.forEach(item => {
            html += this.renderChecklistItem(item);
        });

        html += `
                </div>
            </div>
        `;

        return html;
    }

    /**
     * Render a single checklist item
     */
    renderChecklistItem(item) {
        return `
            <div class="checklist-item" data-item="${item.id}">
                <div class="row align-items-start">
                    <div class="col-md-1">
                        <div class="form-check">
                            <input type="checkbox" 
                                   class="form-check-input" 
                                   id="check_${item.id}" 
                                   ${item.required ? 'required' : ''}
                                   aria-describedby="desc_${item.id}">
                        </div>
                    </div>
                    <div class="col-md-11">
                        <div class="item-content">
                            <div class="item-header d-flex align-items-center mb-2">
                                <i class="${item.icon} ${item.iconColor || 'text-primary'} me-2"></i>
                                <strong class="item-title">${item.title}</strong>
                                ${item.required ? '<span class="badge bg-danger ms-2">Gerekli</span>' : ''}
                                ${item.estimatedTime ? `<span class="badge bg-secondary ms-2">${item.estimatedTime}</span>` : ''}
                            </div>
                            
                            <p class="item-description text-muted mb-2" id="desc_${item.id}">
                                ${item.description}
                            </p>
                            
                            <div class="item-actions">
                                <button class="btn btn-outline-info btn-sm me-2" 
                                        onclick="preSetupChecklist.showInstructions('${item.id}')"
                                        aria-label="Detaylı talimatları göster">
                                    <i class="fas fa-info-circle me-1"></i>Detaylar
                                </button>
                                
                                ${item.diagram ? `
                                    <button class="btn btn-outline-secondary btn-sm me-2" 
                                            onclick="preSetupChecklist.showDiagram('${item.id}')"
                                            aria-label="Diyagram göster">
                                        <i class="fas fa-image me-1"></i>Diyagram
                                    </button>
                                ` : ''}
                                
                                ${item.troubleshooting ? `
                                    <button class="btn btn-outline-warning btn-sm" 
                                            onclick="preSetupChecklist.showTroubleshooting('${item.id}')"
                                            aria-label="Sorun giderme ipuçları">
                                        <i class="fas fa-wrench me-1"></i>Sorun Giderme
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Checkbox change events
        this.checklistItems.forEach(item => {
            const checkbox = document.getElementById(`check_${item.id}`);
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    this.updateItemState(item.id, e.target.checked);
                });
            }
        });
    }

    /**
     * Initialize state
     */
    initializeState() {
        this.checklistItems.forEach(item => {
            this.state[item.id] = {
                completed: false,
                required: item.required,
                category: item.category
            };
        });
        
        this.updateProgress();
    }

    /**
     * Update item state
     */
    updateItemState(itemId, completed) {
        if (this.state[itemId]) {
            this.state[itemId].completed = completed;
            
            // Update visual state
            const itemElement = document.querySelector(`[data-item="${itemId}"]`);
            if (itemElement) {
                if (completed) {
                    itemElement.classList.add('completed');
                } else {
                    itemElement.classList.remove('completed');
                }
            }
            
            // Update progress
            this.updateProgress();
            
            // Notify parent component
            this.onStateChange(this.state, this.isComplete());
            
            // Announce to screen readers
            const item = this.checklistItems.find(i => i.id === itemId);
            if (item) {
                this.announceToScreenReader(
                    completed ? 
                    `${item.title} tamamlandı` : 
                    `${item.title} tamamlanmadı`
                );
            }
        }
    }

    /**
     * Update progress display
     */
    updateProgress() {
        const requiredItems = Object.values(this.state).filter(item => item.required);
        const completedRequired = requiredItems.filter(item => item.completed);
        
        const progressPercentage = requiredItems.length > 0 ? 
            (completedRequired.length / requiredItems.length) * 100 : 0;
        
        const progressBar = document.getElementById('checklistProgressBar');
        const progressText = document.getElementById('checklistProgressText');
        
        if (progressBar) {
            progressBar.style.width = `${progressPercentage}%`;
            progressBar.setAttribute('aria-valuenow', progressPercentage.toString());
        }
        
        if (progressText) {
            progressText.textContent = `${completedRequired.length} / ${requiredItems.length} gerekli öğe tamamlandı`;
        }
    }

    /**
     * Check if checklist is complete
     */
    isComplete() {
        const requiredItems = Object.values(this.state).filter(item => item.required);
        return requiredItems.every(item => item.completed);
    }

    /**
     * Get required items count
     */
    getRequiredItemsCount() {
        return this.checklistItems.filter(item => item.required).length;
    }

    /**
     * Show detailed instructions modal
     */
    showInstructions(itemId) {
        const item = this.checklistItems.find(i => i.id === itemId);
        if (!item || !item.detailedInstructions) return;

        const modal = this.createModal(
            `${item.title} - Detaylı Talimatlar`,
            this.renderInstructions(item.detailedInstructions),
            'info'
        );
        
        modal.show();
    }

    /**
     * Show diagram modal
     */
    showDiagram(itemId) {
        const item = this.checklistItems.find(i => i.id === itemId);
        if (!item || !item.diagram) return;

        const modal = this.createModal(
            `${item.title} - Diyagram`,
            `<img src="${item.diagram}" class="img-fluid" alt="${item.title} diyagramı">`,
            'secondary'
        );
        
        modal.show();
    }

    /**
     * Show troubleshooting modal
     */
    showTroubleshooting(itemId) {
        const item = this.checklistItems.find(i => i.id === itemId);
        if (!item || !item.troubleshooting) return;

        const modal = this.createModal(
            `${item.title} - Sorun Giderme`,
            this.renderTroubleshooting(item.troubleshooting),
            'warning'
        );
        
        modal.show();
    }

    /**
     * Show safety guidelines modal
     */
    showSafetyGuidelines() {
        const safetyGuidelines = [
            'Elektrik işlemleri yapmadan önce mutlaka güç kaynağını kapatın',
            'Islak ellerle elektrikli cihazlara dokunmayın',
            'Kablo bağlantılarını yaparken dikkatli olun',
            'Kısa devre riskini önlemek için çıplak tellerin birbirine değmemesine dikkat edin',
            'Güç kaynağının voltaj ve amper değerlerinin uygun olduğundan emin olun',
            'Çalışma alanınızı temiz ve düzenli tutun',
            'Emin olmadığınız durumlarda uzman yardımı alın'
        ];

        const modal = this.createModal(
            'Güvenlik Kuralları',
            this.renderSafetyGuidelines(safetyGuidelines),
            'danger'
        );
        
        modal.show();
    }

    /**
     * Render instructions list
     */
    renderInstructions(instructions) {
        let html = '<ol class="list-group list-group-numbered">';
        instructions.forEach(instruction => {
            html += `<li class="list-group-item">${instruction}</li>`;
        });
        html += '</ol>';
        return html;
    }

    /**
     * Render troubleshooting list
     */
    renderTroubleshooting(troubleshooting) {
        let html = '<ul class="list-group">';
        troubleshooting.forEach(tip => {
            html += `<li class="list-group-item"><i class="fas fa-lightbulb text-warning me-2"></i>${tip}</li>`;
        });
        html += '</ul>';
        return html;
    }

    /**
     * Render safety guidelines
     */
    renderSafetyGuidelines(guidelines) {
        let html = '<ul class="list-group">';
        guidelines.forEach(guideline => {
            html += `<li class="list-group-item"><i class="fas fa-exclamation-triangle text-danger me-2"></i>${guideline}</li>`;
        });
        html += '</ul>';
        return html;
    }

    /**
     * Create and show modal
     */
    createModal(title, content, type = 'info') {
        const modalId = 'checklistModal_' + Date.now();
        const typeColors = {
            info: 'primary',
            warning: 'warning',
            danger: 'danger',
            secondary: 'secondary'
        };

        const modalHtml = `
            <div class="modal fade" id="${modalId}" tabindex="-1" aria-labelledby="${modalId}Label" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-${typeColors[type]} text-white">
                            <h5 class="modal-title" id="${modalId}Label">${title}</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Kapat"></button>
                        </div>
                        <div class="modal-body">
                            ${content}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Kapat</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add modal to DOM
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Create Bootstrap modal instance
        const modalElement = document.getElementById(modalId);
        // Simple modal show without Bootstrap
        modalElement.style.display = 'block';
        modalElement.classList.add('show');
        
        // Clean up modal when hidden
        modalElement.addEventListener('hidden.bs.modal', () => {
            modalElement.remove();
        });

        return modal;
    }

    /**
     * Announce to screen readers
     */
    announceToScreenReader(message) {
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = message;
        
        document.body.appendChild(announcement);
        
        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }

    /**
     * Get current state
     */
    getState() {
        return this.state;
    }

    /**
     * Set state (for loading saved state)
     */
    setState(newState) {
        this.state = { ...this.state, ...newState };
        
        // Update checkboxes
        Object.entries(this.state).forEach(([itemId, itemState]) => {
            const checkbox = document.getElementById(`check_${itemId}`);
            if (checkbox) {
                checkbox.checked = itemState.completed;
                this.updateItemState(itemId, itemState.completed);
            }
        });
    }
}

// Global instance for HTML event handlers
let preSetupChecklist;