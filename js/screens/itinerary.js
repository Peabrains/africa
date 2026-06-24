'use strict';

const ItineraryScreen = (() => {
  let root;

  const SEG_COLOR = { kumano:'#2B41B0', alpine:'#2A7A4B', hakuba:'#1E6FA8', osaka:'#888888' };
  const TRANSPORT_ICON = { plane:'plane', train:'train', bus:'bus', walk:'walk', boat:'boat', cable:'cable' };

  function badge(status) {
    const m = { booked:['badge-booked','✓ Booked'], pending:['badge-pending','Pending'], urgent:['badge-urgent','⚡ Urgent'], open:['badge-open','Open'] };
    const [cls, lbl] = m[status] || m.open;
    return `<span class="badge ${cls}">${lbl}</span>`;
  }

  /* ─── Day header ────────────────────────────────────────── */
  function dayHeader(day, stops) {
    const wrap = document.createElement('div');
    wrap.className = 'tl-day-block';
    wrap.innerHTML = `
      <div class="tl-day-header-row">
        <div class="tl-day-pill"><span class="tl-day-label">${day.label}</span></div>
        <span class="tl-day-date">${day.date}</span>
      </div>
      <p class="tl-day-title-text">${day.title}</p>`;

    const wxStop = stops.find(s => s.lat && s.lng);
    if (wxStop && navigator.onLine) {
      const wxEl = document.createElement('div');
      wxEl.className = 'wx-container';
      wxEl.style.paddingLeft = '0';
      wrap.appendChild(wxEl);
      Weather.renderStrip(wxEl, wxStop.lat, wxStop.lng, wxStop.name);
    }
    wrap.appendChild(Object.assign(document.createElement('div'), { className:'tl-day-divider' }));
    return wrap;
  }

  /* ─── Overnight card — from day level (not stop level) ─── */
  function overnightCard(day) {
    const o = Data.getOvernight(day.id);
    if (!o?.name) return null;

    const statusCls = { booked:'badge-booked', pending:'badge-pending', urgent:'badge-urgent', open:'badge-open' };
    const card = document.createElement('div');
    card.className = 'overnight-card';
    card.innerHTML = `
      <div class="overnight-inner">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
          ${Icons.moon('icon-sm')}
          <div style="min-width:0">
            <p class="overnight-label">Overnight</p>
            <p class="overnight-name">${o.name}</p>
          </div>
        </div>
        <span class="badge ${statusCls[o.status] || 'badge-open'}">${o.status === 'booked' ? '✓' : o.status === 'pending' ? 'Pending' : o.status === 'urgent' ? '⚡' : 'Open'}</span>
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
    // Default to walk icon if no transport type set
    const iconKey = TRANSPORT_ICON[stop.transportType] || 'walk';
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
          ${stop.hasStamp ? `<span class="tl-stamp-dot ${stampCollected ? 'tl-stamp-dot--on' : ''}">判</span>` : ''}
        </div>
        <p class="tl-activity">${stop.activity || ''}</p>
        ${stop.transport ? `
          <div class="tl-transport">
            ${Icons[iconKey] ? Icons[iconKey]() : Icons.walk()}
            <span>${stop.transport}</span>
          </div>` : ''}
        ${stop.transportType === 'train' && stop.trainDetail?.jrPass === false
          ? '<p class="tl-platform" style="color:var(--warning-text)">⚠ Not on JR Pass · buy separately</p>'
          : stop.transportType === 'train' && stop.trainDetail?.jrPass
            ? '<p class="tl-platform">JR Pass ✓</p>' : ''}
        ${stop.transportType === 'train' && stop.trainDetail?.platform
          ? `<p class="tl-platform">Platform: ${stop.trainDetail.platform}</p>` : ''}
        ${stop.notes ? `<p class="tl-note">${stop.notes}</p>` : ''}
        <div class="tl-footer">${badge(stop.booking.status)}</div>
      </div>`;

    row.addEventListener('click', () => BottomSheet.openStop(stop, day));
    return row;
  }

  /* ─── Main render ───────────────────────────────────────── */
  function render() {
    if (!root) return;
    root.innerHTML = '';
    Data.getDays().forEach(day => {
      const stops = Data.getStopsByDay(day.id);
      root.appendChild(dayHeader(day, stops));
      stops.forEach((s, i) => root.appendChild(stopRow(s, i === stops.length - 1)));
      const accom = overnightCard(day);
      if (accom) root.appendChild(accom);
      root.appendChild(addStopBtn(day.id));
    });
  }

  return {
    init(el) { root = el; render(); },
    destroy() { root = null; },
    refresh() { render(); },
  };
})();

window.ItineraryScreen = ItineraryScreen;
