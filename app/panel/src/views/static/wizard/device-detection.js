/**
 * Device Detection Component
 * Real-time scanning progress with visual representation of detected devices
 * Includes automatic refresh and troubleshooting guidance
 */

class DeviceDetection {
    constructor(containerId, onStateChange) {
        this.containerId = containerId;
        this.onStateChange = onStateChange || (() => {});
        this.isScanning = false;
        this.scanResults = {
            serialPorts: [],
            detectedDevices: [],
            newDevices: [],
            scanProgress: 0,
            lastScanTime: null,
            errors: []
        };
        
        this.init();
    }

    /**
     * Initialize the device detection component
     */
    init() {
        this.render();
        this.setupEventListeners();
        // Start automatic scan when component is initialized
        setTimeout(() => this.startDeviceScan(), 1000);
    }

    /**
     * Render the device detection interface
     */
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('Device detection container not found:', this.containerId);
            return;
        }

        container.innerHTML = `
            <div class="device-detection-container">
                <!-- Header -->
                <div class="detection-header mb-4">
                    <div class="row">
                        <div class="col-md-8">
                            <h4><i class="fas fa-search me-2"></i>Cihaz Tespiti</h4>
                            <p class="text-muted">Sistem otomatik olarak yeni Modbus cihazlarını tespit ediyor...</p>
                        </div>
                        <div class="col-md-4 text-end">
                            <button class="btn btn-outline-primary" id="refreshScanBtn" onclick="deviceDetection.startDeviceScan()">
                                <i class="fas fa-sync-alt me-1"></i>Yeniden Tara
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Scan Progress -->
                <div class="scan-progress mb-4" id="scanProgressSection">
                    <div class="card">
                        <div class="card-body">
                            <div class="row align-items-center">
                                <div class="col-md-8">
                                    <h6 class="card-title mb-2">
                                        <span class="loading-spinner me-2" id="scanSpinner" style="display: none;"></span>
                                        <span id="scanStatusText">Tarama başlatılıyor...</span>
                                    </h6>
                                    <div class="progress mb-2">
                                        <div class="progress-bar progress-bar-striped progress-bar-animated" 
                                             id="scanProgressBar" 
                                             role="progressbar" 
                                             style="width: 0%" 
                                             aria-valuenow="0" 
                                             aria-valuemin="0" 
                                             aria-valuemax="100">
                                        </div>
                                    </div>
                                    <small class="text-muted" id="scanProgressDetails">Hazırlanıyor...</small>
                                </div>
                                <div class="col-md-4 text-end">
                                    <div class="scan-stats">
                                        <div class="stat-item">
                                            <span class="stat-number text-primary" id="portsFoundCount">0</span>
                                            <span class="stat-label">Port</span>
                                        </div>
                                        <div class="stat-item">
                                            <span class="stat-number text-success" id="devicesFoundCount">0</span>
                                            <span class="stat-label">Cihaz</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Serial Ports Section -->
                <div class="serial-ports-section mb-4" id="serialPortsSection" style="display: none;">
                    <h5><i class="fas fa-usb me-2"></i>Tespit Edilen Seri Portlar</h5>
                    <div id="serialPortsList" class="ports-list">
                        <!-- Serial ports will be populated here -->
                    </div>
                </div>

                <!-- Detected Devices Section -->
                <div class="detected-devices-section mb-4" id="detectedDevicesSection">
                    <h5><i class="fas fa-microchip me-2"></i>Tespit Edilen Cihazlar</h5>
                    <div id="detectedDevicesList" class="devices-list">
                        <div class="text-center text-muted py-4">
                            <i class="fas fa-search fa-3x mb-3"></i>
                            <p>Cihaz taraması devam ediyor...</p>
                        </div>
                    </div>
                </div>

                <!-- Troubleshooting Guide -->
                <div class="troubleshooting-section" id="troubleshootingSection" style="display: none;">
                    <div class="alert alert-warning">
                        <h5><i class="fas fa-exclamation-triangle me-2"></i>Cihaz Bulunamadı?</h5>
                        <div class="troubleshooting-content">
                            <p class="mb-3">Aşağıdaki adımları kontrol edin:</p>
                            <div class="row">
                                <div class="col-md-6">
                                    <ul class="list-unstyled">
                                        <li><i class="fas fa-check-circle text-success me-2"></i>USB-RS485 adaptörünün doğru bağlandığından emin olun</li>
                                        <li><i class="fas fa-check-circle text-success me-2"></i>Röle kartının güç kaynağının bağlı olduğunu kontrol edin</li>
                                        <li><i class="fas fa-check-circle text-success me-2"></i>Modbus kablolarının doğru bağlandığından emin olun</li>
                                    </ul>
                                </div>
                                <div class="col-md-6">
                                    <ul class="list-unstyled">
                                        <li><i class="fas fa-check-circle text-success me-2"></i>Cihazın varsayılan adres ayarlarını kontrol edin</li>
                                        <li><i class="fas fa-check-circle text-success me-2"></i>Kablo uzunluğunun 1200m'den az olduğunu kontrol edin</li>
                                        <li><i class="fas fa-check-circle text-success me-2"></i>Baud rate ayarlarının uyumlu olduğunu kontrol edin</li>
                                    </ul>
                                </div>
                            </div>
                            <div class="mt-3">
                                <button class="btn btn-warning btn-sm me-2" onclick="deviceDetection.showDetailedTroubleshooting()">
                                    <i class="fas fa-tools me-1"></i>Detaylı Sorun Giderme
                                </button>
                                <button class="btn btn-info btn-sm" onclick="deviceDetection.testSerialPorts()">
                                    <i class="fas fa-stethoscope me-1"></i>Port Testi
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Scan Results Summary -->
                <div class="scan-summary mt-4" id="scanSummary" style="display: none;">
                    <div class="card border-success">
                        <div class="card-header bg-success text-white">
                            <h6 class="mb-0"><i class="fas fa-check-circle me-2"></i>Tarama Tamamlandı</h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-4 text-center">
                                    <div class="summary-stat">
                                        <span class="stat-number text-primary" id="summaryPortsCount">0</span>
                                        <span class="stat-label">Seri Port</span>
                                    </div>
                                </div>
                                <div class="col-md-4 text-center">
                                    <div class="summary-stat">
                                        <span class="stat-number text-success" id="summaryDevicesCount">0</span>
                                        <span class="stat-label">Toplam Cihaz</span>
                                    </div>
                                </div>
                                <div class="col-md-4 text-center">
                                    <div class="summary-stat">
                                        <span class="stat-number text-warning" id="summaryNewDevicesCount">0</span>
                                        <span class="stat-label">Yeni Cihaz</span>
                                    </div>
                                </div>
                            </div>
                            <div class="mt-3 text-center">
                                <small class="text-muted">
                                    Son tarama: <span id="lastScanTime">-</span>
                                </small>
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
        // Auto-refresh every 30 seconds if no devices found
        this.autoRefreshInterval = setInterval(() => {
            if (!this.isScanning && this.scanResults.newDevices.length === 0) {
                console.log('Auto-refreshing device scan...');
                this.startDeviceScan();
            }
        }, 30000);
    }

    /**
     * Start device scanning process
     */
    async startDeviceScan() {
        if (this.isScanning) {
            console.log('Scan already in progress');
            return;
        }

        this.isScanning = true;
        this.scanResults.errors = [];
        
        try {
            // Reset UI
            this.updateScanProgress(0, 'Tarama başlatılıyor...');
            this.showScanProgress(true);
            this.hideTroubleshooting();
            this.hideScanSummary();
            
            // Step 1: Scan serial ports (25%)
            await this.scanSerialPorts();
            this.updateScanProgress(25, 'Seri portlar tarandı, Modbus cihazları aranıyor...');
            
            // Step 2: Scan for Modbus devices (50%)
            await this.scanModbusDevices();
            this.updateScanProgress(50, 'Modbus cihazları tarandı, yeni cihazlar tespit ediliyor...');
            
            // Step 3: Detect new devices (75%)
            await this.detectNewDevices();
            this.updateScanProgress(75, 'Yeni cihazlar tespit edildi, sonuçlar hazırlanıyor...');
            
            // Step 4: Process results (100%)
            this.processResults();
            this.updateScanProgress(100, 'Tarama tamamlandı');
            
            // Show results
            setTimeout(() => {
                this.showScanProgress(false);
                this.showResults();
            }, 1000);
            
        } catch (error) {
            console.error('Device scan failed:', error);
            this.scanResults.errors.push(error.message);
            this.updateScanProgress(0, 'Tarama başarısız oldu');
            this.showScanProgress(false);
            this.showTroubleshooting();
        } finally {
            this.isScanning = false;
        }
    }

    /**
     * Scan for serial ports
     */
    async scanSerialPorts() {
        try {
            const response = await fetch('/api/hardware-config/scan-ports');
            const result = await response.json();
            
            if (result.success) {
                this.scanResults.serialPorts = result.ports || [];
                this.updatePortsCount(this.scanResults.serialPorts.length);
                console.log('Serial ports found:', this.scanResults.serialPorts.length);
            } else {
                throw new Error(result.error || 'Serial port scan failed');
            }
        } catch (error) {
            console.error('Serial port scan error:', error);
            this.scanResults.errors.push('Seri port taraması başarısız: ' + error.message);
            this.scanResults.serialPorts = [];
        }
    }

    /**
     * Scan for Modbus devices
     */
    async scanModbusDevices() {
        try {
            const response = await fetch('/api/hardware-config/scan-devices');
            const result = await response.json();
            
            if (result.success) {
                this.scanResults.detectedDevices = result.devices || [];
                console.log('Modbus devices found:', this.scanResults.detectedDevices.length);
            } else {
                throw new Error(result.error || 'Modbus device scan failed');
            }
        } catch (error) {
            console.error('Modbus device scan error:', error);
            this.scanResults.errors.push('Modbus cihaz taraması başarısız: ' + error.message);
            this.scanResults.detectedDevices = [];
        }
    }

    /**
     * Detect new devices
     */
    async detectNewDevices() {
        try {
            const response = await fetch('/api/hardware-config/detect-new-cards');
            const result = await response.json();
            
            if (result.success) {
                this.scanResults.newDevices = result.new_devices || [];
                this.updateDevicesCount(this.scanResults.newDevices.length);
                console.log('New devices found:', this.scanResults.newDevices.length);
            } else {
                throw new Error(result.error || 'New device detection failed');
            }
        } catch (error) {
            console.error('New device detection error:', error);
            this.scanResults.errors.push('Yeni cihaz tespiti başarısız: ' + error.message);
            this.scanResults.newDevices = [];
        }
    }

    /**
     * Process scan results
     */
    processResults() {
        this.scanResults.lastScanTime = new Date();
        
        // Notify parent component
        this.onStateChange(this.scanResults, this.scanResults.newDevices.length > 0);
        
        console.log('Device detection completed:', {
            serialPorts: this.scanResults.serialPorts.length,
            detectedDevices: this.scanResults.detectedDevices.length,
            newDevices: this.scanResults.newDevices.length,
            errors: this.scanResults.errors.length
        });
    }

    /**
     * Show scan results
     */
    showResults() {
        this.renderSerialPorts();
        this.renderDetectedDevices();
        this.showScanSummary();
        
        // Show troubleshooting if no new devices found
        if (this.scanResults.newDevices.length === 0) {
            this.showTroubleshooting();
        }
    }

    /**
     * Render serial ports list
     */
    renderSerialPorts() {
        const container = document.getElementById('serialPortsList');
        const section = document.getElementById('serialPortsSection');
        
        if (this.scanResults.serialPorts.length === 0) {
            section.style.display = 'none';
            return;
        }
        
        section.style.display = 'block';
        
        let html = '';
        this.scanResults.serialPorts.forEach(port => {
            html += `
                <div class="port-card mb-2">
                    <div class="card">
                        <div class="card-body py-2">
                            <div class="row align-items-center">
                                <div class="col-md-3">
                                    <strong>${port.path}</strong>
                                </div>
                                <div class="col-md-4">
                                    <small class="text-muted">${port.manufacturer || 'Bilinmeyen Üretici'}</small>
                                </div>
                                <div class="col-md-3">
                                    <span class="badge ${port.available ? 'bg-success' : 'bg-warning'}">
                                        ${port.available ? 'Kullanılabilir' : 'Meşgul'}
                                    </span>
                                </div>
                                <div class="col-md-2 text-end">
                                    <button class="btn btn-outline-primary btn-sm" 
                                            onclick="deviceDetection.testPort('${port.path}')"
                                            ${!port.available ? 'disabled' : ''}>
                                        <i class="fas fa-vial"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }

    /**
     * Render detected devices list
     */
    renderDetectedDevices() {
        const container = document.getElementById('detectedDevicesList');
        
        if (this.scanResults.newDevices.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-exclamation-triangle fa-3x mb-3 text-warning"></i>
                    <h5>Yeni Cihaz Bulunamadı</h5>
                    <p>Bağlantıları kontrol edin ve yeniden deneyin.</p>
                </div>
            `;
            return;
        }

        let html = '';
        this.scanResults.newDevices.forEach((device, index) => {
            html += this.renderDeviceCard(device, index);
        });

        container.innerHTML = html;
    }

    /**
     * Render a single device card
     */
    renderDeviceCard(device, index) {
        const deviceType = device.type || {};
        const capabilities = device.capabilities || {};
        
        return `
            <div class="device-card mb-3" data-device-index="${index}">
                <div class="card border-success">
                    <div class="card-header bg-light">
                        <div class="row align-items-center">
                            <div class="col-md-8">
                                <h6 class="mb-0">
                                    <i class="fas fa-microchip text-primary me-2"></i>
                                    ${deviceType.model || 'Bilinmeyen Model'}
                                </h6>
                            </div>
                            <div class="col-md-4 text-end">
                                <span class="device-status detected">Yeni Cihaz</span>
                            </div>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <div class="device-info">
                                    <div class="info-item mb-2">
                                        <strong>Adres:</strong> 
                                        <span class="badge bg-primary">${device.address}</span>
                                    </div>
                                    <div class="info-item mb-2">
                                        <strong>Kanallar:</strong> 
                                        <span class="text-success">${capabilities.maxRelays || 'Bilinmiyor'}</span>
                                    </div>
                                    <div class="info-item mb-2">
                                        <strong>Üretici:</strong> 
                                        <span class="text-muted">${deviceType.manufacturer || 'Bilinmiyor'}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="device-stats">
                                    <div class="info-item mb-2">
                                        <strong>Yanıt Süresi:</strong> 
                                        <span class="text-info">${device.responseTime || 0}ms</span>
                                    </div>
                                    <div class="info-item mb-2">
                                        <strong>Durum:</strong> 
                                        <span class="badge ${this.getStatusBadgeClass(device.status)}">
                                            ${this.getStatusText(device.status)}
                                        </span>
                                    </div>
                                    <div class="info-item mb-2">
                                        <strong>Son Görülme:</strong> 
                                        <span class="text-muted">${this.formatTime(device.lastSeen)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        ${capabilities.features && capabilities.features.length > 0 ? `
                            <div class="device-features mt-3">
                                <strong>Özellikler:</strong>
                                <div class="mt-1">
                                    ${capabilities.features.map(feature => 
                                        `<span class="badge bg-secondary me-1">${feature}</span>`
                                    ).join('')}
                                </div>
                            </div>
                        ` : ''}
                        
                        <div class="device-actions mt-3">
                            <button class="btn btn-outline-primary btn-sm me-2" 
                                    onclick="deviceDetection.testDevice(${index})">
                                <i class="fas fa-vial me-1"></i>Test Et
                            </button>
                            <button class="btn btn-outline-info btn-sm me-2" 
                                    onclick="deviceDetection.showDeviceDetails(${index})">
                                <i class="fas fa-info-circle me-1"></i>Detaylar
                            </button>
                            <button class="btn btn-outline-success btn-sm" 
                                    onclick="deviceDetection.selectDevice(${index})">
                                <i class="fas fa-check me-1"></i>Seç
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Update scan progress
     */
    updateScanProgress(percentage, statusText, details = '') {
        const progressBar = document.getElementById('scanProgressBar');
        const statusElement = document.getElementById('scanStatusText');
        const detailsElement = document.getElementById('scanProgressDetails');
        
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
            progressBar.setAttribute('aria-valuenow', percentage.toString());
        }
        
        if (statusElement) {
            statusElement.textContent = statusText;
        }
        
        if (detailsElement) {
            detailsElement.textContent = details || statusText;
        }
    }

    /**
     * Update ports count display
     */
    updatePortsCount(count) {
        const element = document.getElementById('portsFoundCount');
        if (element) {
            element.textContent = count.toString();
        }
    }

    /**
     * Update devices count display
     */
    updateDevicesCount(count) {
        const element = document.getElementById('devicesFoundCount');
        if (element) {
            element.textContent = count.toString();
        }
    }

    /**
     * Show/hide scan progress
     */
    showScanProgress(show) {
        const spinner = document.getElementById('scanSpinner');
        const refreshBtn = document.getElementById('refreshScanBtn');
        
        if (spinner) {
            spinner.style.display = show ? 'inline-block' : 'none';
        }
        
        if (refreshBtn) {
            refreshBtn.disabled = show;
        }
    }

    /**
     * Show troubleshooting section
     */
    showTroubleshooting() {
        const section = document.getElementById('troubleshootingSection');
        if (section) {
            section.style.display = 'block';
        }
    }

    /**
     * Hide troubleshooting section
     */
    hideTroubleshooting() {
        const section = document.getElementById('troubleshootingSection');
        if (section) {
            section.style.display = 'none';
        }
    }

    /**
     * Show scan summary
     */
    showScanSummary() {
        const section = document.getElementById('scanSummary');
        if (section) {
            section.style.display = 'block';
            
            // Update summary stats
            document.getElementById('summaryPortsCount').textContent = this.scanResults.serialPorts.length;
            document.getElementById('summaryDevicesCount').textContent = this.scanResults.detectedDevices.length;
            document.getElementById('summaryNewDevicesCount').textContent = this.scanResults.newDevices.length;
            document.getElementById('lastScanTime').textContent = this.formatTime(this.scanResults.lastScanTime);
        }
    }

    /**
     * Hide scan summary
     */
    hideScanSummary() {
        const section = document.getElementById('scanSummary');
        if (section) {
            section.style.display = 'none';
        }
    }

    /**
     * Test a specific serial port
     */
    async testPort(portPath) {
        console.log('Testing port:', portPath);
        // Implementation for port testing
        alert(`Port ${portPath} test functionality will be implemented`);
    }

    /**
     * Test a specific device
     */
    async testDevice(deviceIndex) {
        const device = this.scanResults.newDevices[deviceIndex];
        if (!device) return;
        
        console.log('Testing device:', device);
        // Implementation for device testing
        alert(`Device ${device.address} test functionality will be implemented`);
    }

    /**
     * Show device details
     */
    showDeviceDetails(deviceIndex) {
        const device = this.scanResults.newDevices[deviceIndex];
        if (!device) return;
        
        const modal = this.createModal(
            `Cihaz Detayları - Adres ${device.address}`,
            this.renderDeviceDetailsContent(device),
            'info'
        );
        
        modal.show();
    }

    /**
     * Select a device for configuration
     */
    selectDevice(deviceIndex) {
        const device = this.scanResults.newDevices[deviceIndex];
        if (!device) return;
        
        // Mark device as selected
        device.selected = true;
        
        // Update UI
        const deviceCard = document.querySelector(`[data-device-index="${deviceIndex}"]`);
        if (deviceCard) {
            deviceCard.classList.add('border-primary');
            deviceCard.querySelector('.device-status').textContent = 'Seçildi';
            deviceCard.querySelector('.device-status').className = 'device-status selected badge bg-primary';
        }
        
        // Notify parent component
        this.onStateChange(this.scanResults, true);
        
        console.log('Device selected:', device);
    }

    /**
     * Show detailed troubleshooting
     */
    showDetailedTroubleshooting() {
        const troubleshootingSteps = [
            {
                title: 'Donanım Bağlantıları',
                steps: [
                    'USB-RS485 adaptörünün bilgisayara doğru takıldığından emin olun',
                    'Modbus kablolarının A-A, B-B şeklinde bağlandığını kontrol edin',
                    'Röle kartının güç kaynağının bağlı ve çalışır durumda olduğunu kontrol edin'
                ]
            },
            {
                title: 'Yazılım Ayarları',
                steps: [
                    'Cihaz Yöneticisi\'nden USB-RS485 adaptörünün tanındığını kontrol edin',
                    'COM port numarasının doğru olduğundan emin olun',
                    'Baud rate ayarının 9600 olduğunu kontrol edin'
                ]
            },
            {
                title: 'Cihaz Ayarları',
                steps: [
                    'Röle kartının varsayılan slave adresini kontrol edin (genellikle 1)',
                    'DIP switch ayarlarının doğru olduğundan emin olun',
                    'Cihazın Modbus RTU modunda çalıştığını kontrol edin'
                ]
            }
        ];

        const modal = this.createModal(
            'Detaylı Sorun Giderme',
            this.renderTroubleshootingContent(troubleshootingSteps),
            'warning'
        );
        
        modal.show();
    }

    /**
     * Test serial ports functionality
     */
    async testSerialPorts() {
        console.log('Testing serial ports...');
        // Implementation for serial port testing
        alert('Seri port test functionality will be implemented');
    }

    /**
     * Render device details content
     */
    renderDeviceDetailsContent(device) {
        const deviceType = device.type || {};
        const capabilities = device.capabilities || {};
        
        return `
            <div class="device-details">
                <div class="row">
                    <div class="col-md-6">
                        <h6>Temel Bilgiler</h6>
                        <table class="table table-sm">
                            <tr><td><strong>Adres:</strong></td><td>${device.address}</td></tr>
                            <tr><td><strong>Model:</strong></td><td>${deviceType.model || 'Bilinmiyor'}</td></tr>
                            <tr><td><strong>Üretici:</strong></td><td>${deviceType.manufacturer || 'Bilinmiyor'}</td></tr>
                            <tr><td><strong>Kanallar:</strong></td><td>${capabilities.maxRelays || 'Bilinmiyor'}</td></tr>
                        </table>
                    </div>
                    <div class="col-md-6">
                        <h6>Performans</h6>
                        <table class="table table-sm">
                            <tr><td><strong>Yanıt Süresi:</strong></td><td>${device.responseTime || 0}ms</td></tr>
                            <tr><td><strong>Durum:</strong></td><td>${this.getStatusText(device.status)}</td></tr>
                            <tr><td><strong>Son Görülme:</strong></td><td>${this.formatTime(device.lastSeen)}</td></tr>
                        </table>
                    </div>
                </div>
                
                ${capabilities.supportedFunctions ? `
                    <div class="mt-3">
                        <h6>Desteklenen Fonksiyonlar</h6>
                        <div class="supported-functions">
                            ${capabilities.supportedFunctions.map(func => 
                                `<span class="badge bg-info me-1">0x${func.toString(16).padStart(2, '0')}</span>`
                            ).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${device.raw_response ? `
                    <div class="mt-3">
                        <h6>Ham Yanıt</h6>
                        <pre class="bg-light p-2 rounded"><code>${JSON.stringify(device.raw_response, null, 2)}</code></pre>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render troubleshooting content
     */
    renderTroubleshootingContent(troubleshootingSteps) {
        let html = '<div class="troubleshooting-steps">';
        
        troubleshootingSteps.forEach((section, index) => {
            html += `
                <div class="troubleshooting-section mb-4">
                    <h6><i class="fas fa-tools me-2"></i>${section.title}</h6>
                    <ol class="list-group list-group-numbered">
                        ${section.steps.map(step => 
                            `<li class="list-group-item">${step}</li>`
                        ).join('')}
                    </ol>
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }

    /**
     * Create and show modal
     */
    createModal(title, content, type = 'info') {
        const modalId = 'deviceModal_' + Date.now();
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
        const modal = new bootstrap.Modal(modalElement);
        
        // Clean up modal when hidden
        modalElement.addEventListener('hidden.bs.modal', () => {
            modalElement.remove();
        });

        return modal;
    }

    /**
     * Get status badge class
     */
    getStatusBadgeClass(status) {
        const statusClasses = {
            'responding': 'bg-success',
            'timeout': 'bg-warning',
            'error': 'bg-danger',
            'detected': 'bg-info',
            'selected': 'bg-primary'
        };
        
        return statusClasses[status] || 'bg-secondary';
    }

    /**
     * Get status text
     */
    getStatusText(status) {
        const statusTexts = {
            'responding': 'Yanıt Veriyor',
            'timeout': 'Zaman Aşımı',
            'error': 'Hata',
            'detected': 'Tespit Edildi',
            'selected': 'Seçildi'
        };
        
        return statusTexts[status] || 'Bilinmiyor';
    }

    /**
     * Format time for display
     */
    formatTime(date) {
        if (!date) return '-';
        
        const now = new Date();
        const time = new Date(date);
        const diffMs = now - time;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        
        if (diffSecs < 60) {
            return `${diffSecs} saniye önce`;
        } else if (diffMins < 60) {
            return `${diffMins} dakika önce`;
        } else {
            return time.toLocaleTimeString('tr-TR');
        }
    }

    /**
     * Get current scan results
     */
    getScanResults() {
        return this.scanResults;
    }

    /**
     * Check if detection is complete
     */
    isDetectionComplete() {
        return !this.isScanning && this.scanResults.newDevices.length > 0;
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }
    }
}

// Global instance for HTML event handlers
let deviceDetection;