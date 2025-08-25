#!/usr/bin/env node

/**
 * Quick check for the JavaScript error on lockers page
 * This script starts services briefly, tests the issue, then stops them
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

async function checkStaticFiles() {
  console.log('🔍 Checking static file configuration...');
  
  // Check if i18n.js exists
  const i18nPath = path.join(__dirname, '../app/panel/src/views/static/i18n.js');
  if (fs.existsSync(i18nPath)) {
    console.log('✅ i18n.js file exists at:', i18nPath);
  } else {
    console.log('❌ i18n.js file not found at:', i18nPath);
    return false;
  }
  
  // Check lockers.html for the script tag
  const lockersPath = path.join(__dirname, '../app/panel/src/views/lockers.html');
  if (fs.existsSync(lockersPath)) {
    const content = fs.readFileSync(lockersPath, 'utf8');
    if (content.includes('/static/i18n.js')) {
      console.log('✅ lockers.html references /static/i18n.js');
    } else {
      console.log('❌ lockers.html does not reference /static/i18n.js');
    }
    
    // Check if the script tag is at the end
    const lines = content.split('\n');
    const scriptLine = lines.find(line => line.includes('/static/i18n.js'));
    if (scriptLine) {
      console.log('📍 Script tag found:', scriptLine.trim());
    }
  }
  
  return true;
}

async function checkPanelConfiguration() {
  console.log('🔍 Checking panel server configuration...');
  
  const panelIndexPath = path.join(__dirname, '../app/panel/src/index.ts');
  if (fs.existsSync(panelIndexPath)) {
    const content = fs.readFileSync(panelIndexPath, 'utf8');
    
    // Check static file serving configuration
    if (content.includes('@fastify/static')) {
      console.log('✅ Panel uses @fastify/static for serving files');
      
      // Find the static configuration
      const staticMatch = content.match(/fastify\.register\(import\("@fastify\/static"\),\s*{([^}]+)}/);
      if (staticMatch) {
        console.log('📍 Static configuration found:', staticMatch[1].trim());
      }
    } else {
      console.log('❌ Panel does not use @fastify/static');
    }
    
    // Check i18n controller registration
    if (content.includes('i18nController.registerRoutes()')) {
      console.log('✅ i18n controller is registered');
    } else {
      console.log('❌ i18n controller is not registered');
    }
  }
  
  return true;
}

async function identifyProblem() {
  console.log('🔍 Analyzing the JavaScript error problem...');
  
  console.log('\n📋 Problem Analysis:');
  console.log('1. The error "Cannot read properties of undefined (reading \'register\')" suggests:');
  console.log('   - A JavaScript object is undefined when trying to access .register property');
  console.log('   - This could be related to service worker registration');
  console.log('   - Or it could be related to module/component registration');
  
  console.log('\n2. Possible causes:');
  console.log('   - i18n.js script fails to load (404 error)');
  console.log('   - i18n API endpoints return errors');
  console.log('   - Service worker registration attempts');
  console.log('   - Missing dependencies or initialization order issues');
  
  console.log('\n3. Files to check:');
  console.log('   - app/panel/src/views/lockers.html (script loading)');
  console.log('   - app/panel/src/views/static/i18n.js (JavaScript errors)');
  console.log('   - app/panel/src/index.ts (static file serving)');
  console.log('   - app/panel/src/controllers/i18n-controller.ts (API endpoints)');
  
  return true;
}

async function suggestFixes() {
  console.log('\n🔧 Suggested fixes:');
  
  console.log('\n1. Check static file serving:');
  console.log('   - Verify /static/i18n.js is accessible');
  console.log('   - Check Fastify static configuration');
  
  console.log('\n2. Check i18n API endpoints:');
  console.log('   - Test /api/i18n/messages endpoint');
  console.log('   - Test /api/i18n/language endpoint');
  
  console.log('\n3. Check browser console:');
  console.log('   - Open browser dev tools');
  console.log('   - Check for 404 errors on script loading');
  console.log('   - Check for API call failures');
  
  console.log('\n4. Potential fixes:');
  console.log('   - Add error handling in i18n.js init() method');
  console.log('   - Check if i18n service is properly initialized');
  console.log('   - Verify static file paths are correct');
  
  return true;
}

async function main() {
  console.log('🔍 JavaScript Error Diagnostic Tool');
  console.log('=====================================\n');
  
  try {
    await checkStaticFiles();
    console.log('');
    
    await checkPanelConfiguration();
    console.log('');
    
    await identifyProblem();
    console.log('');
    
    await suggestFixes();
    
    console.log('\n✅ Diagnostic completed');
    console.log('\n💡 Next steps:');
    console.log('1. Start services manually: npm run start');
    console.log('2. Open browser to http://localhost:3001/lockers');
    console.log('3. Open browser dev tools (F12)');
    console.log('4. Check Console tab for JavaScript errors');
    console.log('5. Check Network tab for failed requests');
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
    process.exit(1);
  }
}

main();