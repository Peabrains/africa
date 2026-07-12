'use strict';

const ItineraryScreen = (() => {

  let root;
  const daysExpanded = {};
  let _toggling = false;

  /* ── Segment → country label + colour ───────────────────────── */
  /* Auto-generate a consistent color per locality name — same locality
     always gets the same color, any new locality just works, no manual
     per-trip color list to maintain ever again. 'transit' stays neutral. */
  const AUTO_PALETTE = ['#C1440E','#2A7A4B','#7B4EA0','#0E7C7B','#E8A23D','#2E86AB','#C1447E','#B8860B','#4C6B8A','#8E6C4A'];
  function colorForKey(key) {
    if (!key || key.toLowerCase() === 'transit') return '#9C9080';
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return AUTO_PALETTE[hash % AUTO_PALETTE.length];
  }
  function segColor(stop) {
    const day = Data.getDays().find(d => d.id === stop.dayId);
    return colorForKey(day?.locality || stop.segment);
  }
  /* Divider shown once when locality changes ─────────────────── */
  function localityDivider(locality) {
    const div = document.createElement('div');
    div.className = 'country-divider';
    const label = locality || 'Transit';
    const color = colorForKey(locality);
    div.innerHTML = `
      <div class="country-divider-line"></div>
      <span class="country-pill" style="background:${color}20;color:${color};border:1px solid ${color}60">● ${label}</span>
      <div class="country-divider-line"></div>`;
    return div;
  }

  function getDayExpanded(dayId) {
    if (daysExpanded[dayId] === undefined) daysExpanded[dayId] = true;
    return daysExpanded[dayId];
  }

  function toggleDay(dayId) {
    if (_toggling) return;
    _toggling = true;
    daysExpanded[dayId] = !getDayExpanded(dayId);
    render();
    setTimeout(() => { _toggling = false; }, 250);
  }

  /* ── Booking badge ──────────────────────────────────────────── */
  function badge(status) {
    const m = {
      booked:  ['badge-booked',  '✓ Booked'],
      pending: ['badge-pending', 'Pending'],
      urgent:  ['badge-urgent',  '⚡ Urgent'],
      open:    ['badge-open',    'Open'],
    };
    const [cls, lbl] = m[status] || m.open;
    return `<span class="badge ${cls}">${lbl}</span>`;
  }

  /* ── Flight badge (green = included, gold = excluded) ───────── */
  function flightBadge(stop) {
    if (stop.transportType !== 'plane') return '';
    if (stop.flightIncluded)
      return `<span class="tl-flight-badge tl-flight-badge--in">✓ Included</span>`;
    if (stop.flightExcluded)
      return `<span class="tl-flight-badge tl-flight-badge--out">Buy separately</span>`;
    return '';
  }

  function timeSinceLabel(iso) {
    if (!iso) return '';
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  }

  /* ── Flight card ───────────────────────────────────────────────
     Local code -> friendly name fallback, only for the airports these
     trips actually touch. Verified flights (state C) use AeroDataBox's
     own airport name instead — this table is just the A/B fallback. */
  const AIRPORT_NAMES = {
    EBB:'Entebbe', NBO:'Nairobi', JRO:'Kilimanjaro', DAR:'Dar es Salaam', ZNZ:'Zanzibar',
    KGL:'Kigali', DOH:'Doha', KUL:'Kuala Lumpur', KIX:'Osaka', NRT:'Tokyo', HND:'Tokyo',
    BKK:'Bangkok', DMK:'Bangkok', CNX:'Chiang Mai', HKT:'Phuket', USM:'Koh Samui',
  };
  function friendlyAirportLabel(code, verifiedName) {
    if (verifiedName) return verifiedName;
    const key = (code || '').trim().toUpperCase();
    return AIRPORT_NAMES[key] || code || '?';
  }
  function formatDuration(mins) {
    if (mins == null) return null;
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
  }

  /* State A = never checked · B = checked, AeroDataBox has nothing published
     yet · C = verified. See check_flights.py for how flightSchedule is built. */
  function flightCardHTML(stop) {
    const sched = stop.flightSchedule;
    const state = stop.flightState || 'A';
    const verified = state === 'C';

    const delayedDep = verified && !!sched.dep_revised_local;
    const delayedArr = verified && !!sched.arr_revised_local;
    const delayed = delayedDep || delayedArr;

    const depShown = verified ? (sched.dep_revised_local || sched.dep_scheduled_local) : (stop.time || '—');
    const arrShown = verified ? (sched.arr_revised_local || sched.arr_scheduled_local) : null;

    const originLabel = friendlyAirportLabel(stop.origin, verified ? sched.dep_airport_name : null);
    const destLabel    = friendlyAirportLabel(stop.destination, verified ? sched.arr_airport_name : null);
    const origCode = (verified && sched.dep_iata) || stop.origin || '—';
    const destCode = (verified && sched.arr_iata) || stop.destination || '—';

    let badge = '';
    if (state === 'A') badge = `<span class="flight-card-badge flight-card-badge--warn">Not yet verified</span>`;
    else if (state === 'B') badge = `<span class="flight-card-badge flight-card-badge--warn">Hasn't been published yet</span>`;
    else if (delayed) badge = `<span class="flight-card-badge flight-card-badge--danger">⚠ Delayed</span>`;

    const day = Data.getDays().find(d => d.id === stop.dayId);
    const dateLabel = day ? formatDayDate(day.date) : '';
    const timeLabel = verified ? `${depShown}–${arrShown || '—'}` : (stop.time || '—');
    const subtitle = [dateLabel, timeLabel].filter(Boolean).join(' · ');

    return `
      <div class="flight-card ${verified ? 'flight-card--verified' : 'flight-card--unverified'}">
        <div class="flight-card-head">
          <div class="flight-card-route">
            ${Icons.plane ? Icons.plane('icon-sm') : ''}
            <span class="flight-card-route-text">${originLabel} → ${destLabel}</span>
          </div>
          ${badge}
        </div>
        <div class="flight-card-sub ${delayed ? 'flight-card-sub--delayed' : ''}">${subtitle}</div>
        <div class="flight-card-codes">
          <div class="flight-card-code-block">
            <div class="flight-card-code ${verified ? 'flight-card-code--verified' : ''}">${origCode}</div>
            <div class="flight-card-terminal">${verified && sched.dep_terminal ? `Terminal ${sched.dep_terminal}` : 'Terminal TBA'}</div>
          </div>
          <div class="flight-card-arrow">
            <span class="flight-card-flightno">${stop.flightNo || '—'}</span>
            <span class="flight-card-arrow-glyph">→</span>
          </div>
          <div class="flight-card-code-block flight-card-code-block--right">
            <div class="flight-card-code ${verified ? 'flight-card-code--verified' : ''}">${destCode}</div>
            <div class="flight-card-terminal">${verified && sched.arr_terminal ? `Terminal ${sched.arr_terminal}` : 'Terminal TBA'}</div>
          </div>
        </div>
        <div class="flight-card-times">
          <div class="flight-card-times-col">
            <div class="flight-card-times-label">DEPARTS</div>
            <div class="flight-card-times-val ${delayedDep ? 'flight-card-times-val--delayed' : ''}">
              ${delayedDep ? `<span class="flight-card-times-old">${sched.dep_scheduled_local}</span>` : ''}${depShown}
            </div>
          </div>
          <div class="flight-card-times-duration">${verified && sched.duration_minutes != null ? formatDuration(sched.duration_minutes) : '—'}</div>
          <div class="flight-card-times-col flight-card-times-col--right">
            <div class="flight-card-times-label">ARRIVES</div>
            <div class="flight-card-times-val ${delayedArr ? 'flight-card-times-val--delayed' : ''}">
              ${verified ? `${delayedArr ? `<span class="flight-card-times-old">${sched.arr_scheduled_local}</span>` : ''}${arrShown}` : '—'}
            </div>
          </div>
        </div>
        <div class="flight-card-foot">
          <span>${(verified && sched.airline_name) || stop.airline || 'Airline TBA'}</span>
          ${state !== 'A' && sched?.last_checked_at ? `<span>Checked ${timeSinceLabel(sched.last_checked_at)}</span>` : ''}
        </div>
      </div>`;
  }

  /* Country divider removed — see localityDivider() further down,
     which replaced this with an auto-colored, locality-based divider. */

  /* ── Format an ISO date (YYYY-MM-DD) as 'Fri, 9 Apr 2026' ────── */
  function formatDayDate(iso) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso; // fallback: show whatever we got rather than hide it
    const [, y, mo, d] = m;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d)); // local, no TZ shift
    const weekday = dt.toLocaleDateString('en-US', { weekday: 'short' });
    const month   = dt.toLocaleDateString('en-US', { month: 'short' });
    return `${weekday}, ${Number(d)} ${month} ${y}`;
  }

  /* Compact date for chips — "9 Aug" (no weekday/year, keeps chips short) */
  function formatShortDate(iso) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso;
    const [, y, mo, d] = m;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    const month = dt.toLocaleDateString('en-US', { month: 'short' });
    return `${Number(d)} ${month}`;
  }

  /* ── Day header ─────────────────────────────────────────────── */
  function dayHeader(day, stops, isOpen) {
    const wrap = document.createElement('div');
    wrap.className = 'tl-day-block';

    const row = document.createElement('div');
    row.className = 'tl-day-header-row tl-day-header--tap';
    row.innerHTML = `
      <div class="tl-day-pill"><span class="tl-day-label">${day.label}</span></div>
      <div class="tl-day-meta">
        <span class="tl-day-date">${formatDayDate(day.date)}</span>
        <span class="tl-day-title-text">${day.title}</span>
      </div>
      <button class="tl-day-edit-btn" style="background:none;border:none;color:var(--text-muted);padding:4px;cursor:pointer;flex-shrink:0" title="Edit day">${Icons.edit ? Icons.edit('icon-sm') : '✎'}</button>
      <span class="tl-chevron">${isOpen ? Icons.chevronUp('icon-sm') : Icons.chevronDown('icon-sm')}</span>`;
    row.addEventListener('click', () => toggleDay(day.id));
    row.querySelector('.tl-day-edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      BottomSheet.openDay(day);
    });
    wrap.appendChild(row);

    if (!isOpen && stops.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'tl-empty-hint';
      hint.textContent = 'No stops · tap to expand';
      wrap.appendChild(hint);
    }
    return wrap;
  }

  /* ── Overnight card ─────────────────────────────────────────── */
  function overnightCard(day) {
    const o = Data.getOvernight(day.id);
    if (!o?.name) return null;
    const statusCls = {booked:'badge-booked',pending:'badge-pending',urgent:'badge-urgent',open:'badge-open'};
    const lf = o.luggage_forwarding;
    const card = document.createElement('div');
    card.className = 'overnight-card';
    card.innerHTML = `
      <div class="overnight-inner">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
          ${Icons.moon('icon-sm')}
          <div style="min-width:0">
            <p class="overnight-label">Overnight</p>
            <p class="overnight-name">${o.name}</p>
            ${o.address ? `<p class="overnight-addr">${o.address}</p>` : ''}
          </div>
        </div>
        <span class="badge ${statusCls[o.status]||'badge-open'}">${
          o.status==='booked'?'✓ Booked':o.status==='urgent'?'⚡ Urgent':o.status==='pending'?'Pending':'Open'
        }</span>
      </div>
      ${lf?.enabled ? `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 12px 10px">
        <span style="font-size:var(--text-xs);color:var(--text-secondary);display:flex;align-items:center;gap:6px;min-width:0">
          <span style="flex-shrink:0">🧳</span>
          <span style="min-width:0">Luggage forwarding${lf.to ? ': ' + lf.to : ''}${lf.cutoff ? ' · by ' + lf.cutoff : ''}</span>
        </span>
        <span class="badge ${lf.status==='arranged'?'badge-booked':'badge-pending'}" style="flex-shrink:0">${lf.status==='arranged'?'✓ Arranged':'Not yet arranged'}</span>
      </div>` : ''}`;
    card.addEventListener('click', () => BottomSheet.openOvernight(day));
    return card;
  }

  /* ── Add stop button ────────────────────────────────────────── */
  function addStopBtn(dayId) {
    const btn = document.createElement('button');
    btn.className = 'add-stop-btn';
    btn.innerHTML = `${Icons.plus('icon-sm')} Add stop`;
    btn.addEventListener('click', () => BottomSheet.openAdd(dayId));
    return btn;
  }

  /* ── "+ Add overnight" — shown in place of the overnight card when
     this day has no accommodation set yet (see overnightCard) ────── */
  function addOvernightBtn(day) {
    const btn = document.createElement('button');
    btn.className = 'add-stop-btn';
    btn.innerHTML = `${Icons.moon ? Icons.moon('icon-sm') : ''} Add overnight`;
    btn.addEventListener('click', () => BottomSheet.openOvernight(day));
    return btn;
  }

  /* ── Stop row content — non-plane stops (walk/train/bus/boat/cable) ──── */
  function nonPlaneContentHTML(stop) {
    const iconKey = stop.transportType || 'walk';
    return `
      <div class="tl-name-row">
        <p class="tl-name">${stop.name}</p>
      </div>
      <p class="tl-activity">${stop.activity || ''}</p>
      ${stop.transport ? `<div class="tl-transport"> ${Icons[iconKey]?Icons[iconKey]('icon-sm'):''}<span>${stop.transport}</span></div>` : ''}
      ${stop.transportType === 'train' && stop.trainDetail?.jrPass === false
        ? '<p class="tl-note" style="color:var(--warning-text)">⚠ Not on JR Pass · buy separately</p>'
        : stop.transportType === 'train' && stop.trainDetail?.seatReservation
          ? '<p class="tl-note" style="color:var(--success-text)">JR Pass ✓</p>' : ''}
      ${stop.transportType === 'train' && stop.trainDetail?.platform
        ? `<p class="tl-note">Platform: ${stop.trainDetail.platform}</p>` : ''}
      ${stop.notes ? `<p class="tl-note">${stop.notes}</p>` : ''}
      <div class="tl-footer">
        ${badge(stop.booking.status)}
        ${stop.category==='transport' ? '<span class="cat-chip cat-chip--transport">Transport</span>' :
          stop.category==='activity'  ? '<span class="cat-chip cat-chip--activity">Activity</span>'  : ''}
        ${stop.booking.cost ? `<span class="cat-chip cat-chip--activity">USD ${stop.booking.cost.toLocaleString()}</span>` : ''}
        ${stop.booking.deadline && stop.booking.status !== 'booked' ? `<span class="cat-chip" style="background:var(--warning-bg);color:var(--warning-text);border:1px solid var(--warning-border)">Book by ${formatShortDate(stop.booking.deadline)}</span>` : ''}
        ${stop.transportType === 'train' && stop.trainDetail?.seatReservation ? '<span class="cat-chip cat-chip--jr">Seat res.</span>' : ''}
      </div>`;
  }

  /* ── Stop row content — plane stops (dedicated flight card) ──────────── */
  function planeContentHTML(stop) {
    return `
      <div class="tl-name-row">
        <p class="tl-name">${stop.name}</p>
      </div>
      ${stop.activity ? `<p class="tl-activity">${stop.activity}</p>` : ''}
      <div style="margin-top:6px">${flightCardHTML(stop)}</div>
      ${stop.notes ? `<p class="tl-note">${stop.notes}</p>` : ''}
      <div class="tl-footer">
        ${badge(stop.booking.status)}
        ${flightBadge(stop)}
        ${stop.category==='transport' ? '<span class="cat-chip cat-chip--transport">Transport</span>' :
          stop.category==='activity'  ? '<span class="cat-chip cat-chip--activity">Activity</span>'  : ''}
        ${stop.booking.cost ? `<span class="cat-chip cat-chip--activity">USD ${stop.booking.cost.toLocaleString()}</span>` : ''}
        ${stop.booking.deadline && stop.booking.status !== 'booked' ? `<span class="cat-chip" style="background:var(--warning-bg);color:var(--warning-text);border:1px solid var(--warning-border)">Book by ${formatShortDate(stop.booking.deadline)}</span>` : ''}
      </div>`;
  }

  /* ── Stop row ───────────────────────────────────────────────── */
  function stopRow(stop, isLast) {
    const day = Data.getDays().find(d => d.id === stop.dayId);
    const iconKey = stop.transportType || 'walk';
    const segColorVal = segColor(stop);
    const isPlane = stop.transportType === 'plane';

    const row = document.createElement('div');
    row.className = 'tl-row';
    row.innerHTML = `
      <div class="tl-time">
        <span class="tl-time-val">${stop.time || '—'}</span>
        <span class="tl-time-tz">${stop.timeZone || ''}</span>
      </div>
      <div class="tl-connector">
        <div class="tl-icon-circle" style="border-color:${segColorVal};color:${segColorVal}">
          ${Icons[iconKey] ? Icons[iconKey]('icon-sm') : Icons.walk('icon-sm')}
        </div>
        ${!isLast ? '<div class="tl-line"></div>' : ''}
      </div>
      <div class="tl-content">
        ${isPlane ? planeContentHTML(stop) : nonPlaneContentHTML(stop)}
      </div>`;
    row.addEventListener('click', () => BottomSheet.openStop(stop, day));
    return row;
  }

  /* ── Inclusions / exclusions mini-screen ────────────────────── */
  function renderIncExc() {
    const wrap = document.createElement('div');
    wrap.style.paddingBottom = 'var(--s6)';

    const header = document.createElement('div');
    header.style.cssText = 'padding:var(--s4) var(--s4) var(--s2);border-bottom:1.5px solid var(--border)';
    header.innerHTML = `
      <p style="font-size:var(--text-lg);font-weight:500;color:var(--text-primary)">What's included</p>
      <p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:2px">Wildsenses Holidays · East Africa Safari & Mountain Gorilla</p>`;
    wrap.appendChild(header);

    // Inclusions
    const incSec = document.createElement('div');
    incSec.className = 'inc-section';
    const incTitle = document.createElement('p');
    incTitle.className = 'inc-section-title';
    incTitle.textContent = '✓ Included in your package';
    incSec.appendChild(incTitle);
    (Data.getInclusions?.() || []).forEach(item => {
      const row = document.createElement('div');
      row.className = 'inc-item';
      row.innerHTML = `<span class="inc-item-dot inc-item-dot--in">✓</span><span class="inc-item-text">${item}</span>`;
      incSec.appendChild(row);
    });
    wrap.appendChild(incSec);

    // Exclusions
    const excSec = document.createElement('div');
    excSec.className = 'inc-section';
    excSec.style.marginTop = 'var(--s3)';
    const excTitle = document.createElement('p');
    excTitle.className = 'inc-section-title';
    excTitle.textContent = '✗ Not included — arrange separately';
    excSec.appendChild(excTitle);
    (Data.getExclusions?.() || []).forEach(item => {
      const row = document.createElement('div');
      row.className = 'inc-item';
      row.innerHTML = `<span class="inc-item-dot inc-item-dot--out">✗</span><span class="inc-item-text">${item}</span>`;
      excSec.appendChild(row);
    });
    wrap.appendChild(excSec);

    return wrap;
  }

  /* ── Sub-tab bar (Itinerary / What's included) ──────────────── */
  let activeTab = 'itinerary';

  function subTabBar() {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;border-bottom:1.5px solid var(--border);background:var(--surface);flex-shrink:0;padding:0 var(--s2);overflow-x:auto;scrollbar-width:none';
    [['itinerary','Itinerary'],['included',"What's included"]].forEach(([id, label]) => {
      const btn = document.createElement('button');
      btn.style.cssText = `flex-shrink:0;padding:10px var(--s3);font-size:var(--text-sm);font-weight:${activeTab===id?'500':'400'};color:${activeTab===id?'var(--accent)':'var(--text-muted)'};background:none;border:none;border-bottom:${activeTab===id?'2px solid var(--accent)':'2px solid transparent'};margin-bottom:-1.5px;cursor:pointer;font-family:var(--font);transition:color .15s`;
      btn.textContent = label;
      btn.addEventListener('click', () => { activeTab = id; render(); });
      bar.appendChild(btn);
    });
    return bar;
  }

  /* ── Glossary popup ──────────────────────────────────────── */
  function openGlossary(term) {
    const entry = Data.getGlossary(term);
    if (!entry) return;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:250;background:rgba(0,0,0,.5);display:flex;align-items:flex-end';
    const sheet = document.createElement('div');
    sheet.style.cssText = 'background:var(--bg);width:100%;max-height:60vh;border-radius:20px 20px 0 0;overflow-y:auto;padding-bottom:env(safe-area-inset-bottom)';
    sheet.innerHTML = `
      <div style="display:flex;justify-content:center;padding:8px 0 0"><div style="width:36px;height:4px;background:var(--border);border-radius:2px"></div></div>
      <div style="padding:var(--s4)">
        <p style="font-size:var(--text-lg);font-weight:500;color:var(--accent);margin-bottom:var(--s2)">📖 ${entry.title}</p>
        <p style="font-size:var(--text-sm);color:var(--text-secondary);line-height:1.6">${entry.body}</p>
      </div>
      <div style="padding:0 var(--s4) var(--s5)">
        <button id="gloss-close" class="btn btn-ghost bs-full-btn">Close</button>
      </div>`;
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    sheet.querySelector('#gloss-close').addEventListener('click', () => overlay.remove());
  }

  /* ── Render story paragraph with [[glossary]] terms tappable ── */
  function renderStoryParagraph(text) {
    const p = document.createElement('p');
    p.style.cssText = 'font-size:var(--text-sm);color:var(--text-primary);line-height:1.65;margin-bottom:var(--s3)';

    // Tokens: [[glossary term]], **bold**, *italic*, [link text](https://...)
    const parts = text.split(/(\[\[.*?\]\]|\*\*.*?\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);
    parts.forEach(part => {
      if (!part) return;

      let match = part.match(/^\[\[(.*?)\]\]$/);
      if (match) {
        const term = match[1];
        const span = document.createElement('span');
        span.textContent = term;
        span.style.cssText = 'color:var(--accent);font-weight:500;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px;cursor:pointer';
        span.addEventListener('click', () => openGlossary(term));
        p.appendChild(span);
        return;
      }

      match = part.match(/^\*\*(.*?)\*\*$/);
      if (match) {
        const strong = document.createElement('strong');
        strong.textContent = match[1];
        strong.style.fontWeight = '600';
        p.appendChild(strong);
        return;
      }

      match = part.match(/^\*([^*]+)\*$/);
      if (match) {
        const em = document.createElement('em');
        em.textContent = match[1];
        p.appendChild(em);
        return;
      }

      match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (match) {
        const a = document.createElement('a');
        a.href = match[2];
        a.textContent = match[1];
        a.target = '_blank';
        a.rel = 'noopener';
        a.style.cssText = 'color:var(--accent);text-decoration:underline';
        a.addEventListener('click', e => e.stopPropagation());
        p.appendChild(a);
        return;
      }

      p.appendChild(document.createTextNode(part));
    });
    return p;
  }

  /* ── "The Story" expandable card ─────────────────────────── */
  let storyExpanded = {};

  function storyCard(day) {
    const story = Data.getStory(day.id);
    if (!story) return null;

    const isOpen = !!storyExpanded[day.id];

    const card = document.createElement('div');
    card.style.cssText = 'margin:var(--s2) var(--s4);border:1.5px solid #E8D9B0;border-radius:var(--r-lg);overflow:hidden;background:#FDF6E8';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:var(--s3);cursor:pointer;user-select:none';
    header.innerHTML = `
      <span style="font-size:var(--text-sm);font-weight:500;color:var(--text-secondary)">📖 The Story — ${story.title}</span>
      <span class="story-arrow" style="color:var(--text-muted);font-size:13px;transition:transform .2s;${isOpen?'transform:rotate(90deg)':''}">▸</span>`;
    card.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = `padding:${isOpen?'var(--s4)':'0 var(--s4)'};display:${isOpen?'block':'none'};border-top:${isOpen?'1px solid #E8D9B0':'none'}`;
    story.paragraphs.forEach(para => body.appendChild(renderStoryParagraph(para)));
    card.appendChild(body);

    header.addEventListener('click', () => {
      storyExpanded[day.id] = !storyExpanded[day.id];
      const nowOpen = storyExpanded[day.id];
      body.style.display = nowOpen ? 'block' : 'none';
      body.style.padding = nowOpen ? 'var(--s4)' : '0 var(--s4)';
      header.querySelector('.story-arrow').style.transform = nowOpen ? 'rotate(90deg)' : '';
    });

    return card;
  }

  /* ── Main render ────────────────────────────────────────────── */
  function render() {
    if (!root) return;
    root.innerHTML = '';

    root.appendChild(subTabBar());

    if (activeTab === 'included') {
      root.appendChild(renderIncExc());
      return;
    }

    // Itinerary tab — day timeline with country dividers
    const addDayBtn = document.createElement('button');
    addDayBtn.className = 'btn btn-ghost';
    addDayBtn.style.cssText = 'width:calc(100% - 32px);margin:var(--s3) 16px;';
    addDayBtn.textContent = '+ Add day';
    addDayBtn.addEventListener('click', () => BottomSheet.openAddDay());
    root.appendChild(addDayBtn);

    let lastLocality = undefined;

    Data.getDays().forEach(day => {
      const stops  = Data.getStopsByDay(day.id);
      const isOpen = getDayExpanded(day.id);

      // Insert a divider when the locality changes from the previous day
      if (day.locality !== lastLocality) {
        root.appendChild(localityDivider(day.locality));
        lastLocality = day.locality;
      }

      root.appendChild(dayHeader(day, stops, isOpen));

      if (isOpen) {
        // Weather strip
        if (navigator.onLine) {
          const wxEl = document.createElement('div');
          wxEl.className = 'wx-container';
          root.appendChild(wxEl);
          if (day.weatherPoints && day.weatherPoints.length) {
            Weather.renderMultiStrip(wxEl, day.weatherPoints);
          } else {
            const wxStop = stops.find(s => s.lat && s.lng);
            if (wxStop) Weather.renderStrip(wxEl, wxStop.lat, wxStop.lng, day.locality || wxStop.name);
          }
        }

        root.appendChild(Object.assign(document.createElement('div'), {className:'tl-day-divider'}));

        // The Story — background & cultural context, if this day has one
        const story = storyCard(day);
        if (story) root.appendChild(story);

        stops.forEach((s, i) => root.appendChild(stopRow(s, i === stops.length - 1)));

        const accom = overnightCard(day);
        if (accom) root.appendChild(accom);
        else root.appendChild(addOvernightBtn(day));

        root.appendChild(addStopBtn(day.id));

        // Custom links for this day
        const dayLinks = (Data.getCustomLinks?.() || []).filter(l => l.dayId === day.id);
        if (dayLinks.length) {
          const dlWrap = document.createElement('div');
          dlWrap.className = 'day-links-wrap';
          dlWrap.innerHTML = '<p class="day-links-head">🔖 Resources</p>'
            + dayLinks.map(l => `<a href="${l.url}" target="_blank" rel="noopener" class="tl-link-chip">↗ ${l.title}</a>`).join('');
          root.appendChild(dlWrap);
        }
      }
    });
  }

  return {
    init(el) { root = el; render(); },
    destroy() { root = null; },
    refresh() { render(); },
  };
})();

window.ItineraryScreen = ItineraryScreen;
