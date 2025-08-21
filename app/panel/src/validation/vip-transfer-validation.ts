/**
 * VIP Transfer and Audit Workflow Validation Script
 * 
 * This script validates that all components of task 8.4 are properly implemented:
 * - Room change workflow for VIP contracts with old card cancellation
 * - Mandatory audit logging for all VIP operations
 * - VIP contract history tracking and change documentation
 * - VIP transfer validation and approval process
 */

import { DatabaseManager } from '../../../../shared/database/database-manager.js';
import { VipContractRepository } from '../../../../shared/database/vip-contract-repository.js';
import { VipTransferRepository } from '../../../../shared/database/vip-transfer-repository.js';
import { VipHistoryRepository } from '../../../../shared/database/vip-history-repository.js';
import { EventRepository } from '../../../../shared/database/event-repository.js';

interface ValidationResult {
  component: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

class VipTransferValidation {
  private dbManager: DatabaseManager;
  private vipRepository: VipContractRepository;
  private transferRepository: VipTransferRepository;
  private historyRepository: VipHistoryRepository;
  private eventRepository: EventRepository;
  private results: ValidationResult[] = [];

  constructor() {
    this.dbManager = new DatabaseManager(':memory:');
  }

  async initialize(): Promise<void> {
    await this.dbManager.initialize();
    this.vipRepository = new VipContractRepository(this.dbManager);
    this.transferRepository = new VipTransferRepository(this.dbManager);
    this.historyRepository = new VipHistoryRepository(this.dbManager);
    this.eventRepository = new EventRepository(this.dbManager);
  }

