#!/usr/bin/env node

const { AuthService } = require('../app/panel/src/services/auth-service');
const { DatabaseManager } = require('../shared/database/database-manager');
const path = require('path');

async function validateLoginFix() {
  console.log('🔍 Validating login fix...');
  
  try {
    // Initialize database manager
    const dbManager = new DatabaseManager({
      path: path.join(__dirname, '../data/eform.db')
    });
    await dbManager.initialize();
    
    // Create auth service
    const authService = new AuthService(dbManager);
    
    console.log('✅ AuthService initialized');
    
    // Test admin login
    console.log('\n🔐 Testing admin login...');
    const adminUser = await authService.authenticateUser('admin', 'admin123');
    
    if (adminUser) {
      console.log('✅ Admin login successful!');
      console.log('👤 User:', {
        id: adminUser.id,
        username: adminUser.username,
        role: adminUser.role
      });
    } else {
      console.log('❌ Admin login failed');
    }
    
    // Test wrong password
    console.log('\n🔐 Testing wrong password...');
    const wrongUser = await authService.authenticateUser('admin', 'wrongpassword');
    
    if (wrongUser) {
      console.log('❌ Wrong password should not work!');
    } else {
      console.log('✅ Wrong password correctly rejected');
    }
    
    // Test non-existent user
    console.log('\n🔐 Testing non-existent user...');
    const nonExistentUser = await authService.authenticateUser('nonexistent', 'password');
    
    if (nonExistentUser) {
      console.log('❌ Non-existent user should not work!');
    } else {
      console.log('✅ Non-existent user correctly rejected');
    }
    
    // Test user creation and authentication
    console.log('\n🔧 Testing user creation and authentication...');
    try {
      const newUser = await authService.createUser({
        username: 'testuser_' + Date.now(),
        password: 'testpass123',
        role: 'staff'
      });
      
      console.log('✅ User created:', newUser.username);
      
      const authNewUser = await authService.authenticateUser(newUser.username, 'testpass123');
      
      if (authNewUser) {
        console.log('✅ New user authentication successful!');
      } else {
        console.log('❌ New user authentication failed');
      }
      
      // Clean up
      await authService.deactivateUser(newUser.id);
      console.log('✅ Test user cleaned up');
      
    } catch (error) {
      console.log('❌ User creation/authentication test failed:', error.message);
    }
    
    console.log('\n🎉 Login fix validation completed!');
    
    dbManager.close();
    
  } catch (error) {
    console.error('❌ Validation error:', error);
    process.exit(1);
  }
}

validateLoginFix().catch(console.error);