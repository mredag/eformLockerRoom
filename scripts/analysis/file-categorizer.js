#!/usr/bin/env node

/**
 * File Categorization Tool
 * 
 * Specialized tool for categorizing repository files based on:
 * - Naming patterns
 * - Content analysis
 * - File metadata
 * - Directory structure
 */

const fs = require('fs');
const path = require('path');

class FileCategorizer {
  constructor(rootPath = '.') {
    this.rootPath = path.resolve(rootPath);
    
    // Comprehensive categorization patterns
    this.patterns = {
      // Temporary/Debug files - highest priority for removal
      temporary: {
        patterns: [
          /^test-.*\.(js|html|json|md)$/,
          /^debug-.*\.(js|html|json)$/,
          /.*-debug\.(js|html|json)$/,
          /.*-test\.(js|html|json)$/,
          /.*-fix\.(js|html|md|sql)$/,
          /.*-validation\.(js|json|html)$/,
          /.*-report\.(json|md)$/,
          /.*-summary\.(md|json)$/,
          /.*-complete\.(md|json)$/,
          /.*-backup\.(md|js|json)$/,
          /.*-troubleshooting.*\.(md|js)$/,
          /.*-incident.*\.(md|json)$/,
          /.*-temp\.(js|md|json|html)$/,
          /.*\.tmp$/,
          /.*\.temp$/
        ],
        keywords: [
          'temporary', 'debug', 'test only', 'remove this', 'delete this',
          'not used', 'todo', 'fixme', 'hack', 'quick fix'
        ],
        description: 'Temporary files created for debugging, testing, or one-time tasks'
      },
      
      // Redundant files - duplicates or backups
      redundant: {
        patterns: [
          /.*-copy\.(js|md|json|html)$/,
          /.*-backup\.(js|md|json|html)$/,
          /.*\.bak$/,
          /.*\.old$/,
          /.*-duplicate\.(js|md|json|html)$/,
          /.*-v[0-9]+\.(js|md|json|html)$/,
          /.*\([0-9]+\)\.(js|md|json|html)$/,
          /.*_backup\.(js|md|json|html)$/,
          /.*_copy\.(js|md|json|html)$/
        ],
        keywords: [
          'copy of', 'backup', 'duplicate', 'old version', 'superseded'
        ],
        description: 'Duplicate files, backups, or multiple versions of same content'
      },
      
      // Legacy files - from previous versions but potentially valuable
      legacy: {
        patterns: [
          /.*-legacy\.(js|md|json|html)$/,
          /.*-old\.(js|md|json|html)$/,
          /.*-deprecated\.(js|md|json|html)$/,
          /.*-archive\.(js|md|json|html)$/,
          /.*-migration\.(md|js|sql)$/,
          /cleanup-.*\.(sql|md|js)$/,
          /fix-.*\.(sql|md|js)$/,
          /.*-v1\.(js|md|json)$/,
          /.*-original\.(js|md|json)$/
        ],
        keywords: [
          'legacy', 'deprecated', 'no longer used', 'replaced by',
          'archived', 'old implementation', 'previous version'
        ],
        description: 'Files from previous iterations that may have historical value'
      },
      
      // Active files - currently used in production
      active: {
        patterns: [
          /^(src|app|shared|config|migrations)\/.*\.(ts|js|json|sql)$/,
          /^package\.json$/,
          /^tsconfig\.json$/,
          /^\.env/,
          /^README\.md$/,
          /^LICENSE$/,
          /^\.gitignore$/,
          /^\.gitattributes$/,
          /^\.nvmrc$/,
          /^(app|shared)\/.*\/index\.(ts|js)$/,
          /^scripts\/(start|build|deploy|health|emergency)-.*\.(sh|js|ps1)$/
        ],
        keywords: [
          'export', 'import', 'module.exports', 'function', 'class',
          'interface', 'type', 'const', 'let', 'var'
        ],
        description: 'Files currently used in production or development'
      },
      
      // Documentation files
      documentation: {
        patterns: [
          /^docs\/.*\.md$/,
          /^README.*\.md$/,
          /.*-guide\.md$/,
          /.*-documentation\.md$/,
          /.*-reference\.md$/,
          /.*-manual\.md$/
        ],
        keywords: [
          '# ', '## ', '### ', 'documentation', 'guide', 'manual',
          'reference', 'how to', 'installation', 'setup'
        ],
        description: 'Documentation and guide files'
      },
      
      // Test files
      test: {
        patterns: [
          /.*\.(test|spec)\.(js|ts)$/,
          /^tests\/.*\.(js|ts)$/,
          /.*\/__tests__\/.*\.(js|ts)$/,
          /.*\.test\.(js|ts)$/,
          /.*\.spec\.(js|ts)$/
        ],
        keywords: [
          'describe(', 'it(', 'test(', 'expect(', 'assert',
          'beforeEach', 'afterEach', 'jest', 'mocha'
        ],
        description: 'Unit tests, integration tests, and test utilities'
      },
      
      // Configuration files
      config: {
        patterns: [
          /^config\/.*\.(json|js|ts)$/,
          /.*\.config\.(js|ts|json)$/,
          /.*\.conf$/,
          /^\..*rc$/,
          /^\..*ignore$/
        ],
        keywords: [
          'configuration', 'config', 'settings', 'options'
        ],
        description: 'Configuration files and settings'
      },
      
      // Build/Deploy files
      build: {
        patterns: [
          /^scripts\/(build|deploy|package|install).*\.(sh|js|ps1)$/,
          /^\.github\/workflows\/.*\.yml$/,
          /^Dockerfile$/,
          /^docker-compose\.yml$/,
          /.*\.dockerfile$/
        ],
        keywords: [
          'build', 'compile', 'deploy', 'package', 'install'
        ],
        description: 'Build, deployment, and CI/CD files'
      }
    };
    
    // Directory-based categorization
    this.directoryCategories = {
      'node_modules': 'ignore',
      '.git': 'ignore',
      'dist': 'ignore',
      'build': 'ignore',
      'coverage': 'ignore',
      'src': 'active',
      'app': 'active',
      'shared': 'active',
      'config': 'config',
      'migrations': 'active',
      'docs': 'documentation',
      'tests': 'test',
      'scripts': 'build'
    };
  }

