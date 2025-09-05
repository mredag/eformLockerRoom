/**
 * Hardware Configuration Wizard - Main Container Logic
 * Implements step navigation, progress tracking, and state management
 * with accessibility features and responsive design
 */

class HardwareWizard {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 5;
        this.sessionId = null;
        this.wizardData = {
            checklist: {},
            detectedDevices: [],
            configuredAddresses: [],
            testResults: [],
            integrationStatus: null
        };
        
        this.init();
    }

    /**
     * Initialize the wizard
     */
    async init() {
        try {
            // Create wizard session
            await this.createWizardSession();
            
            // Initialize step content
            this.initializeStepContent();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Update navigation
            this.updateNavigation();
            
            // Update progress
            this.updateProgress();
            
            console.log('Hardware Wizard initialized successfully');
        } catch (error) {
            console.error('Failed to initialize wizard:', error);
            this.showToast('Sihirbaz başlatılamadı: ' + error.message, 'error');
        }
    }

    /**
     * Create a new wizard session
     */
    async createWizardSession() {
        try {
            const response = await fetch('/api/wizard/session/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });

            if (!response.ok) {
                console.warn('Failed to create wizard session via API, using fallback');
                // Use a fallback session ID for offline mode
                this.sessionId = 'offline-' + Date.now();
                console.log('Wizard session created (offline):', this.sessionId);
                return;
            }

            const data = await response.json();
            this.sessionId = data.sessionId || data.session?.sessionId || data.session?.session_id;
            
            if (!this.sessionId) {
                console.warn('No session ID in response, using fallback');
                this.sessionId = 'fallback-' + Date.now();
            }
            
            console.log('Wizard session created:', this.sessionId);
        } catch (error) {
            console.error('Error creating wizard session:', error);
            // Use a fallback session ID for offline mode
            this.sessionId = 'offline-' + Date.now();
            console.log('Wizard session created (offline):', this.sessionId);
        }
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft' && !document.getElementById('prevBtn').disabled) {
                this.previousStep();
            } else if (e.key === 'ArrowRight' && !document.getElementById('nextBtn').disabled) {
                this.nextStep();
            } else if (e.key === 'Escape') {
                this.cancelWizard();
            }
        });

        // Step circle clicks
        document.querySelectorAll('.step').forEach(step => {
            step.addEventListener('click', (e) => {
                const stepNumber = parseInt(step.dataset.step);
                if (this.canNavigateToStep(stepNumber)) {
                    this.goToStep(stepNumber);
                }
            });

            // Keyboard support for step circles
            step.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const stepNumber = parseInt(step.dataset.step);
                    if (this.canNavigateToStep(stepNumber)) {
                        this.goToStep(stepNumber);
                    }
                }
            });
        });

        // Window beforeunload to warn about unsaved changes
        window.addEventListener('beforeunload', (e) => {
            if (this.currentStep > 1 && this.currentStep < this.totalSteps) {
                e.preventDefault();
                e.returnValue = 'Sihirbazdan çıkmak istediğinizden emin misiniz? Yapılan değişiklikler kaybolabilir.';
            }
        });
    }

    /**
     * Initialize content for each step
     */
    initializeStepContent() {
        this.initializeStep1(); // Pre-setup checklist
        // Other steps will be initialized when navigated to
    }

    /**
     * Initialize Step 1: Pre-Setup Checklist
     */
    initializeStep1() {
        // Initialize the enhanced checklist component
        preSetupChecklist = new PreSetupChecklist('checklistItems', (state, isComplete) => {
            // Update wizard data
            this.wizardData.checklist = state;
            
            // Update navigation
            this.updateNavigation();
            
            // Log state change
            console.log('Checklist state updated:', { 
                completed: Object.values(state).filter(item => item.completed).length,
                required: Object.values(state).filter(item => item.required).length,
                isComplete 
            });
        });

        // Initialize wizard checklist data
        this.wizardData.checklist = preSetupChecklist.getState();
    }



    /**
     * Check if all required checklist items are completed
     */
    isStep1Complete() {
        return Object.entries(this.wizardData.checklist)
            .filter(([_, item]) => item.required)
            .every(([_, item]) => item.completed);
    }

    /**
     * Initialize Step 2: Device Detection
     */
    async initializeStep2() {
        if (this.currentStep !== 2) return;

        try {
            // Initialize the device detection component
            deviceDetection = new DeviceDetection('detectedDevices', (scanResults, isComplete) => {
                // Update wizard data
                this.wizardData.detectedDevices = scanResults.newDevices || [];
                this.wizardData.scanResults = scanResults;
                
                // Update navigation
                this.updateNavigation();
                
                // Log state change
                console.log('Device detection state updated:', { 
                    newDevices: scanResults.newDevices?.length || 0,
                    totalDevices: scanResults.detectedDevices?.length || 0,
                    serialPorts: scanResults.serialPorts?.length || 0,
                    isComplete 
                });
            });
        } catch (error) {
            console.error('Error initializing step 2:', error);
            this.showError('Cihaz tespiti başlatılamadı: ' + error.message);
        }
    }



    /**
     * Navigate to next step
     */
    async nextStep() {
        // If we're on the final step and integration is complete, finish the wizard
        if (this.currentStep >= this.totalSteps) {
            if (this.wizardData.integrationStatus?.overallStatus === 'completed') {
                await this.completeWizard();
                return;
            } else {
                return;
            }
        }

        // Validate current step
        if (!await this.validateCurrentStep()) {
            return;
        }

        // Skip step completion for now to avoid API errors
        // await this.executeStepCompletion(this.currentStep);

        // Move to next step
        this.currentStep++;
        this.goToStep(this.currentStep);
    }

    /**
     * Navigate to previous step
     */
    previousStep() {
        if (this.currentStep <= 1) return;
        
        this.currentStep--;
        this.goToStep(this.currentStep);
    }

    /**
     * Go to specific step
     */
    async goToStep(stepNumber) {
        if (stepNumber < 1 || stepNumber > this.totalSteps) return;
        if (!this.canNavigateToStep(stepNumber)) return;

        // Hide current step
        document.querySelectorAll('.step-content').forEach(content => {
            content.classList.remove('active');
        });

        // Show target step
        document.getElementById(`step${stepNumber}`).classList.add('active');

        // Update step indicators
        this.updateStepIndicators(stepNumber);

        // Update progress
        this.updateProgress();

        // Update navigation
        this.updateNavigation();

        // Initialize step content if needed
        await this.initializeStepIfNeeded(stepNumber);

        // Update current step
        this.currentStep = stepNumber;

        // Announce step change to screen readers
        this.announceToScreenReader(`Adım ${stepNumber} aktif`);

        // Focus management for accessibility
        document.getElementById(`step${stepNumber}`).focus();
    }

    /**
     * Check if navigation to step is allowed
     */
    canNavigateToStep(stepNumber) {
        // Can always go back to completed steps
        if (stepNumber < this.currentStep) return true;
        
        // Can go to next step only if current step is valid
        if (stepNumber === this.currentStep + 1) {
            return this.isCurrentStepValid();
        }
        
        // Cannot skip steps
        return stepNumber === this.currentStep;
    }

    /**
     * Check if current step is valid
     */
    isCurrentStepValid() {
        switch (this.currentStep) {
            case 1:
                return this.isStep1Complete();
            case 2:
                return this.wizardData.detectedDevices.length > 0;
            case 3:
                return this.isStep3Complete();
            case 4:
                return this.wizardData.testResults.length > 0 && 
                       this.wizardData.testResults.every(result => result.success);
            case 5:
                return this.wizardData.integrationStatus?.overallStatus === 'completed';
            default:
                return false;
        }
    }

    /**
     * Check if Step 3 (Address Configuration) is complete
     */
    isStep3Complete() {
        const configuredAddresses = this.wizardData.configuredAddresses || [];
        
        // Must have at least one configured address
        if (configuredAddresses.length === 0) return false;
        
        // All configurations must be successful
        const allSuccessful = configuredAddresses.every(result => result.success);
        
        // At least one should be verified (optional but recommended)
        const hasVerified = configuredAddresses.some(result => result.verified);
        
        return allSuccessful && hasVerified;
    }

    /**
     * Validate current step
     */
    async validateCurrentStep() {
        try {
            // Skip validation if no session ID
            if (!this.sessionId) {
                console.warn('No session ID available for validation');
                return true;
            }
            
            // For now, return true as validation logic will be implemented later
            // This allows the wizard to progress through steps
            return true;
        } catch (error) {
            console.error('Step validation error:', error);
            this.showError('Adım doğrulaması sırasında hata: ' + error.message);
            return false;
        }
    }

    /**
     * Execute step completion
     */
    async executeStepCompletion(stepNumber) {
        try {
            // Skip execution if no session ID
            if (!this.sessionId) {
                console.warn('No session ID available for step completion');
                return;
            }
            
            // For now, just log the step completion
            console.log(`Step ${stepNumber} completed with data:`, this.wizardData);
            
            // In the future, this will call the appropriate API endpoint
            // based on the step number (detect-hardware, configure-addresses, etc.)
            
        } catch (error) {
            console.error('Step execution error:', error);
            this.showError('Adım tamamlama sırasında hata: ' + error.message);
            throw error;
        }
    }

    /**
     * Initialize step content if needed
     */
    async initializeStepIfNeeded(stepNumber) {
        switch (stepNumber) {
            case 2:
                await this.initializeStep2();
                break;
            case 3:
                await this.initializeStep3();
                break;
            case 4:
                await this.initializeStep4();
                break;
            case 5:
                await this.initializeStep5();
                break;
        }
    }

    /**
     * Initialize Step 4: Testing and Validation
     */
    async initializeStep4() {
        if (this.currentStep !== 4) return;

        try {
            // Initialize the testing and validation component
            testingValidation = new TestingValidation('testingValidation', (testResults, isComplete) => {
                // Update wizard data
                this.wizardData.testResults = testResults || [];
                
                // Update navigation
                this.updateNavigation();
                
                // Log state change
                console.log('Testing validation state updated:', { 
                    totalTests: testResults?.length || 0,
                    passedTests: testResults?.filter(r => r.success).length || 0,
                    failedTests: testResults?.filter(r => !r.success).length || 0,
                    isComplete 
                });
            });
        } catch (error) {
            console.error('Error initializing step 4:', error);
            this.showError('Test ve doğrulama adımı başlatılamadı: ' + error.message);
        }
    }

    /**
     * Initialize Step 5: System Integration
     */
    async initializeStep5() {
        if (this.currentStep !== 5) return;

        try {
            // Initialize the system integration component
            systemIntegration = new SystemIntegration('integrationStatus', (integrationData, isComplete) => {
                // Update wizard data
                this.wizardData.integrationStatus = integrationData;
                
                // Update navigation
                this.updateNavigation();
                
                // Log state change
                console.log('System integration state updated:', { 
                    configuredDevices: integrationData.configuredDevices?.length || 0,
                    newLockerRanges: integrationData.newLockerRanges?.length || 0,
                    overallStatus: integrationData.overallStatus,
                    isComplete 
                });
            });
        } catch (error) {
            console.error('Error initializing step 5:', error);
            this.showError('Sistem entegrasyonu adımı başlatılamadı: ' + error.message);
        }
    }

    /**
     * Initialize Step 3: Address Configuration
     */
    async initializeStep3() {
        if (this.currentStep !== 3) return;

        try {
            // Initialize the address configuration component
            addressConfiguration = new AddressConfiguration('addressConfiguration', (configResults, isComplete) => {
                // Update wizard data
                this.wizardData.configuredAddresses = configResults || [];
                
                // Update navigation
                this.updateNavigation();
                
                // Log state change
                console.log('Address configuration state updated:', { 
                    configuredDevices: configResults?.filter(r => r.success).length || 0,
                    totalDevices: configResults?.length || 0,
                    allVerified: configResults?.every(r => r.verified) || false,
                    isComplete 
                });
            });
        } catch (error) {
            console.error('Error initializing step 3:', error);
            this.showError('Adres yapılandırması başlatılamadı: ' + error.message);
        }
    }

    /**
     * Update step indicators
     */
    updateStepIndicators(currentStep) {
        document.querySelectorAll('.step').forEach((step, index) => {
            const stepNumber = index + 1;
            const circle = step.querySelector('.step-circle');
            
            step.classList.remove('active', 'completed', 'pending');
            
            if (stepNumber < currentStep) {
                step.classList.add('completed');
                circle.innerHTML = '<i class="fas fa-check"></i>';
            } else if (stepNumber === currentStep) {
                step.classList.add('active');
                circle.textContent = stepNumber;
            } else {
                step.classList.add('pending');
                circle.textContent = stepNumber;
            }
        });
    }

    /**
     * Update progress bar
     */
    updateProgress() {
        const progressLine = document.getElementById('progressLine');
        const progressPercentage = ((this.currentStep - 1) / (this.totalSteps - 1)) * 100;
        progressLine.style.width = `${progressPercentage}%`;
    }

    /**
     * Update navigation buttons
     */
    updateNavigation() {
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');

        // Previous button
        prevBtn.disabled = this.currentStep <= 1;

        // Next button
        if (this.currentStep >= this.totalSteps) {
            if (this.wizardData.integrationStatus?.overallStatus === 'completed') {
                nextBtn.innerHTML = '<i class="fas fa-check me-1"></i>Sihirbazı Tamamla';
                nextBtn.disabled = false;
            } else {
                nextBtn.innerHTML = '<i class="fas fa-check me-1"></i>Tamamla';
                nextBtn.disabled = !this.isCurrentStepValid();
            }
        } else {
            nextBtn.innerHTML = 'Sonraki <i class="fas fa-arrow-right ms-1"></i>';
            nextBtn.disabled = !this.isCurrentStepValid();
        }
    }

    /**
     * Complete wizard
     */
    async completeWizard() {
        try {
            const response = await fetch(`/api/wizard/session/${this.sessionId}/complete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: this.sessionId
                })
            });

            if (!response.ok) {
                throw new Error('Failed to finalize wizard');
            }

            const result = await response.json();
            
            if (result.success) {
                this.showToast('Sihirbaz başarıyla tamamlandı!', 'success');
                
                // Wait a moment for the user to see the success message
                setTimeout(() => {
                    window.location.href = '/hardware-config';
                }, 2000);
            } else {
                throw new Error(result.error || 'Wizard finalization failed');
            }

        } catch (error) {
            console.error('Error completing wizard:', error);
            this.showError('Sihirbaz tamamlama sırasında hata: ' + error.message);
        }
    }

    /**
     * Cancel wizard
     */
    async cancelWizard() {
        if (confirm('Sihirbazdan çıkmak istediğinizden emin misiniz? Yapılan değişiklikler kaybolacak.')) {
            try {
                if (this.sessionId) {
                    await fetch(`/api/wizard/session/${this.sessionId}/cancel`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            sessionId: this.sessionId
                        })
                    });
                }
                
                // Redirect to hardware config page
                window.location.href = '/hardware-config';
            } catch (error) {
                console.error('Error canceling wizard:', error);
                // Still redirect even if cancel request fails
                window.location.href = '/hardware-config';
            }
        }
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const toastBody = document.getElementById('toastBody');
        
        toastBody.textContent = message;
        
        // Update toast styling based on type
        toast.className = `toast ${type === 'error' ? 'bg-danger text-white' : ''}`;
        
        // Simple toast show without Bootstrap
        toast.style.display = 'block';
        toast.classList.add('show');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            toast.style.display = 'none';
            toast.classList.remove('show');
        }, 5000);
    }

    /**
     * Show error message
     */
    showError(message) {
        this.showToast(message, 'error');
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
}

// Initialize wizard when DOM is loaded
let wizard;
document.addEventListener('DOMContentLoaded', function() {
    wizard = new HardwareWizard();
});

// Global functions for HTML event handlers

function nextStep() {
    wizard.nextStep();
}

function previousStep() {
    wizard.previousStep();
}

function cancelWizard() {
    wizard.cancelWizard();
}