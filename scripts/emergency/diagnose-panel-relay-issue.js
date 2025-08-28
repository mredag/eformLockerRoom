#!/usr/bin/env node

/**
 * Panel Relay Issue Diagnostic Script
 * 
 * This script helps diagnose the "500 Internal Server Error" issue
 * that occurs after 20-30 minutes of Panel service operation.
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Panel Relay Issue Diagnostic Tool');
console.log('=====================================\n');

async function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        resolve({ error: error.message, stdout: '', stderr });
      } else {
        resolve({ stdout, stderr, error: null });
      }
    });
  });
}

async function checkServiceStatus() {
  console.log('📊 Checking Service Status...');
  
  const services = [
    { name: 'Gateway', port: 3000 },
    { name: 'Panel', port: 3001 },
    { name: 'Kiosk', port: 3002 }
  ];
  
  for (const service of services) {
    try {
      const response = await fetch(`http://localhost:${service.port}/health`, {
        signal: AbortSignal.timeout(2000)
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ ${service.name} (${service.port}): ${data.status}`);
      } else {
        console.log(`❌ ${service.name} (${service.port}): HTTP ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ ${service.name} (${service.port}): ${error.message}`);
    }
  }
  console.log();
}

async function checkSerialPort() {
  console.log('🔌 Checking Serial Port Status...');
  
  // Check if port exists
  const portExists = fs.existsSync('/dev/ttyUSB0');
  console.log(`📍 /dev/ttyUSB0 exists: ${portExists ? '✅ Yes' : '❌ No'}`);
  
  if (portExists) {
    // Check port permissions
    const { stdout: lsOutput } = await runCommand('ls -la /dev/ttyUSB0');
    console.log(`📋 Port permissions: ${lsOutput.trim()}`);
    
    // Check what's using the port
    const { stdout: lsofOutput } = await runCommand('sudo lsof /dev/ttyUSB0 2>/dev/null || echo "No processes using port"');
    console.log(`🔍 Port usage: ${lsofOutput.trim()}`);
  }
  console.log();
}

async function checkProcesses() {
  console.log('⚙️ Checking Node.js Processes...');
  
  const { stdout } = await runCommand('ps aux | grep node | grep -v grep');
  const processes = stdout.trim().split('\n').filter(line => line.length > 0);
  
  if (processes.length === 0) {
    console.log('❌ No Node.js processes found');
  } else {
    processes.forEach((process, index) => {
      console.log(`${index + 1}. ${process}`);
    });
  }
  console.log();
}

async function checkLogs() {
  console.log('📝 Checking Recent Logs...');
  
  const logFiles = ['gateway.log', 'panel.log', 'kiosk.log'];
  
  for (const logFile of logFiles) {
    const logPath = path.join('logs', logFile);
    
    if (fs.existsSync(logPath)) {
      console.log(`\n📄 Recent ${logFile} entries:`);
      const { stdout } = await runCommand(`tail -5 ${logPath}`);
      console.log(stdout || 'No recent entries');
    } else {
      console.log(`❌ ${logFile} not found`);
    }
  }
  console.log();
}

async function testRelayAPI() {
  console.log('🧪 Testing Relay API...');
  
  try {
    // Test relay status endpoint
    const statusResponse = await fetch('http://localhost:3001/api/relay/status', {
      signal: AbortSignal.timeout(5000)
    });
    
    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      console.log('✅ Relay status endpoint working');
      console.log(`📊 Connection status: ${statusData.status?.connected ? 'Connected' : 'Disconnected'}`);
    } else {
      console.log(`❌ Relay status endpoint failed: HTTP ${statusResponse.status}`);
    }
    
    // Test connection test endpoint
    const testResponse = await fetch('http://localhost:3001/api/relay/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test_type: 'connection' }),
      signal: AbortSignal.timeout(10000)
    });
    
    if (testResponse.ok) {
      const testData = await testResponse.json();
      console.log(`🔧 Connection test: ${testData.success ? '✅ Passed' : '❌ Failed'}`);
      if (testData.message) {
        console.log(`📝 Message: ${testData.message}`);
      }
    } else {
      console.log(`❌ Connection test failed: HTTP ${testResponse.status}`);
      const errorText = await testResponse.text();
      console.log(`📝 Error: ${errorText}`);
    }
    
  } catch (error) {
    console.log(`❌ API test failed: ${error.message}`);
  }
  console.log();
}

async function checkSystemResources() {
  console.log('💾 Checking System Resources...');
  
  // Memory usage
  const { stdout: memInfo } = await runCommand('free -h');
  console.log('📊 Memory usage:');
  console.log(memInfo);
  
  // Disk usage
  const { stdout: diskInfo } = await runCommand('df -h /');
  console.log('💽 Disk usage:');
  console.log(diskInfo);
  
  // Load average
  const { stdout: loadInfo } = await runCommand('uptime');
  console.log('⚡ System load:');
  console.log(loadInfo.trim());
  console.log();
}

async function generateReport() {
  console.log('📋 Generating Diagnostic Report...');
  
  const timestamp = new Date().toISOString();
  const reportPath = `panel-relay-diagnostic-${timestamp.replace(/[:.]/g, '-')}.txt`;
  
  let report = `Panel Relay Diagnostic Report
Generated: ${timestamp}
========================================

`;

  // Capture all diagnostic info
  const diagnostics = {
    services: await checkServiceStatus,
    serialPort: await checkSerialPort,
    processes: await checkProcesses,
    logs: await checkLogs,
    relayAPI: await testRelayAPI,
    resources: await checkSystemResources
  };
  
  // This is a simplified version - in practice you'd capture the actual output
  report += `Diagnostic completed. Check console output for details.

Recommendations:
1. If services are not responding, restart them: ./scripts/start-all-clean.sh
2. If serial port conflicts exist, stop Kiosk service before using Panel relay control
3. If memory usage is high, consider restarting services periodically
4. Check logs for specific error patterns around the 20-30 minute mark

Next Steps:
- Monitor logs during the problematic time period
- Consider implementing automatic service restarts
- Use queue-based locker control instead of direct relay activation
`;

  fs.writeFileSync(reportPath, report);
  console.log(`📄 Report saved to: ${reportPath}`);
}

async function main() {
  try {
    await checkServiceStatus();
    await checkSerialPort();
    await checkProcesses();
    await checkLogs();
    await testRelayAPI();
    await checkSystemResources();
    
    console.log('🎯 Diagnostic Summary:');
    console.log('======================');
    console.log('1. ✅ Check service health endpoints');
    console.log('2. 🔌 Verify serial port availability and permissions');
    console.log('3. ⚙️ Confirm no conflicting processes');
    console.log('4. 📝 Review recent log entries for errors');
    console.log('5. 🧪 Test relay API endpoints');
    console.log('6. 💾 Monitor system resource usage');
    console.log();
    console.log('💡 Recommendations:');
    console.log('- Use queue-based locker control from /lockers page instead of direct relay');
    console.log('- Monitor Panel service logs around the 20-30 minute mark');
    console.log('- Consider periodic service restarts if memory leaks are detected');
    console.log('- Ensure only one service accesses /dev/ttyUSB0 at a time');
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
  }
}

// Run diagnostics
main();