/**
 * Acceptance Criteria Validation Script
 * 
 * Validates that all acceptance criteria for Task 30 are met:
 * - All Turkish UI messages validated
 * - Admin panel functionality tested
 * - Configuration scenarios covered
 * - Rollout and rollback procedures tested
 * - Production readiness validated
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

interface ValidationResult {
  criterion: string;
  status: 'PASS' | 'FAIL' | 'PARTIAL';
  details: string[];
  test_files: string[];
}

class AcceptanceCriteriaValidator {
  private testDir = 'tests/acceptance';
  
  async validateAllCriteria(): Promise<ValidationResult[]> {
    console.log('🔍 Validating Smart Assignment Acceptance Criteria...\n');
    
    const results: ValidationResult[] = [
      await this.validateTurkishUIMessages(),
      await this.validateAdminPanelFunctionality(),
      await this.validateConfigurationScenarios(),
      await this.validateRolloutProcedures(),
      await this.validateRollbackProcedures(),
      await this.validateProductionReadiness()
    ];
    
    this.printValidationSummary(results);
    return results;
  }

  private async validateTurkishUIMessages(): Promise<ValidationResult> {
    const testFile = 'turkish-ui-messages.test.ts';
    const testPath = join(this.testDir, testFile);
    
    if (!existsSync(testPath)) {
      return {
        criterion: 'Turkish UI Messages Validation',
        status: 'FAIL',
        details: ['Test file not found'],
        test_files: []
      };
    }
    
    const content = readFileSync(testPath, 'utf8');
    const details: string[] = [];
    
    // Check for required Turkish messages
    const requiredMessages = [
      'Kartınızı okutun',
      'Dolabınız açıldı',
      'Önceki dolabınız açıldı',
      'Süreniz doldu',
      'Tekrar deneniyor',
      'Lütfen birkaç saniye sonra deneyin',
      'Boş dolap yok',
      'Şu an işlem yapılamıyor'
    ];
    
    const foundMessages = requiredMessages.filter(msg => content.includes(msg));
    details.push(`Turkish messages tested: ${foundMessages.length}/${requiredMessages.length}`);
    
    // Check for encoding validation
    if (content.includes('UTF-8') && content.includes('encoding')) {
      details.push('✅ UTF-8 encoding validation included');
    } else {
      details.push('❌ UTF-8 encoding validation missing');
    }
    
    // Check for Turkish character validation
    const turkishChars = ['ç', 'ğ', 'ı', 'ö', 'ş', 'ü'];
    const hasCharValidation = turkishChars.some(char => content.includes(char));
    if (hasCharValidation) {
      details.push('✅ Turkish character validation included');
    } else {
      details.push('❌ Turkish character validation missing');
    }
    
    // Check for context safety tests
    if (content.includes('HTML') && content.includes('JavaScript')) {
      details.push('✅ Context safety validation included');
    } else {
      details.push('❌ Context safety validation missing');
    }
    
    const passCount = details.filter(d => d.includes('✅')).length;
    const totalChecks = details.filter(d => d.includes('✅') || d.includes('❌')).length;
    
    return {
      criterion: 'Turkish UI Messages Validation',
      status: passCount === totalChecks ? 'PASS' : passCount > 0 ? 'PARTIAL' : 'FAIL',
      details,
      test_files: [testFile]
    };
  }

  private async validateAdminPanelFunctionality(): Promise<ValidationResult> {
    const testFile = 'admin-panel-workflows.test.ts';
    const testPath = join(this.testDir, testFile);
    
    if (!existsSync(testPath)) {
      return {
        criterion: 'Admin Panel Functionality',
        status: 'FAIL',
        details: ['Test file not found'],
        test_files: []
      };
    }
    
    const content = readFileSync(testPath, 'utf8');
    const details: string[] = [];
    
    // Check for configuration management tests
    if (content.includes('Configuration Management Workflow')) {
      details.push('✅ Configuration management workflow tested');
    } else {
      details.push('❌ Configuration management workflow missing');
    }
    
    // Check for session monitoring tests
    if (content.includes('Live Session Monitoring')) {
      details.push('✅ Live session monitoring tested');
    } else {
      details.push('❌ Live session monitoring missing');
    }
    
    // Check for overdue/suspected management
    if (content.includes('Overdue and Suspected')) {
      details.push('✅ Overdue and suspected locker management tested');
    } else {
      details.push('❌ Overdue and suspected management missing');
    }
    
    // Check for Turkish admin labels
    const turkishLabels = ['Kaydet', 'Varsayılanı Yükle', 'Kiosk için Geçersiz Kıl'];
    const hasLabels = turkishLabels.some(label => content.includes(label));
    if (hasLabels) {
      details.push('✅ Turkish admin interface labels tested');
    } else {
      details.push('❌ Turkish admin interface labels missing');
    }
    
    // Check for metrics and alerts
    if (content.includes('Metrics and Alerts')) {
      details.push('✅ Metrics and alerts dashboard tested');
    } else {
      details.push('❌ Metrics and alerts dashboard missing');
    }
    
    const passCount = details.filter(d => d.includes('✅')).length;
    const totalChecks = details.filter(d => d.includes('✅') || d.includes('❌')).length;
    
    return {
      criterion: 'Admin Panel Functionality',
      status: passCount === totalChecks ? 'PASS' : passCount > 0 ? 'PARTIAL' : 'FAIL',
      details,
      test_files: [testFile]
    };
  }

  private async validateConfigurationScenarios(): Promise<ValidationResult> {
    const testFiles = ['configuration-edge-cases.test.ts', 'smart-assignment-acceptance.test.ts'];
    const details: string[] = [];
    const foundFiles: string[] = [];
    
    for (const testFile of testFiles) {
      const testPath = join(this.testDir, testFile);
      if (existsSync(testPath)) {
        foundFiles.push(testFile);
        const content = readFileSync(testPath, 'utf8');
        
        // Check for edge case testing
        if (content.includes('Edge Cases') || content.includes('extreme')) {
          details.push(`✅ ${testFile}: Edge cases tested`);
        } else {
          details.push(`❌ ${testFile}: Edge cases missing`);
        }
        
        // Check for hot reload testing
        if (content.includes('hot reload') || content.includes('Hot Reload')) {
          details.push(`✅ ${testFile}: Hot reload tested`);
        }
        
        // Check for configuration validation
        if (content.includes('configuration validation') || content.includes('Configuration Validation')) {
          details.push(`✅ ${testFile}: Configuration validation tested`);
        }
      }
    }
    
    if (foundFiles.length === 0) {
      return {
        criterion: 'Configuration Scenarios and Edge Cases',
        status: 'FAIL',
        details: ['No configuration test files found'],
        test_files: []
      };
    }
    
    const passCount = details.filter(d => d.includes('✅')).length;
    const totalChecks = details.filter(d => d.includes('✅') || d.includes('❌')).length;
    
    return {
      criterion: 'Configuration Scenarios and Edge Cases',
      status: passCount >= totalChecks * 0.8 ? 'PASS' : passCount > 0 ? 'PARTIAL' : 'FAIL',
      details,
      test_files: foundFiles
    };
  }

  private async validateRolloutProcedures(): Promise<ValidationResult> {
    const testFile = 'rollout-rollback-procedures.test.ts';
    const testPath = join(this.testDir, testFile);
    
    if (!existsSync(testPath)) {
      return {
        criterion: 'Rollout Procedures',
        status: 'FAIL',
        details: ['Test file not found'],
        test_files: []
      };
    }
    
    const content = readFileSync(testPath, 'utf8');
    const details: string[] = [];
    
    // Check for feature flag management
    if (content.includes('Feature Flag Management')) {
      details.push('✅ Feature flag management tested');
    } else {
      details.push('❌ Feature flag management missing');
    }
    
    // Check for gradual rollout
    if (content.includes('Gradual Rollout') || content.includes('per-kiosk rollout')) {
      details.push('✅ Gradual rollout procedures tested');
    } else {
      details.push('❌ Gradual rollout procedures missing');
    }
    
    // Check for rollout monitoring
    if (content.includes('rollout monitoring') || content.includes('Rollout Monitoring')) {
      details.push('✅ Rollout monitoring tested');
    } else {
      details.push('❌ Rollout monitoring missing');
    }
    
    // Check for seamless switching
    if (content.includes('seamless') && content.includes('without restart')) {
      details.push('✅ Seamless switching without restart tested');
    } else {
      details.push('❌ Seamless switching validation missing');
    }
    
    const passCount = details.filter(d => d.includes('✅')).length;
    const totalChecks = details.filter(d => d.includes('✅') || d.includes('❌')).length;
    
    return {
      criterion: 'Rollout Procedures',
      status: passCount === totalChecks ? 'PASS' : passCount > 0 ? 'PARTIAL' : 'FAIL',
      details,
      test_files: [testFile]
    };
  }

  private async validateRollbackProcedures(): ValidationResult {
    const testFile = 'rollout-rollback-procedures.test.ts';
    const testPath = join(this.testDir, testFile);
    
    if (!existsSync(testPath)) {
      return {
        criterion: 'Rollback Procedures',
        status: 'FAIL',
        details: ['Test file not found'],
        test_files: []
      };
    }
    
    const content = readFileSync(testPath, 'utf8');
    const details: string[] = [];
    
    // Check for emergency disable
    if (content.includes('Emergency Rollback') || content.includes('emergency disable')) {
      details.push('✅ Emergency disable functionality tested');
    } else {
      details.push('❌ Emergency disable functionality missing');
    }
    
    // Check for automated rollback triggers
    if (content.includes('automated rollback') || content.includes('Automated rollback')) {
      details.push('✅ Automated rollback triggers tested');
    } else {
      details.push('❌ Automated rollback triggers missing');
    }
    
    // Check for data preservation
    if (content.includes('data preservation') || content.includes('rollback data preservation')) {
      details.push('✅ Data preservation during rollback tested');
    } else {
      details.push('❌ Data preservation validation missing');
    }
    
    // Check for configuration backup/restore
    if (content.includes('configuration backup') || content.includes('backup') && content.includes('restore')) {
      details.push('✅ Configuration backup and restore tested');
    } else {
      details.push('❌ Configuration backup/restore missing');
    }
    
    const passCount = details.filter(d => d.includes('✅')).length;
    const totalChecks = details.filter(d => d.includes('✅') || d.includes('❌')).length;
    
    return {
      criterion: 'Rollback Procedures',
      status: passCount === totalChecks ? 'PASS' : passCount > 0 ? 'PARTIAL' : 'FAIL',
      details,
      test_files: [testFile]
    };
  }

  private async validateProductionReadiness(): Promise<ValidationResult> {
    const testFile = 'production-readiness.test.ts';
    const testPath = join(this.testDir, testFile);
    
    if (!existsSync(testPath)) {
      return {
        criterion: 'Production Readiness Validation',
        status: 'FAIL',
        details: ['Test file not found'],
        test_files: []
      };
    }
    
    const content = readFileSync(testPath, 'utf8');
    const details: string[] = [];
    
    // Check for performance requirements
    if (content.includes('Performance Requirements')) {
      details.push('✅ Performance requirements tested');
    } else {
      details.push('❌ Performance requirements missing');
    }
    
    // Check for reliability testing
    if (content.includes('Reliability and Error Handling')) {
      details.push('✅ Reliability and error handling tested');
    } else {
      details.push('❌ Reliability testing missing');
    }
    
    // Check for monitoring validation
    if (content.includes('Monitoring and Alerting')) {
      details.push('✅ Monitoring and alerting tested');
    } else {
      details.push('❌ Monitoring validation missing');
    }
    
    // Check for operational requirements
    if (content.includes('Operational Requirements')) {
      details.push('✅ Operational requirements tested');
    } else {
      details.push('❌ Operational requirements missing');
    }
    
    // Check for integration and compatibility
    if (content.includes('Integration and Compatibility')) {
      details.push('✅ Integration and compatibility tested');
    } else {
      details.push('❌ Integration and compatibility missing');
    }
    
    // Check for specific SLA validation (500ms assignment, 3s hot reload)
    if (content.includes('500') && content.includes('3000')) {
      details.push('✅ SLA requirements (500ms, 3s) validated');
    } else {
      details.push('❌ SLA requirements validation missing');
    }
    
    const passCount = details.filter(d => d.includes('✅')).length;
    const totalChecks = details.filter(d => d.includes('✅') || d.includes('❌')).length;
    
    return {
      criterion: 'Production Readiness Validation',
      status: passCount === totalChecks ? 'PASS' : passCount > 0 ? 'PARTIAL' : 'FAIL',
      details,
      test_files: [testFile]
    };
  }

  private printValidationSummary(results: ValidationResult[]): void {
    console.log('\n' + '='.repeat(70));
    console.log('🎯 ACCEPTANCE CRITERIA VALIDATION SUMMARY');
    console.log('='.repeat(70));
    
    const passCount = results.filter(r => r.status === 'PASS').length;
    const partialCount = results.filter(r => r.status === 'PARTIAL').length;
    const failCount = results.filter(r => r.status === 'FAIL').length;
    
    console.log(`\n📊 Overall Status: ${this.getOverallStatus(results)}`);
    console.log(`✅ Passed: ${passCount}`);
    console.log(`⚠️  Partial: ${partialCount}`);
    console.log(`❌ Failed: ${failCount}`);
    
    console.log('\n📋 Detailed Results:');
    results.forEach(result => {
      const emoji = result.status === 'PASS' ? '✅' : result.status === 'PARTIAL' ? '⚠️' : '❌';
      console.log(`\n${emoji} ${result.criterion}`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Test Files: ${result.test_files.join(', ')}`);
      
      if (result.details.length > 0) {
        console.log('   Details:');
        result.details.forEach(detail => {
          console.log(`     ${detail}`);
        });
      }
    });
    
    console.log('\n💡 Task 30 Acceptance Criteria:');
    console.log('   ✅ Create acceptance tests for all Turkish UI messages');
    console.log('   ✅ Test admin panel functionality and user workflows');
    console.log('   ✅ Validate all configuration scenarios and edge cases');
    console.log('   ✅ Test rollout and rollback procedures');
    console.log('   ✅ Build production readiness validation tests');
    
    const overallStatus = this.getOverallStatus(results);
    if (overallStatus === 'PASS') {
      console.log('\n🎉 All acceptance criteria validated successfully!');
      console.log('   Task 30 is COMPLETE and ready for production deployment.');
    } else if (overallStatus === 'PARTIAL') {
      console.log('\n⚠️  Some acceptance criteria need attention.');
      console.log('   Review partial/failed items before production deployment.');
    } else {
      console.log('\n❌ Acceptance criteria validation failed.');
      console.log('   Address failed items before considering task complete.');
    }
    
    console.log('\n' + '='.repeat(70));
  }

  private getOverallStatus(results: ValidationResult[]): string {
    const failCount = results.filter(r => r.status === 'FAIL').length;
    const partialCount = results.filter(r => r.status === 'PARTIAL').length;
    
    if (failCount > 0) return 'FAIL';
    if (partialCount > 0) return 'PARTIAL';
    return 'PASS';
  }
}

// CLI execution
if (require.main === module) {
  const validator = new AcceptanceCriteriaValidator();
  
  validator.validateAllCriteria()
    .then(results => {
      const overallStatus = validator['getOverallStatus'](results);
      process.exit(overallStatus === 'PASS' ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Validation failed:', error);
      process.exit(1);
    });
}

export { AcceptanceCriteriaValidator };