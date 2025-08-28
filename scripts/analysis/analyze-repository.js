#!/usr/bin/env node

/**
 * Repository Analysis Orchestrator
 * 
 * Main script that coordinates all analysis tools:
 * - File scanner and inventory
 * - File categorization
 * - Dependency scanning
 * - Safety assessment
 * 
 * Generates comprehensive cleanup recommendations
 */

const fs = require('fs');
const path = require('path');
const RepositoryAnalyzer = require('./repository-analyzer');
const FileCategorizer = require('./file-categorizer');
const DependencyScanner = require('./dependency-scanner');
const SafetyAssessor = require('./safety-assessor');

class RepositoryAnalysisOrchestrator {
  constructor(rootPath = '.') {
    this.rootPath = path.resolve(rootPath);
    this.outputDir = path.join(rootPath, 'analysis-reports');
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Run complete repository analysis
   */
  async runCompleteAnalysis() {
    console.log('🚀 Starting comprehensive repository analysis...');
    console.log(`📁 Analyzing: ${this.rootPath}`);
    console.log(`📊 Reports will be saved to: ${this.outputDir}`);
    
    const startTime = Date.now();
    const results = {};
    
    try {
      // Step 1: File Categorization
      console.log('\n📂 Step 1: File Categorization');
      const categorizer = new FileCategorizer(this.rootPath);
      results.categorization = await categorizer.categorizeAll();
      const categorizationReport = categorizer.generateReport(results.categorization);
      await this.saveReport('categorization', categorizationReport);
      
      // Step 2: Dependency Analysis
      console.log('\n🔗 Step 2: Dependency Analysis');
      const dependencyScanner = new DependencyScanner(this.rootPath);
      results.dependencies = await dependencyScanner.scanAll();
      await this.saveReport('dependencies', results.dependencies);
      
      // Step 3: Repository Analysis
      console.log('\n📊 Step 3: Repository Analysis');
      const repositoryAnalyzer = new RepositoryAnalyzer(this.rootPath);
      results.repository = await repositoryAnalyzer.analyze();
      await this.saveReport('repository', results.repository);
      
      // Step 4: Safety Assessment
      console.log('\n🛡️ Step 4: Safety Assessment');
      const safetyAssessor = new SafetyAssessor(this.rootPath);
      results.safety = await safetyAssessor.assess();
      await this.saveReport('safety', results.safety);
      
      // Step 5: Generate Master Report
      console.log('\n📋 Step 5: Generating Master Report');
      const masterReport = this.generateMasterReport(results);
      await this.saveReport('master-analysis', masterReport);
      
      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);
      
      console.log(`\n✅ Analysis complete! (${duration}s)`);
      this.printSummary(masterReport);
      
      return masterReport;
      
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      throw error;
    }
  }

  /**
   * Generate comprehensive master report
   */
  generateMasterReport(results) {
    const totalFiles = Object.keys(results.categorization.files).length;
    
    // Combine insights from all analyses
    const insights = this.generateInsights(results);
    
    // Generate prioritized cleanup plan
    const cleanupPlan = this.generateCleanupPlan(results);
    
    // Calculate potential space savings
    const spaceSavings = this.calculateSpaceSavings(results);
    
    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        analysisVersion: '1.0.0',
        repositoryPath: this.rootPath,
        totalFiles: totalFiles
      },
      
      summary: {
        totalFiles,
        categorization: results.categorization.summary,
        safety: results.safety.summary,
        dependencies: {
          filesWithDependencies: Object.keys(results.dependencies.dependencies).filter(
            f => results.dependencies.dependencies[f].length > 0
          ).length,
          filesBeingReferenced: Object.keys(results.dependencies.reverseDependencies).length
        }
      },
      
      insights,
      cleanupPlan,
      spaceSavings,
      
