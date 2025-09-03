/**
 * Testing and Validation Component
 * Real-time test execution with visual indicators for communication, relay, and integration tests
 * Implements test result display with pass/fail status and error details
 * Includes retry functionality and troubleshooting guidance
 * Requirements: 2.5, 4.1, 4.2, 4.3, 4.4
 */

class TestingValidation {
    constructor(containerId, onStateChange) {
        this.containerId = containerId;
        this.onStateChange = onStateChange || (() => {});
        this.configuredDevices = [];
        this.testResults = [];
        this.isTesting = false;
        this.testProgress = {
            currentStep: 0,
            totalSteps: 0,
            currentDevice: null,
            currentTest: null,
            status: 'idle'
        };
        this.testSuites = new Map(); // Map<deviceAddress, TestSuite>
        this.retryAttempts = new Map(); // Map<testId, attemptCount>
        
        this.init();
    }

    /**
     * Initialize the testing and validation component
     */
    init() {
        this.render();
        this.setupEventListeners();
        // Load configured devices from previous step
        this.loadConfiguredDevices();
    }

    /**
     * Render the testing and validation interface
     */
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('Testing validation container not found:', this.containerId);
            return;
        }

        container.innerHTML = `
            <div class="testing-validation-container">
                <!-- Header -->
                <div class="testing-header mb-4">
                    <div class="row">
                        <div class="col-md-8">
                            <h4><i class="fas fa-vial me-2"></i>Donanım Testi ve Doğrulama</h4>
                            <p class="text-muted">Yapılandırılan cihazlar kapsamlı testlerden geçiriliyor...</p>
                        </div>
                        <div class="col-md-4 text-end">
                            <button class="btn btn-primary" id="startTestingBtn" onclick="testingValidation.startTesting()">
                                <i class="fas fa-play me-1"></i>Testleri Başlat
                            </button>
                        </div>
                    </div>
                </div>     
           <!-- Test Progress -->
                <div class="test-progress mb-4" id="testProgressSection" style="display: none;">
                    <div class="card border-primary">
                        <div class="card-header bg-primary text-white">
                            <h6 class="mb-0">
                                <span class="loading-spinner me-2" id="testSpinner"></span>
                                <span id="testStatusText">Test başlatılıyor...</span>
                            </h6>
                        </div>
                        <div class="card-body">
                            <div class="progress mb-3">
                                <div class="progress-bar progress-bar-striped progress-bar-animated" 
                                     id="testProgressBar" 
                                     role="progressbar" 
                                     style="width: 0%" 
                                     aria-valuenow="0" 
                                     aria-valuemin="0" 
                                     aria-valuemax="100">
                                </div>
                            </div>
                            <div class="row">
                                <div class="col-md-6">
                                    <small class="text-muted" id="testProgressDetails">Hazırlanıyor...</small>
                                </div>
                                <div class="col-md-6 text-end">
                                    <small class="text-muted">
                                        <span id="currentTestStep">0</span> / <span id="totalTestSteps">0</span> test
                                    </small>
                                </div>
                            </div>
                            <div class="mt-2">
                                <div class="row text-center">
                                    <div class="col-md-4">
                                        <span class="badge bg-success" id="passedTestsCount">0</span>
                                        <small class="d-block text-muted">Başarılı</small>
                                    </div>
                                    <div class="col-md-4">
                                        <span class="badge bg-danger" id="failedTestsCount">0</span>
                                        <small class="d-block text-muted">Başarısız</small>
                                    </div>
                                    <div class="col-md-4">
                                        <span class="badge bg-warning" id="retryTestsCount">0</span>
                                        <small class="d-block text-muted">Yeniden Deneme</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Test Categories Overview -->
                <div class="test-categories mb-4" id="testCategoriesSection">
                    <h5><i class="fas fa-list-check me-2"></i>Test Kategorileri</h5>
                    <div class="row">
                        <div class="col-md-4">
                            <div class="test-category-card">
                                <div class="card border-info">
                                    <div class="card-body text-center">
                                        <i class="fas fa-wifi fa-2x text-info mb-2"></i>
                                        <h6>İletişim Testi</h6>
                                        <p class="small text-muted">Modbus bağlantısı ve yanıt süresi</p>
                                        <div class="test-status" id="commTestStatus">
                                            <span class="badge bg-secondary">Bekliyor</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="test-category-card">
                                <div class="card border-warning">
                                    <div class="card-body text-center">
                                        <i class="fas fa-toggle-on fa-2x text-warning mb-2"></i>
                                        <h6>Röle Testi</h6>
                                        <p class="small text-muted">Fiziksel röle aktivasyonu</p>
                                        <div class="test-status" id="relayTestStatus">
                                            <span class="badge bg-secondary">Bekliyor</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="test-category-card">
                                <div class="card border-success">
                                    <div class="card-body text-center">
                                        <i class="fas fa-cogs fa-2x text-success mb-2"></i>
                                        <h6>Entegrasyon Testi</h6>
                                        <p class="small text-muted">Sistem entegrasyonu doğrulama</p>
                                        <div class="test-status" id="integrationTestStatus">
                                            <span class="badge bg-secondary">Bekliyor</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>      
          <!-- Device Testing List -->
                <div class="device-testing-list mb-4" id="deviceTestingList">
                    <h5><i class="fas fa-microchip me-2"></i>Cihaz Test Sonuçları</h5>
                    <div id="deviceTestsList">
                        <div class="text-center text-muted py-4">
                            <i class="fas fa-search fa-3x mb-3"></i>
                            <p>Yapılandırılmış cihazlar yükleniyor...</p>
                        </div>
                    </div>
                </div>

                <!-- Real-time Test Log -->
                <div class="test-log mb-4" id="testLogSection" style="display: none;">
                    <div class="card">
                        <div class="card-header">
                            <div class="row align-items-center">
                                <div class="col-md-8">
                                    <h6 class="mb-0"><i class="fas fa-terminal me-2"></i>Canlı Test Günlüğü</h6>
                                </div>
                                <div class="col-md-4 text-end">
                                    <button class="btn btn-outline-secondary btn-sm" onclick="testingValidation.clearTestLog()">
                                        <i class="fas fa-trash me-1"></i>Temizle
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="test-log-container" id="testLogContainer" style="height: 200px; overflow-y: auto; background: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px;">
                                <!-- Test log entries will be added here -->
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Test Results Summary -->
                <div class="test-results-summary mt-4" id="testResultsSummary" style="display: none;">
                    <div class="card border-success">
                        <div class="card-header bg-success text-white">
                            <h6 class="mb-0"><i class="fas fa-check-circle me-2"></i>Test Sonuçları Özeti</h6>
                        </div>
                        <div class="card-body">
                            <div class="row text-center mb-3">
                                <div class="col-md-3">
                                    <div class="summary-stat">
                                        <span class="stat-number text-primary" id="summaryTotalTests">0</span>
                                        <span class="stat-label">Toplam Test</span>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="summary-stat">
                                        <span class="stat-number text-success" id="summaryPassedTests">0</span>
                                        <span class="stat-label">Başarılı</span>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="summary-stat">
                                        <span class="stat-number text-danger" id="summaryFailedTests">0</span>
                                        <span class="stat-label">Başarısız</span>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="summary-stat">
                                        <span class="stat-number text-info" id="summaryTestDuration">0</span>
                                        <span class="stat-label">Süre (sn)</span>
                                    </div>
                                </div>
                            </div>
                            <div class="overall-result text-center" id="overallResult">
                                <!-- Overall result will be displayed here -->
                            </div>
                        </div>
                    </div>
                </div> 
               <!-- Troubleshooting Guide -->
                <div class="troubleshooting-section" id="troubleshootingSection" style="display: none;">
                    <div class="alert alert-warning">
                        <h5><i class="fas fa-exclamation-triangle me-2"></i>Test Başarısız?</h5>
                        <div class="troubleshooting-content">
                            <p class="mb-3">Aşağıdaki sorun giderme adımlarını deneyin:</p>
                            <div class="row">
                                <div class="col-md-6">
                                    <h6>İletişim Sorunları:</h6>
                                    <ul class="list-unstyled">
                                        <li><i class="fas fa-check-circle text-success me-2"></i>Modbus kablo bağlantılarını kontrol edin</li>
                                        <li><i class="fas fa-check-circle text-success me-2"></i>Güç kaynağının çalıştığından emin olun</li>
                                        <li><i class="fas fa-check-circle text-success me-2"></i>Slave adresinin doğru yapılandırıldığını kontrol edin</li>
                                    </ul>
                                </div>
                                <div class="col-md-6">
                                    <h6>Röle Sorunları:</h6>
                                    <ul class="list-unstyled">
                                        <li><i class="fas fa-check-circle text-success me-2"></i>Röle kartının güç aldığından emin olun</li>
                                        <li><i class="fas fa-check-circle text-success me-2"></i>Fiziksel bağlantıları kontrol edin</li>
                                        <li><i class="fas fa-check-circle text-success me-2"></i>Röle sesini dinleyin (tık sesi)</li>
                                    </ul>
                                </div>
                            </div>
                            <div class="mt-3">
                                <button class="btn btn-warning btn-sm me-2" onclick="testingValidation.showDetailedTroubleshooting()">
                                    <i class="fas fa-tools me-1"></i>Detaylı Sorun Giderme
                                </button>
                                <button class="btn btn-info btn-sm me-2" onclick="testingValidation.retryFailedTests()">
                                    <i class="fas fa-redo me-1"></i>Başarısız Testleri Tekrarla
                                </button>
                                <button class="btn btn-outline-secondary btn-sm" onclick="testingValidation.skipFailedTests()">
                                    <i class="fas fa-forward me-1"></i>Başarısız Testleri Atla
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Test Actions -->
                <div class="test-actions mt-4" id="testActions">
                    <div class="card">
                        <div class="card-body">
                            <div class="row align-items-center">
                                <div class="col-md-8">
                                    <h6 class="mb-1">Test İşlemleri</h6>
                                    <small class="text-muted">Testleri yönetin ve sonuçları kontrol edin</small>
                                </div>
                                <div class="col-md-4 text-end">
                                    <div class="btn-group" role="group">
                                        <button class="btn btn-outline-info btn-sm" id="pauseTestBtn" onclick="testingValidation.pauseTesting()" style="display: none;">
                                            <i class="fas fa-pause me-1"></i>Duraklat
                                        </button>
                                        <button class="btn btn-outline-warning btn-sm" id="retryTestBtn" onclick="testingValidation.retryCurrentTest()" style="display: none;">
                                            <i class="fas fa-redo me-1"></i>Tekrarla
                                        </button>
                                        <button class="btn btn-outline-danger btn-sm" id="stopTestBtn" onclick="testingValidation.stopTesting()" style="display: none;">
                                            <i class="fas fa-stop me-1"></i>Durdur
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }    /*
*
     * Setup event listeners
     */
    setupEventListeners() {
        // Auto-refresh test status every 5 seconds during testing
        this.statusInterval = setInterval(() => {
            if (this.isTesting) {
                this.updateTestStatus();
            }
        }, 5000);

        // Listen for keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'r' && this.isTesting) {
                e.preventDefault();
                this.retryCurrentTest();
            } else if (e.key === 'Escape' && this.isTesting) {
                this.pauseTesting();
            }
        });
    }

    /**
     * Load configured devices from previous step
     */
    async loadConfiguredDevices() {
        try {
            // Get devices from wizard session or previous step
            const configuredAddresses = wizard?.wizardData?.configuredAddresses || [];
            this.configuredDevices = configuredAddresses.filter(result => result.success);
            
            if (this.configuredDevices.length === 0) {
                // Try to get from API if not available in wizard data
                await this.fetchConfiguredDevices();
            }
            
            // Render devices list
            this.renderDevicesList();
            
            // Update test categories with device count
            this.updateTestCategories();
            
        } catch (error) {
            console.error('Error loading configured devices:', error);
            this.showError('Yapılandırılmış cihaz bilgileri yüklenemedi: ' + error.message);
        }
    }

    /**
     * Fetch configured devices from API
     */
    async fetchConfiguredDevices() {
        try {
            const response = await fetch('/api/hardware-config/wizard/session/' + wizard.sessionId);
            const result = await response.json();
            
            if (result.success && result.session) {
                const configuredAddresses = result.session.configuredAddresses || [];
                this.configuredDevices = configuredAddresses.filter(result => result.success);
            } else {
                throw new Error(result.error || 'Failed to fetch configured devices');
            }
        } catch (error) {
            console.error('Error fetching configured devices:', error);
            throw error;
        }
    }

    /**
     * Update test categories with current status
     */
    updateTestCategories() {
        const totalDevices = this.configuredDevices.length;
        
        // Update category descriptions with device count
        document.querySelector('#testCategoriesSection .col-md-4:nth-child(1) .small').textContent = 
            `${totalDevices} cihaz için Modbus bağlantısı`;
        document.querySelector('#testCategoriesSection .col-md-4:nth-child(2) .small').textContent = 
            `${totalDevices} cihaz için röle aktivasyonu`;
        document.querySelector('#testCategoriesSection .col-md-4:nth-child(3) .small').textContent = 
            `Sistem entegrasyonu ve doğrulama`;
    }    /*
*
     * Render devices list with test status
     */
    renderDevicesList() {
        const container = document.getElementById('deviceTestsList');
        if (!container) return;
        
        if (this.configuredDevices.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-exclamation-triangle fa-3x mb-3 text-warning"></i>
                    <h5>Test Edilecek Cihaz Bulunamadı</h5>
                    <p>Önce adres yapılandırması adımını tamamlayın.</p>
                </div>
            `;
            return;
        }

        let html = '';
        this.configuredDevices.forEach((device, index) => {
            html += this.renderDeviceTestCard(device, index);
        });

        container.innerHTML = html;
    }

    /**
     * Render a single device test card
     */
    renderDeviceTestCard(device, index) {
        const testSuite = this.testSuites.get(device.newAddress);
        const hasResults = testSuite && testSuite.results.length > 0;
        const overallSuccess = hasResults ? testSuite.overallSuccess : null;
        
        return `
            <div class="device-test-card mb-3" data-device-index="${index}" data-address="${device.newAddress}">
                <div class="card ${this.getDeviceCardBorderClass(overallSuccess)}">
                    <div class="card-header ${this.getDeviceCardHeaderClass(overallSuccess)}">
                        <div class="row align-items-center">
                            <div class="col-md-6">
                                <h6 class="mb-0">
                                    <i class="fas fa-microchip text-primary me-2"></i>
                                    Cihaz Adres ${device.newAddress}
                                </h6>
                            </div>
                            <div class="col-md-6 text-end">
                                <div class="device-test-status">
                                    ${this.renderDeviceTestStatus(testSuite)}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <div class="device-info">
                                    <div class="info-item mb-2">
                                        <strong>Eski Adres:</strong>
                                        <span class="badge bg-secondary ms-1">${device.oldAddress || 'Bilinmiyor'}</span>
                                    </div>
                                    <div class="info-item mb-2">
                                        <strong>Yeni Adres:</strong>
                                        <span class="badge bg-primary ms-1">${device.newAddress}</span>
                                    </div>
                                    <div class="info-item mb-2">
                                        <strong>Doğrulama:</strong>
                                        <span class="badge ${device.verified ? 'bg-success' : 'bg-warning'} ms-1">
                                            ${device.verified ? 'Doğrulandı' : 'Bekliyor'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="test-stats">
                                    ${hasResults ? `
                                        <div class="info-item mb-2">
                                            <strong>Toplam Test:</strong>
                                            <span class="text-info">${testSuite.totalTests}</span>
                                        </div>
                                        <div class="info-item mb-2">
                                            <strong>Başarılı:</strong>
                                            <span class="text-success">${testSuite.passedTests}</span>
                                        </div>
                                        <div class="info-item mb-2">
                                            <strong>Başarısız:</strong>
                                            <span class="text-danger">${testSuite.failedTests}</span>
                                        </div>
                                    ` : `
                                        <div class="text-muted">
                                            <i class="fas fa-clock me-1"></i>Test bekleniyor...
                                        </div>
                                    `}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Test Progress for this device -->
                        <div class="device-test-progress mt-3" id="deviceProgress_${device.newAddress}" style="display: none;">
                            <div class="progress progress-sm">
                                <div class="progress-bar progress-bar-striped progress-bar-animated" 
                                     id="deviceProgressBar_${device.newAddress}"
                                     style="width: 0%"></div>
                            </div>
                            <small class="text-muted" id="deviceProgressText_${device.newAddress}">Test başlatılıyor...</small>
                        </div>
                        
                        <!-- Test Results Details -->
                        ${hasResults ? this.renderTestResultsDetails(testSuite) : ''}
                        
                        <div class="device-test-actions mt-3">
                            <button class="btn btn-outline-primary btn-sm me-2" 
                                    onclick="testingValidation.testSingleDevice(${device.newAddress})"
                                    ${this.isTesting ? 'disabled' : ''}>
                                <i class="fas fa-vial me-1"></i>Test Et
                            </button>
                            <button class="btn btn-outline-info btn-sm me-2" 
                                    onclick="testingValidation.showDeviceTestDetails(${device.newAddress})"
                                    ${!hasResults ? 'disabled' : ''}>
                                <i class="fas fa-chart-line me-1"></i>Detaylar
                            </button>
                            <button class="btn btn-outline-warning btn-sm" 
                                    onclick="testingValidation.retryDeviceTests(${device.newAddress})"
                                    ${!hasResults || overallSuccess ? 'disabled' : ''}>
                                <i class="fas fa-redo me-1"></i>Tekrarla
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }    /**
  
   * Start comprehensive testing process
     */
    async startTesting() {
        if (this.isTesting) {
            console.log('Testing already in progress');
            return;
        }

        if (this.configuredDevices.length === 0) {
            this.showError('Test edilecek yapılandırılmış cihaz bulunamadı');
            return;
        }

        this.isTesting = true;
        this.testResults = [];
        this.testSuites.clear();
        this.retryAttempts.clear();
        
        try {
            // Show progress and update UI
            this.showTestProgress(true);
            this.showTestLog(true);
            this.updateTestActionButtons(true);
            
            // Initialize progress
            this.testProgress.totalSteps = this.configuredDevices.length * 3; // 3 test types per device
            this.testProgress.currentStep = 0;
            this.testProgress.status = 'running';
            
            this.updateProgressDisplay();
            this.logTestMessage('Test süreci başlatıldı', 'info');
            
            // Test each configured device
            for (let i = 0; i < this.configuredDevices.length; i++) {
                const device = this.configuredDevices[i];
                this.testProgress.currentDevice = device;
                
                this.logTestMessage(`Cihaz ${device.newAddress} test ediliyor...`, 'info');
                
                try {
                    const testSuite = await this.runDeviceTestSuite(device);
                    this.testSuites.set(device.newAddress, testSuite);
                    
                    // Update device card
                    this.updateDeviceTestCard(device.newAddress, testSuite);
                    
                    // Update category status
                    this.updateCategoryStatus(testSuite);
                    
                } catch (error) {
                    console.error(`Error testing device ${device.newAddress}:`, error);
                    this.logTestMessage(`Cihaz ${device.newAddress} test hatası: ${error.message}`, 'error');
                }
            }
            
            // Run system integration test
            this.logTestMessage('Sistem entegrasyon testi başlatılıyor...', 'info');
            await this.runSystemIntegrationTest();
            
            // Complete testing
            this.completeTestingProcess();
            
        } catch (error) {
            console.error('Testing process failed:', error);
            this.logTestMessage(`Test süreci başarısız: ${error.message}`, 'error');
            this.showTroubleshooting();
        } finally {
            this.isTesting = false;
            this.updateTestActionButtons(false);
        }
    }

    /**
     * Run comprehensive test suite for a single device
     */
    async runDeviceTestSuite(device) {
        const address = device.newAddress;
        const startTime = Date.now();
        const results = [];

        // Show device progress
        this.showDeviceProgress(address, true);

        try {
            // Test 1: Communication Test
            this.updateDeviceProgress(address, 33, 'İletişim testi...');
            this.logTestMessage(`Adres ${address}: İletişim testi başlatıldı`, 'info');
            
            const commTest = await this.testDeviceCommunication(address);
            results.push(commTest);
            this.testProgress.currentStep++;
            this.updateProgressDisplay();
            
            if (commTest.success) {
                this.logTestMessage(`Adres ${address}: İletişim testi başarılı (${commTest.responseTime}ms)`, 'success');
            } else {
                this.logTestMessage(`Adres ${address}: İletişim testi başarısız - ${commTest.error}`, 'error');
            }

            // Test 2: Relay Activation Test (only if communication successful)
            if (commTest.success) {
                this.updateDeviceProgress(address, 66, 'Röle testi...');
                this.logTestMessage(`Adres ${address}: Röle testi başlatıldı`, 'info');
                
                const relayTests = await this.testDeviceRelays(address);
                results.push(...relayTests);
                this.testProgress.currentStep++;
                this.updateProgressDisplay();
                
                const successfulRelays = relayTests.filter(r => r.success).length;
                this.logTestMessage(`Adres ${address}: ${successfulRelays}/${relayTests.length} röle testi başarılı`, 
                    successfulRelays === relayTests.length ? 'success' : 'warning');
            } else {
                // Skip relay tests if communication failed
                this.testProgress.currentStep++;
                this.updateProgressDisplay();
                this.logTestMessage(`Adres ${address}: İletişim başarısız, röle testleri atlandı`, 'warning');
            }

            // Test 3: Performance Test
            this.updateDeviceProgress(address, 100, 'Performans testi...');
            if (commTest.success) {
                const perfTest = await this.testDevicePerformance(address);
                results.push(perfTest);
                this.logTestMessage(`Adres ${address}: Performans testi tamamlandı`, 'info');
            }
            this.testProgress.currentStep++;
            this.updateProgressDisplay();

        } catch (error) {
            this.logTestMessage(`Adres ${address}: Test suite hatası - ${error.message}`, 'error');
        } finally {
            this.showDeviceProgress(address, false);
        }

        const duration = Date.now() - startTime;
        const passedTests = results.filter(r => r.success).length;
        const failedTests = results.filter(r => !r.success).length;
        const overallSuccess = failedTests === 0 && passedTests > 0;

        return {
            address,
            totalTests: results.length,
            passedTests,
            failedTests,
            results,
            overallSuccess,
            duration,
            timestamp: new Date()
        };
    }    /*
*
     * Test device communication
     */
    async testDeviceCommunication(address) {
        const testName = `İletişim Testi - Adres ${address}`;
        const startTime = Date.now();

        try {
            const response = await fetch('/api/hardware-config/test-card', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    address: address,
                    testType: 'communication',
                    timeout: 5000
                })
            });

            const result = await response.json();
            const duration = Date.now() - startTime;

            if (result.success) {
                return {
                    testName,
                    success: true,
                    duration,
                    details: `Cihaz ${address} ile iletişim başarılı`,
                    timestamp: new Date(),
                    responseTime: result.responseTime || duration
                };
            } else {
                return {
                    testName,
                    success: false,
                    duration,
                    details: `Cihaz ${address} ile iletişim başarısız`,
                    error: result.error || 'İletişim hatası',
                    timestamp: new Date()
                };
            }
        } catch (error) {
            const duration = Date.now() - startTime;
            return {
                testName,
                success: false,
                duration,
                details: `İletişim testi sırasında hata oluştu`,
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    /**
     * Test device relays (1, 8, 16 as per requirements)
     */
    async testDeviceRelays(address) {
        const testRelays = [1, 8, 16]; // As per requirements 4.3, 4.4
        const results = [];

        for (const relay of testRelays) {
            const testName = `Röle Testi - Adres ${address}, Röle ${relay}`;
            const startTime = Date.now();

            try {
                const response = await fetch('/api/hardware-config/test-relay', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        address: address,
                        relay: relay,
                        pulseDuration: 400
                    })
                });

                const result = await response.json();
                const duration = Date.now() - startTime;

                results.push({
                    testName,
                    success: result.success,
                    duration,
                    details: result.success ? 
                        `Röle ${relay} başarıyla aktive edildi (fiziksel tık sesi duyulmalı)` :
                        `Röle ${relay} aktivasyonu başarısız`,
                    error: result.success ? undefined : (result.error || 'Röle aktivasyon hatası'),
                    timestamp: new Date()
                });

                // Small delay between relay tests
                await this.delay(500);

            } catch (error) {
                const duration = Date.now() - startTime;
                results.push({
                    testName,
                    success: false,
                    duration,
                    details: `Röle ${relay} test hatası`,
                    error: error.message,
                    timestamp: new Date()
                });
            }
        }

        return results;
    }

    /**
     * Test device performance
     */
    async testDevicePerformance(address) {
        const testName = `Performans Testi - Adres ${address}`;
        const startTime = Date.now();

        try {
            // Measure response time over multiple iterations
            const iterations = 5;
            const responseTimes = [];

            for (let i = 0; i < iterations; i++) {
                const iterationStart = Date.now();
                
                const response = await fetch('/api/hardware-config/test-card', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        address: address,
                        testType: 'performance'
                    })
                });

                const result = await response.json();
                if (result.success) {
                    responseTimes.push(Date.now() - iterationStart);
                }

                await this.delay(200); // Small delay between iterations
            }

            const duration = Date.now() - startTime;
            const avgResponseTime = responseTimes.length > 0 ? 
                responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0;

            return {
                testName,
                success: responseTimes.length >= iterations * 0.8, // 80% success rate
                duration,
                details: `Ortalama yanıt süresi: ${Math.round(avgResponseTime)}ms (${responseTimes.length}/${iterations} başarılı)`,
                timestamp: new Date(),
                responseTime: avgResponseTime
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            return {
                testName,
                success: false,
                duration,
                details: 'Performans testi başarısız',
                error: error.message,
                timestamp: new Date()
            };
        }
    } 
   /**
     * Run system integration test
     */
    async runSystemIntegrationTest() {
        try {
            this.updateCategoryStatus(null, 'integration', 'running');
            
            const response = await fetch('/api/hardware-config/validate-setup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: wizard.sessionId,
                    configuredDevices: this.configuredDevices.map(d => d.newAddress)
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.updateCategoryStatus(null, 'integration', 'success');
                this.logTestMessage('Sistem entegrasyon testi başarılı', 'success');
            } else {
                this.updateCategoryStatus(null, 'integration', 'failed');
                this.logTestMessage(`Sistem entegrasyon testi başarısız: ${result.error}`, 'error');
            }

        } catch (error) {
            this.updateCategoryStatus(null, 'integration', 'failed');
            this.logTestMessage(`Sistem entegrasyon testi hatası: ${error.message}`, 'error');
        }
    }

    /**
     * Complete the testing process
     */
    completeTestingProcess() {
        // Calculate overall statistics
        const allResults = Array.from(this.testSuites.values()).flatMap(suite => suite.results);
        const totalTests = allResults.length;
        const passedTests = allResults.filter(r => r.success).length;
        const failedTests = allResults.filter(r => !r.success).length;
        const totalDuration = Array.from(this.testSuites.values()).reduce((sum, suite) => sum + suite.duration, 0);

        // Update summary
        this.updateTestSummary(totalTests, passedTests, failedTests, totalDuration);
        
        // Show results
        this.showTestProgress(false);
        this.showTestResultsSummary(true);
        
        // Show troubleshooting if there are failures
        if (failedTests > 0) {
            this.showTroubleshooting();
        }

        // Notify parent component
        const overallSuccess = failedTests === 0 && totalTests > 0;
        this.testResults = allResults;
        this.onStateChange(this.testResults, overallSuccess);

        this.logTestMessage(`Test süreci tamamlandı: ${passedTests}/${totalTests} başarılı`, 
            overallSuccess ? 'success' : 'warning');
    }

    /**
     * Test a single device
     */
    async testSingleDevice(address) {
        if (this.isTesting) return;

        const device = this.configuredDevices.find(d => d.newAddress === address);
        if (!device) return;

        this.isTesting = true;
        this.updateTestActionButtons(true);

        try {
            this.logTestMessage(`Tek cihaz testi başlatıldı: Adres ${address}`, 'info');
            
            const testSuite = await this.runDeviceTestSuite(device);
            this.testSuites.set(address, testSuite);
            
            this.updateDeviceTestCard(address, testSuite);
            this.updateCategoryStatus(testSuite);
            
            this.logTestMessage(`Tek cihaz testi tamamlandı: Adres ${address}`, 'success');

        } catch (error) {
            this.logTestMessage(`Tek cihaz testi hatası: ${error.message}`, 'error');
        } finally {
            this.isTesting = false;
            this.updateTestActionButtons(false);
        }
    }

    /**
     * Retry failed tests
     */
    async retryFailedTests() {
        const failedDevices = Array.from(this.testSuites.entries())
            .filter(([_, suite]) => !suite.overallSuccess)
            .map(([address, _]) => address);

        if (failedDevices.length === 0) {
            this.showToast('Tekrarlanacak başarısız test bulunamadı', 'info');
            return;
        }

        this.logTestMessage(`${failedDevices.length} cihaz için başarısız testler tekrarlanıyor...`, 'info');

        for (const address of failedDevices) {
            await this.retryDeviceTests(address);
        }
    }

    /**
     * Retry tests for a specific device
     */
    async retryDeviceTests(address) {
        const device = this.configuredDevices.find(d => d.newAddress === address);
        if (!device) return;

        // Increment retry count
        const retryKey = `device_${address}`;
        const currentRetries = this.retryAttempts.get(retryKey) || 0;
        
        if (currentRetries >= 3) {
            this.showToast(`Cihaz ${address} için maksimum deneme sayısına ulaşıldı`, 'warning');
            return;
        }

        this.retryAttempts.set(retryKey, currentRetries + 1);
        this.logTestMessage(`Cihaz ${address} için ${currentRetries + 1}. deneme başlatılıyor...`, 'info');

        try {
            const testSuite = await this.runDeviceTestSuite(device);
            this.testSuites.set(address, testSuite);
            this.updateDeviceTestCard(address, testSuite);
            
            if (testSuite.overallSuccess) {
                this.logTestMessage(`Cihaz ${address} tekrar testi başarılı`, 'success');
            } else {
                this.logTestMessage(`Cihaz ${address} tekrar testi başarısız`, 'error');
            }

        } catch (error) {
            this.logTestMessage(`Cihaz ${address} tekrar testi hatası: ${error.message}`, 'error');
        }
    }    /**

     * UI Update Methods
     */

    /**
     * Update progress display
     */
    updateProgressDisplay(statusText = '') {
        const progressBar = document.getElementById('testProgressBar');
        const statusElement = document.getElementById('testStatusText');
        const detailsElement = document.getElementById('testProgressDetails');
        const currentStepElement = document.getElementById('currentTestStep');
        const totalStepsElement = document.getElementById('totalTestSteps');

        if (progressBar && this.testProgress.totalSteps > 0) {
            const percentage = (this.testProgress.currentStep / this.testProgress.totalSteps) * 100;
            progressBar.style.width = `${percentage}%`;
            progressBar.setAttribute('aria-valuenow', percentage.toString());
        }

        if (statusElement && statusText) {
            statusElement.textContent = statusText;
        }

        if (detailsElement) {
            const currentDevice = this.testProgress.currentDevice;
            if (currentDevice) {
                detailsElement.textContent = `Cihaz ${currentDevice.newAddress} test ediliyor...`;
            } else {
                detailsElement.textContent = statusText || 'Test devam ediyor...';
            }
        }

        if (currentStepElement) {
            currentStepElement.textContent = this.testProgress.currentStep.toString();
        }

        if (totalStepsElement) {
            totalStepsElement.textContent = this.testProgress.totalSteps.toString();
        }

        // Update test counters
        this.updateTestCounters();
    }

    /**
     * Update test counters
     */
    updateTestCounters() {
        const allResults = Array.from(this.testSuites.values()).flatMap(suite => suite.results);
        const passedCount = allResults.filter(r => r.success).length;
        const failedCount = allResults.filter(r => !r.success).length;
        const retryCount = Array.from(this.retryAttempts.values()).reduce((sum, count) => sum + count, 0);

        const passedElement = document.getElementById('passedTestsCount');
        const failedElement = document.getElementById('failedTestsCount');
        const retryElement = document.getElementById('retryTestsCount');

        if (passedElement) passedElement.textContent = passedCount.toString();
        if (failedElement) failedElement.textContent = failedCount.toString();
        if (retryElement) retryElement.textContent = retryCount.toString();
    }

    /**
     * Update category status
     */
    updateCategoryStatus(testSuite, category = null, status = null) {
        if (category && status) {
            // Direct status update
            const statusElement = document.getElementById(`${category}TestStatus`);
            if (statusElement) {
                statusElement.innerHTML = this.getCategoryStatusBadge(status);
            }
            return;
        }

        if (!testSuite) return;

        // Update based on test suite results
        const commTests = testSuite.results.filter(r => r.testName.includes('İletişim'));
        const relayTests = testSuite.results.filter(r => r.testName.includes('Röle'));

        // Communication status
        const commSuccess = commTests.length > 0 && commTests.every(r => r.success);
        const commStatus = commTests.length === 0 ? 'pending' : (commSuccess ? 'success' : 'failed');
        document.getElementById('commTestStatus').innerHTML = this.getCategoryStatusBadge(commStatus);

        // Relay status
        const relaySuccess = relayTests.length > 0 && relayTests.some(r => r.success);
        const relayStatus = relayTests.length === 0 ? 'pending' : (relaySuccess ? 'success' : 'failed');
        document.getElementById('relayTestStatus').innerHTML = this.getCategoryStatusBadge(relayStatus);
    }

    /**
     * Get category status badge
     */
    getCategoryStatusBadge(status) {
        switch (status) {
            case 'success':
                return '<span class="badge bg-success"><i class="fas fa-check me-1"></i>Başarılı</span>';
            case 'failed':
                return '<span class="badge bg-danger"><i class="fas fa-times me-1"></i>Başarısız</span>';
            case 'running':
                return '<span class="badge bg-info"><i class="fas fa-spinner fa-spin me-1"></i>Çalışıyor</span>';
            case 'pending':
            default:
                return '<span class="badge bg-secondary">Bekliyor</span>';
        }
    }

    /**
     * Show/hide test progress
     */
    showTestProgress(show) {
        const section = document.getElementById('testProgressSection');
        const spinner = document.getElementById('testSpinner');
        const startBtn = document.getElementById('startTestingBtn');

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
     * Show/hide test log
     */
    showTestLog(show) {
        const section = document.getElementById('testLogSection');
        if (section) {
            section.style.display = show ? 'block' : 'none';
        }
    }

    /**
     * Show/hide test results summary
     */
    showTestResultsSummary(show) {
        const section = document.getElementById('testResultsSummary');
        if (section) {
            section.style.display = show ? 'block' : 'none';
        }
    }

    /**
     * Show/hide troubleshooting
     */
    showTroubleshooting() {
        const section = document.getElementById('troubleshootingSection');
        if (section) {
            section.style.display = 'block';
        }
    }

    /**
     * Update test action buttons
     */
    updateTestActionButtons(testing) {
        const pauseBtn = document.getElementById('pauseTestBtn');
        const retryBtn = document.getElementById('retryTestBtn');
        const stopBtn = document.getElementById('stopTestBtn');

        if (pauseBtn) pauseBtn.style.display = testing ? 'inline-block' : 'none';
        if (retryBtn) retryBtn.style.display = testing ? 'inline-block' : 'none';
        if (stopBtn) stopBtn.style.display = testing ? 'inline-block' : 'none';
    }    /**
 
    * Device-specific UI methods
     */

    /**
     * Show/hide device progress
     */
    showDeviceProgress(address, show) {
        const progressElement = document.getElementById(`deviceProgress_${address}`);
        if (progressElement) {
            progressElement.style.display = show ? 'block' : 'none';
        }
    }

    /**
     * Update device progress
     */
    updateDeviceProgress(address, percentage, text) {
        const progressBar = document.getElementById(`deviceProgressBar_${address}`);
        const progressText = document.getElementById(`deviceProgressText_${address}`);

        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }

        if (progressText) {
            progressText.textContent = text;
        }
    }

    /**
     * Update device test card
     */
    updateDeviceTestCard(address, testSuite) {
        const card = document.querySelector(`[data-address="${address}"]`);
        if (!card) return;

        // Update card border and header
        card.className = `device-test-card mb-3 ${this.getDeviceCardBorderClass(testSuite.overallSuccess)}`;
        const header = card.querySelector('.card-header');
        if (header) {
            header.className = `card-header ${this.getDeviceCardHeaderClass(testSuite.overallSuccess)}`;
        }

        // Update status badge
        const statusElement = card.querySelector('.device-test-status');
        if (statusElement) {
            statusElement.innerHTML = this.renderDeviceTestStatus(testSuite);
        }

        // Update test stats
        const statsContainer = card.querySelector('.test-stats');
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="info-item mb-2">
                    <strong>Toplam Test:</strong>
                    <span class="text-info">${testSuite.totalTests}</span>
                </div>
                <div class="info-item mb-2">
                    <strong>Başarılı:</strong>
                    <span class="text-success">${testSuite.passedTests}</span>
                </div>
                <div class="info-item mb-2">
                    <strong>Başarısız:</strong>
                    <span class="text-danger">${testSuite.failedTests}</span>
                </div>
            `;
        }

        // Add test results details
        const existingResults = card.querySelector('.test-results-details');
        if (existingResults) {
            existingResults.remove();
        }

        const resultsHtml = this.renderTestResultsDetails(testSuite);
        const actionsDiv = card.querySelector('.device-test-actions');
        if (actionsDiv && resultsHtml) {
            actionsDiv.insertAdjacentHTML('beforebegin', resultsHtml);
        }

        // Update action buttons
        const retryBtn = card.querySelector('button[onclick*="retryDeviceTests"]');
        if (retryBtn) {
            retryBtn.disabled = testSuite.overallSuccess;
        }

        const detailsBtn = card.querySelector('button[onclick*="showDeviceTestDetails"]');
        if (detailsBtn) {
            detailsBtn.disabled = false;
        }
    }

    /**
     * Render device test status
     */
    renderDeviceTestStatus(testSuite) {
        if (!testSuite) {
            return '<span class="badge bg-secondary">Bekliyor</span>';
        }

        if (testSuite.overallSuccess) {
            return '<span class="badge bg-success"><i class="fas fa-check me-1"></i>Başarılı</span>';
        } else if (testSuite.passedTests > 0) {
            return '<span class="badge bg-warning"><i class="fas fa-exclamation-triangle me-1"></i>Kısmi</span>';
        } else {
            return '<span class="badge bg-danger"><i class="fas fa-times me-1"></i>Başarısız</span>';
        }
    }

    /**
     * Render test results details
     */
    renderTestResultsDetails(testSuite) {
        if (!testSuite || testSuite.results.length === 0) return '';

        return `
            <div class="test-results-details mt-3">
                <h6 class="text-muted mb-2">Test Detayları:</h6>
                <div class="test-results-list">
                    ${testSuite.results.map(result => `
                        <div class="test-result-item mb-1 p-2 rounded ${result.success ? 'bg-light-success' : 'bg-light-danger'}">
                            <div class="row align-items-center">
                                <div class="col-md-6">
                                    <small class="fw-bold">
                                        <i class="fas ${result.success ? 'fa-check text-success' : 'fa-times text-danger'} me-1"></i>
                                        ${result.testName}
                                    </small>
                                </div>
                                <div class="col-md-3">
                                    <small class="text-muted">${result.duration}ms</small>
                                </div>
                                <div class="col-md-3 text-end">
                                    ${result.responseTime ? `<small class="text-info">${result.responseTime}ms yanıt</small>` : ''}
                                </div>
                            </div>
                            ${result.error ? `<div class="mt-1"><small class="text-danger">${result.error}</small></div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Get device card border class
     */
    getDeviceCardBorderClass(success) {
        if (success === null || success === undefined) return 'border-light';
        return success ? 'border-success' : 'border-danger';
    }

    /**
     * Get device card header class
     */
    getDeviceCardHeaderClass(success) {
        if (success === null || success === undefined) return 'bg-light';
        return success ? 'bg-light-success' : 'bg-light-danger';
    }    
/**
     * Test log methods
     */

    /**
     * Log test message
     */
    logTestMessage(message, type = 'info') {
        const logContainer = document.getElementById('testLogContainer');
        if (!logContainer) return;

        const timestamp = new Date().toLocaleTimeString();
        const iconClass = this.getLogIconClass(type);
        const textClass = this.getLogTextClass(type);

        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry mb-1';
        logEntry.innerHTML = `
            <span class="text-muted">[${timestamp}]</span>
            <i class="fas ${iconClass} ${textClass} me-1"></i>
            <span class="${textClass}">${message}</span>
        `;

        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight;

        // Limit log entries to prevent memory issues
        const entries = logContainer.querySelectorAll('.log-entry');
        if (entries.length > 100) {
            entries[0].remove();
        }
    }

    /**
     * Get log icon class
     */
    getLogIconClass(type) {
        switch (type) {
            case 'success': return 'fa-check-circle';
            case 'error': return 'fa-times-circle';
            case 'warning': return 'fa-exclamation-triangle';
            case 'info':
            default: return 'fa-info-circle';
        }
    }

    /**
     * Get log text class
     */
    getLogTextClass(type) {
        switch (type) {
            case 'success': return 'text-success';
            case 'error': return 'text-danger';
            case 'warning': return 'text-warning';
            case 'info':
            default: return 'text-info';
        }
    }

    /**
     * Clear test log
     */
    clearTestLog() {
        const logContainer = document.getElementById('testLogContainer');
        if (logContainer) {
            logContainer.innerHTML = '';
        }
    }

    /**
     * Update test summary
     */
    updateTestSummary(totalTests, passedTests, failedTests, totalDuration) {
        document.getElementById('summaryTotalTests').textContent = totalTests.toString();
        document.getElementById('summaryPassedTests').textContent = passedTests.toString();
        document.getElementById('summaryFailedTests').textContent = failedTests.toString();
        document.getElementById('summaryTestDuration').textContent = Math.round(totalDuration / 1000).toString();

        // Update overall result
        const overallResult = document.getElementById('overallResult');
        const successRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

        if (successRate === 100) {
            overallResult.innerHTML = `
                <div class="alert alert-success mb-0">
                    <i class="fas fa-check-circle fa-2x mb-2"></i>
                    <h5>Tüm Testler Başarılı!</h5>
                    <p class="mb-0">Donanım yapılandırması tamamen başarılı. Sistem entegrasyonuna geçebilirsiniz.</p>
                </div>
            `;
        } else if (successRate >= 80) {
            overallResult.innerHTML = `
                <div class="alert alert-warning mb-0">
                    <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
                    <h5>Testler Büyük Ölçüde Başarılı (%${Math.round(successRate)})</h5>
                    <p class="mb-0">Bazı testler başarısız oldu ancak sistem kullanılabilir durumda. Başarısız testleri tekrar deneyin.</p>
                </div>
            `;
        } else {
            overallResult.innerHTML = `
                <div class="alert alert-danger mb-0">
                    <i class="fas fa-times-circle fa-2x mb-2"></i>
                    <h5>Testler Başarısız (%${Math.round(successRate)})</h5>
                    <p class="mb-0">Çok sayıda test başarısız oldu. Sorun giderme rehberini takip edin ve testleri tekrarlayın.</p>
                </div>
            `;
        }
    } 
   /**
     * Action methods
     */

    /**
     * Pause testing
     */
    pauseTesting() {
        if (!this.isTesting) return;
        
        this.testProgress.status = 'paused';
        this.logTestMessage('Test süreci duraklatıldı', 'warning');
        this.showToast('Test süreci duraklatıldı', 'warning');
    }

    /**
     * Stop testing
     */
    stopTesting() {
        if (!this.isTesting) return;

        if (confirm('Test sürecini durdurmak istediğinizden emin misiniz? İlerleme kaybedilecek.')) {
            this.isTesting = false;
            this.testProgress.status = 'stopped';
            this.showTestProgress(false);
            this.updateTestActionButtons(false);
            this.logTestMessage('Test süreci durduruldu', 'error');
            this.showToast('Test süreci durduruldu', 'error');
        }
    }

    /**
     * Retry current test
     */
    async retryCurrentTest() {
        if (!this.testProgress.currentDevice) return;

        const address = this.testProgress.currentDevice.newAddress;
        this.logTestMessage(`Mevcut test tekrarlanıyor: Adres ${address}`, 'info');
        
        await this.retryDeviceTests(address);
    }

    /**
     * Skip failed tests
     */
    skipFailedTests() {
        if (confirm('Başarısız testleri atlamak istediğinizden emin misiniz? Bu testler tamamlanmamış olarak işaretlenecek.')) {
            this.logTestMessage('Başarısız testler atlandı', 'warning');
            this.showToast('Başarısız testler atlandı', 'warning');
            
            // Mark as complete even with failures
            this.onStateChange(this.testResults, true);
        }
    }

    /**
     * Show device test details
     */
    showDeviceTestDetails(address) {
        const testSuite = this.testSuites.get(address);
        if (!testSuite) {
            this.showToast('Bu cihaz için test sonucu bulunamadı', 'warning');
            return;
        }

        const modal = this.createModal(
            `Cihaz Test Detayları - Adres ${address}`,
            this.renderDeviceTestDetailsContent(testSuite),
            'info'
        );

        modal.show();
    }

    /**
     * Show detailed troubleshooting
     */
    showDetailedTroubleshooting() {
        const troubleshootingContent = `
            <div class="detailed-troubleshooting">
                <h5>Detaylı Sorun Giderme Rehberi</h5>
                
                <div class="accordion" id="troubleshootingAccordion">
                    <div class="accordion-item">
                        <h2 class="accordion-header">
                            <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#commTroubleshooting">
                                İletişim Sorunları
                            </button>
                        </h2>
                        <div id="commTroubleshooting" class="accordion-collapse collapse show">
                            <div class="accordion-body">
                                <ol>
                                    <li>USB-RS485 adaptörünün bilgisayara doğru takıldığından emin olun</li>
                                    <li>Cihaz Yöneticisi'nden COM port'unun tanındığını kontrol edin</li>
                                    <li>Modbus kablolarının A-A, B-B şeklinde bağlandığını kontrol edin</li>
                                    <li>Kablo uzunluğunun 1200m'den az olduğunu kontrol edin</li>
                                    <li>Baud rate ayarlarının 9600 olduğunu kontrol edin</li>
                                </ol>
                            </div>
                        </div>
                    </div>
                    
                    <div class="accordion-item">
                        <h2 class="accordion-header">
                            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#relayTroubleshooting">
                                Röle Sorunları
                            </button>
                        </h2>
                        <div id="relayTroubleshooting" class="accordion-collapse collapse">
                            <div class="accordion-body">
                                <ol>
                                    <li>Röle kartının güç kaynağının bağlı ve çalışır durumda olduğunu kontrol edin</li>
                                    <li>Güç LED'inin yanıp yanmadığını kontrol edin</li>
                                    <li>Röle aktivasyonu sırasında fiziksel tık sesini dinleyin</li>
                                    <li>Röle çıkış terminallerinin doğru bağlandığını kontrol edin</li>
                                    <li>Yük bağlantılarını kontrol edin (varsa)</li>
                                </ol>
                            </div>
                        </div>
                    </div>
                    
                    <div class="accordion-item">
                        <h2 class="accordion-header">
                            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#addressTroubleshooting">
                                Adres Sorunları
                            </button>
                        </h2>
                        <div id="addressTroubleshooting" class="accordion-collapse collapse">
                            <div class="accordion-body">
                                <ol>
                                    <li>Slave adresinin doğru yapılandırıldığından emin olun</li>
                                    <li>Adres çakışması olmadığını kontrol edin</li>
                                    <li>Broadcast komutlarının doğru gönderildiğini kontrol edin</li>
                                    <li>Register 0x4000'den adres okumayı deneyin</li>
                                </ol>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="mt-3">
                    <button class="btn btn-primary" onclick="testingValidation.runDiagnostics()">
                        <i class="fas fa-stethoscope me-1"></i>Otomatik Tanılama Çalıştır
                    </button>
                </div>
            </div>
        `;

        const modal = this.createModal(
            'Detaylı Sorun Giderme',
            troubleshootingContent,
            'warning'
        );

        modal.show();
    }

    /**
     * Run automatic diagnostics
     */
    async runDiagnostics() {
        this.logTestMessage('Otomatik tanılama başlatıldı...', 'info');
        
        try {
            const response = await fetch('/api/hardware-config/run-diagnostics', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: wizard.sessionId,
                    devices: this.configuredDevices.map(d => d.newAddress)
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.logTestMessage('Otomatik tanılama tamamlandı', 'success');
                this.showToast('Tanılama sonuçları test günlüğünde görüntüleniyor', 'info');
                
                // Display diagnostic results
                result.diagnostics.forEach(diagnostic => {
                    this.logTestMessage(`Tanılama: ${diagnostic.message}`, diagnostic.type);
                });
            } else {
                this.logTestMessage(`Tanılama hatası: ${result.error}`, 'error');
            }

        } catch (error) {
            this.logTestMessage(`Tanılama hatası: ${error.message}`, 'error');
        }
    }   
 /**
     * Utility methods
     */

    /**
     * Create modal dialog
     */
    createModal(title, content, type = 'info') {
        const modalId = 'testingModal_' + Date.now();
        const iconClass = type === 'warning' ? 'fa-exclamation-triangle text-warning' : 
                         type === 'error' ? 'fa-times-circle text-danger' : 
                         'fa-info-circle text-info';

        const modalHtml = `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas ${iconClass} me-2"></i>${title}
                            </h5>
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
        const modal = new bootstrap.Modal(modalElement);

        // Clean up modal after hide
        modalElement.addEventListener('hidden.bs.modal', () => {
            modalElement.remove();
        });

        return modal;
    }

    /**
     * Render device test details content
     */
    renderDeviceTestDetailsContent(testSuite) {
        return `
            <div class="device-test-details">
                <div class="row mb-3">
                    <div class="col-md-3">
                        <div class="stat-card text-center">
                            <div class="stat-number text-primary">${testSuite.totalTests}</div>
                            <div class="stat-label">Toplam Test</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="stat-card text-center">
                            <div class="stat-number text-success">${testSuite.passedTests}</div>
                            <div class="stat-label">Başarılı</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="stat-card text-center">
                            <div class="stat-number text-danger">${testSuite.failedTests}</div>
                            <div class="stat-label">Başarısız</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="stat-card text-center">
                            <div class="stat-number text-info">${Math.round(testSuite.duration / 1000)}</div>
                            <div class="stat-label">Süre (sn)</div>
                        </div>
                    </div>
                </div>
                
                <h6>Test Sonuçları:</h6>
                <div class="test-results-detailed">
                    ${testSuite.results.map(result => `
                        <div class="card mb-2 ${result.success ? 'border-success' : 'border-danger'}">
                            <div class="card-body py-2">
                                <div class="row align-items-center">
                                    <div class="col-md-6">
                                        <strong>
                                            <i class="fas ${result.success ? 'fa-check text-success' : 'fa-times text-danger'} me-1"></i>
                                            ${result.testName}
                                        </strong>
                                    </div>
                                    <div class="col-md-3">
                                        <small class="text-muted">
                                            <i class="fas fa-clock me-1"></i>${result.duration}ms
                                        </small>
                                    </div>
                                    <div class="col-md-3 text-end">
                                        ${result.responseTime ? `<small class="text-info">${result.responseTime}ms yanıt</small>` : ''}
                                    </div>
                                </div>
                                <div class="mt-1">
                                    <small class="text-muted">${result.details}</small>
                                </div>
                                ${result.error ? `<div class="mt-1"><small class="text-danger"><i class="fas fa-exclamation-triangle me-1"></i>${result.error}</small></div>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Update test status (called periodically)
     */
    updateTestStatus() {
        // Update counters and progress
        this.updateTestCounters();
        
        // Check if any tests are still running
        if (this.isTesting && this.testProgress.status === 'running') {
            // Update progress display
            this.updateProgressDisplay();
        }
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        // Use the wizard's toast method if available
        if (wizard && wizard.showToast) {
            wizard.showToast(message, type);
        } else {
            // Fallback to console log
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        this.showToast(message, 'error');
        this.logTestMessage(`Hata: ${message}`, 'error');
    }

    /**
     * Delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get current state for wizard
     */
    getState() {
        return {
            testResults: this.testResults,
            testSuites: Array.from(this.testSuites.entries()),
            isComplete: this.testResults.length > 0,
            overallSuccess: this.testResults.length > 0 && this.testResults.every(r => r.success)
        };
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }
        
        // Remove event listeners
        document.removeEventListener('keydown', this.keydownHandler);
    }
}

// Global variable for component access
let testingValidation;