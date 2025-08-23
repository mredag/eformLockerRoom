// Debug script to check the kiosk configuration
console.log('Environment variables:');
console.log('MODBUS_PORT:', process.env.MODBUS_PORT);
console.log('MODBUS_BAUDRATE:', process.env.MODBUS_BAUDRATE);

// Test the config object
const modbusConfig = {
  port: process.env.MODBUS_PORT || '/dev/ttyUSB0',
  baudrate: parseInt(process.env.MODBUS_BAUDRATE || '9600'),
  timeout_ms: 1000,
  pulse_duration_ms: 500,
  burst_duration_seconds: 2,
  burst_interval_ms: 100,
  command_interval_ms: 50,
  max_retries: 3,
  retry_delay_base_ms: 100,
  retry_delay_max_ms: 1000,
  connection_retry_attempts: 5,
  health_check_interval_ms: 30000,
  test_mode: false,
  use_multiple_coils: true,
  verify_writes: true
};

console.log('modbusConfig:', JSON.stringify(modbusConfig, null, 2));
console.log('modbusConfig.port:', modbusConfig.port);
console.log('typeof modbusConfig:', typeof modbusConfig);
console.log('modbusConfig is undefined:', modbusConfig === undefined);