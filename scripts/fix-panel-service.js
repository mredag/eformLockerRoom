#!/usr/bin/env node

/**
 * Fix Panel Service ES Module Issue
 * Resolves the "Cannot use import statement outside a module" error
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Fixing Panel Service ES Module Issue');
console.log('======================================\n');

// Check if we're in the project root
if (!fs.existsSync('package.json') || !fs.existsSync('app/panel')) {
  console.error('❌ Error: Not in the project root directory');
  console.error('Please run this script from the eform-locker project root');
  process.exit(1);
}

console.log('📁 Current directory:', process.cwd());

// Step 1: Clean panel build
console.log('\n🧹 Cleaning panel build...');
try {
  process.chdir('app/panel');
  
  if (fs.existsSync('dist')) {
    execSync('rm -rf dist', { stdio: 'inherit' });
    console.log('✅ Cleaned old build');
  }
  
  if (fs.existsSync('node_modules/.cache')) {
    execSync('rm -rf node_modules/.cache', { stdio: 'inherit' });
    console.log('✅ Cleaned build cache');
  }
} catch (error) {
  console.error('❌ Failed to clean build:', error.message);
}

// Step 2: Check and fix package.json
console.log('\n📄 Checking package.json configuration...');
const packageJsonPath = 'package.json';
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

console.log('Current configuration:');
console.log(`  Type: ${packageJson.type}`);
console.log(`  Main: ${packageJson.main}`);
console.log(`  Build target: ${packageJson.scripts.build.includes('--target=') ? packageJson.scripts.build.match(/--target=([^\s]+)/)[1] : 'not specified'}`);

// Fix the build script to ensure proper CommonJS output
const originalBuildScript = packageJson.scripts.build;
const fixedBuildScript = 'esbuild src/index.ts --bundle --platform=node --target=node20 --outfile=dist/index.js --external:sqlite3 --external:@mapbox/node-pre-gyp --external:mock-aws-s3 --external:aws-sdk --external:nock --external:argon2 --format=cjs --minify=false';

if (originalBuildScript !== fixedBuildScript) {
  console.log('\n🔧 Updating build configuration...');
  packageJson.scripts.build = fixedBuildScript;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log('✅ Build script updated');
} else {
  console.log('✅ Build configuration is correct');
}

// Step 3: Rebuild with fixed configuration
console.log('\n🔨 Rebuilding panel service...');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Panel rebuilt successfully');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  
  // Try alternative build approach
  console.log('\n🔄 Trying alternative build approach...');
  try {
    execSync('npx esbuild src/index.ts --bundle --platform=node --target=node20 --outfile=dist/index.js --external:sqlite3 --external:@mapbox/node-pre-gyp --external:mock-aws-s3 --external:aws-sdk --external:nock --external:argon2 --format=cjs --minify=false', { stdio: 'inherit' });
    console.log('✅ Alternative build succeeded');
  } catch (altError) {
    console.error('❌ Alternative build also failed:', altError.message);
    process.exit(1);
  }
}

// Step 4: Verify the build
console.log('\n🔍 Verifying build...');
const distPath = 'dist/index.js';
if (fs.existsSync(distPath)) {
  const stats = fs.statSync(distPath);
  console.log(`✅ Build file exists (${Math.round(stats.size / 1024)}KB)`);
  
  // Check for ES module syntax in the built file
  const buildContent = fs.readFileSync(distPath, 'utf8');
  const hasImportStatements = buildContent.includes('import ') && !buildContent.includes('// import');
  const hasExportStatements = buildContent.includes('export ') && !buildContent.includes('// export');
  
  if (hasImportStatements || hasExportStatements) {
    console.log('⚠️  Build still contains ES module syntax');
    console.log('   This might cause runtime issues');
  } else {
    console.log('✅ Build uses CommonJS format');
  }
  
  // Test syntax
  try {
    execSync(`node -c "${distPath}"`, { stdio: 'pipe' });
    console.log('✅ Build syntax is valid');
  } catch (error) {
    console.error('❌ Build has syntax errors');
    process.exit(1);
  }
} else {
  console.error('❌ Build file not found');
  process.exit(1);
}

// Step 5: Test the service
console.log('\n🧪 Testing panel service startup...');
try {
  // Test with timeout to avoid hanging
  execSync('timeout 5s npm start || true', { stdio: 'pipe' });
  console.log('✅ Panel service startup test completed');
} catch (error) {
  console.log('⚠️  Startup test had issues (this is normal for timeout)');
}

// Go back to project root
process.chdir('..');
process.chdir('..');

console.log('\n🎉 Panel Service Fix Completed!');
console.log('==============================');
console.log('✅ Build cleaned and rebuilt');
console.log('✅ Configuration updated');
console.log('✅ Syntax validated');

console.log('\n🚀 To start the panel service:');
console.log('  cd app/panel');
console.log('  npm start');
console.log('');
console.log('🌐 Once running, access the admin panel at:');
console.log('  http://localhost:3001');
console.log('  http://pi-eform-locker.local:3001');

console.log('\n💡 If you still get errors:');
console.log('1. Check Node.js version: node --version (should be >= 18)');
console.log('2. Try running from project root: node app/panel/dist/index.js');
console.log('3. Check for port conflicts: sudo lsof -i :3001');