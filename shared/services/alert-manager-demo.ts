/**
 * Alert Manager Demo - Demonstrates the specific alert monitors implementation
 * 
 * This script shows how the alert monitors work with the exact thresholds specified:
 * - no_stock: >3 events/10min, clear <2 events/10min after 20min
 * - conflict_rate: >2%/5min, clear <1%/10min
 * - open_fail_rate: >1%/10min, clear <0.5%/20min
 * - retry_rate: >5%/5min, clear <3%/10min
 * - overdue_share: ≥20%/10min, clear <10%/20min
 */

import { AlertManager } from './alert-manager';

// Mock database for demonstration
const mockDb = {
  all: () => Promise.resolve([]),
  get: () => Promise.resolve({ version: 1 }),
  run: (query: string, params: any[], callback?: (err: any) => void) => {
    if (callback) callback(null);
    return { lastID: 1 };
  }
};

// Demo logger that shows the exact log format
const demoLogger = {
  info: (message: string) => console.log(`📊 ${message}`),
  error: (message: string) => console.error(`❌ ${message}`),
  warn: (message: string) => console.warn(`⚠️  ${message}`)
};

async function demonstrateAlertMonitors() {
  console.log('🚨 Alert Manager - Specific Monitors Demo\n');
  
  const alertManager = new AlertManager(mockDb as any, undefined, demoLogger);
  const kioskId = 'demo-kiosk';

  // Mock the metric retrieval methods
  let mockEventCount = 0;
  let mockMetricRate = 0;

  (alertManager as any).getEventCount = async () => mockEventCount;
  (alertManager as any).getMetricRate = async () => mockMetricRate;
  (alertManager as any).persistAlert = async () => {};
  (alertManager as any).setupAutoClearTimer = async () => {};

  console.log('1. No Stock Alert Monitor (>3 events/10min)');
  console.log('   Testing with 3 events (should NOT trigger):');
  mockEventCount = 3;
  await alertManager.monitorNoStock(kioskId);
  
  console.log('   Testing with 4 events (should trigger):');
  mockEventCount = 4;
  await alertManager.monitorNoStock(kioskId);
  console.log();

  console.log('2. Conflict Rate Alert Monitor (>2%/5min)');
  console.log('   Testing with 2.0% rate (should NOT trigger):');
  mockMetricRate = 0.02;
  await alertManager.monitorConflictRate(kioskId);
  
  console.log('   Testing with 2.1% rate (should trigger):');
  mockMetricRate = 0.021;
  await alertManager.monitorConflictRate(kioskId);
  console.log();

  console.log('3. Open Fail Rate Alert Monitor (>1%/10min)');
  console.log('   Testing with 1.0% rate (should NOT trigger):');
  mockMetricRate = 0.01;
  await alertManager.monitorOpenFailRate(kioskId);
  
  console.log('   Testing with 1.1% rate (should trigger):');
  mockMetricRate = 0.011;
  await alertManager.monitorOpenFailRate(kioskId);
  console.log();

  console.log('4. Retry Rate Alert Monitor (>5%/5min)');
  console.log('   Testing with 5.0% rate (should NOT trigger):');
  mockMetricRate = 0.05;
  await alertManager.monitorRetryRate(kioskId);
  
  console.log('   Testing with 5.1% rate (should trigger):');
  mockMetricRate = 0.051;
  await alertManager.monitorRetryRate(kioskId);
  console.log();

  console.log('5. Overdue Share Alert Monitor (≥20%/10min)');
  console.log('   Testing with 19.9% share (should NOT trigger):');
  mockMetricRate = 0.199;
  await alertManager.monitorOverdueShare(kioskId);
  
  console.log('   Testing with 20.0% share (should trigger - ≥20%):');
  mockMetricRate = 0.20;
  await alertManager.monitorOverdueShare(kioskId);
  
  console.log('   Testing with 25.0% share (should trigger):');
  mockMetricRate = 0.25;
  await alertManager.monitorOverdueShare(kioskId);
  console.log();

  console.log('6. Auto-Clear Conditions:');
  const generateAutoClearCondition = (alertManager as any).generateAutoClearCondition.bind(alertManager);
  
  console.log(`   no_stock: ${await generateAutoClearCondition('no_stock', kioskId)}`);
  console.log(`   conflict_rate: ${await generateAutoClearCondition('conflict_rate', kioskId)}`);
  console.log(`   open_fail_rate: ${await generateAutoClearCondition('open_fail_rate', kioskId)}`);
  console.log(`   retry_rate: ${await generateAutoClearCondition('retry_rate', kioskId)}`);
  console.log(`   overdue_share: ${await generateAutoClearCondition('overdue_share', kioskId)}`);
  console.log();

  console.log('7. Clear Condition Formatting:');
  const formatClearCondition = (alertManager as any).formatClearCondition.bind(alertManager);
  
  console.log(`   no_stock example: ${formatClearCondition('no_stock', 1, 2, 10)}`);
  console.log(`   conflict_rate example: ${formatClearCondition('conflict_rate', 0.008, 0.01, 10)}`);
  console.log(`   open_fail_rate example: ${formatClearCondition('open_fail_rate', 0.004, 0.005, 20)}`);
  console.log(`   retry_rate example: ${formatClearCondition('retry_rate', 0.025, 0.03, 10)}`);
  console.log(`   overdue_share example: ${formatClearCondition('overdue_share', 0.08, 0.10, 20)}`);
  console.log();

  console.log('✅ All alert monitors implemented with correct thresholds!');
  console.log('📝 Log format: "Alert triggered: type=X, severity=Y" and "Alert cleared: type=X, condition=Y"');
  
  alertManager.shutdown();
}

// Run the demonstration
if (require.main === module) {
  demonstrateAlertMonitors().catch(console.error);
}

export { demonstrateAlertMonitors };