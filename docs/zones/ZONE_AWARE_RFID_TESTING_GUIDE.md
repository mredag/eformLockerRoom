# Zone-Aware RFID Testing Guide

## Overview

This guide provides comprehensive testing instructions for the **Zone-Aware RFID User Interface** (Task 9) implementation. The system now shows only zone-appropriate lockers when users scan their RFID cards.

## 🚀 Deployment Instructions

### 1. Deploy to Raspberry Pi

```bash
ssh pi@pi-eform-locker
cd /home/pi/eform-locker
git pull origin feat/zones-mvp
npm run build:kiosk
```

### 2. Configure Zone for Kiosk

**For Mens Zone Kiosk:**
```bash
echo "KIOSK_ZONE=mens" >> .env
```

**For Womens Zone Kiosk:**
```bash
echo "KIOSK_ZONE=womens" >> .env
```

**For Testing Both Zones (Optional):**
```bash
# Leave KIOSK_ZONE unset and use URL parameters
```

### 3. Restart Services

```bash
sudo killall node
./scripts/start-all-clean.sh
```

## 🧪 Testing Methods

### Method 1: Automated Test Suite

```bash
# Run comprehensive zone-aware RFID tests
node scripts/testing/test-zone-aware-rfid.js
```

**Expected Output:**
```
🧪 Testing Health Endpoint Zone Information
   Status: healthy
   Kiosk Zone: mens
   Zone Info:
     Zone ID: mens
     Enabled: true
     Ranges: 1-32
     Relay Cards: 1, 2
   ✅ Zone information included in health response

🧪 Testing Zone-Aware Locker Availability
   Mens zone lockers: ✅ Returned 30 lockers
   ✅ All lockers in expected range (1-32)
   📋 Sample locker IDs: 2, 3, 4, 5, 6
```

### Method 2: Manual RFID Card Testing

#### **Step 1: Verify Zone Configuration**

```bash
curl http://192.168.1.11:3002/health | jq '.kiosk_zone'
```

**Expected Results:**
- **Mens Zone**: `"mens"`
- **Womens Zone**: `"womens"`
- **No Zone**: `null`

#### **Step 2: Test RFID Card Scanning**

1. **Access Kiosk Interface**: Navigate to `http://192.168.1.11:3002`
2. **Verify Zone Indicator**: Look for zone indicator in top-right corner
3. **Scan RFID Card**: Use your RFID card (e.g., `0006851540`)
4. **Verify Zone-Filtered Lockers**: Check that only appropriate lockers are shown

**Expected Behavior by Zone:**

| Zone Configuration | RFID Card Scan Result | Lockers Shown |
|-------------------|----------------------|---------------|
| `KIOSK_ZONE=mens` | Shows mens lockers only | 2-32 (30 lockers) |
| `KIOSK_ZONE=womens` | Shows womens lockers only | 33-80 (48 lockers) |
| No zone configured | Shows all available lockers | 2-80 (78 lockers) |

### Method 3: URL Parameter Testing

Test zone override using URL parameters:

```bash
# Force mens zone
http://192.168.1.11:3002?zone=mens

# Force womens zone  
http://192.168.1.11:3002?zone=womens

# Invalid zone (should show all lockers)
http://192.168.1.11:3002?zone=invalid
```

### Method 4: Browser Console Testing

Open browser developer tools and test API calls:

```javascript
// Test zone-aware API calls
async function testZoneAPI() {
    // Test mens zone
    const mensResponse = await fetch('/api/lockers/available?kioskId=kiosk-1&zone=mens');
    const mensLockers = await mensResponse.json();
    console.log('Mens lockers:', mensLockers.length, mensLockers.map(l => l.id));
    
    // Test womens zone
    const womensResponse = await fetch('/api/lockers/available?kioskId=kiosk-1&zone=womens');
    const womensLockers = await womensResponse.json();
    console.log('Womens lockers:', womensLockers.length, womensLockers.map(l => l.id));
    
    // Test invalid zone (should return 400)
    const invalidResponse = await fetch('/api/lockers/available?kioskId=kiosk-1&zone=invalid');
    console.log('Invalid zone status:', invalidResponse.status);
    const invalidData = await invalidResponse.json();
    console.log('Invalid zone response:', invalidData);
}

testZoneAPI();
```

