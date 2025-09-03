# 🚀 Hardware Configuration Wizard - Deployment Guide

## 📋 Quick Deployment Steps

### 1. Deploy to Raspberry Pi

**From Windows PC:**
```powershell
# Push changes (already done)
git push origin main

# SSH to Pi and update
ssh pi@pi-eform-locker
cd /home/pi/eform-locker
git pull origin main
```

### 2. Run Database Migrations

**On Raspberry Pi:**
```bash
# Apply new security migration
sqlite3 data/eform.db < migrations/021_wizard_security_audit.sql

# Verify migration
sqlite3 data/eform.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'wizard_%';"
```

Expected output:
```
wizard_security_audit
wizard_security_alerts
wizard_rate_limits
wizard_security_metrics
wizard_session_security
wizard_config_changes
wizard_emergency_stops
```

### 3. Build Services

**On Raspberry Pi:**
```bash
# Build all services with new wizard features
npm run build:gateway
npm run build:kiosk
npm run build:panel

# Verify builds
ls -la app/*/dist/
```

### 4. Restart Services

**Clean restart:**
```bash
# Stop all services
sudo killall node

# Clean start with new features
./scripts/start-all-clean.sh

# Verify services are running
ps aux | grep node
```

**Check service health:**
```bash
curl http://localhost:3000/health  # Gateway
curl http://localhost:3002/health  # Kiosk
curl http://localhost:3001/health  # Panel
```

### 5. Verify Wizard Access

**Test wizard endpoints:**
```bash
# Check wizard is accessible
curl http://192.168.1.8:3001/wizard/hardware-wizard

# Test security endpoints (requires auth)
curl http://192.168.1.8:3001/api/wizard/security/dashboard
```

## 🔧 Configuration Updates

### Update Panel Service

The panel service now includes:
- Hardware Configuration Wizard routes
- Security middleware and monitoring
- Performance tracking
- Real-time WebSocket updates

### Database Schema

New tables added:
- `wizard_security_audit` - All wizard operations
- `wizard_security_alerts` - Security alerts and incidents
- `wizard_rate_limits` - Rate limiting tracking
- `wizard_security_metrics` - Daily security metrics
- `wizard_session_security` - Session security tracking
- `wizard_config_changes` - Configuration change audit
- `wizard_emergency_stops` - Emergency stop events

## 🌐 Access URLs

Once deployed, access the wizard at:

**Main Wizard Interface:**
```
http://192.168.1.8:3001/wizard/hardware-wizard
```

**Security Dashboard:**
```
http://192.168.1.8:3001/api/wizard/security/dashboard
```

**Performance Dashboard:**
```
http://192.168.1.8:3001/wizard/performance-dashboard
```

**Hardware Dashboard:**
```
http://192.168.1.8:3001/hardware-dashboard
```

## 🔐 Initial Security Setup

### Create Admin User (if needed)

```bash
# SSH to Pi
ssh pi@pi-eform-locker

# Create admin user via API
curl -X POST http://localhost:3001/api/auth/users \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION_COOKIE" \
  -d '{
    "username": "wizard-admin",
    "password": "secure-password-123",
    "role": "admin"
  }'
```

### Test Security Features

```bash
# Test rate limiting
for i in {1..10}; do
  curl -X POST http://192.168.1.8:3001/api/wizard/detect-devices
  sleep 1
done

# Check security metrics
curl http://192.168.1.8:3001/api/wizard/security/metrics
```

## 🧪 Testing the Deployment

### 1. Hardware Detection Test

```bash
# Test device detection
curl -X POST http://192.168.1.8:3001/api/wizard/detect-devices \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION" \
  -d '{"port": "/dev/ttyUSB0", "startAddress": 1, "endAddress": 10}'
```

### 2. Security Test

```bash
# Test security monitoring
curl -X POST http://192.168.1.8:3001/api/wizard/security/test-alert \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION" \
  -d '{
    "type": "suspicious_activity",
    "severity": "medium",
    "message": "Test security alert"
  }'
```

### 3. Performance Test

```bash
# Check performance metrics
curl http://192.168.1.8:3001/api/wizard/performance/metrics \
  -H "Cookie: session=YOUR_SESSION"
```

## 🔍 Verification Checklist

After deployment, verify:

✅ **Services Running**
- [ ] Gateway service (port 3000)
- [ ] Kiosk service (port 3002)  
- [ ] Panel service (port 3001)

✅ **Database**
- [ ] Migration 021 applied
- [ ] Wizard tables created
- [ ] Triggers and indexes working

✅ **Wizard Access**
- [ ] Main wizard page loads
- [ ] Security dashboard accessible
- [ ] Performance monitoring active

✅ **Security Features**
- [ ] Authentication working
- [ ] Rate limiting active
- [ ] Audit logging functional
- [ ] Emergency stop available

✅ **Hardware Integration**
- [ ] Serial port accessible
- [ ] Modbus communication working
- [ ] Relay control functional

## 🚨 Troubleshooting

### Common Deployment Issues

**1. Migration Fails**
```bash
# Check database permissions
ls -la data/eform.db
sudo chown pi:pi data/eform.db

# Manually apply migration
sqlite3 data/eform.db < migrations/021_wizard_security_audit.sql
```

**2. Service Won't Start**
```bash
# Check logs
tail -f logs/panel.log

# Check port conflicts
sudo lsof -i :3001

# Restart with debug
DEBUG=* npm run start:panel
```

**3. Wizard Not Accessible**
```bash
# Check panel service routes
curl http://localhost:3001/health

# Verify build
ls -la app/panel/dist/

# Check permissions
sudo chmod +x app/panel/dist/index.js
```

**4. Security Features Not Working**
```bash
# Check database tables
sqlite3 data/eform.db ".tables" | grep wizard

# Test security service
node -e "
const { wizardSecurityService } = require('./shared/services/wizard-security-service');
console.log('Security service loaded:', !!wizardSecurityService);
"
```

## 📊 Monitoring After Deployment

### Log Monitoring

```bash
# Monitor all services
tail -f logs/*.log

# Monitor wizard-specific logs
tail -f logs/panel.log | grep -i wizard

# Monitor security events
tail -f logs/panel.log | grep -i "WIZARD AUDIT"
```

### Performance Monitoring

```bash
# Check system resources
htop

# Monitor database size
du -h data/eform.db

# Check service memory usage
ps aux | grep node | awk '{print $2, $4, $11}' | sort -k2 -nr
```

### Security Monitoring

```bash
# Check active alerts
curl http://192.168.1.8:3001/api/wizard/security/alerts

# Monitor audit log
curl http://192.168.1.8:3001/api/wizard/security/audit-logs?limit=10

# Check security metrics
curl http://192.168.1.8:3001/api/wizard/security/metrics
```

## 🎯 Next Steps

After successful deployment:

1. **Train Users**: Share the user guide with administrators
2. **Configure Hardware**: Run the wizard to set up relay cards
3. **Monitor Security**: Regularly check the security dashboard
4. **Performance Tuning**: Monitor and optimize based on usage
5. **Regular Maintenance**: Schedule periodic system checks

---

**🎉 Deployment Complete!** Your Hardware Configuration Wizard is now ready for use with enterprise-grade security and monitoring capabilities.