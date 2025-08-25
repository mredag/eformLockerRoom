#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting eForm Locker System...\n');

const services = [
  { name: 'Gateway', command: 'npm', args: ['run', 'start:gateway'], port: 3000 },
  { name: 'Panel', command: 'npm', args: ['run', 'start:panel'], port: 3001 },
  { name: 'Kiosk', command: 'npm', args: ['run', 'start:kiosk'], port: 3002 }
];

const processes = [];

// Function to start a service
function startService(service) {
  console.log(`📡 Starting ${service.name} service on port ${service.port}...`);
  
  const proc = spawn(service.command, service.args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
    cwd: process.cwd()
  });

  // Add service name prefix to output
  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => {
      console.log(`[${service.name}] ${line}`);
    });
  });

  proc.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => {
      console.error(`[${service.name}] ${line}`);
    });
  });

  proc.on('close', (code) => {
    console.log(`❌ ${service.name} service exited with code ${code}`);
  });

  proc.on('error', (err) => {
    console.error(`❌ Failed to start ${service.name}:`, err.message);
  });

  return proc;
}

// Start all services
services.forEach(service => {
  const proc = startService(service);
  processes.push({ name: service.name, process: proc });
});

console.log('\n✅ All services started!');
console.log('📊 Access points:');
console.log('   • Gateway: http://localhost:3000');
console.log('   • Panel:   http://localhost:3001');
console.log('   • Kiosk:   http://localhost:3002');
console.log('\n💡 Press Ctrl+C to stop all services\n');

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down all services...');
  
  let stoppedCount = 0;
  const totalProcesses = processes.length;
  
  processes.forEach(({ name, process: childProcess }) => {
    console.log(`   Stopping ${name}...`);
    
    // Listen for process exit
    childProcess.on('exit', (code) => {
      stoppedCount++;
      if (stoppedCount === totalProcesses) {
        console.log('✅ All services stopped');
        process.exit(0);
      }
    });
    
    // Send graceful shutdown signal
    childProcess.kill('SIGTERM');
  });

  // Fallback timeout in case processes don't respond
  setTimeout(() => {
    console.log('⚠️  Timeout reached, forcing shutdown...');
    processes.forEach(({ name, process: childProcess }) => {
      if (!childProcess.killed) {
        console.log(`   Force killing ${name}...`);
        childProcess.kill('SIGKILL');
      }
    });
    setTimeout(() => {
      console.log('✅ All services stopped (forced)');
      process.exit(0);
    }, 1000);
  }, 5000);
});

// Keep the process alive
process.stdin.resume();