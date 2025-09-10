(function () {
  const grid = document.getElementById('locker-grid');
  const tpl = document.getElementById('tile-template');
  const btnScan = document.getElementById('btn-scan');
  const btnRandomize = document.getElementById('btn-randomize');
  const btnReset = document.getElementById('btn-reset');
  const cbAvailable = document.getElementById('cb-available-only');

  const STATES = ['available', 'occupied', 'opening', 'disabled', 'error'];
  const LABELS = {
    available: 'BOŞ',
    occupied: 'DOLU',
    opening: 'AÇILIYOR',
    disabled: 'KAPALI',
    error: 'HATA'
  };

  const lockers = createLockers(48);
  let filterAvailableOnly = false;

  function createLockers(n) {
    const data = [];
    for (let i = 1; i <= n; i++) {
      data.push({ id: i, status: 'available', card: Math.ceil(i / 16), relay: ((i - 1) % 16) + 1 });
    }
    return data;
  }

  function render() {
    grid.innerHTML = '';
    lockers.forEach(l => {
      if (filterAvailableOnly && l.status !== 'available') return;
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.className = `locker-tile ${l.status}`;
      node.dataset.id = l.id;
      node.querySelector('.locker-number').textContent = `Dolap ${String(l.id).padStart(2, '0')}`;
      node.querySelector('.locker-status').textContent = LABELS[l.status] || '—';
      node.querySelector('.locker-hw').textContent = `C${l.card}·R${l.relay}`;
      node.addEventListener('click', () => onTileClick(l));
      grid.appendChild(node);
    });
  }

  function onTileClick(locker) {
    // Simple state machine for demo
    if (locker.status === 'available') {
      // Select → opening → occupied
      locker.status = 'opening';
      render();
      setTimeout(() => { locker.status = 'occupied'; render(); }, 600);
    } else if (locker.status === 'occupied') {
      // Open then release
      locker.status = 'opening';
      render();
      setTimeout(() => { locker.status = 'available'; render(); }, 700);
    } else if (locker.status === 'disabled') {
      // No-op
      shake(locker.id);
    } else if (locker.status === 'error') {
      // Recover
      locker.status = 'available';
      render();
    } else if (locker.status === 'opening') {
      // Ignore
    }
  }

  function shake(id) {
    const el = grid.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 200 });
  }

  function randomize() {
    lockers.forEach(l => {
      const r = Math.random();
      if (r < 0.65) l.status = 'available';
      else if (r < 0.82) l.status = 'occupied';
      else if (r < 0.9) l.status = 'disabled';
      else l.status = 'error';
    });
    render();
  }

  function resetAll() {
    lockers.forEach(l => l.status = 'available');
    render();
  }

  function simulateScan() {
    // Highlight first available
    const next = lockers.find(l => l.status === 'available');
    if (!next) { alert('Boş dolap yok.'); return; }
    onTileClick(next);
  }

  // Events
  btnRandomize.addEventListener('click', randomize);
  btnReset.addEventListener('click', resetAll);
  btnScan.addEventListener('click', simulateScan);
  cbAvailable.addEventListener('change', (e) => { filterAvailableOnly = !!e.target.checked; render(); });

  // First render
  randomize();
})();

