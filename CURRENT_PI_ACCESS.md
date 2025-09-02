# eForm Pi Access Information
Generated: 2025-09-02 10:20:39
IP Address: 192.168.1.11

## Web Interfaces
Admin Panel:  http://192.168.1.11:3001
Kiosk UI:     http://192.168.1.11:3002
Gateway API:  http://192.168.1.11:3000

## SSH Access
ssh pi@192.168.1.11

## Quick Health Check
Invoke-WebRequest -Uri "http://192.168.1.11:3000/health" -UseBasicParsing
Invoke-WebRequest -Uri "http://192.168.1.11:3001/health" -UseBasicParsing  
Invoke-WebRequest -Uri "http://192.168.1.11:3002/health" -UseBasicParsing

## API Test Commands
# Open locker 5
$body = '{"locker_id": 5, "staff_user": "test", "reason": "testing"}'
Invoke-RestMethod -Uri "http://192.168.1.11:3002/api/locker/open" -Method POST -ContentType "application/json" -Body $body

# Activate relay 3
$body = '{"relay_number": 3, "staff_user": "test", "reason": "testing"}'  
Invoke-RestMethod -Uri "http://192.168.1.11:3001/api/relay/activate" -Method POST -ContentType "application/json" -Body $body