  /**
   * Categorize all files in repository
   */
  async categorizeAll() {
    console.log('📂 Categorizing repository files...');
    
    const files = this.getAllFiles();
    const categorized = new Map();
    const summary = {};
    
    for (const filePath of files) {
      const category = await this.categorizeFile(filePath);
      categorized.set(filePath, category);
      
      summary[category.primary] = (summary[category.primary] || 0) + 1;
    }
    
    return {
      files: Object.fromEntries(categorized),
      summary,
      categories: this.patterns
    };
  }

  /**
   * Categorize a single file
   */
  async categorizeFile(filePath) {
    const fullPath = path.join(this.rootPath, filePath);
    const metadata = this.getFileMetadata(fullPath, filePath);
    
    // Check directory-based categorization first
    const dirCategory = this.checkDirectoryCategory(filePath);
    if (dirCategory) {
      return {
        primary: dirCategory,
        confidence: 'high',
        reasons: [`Located in ${path.dirname(filePath)} directory`],
        metadata
      };
    }
    
    // Pattern-based categorization
    const patternResults = this.checkPatterns(filePath, metadata);
    
    // Content-based categorization
    const contentResults = this.checkContent(metadata);
    
    // Combine results
    const allResults = [...patternResults, ...contentResults];
    
    if (allResults.length === 0) {
      return {
        primary: 'unknown',
        confidence: 'low',
        reasons: ['No matching patterns or content indicators'],
        metadata
      };
    }
    
    // Sort by confidence and return best match
    allResults.sort((a, b) => b.score - a.score);
    const best = allResults[0];
    
    return {
      primary: best.category,
      confidence: best.score > 80 ? 'high' : best.score > 50 ? 'medium' : 'low',
      reasons: allResults.slice(0, 3).map(r => r.reason),
      alternatives: allResults.slice(1, 3).map(r => r.category),
      metadata
    };
  }

  /**
   * Check directory-based categorization
   */
  checkDirectoryCategory(filePath) {
    const parts = filePath.split(path.sep);
    
    for (const part of parts) {
      if (this.directoryCategories[part]) {
        return this.directoryCategories[part];
      }
    }
    
    return null;
  }

  /**
   * Check pattern-based categorization
   */
  checkPatterns(filePath, metadata) {
    const results = [];
    const basename = path.basename(filePath);
    
    for (const [category, config] of Object.entries(this.patterns)) {
      let score = 0;
      const reasons = [];
      
      // Check filename patterns
      for (const pattern of config.patterns) {
        if (pattern.test(filePath) || pattern.test(basename)) {
          score += 70;
          reasons.push(`Matches ${category} filename pattern`);
          break;
        }
      }
      
      if (score > 0) {
        results.push({
          category,
          score,
          reason: reasons[0]
        });
      }
    }
    
    return results;
  }

