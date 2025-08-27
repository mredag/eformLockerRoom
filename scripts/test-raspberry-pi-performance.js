#!/usr/bin/env node

/**
 * Raspberry Pi Performance Testing and Tuning Script
 * 
 * Tests and optimizes the kiosk UI performance on Raspberry Pi hardware
 * Implements requirements 3.8, 8.5 for Pi performance optimization
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

class RaspberryPiPerformanceTester {
  constructor() {
    this.testResults = {
      timestamp: new Date().toISOString(),
      hardware: {},
      performance: {},
      optimizations: [],
      recommendations: []
    };
    
    this.kioskUrl = 'http://localhost:3002';
    this.testDuration = 60000; // 1 minute test
  }

  /**
   * Run comprehensive performance tests
   */
  async runTests() {
    console.log('🔧 Starting Raspberry Pi Performance Tests...\n');
    
    try {
      // 1. Hardware detection
      await this.detectHardware();
      
      // 2. Memory tests
      await this.testMemoryUsage();
      
      // 3. CPU tests
      await this.testCPUUsage();
      
      // 4. Network tests
      await this.testNetworkPerformance();
      
      // 5. Browser performance tests
      await this.testBrowserPerformance();
      
      // 6. Apply optimizations
      await this.applyOptimizations();
      
      // 7. Generate report
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Performance test failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Detect Raspberry Pi hardware specifications
   */
  async detectHardware() {
    console.log('🔍 Detecting hardware specifications...');
    
    try {
      // Get Pi model
      const model = execSync('cat /proc/device-tree/model 2>/dev/null || echo "Unknown"', { encoding: 'utf8' }).trim();
      
      // Get memory info
      const memInfo = execSync('cat /proc/meminfo | grep MemTotal', { encoding: 'utf8' });
      const totalMemory = parseInt(memInfo.match(/(\d+)/)[1]) * 1024; // Convert to bytes
      
      // Get CPU info
      const cpuInfo = execSync('cat /proc/cpuinfo | grep "model name" | head -1', { encoding: 'utf8' });
      const cpuModel = cpuInfo.split(':')[1]?.trim() || 'Unknown';
      
      // Get CPU cores
      const cpuCores = execSync('nproc', { encoding: 'utf8' }).trim();
      
      // Get GPU memory split
      let gpuMemory = 'Unknown';
      try {
        gpuMemory = execSync('vcgencmd get_mem gpu 2>/dev/null', { encoding: 'utf8' }).trim();
      } catch (e) {
        // Not a Pi or vcgencmd not available
      }
      
      this.testResults.hardware = {
        model,
        totalMemory,
        totalMemoryMB: Math.round(totalMemory / 1024 / 1024),
        cpuModel,
        cpuCores: parseInt(cpuCores),
        gpuMemory
      };
      
      console.log(`   Model: ${model}`);
      console.log(`   Memory: ${this.testResults.hardware.totalMemoryMB}MB`);
      console.log(`   CPU: ${cpuModel} (${cpuCores} cores)`);
      console.log(`   GPU Memory: ${gpuMemory}\n`);
      
    } catch (error) {
      console.warn('⚠️ Could not detect all hardware specs:', error.message);
    }
  }

  /**
   * Test memory usage patterns
   */
  async testMemoryUsage() {
    console.log('🧠 Testing memory usage...');
    
    try {
      // Get current memory usage
      const memUsage = execSync('free -m', { encoding: 'utf8' });
      const lines = memUsage.split('\n');
      const memLine = lines[1].split(/\s+/);
      
      const totalMem = parseInt(memLine[1]);
      const usedMem = parseInt(memLine[2]);
      const freeMem = parseInt(memLine[3]);
      const availableMem = parseInt(memLine[6] || memLine[3]);
      
      this.testResults.performance.memory = {
        totalMB: totalMem,
        usedMB: usedMem,
        freeMB: freeMem,
        availableMB: availableMem,
        usagePercent: Math.round((usedMem / totalMem) * 100)
      };
      
      console.log(`   Total: ${totalMem}MB`);
      console.log(`   Used: ${usedMem}MB (${this.testResults.performance.memory.usagePercent}%)`);
      console.log(`   Available: ${availableMem}MB\n`);
      
      // Memory recommendations
      if (this.testResults.performance.memory.usagePercent > 80) {
        this.testResults.recommendations.push('High memory usage detected - consider reducing browser cache or restarting services');
      }
      
    } catch (error) {
      console.warn('⚠️ Could not test memory usage:', error.message);
    }
  }

  /**
   * Test CPU usage and performance
   */
  async testCPUUsage() {
    console.log('⚡ Testing CPU performance...');
    
    try {
      // Get CPU temperature (Pi specific)
      let cpuTemp = 'Unknown';
      try {
        const tempRaw = execSync('vcgencmd measure_temp 2>/dev/null', { encoding: 'utf8' });
        cpuTemp = tempRaw.replace('temp=', '').trim();
      } catch (e) {
        // Not a Pi or vcgencmd not available
      }
      
      // Get load average
      const loadAvg = execSync('uptime', { encoding: 'utf8' });
      const loadMatch = loadAvg.match(/load average: ([\d.]+), ([\d.]+), ([\d.]+)/);
      
      this.testResults.performance.cpu = {
        temperature: cpuTemp,
        loadAverage1min: loadMatch ? parseFloat(loadMatch[1]) : null,
        loadAverage5min: loadMatch ? parseFloat(loadMatch[2]) : null,
        loadAverage15min: loadMatch ? parseFloat(loadMatch[3]) : null
      };
      
      console.log(`   Temperature: ${cpuTemp}`);
      console.log(`   Load Average: ${loadMatch ? loadMatch.slice(1).join(', ') : 'Unknown'}\n`);
      
      // CPU recommendations
      if (cpuTemp.includes('°C')) {
        const temp = parseFloat(cpuTemp);
        if (temp > 70) {
          this.testResults.recommendations.push(`High CPU temperature (${cpuTemp}) - ensure adequate cooling`);
        }
      }
      
      if (this.testResults.performance.cpu.loadAverage1min > this.testResults.hardware.cpuCores) {
        this.testResults.recommendations.push('High CPU load detected - consider optimizing running processes');
      }
      
    } catch (error) {
      console.warn('⚠️ Could not test CPU performance:', error.message);
    }
  }

  /**
   * Test network performance to kiosk service
   */
  async testNetworkPerformance() {
    console.log('🌐 Testing network performance...');
    
    try {
      const startTime = Date.now();
      
      // Test HTTP response time
      const response = await fetch(`${this.kioskUrl}/health`);
      const responseTime = Date.now() - startTime;
      
      this.testResults.performance.network = {
        responseTimeMs: responseTime,
        status: response.status,
        ok: response.ok
      };
      
      console.log(`   Response Time: ${responseTime}ms`);
      console.log(`   Status: ${response.status} ${response.ok ? '✅' : '❌'}\n`);
      
      // Network recommendations
      if (responseTime > 100) {
        this.testResults.recommendations.push(`Slow network response (${responseTime}ms) - check network configuration`);
      }
      
    } catch (error) {
      console.warn('⚠️ Could not test network performance:', error.message);
      this.testResults.performance.network = {
        error: error.message
      };
    }
  }

  /**
   * Test browser performance using headless browser
   */
  async testBrowserPerformance() {
    console.log('🌐 Testing browser performance...');
    
    // This would require puppeteer or similar for full testing
    // For now, we'll simulate based on hardware specs
    
    const { totalMemoryMB, cpuCores } = this.testResults.hardware;
    
    let performanceScore = 100;
    let recommendations = [];
    
    // Memory-based scoring
    if (totalMemoryMB < 1024) {
      performanceScore -= 30;
      recommendations.push('Low memory detected - enable memory optimizations');
    } else if (totalMemoryMB < 2048) {
      performanceScore -= 15;
      recommendations.push('Limited memory - consider memory optimizations');
    }
    
    // CPU-based scoring
    if (cpuCores < 4) {
      performanceScore -= 20;
      recommendations.push('Limited CPU cores - enable performance optimizations');
    }
    
    this.testResults.performance.browser = {
      estimatedScore: Math.max(performanceScore, 0),
      recommendations
    };
    
    console.log(`   Estimated Performance Score: ${performanceScore}/100`);
    console.log(`   Recommendations: ${recommendations.length} items\n`);
    
    this.testResults.recommendations.push(...recommendations);
  }

  /**
   * Apply performance optimizations based on test results
   */
  async applyOptimizations() {
    console.log('⚙️ Applying performance optimizations...');
    
    const optimizations = [];
    
    // 1. Memory optimizations
    if (this.testResults.hardware.totalMemoryMB < 2048) {
      await this.enableMemoryOptimizations();
      optimizations.push('Enabled memory optimizations for low-memory system');
    }
    
    // 2. CPU optimizations
    if (this.testResults.hardware.cpuCores < 4) {
      await this.enableCPUOptimizations();
      optimizations.push('Enabled CPU optimizations for limited cores');
    }
    
    // 3. Graphics optimizations
    await this.enableGraphicsOptimizations();
    optimizations.push('Enabled graphics optimizations for Raspberry Pi');
    
    // 4. Network optimizations
    if (this.testResults.performance.network?.responseTimeMs > 50) {
      await this.enableNetworkOptimizations();
      optimizations.push('Enabled network optimizations for slow connections');
    }
    
    this.testResults.optimizations = optimizations;
    
    optimizations.forEach(opt => console.log(`   ✅ ${opt}`));
    console.log();
  }

  /**
   * Enable memory optimizations
   */
  async enableMemoryOptimizations() {
    const configPath = path.join(__dirname, '../app/kiosk/src/ui/static/pi-config.js');
    
    const config = `
// Raspberry Pi Memory Optimizations
window.PI_OPTIMIZATIONS = window.PI_OPTIMIZATIONS || {};
window.PI_OPTIMIZATIONS.MEMORY = {
  enabled: true,
  maxLockerCache: 50,
  maxSessionCache: 5,
  gcInterval: 30000, // 30 seconds
  memoryThreshold: 80 // percent
};

// Apply memory optimizations
if (window.performanceTracker) {
  window.performanceTracker.setEnabled(true);
  
  // More aggressive memory monitoring
  setInterval(() => {
    const stats = window.performanceTracker.getStats();
    if (stats.memory && stats.memory.usagePercent > window.PI_OPTIMIZATIONS.MEMORY.memoryThreshold) {
      console.log('🧹 Triggering memory optimization...');
      if (window.kioskApp) {
        window.kioskApp.optimizeMemoryUsage();
      }
    }
  }, window.PI_OPTIMIZATIONS.MEMORY.gcInterval);
}
`;
    
    fs.writeFileSync(configPath, config);
  }

  /**
   * Enable CPU optimizations
   */
  async enableCPUOptimizations() {
    const configPath = path.join(__dirname, '../app/kiosk/src/ui/static/pi-config.js');
    
    const cpuConfig = `
// Raspberry Pi CPU Optimizations
window.PI_OPTIMIZATIONS.CPU = {
  enabled: true,
  maxFPS: 30,
  reducedAnimations: true,
  simplifiedEffects: true
};

// Apply CPU optimizations to CSS
const style = document.createElement('style');
style.textContent = \`
  /* Force 30fps cap on all animations */
  *, *::before, *::after {
    animation-duration: 0.033s !important;
  }
  
  /* Disable expensive effects */
  .locker-tile:hover {
    box-shadow: none !important;
    transform: translateY(-2px) !important;
  }
  
  /* Simplify transitions */
  .transition-fade,
  .transition-scale,
  .transition-blur {
    transition-duration: 150ms !important;
    transition-timing-function: ease-out !important;
  }
\`;
document.head.appendChild(style);
`;
    
    fs.appendFileSync(configPath, cpuConfig);
  }

  /**
   * Enable graphics optimizations
   */
  async enableGraphicsOptimizations() {
    const configPath = path.join(__dirname, '../app/kiosk/src/ui/static/pi-config.js');
    
    const graphicsConfig = `
// Raspberry Pi Graphics Optimizations
window.PI_OPTIMIZATIONS.GRAPHICS = {
  enabled: true,
  reducedBlur: true,
  simplifiedShadows: true,
  hardwareAcceleration: true
};

// Apply graphics optimizations
const graphicsStyle = document.createElement('style');
graphicsStyle.textContent = \`
  /* Reduce blur effects for better Pi performance */
  .background-grid.blurred {
    filter: blur(4px) !important;
  }
  
  .overlay-card,
  .grid-header,
  .legend-bar {
    backdrop-filter: blur(4px) !important;
    -webkit-backdrop-filter: blur(4px) !important;
  }
  
  /* Force hardware acceleration */
  .locker-tile,
  .background-grid,
  .front-overlay,
  .session-countdown {
    transform: translateZ(0) !important;
    will-change: transform !important;
  }
  
  /* Simplify shadows */
  .overlay-card,
  .feedback-content {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
  }
\`;
document.head.appendChild(graphicsStyle);
`;
    
    fs.appendFileSync(configPath, graphicsConfig);
  }

  /**
   * Enable network optimizations
   */
  async enableNetworkOptimizations() {
    const configPath = path.join(__dirname, '../app/kiosk/src/ui/static/pi-config.js');
    
    const networkConfig = `
// Raspberry Pi Network Optimizations
window.PI_OPTIMIZATIONS.NETWORK = {
  enabled: true,
  reducedPolling: true,
  batchRequests: true,
  timeout: 5000
};

// Apply network optimizations
if (window.kioskApp) {
  // Reduce polling frequency
  window.kioskApp.pollingInterval = 5000; // 5 seconds instead of 2
  
  // Set shorter timeouts
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    options.timeout = options.timeout || window.PI_OPTIMIZATIONS.NETWORK.timeout;
    return originalFetch(url, options);
  };
}
`;
    
    fs.appendFileSync(configPath, networkConfig);
  }

  /**
   * Generate performance test report
   */
  generateReport() {
    console.log('📊 Generating performance report...\n');
    
    const reportPath = path.join(__dirname, '../logs/pi-performance-report.json');
    const readableReportPath = path.join(__dirname, '../logs/pi-performance-report.txt');
    
    // Ensure logs directory exists
    const logsDir = path.dirname(reportPath);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Write JSON report
    fs.writeFileSync(reportPath, JSON.stringify(this.testResults, null, 2));
    
    // Write readable report
    const readableReport = this.generateReadableReport();
    fs.writeFileSync(readableReportPath, readableReport);
    
    console.log('📋 Performance Test Report');
    console.log('========================\n');
    console.log(readableReport);
    
    console.log(`\n📁 Reports saved to:`);
    console.log(`   JSON: ${reportPath}`);
    console.log(`   Text: ${readableReportPath}`);
  }

  /**
   * Generate human-readable report
   */
  generateReadableReport() {
    const { hardware, performance, optimizations, recommendations } = this.testResults;
    
    let report = `Raspberry Pi Performance Test Report
Generated: ${this.testResults.timestamp}

HARDWARE SPECIFICATIONS
======================
Model: ${hardware.model || 'Unknown'}
Memory: ${hardware.totalMemoryMB || 'Unknown'}MB
CPU: ${hardware.cpuModel || 'Unknown'} (${hardware.cpuCores || 'Unknown'} cores)
GPU Memory: ${hardware.gpuMemory || 'Unknown'}

PERFORMANCE RESULTS
==================
Memory Usage: ${performance.memory?.usedMB || 'Unknown'}MB / ${performance.memory?.totalMB || 'Unknown'}MB (${performance.memory?.usagePercent || 'Unknown'}%)
CPU Temperature: ${performance.cpu?.temperature || 'Unknown'}
CPU Load: ${performance.cpu?.loadAverage1min || 'Unknown'}
Network Response: ${performance.network?.responseTimeMs || 'Unknown'}ms
Browser Score: ${performance.browser?.estimatedScore || 'Unknown'}/100

APPLIED OPTIMIZATIONS
====================
`;
    
    if (optimizations.length > 0) {
      optimizations.forEach(opt => {
        report += `✅ ${opt}\n`;
      });
    } else {
      report += 'No optimizations applied\n';
    }
    
    report += `\nRECOMMENDATIONS
==============
`;
    
    if (recommendations.length > 0) {
      recommendations.forEach(rec => {
        report += `⚠️  ${rec}\n`;
      });
    } else {
      report += '✅ No recommendations - system performing well\n';
    }
    
    return report;
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new RaspberryPiPerformanceTester();
  tester.runTests().catch(console.error);
}

module.exports = RaspberryPiPerformanceTester;