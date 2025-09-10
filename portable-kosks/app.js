(function () {
  const el = {
    idle: document.getElementById('idle-screen'),
    session: document.getElementById('session-screen'),
    loading: document.getElementById('loading-screen'),
    error: document.getElementById('error-screen'),
    grid: document.getElementById('locker-grid'),
    loadingText: document.getElementById('loading-text'),
    btnDemoScan: document.getElementById('btn-demo-scan'),
  };

  const LABELS = { available: 'BOŞ', occupied: 'DOLU', opening: 'AÇILIYOR', disabled: 'KAPALI', error: 'HATA' };
  const lockers = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, status: 'available' }));

  function show(name) {
    [el.idle, el.session, el.loading, el.error].forEach(s => s.classList.remove('active'));
    if (name === 'idle') el.idle.classList.add('active');
    if (name === 'session') el.session.classList.add('active');
    if (name === 'loading') el.loading.classList.add('active');
    if (name === 'error') el.error.classList.add('active');
  }

  function renderGrid() {
    el.grid.innerHTML = '';
    lockers.forEach(l => {
      const tile = document.createElement('div');
      tile.className = `locker-tile ${l.status}`;
      tile.setAttribute('role', 'button');
      tile.tabIndex = 0;
      tile.innerHTML = `
        <div class="locker-number">Dolap ${l.id}</div>
        <div class="locker-status">${LABELS[l.status]}</div>
        <div class="locker-hardware" style="font-size:12px;opacity:.7;margin-top:2px;">C${Math.ceil(l.id/16)}R${((l.id-1)%16)+1}</div>
      `;
      tile.addEventListener('click', () => onSelect(l));
      tile.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(l); } });
      el.grid.appendChild(tile);
    });
  }

  function onSelect(locker) {
    if (locker.status !== 'available') return;
    show('loading');
    el.loadingText.textContent = `Dolap ${locker.id} açılıyor...`;
    setTimeout(() => {
      locker.status = 'occupied';
      renderGrid();
      show('idle');
    }, 900);
  }

  function startSessionDemo() {
    show('session');
    renderGrid();
  }

  el.btnDemoScan.addEventListener('click', startSessionDemo);
})();
