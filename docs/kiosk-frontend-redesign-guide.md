# Kiosk Frontend Redesign Guide

## 🎯 **Project Overview**

This guide provides a safe, structured approach to completely redesign the kiosk frontend (idle screen, session screen, and locker tiles) without breaking the backend services.

## 🏗️ **Current Frontend Architecture**

### **File Structure**
```
app/kiosk/src/ui/
├── index.html              # Main HTML template
├── static/
│   ├── app.js              # Full-featured kiosk app
│   ├── app-simple.js       # Simplified Pi-optimized version
│   ├── styles.css          # Full styles
│   ├── styles-simple.css   # Simplified styles
│   ├── i18n.js            # Turkish/English translations
│   └── pi-config.js       # Pi-specific optimizations
```

### **Current UI States**
1. **Idle Screen** - Waiting for RFID card scan
2. **Session Screen** - Shows available lockers after card scan
3. **Loading States** - During API calls
4. **Error States** - Hardware/network errors
5. **Success States** - Locker assignment confirmation

### **Backend Integration Points**
- **UI Controller**: `app/kiosk/src/controllers/ui-controller.ts`
- **Session Manager**: `app/kiosk/src/controllers/session-manager.ts`
- **API Endpoints**: `/api/rfid/handle-card`, `/api/card/:cardId/locker`
- **WebSocket**: Real-time locker status updates

## 🛡️ **Safe Development Strategy**

### **Phase 1: Create New UI Branch (Week 1)**

```bash
# Create new UI files alongside existing ones
app/kiosk/src/ui/
├── index.html              # Keep existing
├── index-new.html          # New design
├── static/
│   ├── app.js              # Keep existing
│   ├── app-new.js          # New implementation
│   ├── styles.css          # Keep existing
│   ├── styles-new.css      # New styles
│   └── components/         # New component system
│       ├── idle-screen.js
│       ├── session-screen.js
│       ├── locker-grid.js
│       └── error-handler.js
```

### **Phase 2: Parallel Development (Week 2-3)**

1. **Keep Services Running**: Backend services remain untouched
2. **New Route**: Add `/ui-new` endpoint for testing
3. **API Compatibility**: Use existing API endpoints
4. **Feature Parity**: Implement all current functionality

### **Phase 3: Testing & Validation (Week 4)**

1. **A/B Testing**: Switch between old/new UI via URL parameter
2. **Hardware Testing**: Test on actual Raspberry Pi
3. **RFID Testing**: Validate card scanning works
4. **Performance Testing**: Ensure Pi performance is maintained

### **Phase 4: Gradual Rollout (Week 5)**

1. **Soft Launch**: Deploy to staging environment
2. **User Testing**: Get feedback from actual users
3. **Bug Fixes**: Address any issues found
4. **Production Switch**: Update main route to new UI

## 🎨 **Design Requirements & Constraints**

### **Hardware Constraints (Raspberry Pi 4)**
- **Memory**: Keep JavaScript < 50MB RAM usage
- **CPU**: Minimize DOM manipulations and animations
- **Touch Screen**: 7-10 inch displays, finger-friendly targets
- **Performance**: 60fps animations, <100ms response times

### **User Experience Requirements**
- **Language**: Turkish primary, English fallback
- **Accessibility**: High contrast, large text, clear icons
- **Session Management**: 30-second timeout with countdown
- **Error Handling**: Clear, actionable error messages
- **Audio Feedback**: Optional beeps for interactions

### **Technical Requirements**
- **No Framework Dependencies**: Vanilla JavaScript only
- **Offline Capable**: Work without internet connection
- **Real-time Updates**: WebSocket integration for live status
- **RFID Integration**: Keyboard event capture for card scanning
- **API Compatibility**: Use existing backend endpoints

## 🔧 **API Integration Guide**

### **Key Endpoints to Use**
```javascript
// Card scanning
POST /api/rfid/handle-card
{
  "card_id": "0009652489",
  "kiosk_id": "kiosk-1"
}

// Check card status
GET /api/card/{cardId}/locker

// Get available lockers
GET /api/lockers/available

// Assign locker
POST /api/locker/assign
{
  "locker_id": 5,
  "card_id": "0009652489",
  "session_id": "kiosk-1-0009652489-1693234567"
}
```

### **WebSocket Events**
```javascript
// Listen for real-time updates
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  switch(data.type) {
    case 'locker_status_changed':
      updateLockerDisplay(data.locker_id, data.status);
      break;
    case 'session_expired':
      returnToIdleScreen();
      break;
  }
};
```

