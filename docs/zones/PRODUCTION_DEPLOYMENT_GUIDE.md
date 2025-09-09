# Zone-Aware Locker System - Production Deployment Guide

## 🚀 Quick Start

This guide covers deploying the zone-aware locker management system in production environments. The system has been live tested and is production ready.

## 📋 Prerequisites

- Raspberry Pi 4 with eForm Locker System installed
- Multiple relay cards (minimum 2 for zone separation)
- SSH access to the Pi
- Git repository access

## 🔧 Deployment Steps

### 1. Deploy Zone-Aware Code

```bash
# SSH to your Pi
ssh pi@pi-eform-locker

# Navigate to project directory
cd /home/pi/eform-locker

# Switch to zones branch
git checkout feat/zones-mvp
git pull origin feat/zones-mvp

# Build services (if build scripts available)
npm run build:gateway 2>/dev/null || echo "Gateway build not available"
npm run build:kiosk 2>/dev/null || echo "Kiosk build not available"  
npm run build:panel 2>/dev/null || echo "Panel build not available"
```

### 2. Configure Zones

Edit your system configuration:

```bash
# Edit configuration file
nano config/system.json
```

**Example Zone Configuration**:
```json
{
  "features": {
    "zones_enabled": true
  },
  "zones": [
    {
      "id": "mens",
      "ranges": [[1, 32]],
      "relay_cards": [1, 2],
      "enabled": true
    },
    {
      "id": "womens", 
      "ranges": [[33, 64]],
      "relay_cards": [3, 4],
      "enabled": true
    }
  ],
  "hardware": {
    "relay_cards": [
      {
        "slave_address": 1,
        "channels": 16,
        "type": "waveshare_16ch",
        "description": "Mens Lockers 1-16",
        "enabled": true
      },
      {
        "slave_address": 2,
        "channels": 16,
        "type": "waveshare_16ch", 
        "description": "Mens Lockers 17-32",
        "enabled": true
      },
      {
        "slave_address": 3,
        "channels": 16,
        "type": "waveshare_16ch",
        "description": "Womens Lockers 33-48", 
        "enabled": true
      },
      {
        "slave_address": 4,
        "channels": 16,
        "type": "waveshare_16ch",
        "description": "Womens Lockers 49-64",
        "enabled": true
      }
    ]
  }
}
```

### 3. Start Services

```bash
# Clean start all services
./scripts/start-all-clean.sh

# Or start individually
npm run start:gateway &
npm run start:kiosk &
npm run start:panel &

# Wait for services to initialize
sleep 10
```

### 4. Verify Deployment

```bash
# Check service health
curl http://localhost:3000/health  # Gateway
curl http://localhost:3002/health  # Kiosk  
curl http://localhost:3001/health  # Panel

# Test zone filtering
curl "http://localhost:3002/api/lockers/available?kiosk_id=kiosk-1&zone=mens"
curl "http://localhost:3002/api/lockers/available?kiosk_id=kiosk-1&zone=womens"

# Verify database sync
sqlite3 data/eform.db "SELECT COUNT(*) FROM lockers;"
```

## 🖥️ Kiosk Screen Configuration

### Mens Locker Room Kiosk

**Configuration**:
```javascript
// In your kiosk UI configuration
const KIOSK_CONFIG = {
  zone: 'mens',
  apiBase: 'http://localhost:3002/api',
  kioskId: 'kiosk-1'
};

// API calls automatically filtered
const availableLockers = await fetch(
  `${KIOSK_CONFIG.apiBase}/lockers/available?kiosk_id=${KIOSK_CONFIG.kioskId}&zone=${KIOSK_CONFIG.zone}`
);
```

**Result**: Users only see lockers 1-32

### Womens Locker Room Kiosk

**Configuration**:
```javascript
// In your kiosk UI configuration
const KIOSK_CONFIG = {
  zone: 'womens',
  apiBase: 'http://localhost:3002/api',
  kioskId: 'kiosk-1'
};
```

**Result**: Users only see lockers 33-64 (or extended range if more cards added)

### Admin Interface

**Configuration**:
```javascript
// No zone restriction for admin
const ADMIN_CONFIG = {
  zone: null, // or omit zone parameter
  apiBase: 'http://localhost:3002/api',
  kioskId: 'kiosk-1'
};
```

**Result**: Admin sees all lockers

## 🔄 Automatic Zone Extension

### How It Works

When you add relay cards through the hardware configuration:

1. **Hardware Detection**: System detects new relay cards
2. **Gap Analysis**: Identifies uncovered locker ranges
3. **Automatic Extension**: Extends last enabled zone to cover new lockers
4. **Range Merging**: Merges adjacent ranges automatically
5. **Database Sync**: Creates new locker records
6. **Service Update**: All services recognize new configuration

### Adding Relay Cards

