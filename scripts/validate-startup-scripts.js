#!/usr/bin/env node

/**
 * Validate Startup Scripts for Kiosk UI Overhaul Compatibility
 * Checks file paths and configurations without running commands
 */

const { readFile, access } = require('fs/promises');
const { join } = require('path');

console.log('🔍 Validating Startup Script Compatibility');
console.log('==========================================');

async function validateBuildCommands() {
  console.log('\n📦 Checking build commands in startup scripts...');
  
  const scripts = [
    'scripts/start-all-clean.sh',
    'scripts/start-services-properly.sh', 
    'scripts/start-all-services.sh'
  ];
  
  let allValid = true;
  
  for (const script of scripts) {
    try {
      const content = await readFile(script, 'utf-8');
      
      if (content.includes('npm run build') && !content.includes('npm run build:all')) {
        console.log(`  ✅ ${script}: Uses correct build command`);
      } else if (content.includes('npm run build:all')) {
        console.log(`  ❌ ${script}: Uses old build:all command (should be 'npm run build')`);
        allValid = false;
      } else {
        console.log(`  ⚠️  ${script}: No build command found`);
      }
    } catch (error) {
      console.log(`  ❌ ${script}: Cannot read file - ${error.message}`);
      allValid = false;
    }
  }
  
  return allValid;
}

async function validateUIControllerPaths() {
  console.log('\n📁 Checking UI controller file paths...');
  
  try {
    const uiControllerPath = 'app/kiosk/src/controllers/ui-controller.ts';
    const content = await readFile(uiControllerPath, 'utf-8');
    
    let allValid = true;
    
    // Check static file path
    if (content.includes("join(__dirname, '../ui/static')")) {
      console.log('  ✅ Static file path: Correct (../ui/static)');
    } else if (content.includes("join(__dirname, '../src/ui/static')")) {
      console.log('  ❌ Static file path: Incorrect (should be ../ui/static, not ../src/ui/static)');
      allValid = false;
    } else {
      console.log('  ⚠️  Static file path: Not found');
      allValid = false;
    }
    
    // Check HTML file path
    if (content.includes("join(__dirname, '../ui/index.html')")) {
      console.log('  ✅ HTML file path: Correct (../ui/index.html)');
    } else if (content.includes("join(__dirname, '../src/ui/index.html')")) {
      console.log('  ❌ HTML file path: Incorrect (should be ../ui/index.html, not ../src/ui/index.html)');
      allValid = false;
    } else {
      console.log('  ⚠️  HTML file path: Not found');
      allValid = false;
    }
    
    return allValid;
  } catch (error) {
    console.log(`  ❌ Cannot read UI controller: ${error.message}`);
    return false;
  }
}

async function validateUIFiles() {
  console.log('\n🎨 Checking UI file structure...');
  
  const requiredFiles = [
    'app/kiosk/src/ui/index.html',
    'app/kiosk/src/ui/static/styles-simple.css',
    'app/kiosk/src/ui/static/app-simple.js'
  ];
  
  let allValid = true;
  
  for (const file of requiredFiles) {
    try {
      await access(file);
      console.log(`  ✅ ${file}: Exists`);
      
      // Basic content validation
      const content = await readFile(file, 'utf-8');
      
      if (file.endsWith('index.html')) {
        if (content.includes('styles-simple.css') && content.includes('app-simple.js')) {
          console.log(`    ✅ HTML references simplified CSS and JS files`);
        } else {
          console.log(`    ❌ HTML does not reference simplified files correctly`);
          allValid = false;
        }
      }
      
      if (file.endsWith('styles-simple.css')) {
        if (content.includes('/* Pi-optimized') || content.includes('touch-friendly')) {
          console.log(`    ✅ CSS contains Pi optimizations`);
        } else {
          console.log(`    ⚠️  CSS may not contain Pi optimizations`);
        }
      }
      
      if (file.endsWith('app-simple.js')) {
        if (content.includes('SimpleKioskApp')) {
          console.log(`    ✅ JS contains SimpleKioskApp class`);
        } else {
          console.log(`    ❌ JS does not contain SimpleKioskApp class`);
          allValid = false;
        }
      }
      
    } catch (error) {
      console.log(`  ❌ ${file}: Missing or unreadable`);
      allValid = false;
    }
  }
  
  return allValid;
}

async function validatePackageJsonScripts() {
  console.log('\n📋 Checking package.json scripts...');
  
  try {
    const packageJson = JSON.parse(await readFile('package.json', 'utf-8'));
    const scripts = packageJson.scripts || {};
    
    let allValid = true;
    
    // Check if main build script exists
    if (scripts.build) {
      console.log('  ✅ Main build script exists');
    } else {
      console.log('  ❌ Main build script missing');
      allValid = false;
    }
    
    // Check individual service scripts
    const requiredScripts = ['start:gateway', 'start:kiosk', 'start:panel'];
    for (const script of requiredScripts) {
      if (scripts[script]) {
        console.log(`  ✅ ${script}: Exists`);
      } else {
        console.log(`  ❌ ${script}: Missing`);
        allValid = false;
      }
    }
    
    return allValid;
  } catch (error) {
    console.log(`  ❌ Cannot read package.json: ${error.message}`);
    return false;
  }
}

async function validateKioskPackageJson() {
  console.log('\n🖥️  Checking kiosk package.json build script...');
  
  try {
    const kioskPackageJson = JSON.parse(await readFile('app/kiosk/package.json', 'utf-8'));
    const buildScript = kioskPackageJson.scripts?.build;
    
    if (buildScript && buildScript.includes("copyDir('src/ui','dist/ui')")) {
      console.log('  ✅ Kiosk build script copies UI files correctly');
      return true;
    } else {
      console.log('  ❌ Kiosk build script does not copy UI files correctly');
      return false;
    }
  } catch (error) {
    console.log(`  ❌ Cannot read kiosk package.json: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('\n🚀 Running validation checks...\n');
  
  const checks = [
    { name: 'Build Commands', fn: validateBuildCommands },
    { name: 'UI Controller Paths', fn: validateUIControllerPaths },
    { name: 'UI Files', fn: validateUIFiles },
    { name: 'Package.json Scripts', fn: validatePackageJsonScripts },
    { name: 'Kiosk Build Script', fn: validateKioskPackageJson }
  ];
  
  let passedChecks = 0;
  
  for (const check of checks) {
    try {
      const result = await check.fn();
      if (result) {
        passedChecks++;
      }
    } catch (error) {
      console.log(`❌ ${check.name} check failed: ${error.message}`);
    }
  }
  
  console.log('\n📊 Validation Results');
  console.log('=====================');
  console.log(`Passed: ${passedChecks}/${checks.length}`);
  
  if (passedChecks === checks.length) {
    console.log('\n🎉 All validations passed!');
    console.log('✅ Startup scripts are compatible with kiosk-ui-overhaul updates');
    console.log('\n📋 Ready for deployment:');
    console.log('   • Use ./scripts/start-all-clean.sh for clean startup');
    console.log('   • All UI files are properly configured');
    console.log('   • Build commands are correct');
    return true;
  } else {
    console.log('\n⚠️  Some validations failed.');
    console.log('Please review the issues above before deploying.');
    return false;
  }
}

if (require.main === module) {
  main().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  });
}

module.exports = { main };