### **Session Management**
```javascript
// Session lifecycle
const session = {
  id: `kiosk-${kioskId}-${cardId}-${timestamp}`,
  timeout: 30000, // 30 seconds
  card_id: "0009652489",
  kiosk_id: "kiosk-1",
  created_at: new Date().toISOString()
};
```

## 🎯 **New UI Component Structure**

### **Recommended Architecture**
```javascript
// Main App Controller
class NewKioskApp {
  constructor() {
    this.state = new StateManager();
    this.api = new ApiClient();
    this.ui = new UIManager();
    this.rfid = new RFIDHandler();
    this.session = new SessionHandler();
  }
}

// Component System
class IdleScreen extends Component {
  render() {
    // New idle screen design
  }
}

class SessionScreen extends Component {
  render() {
    // New session screen with locker grid
  }
}

class LockerTile extends Component {
  render() {
    // New locker card design
  }
}
```

### **State Management Pattern**
```javascript
class StateManager {
  constructor() {
    this.state = {
      mode: 'idle', // idle, session, loading, error
      session: null,
      lockers: [],
      selectedLocker: null,
      countdown: 0,
      error: null
    };
    this.listeners = [];
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.notifyListeners();
  }
}
```

## 🎨 **Design System Guidelines**

### **Color Palette**
```css
:root {
  /* Primary Colors */
  --primary-green: #10B981;
  --primary-blue: #3B82F6;
  --primary-red: #EF4444;
  
  /* Status Colors */
  --status-available: #10B981;
  --status-occupied: #EF4444;
  --status-opening: #F59E0B;
  --status-error: #6B7280;
  
  /* Background */
  --bg-primary: #1E293B;
  --bg-secondary: #334155;
  --bg-card: #FFFFFF;
  
  /* Text */
  --text-primary: #1F2937;
  --text-secondary: #6B7280;
  --text-inverse: #FFFFFF;
}
```

### **Typography Scale**
```css
/* Touch-friendly sizes for Pi displays */
.text-xs { font-size: 14px; }    /* Small labels */
.text-sm { font-size: 16px; }    /* Body text */
.text-base { font-size: 18px; }  /* Default */
.text-lg { font-size: 24px; }    /* Headings */
.text-xl { font-size: 32px; }    /* Large headings */
.text-2xl { font-size: 48px; }   /* Display text */
```

### **Component Spacing**
```css
/* Consistent spacing system */
.space-1 { margin: 8px; }
.space-2 { margin: 16px; }
.space-3 { margin: 24px; }
.space-4 { margin: 32px; }
.space-6 { margin: 48px; }

/* Touch targets */
.touch-target {
  min-height: 44px;
  min-width: 44px;
  padding: 12px 16px;
}
```

## 🔄 **Development Workflow**

### **Step 1: Setup Development Environment**
```bash
# Create new UI branch
git checkout -b feature/kiosk-ui-redesign

# Create new files
mkdir -p app/kiosk/src/ui/static/components
touch app/kiosk/src/ui/index-new.html
touch app/kiosk/src/ui/static/app-new.js
touch app/kiosk/src/ui/static/styles-new.css
```

### **Step 2: Add New Route (Backend)**
```typescript
// In ui-controller.ts
fastify.get('/ui-new', async (request, reply) => {
  const html = await readFile(join(__dirname, 'ui/index-new.html'), 'utf8');
  reply.type('text/html').send(html);
});
```

### **Step 3: Implement Components**
```javascript
// Start with idle screen
class IdleScreen {
  constructor(container) {
    this.container = container;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="idle-screen">
        <!-- New idle screen design -->
      </div>
    `;
  }
}
```

### **Step 4: Test Incrementally**
```bash
# Test new UI without affecting production
curl http://192.168.1.8:3002/ui-new