## 🎯 Expected Test Results

### Zone Configuration Validation

**✅ Successful Zone Configuration:**
```json
{
  "status": "healthy",
  "kiosk_zone": "mens",
  "zone_info": {
    "zone_id": "mens",
    "enabled": true,
    "ranges": [[1, 32]],
    "relay_cards": [1, 2]
  }
}
```

**⚠️ Invalid Zone Configuration:**
```
⚠️ Invalid KIOSK_ZONE: 'invalid' not found or disabled
Available zones: mens, womens
⚠️ Falling back to show all available lockers
```

### RFID Card Scan Results

**✅ Mens Zone Kiosk:**
- **Zone Indicator**: "Erkek Dolap Sistemi" in top-right corner
- **Available Lockers**: Only lockers 2-32 shown (30 lockers)
- **Error Messages**: "Erkek bölgesi dolapları dolu" if no lockers available
- **Page Title**: "Erkek Dolap Sistemi - eForm Locker"

**✅ Womens Zone Kiosk:**
- **Zone Indicator**: "Kadın Dolap Sistemi" in top-right corner
- **Available Lockers**: Only lockers 33-80 shown (48 lockers)
- **Error Messages**: "Kadın bölgesi dolapları dolu" if no lockers available
- **Page Title**: "Kadın Dolap Sistemi - eForm Locker"

**✅ No Zone Configuration:**
- **Zone Indicator**: Not shown
- **Available Lockers**: All available lockers shown (78 total)
- **Error Messages**: Standard messages without zone context
- **Page Title**: "eForm Locker"

### API Response Validation

**✅ Zone-Filtered API Responses:**

```javascript
// GET /api/lockers/available?zone=mens
[
  {"id": 2, "status": "Free", "is_vip": false},
  {"id": 3, "status": "Free", "is_vip": false},
  // ... only lockers 1-32
]

// GET /api/lockers/available?zone=womens  
[
  {"id": 33, "status": "Free", "is_vip": false},
  {"id": 34, "status": "Free", "is_vip": false},
  // ... only lockers 33-80
]
```

**✅ Error Handling:**

```javascript
// GET /api/lockers/available?zone=invalid (400 Bad Request)
{
  "success": false,
  "error": "Unknown or disabled zone: 'invalid'",
  "error_code": "INVALID_ZONE",
  "trace_id": "trace-abc123",
  "zone_context": {
    "requested_zone": "invalid",
    "available_zones": ["mens", "womens"]
  }
}
```

## 🔍 Troubleshooting

### Issue: Zone Not Detected

**Symptoms:**
- Health endpoint shows `"kiosk_zone": null`
- All lockers shown instead of zone-filtered

**Solutions:**
1. **Check Environment Variable:**
   ```bash
   echo $KIOSK_ZONE
   ```

2. **Verify .env File:**
   ```bash
   cat .env | grep KIOSK_ZONE
   ```

3. **Check Service Logs:**
   ```bash
   tail -f logs/kiosk.log | grep -i zone
   ```

4. **Restart Service:**
   ```bash
   sudo killall node
   ./scripts/start-all-clean.sh
   ```

### Issue: Invalid Zone Configuration

**Symptoms:**
- Warning in logs: "Invalid KIOSK_ZONE"
- Fallback to all lockers

**Solutions:**
1. **Check Available Zones:**
   ```bash
   cat config/system.json | jq '.zones[].id'
   ```

2. **Verify Zone is Enabled:**
   ```bash
   cat config/system.json | jq '.zones[] | select(.id=="mens") | .enabled'
   ```

3. **Use Valid Zone Names:**
   - Use `mens` not `men` or `male`
   - Use `womens` not `women` or `female`

### Issue: UI Not Showing Zone Indicator

**Symptoms:**
- No zone indicator in top-right corner
- Page title not updated

**Solutions:**
1. **Clear Browser Cache:**
   ```bash
   # Hard refresh: Ctrl+F5 or Ctrl+Shift+R
   ```

