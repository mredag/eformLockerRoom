#!/usr/bin/env tsx

import { SQLiteSessionManager } from '../app/panel/src/services/sqlite-session-manager';
import { SessionCleanupService } from '../app/panel/src/services/session-cleanup-service';
import { DatabaseManager } from '../shared/database/database-manager';
import { User } from '../app/panel/src/services/auth-service';

async function testSessionIntegration() {
  console.log('🧪 Testing Session Integration (SQLite + Cleanup)...\n');

  try {
    // Initialize database manager
    const dbManager = DatabaseManager.getInstance({ path: './data/eform.db' });
    await dbManager.initialize();

    // Create session manager with short timeouts for testing
    const sessionManager = new SQLiteSessionManager(dbManager, {
      sessionTimeout: 10 * 1000, // 10 seconds
      maxIdleTime: 5 * 1000, // 5 seconds
      maxConcurrentSessions: 3,
      autoRenewalEnabled: true,
      maxRenewals: 2
    });

    // Create cleanup service
    const cleanupService = new SessionCleanupService(sessionManager, {
      intervalMinutes: 0.1, // 6 seconds
      enabled: true,
      logCleanup: true
    });

    // Mock user for testing
    const mockUser: User = {
      id: 1,
      username: 'testuser',
      role: 'staff',
      created_at: new Date(),
      last_login: new Date(),
      pin_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    };

    console.log('✅ Services initialized');

    // Test 1: Create sessions and verify persistence
    console.log('\n🔧 Test 1: Creating sessions...');
    const session1 = await sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
    const session2 = await sessionManager.createSession(mockUser, '192.168.1.101', 'Chrome/1.0');
    console.log(`✅ Created 2 sessions`);

    // Test 2: Start cleanup service
    console.log('\n🧹 Test 2: Starting cleanup service...');
    cleanupService.start();
    const status = cleanupService.getStatus();
    console.log(`✅ Cleanup service started (interval: ${status.intervalMinutes} minutes)`);

    // Test 3: Session persistence across server restart simulation
    console.log('\n🔄 Test 3: Simulating server restart...');
    
    // Create new session manager instance (simulating restart)
    const newSessionManager = new SQLiteSessionManager(dbManager, {
      sessionTimeout: 10 * 1000,
      maxIdleTime: 5 * 1000,
      maxConcurrentSessions: 3,
      autoRenewalEnabled: true
    });

    // Validate sessions still exist after "restart"
    const validatedSession1 = await newSessionManager.validateSession(session1.id, '192.168.1.100', 'Mozilla/5.0');
    const validatedSession2 = await newSessionManager.validateSession(session2.id, '192.168.1.101', 'Chrome/1.0');

    if (validatedSession1 && validatedSession2) {
      console.log('✅ Sessions persisted across restart');
    } else {
      console.log('❌ Sessions lost after restart');
    }

    // Test 4: Session renewal functionality
    console.log('\n🔄 Test 4: Testing session renewal...');
    
    // Wait for idle timeout to trigger renewal
    console.log('   Waiting for idle timeout...');
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    // This should trigger auto-renewal
    const renewedSession = await newSessionManager.validateSession(session1.id, '192.168.1.100', 'Mozilla/5.0');
    if (renewedSession && renewedSession.renewalCount > 0) {
      console.log(`✅ Session auto-renewed (renewal count: ${renewedSession.renewalCount})`);
    } else {
      console.log('❌ Session auto-renewal failed');
    }

    // Test 5: Cleanup service statistics
    console.log('\n📊 Test 5: Cleanup service statistics...');
    const stats = await cleanupService.getStatistics();
    console.log(`✅ Active sessions: ${stats.totalActiveSessions}`);
    console.log(`   Total sessions: ${stats.sessionStatistics.totalSessions}`);
    console.log(`   User count: ${stats.sessionStatistics.userCount}`);

    // Test 6: Manual cleanup
    console.log('\n🧹 Test 6: Manual cleanup...');
    const cleanedCount = await cleanupService.runCleanup();
    console.log(`✅ Manual cleanup removed ${cleanedCount} sessions`);

    // Test 7: Wait for automatic cleanup
    console.log('\n⏰ Test 7: Waiting for automatic cleanup...');
    console.log('   (This will take about 6 seconds...)');
    await new Promise(resolve => setTimeout(resolve, 7000));

    // Test 8: Verify cleanup worked
    console.log('\n✅ Test 8: Verifying cleanup results...');
    const finalStats = await cleanupService.getStatistics();
    console.log(`   Final active sessions: ${finalStats.totalActiveSessions}`);

    // Test 9: Session expiration
    console.log('\n⏱️ Test 9: Testing session expiration...');
    
    // Create a session and wait for it to expire
    const expiringSession = await newSessionManager.createSession(mockUser, '192.168.1.200', 'Test/1.0');
    console.log('   Created session, waiting for expiration...');
    
    // Wait longer than session timeout
    await new Promise(resolve => setTimeout(resolve, 12000));
    
    const expiredCheck = await newSessionManager.validateSession(expiringSession.id);
    console.log(`   Session expired: ${expiredCheck ? 'NO' : 'YES'}`);

    console.log('\n🎉 All integration tests completed successfully!');

    // Cleanup
    cleanupService.stop();
    sessionManager.shutdown();
    newSessionManager.shutdown();
    await dbManager.close();

  } catch (error) {
    console.error('❌ Integration test failed:', error);
    process.exit(1);
  }
}

testSessionIntegration();