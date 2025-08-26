#!/bin/bash

echo "🔍 Raspberry Pi Command Status Debug"
echo "===================================="

# Check if services are running
echo "📋 Checking running services..."
ps aux | grep -E "(node|npm)" | grep -v grep

echo ""
echo "📡 Testing Gateway connection..."
curl -s http://localhost:3000/api/heartbeat/commands/poll || echo "❌ Gateway not responding"

echo ""
echo "🖥️ Testing Kiosk connection..."
curl -s http://localhost:3001/health || echo "❌ Kiosk not responding"

echo ""
echo "📊 Checking kiosk registration..."
curl -s http://localhost:3000/api/heartbeat/kiosks

echo ""
echo "🔌 Checking USB devices..."
ls -la /dev/ttyUSB* 2>/dev/null || echo "❌ No USB serial devices found"

echo ""
echo "📝 Checking recent logs (last 20 lines)..."
echo "Gateway logs:"
tail -20 logs/gateway.log 2>/dev/null || echo "No gateway log found"

echo ""
echo "Kiosk logs:"
tail -20 logs/kiosk.log 2>/dev/null || echo "No kiosk log found"

echo ""
echo "🧪 Testing Modbus controller loading..."
node -e "
try {
  const fs = require('fs');
  const path = './app/kiosk/dist/index.js';
  if (fs.existsSync(path)) {
    console.log('✅ Kiosk build exists');
    const content = fs.readFileSync(path, 'utf8');
    if (content.includes('ModbusController')) {
      console.log('✅ ModbusController found in build');
    } else {
      console.log('❌ ModbusController NOT found in build');
    }
    if (content.includes('serialport')) {
      console.log('✅ serialport library found in build');
    } else {
      console.log('❌ serialport library NOT found in build');
    }
  } else {
    console.log('❌ Kiosk build does not exist');
  }
} catch (e) {
  console.log('❌ Error checking build:', e.message);
}
"