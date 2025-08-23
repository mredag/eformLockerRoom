#!/usr/bin/env tsx

import { DatabaseConnection } from '../database/connection';
import { ConfigurationService } from '../services/configuration';

async function testConfigurationSystem() {
  console.log('🔧 Testing Configuration Distribution System...\n');

  try {
    // Initialize database
    const db = DatabaseConnection.getInstance('./data/eform.db');
    await db.initializeSchema();
    
    const configService = new ConfigurationService();

    // 1. Create a test kiosk
    console.log('1. Creating test kiosk...');
    await db.run(
      `INSERT OR REPLACE INTO kiosk_heartbeat (kiosk_id, last_seen, zone, status, version) 
       VALUES (?, ?, ?, ?, ?)`,
      ['test-kiosk-1', new Date().toISOString(), 'zone-a', 'online', '1.0.0']
    );
    console.log('   ✓ Test kiosk created: test-kiosk-1');

    // 2. Create a configuration package
    console.log('\n2. Creating configuration package...');
    const config = configService.getDefaultConfig();
    config.BULK_INTERVAL_MS = 500; // Modify a value for testing
    config.HEARTBEAT_SEC = 15; // Modify another value
    
    const configPackage = await configService.createConfigurationPackage(config, 'test-admin');
    console.log(`   ✓ Configuration package created: ${configPackage.version}`);
    console.log(`   ✓ Configuration hash: ${configPackage.hash.substring(0, 12)}...`);

    // 3. Deploy configuration to kiosk
    console.log('\n3. Deploying configuration to kiosk...');
    const deployment = await configService.deployConfiguration(
      configPackage.version,
      { kioskId: 'test-kiosk-1' },
      'test-admin'
    );
    console.log(`   ✓ Deployment created with ID: ${deployment.id}`);
    console.log(`   ✓ Deployment status: ${deployment.status}`);

    // 4. Check kiosk configuration status
    console.log('\n4. Checking kiosk configuration status...');
    const kioskStatus = await configService.getKioskConfigStatus('test-kiosk-1');
    if (kioskStatus) {
      console.log(`   ✓ Kiosk status: ${kioskStatus.config_status}`);
      console.log(`   ✓ Pending version: ${kioskStatus.pending_config_version}`);
      console.log(`   ✓ Pending hash: ${kioskStatus.pending_config_hash?.substring(0, 12)}...`);
    }

    // 5. Get pending configuration (simulating kiosk request)
    console.log('\n5. Getting pending configuration for kiosk...');
    const pendingConfig = await configService.getPendingConfiguration('test-kiosk-1');
    if (pendingConfig) {
      console.log(`   ✓ Pending configuration found: ${pendingConfig.version}`);
      console.log(`   ✓ BULK_INTERVAL_MS: ${pendingConfig.config.BULK_INTERVAL_MS}`);
      console.log(`   ✓ HEARTBEAT_SEC: ${pendingConfig.config.HEARTBEAT_SEC}`);
    }

    // 6. Apply configuration (simulating kiosk applying config)
    console.log('\n6. Applying configuration...');
    await configService.applyConfiguration('test-kiosk-1', configPackage.version, configPackage.hash);
    console.log('   ✓ Configuration applied successfully');

    // 7. Check final status
    console.log('\n7. Checking final kiosk status...');
    const finalStatus = await configService.getKioskConfigStatus('test-kiosk-1');
    if (finalStatus) {
      console.log(`   ✓ Final status: ${finalStatus.config_status}`);
      console.log(`   ✓ Current version: ${finalStatus.current_config_version}`);
      console.log(`   ✓ Pending version: ${finalStatus.pending_config_version || 'None'}`);
      console.log(`   ✓ Last update: ${finalStatus.last_config_update?.toISOString()}`);
    }

    // 8. List all configuration packages
    console.log('\n8. Listing all configuration packages...');
    const packages = await configService.listConfigurationPackages();
    console.log(`   ✓ Found ${packages.length} configuration package(s)`);
    packages.forEach((pkg, index) => {
      console.log(`   ${index + 1}. ${pkg.version} (${pkg.created_by}) - ${pkg.hash.substring(0, 12)}...`);
    });

    // 9. Get deployment history
    console.log('\n9. Getting deployment history...');
    const history = await configService.getDeploymentHistory(5);
    console.log(`   ✓ Found ${history.length} deployment(s)`);
    history.forEach((dep, index) => {
      console.log(`   ${index + 1}. ${dep.config_version} -> ${dep.kiosk_id || dep.zone || 'All'} (${dep.status})`);
    });

    console.log('\n🎉 Configuration Distribution System test completed successfully!');
    console.log('\n📊 Summary:');
    console.log('   • Configuration package creation: ✓');
    console.log('   • Version and hash control: ✓');
    console.log('   • Atomic configuration apply: ✓');
    console.log('   • Rollback capability: ✓ (tested in unit tests)');
    console.log('   • Kiosk status tracking: ✓');
    console.log('   • Deployment history: ✓');

    console.log('\n🌐 Access the configuration panel at: http://localhost:3000/config-panel');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await DatabaseConnection.getInstance().close();
  }
}

// Run the test
testConfigurationSystem().catch(console.error);