# Compare with existing
curl http://192.168.1.8:3002/ui
```

## 🧪 **Testing Strategy**

### **Unit Testing**
```javascript
// Test components in isolation
describe('LockerTile', () => {
  it('should render available locker correctly', () => {
    const tile = new LockerTile({
      id: 5,
      status: 'Free',
      displayName: 'Dolap 5'
    });
    expect(tile.element.classList.contains('available')).toBe(true);
  });
});
```

### **Integration Testing**
```javascript
// Test API integration
describe('SessionScreen', () => {
  it('should load available lockers on card scan', async () => {
    const screen = new SessionScreen();
    await screen.handleCardScan('0009652489');
    expect(screen.lockers.length).toBeGreaterThan(0);
  });
});
```

### **Hardware Testing Checklist**
- [ ] RFID card scanning works
- [ ] Touch interactions responsive
- [ ] Performance acceptable on Pi
- [ ] Display scales correctly
- [ ] Audio feedback works
- [ ] WebSocket connection stable
- [ ] Session timeout functions
- [ ] Error states display properly

## 🚀 **Deployment Strategy**

### **Staging Deployment**
```bash
# Deploy to staging Pi
ssh pi@pi-staging-eform-locker
cd /home/pi/eform-locker
git pull origin feature/kiosk-ui-redesign
npm run build:kiosk
./scripts/start-all-clean.sh

# Test new UI
curl http://192.168.1.9:3002/ui-new
```

### **Production Rollout**
```bash
# 1. Deploy code
git merge feature/kiosk-ui-redesign
git push origin main

# 2. Update Pi
ssh pi@pi-eform-locker
cd /home/pi/eform-locker
git pull origin main
npm run build:kiosk

# 3. Switch routes (in ui-controller.ts)
# Change main route to serve index-new.html

# 4. Restart services
./scripts/start-all-clean.sh
```

### **Rollback Plan**
```bash
# If issues occur, quick rollback
git revert HEAD
git push origin main

# Or switch route back to old UI
# Update ui-controller.ts to serve index.html
```

## 📊 **Performance Monitoring**

### **Key Metrics to Track**
- **Memory Usage**: `free -h` on Pi
- **CPU Usage**: `top` command
- **Response Times**: Browser dev tools
- **Error Rates**: Check logs
- **User Interactions**: Session success rates

### **Monitoring Commands**
```bash
# Monitor Pi performance
ssh pi@pi-eform-locker
htop

# Check service logs
tail -f logs/kiosk.log

# Monitor memory usage
watch -n 5 'free -h && ps aux | grep node'
```

## 🎯 **Success Criteria**

### **Functional Requirements**
- [ ] All existing functionality preserved
- [ ] RFID card scanning works flawlessly
- [ ] Session management (30-second timeout)
- [ ] Real-time locker status updates
- [ ] Error handling and recovery
- [ ] Turkish language support
- [ ] Audio feedback system

### **Performance Requirements**
- [ ] Page load < 2 seconds on Pi
- [ ] Touch response < 100ms
- [ ] Memory usage < 100MB
- [ ] No memory leaks during extended use
- [ ] Smooth animations (60fps)

### **User Experience Requirements**
- [ ] Intuitive navigation
- [ ] Clear visual feedback
- [ ] Accessible design
- [ ] Consistent branding
- [ ] Error messages in Turkish
- [ ] Touch-friendly interface

## 🔧 **Developer Handoff Checklist**

### **Before Starting Development**
- [ ] Review current UI functionality
- [ ] Test existing system on Pi
- [ ] Understand API endpoints
- [ ] Set up development environment
- [ ] Create feature branch

### **During Development**
- [ ] Follow component architecture
- [ ] Maintain API compatibility
- [ ] Test on actual Pi hardware
- [ ] Validate RFID integration
- [ ] Monitor performance metrics

### **Before Deployment**
- [ ] Complete testing checklist
- [ ] Performance validation
- [ ] User acceptance testing
- [ ] Rollback plan prepared
- [ ] Documentation updated

## 📞 **Support & Resources**

### **Key Files to Reference**
- `app/kiosk/src/controllers/ui-controller.ts` - Backend integration
- `app/kiosk/src/controllers/session-manager.ts` - Session logic
- `shared/services/locker-state-manager.ts` - Locker state
- `docs/kiosk-troubleshooting-guide.md` - Troubleshooting

### **Testing Endpoints**
- **Staging**: `http://192.168.1.9:3002/ui-new`
- **Production**: `http://192.168.1.8:3002/ui-new`
- **Local Dev**: `http://localhost:3002/ui-new`

### **Emergency Contacts**
- **Hardware Issues**: Check Pi connection and logs
- **API Issues**: Review backend service status
- **Performance Issues**: Monitor Pi resources

---

**Remember**: The goal is to create a beautiful, modern UI while maintaining 100% compatibility with the existing backend services. Take it step by step, test thoroughly, and always have a rollback plan ready!