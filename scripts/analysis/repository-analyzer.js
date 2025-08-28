#!/usr/bin/env node

/**
 * Repository Analysis Tool
 * 
 * Analyzes repository files for cleanup planning by:
 * - Inventorying all files with metadata
 * - Categorizing files based on patterns and content
 * - Scanning for dependencies and references
 * - Assessing safety for removal
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class RepositoryAnalyzer {
  constructor(rootPath = '.') {
    this.rootPath = path.resolve(rootPath);
    this.fileInventory = new Map();
    this.dependencies = new Map();
    this.categories = {
      active: [],
      legacy: [],
      redundant: [],
      temporary: []
    };
    
    // Patterns for file categorization
    this.patterns = {
      temporary: [
        /^test-.*\.(js|html|json)$/,
        /^debug-.*\.js$/,
        /.*-debug\.(js|html)$/,
        /.*-test\.(js|html)$/,
        /.*-fix\.(js|html|md)$/,
        /.*-validation\.(js|json)$/,
        /.*-report\.(json|md)$/,
        /.*-summary\.(md|json)$/,
        /.*-complete\.(md|json)$/,
        /.*-backup\.(md|js|json)$/,
        /.*-troubleshooting.*\.(md|js)$/,
        /.*-incident.*\.(md|json)$/
      ],
      
      legacy: [
        /.*-v[0-9]+\.(md|js|json)$/,
        /.*-old\.(js|md|json)$/,
        /.*-deprecated\.(js|md|json)$/,
        /.*-archive\.(js|md|json)$/,
        /.*-migration\.(md|js)$/,
        /cleanup-.*\.(sql|md|js)$/,
        /fix-.*\.(sql|md|js)$/
      ],
      
      redundant: [
        /.*-copy\.(js|md|json)$/,
        /.*-backup\.(js|md|json)$/,
        /.*\.bak$/,
        /.*\.old$/,
        /.*-duplicate\.(js|md|json)$/
      ],
      
      active: [
        /^(src|app|shared|config|migrations)\/.*\.(ts|js|json|sql)$/,
        /^package\.json$/,
        /^tsconfig\.json$/,
        /^\.env/,
        /^README\.md$/,
        /^LICENSE$/,
        /^\.git/
      ]
    };
    
    // Directories to skip
    this.skipDirs = new Set([
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      '.nyc_output'
    ]);
  }

  /**
   * Main analysis method
   */
  async analyze() {
    console.log('🔍 Starting repository analysis...');
    
    // Step 1: Scan all files and collect metadata
    await this.scanFiles();
    
    // Step 2: Categorize files based on patterns and content
    await this.categorizeFiles();
    
    // Step 3: Scan for dependencies and references
    await this.scanDependencies();
    
    // Step 4: Assess safety for removal
    await this.assessSafety();
    
    // Step 5: Generate analysis report
    const report = this.generateReport();
    
    console.log('✅ Analysis complete!');
    return report;
  }

  /**
   * Recursively scan all files and collect metadata
   */
  async scanFiles(dir = this.rootPath) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(this.rootPath, fullPath);
      
      if (entry.isDirectory()) {
        if (!this.skipDirs.has(entry.name)) {
          await this.scanFiles(fullPath);
        }
      } else if (entry.isFile()) {
        const metadata = await this.getFileMetadata(fullPath, relativePath);
        this.fileInventory.set(relativePath, metadata);
      }
    }
  }

  /**
   * Get comprehensive metadata for a file
   */
  async getFileMetadata(fullPath, relativePath) {
    const stats = fs.statSync(fullPath);
    const content = this.readFileContent(fullPath);
    
    return {
      path: relativePath,
      fullPath,
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      extension: path.extname(relativePath),
      basename: path.basename(relativePath),
      directory: path.dirname(relativePath),
      content: content.substring(0, 1000), // First 1KB for analysis
      contentHash: crypto.createHash('md5').update(content).digest('hex'),
      lineCount: content.split('\n').length,
      isEmpty: content.trim().length === 0,
      isExecutable: stats.mode & parseInt('111', 8),
      category: null,
      references: [],
      referencedBy: [],
      safeToRemove: false,
      removalRisk: 'unknown'
    };
  }

  /**
   * Safely read file content
   */
  readFileContent(filePath) {
    try {
      const buffer = fs.readFileSync(filePath);
      // Check if file is binary
      if (buffer.includes(0)) {
        return '[BINARY FILE]';
      }
      return buffer.toString('utf8');
    } catch (error) {
      return '[UNREADABLE FILE]';
    }
  }

  /**
   * Categorize files based on patterns and content analysis
   */
  async categorizeFiles() {
    console.log('📂 Categorizing files...');
    
    for (const [relativePath, metadata] of this.fileInventory) {
      let category = this.determineCategory(relativePath, metadata);
      
      // Content-based categorization refinement
      if (category === null) {
        category = this.analyzeContent(metadata);
      }
      
      metadata.category = category || 'unknown';
      this.categories[category] = this.categories[category] || [];
      this.categories[category].push(relativePath);
    }
  }

  /**
   * Determine category based on file patterns
   */
  determineCategory(relativePath, metadata) {
    // Check temporary patterns first (highest priority)
    for (const pattern of this.patterns.temporary) {
      if (pattern.test(relativePath) || pattern.test(metadata.basename)) {
        return 'temporary';
      }
    }
    
    // Check redundant patterns
    for (const pattern of this.patterns.redundant) {
      if (pattern.test(relativePath) || pattern.test(metadata.basename)) {
        return 'redundant';
      }
    }
    
    // Check legacy patterns
    for (const pattern of this.patterns.legacy) {
      if (pattern.test(relativePath) || pattern.test(metadata.basename)) {
        return 'legacy';
      }
    }
    
    // Check active patterns
    for (const pattern of this.patterns.active) {
      if (pattern.test(relativePath)) {
        return 'active';
      }
    }
    
    return null;
  }

  /**
   * Analyze file content for categorization hints
   */
  analyzeContent(metadata) {
    const content = metadata.content.toLowerCase();
    
    // Temporary/debug indicators
    const tempIndicators = [
      'todo', 'fixme', 'hack', 'temporary', 'debug', 'test only',
      'remove this', 'delete this', 'not used', 'deprecated'
    ];
    
    // Legacy indicators
    const legacyIndicators = [
      'legacy', 'old version', 'superseded', 'replaced by',
      'no longer used', 'archived'
    ];
    
    // Active indicators
    const activeIndicators = [
      'export', 'import', 'require', 'module.exports',
      'function', 'class', 'interface', 'type'
    ];
    
    if (tempIndicators.some(indicator => content.includes(indicator))) {
      return 'temporary';
    }
    
    if (legacyIndicators.some(indicator => content.includes(indicator))) {
      return 'legacy';
    }
    
    if (activeIndicators.some(indicator => content.includes(indicator))) {
      return 'active';
    }
    
    // Empty or minimal files might be temporary
    if (metadata.isEmpty || metadata.lineCount < 5) {
      return 'temporary';
    }
    
    return 'unknown';
  }

  /**
   * Scan for file dependencies and references
   */
  async scanDependencies() {
    console.log('🔗 Scanning dependencies...');
    
    for (const [relativePath, metadata] of this.fileInventory) {
      if (metadata.content === '[BINARY FILE]' || metadata.content === '[UNREADABLE FILE]') {
        continue;
      }
      
      const references = this.findReferences(metadata.content, relativePath);
      metadata.references = references;
      
      // Build reverse reference map
      for (const ref of references) {
        const referencedFile = this.fileInventory.get(ref);
        if (referencedFile) {
          referencedFile.referencedBy.push(relativePath);
        }
      }
    }
  }

  /**
   * Find file references in content
   */
  findReferences(content, currentPath) {
    const references = new Set();
    
    // Common import/require patterns
    const patterns = [
      // ES6 imports
      /import.*from\s+['"`]([^'"`]+)['"`]/g,
      // CommonJS requires
      /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
      // File paths in strings
      /['"`]([^'"`]*\.(js|ts|json|md|html|css|sql))['"`]/g,
      // Script src references
      /src\s*=\s*['"`]([^'"`]+)['"`]/g,
      // Link href references
      /href\s*=\s*['"`]([^'"`]+)['"`]/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        let refPath = match[1];
        
        // Resolve relative paths
        if (refPath.startsWith('./') || refPath.startsWith('../')) {
          refPath = path.normalize(path.join(path.dirname(currentPath), refPath));
        }
        
        // Check if referenced file exists in inventory
        if (this.fileInventory.has(refPath)) {
          references.add(refPath);
        }
      }
    }
    
    return Array.from(references);
  }

  /**
   * Assess safety for file removal
   */
  async assessSafety() {
    console.log('🛡️ Assessing removal safety...');
    
    for (const [relativePath, metadata] of this.fileInventory) {
      const assessment = this.calculateRemovalRisk(metadata);
      metadata.safeToRemove = assessment.safe;
      metadata.removalRisk = assessment.risk;
      metadata.riskReasons = assessment.reasons;
    }
  }

  /**
   * Calculate removal risk for a file
   */
  calculateRemovalRisk(metadata) {
    const reasons = [];
    let riskScore = 0;
    
    // Category-based risk
    switch (metadata.category) {
      case 'active':
        riskScore += 100;
        reasons.push('Categorized as active file');
        break;
      case 'legacy':
        riskScore += 30;
        reasons.push('Legacy file - may have historical value');
        break;
      case 'redundant':
        riskScore += 10;
        reasons.push('Redundant file - low risk');
        break;
      case 'temporary':
        riskScore += 5;
        reasons.push('Temporary file - very low risk');
        break;
    }
    
    // Reference-based risk
    if (metadata.referencedBy.length > 0) {
      riskScore += metadata.referencedBy.length * 20;
      reasons.push(`Referenced by ${metadata.referencedBy.length} files`);
    }
    
    // Size-based risk (large files might be important)
    if (metadata.size > 10000) {
      riskScore += 10;
      reasons.push('Large file size');
    }
    
    // Extension-based risk
    const criticalExtensions = ['.ts', '.js', '.json', '.sql', '.md'];
    if (criticalExtensions.includes(metadata.extension)) {
      riskScore += 15;
      reasons.push('Critical file type');
    }
    
    // Path-based risk
    const criticalPaths = ['src/', 'app/', 'shared/', 'config/', 'migrations/'];
    if (criticalPaths.some(p => metadata.path.startsWith(p))) {
      riskScore += 25;
      reasons.push('Located in critical directory');
    }
    
    // Determine risk level and safety
    let risk, safe;
    if (riskScore >= 80) {
      risk = 'high';
      safe = false;
    } else if (riskScore >= 40) {
      risk = 'medium';
      safe = false;
    } else if (riskScore >= 15) {
      risk = 'low';
      safe = true;
    } else {
      risk = 'very-low';
      safe = true;
    }
    
    return { safe, risk, reasons, score: riskScore };
  }

  /**
   * Generate comprehensive analysis report
   */
  generateReport() {
    const totalFiles = this.fileInventory.size;
    const categoryCounts = {};
    const safeToRemove = [];
    const riskyFiles = [];
    
    // Count categories and safety
    for (const [path, metadata] of this.fileInventory) {
      categoryCounts[metadata.category] = (categoryCounts[metadata.category] || 0) + 1;
      
      if (metadata.safeToRemove) {
        safeToRemove.push(path);
      } else if (metadata.removalRisk === 'high') {
        riskyFiles.push(path);
      }
    }
    
    return {
      summary: {
        totalFiles,
        categoryCounts,
        safeToRemoveCount: safeToRemove.length,
        riskyFilesCount: riskyFiles.length
      },
      categories: this.categories,
      safeToRemove,
      riskyFiles,
      fileInventory: Object.fromEntries(this.fileInventory),
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * Generate cleanup recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    
    // Temporary files recommendation
    if (this.categories.temporary?.length > 0) {
      recommendations.push({
        type: 'remove',
        category: 'temporary',
        files: this.categories.temporary,
        reason: 'Temporary files created for debugging or testing',
        priority: 'high'
      });
    }
    
    // Redundant files recommendation
    if (this.categories.redundant?.length > 0) {
      recommendations.push({
        type: 'remove',
        category: 'redundant',
        files: this.categories.redundant,
        reason: 'Duplicate or backup files',
        priority: 'medium'
      });
    }
    
    // Legacy files recommendation
    if (this.categories.legacy?.length > 0) {
      recommendations.push({
        type: 'review',
        category: 'legacy',
        files: this.categories.legacy,
        reason: 'Legacy files that may need archival before removal',
        priority: 'low'
      });
    }
    
    return recommendations;
  }

  /**
   * Save analysis report to file
   */
  async saveReport(report, outputPath = 'repository-analysis-report.json') {
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`📊 Analysis report saved to: ${outputPath}`);
  }
}

// CLI interface
if (require.main === module) {
  const analyzer = new RepositoryAnalyzer();
  
  analyzer.analyze()
    .then(report => {
      analyzer.saveReport(report);
      
      console.log('\n📊 Analysis Summary:');
      console.log(`Total files: ${report.summary.totalFiles}`);
      console.log(`Categories:`, report.summary.categoryCounts);
      console.log(`Safe to remove: ${report.summary.safeToRemoveCount}`);
      console.log(`High risk files: ${report.summary.riskyFilesCount}`);
      
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach(rec => {
        console.log(`- ${rec.type.toUpperCase()} ${rec.files.length} ${rec.category} files: ${rec.reason}`);
      });
    })
    .catch(error => {
      console.error('❌ Analysis failed:', error);
      process.exit(1);
    });
}

module.exports = RepositoryAnalyzer;