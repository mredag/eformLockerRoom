#!/usr/bin/env node

/**
 * Rollout Management CLI Tool
 * 
 * Usage:
 *   node scripts/rollout-cli.js status
 *   node scripts/rollout-cli.js enable kiosk-1 admin "Initial rollout"
 *   node scripts/rollout-cli.js disable kiosk-1 admin "Performance issues"
 *   node scripts/rollout-cli.js emergency-disable admin "Critical system issue"
 *   node scripts/rollout-cli.js analyze kiosk-1
 *   node scripts/rollout-cli.js check-automated
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Configuration
const DB_PATH = process.env.EFORM_DB_PATH || path.join(__dirname, '../data/eform.db');
const PANEL_URL = process.env.PANEL_URL || 'http://localhost:3001';

class RolloutCLI {
  constructor() {
    this.db = null;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async close() {
    if (this.db) {
      return new Promise((resolve) => {
        this.db.close(resolve);
      });
    }
  }

  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  async apiCall(endpoint, method = 'GET', data = null) {
    const url = `${PANEL_URL}${endpoint}`;
    
    // Get auth token from environment or config
    const authToken = process.env.PANEL_AUTH_TOKEN || 'admin-token';
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'X-Requested-With': 'XMLHttpRequest'
      }
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      return result;
    } catch (error) {
      throw new Error(`API call failed: ${error.message}`);
    }
  }

  async showStatus() {
    console.log('📊 Rollout Status Summary\n');

    try {
      // Get rollout status from database
      const statuses = await this.query(`
        SELECT 
          kiosk_id,
          enabled,
          phase,
          enabled_at,
          enabled_by,
          rollback_at,
          rollback_by,
          rollback_reason
        FROM rollout_status 
        ORDER BY kiosk_id
      `);

      if (statuses.length === 0) {
        console.log('No kiosks found in rollout system.');
        return;
      }

      // Calculate summary
      const summary = {
        total: statuses.length,
        enabled: statuses.filter(s => s.enabled).length,
        disabled: statuses.filter(s => !s.enabled && s.phase !== 'rolled_back').length,
        rolledBack: statuses.filter(s => s.phase === 'rolled_back').length
      };

      console.log(`Total Kiosks: ${summary.total}`);
      console.log(`Enabled: ${summary.enabled}`);
      console.log(`Disabled: ${summary.disabled}`);
      console.log(`Rolled Back: ${summary.rolledBack}\n`);

      // Show individual kiosk status
      console.log('Individual Kiosk Status:');
      console.log('─'.repeat(80));
      
      for (const status of statuses) {
        const statusIcon = status.enabled ? '✅' : '❌';
        const phase = status.phase.toUpperCase();
        
        console.log(`${statusIcon} ${status.kiosk_id.padEnd(15)} ${phase.padEnd(12)} ${status.enabled_by || 'N/A'}`);
        
        if (status.rollback_reason) {
          console.log(`   └─ Rollback: ${status.rollback_reason}`);
        }
      }

      // Get recent metrics if available
      try {
        const recentMetrics = await this.query(`
          SELECT 
            COUNT(*) as total_assignments,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_assignments
          FROM assignment_metrics 
          WHERE assignment_time >= datetime('now', '-24 hours')
        `);

        if (recentMetrics[0] && recentMetrics[0].total_assignments > 0) {
          const successRate = (recentMetrics[0].successful_assignments / recentMetrics[0].total_assignments * 100).toFixed(1);
          console.log(`\n📈 Last 24h: ${recentMetrics[0].total_assignments} assignments, ${successRate}% success rate`);
        }
      } catch (error) {
        // Metrics table might not exist yet
      }

    } catch (error) {
      console.error('❌ Error getting rollout status:', error.message);
    }
  }

  async enableKiosk(kioskId, enabledBy, reason) {
    console.log(`🚀 Enabling smart assignment for ${kioskId}...`);

    try {
      const result = await this.apiCall('/api/admin/rollout/enable', 'POST', {
        kioskId,
        enabledBy,
        reason
      });

      if (result.success) {
        console.log(`✅ ${result.message}`);
      } else {
        console.error(`❌ Failed to enable: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ Error enabling kiosk: ${error.message}`);
    }
  }

  async disableKiosk(kioskId, disabledBy, reason) {
    console.log(`🛑 Disabling smart assignment for ${kioskId}...`);

    try {
      const result = await this.apiCall('/api/admin/rollout/disable', 'POST', {
        kioskId,
        disabledBy,
        reason
      });

      if (result.success) {
        console.log(`✅ ${result.message}`);
      } else {
        console.error(`❌ Failed to disable: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ Error disabling kiosk: ${error.message}`);
    }
  }

  async emergencyDisable(disabledBy, reason) {
    console.log('🚨 EMERGENCY DISABLE - Disabling all kiosks...');
    
    const confirmationCode = 'EMERGENCY_DISABLE';
    
    try {
      const result = await this.apiCall('/api/admin/rollout/emergency-disable', 'POST', {
        disabledBy,
        reason,
        confirmationCode
      });

      if (result.success) {
        console.log(`✅ ${result.message}`);
      } else {
        console.error(`❌ Emergency disable failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ Error in emergency disable: ${error.message}`);
    }
  }

  async analyzeKiosk(kioskId) {
    console.log(`🔍 Analyzing rollout decision for ${kioskId}...\n`);

    try {
      const result = await this.apiCall(`/api/admin/rollout/analyze/${kioskId}`);

      if (result.success) {
        const decision = result.data;
        
        console.log(`Kiosk: ${decision.kioskId}`);
        console.log(`Recommendation: ${decision.recommendation.toUpperCase()}`);
        console.log(`Confidence: ${(decision.confidence * 100).toFixed(1)}%\n`);
        
        console.log('Reasons:');
        decision.reasons.forEach(reason => {
          console.log(`  • ${reason}`);
        });
        
        console.log('\nMetrics:');
        console.log(`  • Total Assignments: ${decision.metrics.totalAssignments}`);
        console.log(`  • Success Rate: ${(decision.metrics.successRate * 100).toFixed(1)}%`);
        console.log(`  • Average Time: ${Math.round(decision.metrics.averageAssignmentTime)}ms`);
        console.log(`  • No Stock Events: ${decision.metrics.noStockEvents}`);
        console.log(`  • Retry Events: ${decision.metrics.retryEvents}`);
        console.log(`  • Conflict Events: ${decision.metrics.conflictEvents}`);
        
        console.log('\nThresholds:');
        console.log(`  • Min Success Rate: ${(decision.thresholds.minSuccessRate * 100).toFixed(1)}%`);
        console.log(`  • Max Assignment Time: ${decision.thresholds.maxAssignmentTimeMs}ms`);
        console.log(`  • Min Sample Size: ${decision.thresholds.minSampleSize}`);
        
      } else {
        console.error(`❌ Analysis failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ Error analyzing kiosk: ${error.message}`);
    }
  }

  async checkAutomated() {
    console.log('🤖 Running automated rollback check...');

    try {
      const result = await this.apiCall('/api/admin/rollout/check-automated-rollback', 'POST');

      if (result.success) {
        console.log(`✅ ${result.message}`);
      } else {
        console.error(`❌ Automated check failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ Error in automated check: ${error.message}`);
    }
  }

  showHelp() {
    console.log(`
🎛️  Rollout Management CLI

Usage:
  node scripts/rollout-cli.js <command> [arguments]

Commands:
  status                                    Show rollout status summary
  enable <kioskId> <user> [reason]         Enable smart assignment for kiosk
  disable <kioskId> <user> <reason>        Disable smart assignment for kiosk
  emergency-disable <user> <reason>        Emergency disable all kiosks
  analyze <kioskId>                        Analyze rollout decision for kiosk
  check-automated                          Run automated rollback check
  help                                     Show this help message

Examples:
  node scripts/rollout-cli.js status
  node scripts/rollout-cli.js enable kiosk-1 admin "Initial rollout"
  node scripts/rollout-cli.js disable kiosk-1 admin "Performance issues"
  node scripts/rollout-cli.js emergency-disable admin "Critical system issue"
  node scripts/rollout-cli.js analyze kiosk-1
  node scripts/rollout-cli.js check-automated

Environment Variables:
  EFORM_DB_PATH    Path to SQLite database (default: ../data/eform.db)
  PANEL_URL        Panel service URL (default: http://localhost:3001)
`);
  }

  async run() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args[0] === 'help') {
      this.showHelp();
      return;
    }

    const command = args[0];

    try {
      await this.initialize();

      switch (command) {
        case 'status':
          await this.showStatus();
          break;

        case 'enable':
          if (args.length < 3) {
            console.error('❌ Usage: enable <kioskId> <user> [reason]');
            return;
          }
          await this.enableKiosk(args[1], args[2], args[3]);
          break;

        case 'disable':
          if (args.length < 4) {
            console.error('❌ Usage: disable <kioskId> <user> <reason>');
            return;
          }
          await this.disableKiosk(args[1], args[2], args[3]);
          break;

        case 'emergency-disable':
          if (args.length < 3) {
            console.error('❌ Usage: emergency-disable <user> <reason>');
            return;
          }
          await this.emergencyDisable(args[1], args[2]);
          break;

        case 'analyze':
          if (args.length < 2) {
            console.error('❌ Usage: analyze <kioskId>');
            return;
          }
          await this.analyzeKiosk(args[1]);
          break;

        case 'check-automated':
          await this.checkAutomated();
          break;

        default:
          console.error(`❌ Unknown command: ${command}`);
          this.showHelp();
          break;
      }

    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    } finally {
      await this.close();
    }
  }
}

// Run CLI if called directly
if (require.main === module) {
  const cli = new RolloutCLI();
  cli.run().catch(error => {
    console.error('❌ CLI Error:', error);
    process.exit(1);
  });
}

module.exports = RolloutCLI;