/**
 * End-to-End Tests for Hardware Configuration Wizard Flow
 * 
 * Tests complete wizard workflows using Playwright, including error scenarios,
 * recovery procedures, hardware simulation, accessibility, and responsive design.
 * 
 * Requirements: All user interface requirements (2.1-9.6)
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { randomUUID } from 'crypto';

// Test configuration
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';
const WIZARD_URL = `${BASE_URL}/panel/hardware-wizard`;

// Hardware simulation helpers
class HardwareSimulator {
  private devices: Map<number, any> = new Map();
  private serialPorts: string[] = ['/dev/ttyUSB0', '/dev/ttyUSB1'];

  addDevice(address: number, type: string = 'waveshare_16ch') {
    this.devices.set(address, {
      address,
      type,
      channels: 16,
      responding: true,
      responseTime: 50 + Math.random() * 100
    });
  }

  removeDevice(address: number) {
    this.devices.delete(address);
  }

  getDevices() {
    return Array.from(this.devices.values());
  }

  simulateTimeout(address: number) {
    const device = this.devices.get(address);
    if (device) {
      device.responding = false;
    }
  }

  reset() {
    this.devices.clear();
    this.addDevice(1); // Default device
  }
}

// Page object model for wizard
class WizardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto(WIZARD_URL);
    await this.page.waitForLoadState('networkidle');
  }

  async startWizard() {
    await this.page.click('[data-testid="start-wizard-button"]');
    await this.page.waitForSelector('[data-testid="wizard-container"]');
  }

  async getCurrentStep(): Promise<number> {
    const stepElement = await this.page.locator('[data-testid="current-step"]');
    const stepText = await stepElement.textContent();
    return parseInt(stepText?.match(/\d+/)?.[0] || '1');
  }

  async getStepTitle(): Promise<string> {
    const titleElement = await this.page.locator('[data-testid="step-title"]');
    return await titleElement.textContent() || '';
  }

  async isStepValid(): Promise<boolean> {
    const nextButton = await this.page.locator('[data-testid="next-step-button"]');
    return await nextButton.isEnabled();
  }

  async nextStep() {
    await this.page.click('[data-testid="next-step-button"]');
    await this.page.waitForTimeout(500); // Wait for transition
  }

  async previousStep() {
    await this.page.click('[data-testid="previous-step-button"]');
    await this.page.waitForTimeout(500);
  }

  async cancelWizard() {
    await this.page.click('[data-testid="cancel-wizard-button"]');
    await this.page.waitForSelector('[data-testid="cancel-confirmation"]');
    await this.page.click('[data-testid="confirm-cancel"]');
  }

  // Step 1: Pre-Setup Checklist
  async completePreSetupChecklist() {
    await this.page.check('[data-testid="power-off-checkbox"]');
    await this.page.check('[data-testid="connections-checkbox"]');
    await this.page.check('[data-testid="safety-checkbox"]');
    await this.page.click('[data-testid="verify-connection-button"]');
    await this.page.waitForSelector('[data-testid="connection-verified"]');
  }

  // Step 2: Device Detection
  async performDeviceDetection() {
    await this.page.click('[data-testid="scan-ports-button"]');
    await this.page.waitForSelector('[data-testid="ports-found"]');
    
    await this.page.selectOption('[data-testid="port-select"]', '/dev/ttyUSB0');
    await this.page.click('[data-testid="scan-devices-button"]');
    await this.page.waitForSelector('[data-testid="devices-found"]');
  }

  async getDetectedDevices(): Promise<any[]> {
    const deviceElements = await this.page.locator('[data-testid="detected-device"]').all();
    const devices = [];
    
    for (const element of deviceElements) {
      const address = await element.getAttribute('data-address');
      const type = await element.getAttribute('data-type');
      devices.push({ address: parseInt(address || '0'), type });
    }
    
    return devices;
  }

  // Step 3: Address Configuration
  async configureAddress() {
    await this.page.click('[data-testid="auto-configure-button"]');
    await this.page.waitForSelector('[data-testid="address-configured"]');
  }

  async getAssignedAddress(): Promise<number> {
    const addressElement = await this.page.locator('[data-testid="assigned-address"]');
    const addressText = await addressElement.textContent();
    return parseInt(addressText?.match(/\d+/)?.[0] || '0');
  }

  // Step 4: Testing and Validation
  async runHardwareTests() {
    await this.page.click('[data-testid="run-tests-button"]');
    await this.page.waitForSelector('[data-testid="tests-completed"]');
  }

  async getTestResults(): Promise<any> {
    const resultsElement = await this.page.locator('[data-testid="test-results"]');
    const resultsText = await resultsElement.textContent();
    return JSON.parse(resultsText || '{}');
  }

  async waitForTestProgress() {
    await this.page.waitForSelector('[data-testid="test-progress"]');
    
    // Wait for progress to complete
    await this.page.waitForFunction(() => {
      const progressBar = document.querySelector('[data-testid="test-progress-bar"]') as HTMLElement;
      return progressBar?.style.width === '100%';
    });
  }

  // Step 5: System Integration
  async completeIntegration() {
    await this.page.click('[data-testid="integrate-system-button"]');
    await this.page.waitForSelector('[data-testid="integration-completed"]');
  }

  async getIntegrationSummary(): Promise<any> {
    const summaryElement = await this.page.locator('[data-testid="integration-summary"]');
    const summaryText = await summaryElement.textContent();
    return JSON.parse(summaryText || '{}');
  }

  // Error handling
  async getErrorMessage(): Promise<string> {
    const errorElement = await this.page.locator('[data-testid="error-message"]');
    return await errorElement.textContent() || '';
  }

  async hasError(): Promise<boolean> {
    return await this.page.locator('[data-testid="error-message"]').isVisible();
  }

  async dismissError() {
    await this.page.click('[data-testid="dismiss-error-button"]');
  }

  async retryOperation() {
    await this.page.click('[data-testid="retry-button"]');
  }

  // Troubleshooting
  async openTroubleshooting() {
    await this.page.click('[data-testid="troubleshooting-button"]');
    await this.page.waitForSelector('[data-testid="troubleshooting-wizard"]');
  }

  async followTroubleshootingStep(stepIndex: number) {
    await this.page.click(`[data-testid="troubleshooting-step-${stepIndex}"]`);
    await this.page.waitForTimeout(1000);
  }
}

// Accessibility helpers
class AccessibilityHelper {
  constructor(private page: Page) {}

  async checkKeyboardNavigation() {
    // Test tab navigation
    await this.page.keyboard.press('Tab');
    const focusedElement = await this.page.locator(':focus');
    expect(await focusedElement.count()).toBeGreaterThan(0);
  }

  async checkAriaLabels() {
    const elementsWithoutAria = await this.page.locator('button:not([aria-label]):not([aria-labelledby])').count();
    expect(elementsWithoutAria).toBe(0);
  }

  async checkColorContrast() {
    // This would typically use axe-core or similar
    const contrastIssues = await this.page.evaluate(() => {
      // Simplified contrast check
      const elements = document.querySelectorAll('*');
      let issues = 0;
      
      elements.forEach(el => {
        const styles = window.getComputedStyle(el);
        const bgColor = styles.backgroundColor;
        const textColor = styles.color;
        
        // Basic contrast check (simplified)
        if (bgColor === 'rgb(255, 255, 255)' && textColor === 'rgb(255, 255, 255)') {
          issues++;
        }
      });
      
      return issues;
    });
    
    expect(contrastIssues).toBe(0);
  }

  async checkScreenReaderSupport() {
    const ariaLiveRegions = await this.page.locator('[aria-live]').count();
    expect(ariaLiveRegions).toBeGreaterThan(0);
  }
}

// Test suite
test.describe('Hardware Configuration Wizard - End-to-End Tests', () => {
  let hardwareSimulator: HardwareSimulator;
  let wizardPage: WizardPage;
  let accessibilityHelper: AccessibilityHelper;

  test.beforeEach(async ({ page, context }) => {
    hardwareSimulator = new HardwareSimulator();
    hardwareSimulator.reset();
    
    wizardPage = new WizardPage(page);
    accessibilityHelper = new AccessibilityHelper(page);

    // Setup hardware simulation API mocking
    await context.route('**/api/hardware-config/scan-ports', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          ports: [
            { path: '/dev/ttyUSB0', manufacturer: 'FTDI', available: true },
            { path: '/dev/ttyUSB1', manufacturer: 'Prolific', available: true }
          ]
        })
      });
    });

    await context.route('**/api/hardware-config/scan-devices**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          devices: hardwareSimulator.getDevices()
        })
      });
    });

    await context.route('**/api/hardware-config/set-slave-address', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          old_address: 0,
          new_address: 2,
          verification_passed: true
        })
      });
    });

    await context.route('**/api/hardware-config/test-card', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          test_suite: {
            total_tests: 3,
            passed_tests: 3,
            failed_tests: 0,
            overall_success: true,
            results: [
              { testName: 'Communication', success: true },
              { testName: 'Relay 1', success: true },
              { testName: 'Relay 8', success: true }
            ]
          }
        })
      });
    });
  });

  test.describe('Complete Wizard Flow', () => {
    test('should complete successful wizard flow', async ({ page }) => {
      await wizardPage.goto();
      await wizardPage.startWizard();

      // Step 1: Pre-Setup Checklist
      expect(await wizardPage.getCurrentStep()).toBe(1);
      expect(await wizardPage.getStepTitle()).toContain('Pre-Setup Checklist');
      
      await wizardPage.completePreSetupChecklist();
      expect(await wizardPage.isStepValid()).toBe(true);
      await wizardPage.nextStep();

      // Step 2: Device Detection
      expect(await wizardPage.getCurrentStep()).toBe(2);
      expect(await wizardPage.getStepTitle()).toContain('Device Detection');
      
      await wizardPage.performDeviceDetection();
      const detectedDevices = await wizardPage.getDetectedDevices();
      expect(detectedDevices.length).toBeGreaterThan(0);
      await wizardPage.nextStep();

      // Step 3: Address Configuration
      expect(await wizardPage.getCurrentStep()).toBe(3);
      expect(await wizardPage.getStepTitle()).toContain('Address Configuration');
      
      await wizardPage.configureAddress();
      const assignedAddress = await wizardPage.getAssignedAddress();
      expect(assignedAddress).toBeGreaterThan(0);
      await wizardPage.nextStep();

      // Step 4: Testing and Validation
      expect(await wizardPage.getCurrentStep()).toBe(4);
      expect(await wizardPage.getStepTitle()).toContain('Testing');
      
      await wizardPage.runHardwareTests();
      await wizardPage.waitForTestProgress();
      const testResults = await wizardPage.getTestResults();
      expect(testResults.overall_success).toBe(true);
      await wizardPage.nextStep();

      // Step 5: System Integration
      expect(await wizardPage.getCurrentStep()).toBe(5);
      expect(await wizardPage.getStepTitle()).toContain('Integration');
      
      await wizardPage.completeIntegration();
      const summary = await wizardPage.getIntegrationSummary();
      expect(summary.success).toBe(true);

      // Verify completion
      await expect(page.locator('[data-testid="wizard-completed"]')).toBeVisible();
      await expect(page.locator('[data-testid="success-message"]')).toContainText('successfully');
    });

    test('should handle wizard cancellation', async ({ page }) => {
      await wizardPage.goto();
      await wizardPage.startWizard();
      
      // Complete first step
      await wizardPage.completePreSetupChecklist();
      await wizardPage.nextStep();
      
      // Cancel wizard
      await wizardPage.cancelWizard();
      
      // Verify cancellation
      await expect(page.locator('[data-testid="wizard-cancelled"]')).toBeVisible();
      await expect(page.locator('[data-testid="cancel-message"]')).toContainText('cancelled');
    });

    test('should support step navigation', async ({ page }) => {
      await wizardPage.goto();
      await wizardPage.startWizard();
      
      // Complete first two steps
      await wizardPage.completePreSetupChecklist();
      await wizardPage.nextStep();
      await wizardPage.performDeviceDetection();
      await wizardPage.nextStep();
      
      expect(await wizardPage.getCurrentStep()).toBe(3);
      
      // Go back to previous step
      await wizardPage.previousStep();
      expect(await wizardPage.getCurrentStep()).toBe(2);
      
      // Go forward again
      await wizardPage.nextStep();
      expect(await wizardPage.getCurrentStep()).toBe(3);
    });
  });

  test.describe('Error Scenarios and Recovery', () => {
    test('should handle device detection failure', async ({ page, context }) => {
      // Mock device detection failure
      await context.route('**/api/hardware-config/scan-devices**', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Device scan timeout'
          })
        });
      });

      await wizardPage.goto();
      await wizardPage.startWizard();
      
      // Complete checklist
      await wizardPage.completePreSetupChecklist();
      await wizardPage.nextStep();
      
      // Attempt device detection
      await wizardPage.performDeviceDetection();
      
      // Verify error handling
      expect(await wizardPage.hasError()).toBe(true);
      expect(await wizardPage.getErrorMessage()).toContain('timeout');
      
      // Test retry functionality
      await wizardPage.retryOperation();
      // Error should persist with same mock
      expect(await wizardPage.hasError()).toBe(true);
    });

    test('should handle address configuration failure', async ({ page, context }) => {
      // Mock address configuration failure
      await context.route('**/api/hardware-config/set-slave-address', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Address configuration failed'
          })
        });
      });

      await wizardPage.goto();
      await wizardPage.startWizard();
      
      // Complete first two steps
      await wizardPage.completePreSetupChecklist();
      await wizardPage.nextStep();
      await wizardPage.performDeviceDetection();
      await wizardPage.nextStep();
      
      // Attempt address configuration
      await wizardPage.configureAddress();
      
      // Verify error handling
      expect(await wizardPage.hasError()).toBe(true);
      expect(await wizardPage.getErrorMessage()).toContain('configuration failed');
    });

    test('should handle hardware test failures', async ({ page, context }) => {
      // Mock test failure
      await context.route('**/api/hardware-config/test-card', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            test_suite: {
              total_tests: 3,
              passed_tests: 1,
              failed_tests: 2,
              overall_success: false,
              results: [
                { testName: 'Communication', success: true },
                { testName: 'Relay 1', success: false, error: 'No response' },
                { testName: 'Relay 8', success: false, error: 'Timeout' }
              ]
            }
          })
        });
      });

      await wizardPage.goto();
      await wizardPage.startWizard();
      
      // Complete first three steps
      await wizardPage.completePreSetupChecklist();
      await wizardPage.nextStep();
      await wizardPage.performDeviceDetection();
      await wizardPage.nextStep();
      await wizardPage.configureAddress();
      await wizardPage.nextStep();
      
      // Run tests
      await wizardPage.runHardwareTests();
      await wizardPage.waitForTestProgress();
      
      const testResults = await wizardPage.getTestResults();
      expect(testResults.overall_success).toBe(false);
      expect(testResults.failed_tests).toBe(2);
      
      // Should not be able to proceed
      expect(await wizardPage.isStepValid()).toBe(false);
    });

    test('should provide troubleshooting guidance', async ({ page }) => {
      await wizardPage.goto();
      await wizardPage.startWizard();
      
      // Complete checklist but simulate connection issue
      await wizardPage.completePreSetupChecklist();
      await wizardPage.nextStep();
      
      // Open troubleshooting
      await wizardPage.openTroubleshooting();
      
      // Verify troubleshooting wizard is available
      await expect(page.locator('[data-testid="troubleshooting-wizard"]')).toBeVisible();
      await expect(page.locator('[data-testid="troubleshooting-step-0"]')).toBeVisible();
      
      // Follow first troubleshooting step
      await wizardPage.followTroubleshootingStep(0);
      await expect(page.locator('[data-testid="troubleshooting-step-1"]')).toBeVisible();
    });
  });

  test.describe('Hardware Simulation', () => {
    test('should handle multiple devices', async ({ page }) => {
      // Add multiple devices to simulator
      hardwareSimulator.addDevice(1, 'waveshare_16ch');
      hardwareSimulator.addDevice(2, 'waveshare_16ch');
      hardwareSimulator.addDevice(3, 'waveshare_8ch');

      await wizardPage.goto();
      await wizardPage.startWizard();
      
      await wizardPage.completePreSetupChecklist();
      await wizardPage.nextStep();
      await wizardPage.performDeviceDetection();
      
      const detectedDevices = await wizardPage.getDetectedDevices();
      expect(detectedDevices.length).toBe(3);
      expect(detectedDevices.map(d => d.address)).toEqual([1, 2, 3]);
    });

    test('should handle device timeout scenarios', async ({ page, context }) => {
      // Simulate device timeout
      hardwareSimulator.simulateTimeout(1);
      
      await context.route('**/api/hardware-config/scan-devices**', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            devices: [] // No devices found due to timeout
          })
        });
      });

      await wizardPage.goto();
      await wizardPage.startWizard();
      
      await wizardPage.completePreSetupChecklist();
      await wizardPage.nextStep();
      await wizardPage.performDeviceDetection();
      
      const detectedDevices = await wizardPage.getDetectedDevices();
      expect(detectedDevices.length).toBe(0);
      
      // Should show appropriate message
      await expect(page.locator('[data-testid="no-devices-found"]')).toBeVisible();
    });

    test('should handle address conflicts', async ({ page, context }) => {
      // Mock address conflict scenario
      await context.route('**/api/hardware-config/scan-devices**', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            devices: [
              { address: 1, type: 'waveshare_16ch' },
              { address: 1, type: 'waveshare_16ch' } // Duplicate address
            ]
          })
        });
      });

      await wizardPage.goto();
      await wizardPage.startWizard();
      
      await wizardPage.completePreSetupChecklist();
      await wizardPage.nextStep();
      await wizardPage.performDeviceDetection();
      
      // Should detect conflict
      await expect(page.locator('[data-testid="address-conflict-warning"]')).toBeVisible();
    });
  });

  test.describe('Accessibility Testing', () => {
    test('should support keyboard navigation', async ({ page }) => {
      await wizardPage.goto();
      await accessibilityHelper.checkKeyboardNavigation();
      
      // Test tab order through wizard
      await page.keyboard.press('Tab'); // Start wizard button
      await page.keyboard.press('Enter');
      
      await wizardPage.completePreSetupChecklist();
      
      // Navigate using keyboard
      await page.keyboard.press('Tab'); // Next button
      await page.keyboard.press('Enter');
      
      expect(await wizardPage.getCurrentStep()).toBe(2);
    });

    test('should have proper ARIA labels', async ({ page }) => {
      await wizardPage.goto();
      await wizardPage.startWizard();
      
      await accessibilityHelper.checkAriaLabels();
      
      // Check specific wizard elements
      await expect(page.locator('[data-testid="wizard-container"]')).toHaveAttribute('role', 'main');
      await expect(page.locator('[data-testid="step-title"]')).toHaveAttribute('role', 'heading');
      await expect(page.locator('[data-testid="progress-bar"]')).toHaveAttribute('role', 'progressbar');
    });

    test('should support screen readers', async ({ page }) => {
      await wizardPage.goto();
      await wizardPage.startWizard();
      
      await accessibilityHelper.checkScreenReaderSupport();
      
      // Check for live regions that announce changes
      await expect(page.locator('[aria-live="polite"]')).toBeVisible();
      
      // Test step changes are announced
      await wizardPage.completePreSetupChecklist();
      await wizardPage.nextStep();
      
      const liveRegion = page.locator('[aria-live="polite"]');
      await expect(liveRegion).toContainText('Step 2');
    });

    test('should have sufficient color contrast', async ({ page }) => {
      await wizardPage.goto();
      await wizardPage.startWizard();
      
      await accessibilityHelper.checkColorContrast();
    });

    test('should handle high contrast mode', async ({ page }) => {
      // Simulate high contrast mode
      await page.addStyleTag({
        content: `
          @media (prefers-contrast: high) {
            * { 
              background: black !important; 
              color: white !important; 
              border: 1px solid white !important;
            }
          }
        `
      });

      await wizardPage.goto();
      await wizardPage.startWizard();
      
      // Verify elements are still visible and functional
      await expect(page.locator('[data-testid="wizard-container"]')).toBeVisible();
      await expect(page.locator('[data-testid="start-wizard-button"]')).toBeVisible();
    });
  });

  test.describe('Responsive Design Testing', () => {
    test('should work on tablet devices', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      
      await wizardPage.goto();
      await wizardPage.startWizard();
      
      // Verify layout adapts to tablet
      const container = page.locator('[data-testid="wizard-container"]');
      const containerWidth = await container.evaluate(el => el.clientWidth);
      expect(containerWidth).toBeLessThanOrEqual(768);
      
      // Test touch interactions
      await page.tap('[data-testid="power-off-checkbox"]');
      await page.tap('[data-testid="connections-checkbox"]');
      await page.tap('[data-testid="safety-checkbox"]');
      
      expect(await wizardPage.isStepValid()).toBe(false); // Still need connection verification
    });

    test('should work on mobile devices', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      
      await wizardPage.goto();
      await wizardPage.startWizard();
      
      // Verify mobile layout
      const container = page.locator('[data-testid="wizard-container"]');
      await expect(container).toHaveCSS('flex-direction', 'column');
      
      // Test mobile navigation
      await wizardPage.completePreSetupChecklist();
      await wizardPage.nextStep();
      
      // Verify step navigation works on mobile
      expect(await wizardPage.getCurrentStep()).toBe(2);
    });

    test('should handle orientation changes', async ({ page }) => {
      await page.setViewportSize({ width: 667, height: 375 }); // Landscape
      
      await wizardPage.goto();
      await wizardPage.startWizard();
      
      // Complete first step in landscape
      await wizardPage.completePreSetupChecklist();
      
      // Change to portrait
      await page.setViewportSize({ width: 375, height: 667 });
      
      // Verify functionality still works
      await wizardPage.nextStep();
      expect(await wizardPage.getCurrentStep()).toBe(2);
    });

    test('should handle very small screens', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 568 }); // iPhone SE
      
      await wizardPage.goto();
      await wizardPage.startWizard();
      
      // Verify content is still accessible
      await expect(page.locator('[data-testid="step-title"]')).toBeVisible();
      await expect(page.locator('[data-testid="next-step-button"]')).toBeVisible();
      
      // Test scrolling if needed
      const containerHeight = await page.locator('[data-testid="wizard-container"]').evaluate(el => el.scrollHeight);
      if (containerHeight > 568) {
        await page.mouse.wheel(0, 100);
        await expect(page.locator('[data-testid="next-step-button"]')).toBeVisible();
      }
    });
  });

  test.describe('Performance Testing', () => {
    test('should load wizard within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      
      await wizardPage.goto();
      await wizardPage.startWizard();
      
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(3000); // Should load within 3 seconds
    });

    test('should handle rapid user interactions', async ({ page }) => {
      await wizardPage.goto();
      await wizardPage.startWizard();
      
      // Rapidly click through checklist
      await page.click('[data-testid="power-off-checkbox"]');
      await page.click('[data-testid="connections-checkbox"]');
      await page.click('[data-testid="safety-checkbox"]');
      await page.click('[data-testid="verify-connection-button"]');
      
      // Should handle rapid clicks gracefully
      await page.waitForSelector('[data-testid="connection-verified"]');
      expect(await wizardPage.isStepValid()).toBe(true);
    });

    test('should maintain performance with large datasets', async ({ page, context }) => {
      // Mock large number of devices
      const manyDevices = Array.from({ length: 100 }, (_, i) => ({
        address: i + 1,
        type: 'waveshare_16ch',
        responding: true
      }));

      await context.route('**/api/hardware-config/scan-devices**', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            devices: manyDevices
          })
        });
      });

      await wizardPage.goto();
      await wizardPage.startWizard();
      
      await wizardPage.completePreSetupChecklist();
      await wizardPage.nextStep();
      
      const startTime = Date.now();
      await wizardPage.performDeviceDetection();
      const scanTime = Date.now() - startTime;
      
      // Should handle large datasets within reasonable time
      expect(scanTime).toBeLessThan(5000);
      
      const detectedDevices = await wizardPage.getDetectedDevices();
      expect(detectedDevices.length).toBe(100);
    });
  });

  test.describe('Browser Compatibility', () => {
    test('should work in different browsers', async ({ browserName, page }) => {
      await wizardPage.goto();
      await wizardPage.startWizard();
      
      // Basic functionality should work across browsers
      await wizardPage.completePreSetupChecklist();
      expect(await wizardPage.isStepValid()).toBe(true);
      
      await wizardPage.nextStep();
      expect(await wizardPage.getCurrentStep()).toBe(2);
      
      // Log browser-specific behavior for debugging
      console.log(`Test passed in ${browserName}`);
    });

    test('should handle browser-specific features gracefully', async ({ page }) => {
      // Test WebSocket support
      const hasWebSocket = await page.evaluate(() => typeof WebSocket !== 'undefined');
      expect(hasWebSocket).toBe(true);
      
      // Test localStorage support
      const hasLocalStorage = await page.evaluate(() => typeof localStorage !== 'undefined');
      expect(hasLocalStorage).toBe(true);
      
      await wizardPage.goto();
      await wizardPage.startWizard();
      
      // Wizard should work regardless of feature support
      await expect(page.locator('[data-testid="wizard-container"]')).toBeVisible();
    });
  });
});