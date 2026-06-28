'use strict';

const ItineraryScreen = (() => {

  /* -- Static guide link mapping -- */
  const STOP_LINKS = {
    sk09: [{title:'Bus: Kii-Tanabe to Hongu', url:'http://www2.tb-kumano.jp/en/transport/pdf/Tanabe-Shirahama-to-Hongu-bus.pdf'}],
    sk10: [{title:'Nakahechi Route Map (PDF)', url:'https://www2.tb-kumano.jp/en/kumano-kodo/pdf/Kumano-Kodo-Nakahechi-Route-Maps-Takijiri-Takahara.pdf'}],
    sk16: [{title:'Bus: Hongu-Kawayu-Yunomine', url:'http://www2.tb-kumano.jp/en/transport/pdf/Hongu-Kawayu-Yunomine-bus.pdf'}],
    sk20: [{title:'Bus: Hongu to Shingu', url:'http://www2.tb-kumano.jp/en/transport/pdf/Hongu-Koguchi-Shingu-bus.pdf'}],
    sk22: [{title:'Nachisan Travel Guide', url:'https://visitwakayama.jp/en/stories/detail_539.html'}],
    sk23: [{title:'Bus: Nachi-Kii-Katsuura', url:'https://www2.tb-kumano.jp/en/transport/pdf/Nachi-Kii-Katsuura-bus.pdf'}],
    sk30: [{title:'Alpine Route timetable (PDF)', url:'https://www.alpen-route.com/en/wp-content/uploads/2026/04/2026_timetable_nagano-toyamaedit.pdf'}],
    sk34: [{title:'Murodo Walks Map (PDF)', url:'https://www.alpen-route.com/en/assets_v2/file/walks_map.pdf'}],
  };

  let root;

  /* ── Accordion state (module-level — survives re-renders) ── */
  const daysExpanded = {};
  let _toggling = false;

  const SEG_COLOR = {
    transit: '#AAAAAA',
    kumano:  '#C1440E',
    nagano:  '#7B4EA0',
    alpine:  '#2A7A4B',
    osaka:   '#888888',
  };

  function getDayExpanded(dayId) {
    if (daysExpanded[dayId] === undefined) daysExpanded[dayId] = true; // default open
    return daysExpanded[dayId];
  }

  function toggleDay(dayId) {
    if (_toggling) return;
    _toggling = true;
    daysExpanded[dayId] = !getDayExpanded(dayId);
    render();
    setTimeout(() => { _toggling = false; }, 250);
  }

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

  /* ─── Day header (accordion) ────────────────────────────── */
  function dayHeader(day, stops, isOpen) {
    const wrap = document.createElement('div');
    wrap.className = 'tl-day-block';

    const row = document.createElement('div');
    row.className = 'tl-day-header-row tl-day-header--tap';
    row.innerHTML = `
      <div class="tl-day-pill"><span class="tl-day-label">${day.label}</span></div>
      <div class="tl-day-meta">
        <span class="tl-day-date">${day.date}</span>
        <span class="tl-day-title-text">${day.title}</span>
      </div>
      <span class="tl-chevron">${isOpen ? Icons.chevronUp('icon-sm') : Icons.chevronDown('icon-sm')}</span>`;
    row.addEventListener('click', () => toggleDay(day.id));
    wrap.appendChild(row);

    if (!isOpen && stops.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'tl-empty-hint';
      hint.textContent = 'No stops · tap to expand and add';
      wrap.appendChild(hint);
    }

    return wrap;
  }

  /* ─── Overnight card ────────────────────────────────────── */
  function overnightCard(day) {
    const o = Data.getOvernight(day.id);
    if (!o?.name) return null;
    const statusCls = {booked:'badge-booked',pending:'badge-pending',urgent:'badge-urgent',open:'badge-open'};
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
        <span class="badge ${statusCls[o.status]||'badge-open'}">${o.status==='booked'?'✓':o.status==='urgent'?'⚡':o.status==='pending'?'Pending':'Open'}</span>
      </div>`;
    card.addEventListener('click', () => BottomSheet.openOvernight(day));
    return card;
  }

  /* ─── Add stop button ───────────────────────────────────── */
  function addStopBtn(dayId) {
    const btn = document.createElement('button');
    btn.className = 'add-stop-btn';
    btn.innerHTML = `${Icons.plus('icon-sm')} Add stop`;
    btn.addEventListener('click', () => BottomSheet.openAdd(dayId));
    return btn;
  }

  /* ─── Stop row ──────────────────────────────────────────── */
  function stopRow(stop, isLast) {
    const day = Data.getDays().find(d => d.id === stop.dayId);
    const iconKey = stop.transportType || 'walk';
    const stampCollected = stop.hasStamp && Data.isStampCollected(stop.id);
    const segColor = SEG_COLOR[stop.segment] || '#888';

    const row = document.createElement('div');
    row.className = 'tl-row';
    row.innerHTML = `
      <div class="tl-time">
        <span class="tl-time-val">${stop.time || '—'}</span>
        <span class="tl-time-tz">${stop.timeZone || ''}</span>
      </div>
      <div class="tl-connector">
        <div class="tl-icon-circle" style="border-color:${segColor};color:${segColor}">
          ${Icons[iconKey] ? Icons[iconKey]() : Icons.walk()}
        </div>
        ${!isLast ? '<div class="tl-line"></div>' : ''}
      </div>
      <div class="tl-content">
        <div class="tl-name-row">
          <p class="tl-name">${stop.name}</p>
          ${stop.hasStamp ? `<span class="tl-stamp-dot ${stampCollected?'tl-stamp-dot--on':''}">${stop.stampKanji||'判'}</span>` : ''}
        </div>
        <p class="tl-activity">${stop.activity || ''}</p>
        ${stop.openingHours ? `<p class="tl-hours">◷ ${stop.openingHours}</p>` : ''}
        ${stop.transport ? `<div class="tl-transport">${Icons[iconKey]?Icons[iconKey]():''}<span>${stop.transport}</span></div>` : ''}
        ${stop.transportType==='train' && stop.trainDetail?.jrPass===false
          ? '<p class="tl-platform" style="color:var(--warning-text)">⚠ Not on JR Pass · buy separately</p>'
          : stop.transportType==='train' && stop.trainDetail?.jrPass
            ? '<p class="tl-platform">JR Pass ✓</p>' : ''}
        ${stop.transportType==='train' && stop.trainDetail?.platform
          ? `<p class="tl-platform">Platform: ${stop.trainDetail.platform}</p>` : ''}
        ${stop.notes ? `<p class="tl-note">${stop.notes}</p>` : ''}
        <div class="tl-footer">
          ${badge(stop.booking.status)}
          ${stop.category==='transport' ? '<span class="cat-chip cat-chip--transport">Transport</span>' :
            stop.category==='activity'  ? '<span class="cat-chip cat-chip--activity">Activity</span>' : ''}
          ${stop.trainDetail?.seatReservation ? '<span class="cat-chip cat-chip--jr">Seat res.</span>' : ''}
        </div>
        ${(STOP_LINKS[stop.id]||[]).map(l=>`<a href="${l.url}" target="_blank" rel="noopener" class="tl-link-chip" onclick="event.stopPropagation()">\u2197 ${l.title}</a>`).join('')}
      </div>`;
    row.addEventListener('click', () => BottomSheet.openStop(stop, day));
    return row;
  }

  /* ─── Main render ───────────────────────────────────────── */
  function render() {
    if (!root) return;
    root.innerHTML = '';

    Data.getDays().forEach(day => {
      const stops  = Data.getStopsByDay(day.id);
      const isOpen = getDayExpanded(day.id);

      // Day header (always visible)
      root.appendChild(dayHeader(day, stops, isOpen));

      if (isOpen) {
        // Weather strip -- use day locality; multi-point for transit days
        if (navigator.onLine) {
          if (day.weatherPoints) {
            const wxEl = document.createElement('div');
            wxEl.className = 'wx-container';
            root.appendChild(wxEl);
            Weather.renderMultiStrip(wxEl, day.weatherPoints);
          } else {
            const wxStop = stops.find(s => s.lat && s.lng);
            if (wxStop) {
              const wxEl = document.createElement('div');
              wxEl.className = 'wx-container';
              root.appendChild(wxEl);
              Weather.renderStrip(wxEl, wxStop.lat, wxStop.lng, day.locality || wxStop.name);
            }
          }
        }

        // Day divider
        root.appendChild(Object.assign(document.createElement('div'), {className:'tl-day-divider'}));

        // Stop rows
        stops.forEach((s, i) => root.appendChild(stopRow(s, i === stops.length - 1)));

        // Overnight card
        const accom = overnightCard(day);
        if (accom) root.appendChild(accom);

        // Add stop button
        root.appendChild(addStopBtn(day.id));

        // Custom links tagged to this day
        const dayLinks = (Data.getCustomLinks?.() || []).filter(l => l.dayId === day.id);
        if (dayLinks.length) {
          const dlWrap = document.createElement('div');
          dlWrap.className = 'day-links-wrap';
          dlWrap.innerHTML = '<p class="day-links-head">🔖 Resources</p>'
            + dayLinks.map(l => `<a href="${l.url}" target="_blank" rel="noopener" class="tl-link-chip">\u2197 ${l.title}</a>`).join('');
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
