# Troubleshooting Reports

This folder contains historical troubleshooting reports and solutions for issues encountered during the development and deployment of the eForm Locker System.

## 📋 **Issue Reports**

### **[Command Queue Database Path Issue Report](COMMAND_QUEUE_DATABASE_PATH_ISSUE_REPORT.md)**
- **Issue**: Database path conflicts between services
- **Impact**: Service startup failures and data inconsistencies
- **Resolution**: Standardized database path configuration
- **Status**: ✅ Resolved

### **[Hardware Integration & Troubleshooting Guide](hardware-integration-guide.md)**
- **Issue**: Relay control failures, serial port conflicts, and hardware communication problems
- **Impact**: Physical locker control not working, service conflicts
- **Resolution**: Custom Modbus implementation, service coordination, and connection lifecycle management
- **Status**: ✅ Resolved - Comprehensive guide available

### **[Kiosk Assignment Failure Incident](incident-reports/kiosk-assignment-failure-2025-08.md)**
- **Issue**: Session management bug preventing locker assignments
- **Impact**: Complete system failure for locker assignment functionality
- **Resolution**: Fixed session storage and validation logic
- **Status**: ✅ Resolved - Detailed incident report available

## 🔧 **How to Use These Reports**

1. **Reference for Similar Issues**: If you encounter similar problems, these reports provide detailed analysis and solutions
2. **Learning Resource**: Understand common pitfalls and how they were resolved
3. **Maintenance Guide**: Use the solutions as maintenance procedures for ongoing operations

## 📞 **Current Support**

For new issues, refer to the main documentation:
- **[Monitoring Guide](../MONITORING_GUIDE.md)** - Current troubleshooting procedures
- **[Quick Reference](../QUICK_REFERENCE.md)** - Emergency procedures and fixes
- **[System Documentation](../SYSTEM_DOCUMENTATION.md)** - Complete technical reference

---

*These reports are maintained for historical reference and learning purposes.*