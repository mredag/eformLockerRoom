#!/usr/bin/env node

/**
 * Test Startup Script Compatibility with Kiosk UI Overhaul
 * Verifies that all startup scripts work correctly with the new simplified UI
 */

const { spawn } = require('child_process');
const { readFile, access } = require('fs/promises');
const { join } = require('path');

console.log('🧪 Testing Startup Script Compatibility');
console.log('=======================================');

const tests = [
  {
    name: 'Build Command Compatibility',
    test: testBuildCommands
  },
  {
    name: 'UI File Paths',
    test: testUIFilePaths
  },
  {
    name: 'Static File Serving',
    test: testStaticFileServing
  },
  {
    name: 'Service Health Checks',
    test: testServiceHealthChecks
  }
];

async function testBuildCommands() {
  console.log('📦 Testing build commands...');
  
  try {
    // Test main build command
    const buildResult = await runCommand('npm', ['run', 'build']);
    if (buildResult.code !== 0) {
      throw new Error(`Build failed: ${buildResult.stderr}`);
    }
    
    // Check if kiosk UI files are built correctly
    const uiFiles = [
      'app/kiosk/dist/ui/index.html',
      'app/kiosk/dist/ui/static/styles-simple.css',
      'app/kiosk/dist/ui/static/app-simple.js'
    ];
    
    for (const file of uiFiles) {
      try {
        await access(file);
        console.log(`  ✅ ${file} exists`);
      } catch (error) {
        throw new Error(`Missing UI file: ${file}`);
      }
    }
    
    return { success: true, message: 'Build commands work correctly' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

async function testUIFilePaths() {
  console.log('📁 Testing UI file paths...');
  
  try {
    // Check if UI controller has correct paths
    const uiControllerPath = 'app/kiosk/src/controllers/ui-controller.ts';
    const content = await readFile(uiControllerPath, 'utf-8');
    
    // Check for correct static file path
    if (content.includes("join(__dirname, '../ui/static')")) {
      console.log('  ✅ Static file path is correct');
    } else {
      throw new Error('Static file path in UI controller is incorrect');
    }
    
    // Check for correct HTML file path
    if (content.includes("join(__dirname, '../ui/index.html')")) {
      console.log('  ✅ HTML file path is correct');
    } else {
      throw new Error('HTML file path in UI controller is incorrect');
    }
    
    return { success: true, message: 'UI file paths are correct' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

async function testStaticFileServing() {
  console.log('🌐 Testing static file serving...');
  
  try {
    // Check if the new simplified files exist
    const staticFiles = [
      'app/kiosk/src/ui/static/styles-simple.css',
      'app/kiosk/src/ui/static/app-simple.js',
      'app/kiosk/src/ui/index.html'
    ];
    
    for (const file of staticFiles) {
      try {
        const content = await readFile(file, 'utf-8');
        console.log(`  ✅ ${file} exists and readable`);
        
        // Basic content validation
        if (file.endsWith('.css') && content.includes('/* Pi-optimized')) {
          console.log(`    ✅ CSS file contains Pi optimizations`);
        }
        if (file.endsWith('.js') && content.includes('SimpleKioskApp')) {
          console.log(`    ✅ JS file contains SimpleKioskApp class`);
        }
        if (file.endsWith('.html') && content.includes('styles-simple.css')) {
          console.log(`    ✅ HTML file references simplified CSS`);
        }
      } catch (error) {
        throw new Error(`Cannot read ${file}: ${error.message}`);
      }
    }
    
    return { success: true, message: 'Static files are properly configured' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

async function testServiceHealthChecks() {
  console.log('🏥 Testing service health check compatibility...');
  
  try {
    // Check if startup scripts use correct build command
    const startupScripts = [
      'scripts/start-all-clean.sh',
      'scripts/start-services-properly.sh',
      'scripts/start-all-services.sh'
    ];
    
    for (const script of startupScripts) {
      const content = await readFile(script, 'utf-8');
      
      if (content.includes('npm run build') && !content.includes('npm run build:all')) {
        console.log(`  ✅ ${script} uses correct build command`);
      } else {
        throw new Error(`${script} uses incorrect build command`);
      }
    }
    
    return { success: true, message: 'Startup scripts use correct build commands' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function runTests() {
  console.log('\n🚀 Running compatibility tests...\n');
  
  let passedTests = 0;
  let totalTests = tests.length;
  
  for (const test of tests) {
    console.log(`\n📋 ${test.name}`);
    console.log('─'.repeat(test.name.length + 4));
    
    try {
      const result = await test.test();
      
      if (result.success) {
        console.log(`✅ PASS: ${result.message}`);
        passedTests++;
      } else {
        console.log(`❌ FAIL: ${result.message}`);
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
    }
  }
  
  console.log('\n📊 Test Results');
  console.log('===============');
  console.log(`Passed: ${passedTests}/${totalTests}`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! Startup scripts are compatible with kiosk-ui-overhaul.');
    return true;
  } else {
    console.log('⚠️  Some tests failed. Please review the issues above.');
    return false;
  }
}

// Run tests if called directly
if (require.main === module) {
  runTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = { runTests };