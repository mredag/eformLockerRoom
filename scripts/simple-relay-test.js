#!/usr/bin/env node

/**
 * Simple Relay Test - Corrected Version
 * Uses the proper public interface of ModbusController
 */

import { ModbusController } from '../app/kiosk/src/hardware/modbus-controller.ts';

async function simpleRelayTest() {
  console.log('🔧 Simple Relay Test (Corrected)');
  console.log('=' .repeat(35));
  
  const controller = new ModbusController({
    port: '/dev/ttyUSB0',
    baudrate: 9600,
    timeout_ms: 2000,
    pulse_duration_ms: 400,
    burst_duration_seconds: 10,
    burst_interval_ms: 2000,
    command_interval_ms: 300,
    use_multiple_coils: true,
    verify_writes: false,
    max_retries: 2,
    test_mode: true
  });

  try {
    console.log('📡 Connecting...');
    await controller.initialize();
    console.log('✅ Connected to Modbus');
    
    console.log('🔌 Activating relay 1...');
    // Use the correct public method: openLocker(lockerId, slaveAddress)
    const success = await controller.openLocker(1, 1);
    
    if (success) {
      console.log('✅ Relay 1 activated successfully!');
    } else {
      console.log('❌ Relay 1 activation failed');
    }
    
    // Show health status
    const health = controller.getHealth();
    console.log(`📊 Status: ${health.status}`);
    console.log(`📊 Commands: ${health.total_commands} total, ${health.failed_commands} failed`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await controller.close();
    console.log('🔌 Disconnected');
  }
}

simpleRelayTest();