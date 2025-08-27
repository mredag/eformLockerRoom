/**
 * Raspberry Pi Specific Configuration and Optimizations
 * 
 * This file contains performance optimizations specifically for Raspberry Pi hardware
 * Automatically detects Pi hardware and applies appropriate optimizations
 */

(function() {
  'use strict';
  
  // Initialize Pi optimizations object
  window.PI_OPTIMIZATIONS = {
    enabled: false,
    detected: false,
    hardware: {},
    applied: []
  };
  
  /**
   * Detect if running on Raspberry Pi
   */
  function detectRaspberryPi() {
    // Check user agent for Pi indicators
    const userAgent = navigator.userAgent.toLowerCase();
    const isPi = userAgent.includes('raspberry') || 
                 userAgent.includes('armv') ||
                 userAgent.includes('linux arm');
    
    // Check screen resolution (common Pi resolutions)
    const isLowRes = screen.width <= 1920 && screen.height <= 1080;
    
    // Check memory (Pi typically has limited memory)
    const isLowMemory = navigator.deviceMemory && navigator.deviceMemory <= 4;
    
    // Check hardware concurrency (Pi typically has 4 cores or less)
    const isLowCores = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;
    
    return isPi || (isLowRes && (isLowMemory || isLowCores));
  }
  
  /**
   * Apply memory optimizations for Pi
   */
  function applyMemoryOptimizations() {
    window.PI_OPTIMIZATIONS.MEMORY = {
      enabled: true,
      maxLockerCache: 50,
      maxSessionCache: 5,
      gcInterval: 30000,
      memoryThreshold: 75
    };
    
    // More aggressive memory monitoring
    if (window.performanceTracker) {
      setInterval(() => {
        const stats = window.performanceTracker.getStats();
        if (stats.memory && stats.memory.usagePercent > window.PI_OPTIMIZATIONS.MEMORY.memoryThreshold) {
          console.log('🧹 Pi memory optimization triggered');
          if (window.kioskApp) {
            window.kioskApp.optimizeMemoryUsage();
          }
        }
      }, window.PI_OPTIMIZATIONS.MEMORY.gcInterval);
    }
    
    window.PI_OPTIMIZATIONS.applied.push('Memory optimizations');
  }
  
  /**
   * Apply CPU optimizations for Pi
   */
  function applyCPUOptimizations() {
    window.PI_OPTIMIZATIONS.CPU = {
      enabled: true,
      maxFPS: 30,
      reducedAnimations: true,
      simplifiedEffects: true
    };
    
    // Add CSS optimizations
    const style = document.createElement('style');
    style.id = 'pi-cpu-optimizations';
    style.textContent = `
      /* Raspberry Pi CPU Optimizations */
      
      /* Force 30fps cap on all animations */
      *, *::before, *::after {
        animation-duration: 0.033s !important;
      }
      
      /* Keep specific animations at reasonable speeds */
      .tile-icon.spinner,
      .legend-icon.spinner,
      .loading-spinner {
        animation-duration: 1s !important;
      }
      
      .rfid-icon {
        animation-duration: 2s !important;
      }
      
      .countdown-badge {
        animation-duration: 1s !important;
      }
      
      /* Disable expensive hover effects */
      .locker-tile:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1) !important;
        transform: translateY(-2px) !important;
      }
      
      /* Simplify transitions */
      .transition-fade,
      .transition-scale,
      .transition-blur,
      .locker-tile,
      .front-overlay,
      .interactive-grid,
      .big-feedback {
        transition-duration: 150ms !important;
        transition-timing-function: ease-out !important;
      }
      
      /* Reduce animation complexity */
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.8; transform: scale(1.02); }
      }
      
      @keyframes pulse-countdown {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.02); }
      }
    `;
    
    document.head.appendChild(style);
    window.PI_OPTIMIZATIONS.applied.push('CPU optimizations');
  }
  
  /**
   * Apply graphics optimizations for Pi
   */
  function applyGraphicsOptimizations() {
    window.PI_OPTIMIZATIONS.GRAPHICS = {
      enabled: true,
      reducedBlur: true,
      simplifiedShadows: true,
      hardwareAcceleration: true
    };
    
    const style = document.createElement('style');
    style.id = 'pi-graphics-optimizations';
    style.textContent = `
      /* Raspberry Pi Graphics Optimizations */
      
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
      
      .connection-status {
        backdrop-filter: blur(4px) !important;
        -webkit-backdrop-filter: blur(4px) !important;
      }
      
      /* Force hardware acceleration */
      .locker-tile,
      .background-grid,
      .front-overlay,
      .session-countdown,
      .big-feedback,
      .interactive-grid {
        transform: translateZ(0) !important;
        will-change: transform !important;
      }
      
      /* Simplify shadows */
      .overlay-card,
      .feedback-content {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
      }
      
      .locker-tile:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1) !important;
      }
      
      .countdown-badge {
        box-shadow: 0 2px 10px rgba(220, 38, 38, 0.3) !important;
      }
      
      /* Optimize SVG rendering */
      svg {
        shape-rendering: optimizeSpeed !important;
        text-rendering: optimizeSpeed !important;
        image-rendering: optimizeSpeed !important;
      }
      
      /* Reduce gradient complexity */
      html, body {
        background: #334155 !important; /* Solid color instead of gradient */
      }
    `;
    
    document.head.appendChild(style);
    window.PI_OPTIMIZATIONS.applied.push('Graphics optimizations');
  }
  
  /**
   * Apply network optimizations for Pi
   */
  function applyNetworkOptimizations() {
    window.PI_OPTIMIZATIONS.NETWORK = {
      enabled: true,
      reducedPolling: true,
      batchRequests: true,
      timeout: 8000 // Longer timeout for Pi
    };
    
    // Apply when kiosk app is ready
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        if (window.kioskApp) {
          // Reduce polling frequency for Pi
          const originalPollingInterval = 2000;
          const piPollingInterval = 4000; // 4 seconds instead of 2
          
          console.log(`🔧 Pi optimization: Reducing polling from ${originalPollingInterval}ms to ${piPollingInterval}ms`);
          
          // Override polling interval
          if (window.kioskApp.pollingInterval) {
            clearInterval(window.kioskApp.pollingInterval);
            window.kioskApp.pollingInterval = setInterval(() => {
              window.kioskApp.pollForUpdates();
            }, piPollingInterval);
          }
        }
      }, 1000);
    });
    
    window.PI_OPTIMIZATIONS.applied.push('Network optimizations');
  }
  
  /**
   * Apply all Pi optimizations
   */
  function applyAllOptimizations() {
    console.log('🔧 Applying Raspberry Pi optimizations...');
    
    applyMemoryOptimizations();
    applyCPUOptimizations();
    applyGraphicsOptimizations();
    applyNetworkOptimizations();
    
    window.PI_OPTIMIZATIONS.enabled = true;
    
    console.log(`✅ Applied ${window.PI_OPTIMIZATIONS.applied.length} Pi optimizations:`, 
                window.PI_OPTIMIZATIONS.applied);
  }
  
  /**
   * Initialize Pi optimizations
   */
  function initializePiOptimizations() {
    // Detect hardware
    window.PI_OPTIMIZATIONS.detected = detectRaspberryPi();
    
    // Store hardware info
    window.PI_OPTIMIZATIONS.hardware = {
      userAgent: navigator.userAgent,
      screenWidth: screen.width,
      screenHeight: screen.height,
      deviceMemory: navigator.deviceMemory || 'unknown',
      hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
      platform: navigator.platform
    };
    
    if (window.PI_OPTIMIZATIONS.detected) {
      console.log('🍓 Raspberry Pi detected - applying optimizations');
      applyAllOptimizations();
    } else {
      console.log('💻 Non-Pi hardware detected - using standard configuration');
    }
    
    // Always apply some basic optimizations for low-end hardware
    if (navigator.hardwareConcurrency <= 4 || (navigator.deviceMemory && navigator.deviceMemory <= 4)) {
      console.log('⚡ Low-end hardware detected - applying basic optimizations');
      applyCPUOptimizations();
      applyMemoryOptimizations();
    }
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePiOptimizations);
  } else {
    initializePiOptimizations();
  }
  
  // Expose functions for manual optimization
  window.PI_OPTIMIZATIONS.apply = applyAllOptimizations;
  window.PI_OPTIMIZATIONS.detect = detectRaspberryPi;
  
})();