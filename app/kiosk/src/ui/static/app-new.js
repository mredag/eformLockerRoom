/**
 * New Kiosk UI (A/B) – Raspberry Pi friendly
 * - Zero backend changes, uses existing endpoints
 * - RFID keyboard-wedge compatible
 * - 30s session timeout with cleanup
 * - Touch-first, 44px+ targets
 */
(function () {
  'use strict';

  // Small helpers
  const $ = (sel) => document.querySelector(sel);
  const qs = (root, sel) => (root || document).querySelector(sel);
  const ce = (tag, cls) => { const el = document.createElement(tag); if (cls) el.className = cls; return el; };

  function getQueryParam(name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
  }

  function nowSeconds() { return Math.floor(Date.now() / 1000); }

  class NewKioskApp {
    constructor() {
      // Config
      this.kioskId = getQueryParam('kiosk') || getQueryParam('kiosk_id') || localStorage.getItem('kiosk_id') || 'kiosk-1';
      this.sessionTimeoutSeconds = 30;

      // State
      this.state = {
        mode: 'idle', // idle | session | loading | error
        sessionId: null,
        sessionEndsAt: 0,
        cardId: null,
        lockers: [],
        error: null,
      };

      // Timers
      this._countdownTimer = null;
      this._rfidBuffer = '';
      this._rfidTimer = null;
      this._rfidDebounceMs = 500;

      // Elements
      this.$idle = $('#idle-screen');
      this.$session = $('#session-screen');
      this.$loading = $('#loading-screen');
      this.$error = $('#error-screen');
      this.$grid = $('#locker-grid');
      this.$timerWrap = $('#session-timer');
      this.$countdown = $('#countdown-value');
      this.$conn = $('#connection-status');
      this.$retry = $('#retry-button');
      this.$return = $('#return-button');

      // Bindings
      this.handleKey = this.handleKey.bind(this);
      this.tickCountdown = this.tickCountdown.bind(this);

      // Init
      this.installEvents();
      this.show('idle');
      this.updateConnection(navigator.onLine);

      console.log('NewKioskApp ready. KIOSK_ID =', this.kioskId);

      // Expose minimal hooks for Pi optimizations
      window.kioskApp = this;
    }

    // Public hooks for pi-config.js
    pollForUpdates() { /* no-op placeholder for A/B UI */ }
    optimizeMemoryUsage() { /* lightweight, nothing cached heavily */ }

    installEvents() {
      window.addEventListener('keydown', this.handleKey);
      window.addEventListener('online', () => this.updateConnection(true));
      window.addEventListener('offline', () => this.updateConnection(false));
      this.$return?.addEventListener('click', () => this.reset());
      this.$retry?.addEventListener('click', () => this.retry());
    }

    updateConnection(online) {
      if (!this.$conn) return;
      this.$conn.classList.toggle('offline', !online);
      const label = qs(this.$conn, '.label');
      if (label) label.textContent = online ? 'Bağlı' : 'Çevrimdışı';
    }

    show(mode) {
      this.state.mode = mode;
      // Toggle screens
      this.$idle?.setAttribute('hidden', mode !== 'idle');
      this.$session?.setAttribute('hidden', mode !== 'session');
      this.$loading?.setAttribute('hidden', mode !== 'loading');
      this.$error?.setAttribute('hidden', mode !== 'error');
      this.$idle?.classList.toggle('active', mode === 'idle');
    }

    startSession(sessionId, timeoutSeconds) {
      this.state.sessionId = sessionId;
      const seconds = Number(timeoutSeconds) || this.sessionTimeoutSeconds;
      this.state.sessionEndsAt = nowSeconds() + seconds;
      this.$timerWrap?.removeAttribute('hidden');
      this.updateCountdown();
      if (this._countdownTimer) clearInterval(this._countdownTimer);
      this._countdownTimer = setInterval(this.tickCountdown, 1000);
    }

    tickCountdown() {
      this.updateCountdown();
      if (nowSeconds() >= this.state.sessionEndsAt) {
        this.onSessionExpired();
      }
    }

    updateCountdown() {
      const remain = Math.max(0, this.state.sessionEndsAt - nowSeconds());
      if (this.$countdown) this.$countdown.textContent = String(remain);
    }

    onSessionExpired() {
      if (this._countdownTimer) { clearInterval(this._countdownTimer); this._countdownTimer = null; }
      this.$timerWrap?.setAttribute('hidden', '');
      this.state.sessionId = null;
      this.state.sessionEndsAt = 0;
      this.showError('Süre doldu', 'Kartınızı tekrar okutun', true);
    }

    handleKey(e) {
      // Keyboard-wedge RFID: numbers + Enter
      const key = e.key;
      if (key === 'Enter') {
        const card = this._rfidBuffer.trim();
        this._rfidBuffer = '';
        if (card) {
          this.onCard(card);
        }
        return;
      }
      if (/^[0-9]$/.test(key)) {
        this._rfidBuffer += key;
        if (this._rfidTimer) clearTimeout(this._rfidTimer);
        this._rfidTimer = setTimeout(() => { this._rfidBuffer = ''; }, this._rfidDebounceMs);
      }
    }

    async onCard(cardId) {
      try {
        this.state.cardId = cardId;
        this.show('loading');
        this.setLoading('Kart okunuyor...');

        // Check existing assignment and/or start session
        const res = await fetch('/api/rfid/handle-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ card_id: cardId, kiosk_id: this.kioskId })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Sunucu hatası');

        if (data.action === 'open_locker') {
          // Locker opened for existing assignment
          this.setLoading(data.message || 'Dolap açılıyor...');
          // Short delay then return to idle
          setTimeout(() => this.reset(), 1200);
          return;
        }

        if (data.action === 'show_lockers' && Array.isArray(data.lockers)) {
          this.state.lockers = data.lockers;
          this.renderLockers(data.lockers);
          this.show('session');
          this.startSession(data.session_id, data.timeout_seconds || 30);
          return;
        }

        // Fallback
        this.showError('Beklenmeyen yanıt', 'Tekrar deneyin', true);
      } catch (err) {
        console.error('RFID flow error', err);
        this.showError('Bağlantı hatası', 'Tekrar deneyin', true);
      }
    }

    setLoading(text) {
      const el = $('#loading-text');
      if (el) el.textContent = text;
    }

    renderLockers(lockers) {
      this.$grid.innerHTML = '';
      for (const l of lockers) {
        const available = (l.status === 'available' || l.status === 'free' || l.status === 'Free');
        const tile = ce('button', 'locker-tile touch-target');
        tile.type = 'button';
        tile.setAttribute('role', 'listitem');
        tile.classList.add(available ? 'available' : (l.status === 'disabled' ? 'disabled' : 'occupied'));
        tile.disabled = !available;
        const name = ce('div', 'locker-name'); name.textContent = l.display_name || l.displayName || `Dolap ${l.id}`;
        const status = ce('div', 'locker-status'); status.textContent = available ? 'Müsait' : 'Uygun değil';
        tile.appendChild(name); tile.appendChild(status);
        if (available) {
          tile.addEventListener('click', () => this.selectLocker(l.id));
        }
        this.$grid.appendChild(tile);
      }
    }

    async selectLocker(lockerId) {
      if (!this.state.sessionId) {
        this.showError('Oturum geçersiz', 'Kartınızı tekrar okutun', true);
        return;
      }
      try {
        this.show('loading');
        this.setLoading('Dolap atanıyor...');

        // Prefer session-aware selection; uses existing endpoint
        let res = await fetch('/api/lockers/select', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locker_id: lockerId, kiosk_id: this.kioskId, session_id: this.state.sessionId })
        });
        let data = await res.json();

        // If select route not available, fall back to assign
        if (res.status === 404) {
          res = await fetch('/api/locker/assign', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lockerId, cardId: this.state.cardId, kioskId: this.kioskId })
          });
          data = await res.json();
        }

        if (!res.ok) throw new Error(data?.message || 'İşlem başarısız');

        if (data.success || data.action === 'assignment_complete') {
          this.setLoading(data.message || 'Dolap açılıyor...');
          setTimeout(() => this.reset(), 1500);
          return;
        }

        // Error payload
        this.showError(data.message || 'Dolap atanamadı', true ? 'Farklı dolap seçin' : 'Tekrar deneyin', true);
      } catch (err) {
        console.error('Select error', err);
        this.showError('Sunucu hatası', 'Tekrar deneyin', true);
      }
    }

    retry() {
      // Simple retry returns to session if available
      if (this.state.lockers?.length) {
        this.show('session');
      } else {
        this.reset();
      }
    }

    reset() {
      if (this._countdownTimer) { clearInterval(this._countdownTimer); this._countdownTimer = null; }
      this.$timerWrap?.setAttribute('hidden', '');
      this.state = { mode: 'idle', sessionId: null, sessionEndsAt: 0, cardId: null, lockers: [], error: null };
      this.$grid.innerHTML = '';
      this.show('idle');
    }

    showError(title, desc, showRetry) {
      const t = $('#error-text'); if (t) t.textContent = title || 'Hata';
      const d = $('#error-description'); if (d) d.textContent = desc || '';
      if (this.$retry) this.$retry.toggleAttribute('hidden', !showRetry);
      this.show('error');
    }
  }

  // Bootstrap on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new NewKioskApp());
  } else {
    new NewKioskApp();
  }
})();

