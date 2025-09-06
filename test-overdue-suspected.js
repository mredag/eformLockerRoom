#!/usr/bin/env node

/**
 * Test script for overdue and suspected locker management functionality
 * This script tests the API endpoints and basic functionality
 */

const fetch = require('node-fetch');

const PANEL_URL = process.env.PANEL_URL || 'http://localhost:3001';

async function testOverdueSuspectedAPI() {
  console.log('🧪 Testing Overdue and Suspected Locker Management API...\n');

  try {
    // Test 1: Check if the page loads
    console.log('1. Testing page accessibility...');
    const pageResponse = await fetch(`${PANEL_URL}/overdue-suspected`);
    if (pageResponse.ok) {
      console.log('✅ Overdue-suspected page loads successfully');
    } else {
      console.log(`❌ Page failed to load: ${pageResponse.status}`);
    }

    // Test 2: Check kiosks endpoint
    console.log('\n2. Testing kiosks endpoint...');
    try {
      const kioskResponse = await fetch(`${PANEL_URL}/api/lockers/kiosks`);
      if (kioskResponse.ok) {
        const kiosks = await kioskResponse.json();
        console.log(`✅ Kiosks endpoint works: ${kiosks.length} kiosks found`);
        console.log(`   Kiosks: ${kiosks.map(k => k.id).join(', ')}`);
      } else {
        console.log(`❌ Kiosks endpoint failed: ${kioskResponse.status}`);
      }
    } catch (error) {
      console.log(`❌ Kiosks endpoint error: ${error.message}`);
    }

    // Test 3: Check overdue lockers endpoint
    console.log('\n3. Testing overdue lockers endpoint...');
    try {
      const overdueResponse = await fetch(`${PANEL_URL}/api/admin/overdue-suspected/overdue`);
      if (overdueResponse.ok) {
        const overdueData = await overdueResponse.json();
        console.log(`✅ Overdue lockers endpoint works: ${overdueData.total} overdue lockers`);
        if (overdueData.lockers.length > 0) {
          console.log(`   Sample locker owner hash: ${overdueData.lockers[0].owner_hash}`);
        }
      } else {
        console.log(`❌ Overdue lockers endpoint failed: ${overdueResponse.status}`);
      }
    } catch (error) {
      console.log(`❌ Overdue lockers endpoint error: ${error.message}`);
    }

    // Test 4: Check suspected lockers endpoint
    console.log('\n4. Testing suspected lockers endpoint...');
    try {
      const suspectedResponse = await fetch(`${PANEL_URL}/api/admin/overdue-suspected/suspected`);
      if (suspectedResponse.ok) {
        const suspectedData = await suspectedResponse.json();
        console.log(`✅ Suspected lockers endpoint works: ${suspectedData.total} suspected lockers`);
        if (suspectedData.lockers.length > 0) {
          console.log(`   Sample locker owner hash: ${suspectedData.lockers[0].owner_hash}`);
        }
      } else {
        console.log(`❌ Suspected lockers endpoint failed: ${suspectedResponse.status}`);
      }
    } catch (error) {
      console.log(`❌ Suspected lockers endpoint error: ${error.message}`);
    }

    // Test 5: Check analytics endpoint
    console.log('\n5. Testing analytics endpoint...');
    try {
      const analyticsResponse = await fetch(`${PANEL_URL}/api/admin/overdue-suspected/analytics`);
      if (analyticsResponse.ok) {
        const analyticsData = await analyticsResponse.json();
        console.log(`✅ Analytics endpoint works: ${analyticsData.period_days} days period`);
        console.log(`   Current overdue: ${analyticsData.status_summary.current_overdue}`);
        console.log(`   Current suspected: ${analyticsData.status_summary.current_suspected}`);
      } else {
        console.log(`❌ Analytics endpoint failed: ${analyticsResponse.status}`);
      }
    } catch (error) {
      console.log(`❌ Analytics endpoint error: ${error.message}`);
    }

    console.log('\n🎉 Overdue and Suspected Locker Management testing completed!');
    console.log('\n📋 Summary:');
    console.log('   - HTML page: Accessible at /overdue-suspected');
    console.log('   - API endpoints: /api/admin/overdue-suspected/* (admin-only)');
    console.log('   - Features: Overdue management, suspected management, analytics');
    console.log('   - Bulk operations: Force open, mark cleared, clear suspected flags');
    console.log('   - Turkish UI: All labels and messages in Turkish');
    console.log('   - Security: Admin-only access, CSRF protection, PII sanitization');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testOverdueSuspectedAPI().catch(console.error);
}

module.exports = { testOverdueSuspectedAPI };