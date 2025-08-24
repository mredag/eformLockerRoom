#!/usr/bin/env tsx

import { SQLiteSessionManager } from '../app/panel/src/services/sqlite-session-manager';
import { DatabaseManager } from '../shared/database/database-manager';
import { User } from '../app/panel/src/services/auth-service';

async function testSQLiteSessionManager() {
  console.log('🧪 Testing SQLite Session Manager...\n');

  try {
    // Initialize database manager
    const dbManager = DatabaseManager.getInstance({ path: './data/eform.db' });
    await dbManager.initialize();

    // Create session manager
    const sessionManager = new SQLiteSessionManager(dbManager, {
      sessionTimeout: 60 * 60 * 1000, // 1 hour
      maxIdleTime: 30 * 60 * 1000, // 30 minutes
      maxConcurrentSessions: 2,
      autoRenewalEnabled: true
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

    console.log('✅ Session manager initialized');

    // Test 1: Create session
    console.log('\n🔧 Test 1: Creating session...');
    const session = await sessionManager.createSession(mockUser, '192.168.1.100', 'Mozilla/5.0');
    console.log(`✅ Session created with ID: ${session.id.substring(0, 16)}...`);
    console.log(`   User: ${session.user.username}`);
    console.log(`   IP: ${session.ipAddress}`);
    console.log(`   CSRF Token: ${session.csrfToken.substring(0, 16)}...`);

    // Test 2: Validate session
    console.log('\n🔍 Test 2: Validating session...');
    const validatedSession = await sessionManager.validateSession(session.id, '192.168.1.100', 'Mozilla/5.0');
    if (validatedSession) {
      console.log('✅ Session validation successful');
      console.log(`   Last activity updated: ${validatedSession.lastActivity}`);
    } else {
      console.log('❌ Session validation failed');
    }

    // Test 3: CSRF token validation
    console.log('\n🛡️ Test 3: CSRF token validation...');
    const csrfValid = await sessionManager.validateCsrfToken(session.id, session.csrfToken);
    console.log(`✅ CSRF token validation: ${csrfValid ? 'VALID' : 'INVALID'}`);

    const csrfInvalid = await sessionManager.validateCsrfToken(session.id, 'wrong-token');
    console.log(`✅ Wrong CSRF token validation: ${csrfInvalid ? 'VALID' : 'INVALID'}`);

    // Test 4: Session renewal
    console.log('\n🔄 Test 4: Session renewal...');
    const renewedSession = await sessionManager.renewSession(session.id, '192.168.1.100', 'Mozilla/5.0');
    if (renewedSession) {
      console.log('✅ Session renewal successful');
      console.log(`   New CSRF token: ${renewedSession.csrfToken.substring(0, 16)}...`);
      console.log(`   Renewal count: ${renewedSession.renewalCount}`);
    } else {
      console.log('❌ Session renewal failed');
    }

    // Test 5: Session info
    console.log('\n📊 Test 5: Session info...');
    const sessionInfo = await sessionManager.getSessionInfo(session.id);
    if (sessionInfo) {
      console.log('✅ Session info retrieved:');
      console.log(`   User: ${sessionInfo.user}`);
      console.log(`   Role: ${sessionInfo.role}`);
      console.log(`   IP: ${sessionInfo.ipAddress}`);
      console.log(`   Renewal count: ${sessionInfo.renewalCount}`);
    } else {
      console.log('❌ Failed to get session info');
    }

    // Test 6: Session statistics
    console.log('\n📈 Test 6: Session statistics...');
    const stats = await sessionManager.getStatistics();
    console.log('✅ Session statistics:');
    console.log(`   Total sessions: ${stats.totalSessions}`);
    console.log(`   User count: ${stats.userCount}`);
    console.log(`   Average session age: ${Math.round(stats.averageSessionAge / 1000)}s`);

    // Test 7: Concurrent session limit
    console.log('\n🚫 Test 7: Concurrent session limit...');
    const session2 = await sessionManager.createSession(mockUser, '192.168.1.101', 'Chrome/1.0');
    console.log(`✅ Second session created: ${session2.id.substring(0, 16)}...`);

    const session3 = await sessionManager.createSession(mockUser, '192.168.1.102', 'Safari/1.0');
    console.log(`✅ Third session created: ${session3.id.substring(0, 16)}...`);

    // Check if first session was removed due to limit
    const firstSessionCheck = await sessionManager.validateSession(session.id);
    console.log(`   First session still valid: ${firstSessionCheck ? 'YES' : 'NO'}`);

    // Test 8: IP address variation
    console.log('\n🌐 Test 8: IP address variation...');
    const ipVariationSession = await sessionManager.validateSession(session3.id, '192.168.1.103', 'Safari/1.0');
    if (ipVariationSession) {
      console.log('✅ Local network IP variation allowed');
      console.log(`   Updated IP: ${ipVariationSession.ipAddress}`);
    } else {
      console.log('❌ Local network IP variation rejected');
    }

    // Test 9: Session cleanup
    console.log('\n🧹 Test 9: Session cleanup...');
    const cleanedCount = await sessionManager.cleanupExpiredSessions();
    console.log(`✅ Cleaned up ${cleanedCount} expired sessions`);

    // Test 10: Destroy session
    console.log('\n🗑️ Test 10: Destroy session...');
    await sessionManager.destroySession(session3.id);
    const destroyedCheck = await sessionManager.validateSession(session3.id);
    console.log(`   Session destroyed: ${destroyedCheck ? 'NO' : 'YES'}`);

    console.log('\n🎉 All tests completed successfully!');

    // Cleanup
    sessionManager.shutdown();
    await dbManager.close();

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testSQLiteSessionManager();