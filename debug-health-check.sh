#!/bin/bash

echo "🔍 Debug Health Check"
echo "===================="

echo "Testing Gateway..."
if curl -s http://localhost:3000/health --connect-timeout 5 --max-time 10 > /dev/null; then
    echo "✅ Gateway: OK"
else
    echo "❌ Gateway: FAIL"
    echo "Response: $(curl -s http://localhost:3000/health --connect-timeout 5 --max-time 10)"
fi

echo "Testing Panel..."
if curl -s http://localhost:3001/health --connect-timeout 5 --max-time 10 > /dev/null; then
    echo "✅ Panel: OK"
else
    echo "❌ Panel: FAIL"
    echo "Response: $(curl -s http://localhost:3001/health --connect-timeout 5 --max-time 10)"
fi

echo "Testing Kiosk..."
if curl -s http://localhost:3002/health --connect-timeout 5 --max-time 10 > /dev/null; then
    echo "✅ Kiosk: OK"
else
    echo "❌ Kiosk: FAIL"
    echo "Response: $(curl -s http://localhost:3002/health --connect-timeout 5 --max-time 10)"
fi