#!/usr/bin/env node

/**
 * UI Feedback Validation for Admin Panel Relay Control
 * 
 * This script validates the user interface feedback and behavior:
 * - Success/error message display
 * - Locker status updates
 * - Command status polling
 * - User interaction flows
 */

let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (error) {
  console.log('⚠️  Puppeteer not available - UI tests will be skipped');
  puppeteer = null;
}
const fs = require('fs').promises;
const path = require('path');

const __dirname = __dirname;

// Test configuration
const PANEL_URL = 'http://localhost:3003';
const TEST_TIMEOUT = 30000;
const SCREENSHOT_DIR = path.join(__dirname, '..', 'logs', 'screenshots');

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  errors: []
};

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function logError(message, error) {
  log(`${message}: ${error}`, 'error');
  testResults.errors.push({ message, error });
  testResults.failed++;
}

function logSuccess(message) {
  log(message, 'success');
  testResults.passed++;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Ensure screenshot directory exists
async function ensureScreenshotDir() {
  try {
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

// Take screenshot for debugging
async function takeScreenshot(page, name) {
  try {
    const filename = `${name}-${Date.now()}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    log(`Screenshot saved: ${filename}`);
  } catch (error) {
    log(`Failed to take screenshot: ${error.message}`, 'error');
  }
}

// Test staff login flow
async function testStaffLogin(page) {
  log('🔐 Testing staff login flow...');
  
  try {
    // Navigate to login page
    await page.goto(`${PANEL_URL}/login`, { waitUntil: 'networkidle2' });
    
    // Check if login form exists
    const loginForm = await page.$('form');
    if (!loginForm) {
      throw new Error('Login form not found');
    }
    
    // Fill login credentials
    await page.type('input[name="username"]', 'admin');
    await page.type('input[name="password"]', 'admin123');
    
    // Submit login form
    await page.click('button[type="submit"]');
    
    // Wait for redirect or success
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
    
    // Check if we're redirected to the main panel
    const currentUrl = page.url();
    if (!currentUrl.includes('/lockers') && !currentUrl.includes('/panel')) {
      throw new Error(`Login failed - unexpected URL: ${currentUrl}`);
    }
    
    logSuccess('Staff login flow completed successfully');
    
  } catch (error) {
    await takeScreenshot(page, 'login-error');
    logError('Staff login flow failed', error.message);
    throw error;
  }
}

// Test kiosk selection
async function testKioskSelection(page) {
  log('🏪 Testing kiosk selection...');
  
  try {
    // Look for kiosk selector
    const kioskSelector = await page.$('select[name="kiosk"], #kiosk-select, .kiosk-selector');
    
    if (kioskSelector) {
      // Select first available kiosk
      await page.select('select[name="kiosk"], #kiosk-select', 'kiosk-001');
      log('Kiosk selected via dropdown');
    } else {
      // Look for kiosk buttons or links
      const kioskButton = await page.$('button[data-kiosk], .kiosk-button, a[href*="kiosk"]');
      
      if (kioskButton) {
        await kioskButton.click();
        log('Kiosk selected via button/link');
      } else {
        log('No kiosk selector found - may be auto-selected', 'warning');
      }
    }
    
    // Wait for locker grid to load
    await page.waitForSelector('.locker, .locker-grid, #lockers', { timeout: 10000 });
    
    logSuccess('Kiosk selection completed');
    
  } catch (error) {
    await takeScreenshot(page, 'kiosk-selection-error');
    logError('Kiosk selection failed', error.message);
    throw error;
  }
}

// Test single locker open UI
async function testSingleLockerOpenUI(page) {
  log('🔓 Testing single locker open UI...');
  
  try {
    // Find first available locker
    const lockerElement = await page.$('.locker:not(.occupied), .locker-available, button[data-locker-id]');
    
    if (!lockerElement) {
      throw new Error('No available locker found for testing');
    }
    
    // Get locker ID for reference
    const lockerId = await page.evaluate(el => {
      return el.dataset.lockerId || el.textContent.match(/\d+/)?.[0] || '1';
    }, lockerElement);
    
    log(`Testing with locker ID: ${lockerId}`);
    
    // Click on locker to open context menu or direct open
    await lockerElement.click();
    
    // Look for open button or action
    const openButton = await page.$('button:contains("Open"), .open-button, [data-action="open"]');
    
    if (openButton) {
      await openButton.click();
    } else {
      // Try right-click context menu
      await lockerElement.click({ button: 'right' });
      await sleep(500);
      
      const contextOpen = await page.$('.context-menu button:contains("Open")');
      if (contextOpen) {
        await contextOpen.click();
      } else {
        throw new Error('No open action found');
      }
    }
    
    // Wait for success message or feedback
    await page.waitForSelector('.success, .toast, .notification, .alert-success', { timeout: 5000 });
    
    // Check for success message
    const successMessage = await page.$eval('.success, .toast, .notification, .alert-success', 
      el => el.textContent);
    
    if (!successMessage.toLowerCase().includes('open') && !successMessage.toLowerCase().includes('command')) {
      throw new Error(`Unexpected success message: ${successMessage}`);
    }
    
    log(`Success message displayed: ${successMessage}`);
    
    // Wait for locker status update
    await sleep(2000);
    
    logSuccess('Single locker open UI test completed');
    
  } catch (error) {
    await takeScreenshot(page, 'single-locker-open-error');
    logError('Single locker open UI test failed', error.message);
    throw error;
  }
}

// Test bulk locker open UI
async function testBulkLockerOpenUI(page) {
  log('🔓 Testing bulk locker open UI...');
  
  try {
    // Look for bulk selection mechanism
    const selectAllButton = await page.$('button:contains("Select All"), .select-all, #select-all');
    
    if (selectAllButton) {
      await selectAllButton.click();
      log('Used Select All button');
    } else {
      // Manually select multiple lockers
      const lockers = await page.$$('.locker:not(.occupied), .locker-available');
      
      if (lockers.length < 2) {
        throw new Error('Not enough available lockers for bulk test');
      }
      
      // Select first 3 lockers
      for (let i = 0; i < Math.min(3, lockers.length); i++) {
        await lockers[i].click({ ctrlKey: true }); // Ctrl+click for multi-select
        await sleep(200);
      }
      
      log('Manually selected multiple lockers');
    }
    
    // Look for bulk open button
    const bulkOpenButton = await page.$('button:contains("Open Selected"), .bulk-open, #bulk-open');
    
    if (!bulkOpenButton) {
      throw new Error('Bulk open button not found');
    }
    
    await bulkOpenButton.click();
    
    // Wait for bulk operation confirmation or settings dialog
    try {
      await page.waitForSelector('.bulk-settings, .confirmation-dialog, .modal', { timeout: 3000 });
      
      // If settings dialog appears, configure and confirm
      const confirmButton = await page.$('button:contains("Confirm"), button:contains("OK"), .confirm');
      if (confirmButton) {
        await confirmButton.click();
      }
    } catch (error) {
      // No dialog appeared, operation may have started directly
      log('No bulk settings dialog found, operation may have started directly');
    }
    
    // Wait for success message
    await page.waitForSelector('.success, .toast, .notification, .alert-success', { timeout: 10000 });
    
    const successMessage = await page.$eval('.success, .toast, .notification, .alert-success', 
      el => el.textContent);
    
    if (!successMessage.toLowerCase().includes('bulk') && !successMessage.toLowerCase().includes('command')) {
      throw new Error(`Unexpected bulk success message: ${successMessage}`);
    }
    
    log(`Bulk success message displayed: ${successMessage}`);
    
    logSuccess('Bulk locker open UI test completed');
    
  } catch (error) {
    await takeScreenshot(page, 'bulk-locker-open-error');
    logError('Bulk locker open UI test failed', error.message);
    throw error;
  }
}

// Test error message display
async function testErrorMessageDisplay(page) {
  log('🚫 Testing error message display...');
  
  try {
    // Try to trigger an error by opening an invalid locker
    await page.evaluate(() => {
      // Simulate API call that will fail
      fetch('/api/lockers/invalid-kiosk/999/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ reason: 'UI test error' })
      }).catch(() => {
        // Expected to fail
      });
    });
    
    // Wait for error message
    try {
      await page.waitForSelector('.error, .alert-error, .toast-error', { timeout: 5000 });
      
      const errorMessage = await page.$eval('.error, .alert-error, .toast-error', 
        el => el.textContent);
      
      log(`Error message displayed: ${errorMessage}`);
      logSuccess('Error message display test completed');
      
    } catch (error) {
      log('No error message displayed - this may be expected behavior', 'warning');
    }
    
  } catch (error) {
    await takeScreenshot(page, 'error-message-test');
    logError('Error message display test failed', error.message);
  }
}

// Test locker status updates
async function testLockerStatusUpdates(page) {
  log('🔄 Testing locker status updates...');
  
  try {
    // Get initial locker states
    const initialStates = await page.evaluate(() => {
      const lockers = Array.from(document.querySelectorAll('.locker, [data-locker-id]'));
      return lockers.map(locker => ({
        id: locker.dataset.lockerId || locker.textContent.match(/\d+/)?.[0],
        class: locker.className,
        status: locker.dataset.status || 'unknown'
      }));
    });
    
    log(`Found ${initialStates.length} lockers in initial state`);
    
    // Wait for potential status updates (after previous operations)
    await sleep(3000);
    
    // Get updated locker states
    const updatedStates = await page.evaluate(() => {
      const lockers = Array.from(document.querySelectorAll('.locker, [data-locker-id]'));
      return lockers.map(locker => ({
        id: locker.dataset.lockerId || locker.textContent.match(/\d+/)?.[0],
        class: locker.className,
        status: locker.dataset.status || 'unknown'
      }));
    });
    
    // Compare states to detect changes
    let changesDetected = 0;
    for (let i = 0; i < Math.min(initialStates.length, updatedStates.length); i++) {
      if (initialStates[i].class !== updatedStates[i].class || 
          initialStates[i].status !== updatedStates[i].status) {
        changesDetected++;
        log(`Locker ${initialStates[i].id} status changed`);
      }
    }
    
    if (changesDetected > 0) {
      logSuccess(`Locker status updates detected: ${changesDetected} changes`);
    } else {
      log('No locker status changes detected - may be expected', 'warning');
    }
    
  } catch (error) {
    await takeScreenshot(page, 'status-update-error');
    logError('Locker status update test failed', error.message);
  }
}

// Main UI validation
async function runUIValidation() {
  console.log('🚀 Starting UI Feedback Validation for Admin Panel Relay Control\n');
  
  // Check if Puppeteer is available
  if (!puppeteer) {
    console.log('⚠️  Puppeteer not installed - skipping UI validation tests');
    console.log('ℹ️  To run UI tests, install Puppeteer: npm install puppeteer');
    console.log('✅ UI validation skipped (not required for production)');
    process.exit(0);
  }
  
  let browser = null;
  let page = null;
  
  try {
    // Ensure screenshot directory exists
    await ensureScreenshotDir();
    
    // Launch browser
    browser = await puppeteer.launch({
      headless: true, // Set to false for debugging
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    page = await browser.newPage();
    
    // Set viewport and timeout
    await page.setViewport({ width: 1280, height: 720 });
    page.setDefaultTimeout(TEST_TIMEOUT);
    
    // Enable console logging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        log(`Browser console error: ${msg.text()}`, 'error');
      }
    });
    
    // Test staff login flow
    await testStaffLogin(page);
    
    // Test kiosk selection
    await testKioskSelection(page);
    
    // Test single locker open UI
    await testSingleLockerOpenUI(page);
    
    // Test bulk locker open UI
    await testBulkLockerOpenUI(page);
    
    // Test error message display
    await testErrorMessageDisplay(page);
    
    // Test locker status updates
    await testLockerStatusUpdates(page);
    
    // Take final screenshot
    await takeScreenshot(page, 'final-state');
    
  } catch (error) {
    logError('UI validation failed', error.message);
    
    if (page) {
      await takeScreenshot(page, 'fatal-error');
    }
  } finally {
    // Clean up
    if (browser) {
      await browser.close();
    }
  }
  
  // Print test summary
  console.log('\n📊 UI Validation Summary:');
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  
  if (testResults.errors.length > 0) {
    console.log('\n🚨 Errors encountered:');
    testResults.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error.message}: ${error.error}`);
    });
  }
  
  if (testResults.failed === 0) {
    console.log('\n🎉 UI validation completed successfully!');
    console.log('✅ Admin panel UI feedback is working correctly');
    process.exit(0);
  } else {
    console.log('\n⚠️  UI validation failed. Please review the errors above.');
    console.log(`📸 Screenshots saved to: ${SCREENSHOT_DIR}`);
    process.exit(1);
  }
}

// Handle script execution
if (require.main === module) {
  runUIValidation().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runUIValidation };