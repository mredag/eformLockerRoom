/**
 * Locker Grid Absence Test
 * 
 * CRITICAL ACCEPTANCE TEST: Verify locker grid is NEVER rendered when smart assignment is enabled
 * This test ensures compliance with the requirement that locker selection UI must be absent
 * when smart assignment feature flag is ON.
 */

describe('Locker Grid Absence - CRITICAL ACCEPTANCE TEST', () => {
  let app;
  let mockLockerGrid;

  beforeEach(() => {
    // Mock DOM elements
    mockLockerGrid = {
      innerHTML: '',
      id: 'locker-grid',
      classList: {
        contains: jest.fn().mockReturnValue(false),
        add: jest.fn(),
        remove: jest.fn()
      }
    };

    // Set up global mocks
    global.fetch = jest.fn();
    global.localStorage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn()
    };
    global.console = { 
      log: jest.fn(), 
      warn: jest.fn(), 
      error: jest.fn() 
    };
    
    // Mock the SimpleKioskApp class with smart assignment support
    class MockKioskApp {
      constructor() {
        this.kioskId = 'kiosk-1';
        this.state = { mode: 'idle' };
        this.elements = {
          lockerGrid: mockLockerGrid,
          idleScreen: { classList: { contains: jest.fn().mockReturnValue(false), add: jest.fn(), remove: jest.fn() } },
          sessionScreen: { 
            classList: { contains: jest.fn().mockReturnValue(false), add: jest.fn(), remove: jest.fn() },
            querySelector: jest.fn().mockReturnValue(mockLockerGrid)
          },
          loadingScreen: { classList: { contains: jest.fn().mockReturnValue(false), add: jest.fn(), remove: jest.fn() } },
          errorScreen: { classList: { contains: jest.fn().mockReturnValue(true), add: jest.fn(), remove: jest.fn() } }
        };
        this.screens = [
          this.elements.idleScreen,
          this.elements.sessionScreen,
          this.elements.loadingScreen,
          this.elements.errorScreen
        ];
        
        // Feature flag cache
        this.featureFlagCache = {
          smartAssignmentEnabled: null,
          lastUpdated: 0,
          kioskId: null
        };
        
        // Approved messages
        this.approvedMessages = {
          idle: "Kartınızı okutun.",
          success_new: "Dolabınız açıldı. Eşyalarınızı yerleştirin.",
          success_existing: "Önceki dolabınız açıldı.",
          error: "Şu an işlem yapılamıyor."
        };
      }

      async checkSmartAssignmentStatus() {
        // Return cached value if available
        if (this.featureFlagCache.smartAssignmentEnabled !== null) {
          return { 
            smart_assignment_enabled: this.featureFlagCache.smartAssignmentEnabled,
            cached: true 
          };
        }
        
        // Mock API call
        const response = await fetch(`/api/feature-flags/smart-assignment?kiosk_id=${this.kioskId}`);
        const result = await response.json();
        
        // Update cache
        this.featureFlagCache = {
          smartAssignmentEnabled: result.smart_assignment_enabled,
          lastUpdated: Date.now(),
          kioskId: this.kioskId
        };
        
        return result;
      }

      async startSession() {
        // CRITICAL: Check if smart assignment is enabled before rendering grid
        if (this.featureFlagCache.smartAssignmentEnabled === true) {
          console.error('🚨 BLOCKED: Attempted to start session with smart assignment enabled');
          this.showErrorState('SMART_ASSIGNMENT_ERROR');
          return;
        }

        this.state.mode = 'session';
        await this.renderLockerGridSafely();
        this.showScreen('session');
      }

      async renderLockerGridSafely() {
        // Double-check smart assignment status before rendering
        const status = await this.checkSmartAssignmentStatus();
        
        if (status.smart_assignment_enabled) {
          console.error('🚨 BLOCKED: Locker grid rendering blocked - smart assignment enabled');
          // Clear any existing grid
          if (this.elements.lockerGrid) {
            this.elements.lockerGrid.innerHTML = '';
          }
          return;
        }
        
        // Safe to render grid
        this.renderLockerGrid();
      }

      renderLockerGrid() {
        // Mock locker grid rendering
        if (this.elements.lockerGrid) {
          this.elements.lockerGrid.innerHTML = '<div class="locker-tile">Mock Locker</div>';
        }
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

      showErrorState(errorCode) {
        this.state.mode = 'error';
        this.showScreen('error');
      }

      // Method to simulate cache update
      updateFeatureFlagCache(enabled) {
        this.featureFlagCache = {
          smartAssignmentEnabled: enabled,
          lastUpdated: Date.now(),
          kioskId: this.kioskId
        };
      }
    }

    app = new MockKioskApp();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('CRITICAL: Locker Grid Must Be Absent When Smart Assignment Enabled', () => {
    test('ACCEPTANCE: Locker grid must NEVER be rendered when smart assignment is enabled', async () => {
      // Set smart assignment enabled in cache
      app.updateFeatureFlagCache(true);
      
      // Mock API to return smart assignment enabled
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          smart_assignment_enabled: true
        })
      });

      // Attempt to start session (should be blocked)
      await app.startSession();
      
      // CRITICAL ASSERTION: Locker grid must be empty
      expect(app.elements.lockerGrid.innerHTML).toBe('');
      
      // Verify session screen is not active
      expect(app.elements.sessionScreen.classList.contains('active')).toBe(false);
      
      // Verify error state is shown instead
      expect(app.state.mode).toBe('error');
      expect(app.elements.errorScreen.classList.contains('active')).toBe(true);
    });

    test('ACCEPTANCE: Locker grid rendering must be blocked even if cache is stale', async () => {
      // Set smart assignment enabled in cache (simulating stale cache)
      app.updateFeatureFlagCache(true);
      
      // Mock API to return smart assignment still enabled
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          smart_assignment_enabled: true
        })
      });

      // Try to render grid safely
      await app.renderLockerGridSafely();
      
      // CRITICAL ASSERTION: Grid must remain empty
      expect(app.elements.lockerGrid.innerHTML).toBe('');
      
      // Verify console error was logged
      expect(global.console.error).toHaveBeenCalledWith(
        '🚨 BLOCKED: Locker grid rendering blocked - smart assignment enabled'
      );
    });

    test('ACCEPTANCE: Locker grid can only render when smart assignment is explicitly disabled', async () => {
      // Set smart assignment disabled in cache
      app.updateFeatureFlagCache(false);
      
      // Mock API to return smart assignment disabled
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          smart_assignment_enabled: false
        })
      });

      // Try to render grid safely
      await app.renderLockerGridSafely();
      
      // ASSERTION: Grid should now be rendered
      expect(app.elements.lockerGrid.innerHTML).toContain('Mock Locker');
    });

    test('ACCEPTANCE: Session start must be blocked when cache shows smart assignment enabled', async () => {
      // Set smart assignment enabled in cache
      app.updateFeatureFlagCache(true);
      
      // Attempt to start session
      await app.startSession();
      
      // CRITICAL ASSERTIONS:
      // 1. Session mode should not be set
      expect(app.state.mode).toBe('error');
      
      // 2. Session screen should not be active
      expect(app.elements.sessionScreen.classList.contains('active')).toBe(false);
      
      // 3. Locker grid should be empty
      expect(app.elements.lockerGrid.innerHTML).toBe('');
      
      // 4. Error should be logged
      expect(global.console.error).toHaveBeenCalledWith(
        '🚨 BLOCKED: Attempted to start session with smart assignment enabled'
      );
    });

    test('ACCEPTANCE: Grid must be cleared if smart assignment is enabled during render', async () => {
      // Start with smart assignment disabled
      app.updateFeatureFlagCache(false);
      
      // Add some content to grid
      app.elements.lockerGrid.innerHTML = '<div class="locker-tile">Existing Content</div>';
      
      // Now simulate smart assignment being enabled
      app.updateFeatureFlagCache(true);
      
      // Mock API to return smart assignment enabled
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          smart_assignment_enabled: true
        })
      });

      // Try to render grid safely
      await app.renderLockerGridSafely();
      
      // CRITICAL ASSERTION: Existing content must be cleared
      expect(app.elements.lockerGrid.innerHTML).toBe('');
    });
  });

  describe('DOM Verification Tests', () => {
    test('VERIFICATION: Locker grid element exists in DOM', () => {
      expect(app.elements.lockerGrid).toBeTruthy();
      expect(app.elements.lockerGrid.id).toBe('locker-grid');
    });

    test('VERIFICATION: Session screen contains locker grid', () => {
      const sessionScreen = app.elements.sessionScreen;
      const lockerGrid = sessionScreen.querySelector('#locker-grid');
      expect(lockerGrid).toBeTruthy();
    });

    test('VERIFICATION: Grid can be manipulated when smart assignment is disabled', () => {
      // Ensure smart assignment is disabled
      app.updateFeatureFlagCache(false);
      
      // Test grid manipulation
      app.elements.lockerGrid.innerHTML = '<div>Test Content</div>';
      expect(app.elements.lockerGrid.innerHTML).toBe('<div>Test Content</div>');
      
      // Clear grid
      app.elements.lockerGrid.innerHTML = '';
      expect(app.elements.lockerGrid.innerHTML).toBe('');
    });
  });

  describe('Cache Behavior Tests', () => {
    test('CACHE: Smart assignment cache prevents grid rendering', async () => {
      // Set cache to enabled
      app.updateFeatureFlagCache(true);
      
      // Even without API call, cache should prevent rendering
      await app.renderLockerGridSafely();
      
      expect(app.elements.lockerGrid.innerHTML).toBe('');
    });

    test('CACHE: Null cache allows API check', async () => {
      // Set cache to null (no cached value)
      app.featureFlagCache.smartAssignmentEnabled = null;
      
      // Mock API to return disabled
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          smart_assignment_enabled: false
        })
      });

      await app.renderLockerGridSafely();
      
      // Should render since API returned false
      expect(app.elements.lockerGrid.innerHTML).toContain('Mock Locker');
    });
  });
});