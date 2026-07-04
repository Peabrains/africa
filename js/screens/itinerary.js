'use strict';

const ItineraryScreen = (() => {

  let root;
  const daysExpanded = {};
  let _toggling = false;

  /* ── Segment → country label + colour ───────────────────────── */
  const SEG_COLOR = {
    transit:  'var(--seg-transit)',
    tanzania: 'var(--seg-tanzania)',
    kenya:    'var(--seg-kenya)',
    uganda:   'var(--seg-uganda)',
  };

  /* Country divider shown once when segment changes ──────────── */
  const SEGMENT_LABEL = {
    transit:  { label:'Transit', flag:'✈️',  pill:'transit'  },
    tanzania: { label:'Tanzania', flag:'🇹🇿', pill:'tanzania' },
    kenya:    { label:'Kenya',    flag:'🇰🇪', pill:'kenya'    },
    uganda:   { label:'Uganda',   flag:'🇺🇬', pill:'uganda'   },
  };

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

  /* ── Country divider ────────────────────────────────────────── */
  function countryDivider(segment) {
    const info = SEGMENT_LABEL[segment] || SEGMENT_LABEL.transit;
    const div = document.createElement('div');
    div.className = 'country-divider';
    div.innerHTML = `
      <div class="country-divider-line"></div>
      <span class="country-pill country-pill--${info.pill}">${info.flag} ${info.label}</span>
      <div class="country-divider-line"></div>`;
    return div;
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
        <span class="tl-day-date">${day.date}</span>
        <span class="tl-day-title-text">${day.title}</span>
      </div>
      <span class="tl-chevron">${isOpen ? Icons.chevronUp('icon-sm') : Icons.chevronDown('icon-sm')}</span>`;
    row.addEventListener('click', () => toggleDay(day.id));
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
      </div>`;
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

  /* ── Stop row ───────────────────────────────────────────────── */
  function stopRow(stop, isLast) {
    const day = Data.getDays().find(d => d.id === stop.dayId);
    const iconKey = stop.transportType || 'walk';
    const segColor = SEG_COLOR[stop.segment] || 'var(--seg-transit)';

    const row = document.createElement('div');
    row.className = 'tl-row';
    row.innerHTML = `
      <div class="tl-time">
        <span class="tl-time-val">${stop.time || '—'}</span>
        <span class="tl-time-tz">${stop.timeZone || ''}</span>
      </div>
      <div class="tl-connector">
        <div class="tl-icon-circle" style="border-color:${segColor};color:${segColor}">
          ${Icons[iconKey] ? Icons[iconKey]('icon-sm') : Icons.walk('icon-sm')}
        </div>
        ${!isLast ? '<div class="tl-line"></div>' : ''}
      </div>
      <div class="tl-content">
        <div class="tl-name-row">
          <p class="tl-name">${stop.name}</p>
        </div>
        <p class="tl-activity">${stop.activity || ''}</p>
        ${stop.transport ? `<div class="tl-transport"> ${Icons[iconKey]?Icons[iconKey]('icon-sm'):''}<span>${stop.transport}</span></div>` : ''}
        ${stop.notes ? `<p class="tl-note">${stop.notes}</p>` : ''}
        <div class="tl-footer">
          ${badge(stop.booking.status)}
          ${flightBadge(stop)}
          ${stop.category==='transport' ? '<span class="cat-chip cat-chip--transport">Transport</span>' :
            stop.category==='activity'  ? '<span class="cat-chip cat-chip--activity">Activity</span>'  : ''}
          ${stop.booking.cost ? `<span class="cat-chip cat-chip--activity">USD ${stop.booking.cost.toLocaleString()}</span>` : ''}
        </div>
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
    p.style.cssText = 'font-size:var(--text-sm);color:var(--text-secondary);line-height:1.65;margin-bottom:var(--s3)';

    const parts = text.split(/(\[\[.*?\]\])/g);
    parts.forEach(part => {
      const match = part.match(/^\[\[(.*?)\]\]$/);
      if (match) {
        const term = match[1];
        const span = document.createElement('span');
        span.textContent = term;
        span.style.cssText = 'color:var(--accent);font-weight:500;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px;cursor:pointer';
        span.addEventListener('click', () => openGlossary(term));
        p.appendChild(span);
      } else if (part) {
        p.appendChild(document.createTextNode(part));
      }
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
    card.style.cssText = 'margin:var(--s2) var(--s4);border:1.5px solid var(--border);border-radius:var(--r-lg);overflow:hidden;background:var(--surface)';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:var(--s3);cursor:pointer;user-select:none;background:var(--accent-subtle)';
    header.innerHTML = `
      <span style="font-size:var(--text-sm);font-weight:500;color:var(--accent)">📖 The Story — ${story.title}</span>
      <span class="story-arrow" style="color:var(--accent);font-size:13px;transition:transform .2s;${isOpen?'transform:rotate(90deg)':''}">▸</span>`;
    card.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = `padding:${isOpen?'var(--s4)':'0 var(--s4)'};display:${isOpen?'block':'none'}`;
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
    let lastSegment = null;

    Data.getDays().forEach(day => {
      const stops  = Data.getStopsByDay(day.id);
      const isOpen = getDayExpanded(day.id);

      // Determine the primary segment for this day (from first stop, or transit)
      const primarySeg = stops.length ? stops[0].segment : 'transit';

      // Insert country divider when segment changes
      if (primarySeg !== lastSegment) {
        root.appendChild(countryDivider(primarySeg));
        lastSegment = primarySeg;
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
