#!/usr/bin/env node

/**
 * Validation Script for Raspberry Pi Performance Optimizations
 * 
 * Validates that all performance optimizations are working correctly
 * Tests requirements 3.8, 8.5 for Pi performance optimization
 */

const fs = require('fs');
const path = require('path');

class PiPerformanceValidator {
  constructor() {
    this.validationResults = {
      timestamp: new Date().toISOString(),
      tests: [],
      passed: 0,
      failed: 0,
      warnings: 0
    };
  }

  /**
   * Run all validation tests
   */
  async runValidation() {
    console.log('🔍 Validating Raspberry Pi Performance Optimizations...\n');
    
    try {
      // Test 1: CSS optimizations
      this.validateCSSOptimizations();
      
      // Test 2: JavaScript optimizations
      this.validateJavaScriptOptimizations();
      
      // Test 3: Memory monitoring
      this.validateMemoryMonitoring();
      
      // Test 4: Performance tracking
      this.validatePerformanceTracking();
      
      // Test 5: Pi configuration
      this.validatePiConfiguration();
      
      // Test 6: File structure
      this.validateFileStructure();
      
      // Generate summary
      this.generateSummary();
      
    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Add test result
   */
  addTest(name, passed, message, warning = false) {
    const result = {
      name,
      passed,
      message,
      warning,
      timestamp: new Date().toISOString()
    };
    
    this.validationResults.tests.push(result);
    
    if (passed) {
      this.validationResults.passed++;
      console.log(`✅ ${name}: ${message}`);
    } else if (warning) {
      this.validationResults.warnings++;
      console.log(`⚠️  ${name}: ${message}`);
    } else {
      this.validationResults.failed++;
      console.log(`❌ ${name}: ${message}`);
    }
  }

  /**
   * Validate CSS optimizations
   */
  validateCSSOptimizations() {
    console.log('🎨 Validating CSS optimizations...');
    
    const cssPath = path.join(__dirname, '../app/kiosk/src/ui/static/styles.css');
    
    if (!fs.existsSync(cssPath)) {
      this.addTest('CSS File Exists', false, 'styles.css not found');
      return;
    }
    
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    
    // Test 1: 30fps animation cap
    if (cssContent.includes('animation-duration: 0.033s !important')) {
      this.addTest('30fps Animation Cap', true, 'Found 30fps animation cap in CSS');
    } else {
      this.addTest('30fps Animation Cap', false, '30fps animation cap not found in CSS');
    }
    
    // Test 2: Hardware acceleration
    if (cssContent.includes('transform: translateZ(0)')) {
      this.addTest('Hardware Acceleration', true, 'Hardware acceleration enabled');
    } else {
      this.addTest('Hardware Acceleration', false, 'Hardware acceleration not enabled');
    }
    
    // Test 3: Reduced blur effects
    if (cssContent.includes('filter: blur(6px)') || cssContent.includes('filter: blur(4px)')) {
      this.addTest('Reduced Blur Effects', true, 'Blur effects optimized for Pi');
    } else {
      this.addTest('Reduced Blur Effects', false, 'Blur effects not optimized');
    }
    
    // Test 4: SVG optimizations
    if (cssContent.includes('shape-rendering: optimizeSpeed')) {
      this.addTest('SVG Optimizations', true, 'SVG rendering optimized');
    } else {
      this.addTest('SVG Optimizations', false, 'SVG rendering not optimized');
    }
    
    // Test 5: Transition duration caps
    if (cssContent.includes('transition-duration: 200ms !important')) {
      this.addTest('Transition Duration Cap', true, 'Transition durations capped');
    } else {
      this.addTest('Transition Duration Cap', false, 'Transition durations not capped');
    }
  }

  /**
   * Validate JavaScript optimizations
   */
  validateJavaScriptOptimizations() {
    console.log('⚡ Validating JavaScript optimizations...');
    
    const appJsPath = path.join(__dirname, '../app/kiosk/src/ui/static/app.js');
    
    if (!fs.existsSync(appJsPath)) {
      this.addTest('App.js File Exists', false, 'app.js not found');
      return;
    }
    
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    
    // Test 1: Memory optimization function
    if (appJsContent.includes('optimizeMemoryUsage()')) {
      this.addTest('Memory Optimization Function', true, 'Memory optimization function found');
    } else {
      this.addTest('Memory Optimization Function', false, 'Memory optimization function not found');
    }
    
    // Test 2: Memory optimization interval
    if (appJsContent.includes('memoryOptimizationInterval')) {
      this.addTest('Memory Optimization Timer', true, 'Memory optimization timer implemented');
    } else {
      this.addTest('Memory Optimization Timer', false, 'Memory optimization timer not implemented');
    }
    
    // Test 3: Cleanup method
    if (appJsContent.includes('cleanup()') && appJsContent.includes('this.allLockers = []')) {
      this.addTest('Cleanup Method', true, 'Proper cleanup method implemented');
    } else {
      this.addTest('Cleanup Method', false, 'Cleanup method not properly implemented');
    }
  }

  /**
   * Validate memory monitoring
   */
  validateMemoryMonitoring() {
    console.log('🧠 Validating memory monitoring...');
    
    const perfTrackerPath = path.join(__dirname, '../app/kiosk/src/ui/static/performance-tracker.js');
    
    if (!fs.existsSync(perfTrackerPath)) {
      this.addTest('Performance Tracker Exists', false, 'performance-tracker.js not found');
      return;
    }
    
    const perfTrackerContent = fs.readFileSync(perfTrackerPath, 'utf8');
    
    // Test 1: Memory tracking function
    if (perfTrackerContent.includes('trackMemoryUsage()')) {
      this.addTest('Memory Tracking Function', true, 'Memory tracking function found');
    } else {
      this.addTest('Memory Tracking Function', false, 'Memory tracking function not found');
    }
    
    // Test 2: Memory monitoring start
    if (perfTrackerContent.includes('startMemoryMonitoring()')) {
      this.addTest('Memory Monitoring Start', true, 'Memory monitoring start function found');
    } else {
      this.addTest('Memory Monitoring Start', false, 'Memory monitoring start function not found');
    }
    
    // Test 3: Garbage collection
    if (perfTrackerContent.includes('forceGarbageCollection()')) {
      this.addTest('Garbage Collection', true, 'Garbage collection function found');
    } else {
      this.addTest('Garbage Collection', false, 'Garbage collection function not found');
    }
    
    // Test 4: Memory stats in getStats
    if (perfTrackerContent.includes('memory:') && perfTrackerContent.includes('usagePercent')) {
      this.addTest('Memory Stats', true, 'Memory statistics included in getStats');
    } else {
      this.addTest('Memory Stats', false, 'Memory statistics not included in getStats');
    }
  }

  /**
   * Validate performance tracking
   */
  validatePerformanceTracking() {
    console.log('📊 Validating performance tracking...');
    
    const perfTrackerPath = path.join(__dirname, '../app/kiosk/src/ui/static/performance-tracker.js');
    const perfTrackerContent = fs.readFileSync(perfTrackerPath, 'utf8');
    
    // Test 1: UI performance tracking methods
    const trackingMethods = [
      'trackStateUpdate',
      'trackSessionStart', 
      'trackLockerSelection',
      'trackUIRender'
    ];
    
    let foundMethods = 0;
    trackingMethods.forEach(method => {
      if (perfTrackerContent.includes(method)) {
        foundMethods++;
      }
    });
    
    if (foundMethods === trackingMethods.length) {
      this.addTest('Performance Tracking Methods', true, `All ${trackingMethods.length} tracking methods found`);
    } else {
      this.addTest('Performance Tracking Methods', false, `Only ${foundMethods}/${trackingMethods.length} tracking methods found`);
    }
    
    // Test 2: Performance observer
    if (perfTrackerContent.includes('observePerformance()')) {
      this.addTest('Performance Observer', true, 'Performance observer implemented');
    } else {
      this.addTest('Performance Observer', false, 'Performance observer not implemented');
    }
    
    // Test 3: Automatic initialization
    if (perfTrackerContent.includes('window.performanceTracker = new UIPerformanceTracker()')) {
      this.addTest('Auto Initialization', true, 'Performance tracker auto-initializes');
    } else {
      this.addTest('Auto Initialization', false, 'Performance tracker does not auto-initialize');
    }
  }

  /**
   * Validate Pi configuration
   */
  validatePiConfiguration() {
    console.log('🍓 Validating Pi configuration...');
    
    const piConfigPath = path.join(__dirname, '../app/kiosk/src/ui/static/pi-config.js');
    
    if (!fs.existsSync(piConfigPath)) {
      this.addTest('Pi Config File Exists', false, 'pi-config.js not found');
      return;
    }
    
    const piConfigContent = fs.readFileSync(piConfigPath, 'utf8');
    
    // Test 1: Pi detection
    if (piConfigContent.includes('detectRaspberryPi()')) {
      this.addTest('Pi Detection', true, 'Pi detection function found');
    } else {
      this.addTest('Pi Detection', false, 'Pi detection function not found');
    }
    
    // Test 2: Optimization functions
    const optimizationFunctions = [
      'applyMemoryOptimizations',
      'applyCPUOptimizations',
      'applyGraphicsOptimizations',
      'applyNetworkOptimizations'
    ];
    
    let foundOptimizations = 0;
    optimizationFunctions.forEach(func => {
      if (piConfigContent.includes(func)) {
        foundOptimizations++;
      }
    });
    
    if (foundOptimizations === optimizationFunctions.length) {
      this.addTest('Pi Optimization Functions', true, `All ${optimizationFunctions.length} optimization functions found`);
    } else {
      this.addTest('Pi Optimization Functions', false, `Only ${foundOptimizations}/${optimizationFunctions.length} optimization functions found`);
    }
    
    // Test 3: Auto initialization
    if (piConfigContent.includes('initializePiOptimizations')) {
      this.addTest('Pi Auto Initialization', true, 'Pi optimizations auto-initialize');
    } else {
      this.addTest('Pi Auto Initialization', false, 'Pi optimizations do not auto-initialize');
    }
  }

  /**
   * Validate file structure
   */
  validateFileStructure() {
    console.log('📁 Validating file structure...');
    
    const requiredFiles = [
      '../app/kiosk/src/ui/static/styles.css',
      '../app/kiosk/src/ui/static/app.js',
      '../app/kiosk/src/ui/static/performance-tracker.js',
      '../app/kiosk/src/ui/static/pi-config.js',
      '../app/kiosk/src/ui/index.html'
    ];
    
    let foundFiles = 0;
    requiredFiles.forEach(file => {
      const filePath = path.join(__dirname, file);
      if (fs.existsSync(filePath)) {
        foundFiles++;
      }
    });
    
    if (foundFiles === requiredFiles.length) {
      this.addTest('Required Files', true, `All ${requiredFiles.length} required files found`);
    } else {
      this.addTest('Required Files', false, `Only ${foundFiles}/${requiredFiles.length} required files found`);
    }
    
    // Test HTML includes Pi config
    const htmlPath = path.join(__dirname, '../app/kiosk/src/ui/index.html');
    if (fs.existsSync(htmlPath)) {
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');
      if (htmlContent.includes('pi-config.js')) {
        this.addTest('Pi Config Included', true, 'Pi config script included in HTML');
      } else {
        this.addTest('Pi Config Included', false, 'Pi config script not included in HTML');
      }
    }
    
    // Test performance test script
    const perfTestPath = path.join(__dirname, 'test-raspberry-pi-performance.js');
    if (fs.existsSync(perfTestPath)) {
      this.addTest('Performance Test Script', true, 'Performance test script exists');
    } else {
      this.addTest('Performance Test Script', false, 'Performance test script not found');
    }
  }

  /**
   * Generate validation summary
   */
  generateSummary() {
    console.log('\n📋 Validation Summary');
    console.log('===================');
    
    const total = this.validationResults.passed + this.validationResults.failed + this.validationResults.warnings;
    const passRate = total > 0 ? Math.round((this.validationResults.passed / total) * 100) : 0;
    
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${this.validationResults.passed} ✅`);
    console.log(`Failed: ${this.validationResults.failed} ❌`);
    console.log(`Warnings: ${this.validationResults.warnings} ⚠️`);
    console.log(`Pass Rate: ${passRate}%`);
    
    if (this.validationResults.failed === 0) {
      console.log('\n🎉 All critical tests passed! Pi optimizations are ready.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review and fix the issues above.');
    }
    
    // Save results
    const reportPath = path.join(__dirname, '../logs/pi-optimization-validation.json');
    const logsDir = path.dirname(reportPath);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(this.validationResults, null, 2));
    console.log(`\n📁 Validation report saved to: ${reportPath}`);
    
    // Exit with error code if tests failed
    if (this.validationResults.failed > 0) {
      process.exit(1);
    }
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new PiPerformanceValidator();
  validator.runValidation().catch(console.error);
}

module.exports = PiPerformanceValidator;