  /**
   * Check content-based categorization
   */
  checkContent(metadata) {
    if (!metadata.content || metadata.content === '[BINARY FILE]') {
      return [];
    }
    
    const results = [];
    const content = metadata.content.toLowerCase();
    
    for (const [category, config] of Object.entries(this.patterns)) {
      let score = 0;
      const matchedKeywords = [];
      
      // Check for keywords in content
      for (const keyword of config.keywords) {
        if (content.includes(keyword.toLowerCase())) {
          score += 20;
          matchedKeywords.push(keyword);
        }
      }
      
      if (score > 0) {
        results.push({
          category,
          score,
          reason: `Contains ${category} keywords: ${matchedKeywords.slice(0, 2).join(', ')}`
        });
      }
    }
    
    return results;
  }

  /**
   * Get file metadata
   */
  getFileMetadata(fullPath, relativePath) {
    try {
      const stats = fs.statSync(fullPath);
      const content = this.readFileContent(fullPath);
      
      return {
        path: relativePath,
        size: stats.size,
        modified: stats.mtime,
        extension: path.extname(relativePath),
        basename: path.basename(relativePath),
        directory: path.dirname(relativePath),
        content: content.substring(0, 500), // First 500 chars for analysis
        lineCount: content.split('\n').length,
        isEmpty: content.trim().length === 0
      };
    } catch (error) {
      return {
        path: relativePath,
        error: error.message
      };
    }
  }

  /**
   * Safely read file content
   */
  readFileContent(filePath) {
    try {
      const buffer = fs.readFileSync(filePath);
      if (buffer.includes(0)) {
        return '[BINARY FILE]';
      }
      return buffer.toString('utf8');
    } catch (error) {
      return '[UNREADABLE FILE]';
    }
  }

  /**
   * Get all files in repository
   */
  getAllFiles(dir = this.rootPath) {
    const files = [];
    const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
    
    const scan = (currentDir) => {
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          const relativePath = path.relative(this.rootPath, fullPath);
          
          if (entry.isDirectory()) {
            if (!skipDirs.has(entry.name)) {
              scan(fullPath);
            }
          } else if (entry.isFile()) {
            files.push(relativePath);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Could not scan directory ${currentDir}: ${error.message}`);
      }
    };
    
    scan(dir);
    return files;
  }

  /**
   * Generate categorization report
   */
  generateReport(categorizedFiles) {
    const report = {
      summary: categorizedFiles.summary,
      recommendations: {},
      details: categorizedFiles.files
    };
    
    // Generate recommendations for each category
    for (const [category, count] of Object.entries(categorizedFiles.summary)) {
      const files = Object.entries(categorizedFiles.files)
        .filter(([_, data]) => data.primary === category)
        .map(([path, _]) => path);
      
      report.recommendations[category] = {
        count,
        files,
        action: this.getRecommendedAction(category),
        priority: this.getActionPriority(category)
      };
    }
    
    return report;
  }

  /**
   * Get recommended action for category
   */
  getRecommendedAction(category) {
    const actions = {
      temporary: 'Remove immediately - safe to delete',
      redundant: 'Remove after verification - likely safe',
      legacy: 'Review and archive - may have historical value',
      active: 'Preserve - critical for system operation',
      documentation: 'Review and consolidate - keep essential docs',
      test: 'Preserve - important for code quality',
      config: 'Preserve - required for system configuration',
      build: 'Preserve - required for deployment',
      unknown: 'Review manually - categorization needed'
    };
    
    return actions[category] || 'Review manually';
  }

  /**
   * Get action priority for category
   */
  getActionPriority(category) {
    const priorities = {
      temporary: 'high',
      redundant: 'medium',
      legacy: 'low',
      active: 'preserve',
      documentation: 'low',
      test: 'preserve',
      config: 'preserve',
      build: 'preserve',
      unknown: 'medium'
    };
    
    return priorities[category] || 'medium';
  }
}

// CLI interface
if (require.main === module) {
  const categorizer = new FileCategorizer();
  
  categorizer.categorizeAll()
    .then(result => {
      const report = categorizer.generateReport(result);
      const outputPath = 'file-categorization-report.json';
      
      fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
      
      console.log(`📊 Categorization report saved to: ${outputPath}`);
      console.log('\n📂 Category Summary:');
      
      for (const [category, count] of Object.entries(result.summary)) {
        console.log(`${category}: ${count} files`);
      }
      
      console.log('\n💡 Recommendations:');
      for (const [category, rec] of Object.entries(report.recommendations)) {
        console.log(`${category} (${rec.count} files): ${rec.action}`);
      }
    })
    .catch(error => {
      console.error('❌ Categorization failed:', error);
      process.exit(1);
    });
}

module.exports = FileCategorizer;