# Frontend Developer Onboarding Guide

## 🎯 **Welcome to the eForm Locker System**

This guide will help you understand the project structure, setup your development environment, and start contributing to the frontend without breaking anything.

## 📋 **Essential Reading List**

**⚠️ CRITICAL: Please read these files BEFORE starting any development work:**

### **1. Project Overview & Architecture**
```
📖 README.md                           # Project overview and quick start
📖 docs/SYSTEM_DOCUMENTATION.md        # Complete system architecture
📖 docs/API_REFERENCE.md               # API endpoints and data structures
📖 DIRECTORY_STRUCTURE.md              # Repository organization
```

### **2. Development Environment Setup**
```
📖 docs/DEVELOPMENT_ENVIRONMENT_SETUP.md  # Local development setup
📖 docs/DEPLOYMENT_README.md              # Deployment procedures
📖 .env.example                           # Environment configuration
📖 docs/pi-configuration-guide.md         # Raspberry Pi setup (production)
```

### **3. Frontend-Specific Documentation**
```
📖 app/panel/README.md                    # Admin Panel frontend
📖 app/kiosk/src/ui/README.md             # Kiosk UI documentation
📖 docs/integrations/maksisoft-integration-guide.md  # External integrations
📖 app/panel/src/__tests__/ui-improvements/README.md # UI testing guidelines
```

### **4. Code Quality & Standards**
```
📖 CONTRIBUTING.md                        # Contribution guidelines
📖 docs/REPOSITORY_MAINTENANCE_GUIDE.md   # Repository standards
📖 .kiro/steering/clean-work-etiquette.md # Work etiquette for AI/developers
📖 scripts/maintenance/README.md          # Maintenance system usage
```

### **5. Testing & Validation**
```
📖 tests/README.md                        # Testing strategy and guidelines
📖 docs/card-assignment-testing-guide.md  # Hardware testing procedures
📖 app/panel/src/__tests__/ui-improvements/ACCESSIBILITY_VALIDATION_SUMMARY.md
```

## 🏗️ **Project Architecture Overview**

### **System Components**
```
eForm Locker System (Distributed Architecture)
├── 🖥️  Development Environment (Windows PC)
│   ├── Frontend Development (Your Focus)
│   ├── Code Building & Testing
│   └── Git Repository Management
│
├── 🔧 Production Environment (Raspberry Pi)
│   ├── Gateway Service (Port 3000) - API Coordinator
│   ├── Panel Service (Port 3001) - Admin Web Interface
│   ├── Kiosk Service (Port 3002) - Hardware Control + User UI
│   └── Hardware Integration (Modbus RTU, RFID, Relays)
│
└── 🌐 Network Access
    ├── Admin Panel: http://192.168.1.8:3001
    ├── Kiosk UI: http://192.168.1.8:3002
    └── API Gateway: http://192.168.1.8:3000
```

### **Frontend Applications**

#### **1. Admin Panel (app/panel/)**
- **Purpose**: Administrative web interface for locker management
- **Technology**: Fastify + EJS templates + Vanilla JavaScript
- **Features**: User management, locker control, system monitoring
- **Access**: `http://192.168.1.8:3001`

#### **2. Kiosk UI (app/kiosk/src/ui/)**
- **Purpose**: Touch-screen interface for end users
- **Technology**: Static HTML + CSS + JavaScript
- **Features**: RFID authentication, locker selection, multi-language
- **Access**: `http://192.168.1.8:3002`

## 🚀 **Quick Start for Frontend Development**

### **Step 1: Environment Setup**
```bash
# Clone repository
git clone https://github.com/mredag/eformLockerRoom.git
cd eformLockerRoom

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
# Edit .env with your settings

# Install maintenance system (IMPORTANT)
bash scripts/maintenance/install-git-hooks.sh
```

### **Step 2: Development Workflow**
```bash
# Before starting work (ALWAYS)
bash scripts/maintenance/daily-cleanup.sh
git status

# Start development servers
npm run dev:panel    # Admin Panel development
npm run dev:kiosk    # Kiosk UI development

# Build for production
npm run build:panel
npm run build:kiosk

# Test your changes
npm run test:panel
npm run test:kiosk
```

### **Step 3: Code Quality Checks**
```bash
# Before committing (Git hooks will run automatically)
git add .
git commit -m "feat(ui): your descriptive message"

# Manual quality check
node scripts/maintenance/file-organization-checker.js
bash scripts/maintenance/repository-health-check.sh
```

## 📁 **Frontend File Organization**

### **Admin Panel Structure**
```
app/panel/
├── src/
│   ├── views/              # EJS templates
│   │   ├── lockers.html    # Main locker management
│   │   ├── relay.html      # Direct relay control
│   │   └── performance-dashboard.html
│   ├── routes/             # API route handlers
│   ├── middleware/         # Authentication, rate limiting
│   ├── services/           # Business logic
│   └── public/             # Static assets (CSS, JS, images)
├── __tests__/              # Frontend tests
└── package.json
```

