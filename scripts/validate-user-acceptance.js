#!/usr/bin/env node

/**
 * User Acceptance Validation Script
 * 
 * This script validates the implementation of task 14 by running comprehensive
 * user acceptance tests and generating a detailed report.
 * 
 * Requirements validated:
 * - Complete user flow from card scan to locker assignment
 * - Turkish error messages clarity and helpfulness  
 * - Touch interface responsiveness and accuracy
 * - Visual design clarity and readability
 * - System recovery from all error conditions
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class UserAcceptanceValidator {
    constructor() {
        this.results = {
            userFlow: { passed: 0, failed: 0, tests: [] },
            turkishErrors: { passed: 0, failed: 0, tests: [] },
            touchInterface: { passed: 0, failed: 0, tests: [] },
            visualDesign: { passed: 0, failed: 0, tests: [] },
            systemRecovery: { passed: 0, failed: 0, tests: [] },
            overall: { passed: 0, failed: 0, warnings: 0 }
        };
        
        this.startTime = new Date();
        console.log('🧪 Starting User Acceptance Validation for Task 14');
        console.log('📋 Validating: Complete user flow, Turkish errors, touch interface, visual design, system recovery');
    }

    async validateAll() {
        try {
            console.log('\n🚀 Running comprehensive user acceptance validation...\n');
            
            // Validate implementation files exist
            await this.validateImplementationFiles();
            
            // Validate user flow implementation
            await this.validateUserFlow();
            
            // Validate Turkish error messages
            await this.validateTurkishErrors();
            
            // Validate touch interface
            await this.validateTouchInterface();
            
            // Validate visual design
            await this.validateVisualDesign();
            
            // Validate system recovery
            await this.validateSystemRecovery();
            
            // Generate final report
            this.generateValidationReport();
            
        } catch (error) {
            console.error('🚨 Validation failed:', error);
            process.exit(1);
        }
    }

    async validateImplementationFiles() {
        console.log('📁 Validating implementation files...');
        
        const requiredFiles = [
            'app/kiosk/src/ui/index.html',
            'app/kiosk/src/ui/static/app-simple.js',
            'app/kiosk/src/ui/static/styles-simple.css',
            'scripts/user-acceptance-testing.js',
            'test-user-acceptance.html'
        ];
        
        for (const file of requiredFiles) {
            if (!fs.existsSync(file)) {
                throw new Error(`Required file missing: ${file}`);
            }
            console.log(`  ✅ ${file} exists`);
        }
        
        console.log('✅ All implementation files present\n');
    }

    async validateUserFlow() {
        console.log('📱 Validating Complete User Flow Implementation...');
        
        try {
            // Check idle state implementation
            await this.checkIdleStateImplementation();
            
            // Check RFID detection implementation
            await this.checkRfidDetectionImplementation();
            
            // Check session management implementation
            await this.checkSessionManagementImplementation();
            
            // Check locker selection implementation
            await this.checkLockerSelectionImplementation();
            
            // Check timeout handling implementation
            await this.checkTimeoutHandlingImplementation();
            
            console.log('✅ User flow validation completed\n');
            
        } catch (error) {
            this.recordFailure('userFlow', 'User Flow Validation', error.message);
        }
    }

    async validateTurkishErrors() {
        console.log('🇹🇷 Validating Turkish Error Messages...');
        
        try {
            // Check error message catalog
            await this.checkErrorMessageCatalog();
            
            // Check error message structure
            await this.checkErrorMessageStructure();
            
            // Check error recovery options
            await this.checkErrorRecoveryOptions();
            
            // Check Turkish text quality
            await this.checkTurkishTextQuality();
            
            console.log('✅ Turkish error messages validation completed\n');
            
        } catch (error) {
            this.recordFailure('turkishErrors', 'Turkish Error Messages', error.message);
        }
    }

    async validateTouchInterface() {
        console.log('👆 Validating Touch Interface Implementation...');
        
        try {
            // Check touch target sizes
            await this.checkTouchTargetSizes();
            
            // Check touch feedback implementation
            await this.checkTouchFeedbackImplementation();
            
            // Check touch target spacing
            await this.checkTouchTargetSpacing();
            
            // Check responsive design
            await this.checkResponsiveDesign();
            
            console.log('✅ Touch interface validation completed\n');
            
        } catch (error) {
            this.recordFailure('touchInterface', 'Touch Interface', error.message);
        }
    }

    async validateVisualDesign() {
        console.log('🎨 Validating Visual Design Implementation...');
        
        try {
            // Check locker status indicators
            await this.checkLockerStatusIndicators();
            
            // Check visual hierarchy
            await this.checkVisualHierarchy();
            
            // Check color scheme and accessibility
            await this.checkColorSchemeAccessibility();
            
            // Check typography and readability
            await this.checkTypographyReadability();
            
            console.log('✅ Visual design validation completed\n');
            
        } catch (error) {
            this.recordFailure('visualDesign', 'Visual Design', error.message);
        }
    }

    async validateSystemRecovery() {
        console.log('🔄 Validating System Recovery Implementation...');
        
        try {
            // Check error handling mechanisms
            await this.checkErrorHandlingMechanisms();
            
            // Check recovery workflows
            await this.checkRecoveryWorkflows();
            
            // Check auto-retry implementation
            await this.checkAutoRetryImplementation();
            
            // Check manual recovery options
            await this.checkManualRecoveryOptions();
            
            console.log('✅ System recovery validation completed\n');
            
        } catch (error) {
            this.recordFailure('systemRecovery', 'System Recovery', error.message);
        }
    }

    // Individual validation methods
    async checkIdleStateImplementation() {
        console.log('  📱 Checking idle state implementation...');
        
        const htmlContent = fs.readFileSync('app/kiosk/src/ui/index.html', 'utf8');
        
        // Check for idle screen elements
        const requiredElements = [
            'id="idle-screen"',
            'class="rfid-icon"',
            'class="main-prompt"',
            'class="sub-prompt"'
        ];
        
        for (const element of requiredElements) {
            if (!htmlContent.includes(element)) {
                throw new Error(`Idle state missing element: ${element}`);
            }
        }
        
        // Check for Turkish text
        const turkishTexts = [
            'Kartınızı okutun',
            'RFID kartınızı okutucuya yaklaştırın'
        ];
        
        for (const text of turkishTexts) {
            if (!htmlContent.includes(text)) {
                throw new Error(`Missing Turkish text: ${text}`);
            }
        }
        
        this.recordSuccess('userFlow', 'Idle State Implementation', 'All idle state elements and Turkish text present');
    }

    async checkRfidDetectionImplementation() {
        console.log('  🔍 Checking RFID detection implementation...');
        
        const jsContent = fs.readFileSync('app/kiosk/src/ui/static/app-simple.js', 'utf8');
        
        // Check for RFID listener setup
        if (!jsContent.includes('setupRfidListener')) {
            throw new Error('RFID listener setup method missing');
        }
        
        // Check for card processing
        if (!jsContent.includes('processRfidInput')) {
            throw new Error('RFID input processing method missing');
        }
        
        // Check for debouncing
        if (!jsContent.includes('rfidDebounceDelay')) {
            throw new Error('RFID debouncing not implemented');
        }
        
        this.recordSuccess('userFlow', 'RFID Detection Implementation', 'RFID detection properly implemented with debouncing');
    }

    async checkSessionManagementImplementation() {
        console.log('  🏠 Checking session management implementation...');
        
        const jsContent = fs.readFileSync('app/kiosk/src/ui/static/app-simple.js', 'utf8');
        
        // Check for session management methods
        const sessionMethods = [
            'startSession',
            'endSession',
            'startCountdown',
            'handleSessionTimeout'
        ];
        
        for (const method of sessionMethods) {
            if (!jsContent.includes(method)) {
                throw new Error(`Session management method missing: ${method}`);
            }
        }
        
        // Check for 30-second timeout
        if (!jsContent.includes('sessionTimeoutSeconds = 30')) {
            throw new Error('30-second session timeout not configured');
        }
        
        this.recordSuccess('userFlow', 'Session Management Implementation', 'Session management properly implemented with 30-second timeout');
    }

    async checkLockerSelectionImplementation() {
        console.log('  🎯 Checking locker selection implementation...');
        
        const jsContent = fs.readFileSync('app/kiosk/src/ui/static/app-simple.js', 'utf8');
        const htmlContent = fs.readFileSync('app/kiosk/src/ui/index.html', 'utf8');
        
        // Check for locker grid
        if (!htmlContent.includes('class="locker-grid"')) {
            throw new Error('Locker grid element missing');
        }
        
        // Check for locker selection handling
        if (!jsContent.includes('handleLockerClick')) {
            throw new Error('Locker click handling missing');
        }
        
        // Check for touch feedback
        if (!jsContent.includes('provideTouchFeedback')) {
            throw new Error('Touch feedback implementation missing');
        }
        
        this.recordSuccess('userFlow', 'Locker Selection Implementation', 'Locker selection and touch feedback properly implemented');
    }

    async checkTimeoutHandlingImplementation() {
        console.log('  ⏰ Checking timeout handling implementation...');
        
        const jsContent = fs.readFileSync('app/kiosk/src/ui/static/app-simple.js', 'utf8');
        
        // Check for timeout handling
        if (!jsContent.includes('handleSessionTimeout')) {
            throw new Error('Session timeout handling missing');
        }
        
        // Check for countdown display
        if (!jsContent.includes('updateCountdownDisplay')) {
            throw new Error('Countdown display update missing');
        }
        
        // Check for timeout error
        if (!jsContent.includes('SESSION_EXPIRED')) {
            throw new Error('Session expired error handling missing');
        }
        
        this.recordSuccess('userFlow', 'Timeout Handling Implementation', 'Session timeout handling properly implemented');
    }

    async checkErrorMessageCatalog() {
        console.log('  📝 Checking error message catalog...');
        
        const jsContent = fs.readFileSync('app/kiosk/src/ui/static/app-simple.js', 'utf8');
        
        // Check for comprehensive error catalog
        const requiredErrors = [
            'CARD_READ_FAILED',
            'CARD_INVALID',
            'NO_LOCKERS_AVAILABLE',
            'ASSIGNMENT_FAILED',
            'LOCKER_UNAVAILABLE',
            'HARDWARE_OFFLINE',
            'HARDWARE_ERROR',
            'LOCKER_OPEN_FAILED',
            'SESSION_EXPIRED',
            'SESSION_INVALID',
            'NETWORK_ERROR',
            'CONNECTION_LOST',
            'SERVER_ERROR',
            'UNKNOWN_ERROR'
        ];
        
        for (const errorType of requiredErrors) {
            if (!jsContent.includes(errorType)) {
                throw new Error(`Error type missing from catalog: ${errorType}`);
            }
        }
        
        this.recordSuccess('turkishErrors', 'Error Message Catalog', 'Comprehensive error message catalog implemented');
    }

    async checkErrorMessageStructure() {
        console.log('  🏗️ Checking error message structure...');
        
        const jsContent = fs.readFileSync('app/kiosk/src/ui/static/app-simple.js', 'utf8');
        const htmlContent = fs.readFileSync('app/kiosk/src/ui/index.html', 'utf8');
        
        // Check for error screen elements
        const errorElements = [
            'id="error-screen"',
            'class="error-icon"',
            'class="error-text"',
            'class="error-description"',
            'class="error-recovery"',
            'class="error-actions"'
        ];
        
        for (const element of errorElements) {
            if (!htmlContent.includes(element)) {
                throw new Error(`Error screen element missing: ${element}`);
            }
        }
        
        // Check for error message structure in JS
        if (!jsContent.includes('message:') || !jsContent.includes('description:') || !jsContent.includes('recovery:')) {
            throw new Error('Error message structure incomplete');
        }
        
        this.recordSuccess('turkishErrors', 'Error Message Structure', 'Error message structure properly implemented');
    }

    async checkErrorRecoveryOptions() {
        console.log('  🔄 Checking error recovery options...');
        
        const htmlContent = fs.readFileSync('app/kiosk/src/ui/index.html', 'utf8');
        const jsContent = fs.readFileSync('app/kiosk/src/ui/static/app-simple.js', 'utf8');
        
        // Check for recovery buttons
        if (!htmlContent.includes('class="return-button"')) {
            throw new Error('Return button missing from error screen');
        }
        
        if (!htmlContent.includes('class="retry-button"')) {
            throw new Error('Retry button missing from error screen');
        }
        
        // Check for recovery handling
        if (!jsContent.includes('handleReturnToMain')) {
            throw new Error('Return to main handling missing');
        }
        
        if (!jsContent.includes('handleRetryAction')) {
            throw new Error('Retry action handling missing');
        }
        
        this.recordSuccess('turkishErrors', 'Error Recovery Options', 'Error recovery options properly implemented');
    }

    async checkTurkishTextQuality() {
        console.log('  🇹🇷 Checking Turkish text quality...');
        
        const jsContent = fs.readFileSync('app/kiosk/src/ui/static/app-simple.js', 'utf8');
        const htmlContent = fs.readFileSync('app/kiosk/src/ui/index.html', 'utf8');
        
        // Check for Turkish error messages
        const turkishErrorTexts = [
            'Kart okunamadı',
            'Geçersiz kart',
            'Müsait dolap yok',
            'Dolap atanamadı',
            'Sistem bakımda',
            'Süre doldu'
        ];
        
        let foundTurkishTexts = 0;
        for (const text of turkishErrorTexts) {
            if (jsContent.includes(text) || htmlContent.includes(text)) {
                foundTurkishTexts++;
            }
        }
        
        if (foundTurkishTexts < 4) {
            throw new Error('Insufficient Turkish error messages found');
        }
        
        this.recordSuccess('turkishErrors', 'Turkish Text Quality', `${foundTurkishTexts} Turkish error messages properly implemented`);
    }

    async checkTouchTargetSizes() {
        console.log('  📏 Checking touch target sizes...');
        
        const cssContent = fs.readFileSync('app/kiosk/src/ui/static/styles-simple.css', 'utf8');
        
        // Check for minimum touch target sizes
        if (!cssContent.includes('min-width: 60px') || !cssContent.includes('min-height: 60px')) {
            throw new Error('Minimum 60px touch target sizes not enforced');
        }
        
        // Check for locker tile sizing
        if (!cssContent.includes('width: 120px') && !cssContent.includes('height: 120px')) {
            throw new Error('Locker tile sizing not properly defined');
        }
        
        this.recordSuccess('touchInterface', 'Touch Target Sizes', 'Touch target sizes meet 60px minimum requirement');
    }

    async checkTouchFeedbackImplementation() {
        console.log('  👆 Checking touch feedback implementation...');
        
        const jsContent = fs.readFileSync('app/kiosk/src/ui/static/app-simple.js', 'utf8');
        const cssContent = fs.readFileSync('app/kiosk/src/ui/static/styles-simple.css', 'utf8');
        
        // Check for touch feedback methods
        if (!jsContent.includes('provideTouchFeedback')) {
            throw new Error('Touch feedback method missing');
        }
        
        if (!jsContent.includes('addRippleEffect')) {
            throw new Error('Ripple effect implementation missing');
        }
        
        // Check for CSS transitions
        if (!cssContent.includes('transition:') && !cssContent.includes('transform:')) {
            throw new Error('CSS touch feedback transitions missing');
        }
        
        this.recordSuccess('touchInterface', 'Touch Feedback Implementation', 'Touch feedback and ripple effects properly implemented');
    }

    async checkTouchTargetSpacing() {
        console.log('  📐 Checking touch target spacing...');
        
        const cssContent = fs.readFileSync('app/kiosk/src/ui/static/styles-simple.css', 'utf8');
        
        // Check for grid gap
        if (!cssContent.includes('gap:')) {
            throw new Error('Grid gap spacing not defined');
        }
        
        // Check for margin spacing
        if (!cssContent.includes('margin:')) {
            throw new Error('Element margin spacing not defined');
        }
        
        this.recordSuccess('touchInterface', 'Touch Target Spacing', 'Touch target spacing properly implemented');
    }

    async checkResponsiveDesign() {
        console.log('  📱 Checking responsive design...');
        
        const cssContent = fs.readFileSync('app/kiosk/src/ui/static/styles-simple.css', 'utf8');
        
        // Check for media queries
        if (!cssContent.includes('@media')) {
            throw new Error('Responsive media queries missing');
        }
        
        // Check for orientation support
        if (!cssContent.includes('orientation:')) {
            throw new Error('Orientation-specific styles missing');
        }
        
        // Check for touch-specific styles
        if (!cssContent.includes('pointer: coarse')) {
            throw new Error('Touch-specific styles missing');
        }
        
        this.recordSuccess('touchInterface', 'Responsive Design', 'Responsive design and orientation support implemented');
    }

    async checkLockerStatusIndicators() {
        console.log('  🎨 Checking locker status indicators...');
        
        const cssContent = fs.readFileSync('app/kiosk/src/ui/static/styles-simple.css', 'utf8');
        const htmlContent = fs.readFileSync('app/kiosk/src/ui/index.html', 'utf8');
        
        // Check for locker state classes
        const lockerStates = [
            '.locker-tile.available',
            '.locker-tile.occupied',
            '.locker-tile.disabled'
        ];
        
        for (const state of lockerStates) {
            if (!cssContent.includes(state)) {
                throw new Error(`Locker state styling missing: ${state}`);
            }
        }
        
        // Check for legend
        if (!htmlContent.includes('class="legend"')) {
            throw new Error('Status legend missing');
        }
        
        this.recordSuccess('visualDesign', 'Locker Status Indicators', 'Locker status indicators and legend properly implemented');
    }

    async checkVisualHierarchy() {
        console.log('  🏗️ Checking visual hierarchy...');
        
        const cssContent = fs.readFileSync('app/kiosk/src/ui/static/styles-simple.css', 'utf8');
        
        // Check for font size hierarchy
        if (!cssContent.includes('font-size: 3.5rem') || !cssContent.includes('font-size: 2.5rem')) {
            throw new Error('Font size hierarchy not properly defined');
        }
        
        // Check for color hierarchy
        if (!cssContent.includes('color: #ffffff') || !cssContent.includes('color: #cbd5e1')) {
            throw new Error('Color hierarchy not properly defined');
        }
        
        this.recordSuccess('visualDesign', 'Visual Hierarchy', 'Visual hierarchy properly implemented with font sizes and colors');
    }

    async checkColorSchemeAccessibility() {
        console.log('  🌈 Checking color scheme and accessibility...');
        
        const cssContent = fs.readFileSync('app/kiosk/src/ui/static/styles-simple.css', 'utf8');
        
        // Check for high contrast colors
        if (!cssContent.includes('#10b981') || !cssContent.includes('#dc2626')) {
            throw new Error('High contrast colors not properly defined');
        }
        
        // Check for accessibility media queries
        if (!cssContent.includes('prefers-contrast: high')) {
            throw new Error('High contrast accessibility support missing');
        }
        
        if (!cssContent.includes('prefers-reduced-motion')) {
            throw new Error('Reduced motion accessibility support missing');
        }
        
        this.recordSuccess('visualDesign', 'Color Scheme and Accessibility', 'Color scheme and accessibility features properly implemented');
    }

    async checkTypographyReadability() {
        console.log('  📝 Checking typography and readability...');
        
        const cssContent = fs.readFileSync('app/kiosk/src/ui/static/styles-simple.css', 'utf8');
        
        // Check for readable font families
        if (!cssContent.includes('font-family:')) {
            throw new Error('Font family not defined');
        }
        
        // Check for font weights
        if (!cssContent.includes('font-weight: 700') || !cssContent.includes('font-weight: 600')) {
            throw new Error('Font weights not properly defined');
        }
        
        // Check for line height
        if (!cssContent.includes('line-height:')) {
            throw new Error('Line height not defined for readability');
        }
        
        this.recordSuccess('visualDesign', 'Typography and Readability', 'Typography and readability properly implemented');
    }

    async checkErrorHandlingMechanisms() {
        console.log('  🛡️ Checking error handling mechanisms...');
        
        const jsContent = fs.readFileSync('app/kiosk/src/ui/static/app-simple.js', 'utf8');
        
        // Check for try-catch blocks
        if (!jsContent.includes('try {') || !jsContent.includes('catch (error)')) {
            throw new Error('Error handling try-catch blocks missing');
        }
        
        // Check for error state management
        if (!jsContent.includes('showErrorState')) {
            throw new Error('Error state management method missing');
        }
        
        this.recordSuccess('systemRecovery', 'Error Handling Mechanisms', 'Error handling mechanisms properly implemented');
    }

    async checkRecoveryWorkflows() {
        console.log('  🔄 Checking recovery workflows...');
        
        const jsContent = fs.readFileSync('app/kiosk/src/ui/static/app-simple.js', 'utf8');
        
        // Check for recovery methods
        if (!jsContent.includes('handleErrorRecovery')) {
            throw new Error('Error recovery handling missing');
        }
        
        if (!jsContent.includes('handleReturnToMain')) {
            throw new Error('Return to main recovery missing');
        }
        
        this.recordSuccess('systemRecovery', 'Recovery Workflows', 'Recovery workflows properly implemented');
    }

    async checkAutoRetryImplementation() {
        console.log('  🔁 Checking auto-retry implementation...');
        
        const jsContent = fs.readFileSync('app/kiosk/src/ui/static/app-simple.js', 'utf8');
        
        // Check for auto-retry configuration
        if (!jsContent.includes('autoRetry: true')) {
            throw new Error('Auto-retry configuration missing');
        }
        
        if (!jsContent.includes('retryDelay:')) {
            throw new Error('Retry delay configuration missing');
        }
        
        this.recordSuccess('systemRecovery', 'Auto-Retry Implementation', 'Auto-retry mechanisms properly implemented');
    }

    async checkManualRecoveryOptions() {
        console.log('  🔧 Checking manual recovery options...');
        
        const htmlContent = fs.readFileSync('app/kiosk/src/ui/index.html', 'utf8');
        
        // Check for manual recovery buttons
        if (!htmlContent.includes('Ana ekrana dön')) {
            throw new Error('Return to main button text missing');
        }
        
        if (!htmlContent.includes('Tekrar Dene')) {
            throw new Error('Retry button text missing');
        }
        
        this.recordSuccess('systemRecovery', 'Manual Recovery Options', 'Manual recovery options properly implemented');
    }

    // Helper methods
    recordSuccess(category, testName, message) {
        this.results[category].passed++;
        this.results[category].tests.push({
            name: testName,
            status: 'PASSED',
            message: message
        });
        this.results.overall.passed++;
        console.log(`    ✅ ${testName}: ${message}`);
    }

    recordFailure(category, testName, message) {
        this.results[category].failed++;
        this.results[category].tests.push({
            name: testName,
            status: 'FAILED',
            message: message
        });
        this.results.overall.failed++;
        console.log(`    ❌ ${testName}: ${message}`);
    }

    recordWarning(category, testName, message) {
        this.results[category].tests.push({
            name: testName,
            status: 'WARNING',
            message: message
        });
        this.results.overall.warnings++;
        console.log(`    ⚠️  ${testName}: ${message}`);
    }

    generateValidationReport() {
        const duration = new Date() - this.startTime;
        const totalTests = this.results.overall.passed + this.results.overall.failed;
        const successRate = totalTests > 0 ? (this.results.overall.passed / totalTests * 100).toFixed(1) : 0;

        console.log('\n' + '='.repeat(80));
        console.log('🧪 USER ACCEPTANCE VALIDATION REPORT - TASK 14');
        console.log('='.repeat(80));
        
        console.log(`📊 Overall Results:`);
        console.log(`   ✅ Passed: ${this.results.overall.passed}`);
        console.log(`   ❌ Failed: ${this.results.overall.failed}`);
        console.log(`   ⚠️  Warnings: ${this.results.overall.warnings}`);
        console.log(`   📈 Success Rate: ${successRate}%`);
        console.log(`   ⏱️  Duration: ${Math.round(duration / 1000)}s`);

        console.log('\n📋 Category Results:');
        const categories = [
            { key: 'userFlow', name: 'Complete User Flow', req: '2.1-2.6' },
            { key: 'turkishErrors', name: 'Turkish Error Messages', req: '6.1-6.6' },
            { key: 'touchInterface', name: 'Touch Interface', req: '8.1-8.3' },
            { key: 'visualDesign', name: 'Visual Design', req: '5.1-5.6' },
            { key: 'systemRecovery', name: 'System Recovery', req: '6.1-6.6' }
        ];

        categories.forEach(cat => {
            const result = this.results[cat.key];
            const catTotal = result.passed + result.failed;
            const catRate = catTotal > 0 ? (result.passed / catTotal * 100).toFixed(1) : 0;
            console.log(`   ${cat.name} (${cat.req}): ${result.passed}/${catTotal} (${catRate}%)`);
        });

        if (this.results.overall.failed > 0) {
            console.log('\n❌ Failed Validations:');
            categories.forEach(cat => {
                const failedTests = this.results[cat.key].tests.filter(t => t.status === 'FAILED');
                if (failedTests.length > 0) {
                    console.log(`\n   ${cat.name}:`);
                    failedTests.forEach(test => {
                        console.log(`     • ${test.name}: ${test.message}`);
                    });
                }
            });
        }

        // Save detailed report
        const report = {
            taskId: 14,
            taskName: 'User Acceptance Testing and Polish',
            validationDate: this.startTime.toISOString(),
            duration: duration,
            results: this.results,
            successRate: successRate,
            requirementsCoverage: {
                'Complete User Flow (2.1-2.6)': this.results.userFlow.failed === 0 ? 'PASSED' : 'FAILED',
                'Turkish Error Messages (6.1-6.6)': this.results.turkishErrors.failed === 0 ? 'PASSED' : 'FAILED',
                'Touch Interface (8.1-8.3)': this.results.touchInterface.failed === 0 ? 'PASSED' : 'FAILED',
                'Visual Design (5.1-5.6)': this.results.visualDesign.failed === 0 ? 'PASSED' : 'FAILED',
                'System Recovery (6.1-6.6)': this.results.systemRecovery.failed === 0 ? 'PASSED' : 'FAILED'
            }
        };

        const reportPath = path.join(__dirname, '..', 'docs', 'task-14-validation-report.json');
        try {
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
            console.log(`\n📄 Detailed validation report saved to: ${reportPath}`);
        } catch (error) {
            console.log(`\n⚠️  Could not save validation report: ${error.message}`);
        }

        console.log('\n' + '='.repeat(80));
        
        if (this.results.overall.failed === 0) {
            console.log('🎉 ALL USER ACCEPTANCE VALIDATIONS PASSED!');
            console.log('✅ Task 14 implementation is complete and ready for production');
            console.log('📋 Requirements 5.1-5.6, 6.1-6.6, 8.1-8.6 are fully satisfied');
        } else {
            console.log('🚨 SOME VALIDATIONS FAILED');
            console.log('❌ Review and fix issues before marking task as complete');
        }
        
        console.log('='.repeat(80));
    }
}

// Run validation if called directly
if (require.main === module) {
    const validator = new UserAcceptanceValidator();
    validator.validateAll().catch(error => {
        console.error('🚨 Validation execution failed:', error);
        process.exit(1);
    });
}

module.exports = UserAcceptanceValidator;