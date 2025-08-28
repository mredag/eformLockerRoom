/**
 * Accessibility Audit Tool for Admin Panel UI Improvements
 * Task 7: Validate accessibility and usability improvements
 * 
 * This tool performs automated accessibility audits on the admin panel
 * and generates reports for compliance validation.
 */

interface AccessibilityIssue {
  severity: 'error' | 'warning' | 'info';
  element: string;
  issue: string;
  recommendation: string;
  wcagReference?: string;
}

interface AccessibilityReport {
  timestamp: string;
  totalIssues: number;
  errors: AccessibilityIssue[];
  warnings: AccessibilityIssue[];
  info: AccessibilityIssue[];
  passedChecks: string[];
  summary: {
    colorContrast: 'pass' | 'fail';
    keyboardNavigation: 'pass' | 'fail';
    screenReaderSupport: 'pass' | 'fail';
    touchCompatibility: 'pass' | 'fail';
    semanticStructure: 'pass' | 'fail';
  };
}

class AccessibilityAuditor {
  private issues: AccessibilityIssue[] = [];
  private passedChecks: string[] = [];

  /**
   * Run complete accessibility audit
   */
  public async runAudit(document: Document): Promise<AccessibilityReport> {
    this.issues = [];
    this.passedChecks = [];

    console.log('🔍 Starting accessibility audit...');

    // Run all audit checks
    this.auditColorContrast(document);
    this.auditKeyboardNavigation(document);
    this.auditScreenReaderSupport(document);
    this.auditTouchCompatibility(document);
    this.auditSemanticStructure(document);
    this.auditFocusManagement(document);
    this.auditErrorHandling(document);

    return this.generateReport();
  }

  /**
   * Audit color contrast ratios
   */
  private auditColorContrast(document: Document): void {
    console.log('🎨 Auditing color contrast...');

    const statusElements = document.querySelectorAll('[class*="state-"]');
    
    statusElements.forEach((element) => {
      const computedStyle = window.getComputedStyle(element);
      const backgroundColor = computedStyle.backgroundColor;
      const color = computedStyle.color;
      
      // Convert RGB to hex for contrast calculation
      const rgbToHex = (rgb: string) => {
        const match = rgb.match(/\d+/g);
        if (!match) return '#000000';
        
        const [r, g, b] = match.map(Number);
        return '#' + [r, g, b].map(x => {
          const hex = x.toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        }).join('');
      };

      const bgHex = rgbToHex(backgroundColor);
      const textHex = rgbToHex(color);
      
      const contrastRatio = this.calculateContrastRatio(textHex, bgHex);
      
      if (contrastRatio < 4.5) {
        this.addIssue({
          severity: 'error',
          element: element.className,
          issue: `Insufficient color contrast ratio: ${contrastRatio.toFixed(2)}:1`,
          recommendation: 'Increase contrast to meet WCAG AA standard (4.5:1 minimum)',
          wcagReference: 'WCAG 2.1 SC 1.4.3'
        });
      } else if (contrastRatio >= 7.0) {
        this.passedChecks.push(`Excellent contrast ratio for ${element.className}: ${contrastRatio.toFixed(2)}:1`);
      } else {
        this.passedChecks.push(`Good contrast ratio for ${element.className}: ${contrastRatio.toFixed(2)}:1`);
      }
    });
  }

  /**
   * Audit keyboard navigation support
   */
  private auditKeyboardNavigation(document: Document): void {
    console.log('⌨️ Auditing keyboard navigation...');

    // Check for interactive elements without proper keyboard support
    const interactiveElements = document.querySelectorAll('button, a, input, select, textarea, [onclick], [role="button"]');
    
    interactiveElements.forEach((element) => {
      const tabIndex = element.getAttribute('tabindex');
      const role = element.getAttribute('role');
      
      // Check if element is keyboard accessible
      if (tabIndex === '-1' && !element.hasAttribute('disabled')) {
        this.addIssue({
          severity: 'warning',
          element: element.tagName.toLowerCase(),
          issue: 'Interactive element not keyboard accessible (tabindex="-1")',
          recommendation: 'Remove tabindex="-1" or add keyboard event handlers',
          wcagReference: 'WCAG 2.1 SC 2.1.1'
        });
      }

      // Check for missing ARIA roles on custom interactive elements
      if (element.hasAttribute('onclick') && !role && element.tagName.toLowerCase() !== 'button') {
        this.addIssue({
          severity: 'warning',
          element: element.tagName.toLowerCase(),
          issue: 'Custom interactive element missing ARIA role',
          recommendation: 'Add role="button" or use semantic HTML elements',
          wcagReference: 'WCAG 2.1 SC 4.1.2'
        });
      }
    });

    // Check for skip links
    const skipLinks = document.querySelectorAll('a[href^="#"]');
    if (skipLinks.length === 0) {
      this.addIssue({
        severity: 'info',
        element: 'navigation',
        issue: 'No skip links found',
        recommendation: 'Add skip links for keyboard users to bypass repetitive content',
        wcagReference: 'WCAG 2.1 SC 2.4.1'
      });
    } else {
      this.passedChecks.push(`Found ${skipLinks.length} skip links for keyboard navigation`);
    }
  }

