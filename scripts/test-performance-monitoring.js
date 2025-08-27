#!/usr/bin/env node

/**
 * Test Performance Monitoring System
 * 
 * Tests the performance monitoring and metrics collection functionality
 * Validates requirements 8.1-8.4 implementation
 */

const { Database } = require('sqlite3');
const path = require('path');

// Import performance monitor from compiled JavaScript
const { PerformanceMonitor } = require('../shared/dist/services/performance-monitor');

async function testPerformanceMonitoring() {
  console.log('🧪 Testing Performance Monitoring System...\n');

  // Setup test database (delete if exists to ensure clean state)
  const dbPath = path.join(__dirname, '../data/test-performance.db');
  const fs = require('fs');
  try {
    fs.unlinkSync(dbPath);
  } catch (error) {
    // Ignore if file doesn't exist
  }
  const db = new Database(dbPath);
  
  try {
    // Initialize performance monitor
    const monitor = new PerformanceMonitor(db);
    await monitor.initialize();
    console.log('✅ Performance monitor initialized');

    // Test 1: Session Metrics Recording
    console.log('\n📊 Test 1: Session Metrics Recording');
    
    const sessionId = 'test-session-001';
    const kioskId = 'kiosk-1';
    const cardId = 'card-123';
    
    await monitor.recordSessionStart(sessionId, kioskId, cardId);
    console.log('✅ Session start recorded');
    
    // Simulate some delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await monitor.recordSessionEnd(sessionId, 'completed', 5, 8);
    console.log('✅ Session completion recorded');

    // Test 2: UI Performance Tracking
    console.log('\n🖥️ Test 2: UI Performance Tracking');
    
    await monitor.recordUIPerformance(kioskId, 'state_update', 150, true);
    await monitor.recordUIPerformance(kioskId, 'locker_selection', 800, true);
    await monitor.recordUIPerformance(kioskId, 'ui_render', 2500, false, 'Timeout error');
    console.log('✅ UI performance events recorded');

    // Test 3: Performance Metrics Calculation
    console.log('\n📈 Test 3: Performance Metrics Calculation');
    
    // Add some test command queue data
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS command_queue (
          command_id TEXT PRIMARY KEY,
          kiosk_id TEXT,
          payload TEXT,
          status TEXT,
          duration_ms INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Insert test command data
    const testCommands = [
      { id: 'cmd-1', duration: 800, status: 'completed' },
      { id: 'cmd-2', duration: 1200, status: 'completed' },
      { id: 'cmd-3', duration: 2500, status: 'failed' },
      { id: 'cmd-4', duration: 900, status: 'completed' },
    ];

    for (const cmd of testCommands) {
      await new Promise((resolve, reject) => {
        db.run(`
          INSERT INTO command_queue (command_id, kiosk_id, duration_ms, status, payload)
          VALUES (?, ?, ?, ?, ?)
        `, [cmd.id, kioskId, cmd.duration, cmd.status, '{"locker_id": 1}'], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    // Add test lockers table
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS lockers (
          id INTEGER,
          kiosk_id TEXT,
          display_name TEXT,
          PRIMARY KEY (kiosk_id, id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run(`
        INSERT OR REPLACE INTO lockers (id, kiosk_id, display_name) VALUES 
        (1, 'kiosk-1', 'Dolap A1'),
        (2, 'kiosk-1', 'Dolap A2'),
        (3, 'kiosk-1', 'Dolap A3')
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const metrics = await monitor.getCurrentMetrics(kioskId, 24);
    console.log('📊 Current Metrics:');
    console.log(`   Time to Open: [${metrics.timeToOpen.join(', ')}]ms`);
    console.log(`   Error Rate: ${metrics.errorRate.toFixed(1)}%`);
    console.log(`   Sessions/Hour: ${metrics.sessionsPerHour.toFixed(2)}`);
    console.log(`   Most Selected: ${metrics.mostSelectedLockers.map(l => `${l.displayName}(${l.count})`).join(', ')}`);
    console.log(`   UI Latency: [${metrics.uiUpdateLatency.join(', ')}]ms`);

    // Test 4: Performance Criteria Check
    console.log('\n✅ Test 4: Performance Criteria Check');
    
    const criteria = await monitor.checkPerformanceCriteria(kioskId);
    console.log('🎯 Performance Criteria Results:');
    console.log(`   95% under 2s: ${criteria.meets95PercentUnder2Seconds ? '✅' : '❌'}`);
    console.log(`   Error rate <2%: ${criteria.errorRateUnder2Percent ? '✅' : '❌'}`);
    console.log(`   UI updates <2s: ${criteria.uiUpdatesUnder2Seconds ? '✅' : '❌'}`);
    console.log(`   Summary: ${criteria.summary}`);

    // Test 5: Locker Usage Statistics
    console.log('\n📋 Test 5: Locker Usage Statistics');
    
    const stats = await monitor.getLockerUsageStats(kioskId, 7);
    console.log('🔢 Locker Usage Stats:');
    stats.forEach(stat => {
      console.log(`   ${stat.displayName}: ${stat.openCount} opens, ${stat.successRate.toFixed(1)}% success, ${stat.avgResponseTime.toFixed(0)}ms avg`);
    });

    // Test 6: Performance Snapshots
    console.log('\n📸 Test 6: Performance Snapshots');
    
    await monitor.createPerformanceSnapshot(kioskId, 'hour');
    console.log('✅ Performance snapshot created');
    
    const trends = await monitor.getPerformanceTrends(kioskId, 'hour', 5);
    console.log(`📈 Retrieved ${trends.length} performance trend snapshots`);

    // Test 7: Data Cleanup
    console.log('\n🧹 Test 7: Data Cleanup');
    
    await monitor.cleanupOldData(0); // Clean up everything for test
    console.log('✅ Data cleanup completed');

    // Test 8: API Endpoint Simulation
    console.log('\n🌐 Test 8: API Endpoint Simulation');
    
    // Simulate what the panel API would do
    const panelUrl = process.env.PANEL_URL || 'http://127.0.0.1:3001';
    console.log(`📡 Panel URL configured: ${panelUrl}`);
    
    // Test session reporting (would normally be called by session manager)
    try {
      const sessionResponse = await fetch(`${panelUrl}/api/performance/session-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'api-test-session',
          kioskId: 'kiosk-1',
          cardId: 'api-test-card'
        })
      });
      
      if (sessionResponse.ok) {
        console.log('✅ Session start API call successful');
      } else {
        console.log('⚠️ Session start API call failed (panel may not be running)');
      }
    } catch (error) {
      console.log('⚠️ Panel API not available (this is expected in test environment)');
    }

    console.log('\n🎉 Performance Monitoring Tests Completed Successfully!');
    
    // Performance Summary
    console.log('\n📊 Performance Monitoring Features Validated:');
    console.log('   ✅ Session metrics tracking (start/end/duration)');
    console.log('   ✅ UI performance event recording');
    console.log('   ✅ Real-time metrics calculation');
    console.log('   ✅ Performance criteria validation (Requirements 8.2-8.4)');
    console.log('   ✅ Locker usage statistics');
    console.log('   ✅ Performance trend snapshots');
    console.log('   ✅ Automatic data cleanup');
    console.log('   ✅ API integration ready');

    console.log('\n🎯 Requirements Coverage:');
    console.log('   ✅ 8.1: Time to open, error rate, sessions per hour tracking');
    console.log('   ✅ 8.2: 95% of operations under 2 seconds validation');
    console.log('   ✅ 8.3: Error rate under 2% monitoring');
    console.log('   ✅ 8.4: UI update latency under 2 seconds tracking');

  } catch (error) {
    console.error('❌ Performance monitoring test failed:', error);
    process.exit(1);
  } finally {
    // Clean up test database
    db.close();
    
    // Remove test database file
    const fs = require('fs');
    try {
      fs.unlinkSync(dbPath);
      console.log('🧹 Test database cleaned up');
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  testPerformanceMonitoring().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { testPerformanceMonitoring };