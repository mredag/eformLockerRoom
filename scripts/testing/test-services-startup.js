#!/usr/bin/env node

/**
 * Test Services Startup
 * Simple test to verify services can start without hardware
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function testServicesStartup() {
  console.log("🔧 Testing Services Startup (No Hardware Required)");
  console.log("=".repeat(60));

  // Test 1: Check if services are running
  console.log("\n📊 Test 1: Service Status Check");
  console.log("-".repeat(40));
  
  const services = [
    { name: 'Gateway', url: 'http://localhost:3000/health', port: 3000 },
    { name: 'Panel', url: 'http://localhost:3001/health', port: 3001 },
    { name: 'Kiosk', url: 'http://localhost:3002/health', port: 3002 }
  ];

  for (const service of services) {
    try {
      console.log(`   Checking ${service.name} service...`);
      
      // First check if port is listening
      const portCmd = `netstat -tlnp 2>/dev/null | grep :${service.port} || ss -tlnp 2>/dev/null | grep :${service.port} || echo "not listening"`;
      const { stdout: portCheck } = await execAsync(portCmd);
      
      if (portCheck.includes('not listening')) {
        console.log(`   ❌ ${service.name}: Port ${service.port} not listening`);
        continue;
      }
      
      // Then check health endpoint
      const healthCmd = `curl -s ${service.url} --connect-timeout 3 --max-time 5`;
      const { stdout: health, stderr } = await execAsync(healthCmd);
      
      if (stderr) {
        console.log(`   ❌ ${service.name}: Connection failed - ${stderr.trim()}`);
      } else {
        try {
          const healthData = JSON.parse(health);
          console.log(`   ✅ ${service.name}: Running (${healthData.status || 'healthy'})`);
        } catch {
          console.log(`   ⚠️  ${service.name}: Running but health check returned: ${health.substring(0, 100)}`);
        }
      }
    } catch (error) {
      console.log(`   ❌ ${service.name}: Error - ${error.message}`);
    }
  }

  // Test 2: Check process status
  console.log("\n📊 Test 2: Process Status Check");
  console.log("-".repeat(40));
  
  try {
    const psCmd = `ps aux | grep -E "(gateway|panel|kiosk)" | grep -v grep | grep node || echo "No Node.js processes found"`;
    const { stdout: processes } = await execAsync(psCmd);
    
    if (processes.includes('No Node.js processes found')) {
      console.log("   ❌ No services running as Node.js processes");
    } else {
      console.log("   ✅ Found running Node.js processes:");
      processes.split('\n').forEach(line => {
        if (line.trim()) {
          const parts = line.split(/\s+/);
          const pid = parts[1];
          const command = parts.slice(10).join(' ');
          console.log(`   📊 PID ${pid}: ${command.substring(0, 80)}`);
        }
      });
    }
  } catch (error) {
    console.log(`   ❌ Process check failed: ${error.message}`);
  }

  // Test 3: Check logs for errors
  console.log("\n📊 Test 3: Recent Log Check");
  console.log("-".repeat(40));
  
  try {
    // Check if there are any recent error logs
    const logCmd = `find . -name "*.log" -mtime -1 2>/dev/null | head -5`;
    const { stdout: logFiles } = await execAsync(logCmd);
    
    if (logFiles.trim()) {
      console.log("   📊 Recent log files found:");
      logFiles.split('\n').forEach(file => {
        if (file.trim()) console.log(`   📄 ${file.trim()}`);
      });
    } else {
      console.log("   📊 No recent log files found");
    }
  } catch (error) {
    console.log(`   ⚠️  Log check failed: ${error.message}`);
  }

  // Summary
  console.log("\n📋 Startup Test Summary");
  console.log("=".repeat(60));
  console.log("🔍 If services are not running:");
  console.log("   1. Check for build errors: npm run build:all");
  console.log("   2. Check for missing dependencies: npm install");
  console.log("   3. Check for port conflicts: netstat -tlnp | grep -E ':(3000|3001|3002)'");
  console.log("   4. Start services manually: npm run start:gateway & npm run start:panel &");
  console.log("   5. For Kiosk issues, check ModbusController initialization");
  console.log("\n🔧 Hardware-related failures are expected if USB-RS485 is not connected");
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

// Run the test
testServicesStartup().catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});