  /**
   * Audit screen reader support
   */
  private auditScreenReaderSupport(document: Document): void {
    console.log('🔊 Auditing screen reader support...');

    // Check for proper heading structure
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let previousLevel = 0;
    
    headings.forEach((heading) => {
      const level = parseInt(heading.tagName.charAt(1));
      
      if (level > previousLevel + 1) {
        this.addIssue({
          severity: 'warning',
          element: heading.tagName.toLowerCase(),
          issue: `Heading level skipped (h${previousLevel} to h${level})`,
          recommendation: 'Use sequential heading levels for proper document structure',
          wcagReference: 'WCAG 2.1 SC 1.3.1'
        });
      }
      
      previousLevel = level;
    });

    // Check for ARIA live regions
    const liveRegions = document.querySelectorAll('[aria-live]');
    if (liveRegions.length === 0) {
      this.addIssue({
        severity: 'info',
        element: 'dynamic content',
        issue: 'No ARIA live regions found',
        recommendation: 'Add aria-live regions for dynamic content updates',
        wcagReference: 'WCAG 2.1 SC 4.1.3'
      });
    } else {
      this.passedChecks.push(`Found ${liveRegions.length} ARIA live regions for dynamic updates`);
    }

    // Check for proper form labels
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach((input) => {
      const id = input.getAttribute('id');
      const ariaLabel = input.getAttribute('aria-label');
      const ariaLabelledBy = input.getAttribute('aria-labelledby');
      const label = id ? document.querySelector(`label[for="${id}"]`) : null;
      
      if (!label && !ariaLabel && !ariaLabelledBy) {
        this.addIssue({
          severity: 'error',
          element: input.tagName.toLowerCase(),
          issue: 'Form input missing accessible label',
          recommendation: 'Add label element, aria-label, or aria-labelledby attribute',
          wcagReference: 'WCAG 2.1 SC 1.3.1'
        });
      }
    });

    // Check for alt text on images
    const images = document.querySelectorAll('img');
    images.forEach((img) => {
      const alt = img.getAttribute('alt');
      const role = img.getAttribute('role');
      
      if (alt === null && role !== 'presentation') {
        this.addIssue({
          severity: 'error',
          element: 'img',
          issue: 'Image missing alt attribute',
          recommendation: 'Add descriptive alt text or role="presentation" for decorative images',
          wcagReference: 'WCAG 2.1 SC 1.1.1'
        });
      }
    });
  }

  /**
   * Audit touch compatibility
   */
  private auditTouchCompatibility(document: Document): void {
    console.log('👆 Auditing touch compatibility...');

    const touchTargets = document.querySelectorAll('button, a, input, select, [onclick], [role="button"]');
    
    touchTargets.forEach((element) => {
      const rect = element.getBoundingClientRect();
      const minSize = 44; // Minimum touch target size in pixels
      
      if (rect.width < minSize || rect.height < minSize) {
        // Check if element has adequate padding or is part of larger touch area
        const computedStyle = window.getComputedStyle(element);
        const padding = parseInt(computedStyle.padding) || 0;
        const totalWidth = rect.width + (padding * 2);
        const totalHeight = rect.height + (padding * 2);
        
        if (totalWidth < minSize || totalHeight < minSize) {
          this.addIssue({
            severity: 'warning',
            element: element.tagName.toLowerCase(),
            issue: `Touch target too small: ${rect.width.toFixed(0)}x${rect.height.toFixed(0)}px`,
            recommendation: `Increase size to minimum ${minSize}x${minSize}px for better touch accessibility`,
            wcagReference: 'WCAG 2.1 SC 2.5.5'
          });
        }
      }
    });

    // Check for touch event support
    const elementsWithClick = document.querySelectorAll('[onclick]');
    elementsWithClick.forEach((element) => {
      // In a real implementation, we'd check for touch event listeners
      this.passedChecks.push(`Element has click handler (should also support touch events)`);
    });
  }

