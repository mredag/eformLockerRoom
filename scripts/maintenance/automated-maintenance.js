#!/usr/bin/env node
/**
 * Automated Repository Maintenance System
 * Comprehensive automation for maintaining repository cleanliness
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class AutomatedMaintenance {
  constructor(options = {}) {
    this.config = {
      dryRun: options.dryRun || false,
      verbose: options.verbose || false,
      schedule: options.schedule || 'daily',
      ...options
    };
    
    this.results = {
      filesProcessed: 0,
      filesRemoved: 0,
      filesReorganized: 0,
      issuesFound: 0,
      warnings: 0,
      actions: []
    };
    
    this.maintenanceRules = {
      // File patterns to automatically remove
      autoRemove: [
        { pattern: /\.tmp$/i, age: 1, reason: 'Temporary file' },
        { pattern: /\.temp$/i, age: 1, reason: 'Temporary file' },
        { pattern: /\.bak$/i, age: 7, reason: 'Backup file' },
        { pattern: /debug.*\.log$/i, age: 3, reason: 'Debug log' },
        { pattern: /-\d{4}-\d{2}-\d{2}/, age: 1, reason: 'Timestamped file' },
        { pattern: /test-output-/i, age: 1, reason: 'Test artifact' }
      ],
      
      // File reorganization rules
      reorganize: [
        { 
          pattern: /\.md$/i, 
          exclude: /^README/i,
          targetDir: 'docs',
          condition: (filePath) => {
            const normalizedPath = filePath.replace(/\\/g, '/');
            return !normalizedPath.startsWith('docs/') && 
                   !normalizedPath.includes('node_modules') && 
                   !normalizedPath.startsWith('.kiro/') &&
                   !normalizedPath.includes('/.kiro/');
          }
        },
        {
          pattern: /\.(sh|py)$/i,
          exclude: /package\.json|node_modules/,
          targetDir: 'scripts/maintenance',
          condition: (filePath) => !filePath.startsWith('scripts/') && !filePath.includes('src/')
        }
      ],
      
      // Size limits
      sizeLimits: {
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxRepoSize: 500 * 1024 * 1024 // 500MB
      },
      
      // Directory organization rules
      directoryRules: {
        maxFilesInRoot: 15,
        requiredDirs: ['app', 'docs', 'scripts', 'tests', 'shared', 'config'],
        scriptCategories: ['deployment', 'testing', 'maintenance', 'emergency']
      }
    };
  }

  /**
   * Main maintenance execution
   */
  async run() {
    console.log(`🤖 Automated Repository Maintenance - ${this.config.schedule} run`);
    console.log('='.repeat(60));
    
    if (this.config.dryRun) {
      console.log('🔍 DRY RUN MODE - No files will be modified');
    }
    
    try {
      await this.performMaintenance();
      await this.generateReport();
      return this.getExitCode();
    } catch (error) {
      console.error('❌ Maintenance failed:', error.message);
      return 2;
    }
  }

  /**
   * Perform all maintenance tasks
   */
  async performMaintenance() {
    console.log('🧹 Starting maintenance tasks...\n');
    
    // Task 1: Clean temporary files
    await this.cleanTemporaryFiles();
    
    // Task 2: Reorganize misplaced files
    await this.reorganizeFiles();
    
    // Task 3: Check repository health
    await this.checkRepositoryHealth();
    
    // Task 4: Optimize directory structure
    await this.optimizeDirectoryStructure();
    
    // Task 5: Update maintenance logs
    await this.updateMaintenanceLogs();
    
    console.log('\n✅ All maintenance tasks completed');
  }

  /**
   * Clean temporary and obsolete files
   */
  async cleanTemporaryFiles() {
    console.log('🗑️  Cleaning temporary files...');
    
    const filesToRemove = [];
    
    // Scan for files matching removal patterns
    await this.scanDirectory('.', (filePath, stat) => {
      const fileName = path.basename(filePath);
      const fileAge = (Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60 * 24); // days
      
      for (const rule of this.maintenanceRules.autoRemove) {
        if (rule.pattern.test(fileName) && fileAge > rule.age) {
          filesToRemove.push({
            path: filePath,
            reason: rule.reason,
            age: Math.floor(fileAge)
          });
          break;
        }
      }
    });
    
    // Remove files
    for (const file of filesToRemove) {
      if (this.config.dryRun) {
        console.log(`  [DRY RUN] Would remove: ${file.path} (${file.reason}, ${file.age} days old)`);
      } else {
        try {
          fs.unlinkSync(file.path);
          console.log(`  ✓ Removed: ${file.path} (${file.reason})`);
          this.results.filesRemoved++;
        } catch (error) {
          console.log(`  ❌ Failed to remove: ${file.path} - ${error.message}`);
          this.results.warnings++;
        }
      }
      
      this.results.actions.push({
        type: 'remove',
        path: file.path,
        reason: file.reason,
        executed: !this.config.dryRun
      });
    }
    
    console.log(`  Processed ${filesToRemove.length} temporary files`);
  }

  /**
   * Reorganize misplaced files
   */
  async reorganizeFiles() {
    console.log('📁 Reorganizing misplaced files...');
    
    const filesToReorganize = [];
    
    // Scan for files that should be reorganized
    await this.scanDirectory('.', (filePath, stat) => {
      if (stat.isDirectory()) return;
      
      const fileName = path.basename(filePath);
      const dirName = path.dirname(filePath);
      
      for (const rule of this.maintenanceRules.reorganize) {
        if (rule.pattern.test(fileName) && 
            (!rule.exclude || !rule.exclude.test(fileName)) &&
            rule.condition(filePath)) {
          
          const targetPath = path.join(rule.targetDir, fileName);
          filesToReorganize.push({
            source: filePath,
            target: targetPath,
            reason: `Move ${fileName} to ${rule.targetDir}`
          });
          break;
        }
      }
    });
    
    // Reorganize files
    for (const file of filesToReorganize) {
      if (this.config.dryRun) {
        console.log(`  [DRY RUN] Would move: ${file.source} → ${file.target}`);
      } else {
        try {
          // Ensure target directory exists
          const targetDir = path.dirname(file.target);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          
          // Move file
          fs.renameSync(file.source, file.target);
          console.log(`  ✓ Moved: ${file.source} → ${file.target}`);
          this.results.filesReorganized++;
        } catch (error) {
          console.log(`  ❌ Failed to move: ${file.source} - ${error.message}`);
          this.results.warnings++;
        }
      }
      
      this.results.actions.push({
        type: 'reorganize',
        source: file.source,
        target: file.target,
        reason: file.reason,
        executed: !this.config.dryRun
      });
    }
    
    console.log(`  Processed ${filesToReorganize.length} files for reorganization`);
  }

  /**
   * Check repository health metrics
   */
  async checkRepositoryHealth() {
    console.log('🏥 Checking repository health...');
    
    const health = {
      totalFiles: 0,
      largeFiles: 0,
      rootFiles: 0,
      missingDirs: [],
      organizationScore: 0
    };
    
    // Count files and check sizes
    await this.scanDirectory('.', (filePath, stat) => {
      if (stat.isDirectory()) return;
      
      health.totalFiles++;
      
      // Check file size
      if (stat.size > this.maintenanceRules.sizeLimits.maxFileSize) {
        health.largeFiles++;
        const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
        console.log(`  ⚠️  Large file: ${filePath} (${sizeMB}MB)`);
        this.results.warnings++;
      }
      
      // Count root-level files
      if (path.dirname(filePath) === '.') {
        health.rootFiles++;
      }
    });
    
    // Check required directories
    for (const dir of this.maintenanceRules.directoryRules.requiredDirs) {
      if (!fs.existsSync(dir)) {
        health.missingDirs.push(dir);
        console.log(`  ❌ Missing required directory: ${dir}`);
        this.results.issuesFound++;
      }
    }
    
    // Check root file count
    if (health.rootFiles > this.maintenanceRules.directoryRules.maxFilesInRoot) {
      console.log(`  ⚠️  Too many root files: ${health.rootFiles} (max: ${this.maintenanceRules.directoryRules.maxFilesInRoot})`);
      this.results.warnings++;
    }
    
    // Calculate organization score
    health.organizationScore = Math.max(0, 100 - (health.largeFiles * 5) - (health.missingDirs.length * 10) - Math.max(0, health.rootFiles - 10));
    
    console.log(`  Health Score: ${health.organizationScore}/100`);
    console.log(`  Total Files: ${health.totalFiles}`);
    console.log(`  Large Files: ${health.largeFiles}`);
    console.log(`  Root Files: ${health.rootFiles}`);
    
    return health;
  }

  /**
   * Optimize directory structure
   */
  async optimizeDirectoryStructure() {
    console.log('🏗️  Optimizing directory structure...');
    
    // Create missing required directories
    for (const dir of this.maintenanceRules.directoryRules.requiredDirs) {
      if (!fs.existsSync(dir)) {
        if (this.config.dryRun) {
          console.log(`  [DRY RUN] Would create directory: ${dir}`);
        } else {
          fs.mkdirSync(dir, { recursive: true });
          console.log(`  ✓ Created directory: ${dir}`);
        }
        
        this.results.actions.push({
          type: 'create_directory',
          path: dir,
          executed: !this.config.dryRun
        });
      }
    }
    
    // Create script category directories
    const scriptsDir = 'scripts';
    if (fs.existsSync(scriptsDir)) {
      for (const category of this.maintenanceRules.directoryRules.scriptCategories) {
        const categoryDir = path.join(scriptsDir, category);
        if (!fs.existsSync(categoryDir)) {
          if (this.config.dryRun) {
            console.log(`  [DRY RUN] Would create script category: ${categoryDir}`);
          } else {
            fs.mkdirSync(categoryDir, { recursive: true });
            console.log(`  ✓ Created script category: ${categoryDir}`);
          }
          
          this.results.actions.push({
            type: 'create_directory',
            path: categoryDir,
            executed: !this.config.dryRun
          });
        }
      }
    }
  }

  /**
   * Update maintenance logs and tracking
   */
  async updateMaintenanceLogs() {
    console.log('📊 Updating maintenance logs...');
    
    const logDir = 'scripts/maintenance';
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Update maintenance log
    const logEntry = {
      timestamp: new Date().toISOString(),
      schedule: this.config.schedule,
      dryRun: this.config.dryRun,
      results: this.results,
      summary: {
        filesProcessed: this.results.filesProcessed,
        filesRemoved: this.results.filesRemoved,
        filesReorganized: this.results.filesReorganized,
        issuesFound: this.results.issuesFound,
        warnings: this.results.warnings,
        actionsCount: this.results.actions.length
      }
    };
    
    const logPath = path.join(logDir, 'automated-maintenance.log');
    const logLine = `${logEntry.timestamp}: ${this.config.schedule} maintenance - ${logEntry.summary.actionsCount} actions, ${logEntry.summary.issuesFound} issues, ${logEntry.summary.warnings} warnings\n`;
    
    if (!this.config.dryRun) {
      fs.appendFileSync(logPath, logLine);
    }
    
    // Save detailed report
    const reportPath = path.join(logDir, `maintenance-report-${new Date().toISOString().split('T')[0]}.json`);
    if (!this.config.dryRun) {
      fs.writeFileSync(reportPath, JSON.stringify(logEntry, null, 2));
      console.log(`  ✓ Detailed report saved: ${reportPath}`);
    }
  }

  /**
   * Generate maintenance report
   */
  async generateReport() {
    console.log('\n📋 Maintenance Report');
    console.log('====================');
    
    console.log(`Files processed: ${this.results.filesProcessed}`);
    console.log(`Files removed: ${this.results.filesRemoved}`);
    console.log(`Files reorganized: ${this.results.filesReorganized}`);
    console.log(`Issues found: ${this.results.issuesFound}`);
    console.log(`Warnings: ${this.results.warnings}`);
    console.log(`Total actions: ${this.results.actions.length}`);
    
    if (this.config.verbose && this.results.actions.length > 0) {
      console.log('\nDetailed Actions:');
      this.results.actions.forEach((action, index) => {
        console.log(`  ${index + 1}. ${action.type}: ${action.path || action.source} ${action.executed ? '✓' : '(dry run)'}`);
      });
    }
    
    // Recommendations
    console.log('\n💡 Recommendations:');
    if (this.results.issuesFound > 0) {
      console.log(`  • Address ${this.results.issuesFound} critical issues found`);
    }
    if (this.results.warnings > 5) {
      console.log(`  • Review ${this.results.warnings} warnings for potential improvements`);
    }
    if (this.results.filesRemoved === 0 && this.results.filesReorganized === 0) {
      console.log('  • Repository organization looks good!');
    }
    
    console.log('\nNext Steps:');
    console.log('  • Run health check: bash scripts/maintenance/repository-health-check.sh');
    console.log('  • Check organization: node scripts/maintenance/file-organization-checker.js');
    console.log('  • Review logs: cat scripts/maintenance/automated-maintenance.log');
  }

  /**
   * Scan directory recursively
   */
  async scanDirectory(dirPath, callback) {
    const entries = fs.readdirSync(dirPath);
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      
      // Skip certain directories
      if (this.shouldSkipPath(fullPath)) {
        continue;
      }
      
      const stat = fs.statSync(fullPath);
      this.results.filesProcessed++;
      
      await callback(fullPath, stat);
      
      if (stat.isDirectory()) {
        await this.scanDirectory(fullPath, callback);
      }
    }
  }

  /**
   * Check if path should be skipped
   */
  shouldSkipPath(filePath) {
    const skipPatterns = [
      'node_modules',
      '.git',
      '.DS_Store',
      'Thumbs.db',
      'dist',
      'build',
      'coverage'
    ];
    
    return skipPatterns.some(pattern => filePath.includes(pattern));
  }

  /**
   * Get appropriate exit code
   */
  getExitCode() {
    if (this.results.issuesFound > 0) {
      return 1;
    } else if (this.results.warnings > 10) {
      return 1;
    } else {
      return 0;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
    schedule: args.find(arg => arg.startsWith('--schedule='))?.split('=')[1] || 'manual'
  };
  
  const maintenance = new AutomatedMaintenance(options);
  maintenance.run().then(exitCode => {
    process.exit(exitCode);
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(2);
  });
}

module.exports = AutomatedMaintenance;