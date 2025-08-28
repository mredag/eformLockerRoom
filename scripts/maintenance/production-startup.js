#!/usr/bin/env node

/**
 * Production Startup Script
 * Ensures all services start with proper configuration logging
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Production Startup');
console.log('=====================');

// Configuration
const config = {
  EFORM_DB_PATH: process.env.EFORM_DB_PATH || '/home/pi/eform-locker/data/eform.db',
  KIOSK_ID: process.env.KIOSK_ID || 'KIOSK-1',
  MODBUS_PORT: process.env.MODBUS_PORT || '/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_XXXX-if00-port0',
  MODBUS_BAUD: process.env.MODBUS_BAUD || '9600',
  MODBUS_PARITY: process.env.MODBUS_PARITY || 'none',
  PULSE_DURATION_MS: process.env.PULSE_DURATION_MS || '400',
  COMMAND_INTERVAL_MS: process.env.COMMAND_INTERVAL_MS || '300',
  MAX_RETRIES: process.env.MAX_RETRIES || '2',
  GATEWAY_PORT: process.env.GATEWAY_PORT || '3000',
  PANEL_PORT: process.env.PANEL_PORT || '3003',
  KIOSK_PORT: process.env.KIOSK_PORT || '3002'
};

console.log('\n📋 Environment Configuration');
console.log('============================');
Object.entries(config).forEach(([key, value]) => {
  console.log(`${key}=${value}`);
});

// Service definitions
const services = [
  {
    name: 'Gateway',
    command: 'node',
    args: ['app/gateway/dist/index.js'],
    port: config.GATEWAY_PORT,
    env: {
      ...process.env,
      PORT: config.GATEWAY_PORT,
      EFORM_DB_PATH: config.EFORM_DB_PATH
    }
  },
  {
    name: 'Panel',
    command: 'node',
    args: ['app/panel/dist/index.js'],
    port: config.PANEL_PORT,
    env: {
      ...process.env,
      PORT: config.PANEL_PORT,
      EFORM_DB_PATH: config.EFORM_DB_PATH
    }
  },
  {
    name: 'Kiosk',
    command: 'node',
    args: ['app/kiosk/dist/index.js'],
    port: config.KIOSK_PORT,
    env: {
      ...process.env,
      PORT: config.KIOSK_PORT,
      EFORM_DB_PATH: config.EFORM_DB_PATH,
      KIOSK_ID: config.KIOSK_ID,
      MODBUS_PORT: config.MODBUS_PORT,
      MODBUS_BAUD: config.MODBUS_BAUD,
      MODBUS_PARITY: config.MODBUS_PARITY,
      PULSE_DURATION_MS: config.PULSE_DURATION_MS,
      COMMAND_INTERVAL_MS: config.COMMAND_INTERVAL_MS,
      MAX_RETRIES: config.MAX_RETRIES
    }
  }
];

const runningServices = [];

function startService(service) {
  console.log(`\n🚀 Starting ${service.name} on port ${service.port}`);
  console.log(`   Command: ${service.command} ${service.args.join(' ')}`);
  
  const child = spawn(service.command, service.args, {
    env: service.env,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Prefix logs with service name
  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => {
      console.log(`[${service.name}] ${line}`);
    });
  });
  
  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => {
      console.error(`[${service.name}] ERROR: ${line}`);
    });
  });
  
  child.on('close', (code) => {
    console.log(`[${service.name}] Process exited with code ${code}`);
    // Remove from running services
    const index = runningServices.findIndex(s => s.name === service.name);
    if (index !== -1) {
      runningServices.splice(index, 1);
    }
  });
  
  child.on('error', (error) => {
    console.error(`[${service.name}] Failed to start: ${error.message}`);
  });
  
  runningServices.push({
    name: service.name,
    process: child,
    port: service.port
  });
  
  return child;
}

function stopAllServices() {
  console.log('\n🛑 Stopping all services...');
  
  runningServices.forEach(service => {
    console.log(`   Stopping ${service.name}...`);
    service.process.kill('SIGTERM');
  });
  
  // Force kill after 5 seconds
  setTimeout(() => {
    runningServices.forEach(service => {
      if (!service.process.killed) {
        console.log(`   Force killing ${service.name}...`);
        service.process.kill('SIGKILL');
      }
    });
  }, 5000);
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n📡 Received SIGINT, shutting down gracefully...');
  stopAllServices();
  setTimeout(() => process.exit(0), 6000);
});

process.on('SIGTERM', () => {
  console.log('\n📡 Received SIGTERM, shutting down gracefully...');
  stopAllServices();
  setTimeout(() => process.exit(0), 6000);
});

// Start all services
async function startAllServices() {
  console.log('\n🎬 Starting all services...');
  
  // Start services with delays to avoid port conflicts
  for (let i = 0; i < services.length; i++) {
    const service = services[i];
    startService(service);
    
    // Wait a bit between service starts
    if (i < services.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n✅ All services started');
  console.log('\n📊 Service Status:');
  runningServices.forEach(service => {
    console.log(`   ${service.name}: http://localhost:${service.port}`);
  });
  
  console.log('\n🔍 Health Check URLs:');
  console.log(`   Gateway: http://localhost:${config.GATEWAY_PORT}/health`);
  console.log(`   Panel: http://localhost:${config.PANEL_PORT}/health`);
  console.log(`   Kiosk: http://localhost:${config.KIOSK_PORT}/health`);
  
  console.log('\n📋 Expected Boot Logs:');
  console.log('   - Absolute database path printed by each service');
  console.log('   - SQLite PRAGMAs (WAL mode, busy_timeout=5000, foreign_keys=ON)');
  console.log('   - Kiosk hardware configuration (MODBUS_PORT, baud rate, etc.)');
  console.log('   - Service versions and startup timestamps');
  
  console.log('\n🧪 Ready for E2E Testing');
  console.log('========================');
  console.log('Run: node scripts/e2e-production-checklist.js');
}

// Database verification
function verifyDatabase() {
  const fs = require('fs');
  const dbPath = path.resolve(config.EFORM_DB_PATH);
  
  console.log('\n🗄️  Database Verification');
  console.log('=========================');
  console.log(`Database path: ${dbPath}`);
  
  if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    console.log(`✅ Database exists (${Math.round(stats.size / 1024)}KB)`);
    console.log(`   Modified: ${stats.mtime.toISOString()}`);
  } else {
    console.log('❌ Database not found');
    console.log('   Run migrations first: npm run migrate');
    return false;
  }
  
  return true;
}

// Main startup
async function main() {
  console.log('🔍 Pre-startup verification...');
  
  if (!verifyDatabase()) {
    console.log('❌ Database verification failed');
    process.exit(1);
  }
  
  await startAllServices();
  
  // Keep process alive
  console.log('\n⏳ Services running... Press Ctrl+C to stop');
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Startup failed:', error);
    process.exit(1);
  });
}

module.exports = {
  startAllServices,
  stopAllServices,
  config
};