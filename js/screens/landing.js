'use strict';

/* ============================================================
   LANDING SCREEN — the app's true front door (loads on cold
   start). Layout: wordmark → "Hello, {name}" → countries stat
   → flight watch stat → "Where to?" trip cards. World Map and
   Flight Watch are collapsed, labeled, tap-to-expand rows —
   never full-width tabs competing with picking a trip.
   ============================================================ */

const LandingScreen = (() => {
  let root = null;
  let activeTab = 'trips'; // 'trips' (home) | 'world' (full map view, entered via the countries row)
  let flightExpanded = false;
  let activeCabin = 'Economy';
  let worldGeoJson = null;
  let visitedSet = new Set();
  let leafletMap = null;
  let searchQuery = '';
  let greetName = '';

  function flagEmoji(iso2) {
    if (!iso2 || iso2.length !== 2) return '🏳️';
    return String.fromCodePoint(
      ...iso2.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0))
    );
  }

  async function loadGeoJson() {
    if (worldGeoJson) return worldGeoJson;
    const res = await fetch('data/world-countries.geojson');
    worldGeoJson = await res.json();
    return worldGeoJson;
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const ms = new Date(dateStr + 'T00:00:00') - new Date(new Date().toDateString());
    return Math.round(ms / 86400000);
  }

  /* ── Wordmark + greeting + countries/flight summary rows ──── */
  function wordmarkRow() {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:calc(22px + env(safe-area-inset-top)) var(--s4) 4px';
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:34px;height:34px;border-radius:10px;overflow:hidden;flex-shrink:0"><img src="icons/icon-192.png" alt="" style="width:100%;height:100%;object-fit:cover;display:block"></div>
        <span style="font-size:16px;font-weight:800;letter-spacing:.01em;color:var(--text-primary)">TRIP COMPANION</span>
        <span style="font-size:9px;font-weight:600;color:var(--text-muted);font-family:monospace;background:var(--surface-raised);border-radius:5px;padding:2px 5px">${Config.APP_VERSION || ''}</span>
      </div>
      <button id="landing-settings-btn" style="width:32px;height:32px;border-radius:10px;background:var(--surface-raised);border:none;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);cursor:pointer">${Icons.settings('icon-sm')}</button>`;
    row.querySelector('#landing-settings-btn').addEventListener('click', () => AccountScreen.open(() => render()));
    return row;
  }

  function greetRow() {
    const el = document.createElement('div');
    el.style.cssText = 'padding:14px var(--s4) 18px';
    el.innerHTML = `<p style="font-size:26px;font-weight:700;color:var(--text-primary);letter-spacing:-.01em">Hello${greetName ? ', ' + greetName : ''}</p>`;
    return el;
  }

  function statRow({ icon, title, sub, onClick }) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;margin:0 var(--s4) 10px;padding:12px 14px;background:var(--surface);border-radius:14px;border:1px solid var(--border-subtle);cursor:pointer';
    row.innerHTML = `
      <span style="color:var(--text-secondary);flex-shrink:0;display:flex">${icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--text-primary)">${title}</div>
        ${sub ? `<div style="font-size:10px;color:var(--text-muted);margin-top:1px">${sub}</div>` : ''}
      </div>
      <span style="color:var(--text-muted);font-size:13px;flex-shrink:0">→</span>`;
    row.addEventListener('click', onClick);
    return row;
  }

  async function countriesStatRow(container) {
    await loadGeoJson();
    visitedSet = new Set(await Data.getVisitedCountries());
    const totalCodes = new Set(worldGeoJson.features.map(f => f.properties.iso2).filter(Boolean));
    const visitedCount = [...visitedSet].filter(c => totalCodes.has(c)).length;
    const continents = new Set(
      worldGeoJson.features
        .filter(f => visitedSet.has(f.properties.iso2))
        .map(f => f.properties.continent)
        .filter(Boolean)
    );
    container.appendChild(statRow({
      icon: Icons.globe('icon-sm'),
      title: `${visitedCount} countries visited · ${continents.size} continents`,
      onClick: () => { activeTab = 'world'; render(); },
    }));
  }

  function flightStatRow(container) {
    FlightPrice.prefetch(() => render()); // no-op if already fetched this session
    const fp = FlightPrice.getCached();
    const totEcon = fp ? FlightPrice.totals('Economy') : [];
    const totBiz  = fp ? FlightPrice.totals('Business') : [];
    const latestEcon = totEcon[totEcon.length - 1];
    const latestBiz  = totBiz[totBiz.length - 1];
    const updated = latestEcon || latestBiz;
    let sub = 'Checking latest fares…';
    if (fp && updated) {
      const parts = [];
      if (latestEcon) parts.push(`Econ ${latestEcon.total.toLocaleString()}`);
      if (latestBiz)  parts.push(`Biz ${latestBiz.total.toLocaleString()}`);
      sub = `${parts.join(' · ')} ${fp.currency} · updated ${new Date(updated.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
    }
    container.appendChild(statRow({
      icon: Icons.plane('icon-sm'),
      title: 'KUL ⇄ KIX flight watch',
      sub,
      onClick: () => { flightExpanded = !flightExpanded; render(); },
    }));
    if (flightExpanded) {
      const card = document.createElement('div');
      card.style.cssText = 'margin:0 var(--s4) 14px;padding:14px;background:var(--surface);border-radius:14px;border:1px solid var(--border-subtle)';
      container.appendChild(card);
      renderFlightPriceBody(card);
    }
  }

  function renderTripsTab(container) {
    const trips = Data.getTrips();
    const current = Data.getCurrentTrip();

    const heading = document.createElement('div');
    heading.style.cssText = 'padding:20px var(--s4) 10px';
    heading.innerHTML = `<p style="font-size:21px;font-weight:700;color:var(--text-primary)">Where to?</p><p style="font-size:12px;color:var(--text-muted);margin-top:4px">${trips.length} trip${trips.length===1?'':'s'} planned</p>`;
    container.appendChild(heading);

    if (!trips.length) {
      const empty = document.createElement('p');
      empty.style.cssText = 'text-align:center;color:var(--text-muted);font-size:var(--text-sm);padding:var(--s6) var(--s4)';
      empty.textContent = 'No trips yet — create your first one below.';
      container.appendChild(empty);
    }

    trips.forEach(t => {
      const isPast = t.status === 'completed' || (t.end_date && new Date(t.end_date) < new Date());
      const isOngoing = !isPast && t.start_date && new Date(t.start_date) <= new Date();
      const dLeft = daysUntil(t.start_date);

      const card = document.createElement('div');
      card.style.cssText = 'background:var(--surface);border-radius:20px;padding:16px;display:flex;align-items:center;gap:14px;margin:0 var(--s4) 12px;border:1px solid var(--border-subtle);box-shadow:0 1px 4px rgba(0,0,0,.05);cursor:pointer;position:relative';

      const dateRange = [t.start_date, t.end_date].filter(Boolean)
        .map(d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }))
        .join(' – ');

      let countdownHtml;
      if (isPast) {
        countdownHtml = `<div style="text-align:center;flex-shrink:0"><div style="font-size:16px">✓</div><div style="font-size:8px;font-weight:700;color:var(--text-muted);text-transform:uppercase">Done</div></div>`;
      } else if (isOngoing) {
        countdownHtml = `<div style="text-align:center;flex-shrink:0"><div style="font-size:11px;font-weight:800;color:var(--text-primary)">Now</div><div style="font-size:8px;font-weight:700;color:var(--text-muted);text-transform:uppercase">Ongoing</div></div>`;
      } else {
        countdownHtml = `<div style="text-align:center;flex-shrink:0"><div style="font-size:20px;font-weight:800;color:var(--text-primary);line-height:1">${dLeft}</div><div style="font-size:8px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-top:2px">days to go</div></div>`;
      }

      card.innerHTML = `
        <div style="width:48px;height:48px;border-radius:50%;flex-shrink:0;background:var(--surface-raised);border:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:center;font-size:23px">${t.cover_emoji || '🧭'}</div>
        <div style="flex:1;min-width:0">
          <p style="font-size:16px;font-weight:700;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.name}${current?.id === t.id ? ' <span style=\'color:var(--accent);font-size:10px;font-weight:600\'>· current</span>' : ''}</p>
          <p style="font-size:11px;color:var(--text-secondary);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(t.countries || []).join(' · ')}</p>
          ${dateRange ? `<p style="font-size:10.5px;color:var(--text-muted);margin-top:2px">${dateRange}</p>` : ''}
        </div>
        ${countdownHtml}
        <button class="trip-del-btn" style="position:absolute;top:10px;right:10px;background:none;border:none;color:var(--text-muted);font-size:16px;cursor:pointer;padding:2px 4px;line-height:1">×</button>`;
      card.addEventListener('click', async (e) => {
        if (e.target.classList.contains('trip-del-btn')) return;
        if (current?.id === t.id) { App.switchTo('itinerary'); return; }
        Toast.show('Switching trip…', 'info');
        await Data.switchTrip(t.id);
        App.switchTo('itinerary');
      });


      let delArmed = false, delTimer = null;
      const delBtn = card.querySelector('.trip-del-btn');
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!delArmed) {
          delArmed = true;
          delBtn.textContent = '✓';
          delBtn.style.color = 'var(--danger-text)';
          delBtn.title = `Tap again to permanently delete "${t.name}" and everything in it`;
          delTimer = setTimeout(() => {
            delArmed = false;
            delBtn.textContent = '×';
            delBtn.style.color = 'var(--text-muted)';
          }, 4000);
          return;
        }
        clearTimeout(delTimer);
        try {
          await Data.deleteTrip(t.id);
          Toast.show(`${t.name} deleted`, 'info');
          render();
        } catch (err) {
          Toast.show('Could not delete: ' + err.message, 'danger');
        }
      });
      container.appendChild(card);
    });

    const newBtn = document.createElement('div');
    newBtn.style.cssText = 'margin:4px var(--s4) var(--s6);padding:14px;text-align:center;border:1.5px dashed var(--text-muted);border-radius:14px;color:var(--text-secondary);font-size:var(--text-sm);font-weight:700;cursor:pointer';
    newBtn.textContent = '+ New Trip';
    newBtn.addEventListener('click', () => renderNewTripForm(container));
    container.appendChild(newBtn);
  }

  function renderNewTripForm(container) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:250;background:rgba(0,0,0,.5);display:flex;align-items:flex-end';
    overlay.innerHTML = `
      <div style="background:var(--bg);width:100%;border-radius:20px 20px 0 0;padding:var(--s4);padding-bottom:calc(var(--s4) + env(safe-area-inset-bottom))">
        <p style="font-size:var(--text-lg);font-weight:600;color:var(--text-primary);margin-bottom:var(--s4)">New Trip</p>
        <div class="bs-edit-group"><label class="bs-edit-label">Trip name</label><input id="nt-name" class="bs-input" type="text" placeholder="e.g. Japan Spring 2027"></div>
        <div class="bs-edit-group"><label class="bs-edit-label">Cover emoji</label><input id="nt-emoji" class="bs-input" type="text" placeholder="🧭" maxlength="4"></div>
        <div class="bs-edit-group"><label class="bs-edit-label">Start date</label><input id="nt-start" class="bs-input" type="date"></div>
        <div class="bs-edit-group"><label class="bs-edit-label">End date</label><input id="nt-end" class="bs-input" type="date"></div>
        <div class="bs-edit-group"><label class="bs-edit-label">Countries (comma-separated)</label><input id="nt-countries" class="bs-input" type="text" placeholder="e.g. Japan"></div>
        <div class="bs-edit-group"><label class="bs-edit-label">Currency</label><input id="nt-currency" class="bs-input" type="text" placeholder="e.g. JPY, USD" maxlength="3"></div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:var(--s4)">
          <button id="nt-create-btn" class="btn btn-primary" style="width:100%">Create trip</button>
          <button id="nt-cancel-btn" class="btn btn-ghost" style="width:100%">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#nt-cancel-btn').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#nt-create-btn').addEventListener('click', async (e) => {
      const btn = e.target;
      const name = overlay.querySelector('#nt-name').value.trim();
      if (!name) { Toast.show('Trip name is required', 'warning'); return; }
      const countries = overlay.querySelector('#nt-countries').value
        .split(',').map(s => s.trim()).filter(Boolean);
      btn.disabled = true; btn.textContent = 'Creating…';
      try {
        const trip = await Data.createTrip({
          name,
          coverEmoji: overlay.querySelector('#nt-emoji').value.trim() || '🧭',
          startDate: overlay.querySelector('#nt-start').value,
          endDate: overlay.querySelector('#nt-end').value,
          countries,
          currency: overlay.querySelector('#nt-currency').value.trim().toUpperCase() || 'USD',
        });
        overlay.remove();
        Toast.show('Trip created', 'success');
        await Data.switchTrip(trip.id);
        App.switchTo('itinerary');
      } catch (err) {
        Toast.show('Could not create trip: ' + err.message, 'danger');
        btn.disabled = false; btn.textContent = 'Create trip';
      }
    });
  }

  /* ─── Flight Watch — MH52/53 KUL⇄KIX ─────────────────────────
     Trip-independent, so it lives here rather than in Bookings
     (which is scoped to whichever trip is currently active).
     External read-only feed (see flight-price.js). Display-only:
     no editing, no Supabase write. ────────────────────────────── */
  function svgFromString(svgStr) {
    const div = document.createElement('div');
    div.innerHTML = svgStr.trim();
    return div.firstElementChild;
  }

  function buildSparkline(values) {
    const w = 120, h = 30, pad = 3;
    const min = Math.min(...values), max = Math.max(...values);
    const span = (max - min) || 1;
    const x = i => pad + (i * (w - 2*pad) / ((values.length - 1) || 1));
    const y = v => (h - pad) - ((v - min) / span) * (h - 2*pad);
    const pts = values.map((v,i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const lastX = x(values.length-1), lastY = y(values[values.length-1]);
    return svgFromString(`
      <svg width="90" height="30" viewBox="0 0 ${w} ${h}">
        <polyline points="${pts}" fill="none" stroke="var(--text-secondary)" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.5" fill="var(--accent)"/>
      </svg>`);
  }

  function buildLineChart(seriesA, seriesB) {
    const dates = Array.from(new Set([...seriesA.map(p=>p.date), ...seriesB.map(p=>p.date)])).sort();
    const allPrices = [...seriesA, ...seriesB].map(p=>p.price);
    const min = Math.min(...allPrices), max = Math.max(...allPrices);
    const span = (max - min) || 1;
    // Left margin widened to fit y-axis price labels; plot area
    // shrinks accordingly rather than the SVG growing.
    const padXL = 36, padXR = 306, topY = 14, botY = 118;
    const xOf = d => padXL + (dates.indexOf(d) * (padXR - padXL) / ((dates.length - 1) || 1));
    const yOf = v => botY - ((v - min) / span) * (botY - topY);
    const lineFor = (series, color) => {
      const pts = series.filter(p=>p.price!=null);
      const line = pts.map(p => `${xOf(p.date).toFixed(1)},${yOf(p.price).toFixed(1)}`).join(' ');
      const dots = pts.map((p, i) => {
        const isLast = i === pts.length - 1;
        const cx = xOf(p.date).toFixed(1), cy = yOf(p.price).toFixed(1);
        return isLast
          ? `<circle cx="${cx}" cy="${cy}" r="3" fill="${color}"/>`
          : `<circle cx="${cx}" cy="${cy}" r="2" fill="var(--surface-raised)" stroke="${color}" stroke-width="1.3"/>`;
      }).join('');
      return `<polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
    };
    // Small tick per date on the x-axis — makes the reading count
    // countable at a glance even where the two lines overlap.
    const ticks = dates.map(d => {
      const x = xOf(d).toFixed(1);
      return `<line x1="${x}" y1="116" x2="${x}" y2="120" stroke="var(--border)" stroke-width="1"/>`;
    }).join('');
    const fmtDate = d => new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
    // Date labels are anchored to the SAME xOf() the dots/ticks use —
    // not independent pixel guesses — so they line up with the real
    // first/last markers. text-anchor flips per side so each label
    // grows away from the canvas edge instead of running off it.
    const firstX = xOf(dates[0]).toFixed(1), lastX = xOf(dates[dates.length-1]).toFixed(1);
    return svgFromString(`
      <svg viewBox="0 0 320 150">
        <line x1="${padXL}" y1="${topY}" x2="${padXL}" y2="${botY}" stroke="var(--border)" stroke-width="1"/>
        <line x1="${padXL}" y1="${botY}" x2="${padXR}" y2="${botY}" stroke="var(--border)" stroke-width="1"/>
        <text x="${padXL - 6}" y="${topY + 3}" font-size="8" fill="var(--text-muted)" text-anchor="end">${Math.round(max).toLocaleString()}</text>
        <text x="${padXL - 6}" y="${botY + 3}" font-size="8" fill="var(--text-muted)" text-anchor="end">${Math.round(min).toLocaleString()}</text>
        ${ticks}
        ${lineFor(seriesA, 'var(--flight-line-1)')}
        ${lineFor(seriesB, 'var(--flight-line-2)')}
        <text x="${firstX}" y="134" font-size="8" fill="var(--text-muted)" text-anchor="start">${fmtDate(dates[0])}</text>
        <text x="${lastX}" y="134" font-size="8" fill="var(--text-muted)" text-anchor="end">${fmtDate(dates[dates.length-1])}</text>
      </svg>`);
  }

  function renderFlightPriceBody(el) {
    el.innerHTML = '';
    const status = FlightPrice.getStatus();

    if (status === 'idle' || status === 'loading') {
      const em = document.createElement('p');
      em.style.cssText = 'font-size:var(--text-sm);color:var(--text-muted);padding:var(--s2) 0 0';
      em.textContent = 'Loading price history…';
      el.appendChild(em);
      return;
    }
    if (status === 'error') {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'padding:var(--s2) 0 0';
      wrap.innerHTML = `<p style="font-size:var(--text-sm);color:var(--text-muted)">Couldn't load price history — check your connection.</p>`;
      const retryBtn = document.createElement('button');
      retryBtn.className = 'btn btn-ghost';
      retryBtn.style.cssText = 'margin-top:var(--s2);padding:6px 14px;min-height:32px;font-size:var(--text-xs)';
      retryBtn.textContent = 'Retry';
      retryBtn.addEventListener('click', () => FlightPrice.retry(() => render()));
      wrap.appendChild(retryBtn);
      el.appendChild(wrap);
      return;
    }

    const fp = FlightPrice.getCached();
    if (!fp.days.length) {
      const em = document.createElement('p');
      em.style.cssText = 'font-size:var(--text-sm);color:var(--text-muted);padding:var(--s2) 0 0';
      em.textContent = 'No price readings yet — check back once the daily monitor has run.';
      el.appendChild(em);
      return;
    }

    const toggle = document.createElement('div');
    toggle.style.cssText = 'display:flex;background:var(--flight-accent-subtle);border-radius:var(--r-pill);padding:3px;margin:var(--s2) 0 var(--s3)';
    ['Economy','Business'].forEach(cab => {
      const btn = document.createElement('button');
      btn.textContent = cab;
      const isActive = activeCabin === cab;
      btn.style.cssText = `flex:1;text-align:center;padding:6px 0;font-size:var(--text-xs);font-weight:500;border:none;border-radius:var(--r-pill);cursor:pointer;font-family:var(--font);background:${isActive?'var(--surface)':'none'};color:${isActive?'var(--flight-accent)':'var(--text-secondary)'};${isActive?'box-shadow:0 1px 2px rgba(0,0,0,.08)':''}`;
      btn.addEventListener('click', () => { activeCabin = cab; renderFlightPriceBody(el); });
      toggle.appendChild(btn);
    });
    el.appendChild(toggle);

    const cabin = activeCabin;
    const mh52 = FlightPrice.series('MH52', cabin);
    const mh53 = FlightPrice.series('MH53', cabin);
    const tot  = FlightPrice.totals(cabin);

    if (!tot.length) {
      const em = document.createElement('p');
      em.style.cssText = 'font-size:var(--text-sm);color:var(--text-muted);padding:var(--s2) 0';
      em.textContent = `No ${cabin} readings yet.`;
      el.appendChild(em);
      return;
    }

    const cur = fp.currency;
    const latest = tot[tot.length-1];
    const minTotal = Math.min(...tot.map(t=>t.total));
    const isLowestNow = latest.total === minTotal;

    const totalCard = document.createElement('div');
    totalCard.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:var(--s3);background:var(--flight-accent-subtle);border-radius:var(--r-md);padding:10px 12px;margin-bottom:var(--s3)';
    totalCard.innerHTML = `
      <div>
        <p style="font-size:var(--text-xs);color:var(--text-secondary)">Total round-trip · ${cabin}</p>
        <p style="font-size:19px;font-weight:600;color:var(--text-primary);margin-top:1px;display:flex;align-items:baseline;gap:5px;flex-wrap:wrap">
          ${latest.total.toLocaleString()} <span style="font-size:var(--text-xs);font-weight:500;color:var(--text-muted)">${cur}</span>
          ${isLowestNow ? `<span class="badge badge-booked" style="margin-left:4px">🔥 Lowest yet</span>` : ''}
        </p>
      </div>
      <div class="fp-spark-slot"></div>`;
    el.appendChild(totalCard);
    totalCard.querySelector('.fp-spark-slot').appendChild(buildSparkline(tot.map(t=>t.total)));

    const lastMh52 = mh52[mh52.length-1]?.price;
    const lastMh53 = mh53[mh53.length-1]?.price;
    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:var(--s4);margin-bottom:var(--s2)';
    legend.innerHTML = `
      <div style="display:flex;align-items:center;gap:5px;font-size:var(--text-xs);color:var(--text-secondary)"><span style="width:8px;height:8px;border-radius:50%;background:var(--flight-line-1);display:inline-block"></span>MH52 out <span style="font-weight:600;color:var(--text-primary)">${lastMh52?.toLocaleString() ?? '—'}</span></div>
      <div style="display:flex;align-items:center;gap:5px;font-size:var(--text-xs);color:var(--text-secondary)"><span style="width:8px;height:8px;border-radius:50%;background:var(--flight-line-2);display:inline-block"></span>MH53 back <span style="font-weight:600;color:var(--text-primary)">${lastMh53?.toLocaleString() ?? '—'}</span></div>`;
    el.appendChild(legend);

    const chartWrap = document.createElement('div');
    chartWrap.style.cssText = 'background:var(--bg);border-radius:var(--r-md);padding:var(--s2) var(--s2) 4px';
    chartWrap.appendChild(buildLineChart(mh52, mh53));
    el.appendChild(chartWrap);

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;margin-top:var(--s3);font-size:var(--text-xs)';
    const rows = tot.slice(-10).reverse();
    const th = 'text-align:right;color:var(--text-muted);font-weight:500;padding:4px 2px;border-bottom:1px solid var(--border-subtle)';
    const thL = 'text-align:left;' + th.replace('text-align:right;', '');
    table.innerHTML = `
      <thead><tr>
        <th style="${thL}">Checked</th><th style="${th}">MH52</th><th style="${th}">MH53</th><th style="${th}">Total</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => {
          const m52 = mh52.find(p=>p.date===r.date)?.price;
          const m53 = mh53.find(p=>p.date===r.date)?.price;
          const isMin = r.total === minTotal;
          const dateLbl = new Date(r.date+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
          return `<tr>
            <td style="text-align:left;color:var(--text-secondary);padding:5px 2px;border-bottom:1px solid var(--border-subtle)">${dateLbl}</td>
            <td style="text-align:right;padding:5px 2px;border-bottom:1px solid var(--border-subtle)">${m52?.toLocaleString() ?? '—'}</td>
            <td style="text-align:right;padding:5px 2px;border-bottom:1px solid var(--border-subtle)">${m53?.toLocaleString() ?? '—'}</td>
            <td style="text-align:right;font-weight:600;padding:5px 2px;border-bottom:1px solid var(--border-subtle);${isMin?'color:var(--success-text)':''}">${r.total.toLocaleString()}${isMin?' 🔻':''}</td>
          </tr>`;
        }).join('')}
      </tbody>`;
    el.appendChild(table);

    if (tot.length > 10) {
      const note = document.createElement('p');
      note.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted);margin-top:6px;text-align:center';
      note.textContent = `Showing last 10 of ${tot.length} readings`;
      el.appendChild(note);
    }
  }


  function countryStyle(feature) {
    const code = feature.properties.iso2;
    const visited = code && visitedSet.has(code);
    return {
      fillColor: visited ? '#C49A5A' : '#5A5448',
      fillOpacity: visited ? 0.85 : 0.3,
      color: '#7A5C2E',
      weight: 0.6,
    };
  }

  async function toggleCountry(code, name) {
    if (!code) { Toast.show(`${name} doesn't have an assignable country code`, 'info'); return; }
    try {
      await Data.toggleVisitedCountry(code);
      visitedSet = new Set(await Data.getVisitedCountries());
      render();
    } catch (e) {
      Toast.show('Could not save — check connection', 'danger');
    }
  }

  function renderMap(container) {
    const mapEl = document.createElement('div');
    mapEl.style.cssText = 'width:100%;height:180px;border-radius:var(--r-md);overflow:hidden;background:#1A1712';
    container.appendChild(mapEl);

    requestAnimationFrame(() => {
      leafletMap = L.map(mapEl, {
        worldCopyJump: false,
        maxBounds: [[-89, -180], [89, 180]],
        maxZoom: 8,
        // No minZoom constraint — let fitBounds compute whatever zoom
        // actually shows the whole world in this container's real size.
        // A hardcoded minZoom was preventing it from zooming out enough
        // in a compact container, cropping the map.
      });

      L.geoJSON(worldGeoJson, {
        style: countryStyle,
        onEachFeature: (feature, lyr) => {
          lyr.on('click', () => toggleCountry(feature.properties.iso2, feature.properties.name));
        },
      }).addTo(leafletMap);

      leafletMap.fitBounds([[-58, -180], [83, 180]]);
    });
  }

  function renderFlagGrid(container) {
    const q = searchQuery.trim().toLowerCase();
    const byContinent = {};
    worldGeoJson.features
      .filter(f => f.properties.iso2)
      .filter(f => !q || f.properties.name.toLowerCase().includes(q))
      .sort((a, b) => a.properties.name.localeCompare(b.properties.name))
      .forEach(f => {
        const cont = f.properties.continent || 'Other';
        (byContinent[cont] = byContinent[cont] || []).push(f);
      });

    const continentOrder = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Antarctica', 'Other'];
    const continents = Object.keys(byContinent).sort((a, b) => continentOrder.indexOf(a) - continentOrder.indexOf(b));

    if (!continents.length) {
      const none = document.createElement('p');
      none.style.cssText = 'text-align:center;color:var(--text-muted);font-size:var(--text-sm);padding:var(--s4)';
      none.textContent = 'No countries match your search.';
      container.appendChild(none);
      return;
    }

    continents.forEach(cont => {
      const label = document.createElement('p');
      label.style.cssText = 'font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin:var(--s3) 0 var(--s2)';
      label.textContent = cont;
      container.appendChild(label);

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:8px';
      byContinent[cont].forEach(f => {
        const code = f.properties.iso2;
        const name = f.properties.name;
        const visited = visitedSet.has(code);
        const cell = document.createElement('button');
        cell.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:2px;background:none;border:none;cursor:pointer;padding:6px 2px;border-radius:var(--r-md);opacity:${visited ? '1' : '.32'}`;
        cell.innerHTML = `<span style="font-size:24px;line-height:1;${visited ? 'filter:drop-shadow(0 2px 3px rgba(122,92,46,.4))' : ''}">${flagEmoji(code)}</span><span style="font-size:9px;color:var(--text-muted);text-align:center;line-height:1.15">${name}</span>`;
        cell.addEventListener('click', () => toggleCountry(code, name));
        grid.appendChild(cell);
      });
      container.appendChild(grid);
    });
  }

  function renderWorldTab(container) {
    const totalCodes = new Set(worldGeoJson.features.map(f => f.properties.iso2).filter(Boolean));
    const visitedCount = [...visitedSet].filter(c => totalCodes.has(c)).length;
    const pct = totalCodes.size ? Math.round((visitedCount / totalCodes.size) * 100) : 0;

    const stat = document.createElement('div');
    stat.style.cssText = 'padding:0 var(--s4) var(--s3)';
    stat.innerHTML = `<p style="font-size:28px;font-weight:700;color:var(--text-primary);line-height:1.1">${visitedCount}<span style="font-size:14px;font-weight:400;color:var(--text-muted)"> of ${totalCodes.size} countries · ${pct}%</span></p>`;
    container.appendChild(stat);

    const mapWrap = document.createElement('div');
    mapWrap.style.cssText = 'padding:0 var(--s4) var(--s3)';
    container.appendChild(mapWrap);
    renderMap(mapWrap);

    const searchWrap = document.createElement('div');
    searchWrap.style.cssText = 'padding:0 var(--s4) var(--s2)';
    searchWrap.innerHTML = `<input id="country-search" class="bs-input" type="text" placeholder="🔍 Search a country…" value="${searchQuery}">`;
    container.appendChild(searchWrap);
    searchWrap.querySelector('#country-search').addEventListener('input', (e) => {
      searchQuery = e.target.value;
      const gridArea = container.querySelector('#flag-grid-area');
      if (gridArea) { gridArea.innerHTML = ''; renderFlagGrid(gridArea); }
    });

    const hint = document.createElement('p');
    hint.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted);padding:0 var(--s4);text-align:center;margin-bottom:var(--s2)';
    hint.textContent = 'Tap a country on the map or flag to mark it visited';
    container.appendChild(hint);

    const gridArea = document.createElement('div');
    gridArea.id = 'flag-grid-area';
    gridArea.style.cssText = 'padding:0 var(--s4) var(--s6)';
    container.appendChild(gridArea);
    renderFlagGrid(gridArea);
  }

  async function render() {
    if (!root) return;
    root.innerHTML = '';

    if (activeTab === 'world') {
      const backRow = document.createElement('div');
      backRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:calc(18px + env(safe-area-inset-top)) var(--s4) 4px;cursor:pointer';
      backRow.innerHTML = `<span style="color:var(--text-secondary)">←</span><span style="font-size:13px;font-weight:600;color:var(--text-primary)">Back to trips</span>`;
      backRow.addEventListener('click', () => { activeTab = 'trips'; render(); });
      root.appendChild(backRow);

      const content = document.createElement('div');
      root.appendChild(content);
      await loadGeoJson();
      visitedSet = new Set(await Data.getVisitedCountries());
      renderWorldTab(content);
      return;
    }

    root.appendChild(wordmarkRow());
    root.appendChild(greetRow());

    if (!greetName) {
      Auth.getUser().then(u => {
        const full = u?.user_metadata?.full_name || '';
        const first = full.split(' ')[0];
        if (first && first !== greetName) { greetName = first; render(); }
      }).catch(() => {});
    }

    await countriesStatRow(root);
    flightStatRow(root);

    const content = document.createElement('div');
    root.appendChild(content);
    renderTripsTab(content);
  }

  function init(rootEl) {
    root = rootEl;
    render();
  }

  function destroy() {
    if (leafletMap) { leafletMap.remove(); leafletMap = null; }
    root = null;
  }

  return { init, destroy, refresh: render };
})();

window.LandingScreen = LandingScreen;
