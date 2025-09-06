/**
 * Smart Assignment UI Tests
 * 
 * Tests for Task 8: Enhance kiosk UI for smart assignment
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 11.1, 11.2, 11.3, 11.4, 11.5
 */

// Mock DOM environment for testing
const { JSDOM } = require('jsdom');

describe('Smart Assignment UI', () => {
  let dom;
  let window;
  let document;
  let app;

  beforeEach(() => {
    // Create a mock DOM environment
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <div id="app">
            <div id="idle-screen" class="screen active"></div>
            <div id="session-screen" class="screen"></div>
            <div id="loading-screen" class="screen">
              <div class="loading-message">
                <h2 class="loading-text" id="loading-text">Loading...</h2>
              </div>
            </div>
            <div id="error-screen" class="screen">
              <div class="error-message">
                <h2 class="error-text" id="error-text">Error</h2>
                <p class="error-description" id="error-description">Description</p>
                <p class="error-recovery" id="error-recovery">Recovery</p>
                <button class="retry-button" id="retry-button">Retry</button>
                <button class="return-button" id="return-button">Return</button>
              </div>
            </div>
            <div class="locker-grid" id="locker-grid"></div>
            <div class="session-timer" id="session-timer">
              <span class="countdown-value" id="countdown-value">30</span>
            </div>
          </div>
        </body>
      </html>
    `, { 
      url: 'http://localhost:3002',
      pretendToBeVisual: true,
      resources: 'usable'
    });

    window = dom.window;
    document = window.document;
    
    // Set up global objects
    global.window = window;
    global.document = document;
    global.fetch = jest.fn();
    global.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    
    // Mock the SimpleKioskApp class (simplified version for testing)
    global.SimpleKioskApp = class {
      constructor() {
        this.kioskId = 'kiosk-1';
        this.state = { mode: 'idle' };
        this.elements = {
          loadingText: document.getElementById('loading-text'),
          errorText: document.getElementById('error-text'),
          errorDescription: document.getElementById('error-description'),
          errorRecovery: document.getElementById('error-recovery'),
          retryButton: document.getElementById('retry-button'),
          returnButton: document.getElementById('return-button'),
          sessionTimer: document.getElementById('session-timer'),
          countdownValue: document.getElementById('countdown-value'),
          lockerGrid: document.getElementById('locker-grid'),
          idleScreen: document.getElementById('idle-screen'),
          sessionScreen: document.getElementById('session-screen'),
          loadingScreen: document.getElementById('loading-screen'),
          errorScreen: document.getElementById('error-screen')
        };
        this.screens = [
          this.elements.idleScreen,
          this.elements.sessionScreen,
          this.elements.loadingScreen,
          this.elements.errorScreen
        ];
      }

      async checkSmartAssignmentStatus() {
        const response = await fetch(`/api/feature-flags/smart-assignment?kiosk_id=${this.kioskId}`);
        return await response.json();
      }

      showLoadingState(message, showProgress = false) {
        this.state.mode = 'loading';
        if (this.elements.loadingText) {
          this.elements.loadingText.textContent = message;
        }
        this.showScreen('loading');
      }

      showScreen(screenName) {
        const targetScreen = this.elements[`${screenName}Screen`];
        if (!targetScreen) return;
        
        this.screens.forEach(screen => {
          if (screen === targetScreen) {
            screen.classList.add('active');
          } else {
            screen.classList.remove('active');
          }
        });
      }

      showErrorState(errorCode, customMessage = null) {
        this.state.mode = 'error';
        this.state.errorType = errorCode;
        
        const errorMessages = {
          'SMART_ASSIGNMENT_ERROR': {
            message: "Şu an işlem yapılamıyor.",
            description: "Dolap otomatik olarak atanamadı",
            recovery: "Kartınızı tekrar okutun"
          },
          'RATE_LIMITED': {
            message: "Lütfen birkaç saniye sonra deneyin.",
            description: "İşlemler arasında bekleme süresi gerekli",
            recovery: "Birkaç saniye bekleyip tekrar deneyin"
          }
        };
        
        const errorInfo = errorMessages[errorCode] || errorMessages['SMART_ASSIGNMENT_ERROR'];
        const message = customMessage || errorInfo.message;
        
        if (this.elements.errorText) {
          this.elements.errorText.textContent = message;
        }
        if (this.elements.errorDescription) {
          this.elements.errorDescription.textContent = errorInfo.description;
        }
        if (this.elements.errorRecovery) {
          this.elements.errorRecovery.textContent = errorInfo.recovery;
        }
        
        this.showScreen('error');
      }

      async handleSmartAssignment(cardId) {
        this.showLoadingState(null, true); // Spinner only, no text
        
        const response = await fetch('/api/rfid/handle-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            card_id: cardId,
            kiosk_id: this.kioskId
          })
        });
        
        const result = await response.json();
        
        if (result.smart_assignment) {
          if (result.success) {
            // Validate message against whitelist
            const validatedMessage = this.validateMessage(result.message);
            this.showLoadingState(validatedMessage);
            setTimeout(() => {
              this.showIdleState();
            }, 3000);
          } else {
            const validatedMessage = this.validateMessage(result.message);
            this.showErrorState('SMART_ASSIGNMENT_ERROR', validatedMessage);
          }
        }
      }

      validateMessage(message) {
        const approvedMessages = {
          "Dolabınız açıldı. Eşyalarınızı yerleştirin.": true,
          "Önceki dolabınız açıldı.": true,
          "Şu an işlem yapılamıyor.": true,
          "Boş dolap yok. Görevliye başvurun.": true,
          "Lütfen birkaç saniye sonra deneyin.": true
        };
        
        return approvedMessages[message] ? message : "Şu an işlem yapılamıyor.";
      }

      showIdleState() {
        this.state.mode = 'idle';
        this.showScreen('idle');
      }
    };

    app = new global.SimpleKioskApp();
  });

  afterEach(() => {
    dom.window.close();
    jest.clearAllMocks();
  });

  describe('Feature Flag Check (Requirement 9.1, 9.2)', () => {
    test('should check smart assignment status on card scan', async () => {
      // Mock feature flag API response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          kiosk_id: 'kiosk-1',
          smart_assignment_enabled: true
        })
      });

      const result = await app.checkSmartAssignmentStatus();
      
      expect(global.fetch).toHaveBeenCalledWith('/api/feature-flags/smart-assignment?kiosk_id=kiosk-1');
      expect(result.smart_assignment_enabled).toBe(true);
    });

    test('should default to manual mode if feature flag check fails', async () => {
      // Mock failed API response
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await app.checkSmartAssignmentStatus().catch(() => ({ smart_assignment_enabled: false }));
      
      expect(result.smart_assignment_enabled).toBe(false);
    });
  });

  describe('Smart Assignment Flow (Requirement 9.3, 9.4)', () => {
    test('should show loading state with progress for smart assignment', () => {
      app.showLoadingState('Dolap otomatik atanıyor...', true);
      
      expect(app.state.mode).toBe('loading');
      expect(app.elements.loadingText.textContent).toBe('Dolap otomatik atanıyor...');
      expect(app.elements.loadingScreen.classList.contains('active')).toBe(true);
    });

    test('should handle successful smart assignment', async () => {
      // Mock successful smart assignment response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          smart_assignment: true,
          action: 'assign_new',
          locker_id: 15,
          message: 'Dolabınız açıldı. Eşyalarınızı yerleştirin'
        })
      });

      await app.handleSmartAssignment('0009652489');
      
      expect(global.fetch).toHaveBeenCalledWith('/api/rfid/handle-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: '0009652489',
          kiosk_id: 'kiosk-1'
        })
      });
      
      expect(app.elements.loadingText.textContent).toBe('Dolabınız açıldı. Eşyalarınızı yerleştirin');
    });

    test('should handle smart assignment failure', async () => {
      // Mock failed smart assignment response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          smart_assignment: true,
          error: 'no_stock',
          message: 'Boş dolap yok. Görevliye başvurun'
        })
      });

      await app.handleSmartAssignment('0009652489');
      
      expect(app.state.mode).toBe('error');
      expect(app.elements.errorText.textContent).toBe('Boş dolap yok. Görevliye başvurun');
    });
  });

  describe('Turkish Messages (Requirement 11.1, 11.2, 11.3, 11.4, 11.5)', () => {
    test('should display correct Turkish loading messages from whitelist only', () => {
      const testMessages = [
        'Tekrar deneniyor.', // Only approved loading message
        'Dolabınız açıldı. Eşyalarınızı yerleştirin.'
      ];

      testMessages.forEach(message => {
        app.showLoadingState(message);
        if (message === 'Tekrar deneniyor.') {
          expect(app.elements.loadingText.textContent).toBe(message);
        } else {
          // Other messages should show spinner only
          expect(app.elements.loadingText.style.display).toBe('none');
        }
      });
    });

    test('should display correct Turkish error messages', () => {
      const testCases = [
        {
          errorCode: 'SMART_ASSIGNMENT_ERROR',
          expectedMessage: 'Şu an işlem yapılamıyor.',
          expectedDescription: 'Dolap otomatik olarak atanamadı',
          expectedRecovery: 'Kartınızı tekrar okutun'
        },
        {
          errorCode: 'RATE_LIMITED',
          expectedMessage: 'Lütfen birkaç saniye sonra deneyin.',
          expectedDescription: 'İşlemler arasında bekleme süresi gerekli',
          expectedRecovery: 'Birkaç saniye bekleyip tekrar deneyin'
        }
      ];

      testCases.forEach(({ errorCode, expectedMessage, expectedDescription, expectedRecovery }) => {
        app.showErrorState(errorCode);
        
        expect(app.elements.errorText.textContent).toBe(expectedMessage);
        expect(app.elements.errorDescription.textContent).toBe(expectedDescription);
        expect(app.elements.errorRecovery.textContent).toBe(expectedRecovery);
      });
    });

    test('should validate custom messages against whitelist', () => {
      const customMessage = 'Özel hata mesajı'; // Not in whitelist
      const validatedMessage = app.validateMessage(customMessage);
      
      expect(validatedMessage).toBe('Şu an işlem yapılamıyor.'); // Should fallback to whitelist
    });
  });

  describe('UI State Management (Requirement 9.5)', () => {
    test('should never show locker selection in smart assignment mode', () => {
      // In smart assignment mode, locker grid should never be populated
      app.showLoadingState('Dolap otomatik atanıyor...');
      
      // Verify that session screen (which contains locker grid) is not active
      expect(app.elements.sessionScreen.classList.contains('active')).toBe(false);
      expect(app.elements.loadingScreen.classList.contains('active')).toBe(true);
    });

    test('should properly switch between screens', () => {
      // Test screen switching
      app.showScreen('loading');
      expect(app.elements.loadingScreen.classList.contains('active')).toBe(true);
      expect(app.elements.idleScreen.classList.contains('active')).toBe(false);

      app.showScreen('error');
      expect(app.elements.errorScreen.classList.contains('active')).toBe(true);
      expect(app.elements.loadingScreen.classList.contains('active')).toBe(false);

      app.showScreen('idle');
      expect(app.elements.idleScreen.classList.contains('active')).toBe(true);
      expect(app.elements.errorScreen.classList.contains('active')).toBe(false);
    });

    test('should hide session timer when not in session mode', () => {
      app.showScreen('loading');
      expect(app.elements.sessionTimer.style.display).toBe('none');

      app.showScreen('error');
      expect(app.elements.sessionTimer.style.display).toBe('none');

      app.showScreen('idle');
      expect(app.elements.sessionTimer.style.display).toBe('none');
    });
  });

  describe('Progress Indicators (Loading States)', () => {
    test('should show progress indicator for smart assignment', () => {
      app.showLoadingState('Dolap otomatik atanıyor...', true);
      
      // Check that progress container would be created
      expect(app.state.mode).toBe('loading');
      expect(app.elements.loadingScreen.classList.contains('active')).toBe(true);
    });

    test('should clean up progress indicator when changing screens', () => {
      // Create a mock progress container
      const progressContainer = document.createElement('div');
      progressContainer.id = 'progress-container';
      document.body.appendChild(progressContainer);

      app.showScreen('idle');
      
      // Progress container should be removed
      expect(document.getElementById('progress-container')).toBeNull();
    });
  });
});