### **Kiosk UI Structure**
```
app/kiosk/src/ui/
├── index.html              # Main kiosk interface
├── static/
│   ├── app.js             # Main application logic
│   ├── app-simple.js      # Simplified version
│   ├── styles.css         # Main styles
│   ├── styles-simple.css  # Simplified styles
│   ├── i18n.js           # Internationalization
│   └── pi-config.js      # Raspberry Pi specific config
└── __tests__/             # UI tests
```

## 🎨 **UI/UX Guidelines**

### **Design Principles**
- **Touch-First**: Optimized for touch screen interaction
- **Accessibility**: WCAG 2.1 AA compliance
- **Multi-Language**: Turkish/English support
- **Responsive**: Works on various screen sizes
- **High Contrast**: Suitable for industrial environments

### **Color Scheme & Status Indicators**
```css
/* Locker Status Colors */
.state-bos     { background: #28a745; }  /* Available - Green */
.state-dolu    { background: #dc3545; }  /* Occupied - Red */
.state-aciliyor{ background: #fd7e14; }  /* Opening - Orange */
.state-hata    { background: #6c757d; }  /* Error - Gray */
.state-engelli { background: #e83e8c; }  /* Blocked - Pink */
```

### **Typography & Sizing**
- **Minimum touch target**: 44px × 44px
- **Font sizes**: Minimum 16px for readability
- **Button spacing**: Minimum 8px between interactive elements
- **Turkish character support**: Full UTF-8 compatibility

## 🔧 **Development Tools & Commands**

### **Frontend Development**
```bash
# Admin Panel Development
cd app/panel
npm run dev          # Start development server
npm run build        # Build for production
npm run test         # Run tests
npm run lint         # Code quality check

# Kiosk UI Development
cd app/kiosk
npm run dev:ui       # Start UI development server
npm run build:ui     # Build UI for production
npm run test:ui      # Run UI tests
```

### **Testing Commands**
```bash
# Frontend Testing
npm run test:panel:ui              # Admin panel UI tests
npm run test:kiosk:ui              # Kiosk UI tests
npm run test:accessibility         # Accessibility validation
npm run test:integration           # Integration tests

# Hardware Integration Testing (Raspberry Pi)
ssh pi@pi-eform-locker "cd /home/pi/eform-locker && node scripts/testing/test-basic-relay-control.js"
```

### **Deployment Commands**
```bash
# Deploy to Raspberry Pi
git push origin main
ssh pi@pi-eform-locker "cd /home/pi/eform-locker && git pull origin main && npm run build:all"

# Restart services on Pi
ssh pi@pi-eform-locker "cd /home/pi/eform-locker && ./scripts/maintenance/start-all-clean.sh"
```

## 🧪 **Testing Strategy**

### **Frontend Testing Levels**
1. **Unit Tests**: Individual component functionality
2. **Integration Tests**: Component interaction
3. **E2E Tests**: Complete user workflows
4. **Accessibility Tests**: WCAG compliance
5. **Visual Regression**: UI consistency
6. **Hardware Integration**: Real device testing

### **Test Files Location**
```
app/panel/src/__tests__/ui-improvements/    # Admin panel UI tests
app/kiosk/src/ui/static/__tests__/          # Kiosk UI tests
tests/integration/                          # System integration tests
```

## 🚨 **Critical Safety Guidelines**

### **⚠️ NEVER DO THESE:**
1. **Don't modify hardware control code** without understanding Modbus protocol
2. **Don't change database schema** without migration scripts
3. **Don't commit sensitive data** (.env files, passwords, keys)
4. **Don't bypass Git hooks** unless absolutely necessary
5. **Don't modify production services** directly on Raspberry Pi

### **✅ ALWAYS DO THESE:**
1. **Test on development environment** before deploying
2. **Follow commit message format**: `type(scope): description`
3. **Run maintenance checks** before and after development
4. **Use proper file naming**: kebab-case, descriptive names
5. **Document your changes** in code comments and commit messages

## 🔄 **Development Workflow**

### **Daily Workflow**
```bash
# 1. Start of day
git pull origin main
bash scripts/maintenance/daily-cleanup.sh

# 2. Development
# Make your changes to frontend files
# Test locally

# 3. Before committing
git add .
git commit -m "feat(ui): add new locker selection interface"
# Git hooks will automatically check quality

# 4. Deploy and test
git push origin main
# Test on Raspberry Pi environment
```

