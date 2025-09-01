#!/bin/bash

# Health check script for eForm Locker System
# This script checks the health of all services

echo "🏥 eForm Locker System Health Check"
echo "=================================="

# Check if services are running
echo "📊 Service Status:"

# Check Gateway (Port 3000)
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Gateway Service (Port 3000): Running"
else
    echo "❌ Gateway Service (Port 3000): Not responding"
fi

# Check Panel (Port 3001)
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ Panel Service (Port 3001): Running"
else
    echo "❌ Panel Service (Port 3001): Not responding"
fi

# Check Kiosk (Port 3002)
if curl -s http://localhost:3002/health > /dev/null 2>&1; then
    echo "✅ Kiosk Service (Port 3002): Running"
else
    echo "❌ Kiosk Service (Port 3002): Not responding"
fi

# Check hardware port
echo ""
echo "🔌 Hardware Status:"
if [ -e /dev/ttyUSB0 ]; then
    echo "✅ USB-RS485 Port: Available"
else
    echo "❌ USB-RS485 Port: Not found"
fi

# Check database
echo ""
echo "💾 Database Status:"
if [ -f "data/eform.db" ]; then
    echo "✅ Database: Available"
else
    echo "❌ Database: Not found"
fi

# Check system resources
echo ""
echo "💻 System Resources:"
echo "CPU Usage: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)%"
echo "Memory Usage: $(free | grep Mem | awk '{printf("%.1f%%", $3/$2 * 100.0)}')"
echo "Disk Usage: $(df -h / | awk 'NR==2{printf "%s", $5}')"

echo ""
echo "Health check completed at $(date)"