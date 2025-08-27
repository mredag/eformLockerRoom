#!/usr/bin/env node

/**
 * Validation Script for Kiosk Pi Performance Optimizations
 * 
 * Validates that all Pi performance optimizations are properly implemented
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

const fs = require('fs');
const path = require('path');

class PiOptimizationValidator {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      validations: {},
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0
      },
      recommendations: []
    };
  }

  /**
   * Run all validation tests
   */
  async validate() {
    console.log('🔍 Validating Kiosk Pi Performance Optimizations');
    console.log('=' .repeat(60));
    
    try {
      await this.validateFileStructure();
      await this.validateHTMLOptimizations();
      await this.validateCSSOptimizations();
      await this.validateJavaScriptOptimizations();
      await this.validatePiConfigOptimizations();
      await this.validatePerformanceTracking();
      
      this.generateSummary();
      this.printResults();
      
      return this.results.summary.failed === 0;
      
    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      return false;
    }
  }

  /**
   * Validate file structure
   */
  async validateFileStructure() {
    console.log('\n📁 Validating File Structure...');
    
    const requiredFiles = [
      'app/kiosk/src/ui/index.html',
      'app/kiosk/src/ui/static/app-simple.js',
      'app/kiosk/src/ui/static/styles-simple.css',
      'app/kiosk/src/ui/static/pi-config.js',
      'app/kiosk/src/ui/static/performance-tracker.js'
    ];
    
    this.results.validations.fileStructure = {};
    
    for (const filePath of requiredFiles) {
      const fullPath = path.join(process.cwd(), filePath);
      const exists = fs.existsSync(fullPath);
      const fileName = path.basename(filePath);
      
      this.results.validations.fileStructure[fileName] = {
        path: filePath,
        exists,
        size: exists ? fs.statSync(fullPath).size : 0
      };
      
      if (exists) {
        console.log(`   ✅ ${fileName}`);
        this.results.summary.passed++;
      } else {
        console.log(`   ❌ ${fileName} - Missing`);
        this.results.summary.failed++;
      }
      
      this.results.summary.total++;
    }
  }

  /**
   * Validate HTML optimizations
   */
  async validateHTMLOptimizations() {
    console.log('\n🌐 Validating HTML Optimizations...');
    
    const htmlPath = path.join(process.cwd(), 'app/kiosk/src/ui/index.html');
    
    if (!fs.existsSync(htmlPath)) {
      console.log('   ❌ HTML file not found');
      this.results.summary.failed++;
      this.results.summary.total++;
      return;
    }
    
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    const checks = [
      {
        name: 'Pi Config Script Loaded',
        test: htmlContent.includes('pi-config.js'),
        required: true
      },
      {
        name: 'Performance Tracker Loaded',
        test: htmlContent.includes('performance-tracker.js'),
        required: true
      },
      {
        name: 'Viewport Meta Tag',
        test: htmlContent.includes('user-scalable=no'),
        required: true
      },
      {
        name: 'Touch Optimizations',
        test: htmlContent.includes('apple-mobile-web-app-capable'),
        required: false
      },
      {
        name: 'Resource Preloading',
        test: htmlContent.includes('preload'),
        required: false
      }
    ];
    
    this.results.validations.html = {};
    
    for (const check of checks) {
      this.results.validations.html[check.name] = {
        passed: check.test,
        required: check.required
      };
      
      if (check.test) {
        console.log(`   ✅ ${check.name}`);
        this.results.summary.passed++;
      } else if (check.required) {
        console.log(`   ❌ ${check.name} - Required`);
        this.results.summary.failed++;
      } else {
        console.log(`   ⚠️ ${check.name} - Optional`);
        this.results.summary.warnings++;
      }
      
      this.results.summary.total++;
    }
  }

  /**
   * Validate CSS optimizations
   */
  async validateCSSOptimizations() {
    console.log('\n🎨 Validating CSS Optimizations...');
    
    const cssPath = path.join(process.cwd(), 'app/kiosk/src/ui/static/styles-simple.css');
    
    if (!fs.existsSync(cssPath)) {
      console.log('   ❌ CSS file not found');
      this.results.summary.failed++;
      this.results.summary.total++;
      return;
    }
    
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    
    const checks = [
      {
        name: 'Hardware Acceleration (translateZ)',
        test: cssContent.includes('translateZ(0)'),
        required: true
      },
      {
        name: 'Will-Change Optimization',
        test: cssContent.includes('will-change: transform'),
        required: true
      },
      {
        name: 'Pi Media Query',
        test: cssContent.includes('@media (max-width: 1920px)'),
        required: true
      },
      {
        name: 'Animation Duration Capping',
        test: cssContent.includes('animation-duration: 0.1s'),
        required: true
      },
      {
        name: 'SVG Optimization',
        test: cssContent.includes('shape-rendering: optimizeSpeed'),
        required: true
      },
      {
        name: 'Backface Visibility Hidden',
        test: cssContent.includes('backface-visibility: hidden'),
        required: true
      },
      {
        name: 'Expensive Features Disabled',
        test: cssContent.includes('box-shadow: none !important'),
        required: true
      },
      {
        name: 'Font Smoothing',
        test: cssContent.includes('-webkit-font-smoothing: antialiased'),
        required: false
      }
    ];
    
    this.results.validations.css = {};
    
    for (const check of checks) {
      this.results.validations.css[check.name] = {
        passed: check.test,
        required: check.required
      };
      
      if (check.test) {
        console.log(`   ✅ ${check.name}`);
        this.results.summary.passed++;
      } else if (check.required) {
        console.log(`   ❌ ${check.name} - Required`);
        this.results.summary.failed++;
      } else {
        console.log(`   ⚠️ ${check.name} - Optional`);
        this.results.summary.warnings++;
      }
      
      this.results.summary.total++;
    }
  }

  /**
   * Validate JavaScript optimizations
   */
  async validateJavaScriptOptimizations() {
    console.log('\n⚡ Validating JavaScript Optimizations...');
    
    const jsPath = path.join(process.cwd(), 'app/kiosk/src/ui/static/app-simple.js');
    
    if (!fs.existsSync(jsPath)) {
      console.log('   ❌ JavaScript file not found');
      this.results.summary.failed++;
      this.results.summary.total++;
      return;
    }
    
    const jsContent = fs.readFileSync(jsPath, 'utf8');
    
    const checks = [
      {
        name: 'DOM Element Caching',
        test: jsContent.includes('cacheElements') && jsContent.includes('this.elements'),
        required: true
      },
      {
        name: 'Efficient Screen Switching',
        test: jsContent.includes('switchToScreen') || jsContent.includes('this.screens'),
        required: true
      },
      {
        name: 'Memory Management',
        test: jsContent.includes('performMemoryCleanup'),
        required: true
      },
      {
        name: 'Memory Monitoring',
        test: jsContent.includes('monitorMemoryUsage'),
        required: true
      },
      {
        name: 'Memory Optimization',
        test: jsContent.includes('optimizeMemoryUsage'),
        required: true
      },
      {
        name: 'Pi-Specific Optimizations',
        test: jsContent.includes('Pi Optimized') || jsContent.includes('Pi-optimized'),
        required: true
      },
      {
        name: 'Memory Thresholds',
        test: jsContent.includes('memoryThreshold'),
        required: true
      },
      {
        name: 'Cleanup Intervals',
        test: jsContent.includes('cleanupInterval'),
        required: true
      }
    ];
    
    this.results.validations.javascript = {};
    
    for (const check of checks) {
      this.results.validations.javascript[check.name] = {
        passed: check.test,
        required: check.required
      };
      
      if (check.test) {
        console.log(`   ✅ ${check.name}`);
        this.results.summary.passed++;
      } else if (check.required) {
        console.log(`   ❌ ${check.name} - Required`);
        this.results.summary.failed++;
      } else {
        console.log(`   ⚠️ ${check.name} - Optional`);
        this.results.summary.warnings++;
      }
      
      this.results.summary.total++;
    }
  }

  /**
   * Validate Pi configuration optimizations
   */
  async validatePiConfigOptimizations() {
    console.log('\n🍓 Validating Pi Configuration Optimizations...');
    
    const piConfigPath = path.join(process.cwd(), 'app/kiosk/src/ui/static/pi-config.js');
    
    if (!fs.existsSync(piConfigPath)) {
      console.log('   ❌ Pi config file not found');
      this.results.summary.failed++;
      this.results.summary.total++;
      return;
    }
    
    const piConfigContent = fs.readFileSync(piConfigPath, 'utf8');
    
    const checks = [
      {
        name: 'Pi Detection Function',
        test: piConfigContent.includes('detectRaspberryPi'),
        required: true
      },
      {
        name: 'Memory Optimizations',
        test: piConfigContent.includes('applyMemoryOptimizations'),
        required: true
      },
      {
        name: 'CPU Optimizations',
        test: piConfigContent.includes('applyCPUOptimizations'),
        required: true
      },
      {
        name: 'Graphics Optimizations',
        test: piConfigContent.includes('applyGraphicsOptimizations'),
        required: true
      },
      {
        name: 'Network Optimizations',
        test: piConfigContent.includes('applyNetworkOptimizations'),
        required: true
      },
      {
        name: 'Global Pi Optimizations Object',
        test: piConfigContent.includes('window.PI_OPTIMIZATIONS'),
        required: true
      }
    ];
    
    this.results.validations.piConfig = {};
    
    for (const check of checks) {
      this.results.validations.piConfig[check.name] = {
        passed: check.test,
        required: check.required
      };
      
      if (check.test) {
        console.log(`   ✅ ${check.name}`);
        this.results.summary.passed++;
      } else if (check.required) {
        console.log(`   ❌ ${check.name} - Required`);
        this.results.summary.failed++;
      } else {
        console.log(`   ⚠️ ${check.name} - Optional`);
        this.results.summary.warnings++;
      }
      
      this.results.summary.total++;
    }
  }

  /**
   * Validate performance tracking
   */
  async validatePerformanceTracking() {
    console.log('\n📊 Validating Performance Tracking...');
    
    const perfTrackerPath = path.join(process.cwd(), 'app/kiosk/src/ui/static/performance-tracker.js');
    
    if (!fs.existsSync(perfTrackerPath)) {
      console.log('   ❌ Performance tracker file not found');
      this.results.summary.failed++;
      this.results.summary.total++;
      return;
    }
    
    const perfTrackerContent = fs.readFileSync(perfTrackerPath, 'utf8');
    
    const checks = [
      {
        name: 'UI Performance Tracker Class',
        test: perfTrackerContent.includes('class UIPerformanceTracker'),
        required: true
      },
      {
        name: 'Memory Usage Tracking',
        test: perfTrackerContent.includes('trackMemoryUsage'),
        required: true
      },
      {
        name: 'Performance Event Recording',
        test: perfTrackerContent.includes('recordEvent'),
        required: true
      },
      {
        name: 'Memory Monitoring',
        test: perfTrackerContent.includes('startMemoryMonitoring'),
        required: true
      },
      {
        name: 'Global Performance Tracker',
        test: perfTrackerContent.includes('window.performanceTracker'),
        required: true
      }
    ];
    
    this.results.validations.performanceTracking = {};
    
    for (const check of checks) {
      this.results.validations.performanceTracking[check.name] = {
        passed: check.test,
        required: check.required
      };
      
      if (check.test) {
        console.log(`   ✅ ${check.name}`);
        this.results.summary.passed++;
      } else if (check.required) {
        console.log(`   ❌ ${check.name} - Required`);
        this.results.summary.failed++;
      } else {
        console.log(`   ⚠️ ${check.name} - Optional`);
        this.results.summary.warnings++;
      }
      
      this.results.summary.total++;
    }
  }

  /**
   * Generate summary and recommendations
   */
  generateSummary() {
    const passRate = (this.results.summary.passed / this.results.summary.total) * 100;
    
    if (passRate < 80) {
      this.results.recommendations.push('Implementation is incomplete - address failed validations');
    }
    
    if (this.results.summary.warnings > 0) {
      this.results.recommendations.push('Consider implementing optional optimizations for better performance');
    }
    
    // Specific recommendations based on failures
    Object.entries(this.results.validations).forEach(([category, validations]) => {
      const failedChecks = Object.entries(validations)
        .filter(([name, result]) => result.required && !result.passed)
        .map(([name]) => name);
      
      if (failedChecks.length > 0) {
        this.results.recommendations.push(`${category}: Implement missing optimizations - ${failedChecks.join(', ')}`);
      }
    });
  }

  /**
   * Print validation results
   */
  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 VALIDATION SUMMARY');
    console.log('='.repeat(60));
    
    const passRate = (this.results.summary.passed / this.results.summary.total) * 100;
    
    console.log(`Total Checks: ${this.results.summary.total}`);
    console.log(`Passed: ${this.results.summary.passed} ✅`);
    console.log(`Failed: ${this.results.summary.failed} ❌`);
    console.log(`Warnings: ${this.results.summary.warnings} ⚠️`);
    console.log(`Pass Rate: ${passRate.toFixed(1)}%`);
    
    if (this.results.summary.failed === 0) {
      console.log('\n🎉 All Pi optimizations are properly implemented!');
    } else {
      console.log('\n⚠️ Some optimizations are missing or incomplete.');
    }
    
    if (this.results.recommendations.length > 0) {
      console.log('\n📋 RECOMMENDATIONS:');
      this.results.recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    
    // Save detailed results
    try {
      const reportPath = path.join(process.cwd(), 'logs', 'pi-optimization-validation.json');
      
      // Ensure logs directory exists
      const logsDir = path.dirname(reportPath);
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      
      fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
      console.log(`📄 Detailed validation report saved to: ${reportPath}`);
      
    } catch (error) {
      console.warn('⚠️ Could not save validation report:', error.message);
    }
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new PiOptimizationValidator();
  
  validator.validate()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Validation execution failed:', error);
      process.exit(1);
    });
}

module.exports = PiOptimizationValidator;