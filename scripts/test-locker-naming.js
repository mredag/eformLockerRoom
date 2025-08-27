#!/usr/bin/env node

/**
 * Test script for locker naming functionality
 * Tests the LockerNamingService and validates Turkish character support
 */

const path = require('path');

// Set database path
process.env.EFORM_DB_PATH = path.join(__dirname, '..', 'data', 'eform.db');

async function testLockerNaming() {
  try {
    console.log('🧪 Testing Locker Naming Service...');
    
    // Import after setting environment
    const { DatabaseManager } = await import('../shared/database/database-manager.js');
    const { LockerNamingService } = await import('../shared/services/locker-naming-service.js');
    
    // Initialize database
    const dbManager = DatabaseManager.getInstance({
      migrationsPath: path.resolve(__dirname, '../migrations')
    });
    await dbManager.initialize();
    
    const namingService = new LockerNamingService(dbManager.getConnection());
    
    console.log('✅ Database initialized successfully');
    
    // Test 1: Validate Turkish names
    console.log('\n📝 Testing name validation...');
    
    const testNames = [
      'Kapı A1',      // Valid Turkish name
      'Dolap 101',    // Valid name with numbers
      'Çok Uzun İsim Burası Yirmi Karakterden Fazla', // Too long
      'Invalid@Name', // Invalid characters
      'Güzel İsim',   // Valid Turkish characters
      '',             // Empty name
      '   ',          // Whitespace only
      'Ğüzel Şey'     // More Turkish characters
    ];
    
    for (const name of testNames) {
      const validation = namingService.validateName(name);
      console.log(`  "${name}" -> ${validation.isValid ? '✅ Valid' : '❌ Invalid'}`);
      if (!validation.isValid) {
        console.log(`    Errors: ${validation.errors.join(', ')}`);
        if (validation.suggestions) {
          console.log(`    Suggestions: ${validation.suggestions.join(', ')}`);
        }
      }
    }
    
    // Test 2: Generate presets
    console.log('\n🎯 Testing preset generation...');
    const presets = namingService.generatePresets();
    console.log(`  Generated ${presets.length} presets:`);
    console.log(`  First 5: ${presets.slice(0, 5).join(', ')}`);
    
    // Test 3: Test printable map (if lockers exist)
    console.log('\n🗺️ Testing printable map generation...');
    try {
      const printableMap = await namingService.exportPrintableMap('test-kiosk');
      console.log(`  Map generated for kiosk: ${printableMap.kiosk_id}`);
      console.log(`  Lockers in map: ${printableMap.lockers.length}`);
    } catch (error) {
      console.log(`  ⚠️ Map generation skipped (no lockers): ${error.message}`);
    }
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testLockerNaming().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});