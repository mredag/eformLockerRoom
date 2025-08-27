#!/bin/bash

echo "=== Testing Locker Assignment Flow ==="

# Step 1: Get available lockers and session ID
echo "1. Getting available lockers..."
RESPONSE=$(curl -s 'http://localhost:3002/api/lockers/available?kioskId=kiosk-1')
echo "Response: $RESPONSE"

# Extract session ID
SESSION_ID=$(echo "$RESPONSE" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
echo "Extracted Session ID: $SESSION_ID"

if [ -z "$SESSION_ID" ]; then
    echo "ERROR: No session ID found!"
    exit 1
fi

# Step 2: Test locker assignment
echo ""
echo "2. Testing locker assignment with session ID: $SESSION_ID"

# Create JSON payload
cat > /tmp/assignment_test.json << EOF
{
  "locker_id": 5,
  "kiosk_id": "kiosk-1",
  "session_id": "$SESSION_ID"
}
EOF

echo "JSON payload:"
cat /tmp/assignment_test.json

echo ""
echo "3. Making assignment request..."
ASSIGNMENT_RESPONSE=$(curl -s -X POST 'http://localhost:3002/api/lockers/select' \
  -H 'Content-Type: application/json' \
  -d @/tmp/assignment_test.json)

echo "Assignment Response: $ASSIGNMENT_RESPONSE"

# Clean up
rm -f /tmp/assignment_test.json

echo ""
echo "=== Test Complete ==="