# 📋 Eform Locker System - Operational Runbook

**Status:** ✅ Production Ready for Turkey Deployment  
**Last Updated:** January 2025  
**Language:** Turkish UI with English Operations Manual  
**Target Environment:** Raspberry Pi with Waveshare Hardware

## Table of Contents
1. [Emergency Opening Procedures](#emergency-opening-procedures)
2. [Failure Classifications](#failure-classifications)
3. [Spare Parts List](#spare-parts-list)
4. [Troubleshooting Guide](#troubleshooting-guide)
5. [Maintenance Procedures](#maintenance-procedures)
6. [System Recovery Procedures](#system-recovery-procedures)
7. [Contact Information](#contact-information)

## Emergency Opening Procedures

### 1. Power Outage Emergency Opening

**Immediate Actions (0-5 minutes):**
1. Verify UPS status and remaining battery time
2. Access emergency master key cabinet
3. Announce to facility users about temporary service interruption
4. Begin manual opening of critical lockers (medical items, valuables)

**Manual Opening Process:**
1. Use physical master key for mechanical override
2. Document each opened locker:
   - Locker ID and location
   - Time opened
   - Contents (if any)
   - User identification (if present)
3. Place "OUT OF ORDER" signs on opened lockers

**System Recovery Actions:**
1. Once power is restored, restart all services in order:
   ```bash
   sudo systemctl start eform-gateway
   sudo systemctl start eform-kiosk
   sudo systemctl start eform-panel
   sudo systemctl start eform-agent
   ```
2. Verify system health: `curl http://localhost:3000/health`
3. Check for restart events in logs: `journalctl -u eform-gateway -n 50`
4. Update locker status in panel to reflect manual openings

### 2. System Failure Emergency Opening

**When Software/Hardware Fails:**
1. Access staff panel emergency interface
2. Use bulk opening function with reason "EMERGENCY"
3. If panel is inaccessible, use kiosk master PIN
4. If all electronic systems fail, use physical master keys

**Emergency Panel Access:**
- URL: `http://[panel-ip]:3003/emergency` (Updated port)
- Emergency admin credentials stored in secure cabinet
- Bypass normal authentication in emergency mode
- **Interface Language:** Turkish (Türkçe)

**Kiosk Master PIN Emergency:**
1. Press and hold Master button for 10 seconds
2. Enter emergency PIN: `*911*` (bypasses normal PIN)
3. Select "EMERGENCY OPEN ALL"
4. Confirm with facility manager authorization

### 3. Fire/Evacuation Emergency

**Immediate Actions:**
1. Activate emergency evacuation protocol
2. Use fire panel integration to open ALL lockers automatically
3. Announce: "All lockers are now open for evacuation"
4. Ensure all exit routes are clear

**Fire Panel Integration Commands:**
```bash
# Emergency open all (fire alarm triggered)
curl -X POST http://localhost:3000/emergency/fire-open-all \
  -H "Authorization: Bearer [fire-system-token]"
```

### 4. Medical Emergency Access

**For Medical Emergencies:**
1. Use medical override PIN: `*MED*[locker-number]*`
2. Document medical access in emergency log
3. Notify facility management immediately
4. Preserve any medical items found

## Failure Classifications

### Critical Failures (Immediate Response Required)

**C1: Complete System Failure**
- Symptoms: No kiosks responding, panel inaccessible
- Impact: All electronic access lost
- Response Time: < 5 minutes
- Actions:
  1. Switch to manual operations
  2. Deploy emergency staff to all kiosk locations
  3. Begin systematic manual opening
  4. Contact technical support immediately

**C2: Database Corruption**
- Symptoms: Data inconsistencies, locker status errors
- Impact: Incorrect locker assignments
- Response Time: < 15 minutes
- Actions:
  1. Stop all services immediately
  2. Restore from latest backup
  3. Verify data integrity
  4. Resume operations with verification

**C3: Security Breach**
- Symptoms: Unauthorized access, suspicious activities
- Impact: System security compromised
- Response Time: < 2 minutes
- Actions:
  1. Isolate affected systems
  2. Change all administrative passwords
  3. Review access logs
  4. Contact security team

### High Priority Failures (Response within 30 minutes)

**H1: Kiosk Hardware Failure**
- Symptoms: RFID reader not working, display issues
- Impact: Single kiosk unavailable
- Actions:
  1. Switch to backup kiosk if available
  2. Post "OUT OF ORDER" notice
  3. Direct users to alternative kiosks
  4. Schedule hardware replacement

**H2: Network Connectivity Issues**
- Symptoms: Kiosks offline, panel sync issues
- Impact: Multi-room coordination lost
- Actions:
  1. Verify network infrastructure
  2. Switch to local operation mode
  3. Manual coordination between rooms
  4. Contact network administrator

**H3: Modbus Communication Failure**
- Symptoms: Lockers not opening, relay errors
- Impact: Physical locker access lost
- Actions:
  1. Check RS485 connections and termination
  2. Verify power supply to relay boards
  3. Test with diagnostic tools
  4. Replace faulty relay boards if needed

### Medium Priority Failures (Response within 2 hours)

**M1: Performance Degradation**
- Symptoms: Slow response times, timeouts
- Impact: User experience degraded
- Actions:
  1. Monitor system resources
  2. Clear logs if disk space low
  3. Restart services if memory issues
  4. Optimize database if needed

**M2: VIP Contract Issues**
- Symptoms: VIP access problems, contract errors
- Impact: Premium service affected
- Actions:
  1. Verify VIP contract status
  2. Manual override for affected VIP users
  3. Update contract data
  4. Notify VIP customers of resolution

### Low Priority Issues (Response within 24 hours)

**L1: Cosmetic Issues**
- Symptoms: UI display problems, minor bugs
- Impact: Minimal operational impact
- Actions:
  1. Document issue
  2. Schedule maintenance window
  3. Apply fixes during low usage periods

**L2: Reporting Issues**
- Symptoms: CSV export problems, log issues
- Impact: Administrative functions affected
- Actions:
  1. Manual data extraction if needed
  2. Fix reporting functions
  3. Verify data integrity

## Spare Parts List

### Critical Spare Parts (Keep On-Site)

**Electronic Components:**
- RFID Readers (2 units) - Model: [Specific Model]
  - Part Number: RFID-001
  - Supplier: [Supplier Name]
  - Cost: $150 each
  - Location: Maintenance Room Cabinet A

- Relay Boards (3 units) - 16-channel Modbus
  - Part Number: RELAY-16CH-001
  - Supplier: [Supplier Name]
  - Cost: $200 each
  - Location: Maintenance Room Cabinet A

- RS485 Converters (2 units)
  - Part Number: RS485-USB-001
  - Supplier: [Supplier Name]
  - Cost: $50 each
  - Location: Maintenance Room Cabinet B

**Power Supplies:**
- 24V DC Power Supply (2 units) - 5A
  - Part Number: PSU-24V-5A
  - Supplier: [Supplier Name]
  - Cost: $80 each
  - Location: Maintenance Room Cabinet B

- UPS Battery (1 unit) - 12V 7Ah
  - Part Number: UPS-BAT-12V7AH
  - Supplier: [Supplier Name]
  - Cost: $45 each
  - Location: Maintenance Room Cabinet C

**Cables and Connectors:**
- RS485 Cable (50m roll)
  - Part Number: CABLE-RS485-50M
  - Supplier: [Supplier Name]
  - Cost: $75 per roll
  - Location: Maintenance Room Cabinet C

- USB Cables (5 units) - Type A to B
  - Part Number: USB-AB-2M
  - Supplier: [Supplier Name]
  - Cost: $15 each
  - Location: Maintenance Room Cabinet C

### Recommended Spare Parts (Order as Needed)

**Mechanical Components:**
- Locker Locks (10 units) - Electronic Strike
  - Part Number: LOCK-STRIKE-001
  - Supplier: [Supplier Name]
  - Cost: $35 each
  - Lead Time: 5-7 days

- Lock Mounting Hardware Sets (10 units)
  - Part Number: MOUNT-KIT-001
  - Supplier: [Supplier Name]
  - Cost: $12 each
  - Lead Time: 3-5 days

**Computing Hardware:**
- Raspberry Pi 4 (1 unit) - Kiosk Controller
  - Part Number: RPI4-4GB
  - Supplier: [Supplier Name]
  - Cost: $75 each
  - Lead Time: 2-3 days

- MicroSD Cards (3 units) - 32GB Class 10
  - Part Number: SD-32GB-C10
  - Supplier: [Supplier Name]
  - Cost: $25 each
  - Lead Time: 1-2 days

### Tools and Equipment

**Essential Tools:**
- Digital Multimeter
- RS485 Network Tester
- Crimping Tool for RJ45
- Screwdriver Set (Phillips and Flathead)
- Wire Strippers
- Heat Shrink Tubing Kit
- Label Maker

**Diagnostic Equipment:**
- USB-to-RS485 Converter (for testing)
- Laptop with diagnostic software
- Network Cable Tester
- Oscilloscope (for advanced diagnostics)

## Troubleshooting Guide

### Common Issues and Solutions

**Issue: Locker Won't Open**
1. Check power supply to relay board
2. Verify Modbus communication
3. Test relay channel manually
4. Check lock mechanism for mechanical issues
5. Use manual override if available

**Issue: RFID Card Not Reading**
1. Clean RFID reader surface
2. Test with known good card
3. Check USB connection
4. Restart kiosk service
5. Replace RFID reader if faulty

**Issue: Kiosk Display Not Working**
1. Check HDMI/display connections
2. Verify power to display
3. Test with different display
4. Check graphics driver issues
5. Replace display unit if needed

**Issue: Network Connectivity Problems**
1. Check network cable connections
2. Verify switch/router status
3. Test with ping commands
4. Check firewall settings
5. Contact network administrator

### Diagnostic Commands

**System Health Check:**
```bash
# Check all services
sudo systemctl status eform-gateway eform-kiosk eform-panel eform-agent

# Check database connectivity
sqlite3 /opt/eform/data/eform.db ".tables"

# Check network connectivity
ping -c 4 [gateway-ip]
curl http://localhost:3000/health

# Check disk space
df -h /opt/eform

# Check memory usage
free -h
```

**Hardware Diagnostics:**
```bash
# Test RS485 communication
/opt/eform/scripts/test-rs485.sh

# Test RFID reader
lsusb | grep -i rfid
dmesg | grep -i hid

# Test relay boards
/opt/eform/scripts/test-relays.sh
```

**Log Analysis:**
```bash
# View recent errors
journalctl -u eform-gateway --since "1 hour ago" | grep ERROR

# Check database logs
tail -f /opt/eform/logs/database.log

# Monitor real-time activity
tail -f /opt/eform/logs/system.log
```

## Maintenance Procedures

### Daily Maintenance (5 minutes)

**Visual Inspection:**
1. Check all kiosk displays are functioning
2. Verify RFID readers are clean and responsive
3. Ensure no error messages on screens
4. Check physical condition of lockers

**System Check:**
1. Review overnight logs for errors
2. Verify backup completion status
3. Check disk space usage
4. Monitor system performance metrics

### Weekly Maintenance (30 minutes)

**Hardware Maintenance:**
1. Clean RFID reader surfaces with alcohol wipes
2. Check all cable connections for looseness
3. Verify UPS battery status
4. Test emergency opening procedures

**Software Maintenance:**
1. Review system logs for patterns
2. Check for software updates
3. Verify database integrity
4. Test backup restoration process

**Documentation:**
1. Update maintenance log
2. Record any issues or repairs
3. Update spare parts inventory
4. Review operational metrics

### Monthly Maintenance (2 hours)

**Comprehensive System Test:**
1. Test all locker opening mechanisms
2. Verify RFID functionality on all readers
3. Test network connectivity and failover
4. Perform end-to-end user flow testing

**Hardware Deep Check:**
1. Inspect all electrical connections
2. Test relay board functionality
3. Check power supply voltages
4. Verify RS485 network integrity

**Software Updates:**
1. Apply security patches
2. Update system configurations
3. Review and optimize database
4. Update documentation

### Quarterly Maintenance (4 hours)

**Hardware Replacement:**
1. Replace UPS batteries
2. Update firmware on all devices
3. Calibrate RFID readers
4. Perform stress testing

**System Optimization:**
1. Database maintenance and optimization
2. Log rotation and archival
3. Performance tuning
4. Security audit

**Training and Documentation:**
1. Staff training on new procedures
2. Update operational documentation
3. Review emergency procedures
4. Update contact information

## System Recovery Procedures

### Database Recovery

**From Backup:**
```bash
# Stop all services
sudo systemctl stop eform-gateway eform-kiosk eform-panel

# Restore database
cp /opt/eform/backups/eform-$(date +%Y%m%d).db /opt/eform/data/eform.db

# Verify integrity
sqlite3 /opt/eform/data/eform.db "PRAGMA integrity_check;"

# Restart services
sudo systemctl start eform-gateway eform-kiosk eform-panel
```

**From Corruption:**
```bash
# Create backup of corrupted database
cp /opt/eform/data/eform.db /opt/eform/data/eform-corrupted-$(date +%Y%m%d).db

# Attempt repair
sqlite3 /opt/eform/data/eform.db ".recover" > /tmp/recovered.sql
sqlite3 /opt/eform/data/eform-recovered.db < /tmp/recovered.sql

# Verify and replace if successful
sqlite3 /opt/eform/data/eform-recovered.db "PRAGMA integrity_check;"
```

### Configuration Recovery

**Reset to Defaults:**
```bash
# Backup current config
cp /opt/eform/config/system.json /opt/eform/config/system-backup-$(date +%Y%m%d).json

# Restore default configuration
cp /opt/eform/config/system-default.json /opt/eform/config/system.json

# Restart services
sudo systemctl restart eform-gateway
```

### Complete System Recovery

**Full Reinstallation:**
1. Backup all data and configurations
2. Run uninstall script: `/opt/eform/scripts/uninstall.sh`
3. Clean installation: `/opt/eform/scripts/install.sh`
4. Restore data and configurations
5. Verify system functionality

## Contact Information

### Emergency Contacts (24/7)

**Primary Technical Support:**
- Name: [Technical Lead Name]
- Phone: [Emergency Phone]
- Email: [Emergency Email]
- Response Time: < 30 minutes

**Secondary Technical Support:**
- Name: [Backup Technical Lead]
- Phone: [Backup Phone]
- Email: [Backup Email]
- Response Time: < 1 hour

### Business Hours Support

**System Administrator:**
- Name: [Admin Name]
- Phone: [Admin Phone]
- Email: [Admin Email]
- Hours: Monday-Friday 8:00-17:00

**Facility Manager:**
- Name: [Manager Name]
- Phone: [Manager Phone]
- Email: [Manager Email]
- Hours: Monday-Sunday 6:00-22:00

### Vendor Contacts

**Hardware Supplier:**
- Company: [Supplier Name]
- Contact: [Supplier Contact]
- Phone: [Supplier Phone]
- Email: [Supplier Email]
- Support Hours: Monday-Friday 9:00-17:00

**Network Provider:**
- Company: [Network Provider]
- Contact: [Network Contact]
- Phone: [Network Phone]
- Email: [Network Email]
- Support: 24/7

### Escalation Matrix

**Level 1: On-Site Staff**
- Response Time: Immediate
- Authority: Basic troubleshooting, manual overrides
- Escalate to Level 2 if: Issue not resolved in 15 minutes

**Level 2: Technical Support**
- Response Time: < 30 minutes
- Authority: System restart, configuration changes
- Escalate to Level 3 if: Issue not resolved in 1 hour

**Level 3: Senior Technical Lead**
- Response Time: < 1 hour
- Authority: System modifications, emergency procedures
- Escalate to Level 4 if: Major system failure

**Level 4: Management/Vendor**
- Response Time: < 2 hours
- Authority: Business decisions, vendor engagement
- Final escalation level

---

**Document Version:** 1.0  
**Last Updated:** [Current Date]  
**Next Review:** [Review Date]  
**Approved By:** [Approver Name]