**Via Configuration File**:
```bash
# Edit config/system.json
nano config/system.json

# Add new relay card to hardware.relay_cards array
{
  "slave_address": 5,
  "channels": 16,
  "type": "waveshare_16ch",
  "description": "Additional Lockers 65-80",
  "enabled": true
}

# Restart services to trigger sync
./scripts/start-all-clean.sh
```

**Via Admin Panel** (if available):
1. Access admin panel: `http://your-pi-ip:3001/hardware`
2. Click "Add Relay Card"
3. Configure new card settings
4. Save configuration
5. Zone extension happens automatically

### Verification After Extension

```bash
# Check updated configuration
cat config/system.json | grep -A 20 "zones"

# Verify database updated
sqlite3 data/eform.db "SELECT COUNT(*) FROM lockers;"

# Test extended zone
curl "http://localhost:3002/api/lockers/available?kiosk_id=kiosk-1&zone=womens"
```

## 📊 Monitoring and Maintenance

### Health Checks

```bash
# Service health
curl http://localhost:3002/health

# Zone configuration status
curl "http://localhost:3002/api/lockers/available?kiosk_id=kiosk-1" | wc -l

# Database integrity
sqlite3 data/eform.db "PRAGMA integrity_check;"
```

### Log Monitoring

```bash
# Monitor zone operations
tail -f logs/*.log | grep -i "zone\|sync\|extension"

# Monitor configuration changes
tail -f logs/*.log | grep -i "config"

# Monitor errors
tail -f logs/*.log | grep -i "error\|failed"
```

### Performance Monitoring

```bash
# API response times
time curl -s "http://localhost:3002/api/lockers/available?kiosk_id=kiosk-1&zone=mens" > /dev/null

# Database query performance
sqlite3 data/eform.db ".timer on" "SELECT * FROM lockers WHERE id BETWEEN 1 AND 32;"

# Memory usage
free -h
```

## 🚨 Troubleshooting

### Common Issues

#### Zone Extension Not Working
```bash
# Check zones are enabled
grep -A 5 "zones_enabled" config/system.json

# Check for validation errors
tail -20 logs/*.log | grep -i "zone\|validation"

# Verify hardware configuration
grep -A 20 "relay_cards" config/system.json
```

#### API Returns Wrong Lockers
```bash
# Verify zone configuration
cat config/system.json | jq '.zones'

# Check database sync
sqlite3 data/eform.db "SELECT id, status FROM lockers ORDER BY id;"

# Test without zone filter
curl "http://localhost:3002/api/lockers/available?kiosk_id=kiosk-1"
```

#### Services Not Starting
```bash
# Check port conflicts
sudo netstat -tlnp | grep -E ':(3000|3001|3002)'

# Check for errors
tail -50 logs/*.log

# Kill conflicting processes
sudo pkill -f "node.*"
sleep 3
./scripts/start-all-clean.sh
```

### Recovery Procedures

#### Restore Previous Configuration
```bash
# If you have a backup
cp config/system.json.backup config/system.json
./scripts/start-all-clean.sh
```

#### Reset to Default Zones
```bash
# Edit config/system.json and set
{
  "features": {"zones_enabled": false}
}

# Restart services
./scripts/start-all-clean.sh
```

#### Database Reset (Last Resort)
```bash
# Backup current database
cp data/eform.db data/eform.db.backup

# Let services recreate database
rm data/eform.db
./scripts/start-all-clean.sh
```

## 🔒 Security Considerations

### Zone Access Control
- Users can only access lockers in their designated zone
- Invalid zone parameters return empty results (no error exposure)
- Admin interfaces should validate zone permissions

### API Security
```bash
# Consider adding authentication for zone-specific endpoints
# Example: JWT tokens with zone permissions
```

### Configuration Security
```bash
# Protect configuration file
chmod 600 config/system.json
chown pi:pi config/system.json
```

## 📈 Scaling and Future Expansion

### Adding More Zones

```json
{
  "zones": [
    {"id": "mens", "ranges": [[1, 32]], "relay_cards": [1, 2]},
    {"id": "womens", "ranges": [[33, 64]], "relay_cards": [3, 4]},
    {"id": "staff", "ranges": [[65, 80]], "relay_cards": [5]},
    {"id": "vip", "ranges": [[81, 96]], "relay_cards": [6]}
  ]
}
```

### Multi-Kiosk Deployment
- Each kiosk can have different zone configurations
- Centralized management through admin panel
- Zone-specific analytics and reporting

### Performance Optimization
- Database indexing on zone-related queries
- Caching of zone configuration
- Load balancing for multiple kiosks

## 📞 Support

### Getting Help
1. Check logs: `tail -f logs/*.log`
2. Verify configuration: `cat config/system.json | jq '.zones'`
3. Test API endpoints manually
4. Check database integrity

### Reporting Issues
Include in your report:
- Current zone configuration
- Error logs from the last 24 hours
- API test results
- Database locker count

---

**Document Version**: 1.0  
**Last Updated**: September 9, 2025  
**Tested Environment**: Raspberry Pi 4 with 5 relay cards  
**Status**: Production Ready ✅