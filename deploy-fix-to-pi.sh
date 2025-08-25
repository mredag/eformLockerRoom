#!/bin/bash

echo "🚀 Deploying Block API Fix to Raspberry Pi"
echo "=========================================="

# Copy the fixed lockers.html to Pi
echo "📁 Copying fixed lockers.html to Raspberry Pi..."
scp app/panel/src/views/lockers.html pi@raspberrypi.local:/home/pi/eformLockroom/app/panel/src/views/

if [ $? -eq 0 ]; then
    echo "✅ File copied successfully!"
    
    echo "🔄 Restarting services on Pi..."
    ssh pi@raspberrypi.local "cd /home/pi/eformLockroom && pm2 restart all"
    
    if [ $? -eq 0 ]; then
        echo "✅ Services restarted successfully!"
        echo "🎯 The Block API fix has been deployed!"
        echo ""
        echo "📝 What was fixed:"
        echo "  - kioskId parsing now correctly handles 'kiosk-1-1' format"
        echo "  - API calls will use correct URL: /api/lockers/kiosk-1/1/block"
        echo "  - This should resolve the 400 Bad Request error"
        echo ""
        echo "🧪 Next steps:"
        echo "  1. Test the 'Seçilenleri Blokla' button on the Pi"
        echo "  2. Check console logs to verify correct API calls"
        echo "  3. Confirm lockers are successfully blocked"
    else
        echo "❌ Failed to restart services on Pi"
    fi
else
    echo "❌ Failed to copy file to Pi"
fi