#!/usr/bin/env node

/**
 * Safety Assessment Tool
 * 
 * Evaluates files for safe removal based on multiple criteria:
 * - File categorization
 * - Dependency analysis
 * - Content analysis
 * - Risk assessment
 */

const fs = require('fs');
const path = require('path');
const RepositoryAnalyzer = require('./repository-analyzer');
const DependencyScanner = require('./dependency-scanner');

class SafetyAssessor {
  constructor(rootPath = '.') {
    this.rootPath = path.resolve(rootPath);
    this.analyzer = new RepositoryAnalyzer(rootPath);
    this.scanner = new DependencyScanner(rootPath);
    
    // Safety criteria weights
    this.weights = {
      category: 0.4,        // File category importance
      dependencies: 0.3,    // How many files depend on this
      content: 0.2,         // Content analysis
      metadata: 0.1         // File metadata (size, age, etc.)
    };
    
    // Risk thresholds
    this.thresholds = {
      safe: 20,      // Below this score = safe to remove
      caution: 50,   // Between safe and caution = review needed
      danger: 80     // Above caution = high risk
    };
  }

  /**
   * Perform comprehensive safety assessment
   */
  async assess() {
    console.log('🛡️ Starting safety assessment...');
    
    // Get repository analysis
    console.log('📊 Running repository analysis...');
    const analysisReport = await this.analyzer.analyze();
    
    // Get dependency analysis
    console.log('🔗 Running dependency analysis...');
    const dependencyReport = await this.scanner.scanAll();
    
    // Combine and assess
    console.log('⚖️ Calculating safety scores...');
    const safetyReport = this.calculateSafetyScores(analysisReport, dependencyReport);
    
    console.log('✅ Safety assessment complete!');
    return safetyReport;
  }

  /**
   * Calculate safety scores for all files
   */
  calculateSafetyScores(analysisReport, dependencyReport) {
    const safetyScores = new Map();
    const recommendations = {
      safeToRemove: [],
      reviewRequired: [],
      highRisk: [],
      criticalFiles: []
    };
    
    // Process each file
    for (const [filePath, metadata] of Object.entries(analysisReport.fileInventory)) {
      const score = this.calculateFileScore(
        metadata, 
        dependencyReport.reverseDependencies[filePath] || [],
        dependencyReport.dependencies[filePath] || []
      );
      
      safetyScores.set(filePath, score);
      
      // Categorize by safety level
      if (score.totalScore <= this.thresholds.safe) {
        recommendations.safeToRemove.push({
          path: filePath,
          score: score.totalScore,
          reasons: score.reasons
        });
      } else if (score.totalScore <= this.thresholds.caution) {
        recommendations.reviewRequired.push({
          path: filePath,
          score: score.totalScore,
          reasons: score.reasons
        });
      } else if (score.totalScore <= this.thresholds.danger) {
        recommendations.highRisk.push({
          path: filePath,
          score: score.totalScore,
          reasons: score.reasons
        });
      } else {
        recommendations.criticalFiles.push({
          path: filePath,
          score: score.totalScore,
          reasons: score.reasons
        });
      }
    }
    
    return {
      summary: {
        totalFiles: safetyScores.size,
        safeToRemove: recommendations.safeToRemove.length,
        reviewRequired: recommendations.reviewRequired.length,
        highRisk: recommendations.highRisk.length,
        criticalFiles: recommendations.criticalFiles.length
      },
      recommendations,
      detailedScores: Object.fromEntries(safetyScores),
      analysisReport,
      dependencyReport
    };
  }

  /**
   * Calculate safety score for individual file
   */
  calculateFileScore(metadata, dependents, dependencies) {
    const scores = {
      category: 0,
      dependencies: 0,
      content: 0,
      metadata: 0
    };
    const reasons = [];
    
    // Category-based scoring
    switch (metadata.category) {
      case 'temporary':
        scores.category = 5;
        reasons.push('Temporary file - very safe to remove');
        break;
      case 'redundant':
        scores.category = 10;
        reasons.push('Redundant file - safe to remove');
        break;
      case 'legacy':
        scores.category = 30;
        reasons.push('Legacy file - review before removal');
        break;
      case 'active':
        scores.category = 90;
        reasons.push('Active file - high risk to remove');
        break;
      default:
        scores.category = 50;
        reasons.push('Unknown category - requires review');
    }
    
    // Dependency-based scoring
    const dependentCount = dependents.length;
    if (dependentCount === 0) {
      scores.dependencies = 0;
      reasons.push('No files depend on this');
    } else if (dependentCount <= 2) {
      scores.dependencies = 20;
      reasons.push(`${dependentCount} files depend on this`);
    } else if (dependentCount <= 5) {
      scores.dependencies = 50;
      reasons.push(`${dependentCount} files depend on this - medium risk`);
    } else {
      scores.dependencies = 90;
      reasons.push(`${dependentCount} files depend on this - high risk`);
    }
    
    // Content-based scoring
    scores.content = this.analyzeContentSafety(metadata, reasons);
    
    // Metadata-based scoring
    scores.metadata = this.analyzeMetadataSafety(metadata, reasons);
    
    // Calculate weighted total
    const totalScore = 
      scores.category * this.weights.category +
      scores.dependencies * this.weights.dependencies +
      scores.content * this.weights.content +
      scores.metadata * this.weights.metadata;
    
    return {
      totalScore: Math.round(totalScore),
      breakdown: scores,
      reasons,
      dependents,
      dependencies
    };
  }

