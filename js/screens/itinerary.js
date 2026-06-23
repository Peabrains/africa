'use strict';

const ItineraryScreen = (() => {
  let root;

  const SEG_COLOR = {
    kumano: '#2B41B0', alpine: '#2A7A4B', hakuba: '#1E6FA8', osaka: '#888888'
  };

  // Maps transportType → icons.js key
  const TRANSPORT_ICON = {
    plane: 'plane', train: 'train', bus: 'bus',
    walk: 'walk', boat: 'boat', cable: 'cable',
  };

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

  /* ─── Day header (bigger date, fix #4) ─────────────────── */
  function dayHeader(day, stops) {
    const wrap = document.createElement('div');
    wrap.className = 'tl-day-block';

    // Red pill + large date side by side, vertically centred
    wrap.innerHTML = `
      <div class="tl-day-header-row">
        <div class="tl-day-pill"><span class="tl-day-label">${day.label}</span></div>
        <span class="tl-day-date">${day.date}</span>
      </div>
      <p class="tl-day-title-text">${day.title}</p>`;

    // Weather strip
    const wxStop = stops.find(s => s.lat && s.lng);
    if (wxStop && navigator.onLine) {
      const wxEl = document.createElement('div');
      wxEl.className = 'wx-container';
      wxEl.style.paddingLeft = '0';
      wrap.appendChild(wxEl);
      Weather.renderStrip(wxEl, wxStop.lat, wxStop.lng, wxStop.name);
    }

    const divider = document.createElement('div');
    divider.className = 'tl-day-divider';
    wrap.appendChild(divider);
    return wrap;
  }

  /* ─── Stop row with SVG icon in circle (fix #3) ────────── */
  function stopRow(stop, isLast) {
    const day = Data.getDays().find(d => d.id === stop.dayId);
    const iconKey = TRANSPORT_ICON[stop.transportType] || 'info';
    const stampCollected = stop.hasStamp && Data.isStampCollected(stop.id);
    const segColor = SEG_COLOR[stop.segment] || '#888';

    const row = document.createElement('div');
    row.className = 'tl-row';

    // Build the icon circle using Icons SVG (no CDN needed)
    const iconSvg = Icons[iconKey] ? Icons[iconKey]() : Icons.info();

    row.innerHTML = `
      <div class="tl-time">
        <span class="tl-time-val">${stop.time || '—'}</span>
        <span class="tl-time-tz">${stop.timeZone || ''}</span>
      </div>

      <div class="tl-connector">
        <div class="tl-icon-circle" style="border-color:${segColor};color:${segColor}">
          ${iconSvg}
        </div>
        ${!isLast ? '<div class="tl-line"></div>' : ''}
      </div>

      <div class="tl-content">
        <div class="tl-name-row">
          <p class="tl-name">${stop.name}</p>
          ${stop.hasStamp ? `<span class="tl-stamp-dot ${stampCollected ? 'tl-stamp-dot--on' : ''}">判</span>` : ''}
        </div>
        <p class="tl-activity">${stop.activity}</p>
        ${stop.transport ? `
          <div class="tl-transport">
            ${Icons[iconKey] ? Icons[iconKey]() : ''}
            <span>${stop.transport}</span>
          </div>` : ''}
        ${stop.trainDetail?.platform ? `
          <p class="tl-platform">
            Platform ${stop.trainDetail.platform}
            ${stop.trainDetail.car ? ` · Car ${stop.trainDetail.car}` : ''}
            ${stop.trainDetail.jrPass ? ' · JR Pass ✓' : ''}
          </p>` : (stop.trainDetail?.jrPass ? '<p class="tl-platform">JR Pass ✓</p>' : '')}
        ${stop.accommodation ? `
          <div class="tl-accommodation">
            ${Icons.moon()}
            <span>${stop.accommodation}</span>
          </div>` : ''}
        ${stop.notes ? `<p class="tl-note">${stop.notes}</p>` : ''}
        <div class="tl-footer">${badge(stop.booking.status)}</div>
      </div>`;

    row.addEventListener('click', () => BottomSheet.openStop(stop, day));
    return row;
  }

  /* ─── Main render ────────────────────────────────────────── */
  function render() {
    if (!root) return;
    root.innerHTML = '';
    Data.getDays().forEach(day => {
      const stops = Data.getStopsByDay(day.id);
      if (!stops.length) return;
      root.appendChild(dayHeader(day, stops));
      stops.forEach((s, i) => root.appendChild(stopRow(s, i === stops.length - 1)));
    });
  }

  return {
    init(el) { root = el; render(); },
    destroy() { root = null; },
    refresh() { render(); },
  };
})();

window.ItineraryScreen = ItineraryScreen;
