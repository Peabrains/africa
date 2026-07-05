'use strict';

/* ============================================================
   TRIP SWITCHER
   Shown in the app header — tap trip name to switch trips.
   ============================================================ */

const TripSwitcher = (() => {

  function renderSheet() {
    const trips  = Data.getTrips();
    const current = Data.getCurrentTrip();

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.5);display:flex;align-items:flex-end';

    const sheet = document.createElement('div');
    sheet.style.cssText = 'background:var(--bg);width:100%;max-height:70vh;border-radius:20px 20px 0 0;overflow-y:auto;padding-bottom:env(safe-area-inset-bottom)';

    const tripRows = trips.map(t => `
      <div class="trip-switch-row ${t.id === current?.id ? 'trip-switch-row--active' : ''}"
           data-trip-id="${t.id}">
        <span class="trip-switch-emoji">${t.cover_emoji || '🌍'}</span>
        <div class="trip-switch-info">
          <p class="trip-switch-name">${t.name}</p>
          <p class="trip-switch-dates">${t.countries?.join(' · ') || ''} · ${t.status}</p>
        </div>
        ${t.id === current?.id ? '<span style="color:var(--accent);font-size:18px">✓</span>' : ''}
      </div>
    `).join('');

    sheet.innerHTML = `
      <div style="display:flex;justify-content:center;padding:8px 0 0">
        <div style="width:36px;height:4px;background:var(--border);border-radius:2px"></div>
      </div>
      <div style="padding:var(--s4)">
        <p style="font-size:var(--text-lg);font-weight:500;color:var(--text-primary);margin-bottom:var(--s3)">My Trips</p>
        ${tripRows}
        <button id="countries-showcase-btn" style="width:100%;margin-top:var(--s3);background:var(--accent-subtle);border:none;border-radius:var(--r-md);padding:12px;font-size:var(--text-sm);color:var(--accent);font-weight:500;cursor:pointer;font-family:var(--font);display:flex;align-items:center;justify-content:center;gap:6px">🌍 Countries visited</button>
        <div style="margin-top:var(--s4);padding-top:var(--s3);border-top:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center">
          <p style="font-size:var(--text-xs);color:var(--text-muted)">${trips.length} trip${trips.length !== 1 ? 's' : ''}</p>
          <button id="trip-signout-btn" style="background:none;border:none;color:var(--danger-text);font-size:var(--text-sm);cursor:pointer;font-family:var(--font);padding:0">Sign out</button>
        </div>
      </div>`;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    function close() { overlay.remove(); }
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // Trip switch rows
    sheet.querySelectorAll('.trip-switch-row').forEach(row => {
      row.addEventListener('click', async () => {
        const tripId = row.dataset.tripId;
        if (tripId === Data.getCurrentTrip()?.id) { close(); return; }
        close();
        Toast.show('Switching trip…', 'info');
        await Data.switchTrip(tripId);
      });
    });

    // Sign out
    sheet.querySelector('#trip-signout-btn')?.addEventListener('click', async () => {
      if (confirm('Sign out?')) await Auth.signOut();
    });

    // Countries showcase
    sheet.querySelector('#countries-showcase-btn')?.addEventListener('click', () => {
      close();
      window.App?.switchTo('countries');
    });
  }

  function init() {
    // Wire the trip name in the header to open the switcher
    const nameEl = document.getElementById('app-trip-name');
    if (nameEl) {
      nameEl.style.cursor = 'pointer';
      nameEl.addEventListener('click', renderSheet);
    }
  }

  return { init, open: renderSheet };
})();

window.TripSwitcher = TripSwitcher;
