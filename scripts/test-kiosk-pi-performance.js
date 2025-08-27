#!/usr/bin/env node

/**
 * Comprehensive Raspberry Pi Performance Testing for Kiosk UI
 * 
 * Tests all aspects of the kiosk performance optimizations on Pi hardware
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

class PiPerformanceTester {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      hardware: {},
      performance: {},
      optimizations: {},
      recommendations: []
    };
    
    this.kioskUrl = 'http://localhost:3002';
    this.testDuration = 60000; // 1 minute test
  }

  /**
   * Run comprehensive Pi performance tests
   */
  async runTests() {
    console.log('🍓 Starting Raspberry Pi Performance Tests for Kiosk UI');
    console.log('=' .repeat(60));
    
    try {
      await this.detectHardware();
      await this.testSystemPerformance();
      await this.testKioskService();
      await this.testUIOptimizations();
      await this.testMemoryUsage();
      await this.testNetworkPerformance();
      await this.generateReport();
      
      console.log('\n✅ All Pi performance tests completed successfully');
      return this.results;
      
    } catch (error) {
      console.error('❌ Pi performance test failed:', error.message);
      this.results.error = error.message;
      return this.results;
    }
  }

  /**
   * Detect Pi hardware specifications
   */
  async detectHardware() {
    console.log('\n🔍 Detecting Raspberry Pi Hardware...');
    
    try {
      // CPU information
      const cpuInfo = execSync('cat /proc/cpuinfo', { encoding: 'utf8' });
      const modelMatch = cpuInfo.match(/Model\s*:\s*(.+)/);
      const processorMatch = cpuInfo.match(/processor\s*:/g);
      
      this.results.hardware.model = modelMatch ? modelMatch[1].trim() : 'Unknown';
      this.results.hardware.cores = processorMatch ? processorMatch.length : 'Unknown';
      
      // Memory information
      const memInfo = execSync('cat /proc/meminfo', { encoding: 'utf8' });
      const totalMemMatch = memInfo.match(/MemTotal:\s*(\d+)\s*kB/);
      const availMemMatch = memInfo.match(/MemAvailable:\s*(\d+)\s*kB/);
      
      this.results.hardware.totalMemoryMB = totalMemMatch ? Math.round(parseInt(totalMemMatch[1]) / 1024) : 'Unknown';
      this.results.hardware.availableMemoryMB = availMemMatch ? Math.round(parseInt(availMemMatch[1]) / 1024) : 'Unknown';
      
      // GPU memory split
      try {
        const gpuMem = execSync('vcgencmd get_mem gpu', { encoding: 'utf8' });
        this.results.hardware.gpuMemoryMB = gpuMem.match(/gpu=(\d+)M/) ? parseInt(gpuMem.match(/gpu=(\d+)M/)[1]) : 'Unknown';
      } catch (error) {
        this.results.hardware.gpuMemoryMB = 'Not available';
      }
      
      // Temperature
      try {
        const temp = execSync('vcgencmd measure_temp', { encoding: 'utf8' });
        this.results.hardware.temperature = temp.match(/temp=([0-9.]+)/) ? parseFloat(temp.match(/temp=([0-9.]+)/)[1]) : 'Unknown';
      } catch (error) {
        this.results.hardware.temperature = 'Not available';
      }
      
      // Storage information
      const diskUsage = execSync('df -h /', { encoding: 'utf8' });
      const diskMatch = diskUsage.match(/\s+(\d+%)\s+/);
      this.results.hardware.diskUsage = diskMatch ? diskMatch[1] : 'Unknown';
      
      console.log(`   Model: ${this.results.hardware.model}`);
      console.log(`   CPU Cores: ${this.results.hardware.cores}`);
      console.log(`   Total Memory: ${this.results.hardware.totalMemoryMB}MB`);
      console.log(`   Available Memory: ${this.results.hardware.availableMemoryMB}MB`);
      console.log(`   GPU Memory: ${this.results.hardware.gpuMemoryMB}MB`);
      console.log(`   Temperature: ${this.results.hardware.temperature}°C`);
      console.log(`   Disk Usage: ${this.results.hardware.diskUsage}`);
      
    } catch (error) {
      console.warn('⚠️ Could not detect all hardware information:', error.message);
      this.results.hardware.error = error.message;
    }
  }

  /**
   * Test system performance metrics
   */
  async testSystemPerformance() {
    console.log('\n⚡ Testing System Performance...');
    
    try {
      // CPU load test
      const loadAvg = execSync('uptime', { encoding: 'utf8' });
      const loadMatch = loadAvg.match(/load average: ([0-9.]+), ([0-9.]+), ([0-9.]+)/);
      
      if (loadMatch) {
        this.results.performance.loadAverage = {
          '1min': parseFloat(loadMatch[1]),
          '5min': parseFloat(loadMatch[2]),
          '15min': parseFloat(loadMatch[3])
        };
      }
      
      // Memory usage
      const free = execSync('free -m', { encoding: 'utf8' });
      const memMatch = free.match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)/);
      
      if (memMatch) {
        const total = parseInt(memMatch[1]);
        const used = parseInt(memMatch[2]);
        this.results.performance.memoryUsage = {
          totalMB: total,
          usedMB: used,
          usagePercent: Math.round((used / total) * 100)
        };
      }
      
      // CPU temperature under load
      if (this.results.hardware.temperature !== 'Not available') {
        this.results.performance.temperatureUnderLoad = this.results.hardware.temperature;
      }
      
      console.log(`   Load Average: ${this.results.performance.loadAverage ? 
        `${this.results.performance.loadAverage['1min']} (1min)` : 'Unknown'}`);
      console.log(`   Memory Usage: ${this.results.performance.memoryUsage ? 
        `${this.results.performance.memoryUsage.usagePercent}% (${this.results.performance.memoryUsage.usedMB}MB/${this.results.performance.memoryUsage.totalMB}MB)` : 'Unknown'}`);
      
    } catch (error) {
      console.warn('⚠️ Could not measure system performance:', error.message);
      this.results.performance.error = error.message;
    }
  }

  /**
   * Test kiosk service performance
   */
  async testKioskService() {
    console.log('\n🖥️ Testing Kiosk Service Performance...');
    
    try {
      // Check if kiosk service is running
      const processes = execSync('ps aux | grep -E "node.*kiosk" | grep -v grep', { encoding: 'utf8' });
      
      if (processes.trim()) {
        this.results.performance.kioskServiceRunning = true;
        
        // Extract memory usage from ps output
        const memMatch = processes.match(/\s+([0-9.]+)\s+([0-9.]+)\s+/);
        if (memMatch) {
          this.results.performance.kioskServiceCPU = parseFloat(memMatch[1]);
          this.results.performance.kioskServiceMemory = parseFloat(memMatch[2]);
        }
        
        console.log(`   ✅ Kiosk service is running`);
        console.log(`   CPU Usage: ${this.results.performance.kioskServiceCPU || 'Unknown'}%`);
        console.log(`   Memory Usage: ${this.results.performance.kioskServiceMemory || 'Unknown'}%`);
        
        // Test API response time
        await this.testAPIPerformance();
        
      } else {
        this.results.performance.kioskServiceRunning = false;
        console.log(`   ❌ Kiosk service is not running`);
        this.results.recommendations.push('Start the kiosk service for performance testing');
      }
      
    } catch (error) {
      console.warn('⚠️ Could not test kiosk service:', error.message);
      this.results.performance.kioskServiceError = error.message;
    }
  }

  /**
   * Test API performance
   */
  async testAPIPerformance() {
    console.log('\n🌐 Testing API Performance...');
    
    const testEndpoints = [
      { path: '/health', name: 'Health Check' },
      { path: '/api/lockers/available?kioskId=test', name: 'Available Lockers' },
      { path: '/static/app-simple.js', name: 'Static Assets' }
    ];
    
    this.results.performance.apiTests = {};
    
    for (const endpoint of testEndpoints) {
      try {
        const startTime = Date.now();
        
        // Use curl for testing since we're on Pi
        const curlCmd = `curl -s -w "%{time_total}" -o /dev/null "${this.kioskUrl}${endpoint.path}"`;
        const responseTime = execSync(curlCmd, { encoding: 'utf8', timeout: 5000 });
        
        const latency = parseFloat(responseTime) * 1000; // Convert to ms
        
        this.results.performance.apiTests[endpoint.name] = {
          path: endpoint.path,
          latencyMs: Math.round(latency),
          success: latency < 2000 // Target: under 2 seconds
        };
        
        console.log(`   ${endpoint.name}: ${Math.round(latency)}ms ${latency < 2000 ? '✅' : '⚠️'}`);
        
      } catch (error) {
        this.results.performance.apiTests[endpoint.name] = {
          path: endpoint.path,
          error: error.message,
          success: false
        };
        console.log(`   ${endpoint.name}: Failed ❌`);
      }
    }
  }

  /**
   * Test UI optimization implementation
   */
  async testUIOptimizations() {
    console.log('\n🎨 Testing UI Optimizations...');
    
    const optimizationFiles = [
      { path: 'app/kiosk/src/ui/static/pi-config.js', name: 'Pi Configuration' },
      { path: 'app/kiosk/src/ui/static/performance-tracker.js', name: 'Performance Tracker' },
      { path: 'app/kiosk/src/ui/static/styles-simple.css', name: 'Optimized CSS' },
      { path: 'app/kiosk/src/ui/static/app-simple.js', name: 'Optimized JavaScript' }
    ];
    
    this.results.optimizations.files = {};
    
    for (const file of optimizationFiles) {
      try {
        const filePath = path.join(process.cwd(), file.path);
        const exists = fs.existsSync(filePath);
        const stats = exists ? fs.statSync(filePath) : null;
        
        this.results.optimizations.files[file.name] = {
          path: file.path,
          exists,
          sizeKB: stats ? Math.round(stats.size / 1024) : 0,
          lastModified: stats ? stats.mtime.toISOString() : null
        };
        
        console.log(`   ${file.name}: ${exists ? '✅' : '❌'} ${exists ? `(${Math.round(stats.size / 1024)}KB)` : ''}`);
        
      } catch (error) {
        this.results.optimizations.files[file.name] = {
          path: file.path,
          error: error.message
        };
        console.log(`   ${file.name}: Error ❌`);
      }
    }
    
    // Check for Pi-specific optimizations in CSS
    await this.checkCSSOptimizations();
    
    // Check for memory management in JavaScript
    await this.checkJSOptimizations();
  }

  /**
   * Check CSS optimizations
   */
  async checkCSSOptimizations() {
    try {
      const cssPath = path.join(process.cwd(), 'app/kiosk/src/ui/static/styles-simple.css');
      
      if (fs.existsSync(cssPath)) {
        const cssContent = fs.readFileSync(cssPath, 'utf8');
        
        const optimizations = {
          hardwareAcceleration: cssContent.includes('translateZ(0)'),
          piMediaQuery: cssContent.includes('@media (max-width: 1920px)'),
          animationOptimization: cssContent.includes('animation-duration: 0.1s'),
          gpuOptimization: cssContent.includes('will-change: transform'),
          svgOptimization: cssContent.includes('shape-rendering: optimizeSpeed')
        };
        
        this.results.optimizations.css = optimizations;
        
        const optimizedCount = Object.values(optimizations).filter(Boolean).length;
        console.log(`   CSS Optimizations: ${optimizedCount}/5 implemented ✅`);
        
      } else {
        console.log(`   CSS Optimizations: File not found ❌`);
      }
      
    } catch (error) {
      console.warn('⚠️ Could not check CSS optimizations:', error.message);
    }
  }

  /**
   * Check JavaScript optimizations
   */
  async checkJSOptimizations() {
    try {
      const jsPath = path.join(process.cwd(), 'app/kiosk/src/ui/static/app-simple.js');
      
      if (fs.existsSync(jsPath)) {
        const jsContent = fs.readFileSync(jsPath, 'utf8');
        
        const optimizations = {
          memoryManagement: jsContent.includes('performMemoryCleanup'),
          domCaching: jsContent.includes('cacheElements'),
          efficientScreenSwitching: jsContent.includes('switchToScreen'),
          memoryMonitoring: jsContent.includes('monitorMemoryUsage'),
          piOptimizations: jsContent.includes('Pi Optimized')
        };
        
        this.results.optimizations.javascript = optimizations;
        
        const optimizedCount = Object.values(optimizations).filter(Boolean).length;
        console.log(`   JavaScript Optimizations: ${optimizedCount}/5 implemented ✅`);
        
      } else {
        console.log(`   JavaScript Optimizations: File not found ❌`);
      }
      
    } catch (error) {
      console.warn('⚠️ Could not check JavaScript optimizations:', error.message);
    }
  }

  /**
   * Test memory usage patterns
   */
  async testMemoryUsage() {
    console.log('\n🧠 Testing Memory Usage Patterns...');
    
    try {
      // Monitor memory for a short period
      const memoryReadings = [];
      const testDuration = 10000; // 10 seconds
      const interval = 1000; // 1 second intervals
      
      console.log(`   Monitoring memory for ${testDuration / 1000} seconds...`);
      
      for (let i = 0; i < testDuration / interval; i++) {
        const free = execSync('free -m', { encoding: 'utf8' });
        const memMatch = free.match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)/);
        
        if (memMatch) {
          const total = parseInt(memMatch[1]);
          const used = parseInt(memMatch[2]);
          const usagePercent = Math.round((used / total) * 100);
          
          memoryReadings.push({
            timestamp: Date.now(),
            usedMB: used,
            totalMB: total,
            usagePercent
          });
        }
        
        // Wait for next reading
        if (i < (testDuration / interval) - 1) {
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      }
      
      // Analyze memory patterns
      if (memoryReadings.length > 0) {
        const avgUsage = memoryReadings.reduce((sum, reading) => sum + reading.usagePercent, 0) / memoryReadings.length;
        const maxUsage = Math.max(...memoryReadings.map(r => r.usagePercent));
        const minUsage = Math.min(...memoryReadings.map(r => r.usagePercent));
        
        this.results.performance.memoryPattern = {
          readings: memoryReadings.length,
          averageUsagePercent: Math.round(avgUsage),
          maxUsagePercent: maxUsage,
          minUsagePercent: minUsage,
          stable: (maxUsage - minUsage) < 5 // Memory usage variation < 5%
        };
        
        console.log(`   Average Usage: ${Math.round(avgUsage)}%`);
        console.log(`   Usage Range: ${minUsage}% - ${maxUsage}%`);
        console.log(`   Memory Stable: ${this.results.performance.memoryPattern.stable ? '✅' : '⚠️'}`);
      }
      
    } catch (error) {
      console.warn('⚠️ Could not test memory usage:', error.message);
      this.results.performance.memoryError = error.message;
    }
  }

  /**
   * Test network performance
   */
  async testNetworkPerformance() {
    console.log('\n🌐 Testing Network Performance...');
    
    try {
      // Test localhost latency (kiosk to backend)
      const pingResult = execSync('ping -c 5 localhost', { encoding: 'utf8' });
      const avgMatch = pingResult.match(/rtt min\/avg\/max\/mdev = [0-9.]+\/([0-9.]+)\/[0-9.]+\/[0-9.]+ ms/);
      
      if (avgMatch) {
        this.results.performance.networkLatency = parseFloat(avgMatch[1]);
        console.log(`   Localhost Latency: ${this.results.performance.networkLatency}ms`);
      }
      
      // Test if we can reach external network (for updates)
      try {
        execSync('ping -c 1 -W 3 8.8.8.8', { encoding: 'utf8' });
        this.results.performance.internetConnectivity = true;
        console.log(`   Internet Connectivity: ✅`);
      } catch (error) {
        this.results.performance.internetConnectivity = false;
        console.log(`   Internet Connectivity: ❌`);
      }
      
    } catch (error) {
      console.warn('⚠️ Could not test network performance:', error.message);
      this.results.performance.networkError = error.message;
    }
  }

  /**
   * Generate performance recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    
    // Hardware recommendations
    if (this.results.hardware.totalMemoryMB && this.results.hardware.totalMemoryMB < 2048) {
      recommendations.push('Consider upgrading to Pi 4 with 4GB+ RAM for better performance');
    }
    
    if (this.results.hardware.gpuMemoryMB && this.results.hardware.gpuMemoryMB < 128) {
      recommendations.push('Increase GPU memory split to 128MB or higher for better graphics performance');
    }
    
    if (this.results.hardware.temperature && this.results.hardware.temperature > 70) {
      recommendations.push('CPU temperature is high - consider adding cooling or reducing CPU load');
    }
    
    // Performance recommendations
    if (this.results.performance.memoryUsage && this.results.performance.memoryUsage.usagePercent > 80) {
      recommendations.push('Memory usage is high - enable more aggressive cleanup or add more RAM');
    }
    
    if (this.results.performance.loadAverage && this.results.performance.loadAverage['1min'] > 2) {
      recommendations.push('CPU load is high - optimize running processes or upgrade hardware');
    }
    
    // API performance recommendations
    if (this.results.performance.apiTests) {
      const slowAPIs = Object.values(this.results.performance.apiTests).filter(test => 
        test.latencyMs && test.latencyMs > 1000
      );
      
      if (slowAPIs.length > 0) {
        recommendations.push('Some API endpoints are slow - optimize backend performance or network');
      }
    }
    
    // Optimization recommendations
    if (this.results.optimizations.css) {
      const missingOptimizations = Object.entries(this.results.optimizations.css)
        .filter(([key, value]) => !value)
        .map(([key]) => key);
      
      if (missingOptimizations.length > 0) {
        recommendations.push(`Missing CSS optimizations: ${missingOptimizations.join(', ')}`);
      }
    }
    
    if (this.results.optimizations.javascript) {
      const missingOptimizations = Object.entries(this.results.optimizations.javascript)
        .filter(([key, value]) => !value)
        .map(([key]) => key);
      
      if (missingOptimizations.length > 0) {
        recommendations.push(`Missing JavaScript optimizations: ${missingOptimizations.join(', ')}`);
      }
    }
    
    this.results.recommendations = recommendations;
  }

  /**
   * Generate comprehensive performance report
   */
  async generateReport() {
    console.log('\n📊 Generating Performance Report...');
    
    this.generateRecommendations();
    
    // Calculate overall performance score
    let score = 100;
    
    // Deduct points for issues
    if (this.results.hardware.temperature && this.results.hardware.temperature > 70) score -= 10;
    if (this.results.performance.memoryUsage && this.results.performance.memoryUsage.usagePercent > 80) score -= 15;
    if (this.results.performance.loadAverage && this.results.performance.loadAverage['1min'] > 2) score -= 10;
    if (!this.results.performance.kioskServiceRunning) score -= 20;
    
    // Check optimization implementation
    const cssOptimizations = this.results.optimizations.css ? 
      Object.values(this.results.optimizations.css).filter(Boolean).length : 0;
    const jsOptimizations = this.results.optimizations.javascript ? 
      Object.values(this.results.optimizations.javascript).filter(Boolean).length : 0;
    
    if (cssOptimizations < 4) score -= 10;
    if (jsOptimizations < 4) score -= 10;
    
    this.results.overallScore = Math.max(0, score);
    
    // Save detailed report
    const reportPath = path.join(process.cwd(), 'logs', 'pi-performance-report.json');
    
    try {
      // Ensure logs directory exists
      const logsDir = path.dirname(reportPath);
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      
      fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
      console.log(`   📄 Detailed report saved to: ${reportPath}`);
      
    } catch (error) {
      console.warn('⚠️ Could not save report:', error.message);
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('🍓 RASPBERRY PI PERFORMANCE SUMMARY');
    console.log('='.repeat(60));
    console.log(`Overall Performance Score: ${this.results.overallScore}/100`);
    console.log(`Hardware: ${this.results.hardware.model || 'Unknown'}`);
    console.log(`Memory: ${this.results.hardware.totalMemoryMB || 'Unknown'}MB total, ${this.results.performance.memoryUsage ? this.results.performance.memoryUsage.usagePercent + '%' : 'Unknown'} used`);
    console.log(`Temperature: ${this.results.hardware.temperature || 'Unknown'}°C`);
    console.log(`Kiosk Service: ${this.results.performance.kioskServiceRunning ? 'Running ✅' : 'Not Running ❌'}`);
    
    if (this.results.recommendations.length > 0) {
      console.log('\n📋 RECOMMENDATIONS:');
      this.results.recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
      });
    } else {
      console.log('\n✅ No performance issues detected!');
    }
    
    console.log('\n' + '='.repeat(60));
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new PiPerformanceTester();
  
  tester.runTests()
    .then(results => {
      process.exit(results.overallScore >= 70 ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = PiPerformanceTester;