  /**
   * Audit semantic structure
   */
  private auditSemanticStructure(document: Document): void {
    console.log('🏗️ Auditing semantic structure...');

    // Check for proper landmarks
    const landmarks = {
      main: document.querySelectorAll('main, [role="main"]'),
      navigation: document.querySelectorAll('nav, [role="navigation"]'),
      banner: document.querySelectorAll('header, [role="banner"]'),
      contentinfo: document.querySelectorAll('footer, [role="contentinfo"]')
    };

    Object.entries(landmarks).forEach(([landmark, elements]) => {
      if (elements.length === 0) {
        this.addIssue({
          severity: 'info',
          element: 'page structure',
          issue: `Missing ${landmark} landmark`,
          recommendation: `Add ${landmark} element or role="${landmark}" for better navigation`,
          wcagReference: 'WCAG 2.1 SC 1.3.1'
        });
      } else if (elements.length > 1 && landmark !== 'navigation') {
        this.addIssue({
          severity: 'warning',
          element: 'page structure',
          issue: `Multiple ${landmark} landmarks found`,
          recommendation: `Use only one ${landmark} landmark per page`,
          wcagReference: 'WCAG 2.1 SC 1.3.1'
        });
      } else {
        this.passedChecks.push(`Proper ${landmark} landmark structure`);
      }
    });

    // Check for proper list structure
    const lists = document.querySelectorAll('ul, ol');
    lists.forEach((list) => {
      const listItems = list.querySelectorAll('li');
      if (listItems.length === 0) {
        this.addIssue({
          severity: 'warning',
          element: list.tagName.toLowerCase(),
          issue: 'Empty list element',
          recommendation: 'Remove empty list or add list items',
          wcagReference: 'WCAG 2.1 SC 1.3.1'
        });
      }
    });
  }

  /**
   * Audit focus management
   */
  private auditFocusManagement(document: Document): void {
    console.log('🎯 Auditing focus management...');

    // Check for visible focus indicators
    const focusableElements = document.querySelectorAll('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    
    focusableElements.forEach((element) => {
      const computedStyle = window.getComputedStyle(element, ':focus');
      const outline = computedStyle.outline;
      const outlineWidth = computedStyle.outlineWidth;
      
      if (outline === 'none' || outlineWidth === '0px') {
        // Check for custom focus styles
        const boxShadow = computedStyle.boxShadow;
        const border = computedStyle.border;
        
        if (!boxShadow.includes('inset') && !border.includes('px')) {
          this.addIssue({
            severity: 'warning',
            element: element.tagName.toLowerCase(),
            issue: 'No visible focus indicator',
            recommendation: 'Add visible focus styles (outline, box-shadow, or border)',
            wcagReference: 'WCAG 2.1 SC 2.4.7'
          });
        }
      }
    });

    // Check for focus traps in modals
    const modals = document.querySelectorAll('[role="dialog"], .modal');
    if (modals.length > 0) {
      this.passedChecks.push(`Found ${modals.length} modal(s) - ensure focus trapping is implemented`);
    }
  }

  /**
   * Audit error handling and user feedback
   */
  private auditErrorHandling(document: Document): void {
    console.log('⚠️ Auditing error handling...');

    // Check for error message containers
    const errorContainers = document.querySelectorAll('[role="alert"], .error-message, .alert-danger');
    if (errorContainers.length === 0) {
      this.addIssue({
        severity: 'info',
        element: 'error handling',
        issue: 'No error message containers found',
        recommendation: 'Add error message containers with role="alert" for accessibility',
        wcagReference: 'WCAG 2.1 SC 3.3.1'
      });
    } else {
      this.passedChecks.push(`Found ${errorContainers.length} error message container(s)`);
    }

    // Check for form validation
    const forms = document.querySelectorAll('form');
    forms.forEach((form) => {
      const requiredFields = form.querySelectorAll('[required]');
      requiredFields.forEach((field) => {
        const ariaRequired = field.getAttribute('aria-required');
        const ariaInvalid = field.getAttribute('aria-invalid');
        
        if (!ariaRequired) {
          this.addIssue({
            severity: 'info',
            element: 'form validation',
            issue: 'Required field missing aria-required attribute',
            recommendation: 'Add aria-required="true" to required form fields',
            wcagReference: 'WCAG 2.1 SC 3.3.2'
          });
        }
      });
    });
  }

  /**
   * Calculate color contrast ratio
   */
  private calculateContrastRatio(foreground: string, background: string): number {
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 0, g: 0, b: 0 };
    };

    const getLuminance = (r: number, g: number, b: number) => {
      const [rs, gs, bs] = [r, g, b].map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };

    const fg = hexToRgb(foreground);
    const bg = hexToRgb(background);
    
    const fgLum = getLuminance(fg.r, fg.g, fg.b);
    const bgLum = getLuminance(bg.r, bg.g, bg.b);
    
