/**
 * Smart Assignment Acceptance Test Runner
 * 
 * Runs all acceptance tests and generates comprehensive validation report
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface TestResult {
  suite: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  errors: string[];
}

interface AcceptanceReport {
  timestamp: string;
  overall_status: 'PASS' | 'FAIL' | 'PARTIAL';
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  test_suites: TestResult[];
  requirements_coverage: RequirementsCoverage;
  production_readiness: ProductionReadiness;
  recommendations: string[];
}

interface RequirementsCoverage {
  turkish_ui_messages: boolean;
  admin_panel_functionality: boolean;
  configuration_scenarios: boolean;
  rollout_procedures: boolean;
  rollback_procedures: boolean;
  production_validation: boolean;
}

interface ProductionReadiness {
  performance_validated: boolean;
  reliability_validated: boolean;
  monitoring_validated: boolean;
  security_validated: boolean;
  compatibility_validated: boolean;
  overall_ready: boolean;
}

class AcceptanceTestRunner {
  private testSuites = [
    {
      name: 'Turkish UI Messages',
      file: 'tests/acceptance/turkish-ui-messages.test.ts',
      requirement: 'turkish_ui_messages'
    },
    {
      name: 'Admin Panel Workflows',
      file: 'tests/acceptance/admin-panel-workflows.test.ts',
      requirement: 'admin_panel_functionality'
    },
    {
      name: 'Configuration Edge Cases',
      file: 'tests/acceptance/configuration-edge-cases.test.ts',
      requirement: 'configuration_scenarios'
    },
    {
      name: 'Rollout and Rollback Procedures',
      file: 'tests/acceptance/rollout-rollback-procedures.test.ts',
      requirement: 'rollout_procedures'
    },
    {
      name: 'Production Readiness',
      file: 'tests/acceptance/production-readiness.test.ts',
      requirement: 'production_validation'
    },
    {
      name: 'Smart Assignment Acceptance',
      file: 'tests/acceptance/smart-assignment-acceptance.test.ts',
      requirement: 'configuration_scenarios'
    }
  ];

  async runAllTests(): Promise<AcceptanceReport> {
    console.log('🚀 Starting Smart Assignment Acceptance Tests...\n');
    
    const results: TestResult[] = [];
    const startTime = Date.now();

    for (const suite of this.testSuites) {
      console.log(`📋 Running ${suite.name}...`);
      const result = await this.runTestSuite(suite);
      results.push(result);
      
      if (result.failed > 0) {
        console.log(`❌ ${suite.name}: ${result.failed} failures`);
      } else {
        console.log(`✅ ${suite.name}: All tests passed`);
      }
    }

    const totalDuration = Date.now() - startTime;
    const report = this.generateReport(results, totalDuration);
    
    await this.saveReport(report);
    this.printSummary(report);
    
    return report;
  }

  private async runTestSuite(suite: { name: string; file: string; requirement: string }): Promise<TestResult> {
    const suiteStartTime = Date.now();
    
    try {
      // Run vitest for specific test file
      const output = execSync(`npx vitest run ${suite.file} --reporter=json`, {
        encoding: 'utf8',
        timeout: 60000 // 1 minute timeout per suite
      });
      
      const testOutput = JSON.parse(output);
      const duration = Date.now() - suiteStartTime;
      
      return {
        suite: suite.name,
        passed: testOutput.numPassedTests || 0,
        failed: testOutput.numFailedTests || 0,
        skipped: testOutput.numPendingTests || 0,
        duration,
        errors: testOutput.testResults?.flatMap((r: any) => 
          r.assertionResults?.filter((a: any) => a.status === 'failed')
            .map((a: any) => a.failureMessages?.join('\n'))
        ).filter(Boolean) || []
      };
    } catch (error) {
      const duration = Date.now() - suiteStartTime;
      
      return {
        suite: suite.name,
        passed: 0,
        failed: 1,
        skipped: 0,
        duration,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  private generateReport(results: TestResult[], totalDuration: number): AcceptanceReport {
    const totalTests = results.reduce((sum, r) => sum + r.passed + r.failed + r.skipped, 0);
    const passedTests = results.reduce((sum, r) => sum + r.passed, 0);
    const failedTests = results.reduce((sum, r) => sum + r.failed, 0);
    
    const requirementsCoverage = this.assessRequirementsCoverage(results);
    const productionReadiness = this.assessProductionReadiness(results);
    
    const overallStatus = failedTests === 0 ? 'PASS' : 
                         passedTests > failedTests ? 'PARTIAL' : 'FAIL';

    return {
      timestamp: new Date().toISOString(),
      overall_status: overallStatus,
      total_tests: totalTests,
      passed_tests: passedTests,
      failed_tests: failedTests,
      test_suites: results,
      requirements_coverage: requirementsCoverage,
      production_readiness: productionReadiness,
      recommendations: this.generateRecommendations(results, requirementsCoverage, productionReadiness)
    };
  }

  private assessRequirementsCoverage(results: TestResult[]): RequirementsCoverage {
    const suiteMap = new Map(results.map(r => [r.suite, r.failed === 0]));
    
    return {
      turkish_ui_messages: suiteMap.get('Turkish UI Messages') || false,
      admin_panel_functionality: suiteMap.get('Admin Panel Workflows') || false,
      configuration_scenarios: suiteMap.get('Smart Assignment Acceptance') || false,
      rollout_procedures: suiteMap.get('Rollout and Rollback Procedures') || false,
      rollback_procedures: suiteMap.get('Rollout and Rollback Procedures') || false,
      production_validation: suiteMap.get('Production Readiness') || false
    };
  }

  private assessProductionReadiness(results: TestResult[]): ProductionReadiness {
    const productionSuite = results.find(r => r.suite === 'Production Readiness');
    const adminSuite = results.find(r => r.suite === 'Admin Panel Workflows');
    const rolloutSuite = results.find(r => r.suite === 'Rollout and Rollback Procedures');
    
    const performance_validated = productionSuite?.failed === 0;
    const reliability_validated = productionSuite?.failed === 0;
    const monitoring_validated = adminSuite?.failed === 0;
    const security_validated = productionSuite?.failed === 0;
    const compatibility_validated = productionSuite?.failed === 0;
    
    return {
      performance_validated,
      reliability_validated,
      monitoring_validated,
      security_validated,
      compatibility_validated,
      overall_ready: performance_validated && reliability_validated && 
                    monitoring_validated && security_validated && compatibility_validated
    };
  }

  private generateRecommendations(
    results: TestResult[], 
    coverage: RequirementsCoverage, 
    readiness: ProductionReadiness
  ): string[] {
    const recommendations: string[] = [];
    
    // Check for failed test suites
    const failedSuites = results.filter(r => r.failed > 0);
    if (failedSuites.length > 0) {
      recommendations.push(
        `Fix failing tests in: ${failedSuites.map(s => s.suite).join(', ')}`
      );
    }
    
    // Check requirements coverage
    if (!coverage.turkish_ui_messages) {
      recommendations.push('Complete Turkish UI message validation');
    }
    if (!coverage.admin_panel_functionality) {
      recommendations.push('Validate admin panel workflows');
    }
    if (!coverage.rollout_procedures) {
      recommendations.push('Test rollout and rollback procedures');
    }
    
    // Check production readiness
    if (!readiness.performance_validated) {
      recommendations.push('Address performance issues before production deployment');
    }
    if (!readiness.reliability_validated) {
      recommendations.push('Improve system reliability and error handling');
    }
    if (!readiness.monitoring_validated) {
      recommendations.push('Implement comprehensive monitoring and alerting');
    }
    
    // Overall recommendations
    if (readiness.overall_ready) {
      recommendations.push('✅ System is ready for production deployment');
      recommendations.push('Consider gradual rollout starting with pilot kiosk');
      recommendations.push('Monitor key metrics during initial deployment');
    } else {
      recommendations.push('❌ System requires additional work before production');
      recommendations.push('Focus on failing test areas');
      recommendations.push('Re-run acceptance tests after fixes');
    }
    
    return recommendations;
  }

  private async saveReport(report: AcceptanceReport): Promise<void> {
    const reportsDir = 'tests/acceptance/reports';
    if (!existsSync(reportsDir)) {
      mkdirSync(reportsDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = join(reportsDir, `acceptance-report-${timestamp}.json`);
    
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    // Also save as latest report
    const latestPath = join(reportsDir, 'latest-acceptance-report.json');
    writeFileSync(latestPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📄 Report saved to: ${reportPath}`);
  }

  private printSummary(report: AcceptanceReport): void {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 SMART ASSIGNMENT ACCEPTANCE TEST SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`\n📊 Overall Status: ${this.getStatusEmoji(report.overall_status)} ${report.overall_status}`);
    console.log(`📈 Tests: ${report.passed_tests}/${report.total_tests} passed`);
    
    if (report.failed_tests > 0) {
      console.log(`❌ Failed: ${report.failed_tests}`);
    }
    
    console.log('\n📋 Requirements Coverage:');
    Object.entries(report.requirements_coverage).forEach(([req, covered]) => {
      console.log(`  ${covered ? '✅' : '❌'} ${req.replace(/_/g, ' ')}`);
    });
    
    console.log('\n🚀 Production Readiness:');
    Object.entries(report.production_readiness).forEach(([aspect, ready]) => {
      if (aspect !== 'overall_ready') {
        console.log(`  ${ready ? '✅' : '❌'} ${aspect.replace(/_/g, ' ')}`);
      }
    });
    
    console.log(`\n🎯 Production Ready: ${report.production_readiness.overall_ready ? '✅ YES' : '❌ NO'}`);
    
    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach(rec => {
        console.log(`  • ${rec}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
  }

  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'PASS': return '✅';
      case 'PARTIAL': return '⚠️';
      case 'FAIL': return '❌';
      default: return '❓';
    }
  }
}

// CLI execution
if (require.main === module) {
  const runner = new AcceptanceTestRunner();
  
  runner.runAllTests()
    .then(report => {
      process.exit(report.overall_status === 'PASS' ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Acceptance test runner failed:', error);
      process.exit(1);
    });
}

export { AcceptanceTestRunner, AcceptanceReport };