2. **Check Browser Console:**
   ```javascript
   // Look for zone detection logs
   console.log('Zone detected:', window.kioskApp?.kioskZone);
   ```

3. **Force Zone via URL:**
   ```
   http://192.168.1.11:3002?zone=mens
   ```

### Issue: RFID Card Shows Wrong Lockers

**Symptoms:**
- Mens zone shows womens lockers or vice versa
- All lockers shown despite zone configuration

**Solutions:**
1. **Verify API Calls:**
   ```javascript
   // Check network tab in browser dev tools
   // Look for: /api/lockers/available?kioskId=kiosk-1&zone=mens
   ```

2. **Test API Directly:**
   ```bash
   curl "http://192.168.1.11:3002/api/lockers/available?kioskId=kiosk-1&zone=mens"
   ```

3. **Check Zone Validation:**
   ```bash
   # Look for zone validation logs
   tail -f logs/kiosk.log | grep "Zone-aware operation"
   ```

## 📊 Performance Verification

### Response Time Testing

```bash
# Test API response times
time curl "http://192.168.1.11:3002/api/lockers/available?zone=mens"
time curl "http://192.168.1.11:3002/api/lockers/available?zone=womens"
```

**Expected:** < 200ms response time

### Memory Usage Testing

```bash
# Monitor memory usage during zone operations
top -p $(pgrep -f "node.*kiosk")
```

**Expected:** No significant memory increase with zone operations

### Concurrent User Testing

```bash
# Test multiple simultaneous zone requests
for i in {1..10}; do
  curl "http://192.168.1.11:3002/api/lockers/available?zone=mens" &
done
wait
```

**Expected:** All requests succeed without errors

## ✅ Test Completion Checklist

### Basic Functionality
- [ ] Zone configuration validates correctly
- [ ] Health endpoint includes zone information
- [ ] RFID card scan shows zone-filtered lockers
- [ ] Zone indicator displays in UI
- [ ] Error messages include zone context

### Zone-Specific Testing
- [ ] Mens zone shows only lockers 1-32
- [ ] Womens zone shows only lockers 33-80
- [ ] Invalid zone returns 400 error with trace ID
- [ ] No zone configuration shows all lockers

### UI/UX Testing
- [ ] Zone indicator appears in top-right corner
- [ ] Page title includes zone name
- [ ] Error messages are zone-aware
- [ ] URL parameter override works
- [ ] Backward compatibility maintained

### API Testing
- [ ] Zone parameter included in API calls
- [ ] Zone validation middleware working
- [ ] Proper HTTP status codes (200, 400, 422)
- [ ] Trace IDs generated for errors
- [ ] Zone context in all responses

### Performance Testing
- [ ] API response times < 200ms
- [ ] No memory leaks with zone operations
- [ ] Concurrent requests handled correctly
- [ ] Browser performance acceptable

### Production Readiness
- [ ] Service starts with zone configuration
- [ ] Graceful fallback for invalid zones
- [ ] Comprehensive error logging
- [ ] Zone information in health checks
- [ ] Documentation complete

## 🎉 Success Criteria

The zone-aware RFID implementation is successful when:

1. **Zone Configuration**: Kiosk correctly detects and validates its assigned zone
2. **RFID Filtering**: Card scans show only lockers from the kiosk's zone
3. **UI Feedback**: Clear zone indicators and zone-aware error messages
4. **API Integration**: All API calls include zone parameters and validation
5. **Backward Compatibility**: System works without zone configuration
6. **Error Handling**: Proper error codes and trace IDs for debugging
7. **Performance**: No degradation in response times or memory usage

When all criteria are met, users will have a clear, zone-appropriate locker selection experience that eliminates confusion and improves usability.

## 📋 Next Steps

After successful testing:

1. **Deploy to Production**: Apply zone configuration to production kiosks
2. **User Training**: Brief staff on zone-specific operation
3. **Monitoring**: Set up alerts for zone configuration issues
4. **Documentation**: Update user manuals with zone information
5. **Maintenance**: Regular validation of zone configurations

The zone-aware RFID system is now ready for production deployment with comprehensive testing validation.