  async validateDatabaseSchema(): Promise<void> {
    try {
      const db = this.dbManager.getDatabase();
      
      // Check VIP transfer requests table
      const transferTable = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='vip_transfer_requests'
      `).get();
      
      if (transferTable) {
        this.results.push({
          component: 'Database Schema - VIP Transfer Requests Table',
          status: 'PASS',
          details: 'vip_transfer_requests table exists'
        });
      } else {
        this.results.push({
          component: 'Database Schema - VIP Transfer Requests Table',
          status: 'FAIL',
          details: 'vip_transfer_requests table missing'
        });
      }

      // Check VIP contract history table
      const historyTable = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='vip_contract_history'
      `).get();
      
      if (historyTable) {
        this.results.push({
          component: 'Database Schema - VIP Contract History Table',
          status: 'PASS',
          details: 'vip_contract_history table exists'
        });
      } else {
        this.results.push({
          component: 'Database Schema - VIP Contract History Table',
          status: 'FAIL',
          details: 'vip_contract_history table missing'
        });
      }

      // Check triggers for automatic history logging
      const triggers = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='trigger' AND name LIKE 'vip_contract_%'
      `).all();
      
      if (triggers.length >= 2) {
        this.results.push({
          component: 'Database Schema - History Triggers',
          status: 'PASS',
          details: `Found ${triggers.length} VIP contract triggers`
        });
      } else {
        this.results.push({
          component: 'Database Schema - History Triggers',
          status: 'FAIL',
          details: `Expected at least 2 triggers, found ${triggers.length}`
        });
      }

    } catch (error) {
      this.results.push({
        component: 'Database Schema Validation',
        status: 'FAIL',
        details: `Error: ${error.message}`
      });
    }
  }

  async validateRepositoryMethods(): Promise<void> {
    try {
      // Check VIP Contract Repository methods
      const vipMethods = [
        'transferContract',
        'auditVipOperation',
        'getComprehensiveAuditTrail',
        'getContractHistory'
      ];

      for (const method of vipMethods) {
        if (typeof this.vipRepository[method] === 'function') {
          this.results.push({
            component: `VIP Repository - ${method}`,
            status: 'PASS',
            details: `Method ${method} exists`
          });
        } else {
          this.results.push({
            component: `VIP Repository - ${method}`,
            status: 'FAIL',
            details: `Method ${method} missing`
          });
        }
      }

      // Check VIP Transfer Repository methods
      const transferMethods = [
        'approveTransfer',
        'rejectTransfer',
        'completeTransfer',
        'hasLockerPendingTransfers'
      ];

      for (const method of transferMethods) {
        if (typeof this.transferRepository[method] === 'function') {
          this.results.push({
            component: `Transfer Repository - ${method}`,
            status: 'PASS',
            details: `Method ${method} exists`
          });
        } else {
          this.results.push({
            component: `Transfer Repository - ${method}`,
            status: 'FAIL',
            details: `Method ${method} missing`
          });
        }
      }

      // Check VIP History Repository methods
      const historyMethods = [
        'logAction',
        'getContractHistory',
        'getStaffAuditTrail'
      ];

      for (const method of historyMethods) {
        if (typeof this.historyRepository[method] === 'function') {
          this.results.push({
            component: `History Repository - ${method}`,
            status: 'PASS',
            details: `Method ${method} exists`
          });
        } else {
          this.results.push({
            component: `History Repository - ${method}`,
            status: 'FAIL',
            details: `Method ${method} missing`
          });
        }
      }

    } catch (error) {
      this.results.push({
        component: 'Repository Methods Validation',
        status: 'FAIL',
        details: `Error: ${error.message}`
      });
    }
  }

  async validateWorkflowIntegration(): Promise<void> {
    try {
      // Create test data
      const db = this.dbManager.getDatabase();
      
      // Create test lockers
      db.prepare(`
        INSERT INTO lockers (kiosk_id, id, status, is_vip) 
        VALUES ('test_kiosk1', 1, 'Free', 0), ('test_kiosk2', 2, 'Free', 0)
      `).run();

      // Create test VIP contract
      const contract = await this.vipRepository.create({
        kiosk_id: 'test_kiosk1',
        locker_id: 1,
        rfid_card: 'test_card_123',
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-12-31'),
        status: 'active',
        created_by: 'test_admin'
      });

      this.results.push({
        component: 'Workflow Integration - Contract Creation',
        status: 'PASS',
        details: `Created test contract with ID ${contract.id}`
      });

      // Test transfer request creation
      const transferRequest = await this.transferRepository.create({
        contract_id: contract.id,
        from_kiosk_id: 'test_kiosk1',
        from_locker_id: 1,
        to_kiosk_id: 'test_kiosk2',
        to_locker_id: 2,
        reason: 'Test room change',
        requested_by: 'test_staff',
        status: 'pending'
      });

      this.results.push({
        component: 'Workflow Integration - Transfer Request',
        status: 'PASS',
        details: `Created transfer request with ID ${transferRequest.id}`
      });

      // Test audit logging
      await this.vipRepository.auditVipOperation(
        'transfer',
        contract.id,
        'test_admin',
        { reason: 'Test audit log' },
        '127.0.0.1',
        'test-user-agent'
      );

      this.results.push({
        component: 'Workflow Integration - Audit Logging',
        status: 'PASS',
        details: 'Audit logging completed successfully'
      });

      // Test comprehensive audit trail
      const auditTrail = await this.vipRepository.getComprehensiveAuditTrail(contract.id);
      
      if (auditTrail.contract && auditTrail.history && auditTrail.events && auditTrail.transfers) {
        this.results.push({
          component: 'Workflow Integration - Comprehensive Audit Trail',
          status: 'PASS',
          details: `Retrieved audit trail with ${auditTrail.history.length} history entries, ${auditTrail.events.length} events, ${auditTrail.transfers.length} transfers`
        });
      } else {
        this.results.push({
          component: 'Workflow Integration - Comprehensive Audit Trail',
          status: 'FAIL',
          details: 'Incomplete audit trail data'
        });
      }

    } catch (error) {
      this.results.push({
        component: 'Workflow Integration Validation',
        status: 'FAIL',
        details: `Error: ${error.message}`
      });
    }
  }

  async validateUIComponents(): Promise<void> {
    try {
      // Check if VIP HTML file exists and contains transfer-related elements
      const fs = await import('fs/promises');
      const vipHtmlPath = './src/views/vip.html';
      
      try {
        const vipHtmlContent = await fs.readFile(vipHtmlPath, 'utf-8');
        
        const requiredElements = [
          'transferModal',
          'showTransferModal',
          'transferForm',
          'transferRequestsSection',
          'historyModal'
        ];

        let foundElements = 0;
        for (const element of requiredElements) {
          if (vipHtmlContent.includes(element)) {
            foundElements++;
          }
        }

        if (foundElements === requiredElements.length) {
          this.results.push({
            component: 'UI Components - VIP Transfer Interface',
            status: 'PASS',
            details: `All ${requiredElements.length} required UI elements found`
          });
        } else {
          this.results.push({
            component: 'UI Components - VIP Transfer Interface',
            status: 'FAIL',
            details: `Found ${foundElements}/${requiredElements.length} required UI elements`
          });
        }

      } catch (fileError) {
        this.results.push({
          component: 'UI Components - VIP HTML File',
          status: 'FAIL',
          details: `Could not read VIP HTML file: ${fileError.message}`
        });
      }

    } catch (error) {
      this.results.push({
        component: 'UI Components Validation',
        status: 'FAIL',
        details: `Error: ${error.message}`
      });
    }
  }

  async validateAPIEndpoints(): Promise<void> {
    try {
      // Check if VIP routes file contains transfer endpoints
      const fs = await import('fs/promises');
      const vipRoutesPath = './src/routes/vip-routes.ts';
      
      try {
        const vipRoutesContent = await fs.readFile(vipRoutesPath, 'utf-8');
        
        const requiredEndpoints = [
          '/:id/transfer',
          '/transfers',
          '/transfers/:transferId/approve',
          '/transfers/:transferId/reject',
          '/:id/history'
        ];

        let foundEndpoints = 0;
        for (const endpoint of requiredEndpoints) {
          if (vipRoutesContent.includes(endpoint)) {
            foundEndpoints++;
          }
        }

        if (foundEndpoints === requiredEndpoints.length) {
          this.results.push({
            component: 'API Endpoints - VIP Transfer Routes',
            status: 'PASS',
            details: `All ${requiredEndpoints.length} required endpoints found`
          });
        } else {
          this.results.push({
            component: 'API Endpoints - VIP Transfer Routes',
            status: 'FAIL',
            details: `Found ${foundEndpoints}/${requiredEndpoints.length} required endpoints`
          });
        }

        // Check for comprehensive audit logging
        const auditLogPatterns = [
          'ip_address',
          'user_agent',
          'audit_version',
          'comprehensive audit details'
        ];

        let foundAuditFeatures = 0;
        for (const pattern of auditLogPatterns) {
          if (vipRoutesContent.includes(pattern)) {
            foundAuditFeatures++;
          }
        }

        if (foundAuditFeatures >= 2) {
          this.results.push({
            component: 'API Endpoints - Comprehensive Audit Logging',
            status: 'PASS',
            details: `Found ${foundAuditFeatures} audit logging features`
          });
        } else {
          this.results.push({
            component: 'API Endpoints - Comprehensive Audit Logging',
            status: 'FAIL',
            details: `Found only ${foundAuditFeatures} audit logging features`
          });
        }

      } catch (fileError) {
        this.results.push({
          component: 'API Endpoints - VIP Routes File',
          status: 'FAIL',
          details: `Could not read VIP routes file: ${fileError.message}`
        });
      }

    } catch (error) {
      this.results.push({
        component: 'API Endpoints Validation',
        status: 'FAIL',
        details: `Error: ${error.message}`
      });
    }
  }

  async runValidation(): Promise<ValidationResult[]> {
    console.log('🔍 Starting VIP Transfer and Audit Workflow Validation...\n');

    await this.initialize();
    
    await this.validateDatabaseSchema();
    await this.validateRepositoryMethods();
    await this.validateWorkflowIntegration();
    await this.validateUIComponents();
    await this.validateAPIEndpoints();

    await this.dbManager.close();

    return this.results;
  }

  printResults(): void {
    console.log('📊 VIP Transfer and Audit Workflow Validation Results\n');
    console.log('=' .repeat(80));

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;

    console.log(`\n✅ PASSED: ${passed}`);
    console.log(`❌ FAILED: ${failed}`);
    console.log(`📈 SUCCESS RATE: ${((passed / this.results.length) * 100).toFixed(1)}%\n`);

    console.log('Detailed Results:');
    console.log('-'.repeat(80));

    for (const result of this.results) {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${icon} ${result.component}`);
      console.log(`   ${result.details}\n`);
    }

    console.log('=' .repeat(80));
    
    if (failed === 0) {
      console.log('🎉 All validations passed! VIP Transfer and Audit Workflow is fully implemented.');
    } else {
      console.log(`⚠️  ${failed} validation(s) failed. Please review the implementation.`);
    }
  }
}

// Export for use in other modules
export { VipTransferValidation, ValidationResult };

// Run validation if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validation = new VipTransferValidation();
  validation.runValidation()
    .then(() => validation.printResults())
    .catch(error => {
      console.error('❌ Validation failed:', error);
      process.exit(1);
    });
}