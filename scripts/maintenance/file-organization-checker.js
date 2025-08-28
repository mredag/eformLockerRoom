#!/usr/bin/env node
/**
 * File Organization Checker
 * Automated tool to verify repository file organization compliance
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  // File naming patterns
  naming: {
    kebabCase: /^[a-z0-9]+(-[a-z0-9]+)*$/,
    maxLength: 50,
    allowedExtensions: ['.js', '.ts', '.md', '.json', '.html', '.css', '.sh', '.sql', '.yml', '.yaml']
  },
  
  // Directory structure rules
  structure: {
    required: ['app', 'docs', 'scripts', 'tests', 'shared', 'config'],
    scriptCategories: ['deployment', 'testing', 'maintenance', 'emergency'],
    testCategories: ['unit', 'integration', 'e2e']
  },
  
  // File categorization rules
  categories: {
    temporary: [
      /\.tmp$/i,
      /\.temp$/i,
      /\.bak$/i,
      /debug/i,
      /-\d{4}-\d{2}-\d{2}/,  // timestamp patterns
      /test-output-/i,
      /-test-\d+/i
    ],
    
    sensitive: [
      /\.key$/i,
      /\.pem$/i,
      /\.p12$/i,
      /\.pfx$/i,
      /password/i,
      /secret/i,
      /\.env$/i
    ],
    
    large: 10 * 1024 * 1024, // 10MB threshold
    
    documentation: /\.md$/i,
    script: /\.(sh|js|ts|py)$/i,
    test: /\.test\./i,
    config: /\.(json|yml|yaml|conf)$/i
  }
};

class FileOrganizationChecker {
  constructor() {
    this.issues = [];
    this.warnings = [];
    this.stats = {
      totalFiles: 0,
      categorized: {
        app: 0,
        docs: 0,
        scripts: 0,
        tests: 0,
        config: 0,
        other: 0
      },
      violations: {
        naming: 0,
        structure: 0,
        temporary: 0,
        large: 0,
        misplaced: 0
      }
    };
  }

  /**
   * Main entry point for the checker
   */
  async run() {
    console.log('🔍 File Organization Checker Starting...');
    console.log('==========================================');
    
    try {
      await this.checkDirectoryStructure();
      await this.scanFiles('.');
      await this.analyzeResults();
      await this.generateReport();
      
      return this.getExitCode();
    } catch (error) {
      console.error('❌ Error during file organization check:', error.message);
      return 2;
    }
  }

  /**
   * Check if required directory structure exists
   */
  async checkDirectoryStructure() {
    console.log('📁 Checking directory structure...');
    
    for (const dir of CONFIG.structure.required) {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        console.log(`  ✓ Required directory '${dir}' exists`);
      } else {
        this.issues.push({
          type: 'structure',
          severity: 'error',
          message: `Required directory '${dir}' is missing`,
          path: dir
        });
      }
    }

    // Check script organization
    if (fs.existsSync('scripts')) {
      const scriptSubdirs = CONFIG.structure.scriptCategories.filter(cat => 
        fs.existsSync(path.join('scripts', cat))
      );
      
      const organizationRatio = (scriptSubdirs.length / CONFIG.structure.scriptCategories.length) * 100;
      
      if (organizationRatio >= 75) {
        console.log(`  ✓ Script organization: ${organizationRatio.toFixed(0)}%`);
      } else {
        this.warnings.push({
          type: 'structure',
          severity: 'warning',
          message: `Script organization below recommended level: ${organizationRatio.toFixed(0)}%`,
          path: 'scripts/'
        });
      }
    }
  }

  /**
   * Recursively scan files and check organization
   */
  async scanFiles(dirPath, relativePath = '') {
    const entries = fs.readdirSync(dirPath);
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const relativeFilePath = path.join(relativePath, entry);
      
      // Skip certain directories
      if (this.shouldSkipPath(relativeFilePath)) {
        continue;
      }
      
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        await this.scanFiles(fullPath, relativeFilePath);
      } else {
        await this.checkFile(fullPath, relativeFilePath, stat);
      }
    }
  }

  /**
   * Check individual file for organization compliance
   */
  async checkFile(fullPath, relativePath, stat) {
    this.stats.totalFiles++;
    
    const fileName = path.basename(relativePath);
    const fileExt = path.extname(fileName).toLowerCase();
    const baseName = path.basename(fileName, fileExt);
    const dirName = path.dirname(relativePath);
    
    // Categorize file
    this.categorizeFile(relativePath);
    
    // Check naming conventions
    this.checkNamingConventions(fileName, baseName, fileExt, relativePath);
    
    // Check for temporary files
    this.checkTemporaryFiles(fileName, relativePath);
    
    // Check file size
    this.checkFileSize(stat.size, relativePath);
    
    // Check file placement
    this.checkFilePlacement(relativePath, fileExt);
  }

  /**
   * Categorize file by type and location
   */
  categorizeFile(relativePath) {
    const dirParts = relativePath.split(path.sep);
    const topLevel = dirParts[0];
    
    switch (topLevel) {
      case 'app':
        this.stats.categorized.app++;
        break;
      case 'docs':
        this.stats.categorized.docs++;
        break;
      case 'scripts':
        this.stats.categorized.scripts++;
        break;
      case 'tests':
        this.stats.categorized.tests++;
        break;
      case 'config':
        this.stats.categorized.config++;
        break;
      default:
        this.stats.categorized.other++;
    }
  }

  /**
   * Check file naming conventions
   */
  checkNamingConventions(fileName, baseName, fileExt, relativePath) {
    // Check file extension
    if (fileExt && !CONFIG.naming.allowedExtensions.includes(fileExt)) {
      this.warnings.push({
        type: 'naming',
        severity: 'warning',
        message: `Unusual file extension: ${fileExt}`,
        path: relativePath
      });
    }

    // Check filename length
    if (fileName.length > CONFIG.naming.maxLength) {
      this.warnings.push({
        type: 'naming',
        severity: 'warning',
        message: `Filename too long (${fileName.length} chars): ${fileName}`,
        path: relativePath
      });
      this.stats.violations.naming++;
    }

    // Check for spaces in filename
    if (fileName.includes(' ')) {
      this.issues.push({
        type: 'naming',
        severity: 'error',
        message: `Filename contains spaces: ${fileName}`,
        path: relativePath
      });
      this.stats.violations.naming++;
    }

    // Check for uppercase extensions
    const originalExt = path.extname(fileName);
    if (originalExt !== originalExt.toLowerCase()) {
      this.warnings.push({
        type: 'naming',
        severity: 'warning',
        message: `Uppercase file extension: ${originalExt}`,
        path: relativePath
      });
      this.stats.violations.naming++;
    }

    // Check kebab-case for certain file types
    if (['.md', '.js', '.ts', '.css'].includes(fileExt)) {
      if (!CONFIG.naming.kebabCase.test(baseName)) {
        this.warnings.push({
          type: 'naming',
          severity: 'warning',
          message: `Filename not in kebab-case: ${baseName}`,
          path: relativePath
        });
        this.stats.violations.naming++;
      }
    }
  }

  /**
   * Check for temporary files
   */
  checkTemporaryFiles(fileName, relativePath) {
    for (const pattern of CONFIG.categories.temporary) {
      if (pattern.test(fileName)) {
        this.issues.push({
          type: 'temporary',
          severity: 'error',
          message: `Temporary file detected: ${fileName}`,
          path: relativePath
        });
        this.stats.violations.temporary++;
        break;
      }
    }
  }

  /**
   * Check file size
   */
  checkFileSize(size, relativePath) {
    if (size > CONFIG.categories.large) {
      const sizeMB = (size / (1024 * 1024)).toFixed(2);
      this.warnings.push({
        type: 'size',
        severity: 'warning',
        message: `Large file detected (${sizeMB}MB): consider Git LFS`,
        path: relativePath
      });
      this.stats.violations.large++;
    }
  }

  /**
   * Check if file is in appropriate location
   */
  checkFilePlacement(relativePath, fileExt) {
    const fileName = path.basename(relativePath);
    const dirParts = relativePath.split(path.sep);
    const topLevel = dirParts[0];
    
    // Check documentation placement
    if (CONFIG.categories.documentation.test(fileName)) {
      if (topLevel !== 'docs' && !fileName.startsWith('README')) {
        this.warnings.push({
          type: 'placement',
          severity: 'warning',
          message: `Documentation file outside docs/ directory: ${fileName}`,
          path: relativePath
        });
        this.stats.violations.misplaced++;
      }
    }
    
    // Check script placement
    if (CONFIG.categories.script.test(fileName) && !relativePath.includes('node_modules')) {
      if (topLevel !== 'scripts' && !relativePath.includes('src/') && !relativePath.includes('test')) {
        this.warnings.push({
          type: 'placement',
          severity: 'warning',
          message: `Script file outside scripts/ directory: ${fileName}`,
          path: relativePath
        });
        this.stats.violations.misplaced++;
      }
    }
    
    // Check test placement
    if (CONFIG.categories.test.test(fileName)) {
      if (!relativePath.includes('test') && !relativePath.includes('spec')) {
        this.warnings.push({
          type: 'placement',
          severity: 'warning',
          message: `Test file not in test directory: ${fileName}`,
          path: relativePath
        });
        this.stats.violations.misplaced++;
      }
    }
  }

  /**
   * Analyze results and generate insights
   */
  async analyzeResults() {
    console.log('\n📊 Analysis Results');
    console.log('==================');
    
    console.log(`Total files scanned: ${this.stats.totalFiles}`);
    console.log('File distribution:');
    Object.entries(this.stats.categorized).forEach(([category, count]) => {
      const percentage = ((count / this.stats.totalFiles) * 100).toFixed(1);
      console.log(`  ${category}: ${count} (${percentage}%)`);
    });
    
    console.log('\nViolation summary:');
    Object.entries(this.stats.violations).forEach(([type, count]) => {
      if (count > 0) {
        console.log(`  ${type}: ${count}`);
      }
    });
  }

  /**
   * Generate detailed report
   */
  async generateReport() {
    console.log('\n📋 Detailed Issues Report');
    console.log('=========================');
    
    // Group issues by type
    const issuesByType = {};
    [...this.issues, ...this.warnings].forEach(issue => {
      if (!issuesByType[issue.type]) {
        issuesByType[issue.type] = [];
      }
      issuesByType[issue.type].push(issue);
    });
    
    Object.entries(issuesByType).forEach(([type, issues]) => {
      console.log(`\n${type.toUpperCase()} Issues (${issues.length}):`);
      issues.forEach(issue => {
        const icon = issue.severity === 'error' ? '❌' : '⚠️';
        console.log(`  ${icon} ${issue.message}`);
        console.log(`     Path: ${issue.path}`);
      });
    });
    
    // Generate recommendations
    this.generateRecommendations();
    
    // Save report to file
    await this.saveReportToFile();
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations() {
    console.log('\n💡 Recommendations');
    console.log('==================');
    
    const recommendations = [];
    
    if (this.stats.violations.temporary > 0) {
      recommendations.push(`Run cleanup script to remove ${this.stats.violations.temporary} temporary files`);
    }
    
    if (this.stats.violations.naming > 0) {
      recommendations.push(`Review and fix ${this.stats.violations.naming} naming convention violations`);
    }
    
    if (this.stats.violations.large > 0) {
      recommendations.push(`Consider Git LFS for ${this.stats.violations.large} large files`);
    }
    
    if (this.stats.violations.misplaced > 0) {
      recommendations.push(`Reorganize ${this.stats.violations.misplaced} misplaced files`);
    }
    
    if (this.stats.categorized.other > this.stats.totalFiles * 0.2) {
      recommendations.push('Consider organizing files in root directory into appropriate subdirectories');
    }
    
    if (recommendations.length === 0) {
      console.log('  ✅ No specific recommendations - repository organization looks good!');
    } else {
      recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
    }
  }

  /**
   * Save detailed report to file
   */
  async saveReportToFile() {
    const reportData = {
      timestamp: new Date().toISOString(),
      stats: this.stats,
      issues: this.issues,
      warnings: this.warnings,
      summary: {
        totalIssues: this.issues.length,
        totalWarnings: this.warnings.length,
        healthScore: Math.max(0, 100 - (this.issues.length * 10) - (this.warnings.length * 5))
      }
    };
    
    const reportPath = 'scripts/maintenance/organization-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  }

  /**
   * Determine appropriate exit code
   */
  getExitCode() {
    if (this.issues.length > 0) {
      return 1; // Errors found
    } else if (this.warnings.length > 10) {
      return 1; // Too many warnings
    } else if (this.warnings.length > 0) {
      return 0; // Warnings but acceptable
    } else {
      return 0; // All good
    }
  }

  /**
   * Check if path should be skipped during scanning
   */
  shouldSkipPath(relativePath) {
    const skipPatterns = [
      'node_modules',
      '.git',
      '.DS_Store',
      'Thumbs.db',
      'dist',
      'build',
      'coverage',
      '.nyc_output',
      '.cache'
    ];
    
    return skipPatterns.some(pattern => relativePath.includes(pattern));
  }
}

// Run the checker if called directly
if (require.main === module) {
  const checker = new FileOrganizationChecker();
  checker.run().then(exitCode => {
    process.exit(exitCode);
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(2);
  });
}

module.exports = FileOrganizationChecker;