### **Feature Development Process**
1. **Read relevant documentation** from the essential reading list
2. **Create feature branch** (optional, or work on main)
3. **Develop and test locally**
4. **Run quality checks**
5. **Commit with proper message format**
6. **Deploy to Pi and test hardware integration**
7. **Document any new features or changes**

## 🌐 **API Integration**

### **Key API Endpoints for Frontend**
```javascript
// Admin Panel APIs
GET  /api/lockers              // Get all lockers status
POST /api/lockers/{id}/open    // Open specific locker
GET  /api/users                // Get user list
POST /api/maksi/search-by-rfid // Search Maksisoft users

// Kiosk APIs  
POST /api/locker/open          // Queue-based locker opening
GET  /api/session/status       // RFID session status
POST /api/session/create       // Create RFID session

// Real-time Updates
WebSocket: ws://192.168.1.8:3001/ws  // Live status updates
```

### **Data Structures**
```javascript
// Locker Object
{
  id: number,
  status: "Free" | "Owned" | "Opening" | "Error" | "Blocked",
  owner_key: string | null,
  display_name: string,
  last_opened: string,
  hardware_address: number
}

// User Object
{
  id: number,
  rfid: string,
  fullName: string,
  phone: string,
  membershipType: number
}
```

## 🔍 **Debugging & Troubleshooting**

### **Common Issues & Solutions**

#### **Frontend Not Loading**
```bash
# Check service status
curl http://192.168.1.8:3001/health
curl http://192.168.1.8:3002/health

# Check logs
ssh pi@pi-eform-locker "tail -f /home/pi/eform-locker/logs/panel.log"
```

#### **API Calls Failing**
```bash
# Test API directly
curl -X GET http://192.168.1.8:3001/api/lockers
curl -X POST http://192.168.1.8:3002/api/locker/open \
  -H "Content-Type: application/json" \
  -d '{"locker_id": 1, "staff_user": "test"}'
```

#### **Build Errors**
```bash
# Clean build
rm -rf app/panel/dist app/kiosk/dist
npm run build:all

# Check for syntax errors
npm run lint
```

### **Debug Tools**
- **Browser DevTools**: Network tab for API calls
- **Pi Logs**: Real-time service logs
- **Health Endpoints**: Service status monitoring
- **Maintenance Dashboard**: Repository health

## 📚 **Additional Resources**

### **External Documentation**
- **Fastify**: https://www.fastify.io/docs/
- **EJS Templates**: https://ejs.co/
- **Modbus Protocol**: Understanding hardware communication
- **WCAG Guidelines**: https://www.w3.org/WAI/WCAG21/quickref/

### **Project-Specific Guides**
- **Hardware Integration**: `docs/troubleshooting/hardware-integration-guide.md`
- **Maksisoft Integration**: `docs/integrations/maksisoft-integration-guide.md`
- **Performance Monitoring**: `docs/performance-monitoring-guide.md`
- **Deployment Procedures**: `docs/DEPLOYMENT_README.md`

## 🎯 **Success Checklist**

Before considering your frontend work complete:

### **Development Checklist**
- [ ] Read all essential documentation files
- [ ] Set up development environment correctly
- [ ] Followed file naming and organization standards
- [ ] Implemented responsive design principles
- [ ] Added proper accessibility features
- [ ] Tested on multiple screen sizes
- [ ] Verified Turkish/English language support

### **Quality Checklist**
- [ ] All tests passing
- [ ] Code follows project conventions
- [ ] No console errors in browser
- [ ] Proper error handling implemented
- [ ] Loading states and user feedback added
- [ ] Git hooks passing without issues

### **Integration Checklist**
- [ ] Tested with real API endpoints
- [ ] Verified WebSocket real-time updates
- [ ] Tested hardware integration (if applicable)
- [ ] Confirmed deployment to Raspberry Pi works
- [ ] Documented any new features or changes

## 🤝 **Getting Help**

### **When You Need Assistance**
1. **Check documentation** in the essential reading list
2. **Review existing code** for similar implementations
3. **Test in isolation** to identify the specific issue
4. **Check logs** for error messages
5. **Use maintenance tools** to verify repository health

### **Escalation Path**
1. **Self-service**: Documentation and existing code
2. **Technical issues**: Check logs and run diagnostics
3. **Architecture questions**: Review system documentation
4. **Hardware issues**: Use emergency scripts in `scripts/emergency/`

---

## 🎉 **Welcome to the Team!**

You're now ready to contribute to the eForm Locker System frontend. Remember:

- **Quality first**: Use the maintenance system and follow standards
- **Test thoroughly**: Both locally and on the Raspberry Pi
- **Document changes**: Help future developers understand your work
- **Ask questions**: Better to clarify than to break something

The system has comprehensive safeguards in place, so don't worry about breaking things if you follow the guidelines. The Git hooks and maintenance system will catch most issues before they become problems.

**Happy coding!** 🚀