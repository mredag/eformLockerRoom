/**
 * Address Configuration Component
 * Automatic and manual address assignment with visual feedback
 * Implements broadcast configuration with progress indicators
 * Requirements: 2.4, 3.1, 3.2, 3.3
 */

class AddressConfiguration {
    constructor(containerId, onStateChange) {
        this.containerId = containerId;
        this.onStateChange = onStateChange || (() => {});
        this.detectedDevices = [];
        this.configurationResults = [];
        this.isConfiguring = false;
        this.configurationMode = 'automatic'; // 'automatic' or 'manual'
        this.addressConflicts = [];
        this.availableAddresses = [];
        this.configurationProgress = {
            currentStep: 0,
            totalSteps: 0,
            currentDevice: null,
            status: 'idle'
        };
        
        this.init();
    }

    /**
     * Initialize the address configuration component
     */
    init() {
        this.render();
        this.setupEventListeners();
        // Load detected devices from previous step
        this.loadDetectedDevices();
    }

    /**
     * Render the address configuration interface
     */
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('Address configuration container not found:', this.containerId);
            return;
        }

        container.innerHTML = `
            <div class="address-configuration-container">
                <!-- Header -->
                <div class="configuration-header mb-4">
                    <div class="row">
                        <div class="col-md-8">
                            <h4><i class="fas fa-network-wired me-2"></i>Adres Yapılandırması</h4>
                            <p class="text-muted">Tespit edilen cihazlar için slave adresleri otomatik olarak yapılandırılıyor...</p>
                        </div>
                        <div class="col-md-4 text-end">
                            <div class="btn-group" role="group">
                                <input type="radio" class="btn-check" name="configMode" id="autoMode" value="automatic" checked>
                                <label class="btn btn-outline-primary" for="autoMode">
                                    <i class="fas fa-magic me-1"></i>Otomatik
                                </label>
                                
                                <input type="radio" class="btn-check" name="configMode" id="manualMode" value="manual">
                                <label class="btn btn-outline-secondary" for="manualMode">
                                    <i class="fas fa-cog me-1"></i>Manuel
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Configuration Progress -->
                <div class="configuration-progress mb-4" id="configurationProgress" style="display: none;">
                    <div class="card border-primary">
                        <div class="card-header bg-primary text-white">
                            <h6 class="mb-0">
                                <span class="loading-spinner me-2" id="configSpinner"></span>
                                <span id="configStatusText">Adres yapılandırması başlatılıyor...</span>
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="progress mb-3">
                                <div class="progress-bar progress-bar-striped progress-bar-animated" 
                                     id="configProgressBar" 
                                     role="progressbar" 
                                     style="width: 0%" 
                                     aria-valuenow="0" 
                                     aria-valuemin="0" 
                                     aria-valuemax="100">
                                </div>
                            </div>
                            <div class="row">
                                <div class="col-md-6">
                                    <small class="text-muted" id="configProgressDetails">Hazırlanıyor...</small>
                                </div>
                                <div class="col-md-6 text-end">
                                    <small class="text-muted">
                                        <span id="currentStepText">0</span> / <span id="totalStepsText">0</span> cihaz
                                    </small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Address Conflicts Warning -->
                <div class="address-conflicts mb-4" id="addressConflicts" style="display: none;">
                    <div class="alert alert-warning">
                        <h5><i class="fas fa-exclamation-triangle me-2"></i>Adres Çakışması Tespit Edildi</h5>
                        <p class="mb-3">Aşağıdaki adresler birden fazla cihaz tarafından kullanılıyor:</p>
                        <div id="conflictsList"></div>
                        <div class="mt-3">
                            <button class="btn btn-warning btn-sm me-2" onclick="addressConfiguration.resolveConflicts()">
                                <i class="fas fa-tools me-1"></i>Otomatik Çöz
                            </button>
                            <button class="btn btn-outline-warning btn-sm" onclick="addressConfiguration.showConflictDetails()">
                                <i class="fas fa-info-circle me-1"></i>Detaylar
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Available Addresses Info -->
                <div class="available-addresses mb-4" id="availableAddresses">
                    <div class="card">
                        <div class="card-header">
                            <h6 class="mb-0"><i class="fas fa-list-ol me-2"></i>Kullanılabilir Adresler</h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="address-info">
                                        <strong>Sonraki Kullanılabilir:</strong>
                                        <span class="badge bg-success ms-2" id="nextAvailableAddress">-</span>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="address-info">
                                        <strong>Toplam Kullanılabilir:</strong>
                                        <span class="badge bg-info ms-2" id="totalAvailableCount">-</span>
                                    </div>
                                </div>
                            </div>
                            <div class="mt-3">
                                <button class="btn btn-outline-info btn-sm" onclick="addressConfiguration.showAddressMap()">
                                    <i class="fas fa-map me-1"></i>Adres Haritası
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Device Configuration List -->
                <div class="device-configuration-list mb-4" id="deviceConfigurationList">
                    <h5><i class="fas fa-microchip me-2"></i>Cihaz Yapılandırması</h5>
                    <div id="devicesList">
                        <div class="text-center text-muted py-4">
                            <i class="fas fa-search fa-3x mb-3"></i>
                            <p>Cihazlar yükleniyor...</p>
                        </div>
                    </div>
                </div>

                <!-- Configuration Actions -->
                <div class="configuration-actions mb-4" id="configurationActions">
                    <div class="card">
                        <div class="card-body">
                            <div class="row align-items-center">
                                <div class="col-md-8">
                                    <h6 class="mb-1">Yapılandırma İşlemleri</h6>
                                    <small class="text-muted">Seçilen cihazlar için adres yapılandırmasını başlatın</small>
                                </div>
                                <div class="col-md-4 text-end">
                                    <button class="btn btn-primary me-2" id="startConfigBtn" onclick="addressConfiguration.startConfiguration()">
                                        <i class="fas fa-play me-1"></i>Yapılandırmayı Başlat
                                    </button>
                                    <button class="btn btn-outline-secondary" id="validateConfigBtn" onclick="addressConfiguration.validateConfiguration()">
                                        <i class="fas fa-check-circle me-1"></i>Doğrula
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Configuration Results -->
                <div class="configuration-results mt-4" id="configurationResults" style="display: none;">
                    <div class="card border-success">
                        <div class="card-header bg-success text-white">
                            <h6 class="mb-0"><i class="fas fa-check-circle me-2"></i>Yapılandırma Sonuçları</h6>
                        </div>
                        <div class="card-body">
                            <div id="resultsList"></div>
                            <div class="mt-3 text-center">
                                <div class="row">
                                    <div class="col-md-4">
                                        <div class="result-stat">
                                            <span class="stat-number text-success" id="successCount">0</span>
                                            <span class="stat-label">Başarılı</span>
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <div class="result-stat">
                                            <span class="stat-number text-danger" id="failedCount">0</span>
                                            <span class="stat-label">Başarısız</span>
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <div class="result-stat">
                                            <span class="stat-number text-info" id="verifiedCount">0</span>
                                            <span class="stat-label">Doğrulandı</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Manual Configuration Panel -->
                <div class="manual-configuration-panel mt-4" id="manualConfigPanel" style="display: none;">
                    <div class="card border-warning">
                        <div class="card-header bg-warning text-dark">
                            <h6 class="mb-0"><i class="fas fa-cog me-2"></i>Manuel Yapılandırma</h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label for="manualDeviceSelect" class="form-label">Cihaz Seçin:</label>
                                        <select class="form-select" id="manualDeviceSelect">
                                            <option value="">Cihaz seçin...</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label for="manualAddressInput" class="form-label">Yeni Adres (1-255):</label>
                                        <input type="number" class="form-control" id="manualAddressInput" 
                                               min="1" max="255" placeholder="Adres girin...">
                                    </div>
                                </div>
                            </div>
                            <div class="row">
                                <div class="col-md-12">
                                    <button class="btn btn-warning me-2" onclick="addressConfiguration.configureManualAddress()">
                                        <i class="fas fa-cog me-1"></i>Adresi Yapılandır
                                    </button>
                                    <button class="btn btn-outline-info me-2" onclick="addressConfiguration.verifyManualAddress()">
                                        <i class="fas fa-check me-1"></i>Adresi Doğrula
                                    </button>
                                    <button class="btn btn-outline-secondary" onclick="addressConfiguration.resetManualForm()">
                                        <i class="fas fa-undo me-1"></i>Sıfırla
                                    </button>
                                </div>
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
        // Configuration mode change
        document.querySelectorAll('input[name="configMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.configurationMode = e.target.value;
                this.updateConfigurationMode();
            });
        });

        // Real-time address validation for manual input
        const manualAddressInput = document.getElementById('manualAddressInput');
        if (manualAddressInput) {
            manualAddressInput.addEventListener('input', (e) => {
                this.validateManualAddressInput(e.target.value);
            });
        }
    }

    /**
     * Load detected devices from previous step
     */
    async loadDetectedDevices() {
        try {
            // Get devices from wizard session or previous step
            const devices = wizard?.wizardData?.detectedDevices || [];
            this.detectedDevices = devices;
            
            if (this.detectedDevices.length === 0) {
                // Try to get from API if not available in wizard data
                await this.fetchDetectedDevices();
            }
            
            // Find available addresses
            await this.findAvailableAddresses();
            
            // Check for address conflicts
            await this.checkAddressConflicts();
            
            // Render devices
            this.renderDevicesList();
            
            // Update UI
            this.updateAvailableAddressesInfo();
            
        } catch (error) {
            console.error('Error loading detected devices:', error);
            this.showError('Cihaz bilgileri yüklenemedi: ' + error.message);
        }
    }

    /**
     * Fetch detected devices from API
     */
    async fetchDetectedDevices() {
        try {
            const response = await fetch('/api/wizard/detect-new-cards');
            const result = await response.json();
            
            if (result.success) {
                this.detectedDevices = result.new_devices || [];
            } else {
                throw new Error(result.error || 'Failed to fetch detected devices');
            }
        } catch (error) {
            console.error('Error fetching detected devices:', error);
            throw error;
        }
    }

    /**
     * Find available addresses
     */
    async findAvailableAddresses() {
        try {
            const response = await fetch('/api/wizard/find-next-address');
            const result = await response.json();
            
            if (result.success) {
                this.availableAddresses = result.available_addresses || [];
            } else {
                throw new Error(result.error || 'Failed to find available addresses');
            }
        } catch (error) {
            console.error('Error finding available addresses:', error);
            // Generate fallback addresses
            this.generateFallbackAddresses();
        }
    }

    /**
     * Generate fallback addresses if API fails
     */
    generateFallbackAddresses() {
        this.availableAddresses = [];
        const usedAddresses = this.detectedDevices.map(device => device.address);
        
        for (let addr = 1; addr <= 255; addr++) {
            if (!usedAddresses.includes(addr)) {
                this.availableAddresses.push(addr);
            }
        }
    }

    /**
     * Check for address conflicts
     */
    async checkAddressConflicts() {
        try {
            const response = await fetch('/api/wizard/detect-conflicts');
            const result = await response.json();
            
            if (result.success) {
                this.addressConflicts = result.conflicts || [];
                
                if (this.addressConflicts.length > 0) {
                    this.showAddressConflicts();
                }
            }
        } catch (error) {
            console.error('Error checking address conflicts:', error);
        }
    }

    /**
     * Update configuration mode UI
     */
    updateConfigurationMode() {
        const manualPanel = document.getElementById('manualConfigPanel');
        const autoActions = document.getElementById('configurationActions');
        
        if (this.configurationMode === 'manual') {
            manualPanel.style.display = 'block';
            autoActions.style.display = 'none';
            this.populateManualDeviceSelect();
        } else {
            manualPanel.style.display = 'none';
            autoActions.style.display = 'block';
        }
    }

    /**
     * Populate manual device select dropdown
     */
    populateManualDeviceSelect() {
        const select = document.getElementById('manualDeviceSelect');
        if (!select) return;
        
        let html = '<option value="">Cihaz seçin...</option>';
        
        this.detectedDevices.forEach((device, index) => {
            const deviceType = device.type || {};
            html += `
                <option value="${index}">
                    Adres ${device.address} - ${deviceType.model || 'Bilinmeyen Model'}
                </option>
            `;
        });
        
        select.innerHTML = html;
    }

    /**
     * Render devices list
     */
    renderDevicesList() {
        const container = document.getElementById('devicesList');
        if (!container) return;
        
        if (this.detectedDevices.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-exclamation-triangle fa-3x mb-3 text-warning"></i>
                    <h5>Yapılandırılacak Cihaz Bulunamadı</h5>
                    <p>Önce cihaz tespiti adımını tamamlayın.</p>
                </div>
            `;
            return;
        }

        let html = '';
        this.detectedDevices.forEach((device, index) => {
            html += this.renderDeviceConfigCard(device, index);
        });

        container.innerHTML = html;
    }

    /**
     * Render a single device configuration card
     */
    renderDeviceConfigCard(device, index) {
        const deviceType = device.type || {};
        const capabilities = device.capabilities || {};
        const configResult = this.configurationResults.find(r => r.deviceIndex === index);
        const hasConflict = this.addressConflicts.some(conflict => 
            conflict.devices.some(d => d.address === device.address)
        );
        
        return `
            <div class="device-config-card mb-3" data-device-index="${index}">
                <div class="card ${hasConflict ? 'border-warning' : 'border-light'}">
                    <div class="card-header ${hasConflict ? 'bg-warning' : 'bg-light'}">
                        <div class="row align-items-center">
                            <div class="col-md-6">
                                <h6 class="mb-0">
                                    <i class="fas fa-microchip text-primary me-2"></i>
                                    ${deviceType.model || 'Bilinmeyen Model'}
                                </h6>
                            </div>
                            <div class="col-md-6 text-end">
                                <div class="device-config-status">
                                    ${this.renderConfigurationStatus(configResult, hasConflict)}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <div class="current-config">
                                    <h6 class="text-muted">Mevcut Yapılandırma</h6>
                                    <div class="config-item mb-2">
                                        <strong>Mevcut Adres:</strong>
                                        <span class="badge ${hasConflict ? 'bg-warning' : 'bg-secondary'} ms-2">
                                            ${device.address}
                                        </span>
                                        ${hasConflict ? '<i class="fas fa-exclamation-triangle text-warning ms-1" title="Adres çakışması"></i>' : ''}
                                    </div>
                                    <div class="config-item mb-2">
                                        <strong>Kanallar:</strong>
                                        <span class="text-info">${capabilities.maxRelays || 'Bilinmiyor'}</span>
                                    </div>
                                    <div class="config-item mb-2">
                                        <strong>Durum:</strong>
                                        <span class="badge ${this.getDeviceStatusBadgeClass(device.status)}">
                                            ${this.getDeviceStatusText(device.status)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="new-config">
                                    <h6 class="text-muted">Yeni Yapılandırma</h6>
                                    <div class="config-item mb-2">
                                        <strong>Yeni Adres:</strong>
                                        <span class="badge bg-success ms-2" id="newAddress_${index}">
                                            ${configResult?.newAddress || this.getNextAvailableAddress()}
                                        </span>
                                    </div>
                                    <div class="config-item mb-2">
                                        <strong>Yapılandırma:</strong>
                                        <span class="text-muted" id="configMethod_${index}">
                                            ${this.configurationMode === 'automatic' ? 'Otomatik' : 'Manuel'}
                                        </span>
                                    </div>
                                    <div class="config-item mb-2">
                                        <strong>Doğrulama:</strong>
                                        <span class="badge bg-secondary" id="verification_${index}">Bekliyor</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        ${configResult ? this.renderConfigurationResult(configResult) : ''}
                        
                        <div class="device-actions mt-3">
                            <button class="btn btn-outline-primary btn-sm me-2" 
                                    onclick="addressConfiguration.configureDevice(${index})"
                                    ${this.isConfiguring ? 'disabled' : ''}>
                                <i class="fas fa-cog me-1"></i>Yapılandır
                            </button>
                            <button class="btn btn-outline-info btn-sm me-2" 
                                    onclick="addressConfiguration.verifyDevice(${index})"
                                    ${!configResult?.success ? 'disabled' : ''}>
                                <i class="fas fa-check-circle me-1"></i>Doğrula
                            </button>
                            <button class="btn btn-outline-secondary btn-sm" 
                                    onclick="addressConfiguration.resetDevice(${index})">
                                <i class="fas fa-undo me-1"></i>Sıfırla
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render configuration status badge
     */
    renderConfigurationStatus(configResult, hasConflict) {
        if (hasConflict) {
            return '<span class="badge bg-warning">Çakışma</span>';
        }
        
        if (!configResult) {
            return '<span class="badge bg-secondary">Bekliyor</span>';
        }
        
        if (configResult.success && configResult.verified) {
            return '<span class="badge bg-success">Tamamlandı</span>';
        } else if (configResult.success) {
            return '<span class="badge bg-info">Yapılandırıldı</span>';
        } else {
            return '<span class="badge bg-danger">Başarısız</span>';
        }
    }

    /**
     * Render configuration result details
     */
    renderConfigurationResult(result) {
        if (!result) return '';
        
        return `
            <div class="configuration-result mt-3 p-3 ${result.success ? 'bg-light-success' : 'bg-light-danger'} rounded">
                <div class="row">
                    <div class="col-md-8">
                        <small class="text-muted">
                            <strong>Sonuç:</strong> ${result.success ? 'Başarılı' : 'Başarısız'}
                            ${result.verified ? ' (Doğrulandı)' : ''}
                        </small>
                        ${result.error ? `<br><small class="text-danger">${result.error}</small>` : ''}
                    </div>
                    <div class="col-md-4 text-end">
                        <small class="text-muted">
                            ${result.duration ? `${result.duration}ms` : ''}
                        </small>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Start automatic configuration process
     */
    async startConfiguration() {
        if (this.isConfiguring) return;
        
        this.isConfiguring = true;
        this.configurationResults = [];
        
        try {
            // Show progress
            this.showConfigurationProgress(true);
            
            // Initialize progress
            this.configurationProgress.totalSteps = this.detectedDevices.length;
            this.configurationProgress.currentStep = 0;
            this.configurationProgress.status = 'running';
            
            this.updateProgressDisplay();
            
            // Configure each device
            for (let i = 0; i < this.detectedDevices.length; i++) {
                const device = this.detectedDevices[i];
                this.configurationProgress.currentStep = i + 1;
                this.configurationProgress.currentDevice = device;
                
                this.updateProgressDisplay(`Cihaz ${device.address} yapılandırılıyor...`);
                
                try {
                    const result = await this.configureDeviceAddress(device, i);
                    this.configurationResults.push(result);
                    
                    // Update device card
                    this.updateDeviceCard(i, result);
                    
                } catch (error) {
                    console.error(`Error configuring device ${device.address}:`, error);
                    this.configurationResults.push({
                        deviceIndex: i,
                        success: false,
                        error: error.message,
                        verified: false
                    });
                }
                
                // Small delay between devices
                await this.delay(500);
            }
            
            // Complete configuration
            this.configurationProgress.status = 'completed';
            this.updateProgressDisplay('Yapılandırma tamamlandı');
            
            // Show results
            setTimeout(() => {
                this.showConfigurationProgress(false);
                this.showConfigurationResults();
            }, 1000);
            
        } catch (error) {
            console.error('Configuration process failed:', error);
            this.showError('Yapılandırma işlemi başarısız: ' + error.message);
        } finally {
            this.isConfiguring = false;
        }
    }

    /**
     * Configure address for a single device
     */
    async configureDeviceAddress(device, deviceIndex) {
        const startTime = Date.now();
        
        try {
            // Get next available address
            const newAddress = this.getNextAvailableAddress();
            
            if (!newAddress) {
                throw new Error('Kullanılabilir adres bulunamadı');
            }
            
            // Configure using broadcast command
            const response = await fetch('/api/hardware-config/set-slave-address', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    currentAddress: device.address,
                    newAddress: newAddress,
                    useBroadcast: true
                })
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Address configuration failed');
            }
            
            // Verify the configuration
            const verified = await this.verifyAddressConfiguration(newAddress);
            
            // Mark address as used
            this.markAddressAsUsed(newAddress);
            
            return {
                deviceIndex: deviceIndex,
                oldAddress: device.address,
                newAddress: newAddress,
                success: true,
                verified: verified,
                duration: Date.now() - startTime
            };
            
        } catch (error) {
            return {
                deviceIndex: deviceIndex,
                oldAddress: device.address,
                newAddress: null,
                success: false,
                verified: false,
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }

    /**
     * Verify address configuration
     */
    async verifyAddressConfiguration(address) {
        try {
            const response = await fetch('/api/hardware-config/read-slave-address', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    address: address
                })
            });
            
            const result = await response.json();
            return result.success && result.address === address;
            
        } catch (error) {
            console.error('Address verification failed:', error);
            return false;
        }
    }

    /**
     * Configure device manually
     */
    async configureManualAddress() {
        const deviceSelect = document.getElementById('manualDeviceSelect');
        const addressInput = document.getElementById('manualAddressInput');
        
        const deviceIndex = parseInt(deviceSelect.value);
        const newAddress = parseInt(addressInput.value);
        
        if (isNaN(deviceIndex) || isNaN(newAddress)) {
            this.showError('Lütfen geçerli bir cihaz ve adres seçin');
            return;
        }
        
        if (newAddress < 1 || newAddress > 255) {
            this.showError('Adres 1-255 arasında olmalıdır');
            return;
        }
        
        if (this.isAddressInUse(newAddress)) {
            this.showError('Bu adres zaten kullanımda');
            return;
        }
        
        const device = this.detectedDevices[deviceIndex];
        if (!device) {
            this.showError('Cihaz bulunamadı');
            return;
        }
        
        try {
            const result = await this.configureDeviceAddress(device, deviceIndex);
            
            if (result.success) {
                this.showSuccess(`Cihaz ${device.address} başarıyla ${newAddress} adresine yapılandırıldı`);
                this.updateDeviceCard(deviceIndex, result);
                this.resetManualForm();
            } else {
                this.showError('Manuel yapılandırma başarısız: ' + result.error);
            }
            
        } catch (error) {
            console.error('Manual configuration error:', error);
            this.showError('Manuel yapılandırma hatası: ' + error.message);
        }
    }

    /**
     * Validate configuration
     */
    async validateConfiguration() {
        try {
            const response = await fetch('/api/hardware-config/validate-setup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    devices: this.detectedDevices,
                    results: this.configurationResults
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showSuccess('Yapılandırma doğrulaması başarılı');
                
                // Update verification status for all devices
                this.configurationResults.forEach((configResult, index) => {
                    if (configResult.success) {
                        configResult.verified = true;
                        this.updateDeviceCard(index, configResult);
                    }
                });
                
                // Notify parent component
                this.onStateChange(this.configurationResults, true);
                
            } else {
                this.showError('Yapılandırma doğrulaması başarısız: ' + result.error);
            }
            
        } catch (error) {
            console.error('Validation error:', error);
            this.showError('Doğrulama hatası: ' + error.message);
        }
    }

    /**
     * Resolve address conflicts automatically
     */
    async resolveConflicts() {
        if (this.addressConflicts.length === 0) return;
        
        try {
            const response = await fetch('/api/hardware-config/resolve-conflicts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    conflicts: this.addressConflicts
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showSuccess('Adres çakışmaları çözüldü');
                this.addressConflicts = [];
                this.hideAddressConflicts();
                
                // Reload devices and addresses
                await this.loadDetectedDevices();
                
            } else {
                this.showError('Çakışma çözümü başarısız: ' + result.error);
            }
            
        } catch (error) {
            console.error('Conflict resolution error:', error);
            this.showError('Çakışma çözümü hatası: ' + error.message);
        }
    }

    /**
     * Show/hide configuration progress
     */
    showConfigurationProgress(show) {
        const section = document.getElementById('configurationProgress');
        const spinner = document.getElementById('configSpinner');
        const startBtn = document.getElementById('startConfigBtn');
        
        if (section) {
            section.style.display = show ? 'block' : 'none';
        }
        
        if (spinner) {
            spinner.style.display = show ? 'inline-block' : 'none';
        }
        
        if (startBtn) {
            startBtn.disabled = show;
        }
    }

    /**
     * Update progress display
     */
    updateProgressDisplay(statusText = null) {
        const progressBar = document.getElementById('configProgressBar');
        const statusElement = document.getElementById('configStatusText');
        const detailsElement = document.getElementById('configProgressDetails');
        const currentStepElement = document.getElementById('currentStepText');
        const totalStepsElement = document.getElementById('totalStepsText');
        
        const percentage = this.configurationProgress.totalSteps > 0 
            ? (this.configurationProgress.currentStep / this.configurationProgress.totalSteps) * 100 
            : 0;
        
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
            progressBar.setAttribute('aria-valuenow', percentage.toString());
        }
        
        if (statusElement && statusText) {
            statusElement.textContent = statusText;
        }
        
        if (detailsElement) {
            const device = this.configurationProgress.currentDevice;
            if (device) {
                detailsElement.textContent = `Cihaz: ${device.type?.model || 'Bilinmeyen'} (Adres: ${device.address})`;
            }
        }
        
        if (currentStepElement) {
            currentStepElement.textContent = this.configurationProgress.currentStep.toString();
        }
        
        if (totalStepsElement) {
            totalStepsElement.textContent = this.configurationProgress.totalSteps.toString();
        }
    }

    /**
     * Show configuration results
     */
    showConfigurationResults() {
        const section = document.getElementById('configurationResults');
        const resultsList = document.getElementById('resultsList');
        
        if (!section || !resultsList) return;
        
        section.style.display = 'block';
        
        // Update statistics
        const successCount = this.configurationResults.filter(r => r.success).length;
        const failedCount = this.configurationResults.filter(r => !r.success).length;
        const verifiedCount = this.configurationResults.filter(r => r.verified).length;
        
        document.getElementById('successCount').textContent = successCount;
        document.getElementById('failedCount').textContent = failedCount;
        document.getElementById('verifiedCount').textContent = verifiedCount;
        
        // Render results list
        let html = '';
        this.configurationResults.forEach((result, index) => {
            const device = this.detectedDevices[result.deviceIndex];
            html += `
                <div class="result-item mb-2">
                    <div class="card ${result.success ? 'border-success' : 'border-danger'}">
                        <div class="card-body py-2">
                            <div class="row align-items-center">
                                <div class="col-md-6">
                                    <strong>${device?.type?.model || 'Bilinmeyen Cihaz'}</strong>
                                    <small class="text-muted d-block">
                                        ${result.oldAddress} → ${result.newAddress || 'Başarısız'}
                                    </small>
                                </div>
                                <div class="col-md-3">
                                    <span class="badge ${result.success ? 'bg-success' : 'bg-danger'}">
                                        ${result.success ? 'Başarılı' : 'Başarısız'}
                                    </span>
                                    ${result.verified ? '<span class="badge bg-info ms-1">Doğrulandı</span>' : ''}
                                </div>
                                <div class="col-md-3 text-end">
                                    <small class="text-muted">${result.duration}ms</small>
                                </div>
                            </div>
                            ${result.error ? `
                                <div class="row mt-2">
                                    <div class="col-12">
                                        <small class="text-danger">${result.error}</small>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        
        resultsList.innerHTML = html;
        
        // Notify parent component if all successful
        const allSuccessful = this.configurationResults.every(r => r.success);
        this.onStateChange(this.configurationResults, allSuccessful);
    }

    /**
     * Show address conflicts
     */
    showAddressConflicts() {
        const section = document.getElementById('addressConflicts');
        const conflictsList = document.getElementById('conflictsList');
        
        if (!section || !conflictsList) return;
        
        section.style.display = 'block';
        
        let html = '';
        this.addressConflicts.forEach(conflict => {
            html += `
                <div class="conflict-item mb-2">
                    <div class="alert alert-warning mb-2">
                        <strong>Adres ${conflict.address}:</strong>
                        ${conflict.devices.length} cihaz tarafından kullanılıyor
                        <div class="mt-1">
                            ${conflict.devices.map(device => 
                                `<span class="badge bg-warning text-dark me-1">${device.type?.model || 'Bilinmeyen'}</span>`
                            ).join('')}
                        </div>
                    </div>
                </div>
            `;
        });
        
        conflictsList.innerHTML = html;
    }

    /**
     * Hide address conflicts
     */
    hideAddressConflicts() {
        const section = document.getElementById('addressConflicts');
        if (section) {
            section.style.display = 'none';
        }
    }

    /**
     * Update available addresses info
     */
    updateAvailableAddressesInfo() {
        const nextAddress = this.getNextAvailableAddress();
        const totalAvailable = this.availableAddresses.length;
        
        document.getElementById('nextAvailableAddress').textContent = nextAddress || 'Yok';
        document.getElementById('totalAvailableCount').textContent = totalAvailable;
    }

    /**
     * Update device card with configuration result
     */
    updateDeviceCard(deviceIndex, result) {
        const card = document.querySelector(`[data-device-index="${deviceIndex}"]`);
        if (!card) return;
        
        // Update new address
        const newAddressElement = card.querySelector(`#newAddress_${deviceIndex}`);
        if (newAddressElement && result.newAddress) {
            newAddressElement.textContent = result.newAddress;
            newAddressElement.className = result.success ? 'badge bg-success ms-2' : 'badge bg-danger ms-2';
        }
        
        // Update verification status
        const verificationElement = card.querySelector(`#verification_${deviceIndex}`);
        if (verificationElement) {
            if (result.verified) {
                verificationElement.textContent = 'Doğrulandı';
                verificationElement.className = 'badge bg-success';
            } else if (result.success) {
                verificationElement.textContent = 'Bekliyor';
                verificationElement.className = 'badge bg-warning';
            } else {
                verificationElement.textContent = 'Başarısız';
                verificationElement.className = 'badge bg-danger';
            }
        }
        
        // Update card border
        const cardElement = card.querySelector('.card');
        if (cardElement) {
            cardElement.className = result.success ? 'card border-success' : 'card border-danger';
        }
    }

    /**
     * Get next available address
     */
    getNextAvailableAddress() {
        return this.availableAddresses.find(addr => !this.isAddressInUse(addr)) || null;
    }

    /**
     * Check if address is in use
     */
    isAddressInUse(address) {
        // Check in detected devices
        if (this.detectedDevices.some(device => device.address === address)) {
            return true;
        }
        
        // Check in configuration results
        if (this.configurationResults.some(result => result.newAddress === address)) {
            return true;
        }
        
        return false;
    }

    /**
     * Mark address as used
     */
    markAddressAsUsed(address) {
        const index = this.availableAddresses.indexOf(address);
        if (index > -1) {
            this.availableAddresses.splice(index, 1);
        }
        this.updateAvailableAddressesInfo();
    }

    /**
     * Utility functions
     */
    getDeviceStatusBadgeClass(status) {
        switch (status) {
            case 'responding': return 'bg-success';
            case 'timeout': return 'bg-warning';
            case 'error': return 'bg-danger';
            default: return 'bg-secondary';
        }
    }

    getDeviceStatusText(status) {
        switch (status) {
            case 'responding': return 'Yanıt Veriyor';
            case 'timeout': return 'Zaman Aşımı';
            case 'error': return 'Hata';
            default: return 'Bilinmiyor';
        }
    }

    validateManualAddressInput(value) {
        const input = document.getElementById('manualAddressInput');
        const address = parseInt(value);
        
        if (isNaN(address) || address < 1 || address > 255) {
            input.classList.add('is-invalid');
            return false;
        }
        
        if (this.isAddressInUse(address)) {
            input.classList.add('is-invalid');
            return false;
        }
        
        input.classList.remove('is-invalid');
        input.classList.add('is-valid');
        return true;
    }

    resetManualForm() {
        document.getElementById('manualDeviceSelect').value = '';
        document.getElementById('manualAddressInput').value = '';
        document.getElementById('manualAddressInput').classList.remove('is-valid', 'is-invalid');
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    showError(message) {
        console.error(message);
        // Implementation depends on your notification system
        alert('Hata: ' + message);
    }

    showSuccess(message) {
        console.log(message);
        // Implementation depends on your notification system
        alert('Başarılı: ' + message);
    }

    // Additional methods for UI interactions
    configureDevice(deviceIndex) {
        const device = this.detectedDevices[deviceIndex];
        if (!device) return;
        
        this.configureDeviceAddress(device, deviceIndex)
            .then(result => {
                this.configurationResults[deviceIndex] = result;
                this.updateDeviceCard(deviceIndex, result);
                
                if (result.success) {
                    this.showSuccess(`Cihaz ${device.address} başarıyla yapılandırıldı`);
                } else {
                    this.showError(`Cihaz ${device.address} yapılandırması başarısız: ${result.error}`);
                }
            })
            .catch(error => {
                console.error('Device configuration error:', error);
                this.showError('Cihaz yapılandırma hatası: ' + error.message);
            });
    }

    verifyDevice(deviceIndex) {
        const result = this.configurationResults[deviceIndex];
        if (!result || !result.success) return;
        
        this.verifyAddressConfiguration(result.newAddress)
            .then(verified => {
                result.verified = verified;
                this.updateDeviceCard(deviceIndex, result);
                
                if (verified) {
                    this.showSuccess(`Cihaz ${result.newAddress} doğrulaması başarılı`);
                } else {
                    this.showError(`Cihaz ${result.newAddress} doğrulaması başarısız`);
                }
            })
            .catch(error => {
                console.error('Device verification error:', error);
                this.showError('Cihaz doğrulama hatası: ' + error.message);
            });
    }

    resetDevice(deviceIndex) {
        // Remove configuration result
        this.configurationResults = this.configurationResults.filter(r => r.deviceIndex !== deviceIndex);
        
        // Re-render device card
        const device = this.detectedDevices[deviceIndex];
        const container = document.querySelector(`[data-device-index="${deviceIndex}"]`);
        if (container && device) {
            container.outerHTML = this.renderDeviceConfigCard(device, deviceIndex);
        }
    }

    verifyManualAddress() {
        const deviceSelect = document.getElementById('manualDeviceSelect');
        const addressInput = document.getElementById('manualAddressInput');
        
        const deviceIndex = parseInt(deviceSelect.value);
        const address = parseInt(addressInput.value);
        
        if (isNaN(deviceIndex) || isNaN(address)) {
            this.showError('Lütfen geçerli bir cihaz ve adres seçin');
            return;
        }
        
        this.verifyAddressConfiguration(address)
            .then(verified => {
                if (verified) {
                    this.showSuccess(`Adres ${address} doğrulaması başarılı`);
                } else {
                    this.showError(`Adres ${address} doğrulaması başarısız`);
                }
            })
            .catch(error => {
                console.error('Manual verification error:', error);
                this.showError('Manuel doğrulama hatası: ' + error.message);
            });
    }

    showConflictDetails() {
        const modal = this.createModal(
            'Adres Çakışması Detayları',
            this.renderConflictDetailsContent(),
            'warning'
        );
        
        modal.show();
    }

    showAddressMap() {
        const modal = this.createModal(
            'Adres Haritası',
            this.renderAddressMapContent(),
            'info'
        );
        
        modal.show();
    }

    renderConflictDetailsContent() {
        let html = '<div class="conflict-details">';
        
        this.addressConflicts.forEach(conflict => {
            html += `
                <div class="conflict-detail mb-3">
                    <h6>Adres ${conflict.address}</h6>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Cihaz</th>
                                    <th>Model</th>
                                    <th>Durum</th>
                                    <th>Yanıt Süresi</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${conflict.devices.map(device => `
                                    <tr>
                                        <td>Adres ${device.address}</td>
                                        <td>${device.type?.model || 'Bilinmeyen'}</td>
                                        <td><span class="badge ${this.getDeviceStatusBadgeClass(device.status)}">${this.getDeviceStatusText(device.status)}</span></td>
                                        <td>${device.responseTime || 0}ms</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }

    renderAddressMapContent() {
        let html = '<div class="address-map">';
        html += '<div class="row">';
        
        for (let addr = 1; addr <= 255; addr++) {
            const isUsed = this.isAddressInUse(addr);
            const hasConflict = this.addressConflicts.some(c => c.address === addr);
            
            let badgeClass = 'bg-success';
            let title = 'Kullanılabilir';
            
            if (hasConflict) {
                badgeClass = 'bg-warning';
                title = 'Çakışma';
            } else if (isUsed) {
                badgeClass = 'bg-secondary';
                title = 'Kullanımda';
            }
            
            html += `
                <div class="col-1 mb-1">
                    <span class="badge ${badgeClass}" title="${title}" style="font-size: 0.7em;">
                        ${addr}
                    </span>
                </div>
            `;
            
            if (addr % 20 === 0) {
                html += '</div><div class="row">';
            }
        }
        
        html += '</div>';
        html += `
            <div class="mt-3">
                <div class="row">
                    <div class="col-md-4">
                        <span class="badge bg-success me-1"></span>
                        <small>Kullanılabilir (${this.availableAddresses.length})</small>
                    </div>
                    <div class="col-md-4">
                        <span class="badge bg-secondary me-1"></span>
                        <small>Kullanımda</small>
                    </div>
                    <div class="col-md-4">
                        <span class="badge bg-warning me-1"></span>
                        <small>Çakışma (${this.addressConflicts.length})</small>
                    </div>
                </div>
            </div>
        `;
        html += '</div>';
        
        return html;
    }

    createModal(title, content, type = 'info') {
        // Simple modal implementation - you might want to use Bootstrap modal
        const modalId = 'addressConfigModal_' + Date.now();
        
        const modalHtml = `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
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
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalElement = document.getElementById(modalId);
        
        return {
            show: () => {
                const modal = new bootstrap.Modal(modalElement);
                modal.show();
                
                // Clean up when modal is hidden
                modalElement.addEventListener('hidden.bs.modal', () => {
                    modalElement.remove();
                });
            }
        };
    }
}
   