  /**
   * Analyze content for safety indicators
   */
  analyzeContentSafety(metadata, reasons) {
    let score = 0;
    
    // Empty files are usually safe to remove
    if (metadata.isEmpty) {
      reasons.push('Empty file');
      return 5;
    }
    
    // Very small files might be temporary
    if (metadata.lineCount < 5) {
      score += 10;
      reasons.push('Very small file');
    }
    
    // Check for safety indicators in content
    const content = metadata.content.toLowerCase();
    
    // Dangerous content indicators
    const dangerousKeywords = [
      'export', 'module.exports', 'class ', 'function ', 'interface ',
      'type ', 'const ', 'let ', 'var ', 'import ', 'require('
    ];
    
    const dangerousCount = dangerousKeywords.filter(keyword => 
      content.includes(keyword)
    ).length;
    
    if (dangerousCount > 3) {
      score += 70;
      reasons.push('Contains significant code structures');
    } else if (dangerousCount > 0) {
      score += 30;
      reasons.push('Contains some code structures');
    }
    
    // Safe content indicators
    const safeKeywords = [
      'todo', 'fixme', 'debug', 'test', 'temporary', 'remove',
      'delete', 'unused', 'deprecated', 'old'
    ];
    
    const safeCount = safeKeywords.filter(keyword => 
      content.includes(keyword)
    ).length;
    
    if (safeCount > 0) {
      score -= 20;
      reasons.push('Contains indicators suggesting temporary nature');
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Analyze metadata for safety indicators
   */
  analyzeMetadataSafety(metadata, reasons) {
    let score = 0;
    
    // File size considerations
    if (metadata.size > 50000) {
      score += 30;
      reasons.push('Large file size suggests importance');
    } else if (metadata.size < 100) {
      score -= 10;
      reasons.push('Very small file size');
    }
    
    // File age considerations
    const now = new Date();
    const daysSinceModified = (now - new Date(metadata.modified)) / (1000 * 60 * 60 * 24);
    
    if (daysSinceModified > 180) {
      score += 20;
      reasons.push('Not modified in 6+ months');
    } else if (daysSinceModified < 7) {
      score += 30;
      reasons.push('Recently modified');
    }
    
    // Extension-based risk
    const criticalExtensions = ['.ts', '.js', '.json'];
    const documentationExtensions = ['.md', '.txt'];
    const testExtensions = ['.test.js', '.test.ts', '.spec.js', '.spec.ts'];
    
    if (testExtensions.some(ext => metadata.path.includes(ext))) {
      score -= 10;
      reasons.push('Test file - lower risk');
    } else if (criticalExtensions.includes(metadata.extension)) {
      score += 20;
      reasons.push('Critical file type');
    } else if (documentationExtensions.includes(metadata.extension)) {
      score += 10;
      reasons.push('Documentation file');
    }
    
    // Path-based risk
    const criticalPaths = ['src/', 'app/', 'shared/', 'config/'];
    const safePaths = ['test/', 'tests/', '__tests__/', 'docs/', 'scripts/'];
    
    if (criticalPaths.some(p => metadata.path.startsWith(p))) {
      score += 25;
      reasons.push('Located in critical source directory');
    } else if (safePaths.some(p => metadata.path.startsWith(p))) {
      score -= 5;
      reasons.push('Located in non-critical directory');
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate removal plan based on safety assessment
   */
  generateRemovalPlan(safetyReport) {
    const plan = {
      phase1: {
        name: 'Safe Removal',
        description: 'Files that can be safely removed immediately',
        files: safetyReport.recommendations.safeToRemove.map(item => item.path),
        risk: 'very-low'
      },
      phase2: {
        name: 'Review and Remove',
        description: 'Files that need review but are likely safe to remove',
        files: safetyReport.recommendations.reviewRequired.map(item => item.path),
        risk: 'low'
      },
      phase3: {
        name: 'Careful Review',
        description: 'Files that require careful analysis before removal',
        files: safetyReport.recommendations.highRisk.map(item => item.path),
        risk: 'medium'
      },
      preserve: {
        name: 'Preserve',
        description: 'Critical files that should not be removed',
        files: safetyReport.recommendations.criticalFiles.map(item => item.path),
        risk: 'high'
      }
    };
    
    return plan;
  }

  /**
   * Save comprehensive safety report
   */
  async saveReport(safetyReport, outputPath = 'safety-assessment-report.json') {
    const removalPlan = this.generateRemovalPlan(safetyReport);
    
    const fullReport = {
      ...safetyReport,
      removalPlan,
      metadata: {
        generatedAt: new Date().toISOString(),
        tool: 'SafetyAssessor',
        version: '1.0.0'
      }
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(fullReport, null, 2));
    console.log(`📊 Safety assessment report saved to: ${outputPath}`);
    
    return fullReport;
  }
}

// CLI interface
if (require.main === module) {
  const assessor = new SafetyAssessor();
  
  assessor.assess()
    .then(report => {
      return assessor.saveReport(report);
    })
    .then(fullReport => {
      console.log('\n🛡️ Safety Assessment Summary:');
      console.log(`Total files: ${fullReport.summary.totalFiles}`);
      console.log(`Safe to remove: ${fullReport.summary.safeToRemove}`);
      console.log(`Review required: ${fullReport.summary.reviewRequired}`);
      console.log(`High risk: ${fullReport.summary.highRisk}`);
      console.log(`Critical files: ${fullReport.summary.criticalFiles}`);
      
      console.log('\n📋 Removal Plan:');
      console.log(`Phase 1 (Safe): ${fullReport.removalPlan.phase1.files.length} files`);
      console.log(`Phase 2 (Review): ${fullReport.removalPlan.phase2.files.length} files`);
      console.log(`Phase 3 (Careful): ${fullReport.removalPlan.phase3.files.length} files`);
      console.log(`Preserve: ${fullReport.removalPlan.preserve.files.length} files`);
    })
    .catch(error => {
      console.error('❌ Safety assessment failed:', error);
      process.exit(1);
    });
}

module.exports = SafetyAssessor;