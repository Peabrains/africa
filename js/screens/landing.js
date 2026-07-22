'use strict';

/* ============================================================
   LANDING SCREEN — the new home. Two tabs:
   - Trips: trip cards + "+ New Trip"
   - World Map: shaded map + searchable, continent-grouped flag grid
   Replaces the old TripSwitcher bottom sheet and the standalone
   Countries screen (folded in here as the World Map tab).
   ============================================================ */

const LandingScreen = (() => {
  let root = null;
  let activeTab = 'trips';
  let activeCabin = 'Economy';
  let worldGeoJson = null;
  let visitedSet = new Set();
  let leafletMap = null;
  let searchQuery = '';

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

  function tabBar() {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:4px;background:var(--accent-subtle);border-radius:12px;padding:4px;margin:0 var(--s4) var(--s4)';
    [['trips', 'Trips'], ['world', 'World Map']].forEach(([id, label]) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      const active = activeTab === id;
      btn.style.cssText = `flex:1;text-align:center;padding:9px 0;border-radius:9px;font-size:var(--text-sm);font-weight:600;border:none;cursor:pointer;font-family:var(--font);background:${active ? 'var(--surface)' : 'transparent'};color:${active ? 'var(--accent)' : 'var(--text-muted)'};box-shadow:${active ? '0 1px 3px rgba(0,0,0,.08)' : 'none'}`;
      btn.addEventListener('click', () => { activeTab = id; render(); });
      bar.appendChild(btn);
    });
    return bar;
  }

  function renderTripsTab(container) {
    const trips = Data.getTrips();
    const current = Data.getCurrentTrip();

    if (!trips.length) {
      const empty = document.createElement('p');
      empty.style.cssText = 'text-align:center;color:var(--text-muted);font-size:var(--text-sm);padding:var(--s6) var(--s4)';
      empty.textContent = 'No trips yet — create your first one below.';
      container.appendChild(empty);
    }

    trips.forEach(t => {
      const isPast = t.status === 'completed' || (t.end_date && new Date(t.end_date) < new Date());
      const card = document.createElement('div');
      card.style.cssText = 'background:var(--surface);border-radius:16px;padding:14px;display:flex;align-items:center;gap:12px;margin:0 var(--s4) 12px;box-shadow:0 1px 4px rgba(0,0,0,.05);cursor:pointer;position:relative';
      const statusLabel = isPast ? 'Past' : (t.status === 'ongoing' ? 'Ongoing' : 'Upcoming');
      const statusColor = isPast ? 'var(--text-muted)' : '#3A7A3A';
      const statusBg = isPast ? 'var(--accent-subtle)' : '#E8F3E8';
      card.innerHTML = `
        <div style="font-size:30px">${t.cover_emoji || '🧭'}</div>
        <div style="flex:1;min-width:0">
          <p style="font-size:var(--text-md);font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.name}${current?.id === t.id ? ' <span style=\'color:var(--accent);font-size:11px;font-weight:500\'>· current</span>' : ''}</p>
          <p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:2px">${(t.countries || []).join(' · ')}${t.start_date ? ' · ' + t.start_date : ''}</p>
        </div>
        <span style="font-size:10px;font-weight:600;padding:3px 8px;border-radius:8px;background:${statusBg};color:${statusColor};flex-shrink:0">${statusLabel}</span>
        <button class="trip-del-btn" style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;padding:0 0 0 4px;flex-shrink:0">×</button>`;
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
    newBtn.style.cssText = 'margin:4px var(--s4) var(--s5);padding:14px;text-align:center;border:1.5px dashed var(--accent);border-radius:14px;color:var(--accent);font-size:var(--text-sm);font-weight:600;cursor:pointer';
    newBtn.textContent = '+ New Trip';
    newBtn.addEventListener('click', () => renderNewTripForm(container));
    container.appendChild(newBtn);

    renderFlightWatchSection(container);
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
    const padX = 10, topY = 10, botY = 130;
    const xOf = d => padX + (dates.indexOf(d) * (300) / ((dates.length - 1) || 1));
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
      return `<line x1="${x}" y1="128" x2="${x}" y2="132" stroke="var(--border)" stroke-width="1"/>`;
    }).join('');
    const fmtDate = d => new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
    return svgFromString(`
      <svg viewBox="0 0 320 150">
        <line x1="10" y1="10" x2="10" y2="130" stroke="var(--border)" stroke-width="1"/>
        <line x1="10" y1="130" x2="310" y2="130" stroke="var(--border)" stroke-width="1"/>
        ${ticks}
        ${lineFor(seriesA, 'var(--accent)')}
        ${lineFor(seriesB, 'var(--flight-line-2)')}
        <text x="10" y="144" font-size="8" fill="var(--text-muted)">${fmtDate(dates[0])}</text>
        <text x="270" y="144" font-size="8" fill="var(--text-muted)">${fmtDate(dates[dates.length-1])}</text>
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
    toggle.style.cssText = 'display:flex;background:var(--accent-subtle);border-radius:var(--r-pill);padding:3px;margin:var(--s2) 0 var(--s3)';
    ['Economy','Business'].forEach(cab => {
      const btn = document.createElement('button');
      btn.textContent = cab;
      const isActive = activeCabin === cab;
      btn.style.cssText = `flex:1;text-align:center;padding:6px 0;font-size:var(--text-xs);font-weight:500;border:none;border-radius:var(--r-pill);cursor:pointer;font-family:var(--font);background:${isActive?'var(--surface)':'none'};color:${isActive?'var(--accent)':'var(--text-secondary)'};${isActive?'box-shadow:0 1px 2px rgba(0,0,0,.08)':''}`;
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
    totalCard.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:var(--s3);background:var(--accent-subtle);border-radius:var(--r-md);padding:10px 12px;margin-bottom:var(--s3)';
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
      <div style="display:flex;align-items:center;gap:5px;font-size:var(--text-xs);color:var(--text-secondary)"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent);display:inline-block"></span>MH52 out <span style="font-weight:600;color:var(--text-primary)">${lastMh52?.toLocaleString() ?? '—'}</span></div>
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

  function renderFlightWatchSection(container) {
    const heading = document.createElement('p');
    heading.style.cssText = 'font-size:var(--text-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin:var(--s2) var(--s4) var(--s2)';
    heading.textContent = 'Flight Watch';
    container.appendChild(heading);

    const card = document.createElement('div');
    card.style.cssText = 'background:var(--surface);border-radius:16px;padding:14px;margin:0 var(--s4) var(--s6);box-shadow:0 1px 4px rgba(0,0,0,.05)';
    card.innerHTML = `<p style="font-size:var(--text-md);font-weight:600;color:var(--text-primary)">📈 MH52/53 — KUL ⇄ KIX</p>`;
    const bodyEl = document.createElement('div');
    card.appendChild(bodyEl);
    container.appendChild(card);

    FlightPrice.prefetch(() => render());
    renderFlightPriceBody(bodyEl);
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

    const header = document.createElement('div');
    header.style.cssText = 'padding:var(--s4) var(--s4) var(--s3)';
    header.innerHTML = `<p style="font-size:24px;font-weight:600;color:var(--text-primary)">My Trips</p>`;
    root.appendChild(header);
    root.appendChild(tabBar());

    const content = document.createElement('div');
    root.appendChild(content);

    if (activeTab === 'trips') {
      renderTripsTab(content);
    } else {
      await loadGeoJson();
      visitedSet = new Set(await Data.getVisitedCountries());
      renderWorldTab(content);
    }
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
