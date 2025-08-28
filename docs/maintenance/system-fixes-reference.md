# System Maintenance & Fixes Reference

## Overview

This document provides a comprehensive reference for common system issues, their resolutions, and maintenance procedures for the eForm Locker System. It consolidates knowledge from various system fixes and incidents to help with troubleshooting and prevention.

## Common System Issues

### 1. WebSocket Connection Problems

**Symptoms:**
- Continuous WebSocket connection errors in browser console
- No real-time updates in admin panel
- Error messages: `WebSocket connection to 'ws://192.168.1.8:8080/' failed`

**Root Cause:**
Panel service not initializing WebSocket server on port 8080, while frontend attempts to connect for real-time updates.

**Resolution:**
1. **Initialize WebSocket Server** in Panel service:
   ```typescript
   // app/panel/src/index.ts
   import { webSocketService } from '../../../shared/services/websocket-service';
   
   // Initialize WebSocket server
   const wsPort = process.env.WEBSOCKET_PORT || 8080;
   webSocketService.initialize(wsPort);
   ```

2. **Add Real-time Broadcasting** for locker operations:
   ```typescript
   // app/panel/src/routes/locker-routes.ts
   import { webSocketService } from '../../../../shared/services/websocket-service';
   
   function broadcastLockerUpdate(lockerId: number, status: string) {
     webSocketService.broadcast('locker_update', { lockerId, status });
   }
   ```

3. **Configure Dynamic WebSocket Port**:
   ```javascript
   // Frontend configuration endpoint
   app.get('/api/config', (req, res) => {
     res.json({ websocketPort: process.env.WEBSOCKET_PORT || 8080 });
   });
   ```

**Prevention:**
- Monitor WebSocket connection health
- Implement automatic reconnection with exponential backoff
- Use environment variables for port configuration

### 2. Status Display Inconsistencies

**Symptoms:**
- Locker cards showing "Açılıyor" (Opening) status without proper color coding
- Missing visual indicators for different locker states
- Inconsistent status chip colors

**Root Cause:**
Missing CSS classes for "Opening" status and incomplete status translation mapping.

**Resolution:**
1. **Add Missing CSS Classes**:
   ```css
   /* Opening status styling */
   .locker-card.opening {
     border-left: 4px solid #007bff;
   }
   
   .state-aciliyor {
     background-color: #cce7ff;
     color: #004085;
     border: 1px solid #007bff;
   }
   ```

2. **Fix JavaScript Status Updates**:
   ```javascript
   // Remove duplicate StatusTranslationService calls
   // Ensure proper CSS class updates for real-time changes
   function updateLockerCard(lockerId, status) {
     const card = document.querySelector(`[data-locker-id="${lockerId}"]`);
     card.className = `locker-card ${status.toLowerCase()}`;
   }
   ```

3. **Verify Status Translation**:
   ```javascript
   const statusTranslations = {
     'Free': 'Boş',
     'Owned': 'Sahipli', 
     'Opening': 'Açılıyor',
     'Blocked': 'Engelli',
     'Error': 'Hata'
   };
   ```

**Prevention:**
- Maintain consistent status mapping across frontend and backend
- Test all status transitions visually
- Use automated visual regression testing

### 3. UI Rendering Issues

**Symptoms:**
- Display names showing generic "Dolap 1" instead of custom names
- Incorrect locker information after session operations
- Lost context after user interactions

**Root Cause:**
Client-side code losing custom display names after session operations, using stale cached data instead of server responses.

**Resolution:**
1. **Use Server-Provided Names**:
   ```javascript
   // Before (using cached data)
   const lockerName = this.getLockerDisplayName(lockerId);
   this.showLoadingState(`${lockerName} açıldı - Eşyalarınızı alın`);
   
   // After (using server response)
   this.showLoadingState(result.message.replace('ve serbest bırakıldı', '- Eşyalarınızı alın'));
   ```

2. **Eliminate Client-Side Caching Issues**:
   - Always use server responses as single source of truth
   - Clear stale session data appropriately
   - Validate data freshness before display

**Prevention:**
- Implement server-side rendering for critical display data
- Use consistent data flow patterns
- Add data validation and freshness checks

### 4. Database Migration Conflicts

**Symptoms:**
- Services fail to start with "SQLITE_ERROR: no such table" errors
- Migration errors about duplicate column names
- Inconsistent database schema state

**Root Cause:**
Duplicate migrations (015/016) conflicting with existing migrations (009/010) that already applied the same changes.