      // Detailed results from each analysis
      detailedResults: {
        categorization: results.categorization,
        dependencies: results.dependencies,
        repository: results.repository,
        safety: results.safety
      }
    };
  }

  /**
   * Generate actionable insights
   */
  generateInsights(results) {
    const insights = [];
    
    // Categorization insights
    const categories = results.categorization.summary;
    if (categories.temporary > 0) {
      insights.push({
        type: 'opportunity',
        category: 'cleanup',
        message: `Found ${categories.temporary} temporary files that can be safely removed`,
        impact: 'high',
        files: categories.temporary
      });
    }
    
    if (categories.redundant > 0) {
      insights.push({
        type: 'opportunity',
        category: 'cleanup',
        message: `Found ${categories.redundant} redundant files (duplicates/backups)`,
        impact: 'medium',
        files: categories.redundant
      });
    }
    
    if (categories.legacy > 0) {
      insights.push({
        type: 'review',
        category: 'cleanup',
        message: `Found ${categories.legacy} legacy files that may need archival`,
        impact: 'low',
        files: categories.legacy
      });
    }
    
    // Safety insights
    const safety = results.safety.summary;
    if (safety.safeToRemove > 0) {
      insights.push({
        type: 'opportunity',
        category: 'safety',
        message: `${safety.safeToRemove} files are safe to remove immediately`,
        impact: 'high',
        files: safety.safeToRemove
      });
    }
    
    if (safety.criticalFiles > 0) {
      insights.push({
        type: 'warning',
        category: 'safety',
        message: `${safety.criticalFiles} critical files should never be removed`,
        impact: 'critical',
        files: safety.criticalFiles
      });
    }
    
    // Dependency insights
    const orphanedFiles = Object.keys(results.dependencies.dependencies).filter(
      file => !results.dependencies.reverseDependencies[file]
    );
    
    if (orphanedFiles.length > 0) {
      insights.push({
        type: 'opportunity',
        category: 'dependencies',
        message: `${orphanedFiles.length} files have no dependencies (potential orphans)`,
        impact: 'medium',
        files: orphanedFiles.length
      });
    }
    
    return insights;
  }

  /**
   * Generate prioritized cleanup plan
   */
  generateCleanupPlan(results) {
    const plan = {
      immediate: {
        description: 'Files that can be removed immediately with no risk',
        files: [],
        estimatedSavings: 0
      },
      
      review: {
        description: 'Files that need review but are likely safe to remove',
        files: [],
        estimatedSavings: 0
      },
      
      careful: {
        description: 'Files requiring careful analysis before removal',
        files: [],
        estimatedSavings: 0
      },
      
      preserve: {
        description: 'Files that should be preserved',
        files: [],
        totalSize: 0
      }
    };
    
    // Use safety assessment to populate plan
    if (results.safety.recommendations) {
      plan.immediate.files = results.safety.recommendations.safeToRemove.map(item => ({
        path: item.path,
        reason: item.reasons[0],
        score: item.score
      }));
      
      plan.review.files = results.safety.recommendations.reviewRequired.map(item => ({
        path: item.path,
        reason: item.reasons[0],
        score: item.score
      }));
      
      plan.careful.files = results.safety.recommendations.highRisk.map(item => ({
        path: item.path,
        reason: item.reasons[0],
        score: item.score
      }));
      
      plan.preserve.files = results.safety.recommendations.criticalFiles.map(item => ({
        path: item.path,
        reason: item.reasons[0],
        score: item.score
      }));
    }
    
    return plan;
  }

  /**
   * Calculate potential space savings
   */
  calculateSpaceSavings(results) {
    let totalSize = 0;
    let removableSize = 0;
    
    // Calculate from repository analysis if available
    if (results.repository.fileInventory) {
      for (const [filePath, metadata] of Object.entries(results.repository.fileInventory)) {
        totalSize += metadata.size || 0;
        
        // Check if file is in safe-to-remove list
        const isSafeToRemove = results.safety.recommendations?.safeToRemove?.some(
          item => item.path === filePath
        );
        
        if (isSafeToRemove) {
          removableSize += metadata.size || 0;
        }
      }
    }
    
    return {
      totalRepositorySize: totalSize,
      potentialSavings: removableSize,
      savingsPercentage: totalSize > 0 ? Math.round((removableSize / totalSize) * 100) : 0,
      formattedTotal: this.formatBytes(totalSize),
      formattedSavings: this.formatBytes(removableSize)
    };
  }

  /**
   * Format bytes to human readable format
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Save report to file
   */
  async saveReport(name, data) {
    const filename = `${name}-report.json`;
    const filepath = path.join(this.outputDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`  📄 Saved: ${filename}`);
  }

  /**
   * Print analysis summary
   */
  printSummary(masterReport) {
    console.log('\n📊 ANALYSIS SUMMARY');
    console.log('='.repeat(50));
    
    console.log(`\n📁 Repository: ${masterReport.metadata.repositoryPath}`);
    console.log(`📄 Total Files: ${masterReport.summary.totalFiles}`);
    
    console.log('\n📂 File Categories:');
    for (const [category, count] of Object.entries(masterReport.summary.categorization)) {
      console.log(`  ${category}: ${count} files`);
    }
    
    console.log('\n🛡️ Safety Assessment:');
    console.log(`  Safe to remove: ${masterReport.summary.safety.safeToRemove}`);
    console.log(`  Review required: ${masterReport.summary.safety.reviewRequired}`);
    console.log(`  High risk: ${masterReport.summary.safety.highRisk}`);
    console.log(`  Critical files: ${masterReport.summary.safety.criticalFiles}`);
    
    console.log('\n💾 Space Analysis:');
    console.log(`  Total size: ${masterReport.spaceSavings.formattedTotal}`);
    console.log(`  Potential savings: ${masterReport.spaceSavings.formattedSavings} (${masterReport.spaceSavings.savingsPercentage}%)`);
    
    console.log('\n💡 Key Insights:');
    masterReport.insights.slice(0, 5).forEach(insight => {
      const icon = insight.type === 'opportunity' ? '🟢' : 
                   insight.type === 'warning' ? '🟡' : '🔴';
      console.log(`  ${icon} ${insight.message}`);
    });
    
    console.log('\n📋 Next Steps:');
    console.log(`  1. Review immediate cleanup: ${masterReport.cleanupPlan.immediate.files.length} files`);
    console.log(`  2. Analyze review candidates: ${masterReport.cleanupPlan.review.files.length} files`);
    console.log(`  3. Carefully examine: ${masterReport.cleanupPlan.careful.files.length} files`);
    console.log(`  4. Preserve critical files: ${masterReport.cleanupPlan.preserve.files.length} files`);
    
    console.log(`\n📊 Detailed reports saved to: ${this.outputDir}`);
  }

  /**
   * Generate cleanup script based on analysis
   */
  generateCleanupScript(masterReport) {
    const scriptPath = path.join(this.outputDir, 'cleanup-script.sh');
    
    let script = '#!/bin/bash\n\n';
    script += '# Repository Cleanup Script\n';
    script += `# Generated on ${new Date().toISOString()}\n`;
    script += '# Review carefully before execution!\n\n';
    
    script += '# Phase 1: Safe to remove immediately\n';
    script += 'echo "Phase 1: Removing safe files..."\n';
    
    masterReport.cleanupPlan.immediate.files.forEach(file => {
      script += `# ${file.reason}\n`;
      script += `rm "${file.path}"\n`;
    });
    
    script += '\n# Phase 2: Review required (commented out for safety)\n';
    masterReport.cleanupPlan.review.files.forEach(file => {
      script += `# rm "${file.path}"  # ${file.reason}\n`;
    });
    
    fs.writeFileSync(scriptPath, script);
    console.log(`\n🔧 Cleanup script generated: ${scriptPath}`);
    console.log('⚠️  Review the script carefully before execution!');
  }
}

// CLI interface
if (require.main === module) {
  const orchestrator = new RepositoryAnalysisOrchestrator();
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const generateScript = args.includes('--generate-script');
  
  orchestrator.runCompleteAnalysis()
    .then(masterReport => {
      if (generateScript) {
        orchestrator.generateCleanupScript(masterReport);
      }
      
      console.log('\n🎉 Repository analysis complete!');
      console.log('Review the generated reports before proceeding with cleanup.');
    })
    .catch(error => {
      console.error('❌ Analysis failed:', error);
      process.exit(1);
    });
}

module.exports = RepositoryAnalysisOrchestrator;