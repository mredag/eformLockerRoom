#!/usr/bin/env node

const { CommandQueueManager } = require('../shared/services/command-queue-manager');

console.log('🧪 Creating Test Command');
console.log('========================');

async function createTestCommand() {
  try {
    const commandQueue = new CommandQueueManager();
    
    console.log('📝 Creating test command for kiosk-1...');
    
    const commandId = await commandQueue.enqueueCommand(
      'kiosk-1',
      'open_locker',
      {
        locker_id: 1,
        staff_user: 'test-user',
        reason: 'Hardware test',
        force: false
      }
    );
    
    console.log(`✅ Command created: ${commandId}`);
    
    // Check the command status
    const command = await commandQueue.getCommand(commandId);
    console.log('📊 Command details:');
    console.log(`   ID: ${command.command_id}`);
    console.log(`   Type: ${command.command_type}`);
    console.log(`   Status: ${command.status}`);
    console.log(`   Kiosk: ${command.kiosk_id}`);
    console.log(`   Created: ${command.created_at}`);
    console.log(`   Payload:`, command.payload);
    
    console.log('');
    console.log('💡 Now test if kiosk picks it up:');
    console.log('curl -X POST http://localhost:3000/api/heartbeat/commands/poll \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -d \'{"kiosk_id": "kiosk-1"}\'');
    
  } catch (error) {
    console.error('❌ Error creating command:', error.message);
    process.exit(1);
  }
}

createTestCommand();