**Resolution:**
1. **Automatic Fix Script**:
   ```bash
   # Run the automated fix
   npm run migrate:fix-duplicates
   
   # Or manually
   node scripts/fix-duplicate-migrations.js
   ```

2. **Manual Database Cleanup**:
   ```sql
   -- Remove duplicate migration entries
   DELETE FROM migrations WHERE version IN ('015', '016');
   
   -- Verify remaining migrations
   SELECT * FROM migrations ORDER BY version;
   ```

3. **Verification**:
   ```bash
   # Check migration status
   npm run migrate:status
   
   # Test service startup
   npm run start
   ```

**Prevention:**
- Maintain sequential migration numbering
- Test migrations on clean database instances
- Use migration validation scripts before deployment

## Resolution Procedures

### WebSocket Connection Recovery

1. **Immediate Fix**:
   ```bash
   # Restart Panel service
   sudo pkill -f "node.*panel"
   npm run start:panel &
   
   # Verify WebSocket server
   curl -I http://192.168.1.8:8080
   ```

2. **Verification**:
   ```bash
   # Test WebSocket connection
   node scripts/test-websocket-connection.js
   
   # Check browser console for errors
   # Open: http://192.168.1.8:3001/lockers
   ```

3. **Long-term Monitoring**:
   ```bash
   # Monitor WebSocket health
   tail -f logs/panel.log | grep -i websocket
   ```

### Status Display Recovery

1. **CSS and JavaScript Fix**:
   ```bash
   # Rebuild frontend assets
   npm run build:panel
   
   # Clear browser cache
   # Ctrl+F5 or Cmd+Shift+R
   ```

2. **Database Status Verification**:
   ```sql
   -- Check locker statuses
   SELECT id, status, display_name FROM lockers 
   WHERE status IN ('Opening', 'Error', 'Blocked');
   ```

3. **Visual Verification**:
   - Open admin panel: `http://192.168.1.8:3001/lockers`
   - Verify color coding for all status types
   - Test status transitions with real operations

### Session Management Recovery

1. **Session Cleanup**:
   ```bash
   # Restart Kiosk service to clear sessions
   sudo pkill -f "node.*kiosk"
   npm run start:kiosk &
   ```

2. **Test Assignment Flow**:
   ```bash
   # Test manual locker assignment
   node scripts/test-locker-assignment.js
   ```

3. **Monitor Session Health**:
   ```bash
   # Watch session operations
   tail -f logs/kiosk.log | grep -i session
   ```

## Deployment Issues

### Pi-Specific Problems

**Common Issues:**
- Service startup failures after deployment
- Port permission problems
- Environment variable loading issues

**Solutions:**

1. **Service Startup Order**:
   ```bash
   # Proper startup sequence
   ./scripts/start-all-clean.sh
   
   # Manual startup with proper order
   npm run start:gateway &
   sleep 2
   npm run start:kiosk &
   sleep 2
   npm run start:panel &
   ```

2. **Port Permissions**:
   ```bash
   # Fix USB port permissions
   sudo chmod 666 /dev/ttyUSB0
   
   # Add user to dialout group
   sudo usermod -a -G dialout pi
   ```

3. **Environment Variables**:
   ```bash
   # Verify .env file loading
   node -e "require('dotenv').config(); console.log(process.env.MAKSI_ENABLED);"
   
   # Check service-specific environment
   curl http://192.168.1.8:3001/api/config
   ```

### Service Startup Issues

**Diagnosis Steps:**

1. **Check Service Health**:
   ```bash
   # Test all service endpoints
   curl http://192.168.1.8:3000/health  # Gateway
   curl http://192.168.1.8:3001/health  # Panel
   curl http://192.168.1.8:3002/health  # Kiosk
   ```

2. **Review Logs**:
   ```bash
   # Check for startup errors
   tail -20 logs/gateway.log
   tail -20 logs/panel.log
   tail -20 logs/kiosk.log
   ```

3. **Process Verification**:
   ```bash
   # Check running processes
   ps aux | grep node
   
   # Check port usage
   netstat -tlnp | grep -E "300[0-2]"
   ```

### Configuration Conflicts

**Common Conflicts:**
- Port binding conflicts
- Database path issues
- Hardware access conflicts

**Resolution:**

1. **Port Conflicts**:
   ```bash
   # Kill conflicting processes
   sudo killall node
   
   # Wait for cleanup
   sleep 5
   
   # Restart with clean state
   ./scripts/start-all-clean.sh
   ```

2. **Database Issues**:
   ```bash
   # Fix database permissions
   chmod 664 data/eform.db
   
   # Verify database integrity
   sqlite3 data/eform.db "PRAGMA integrity_check;"
   ```