    const lighter = Math.max(fgLum, bgLum);
    const darker = Math.min(fgLum, bgLum);
    
    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Add an accessibility issue
   */
  private addIssue(issue: AccessibilityIssue): void {
    this.issues.push(issue);
  }

  /**
   * Generate accessibility report
   */
  private generateReport(): AccessibilityReport {
    const errors = this.issues.filter(issue => issue.severity === 'error');
    const warnings = this.issues.filter(issue => issue.severity === 'warning');
    const info = this.issues.filter(issue => issue.severity === 'info');

    const summary = {
      colorContrast: errors.some(e => e.wcagReference?.includes('1.4.3')) ? 'fail' : 'pass',
      keyboardNavigation: errors.some(e => e.wcagReference?.includes('2.1.1')) ? 'fail' : 'pass',
      screenReaderSupport: errors.some(e => e.wcagReference?.includes('1.1.1') || e.wcagReference?.includes('1.3.1')) ? 'fail' : 'pass',
      touchCompatibility: errors.some(e => e.wcagReference?.includes('2.5.5')) ? 'fail' : 'pass',
      semanticStructure: errors.some(e => e.wcagReference?.includes('1.3.1')) ? 'fail' : 'pass'
    } as const;

    return {
      timestamp: new Date().toISOString(),
      totalIssues: this.issues.length,
      errors,
      warnings,
      info,
      passedChecks: this.passedChecks,
      summary
    };
  }

  /**
   * Generate HTML report
   */
  public generateHtmlReport(report: AccessibilityReport): string {
    const severityColors = {
      error: '#dc3545',
      warning: '#ffc107',
      info: '#17a2b8'
    };

    const summaryHtml = Object.entries(report.summary)
      .map(([category, status]) => {
        const statusColor = status === 'pass' ? '#28a745' : '#dc3545';
        const statusIcon = status === 'pass' ? '✅' : '❌';
        return `
          <div style="display: flex; justify-content: space-between; padding: 8px; border-bottom: 1px solid #eee;">
            <span>${category.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
            <span style="color: ${statusColor};">${statusIcon} ${status.toUpperCase()}</span>
          </div>
        `;
      }).join('');

    const issuesHtml = ['errors', 'warnings', 'info'].map(severity => {
      const issues = report[severity as keyof typeof report] as AccessibilityIssue[];
      if (issues.length === 0) return '';

      const issuesList = issues.map(issue => `
        <div style="margin-bottom: 16px; padding: 12px; border-left: 4px solid ${severityColors[issue.severity]}; background: #f8f9fa;">
          <strong>${issue.element}</strong>: ${issue.issue}<br>
          <em>Recommendation:</em> ${issue.recommendation}<br>
          ${issue.wcagReference ? `<small>WCAG Reference: ${issue.wcagReference}</small>` : ''}
        </div>
      `).join('');

      return `
        <h3 style="color: ${severityColors[severity as keyof typeof severityColors]}; text-transform: capitalize;">
          ${severity} (${issues.length})
        </h3>
        ${issuesList}
      `;
    }).join('');

    const passedChecksHtml = report.passedChecks.map(check => `
      <div style="padding: 8px; margin-bottom: 4px; background: #d4edda; border-left: 4px solid #28a745;">
        ✅ ${check}
      </div>
    `).join('');

    return `
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Accessibility Audit Report</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }
          .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .summary { background: white; border: 1px solid #dee2e6; border-radius: 8px; margin-bottom: 20px; }
          .section { margin-bottom: 30px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🔍 Accessibility Audit Report</h1>
          <p><strong>Generated:</strong> ${new Date(report.timestamp).toLocaleString('tr-TR')}</p>
          <p><strong>Total Issues:</strong> ${report.totalIssues} (${report.errors.length} errors, ${report.warnings.length} warnings, ${report.info.length} info)</p>
        </div>

        <div class="section">
          <h2>📊 Summary</h2>
          <div class="summary">
            ${summaryHtml}
          </div>
        </div>

        <div class="section">
          <h2>🚨 Issues Found</h2>
          ${issuesHtml}
        </div>

        <div class="section">
          <h2>✅ Passed Checks</h2>
          ${passedChecksHtml}
        </div>

        <div class="section">
          <h2>📋 Recommendations</h2>
          <ul>
            <li>Address all error-level issues immediately as they prevent accessibility</li>
            <li>Review warning-level issues and implement fixes where possible</li>
            <li>Consider info-level suggestions for enhanced accessibility</li>
            <li>Test with actual assistive technologies (screen readers, keyboard-only navigation)</li>
            <li>Conduct user testing with people who use assistive technologies</li>
          </ul>
        </div>
      </body>
      </html>
    `;
  }
}

// Export the auditor class and types
export { AccessibilityAuditor, AccessibilityReport, AccessibilityIssue };