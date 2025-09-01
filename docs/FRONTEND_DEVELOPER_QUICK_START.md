# 🚀 Frontend Developer Quick Start

## 📋 **Before You Start - READ THESE FILES:**

**⚠️ CRITICAL - Read these 5 files first to avoid breaking anything:**

```
1. 📖 DEVELOPER_ONBOARDING_GUIDE.md     # Complete developer guide (START HERE)
2. 📖 README.md                         # Project overview
3. 📖 CONTRIBUTING.md                   # Contribution guidelines  
4. 📖 docs/SYSTEM_DOCUMENTATION.md      # System architecture
5. 📖 .kiro/steering/clean-work-etiquette.md  # Work standards
```

## ⚡ **30-Second Setup**

```bash
# 1. Clone and setup
git clone https://github.com/mredag/eformLockerRoom.git
cd eformLockerRoom
npm install

# 2. Install safety system (IMPORTANT!)
bash scripts/maintenance/install-git-hooks.sh

# 3. Copy environment config
cp .env.example .env

# 4. Start development
npm run dev:panel    # Admin interface
npm run dev:kiosk    # User interface
```

## 🎯 **What You're Working On**

### **Frontend Applications:**
- **Admin Panel** (`app/panel/`) - Management interface at `http://192.168.1.8:3001`
- **Kiosk UI** (`app/kiosk/src/ui/`) - User touch interface at `http://192.168.1.8:3002`

### **Technology Stack:**
- **Admin Panel**: Fastify + EJS + Vanilla JS
- **Kiosk UI**: Static HTML + CSS + JavaScript
- **Styling**: Custom CSS with Turkish/English support
- **Testing**: Jest + Integration tests

## 🛡️ **Safety Rules (Don't Break Anything!)**

### **✅ SAFE TO MODIFY:**
- Frontend UI files (`app/panel/src/views/`, `app/kiosk/src/ui/`)
- CSS styles and JavaScript
- Test files
- Documentation

### **❌ NEVER TOUCH:**
- Hardware control code (`app/kiosk/src/hardware/`)
- Database migrations (`migrations/`)
- Production services on Raspberry Pi
- `.env` files (use `.env.example`)

## 🔄 **Daily Workflow**

```bash
# Morning routine
git pull origin main
bash scripts/maintenance/daily-cleanup.sh

# Development
# ... make your changes ...

# Before committing (Git hooks will check automatically)
git add .
git commit -m "feat(ui): your descriptive change"
git push origin main

# Deploy to Pi and test
ssh pi@pi-eform-locker "cd /home/pi/eform-locker && git pull && npm run build:all"
```

## 🧪 **Testing Your Changes**

```bash
# Local testing
npm run test:panel
npm run test:kiosk
npm run test:accessibility

# Production testing
curl http://192.168.1.8:3001/health  # Check admin panel
curl http://192.168.1.8:3002/health  # Check kiosk UI
```

## 🚨 **Emergency Commands**

```bash
# If something breaks
bash scripts/maintenance/repository-health-check.sh  # Check what's wrong
bash scripts/maintenance/daily-cleanup.sh            # Clean up mess
git status                                           # See what changed

# If Git hooks block your commit
node scripts/maintenance/file-organization-checker.js  # See what's wrong
# Fix issues, then commit again

# If you need help
cat DEVELOPER_ONBOARDING_GUIDE.md  # Full documentation
```

## 📞 **Key Information**

- **Production Environment**: Raspberry Pi at `192.168.1.8`
- **Admin Panel**: `http://192.168.1.8:3001`
- **Kiosk Interface**: `http://192.168.1.8:3002`
- **API Gateway**: `http://192.168.1.8:3000`
- **SSH Access**: `ssh pi@pi-eform-locker`

## 🎯 **Your Mission**

You're working on the **frontend interfaces** for an **industrial locker system** that:
- Controls physical lockers via RFID cards
- Has a touch-screen kiosk for users
- Has a web admin panel for management
- Supports Turkish and English languages
- Runs on a Raspberry Pi with real hardware

**The system has safety measures in place - follow the guidelines and you'll be fine!**

---

**Need help?** Read `DEVELOPER_ONBOARDING_GUIDE.md` for complete details! 📚