3. **Hardware Access**:
   ```bash
   # Check USB device availability
   ls -la /dev/ttyUSB*
   
   # Test hardware access
   node scripts/test-basic-relay-control.js
   ```

## Monitoring & Prevention

### Health Check Procedures

1. **Automated Health Monitoring**:
   ```bash
   # Run comprehensive health check
   ./scripts/health-check-kiosk.sh
   
   # Monitor service status
   watch -n 30 'curl -s http://192.168.1.8:3002/health | jq .'
   ```

2. **Performance Monitoring**:
   ```bash
   # Monitor response times
   curl -w "@curl-format.txt" -o /dev/null -s http://192.168.1.8:3001/lockers
   
   # Check resource usage
   top -p $(pgrep -f "node.*kiosk")
   ```

3. **Log Analysis**:
   ```bash
   # Monitor error patterns
   tail -f logs/*.log | grep -i "error\|failed\|timeout"
   
   # Track performance metrics
   grep -E "took [0-9]+ms" logs/*.log | tail -20
   ```

### Early Warning Signs

**Performance Degradation:**
- Response times > 2 seconds
- Memory usage > 80%
- Frequent connection timeouts

**System Issues:**
- Repeated WebSocket reconnections
- Session creation failures
- Hardware communication errors

**Monitoring Commands:**
```bash
# System resource monitoring
free -h && df -h && uptime

# Service-specific monitoring
curl -s http://192.168.1.8:3002/health | jq '.status'

# Hardware status
node scripts/test-basic-relay-control.js
```

### Maintenance Schedules

**Daily:**
- Check service health endpoints
- Review error logs for patterns
- Verify hardware connectivity

**Weekly:**
- Restart services for memory cleanup
- Check database integrity
- Update system packages

**Monthly:**
- Review performance metrics
- Update documentation
- Test backup/restore procedures

## Emergency Response Procedures

### System Down Recovery

1. **Immediate Response**:
   ```bash
   # Emergency service restart
   sudo killall node
   ./scripts/start-all-clean.sh
   
   # Verify basic functionality
   curl http://192.168.1.8:3002/health
   ```

2. **Hardware Emergency**:
   ```bash
   # Emergency relay reset
   node scripts/emergency-relay-reset.js
   
   # Close all relays
   node scripts/emergency-close-relay.js
   ```

3. **Database Recovery**:
   ```bash
   # Backup current state
   cp data/eform.db data/eform.db.backup
   
   # Run integrity check
   sqlite3 data/eform.db "PRAGMA integrity_check;"
   ```

### Rollback Procedures

1. **Code Rollback**:
   ```bash
   # Revert to previous version
   git log --oneline -10
   git revert <commit-hash>
   npm run build:all
   ```

2. **Database Rollback**:
   ```bash
   # Restore from backup
   cp data/eform.db.backup data/eform.db
   
   # Verify restoration
   sqlite3 data/eform.db "SELECT COUNT(*) FROM lockers;"
   ```

3. **Service Recovery**:
   ```bash
   # Clean restart after rollback
   ./scripts/start-all-clean.sh
   
   # Verify functionality
   node scripts/test-basic-relay-control.js
   ```

## Success Metrics

### System Health Indicators

- **Service Uptime**: > 99.5%
- **Response Times**: < 500ms average
- **Error Rate**: < 1% of requests
- **Hardware Reliability**: > 99% relay activation success

### Performance Benchmarks

- **WebSocket Connections**: Stable, no reconnection loops
- **Status Updates**: Real-time, < 100ms propagation
- **Session Management**: 100% assignment success rate
- **Database Operations**: < 50ms query time

### User Experience Metrics

- **Locker Assignment**: < 3 seconds end-to-end
- **Status Display**: Accurate, real-time updates
- **Error Messages**: Clear, actionable Turkish messages
- **System Availability**: 24/7 operational

---

## Conclusion

This reference guide consolidates the most common system issues and their proven solutions. Regular monitoring, preventive maintenance, and following these procedures will ensure reliable system operation.

**Key Principles:**
1. **Monitor Proactively**: Use health checks and log analysis
2. **Fix Systematically**: Follow documented procedures
3. **Prevent Recurrence**: Implement monitoring and validation
4. **Document Everything**: Update procedures based on new issues

**Emergency Contacts:**
- System Access: `ssh pi@pi-eform-locker`
- Health Monitoring: `http://192.168.1.8:3002/health`
- Emergency Scripts: `./scripts/emergency-*.js`

---

**Last Updated**: August 2025  
**System Version**: Production Ready  
**Status**: All Known Issues Resolved ✅