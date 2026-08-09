'use strict';

const BottomSheet = (() => {
  let overlay, sheet, body;
  let startY, currentY;

  // Trip-aware default timezone — real IANA names, not hand-maintained
  // abbreviations. The browser's own Intl API knows the correct offset
  // (DST included) for any of these, so adding a new trip to a new
  // country never requires touching this file — just the zone name.
  const CURRENCY_TZ_IANA = { JPY: 'Asia/Tokyo', THB: 'Asia/Bangkok' };
  function defaultTripTz() {
    return Data.getDefaultTimezone?.() || CURRENCY_TZ_IANA[Data.getTripCurrency?.()] || 'Africa/Nairobi';
  }

  // Bridge for stops saved before this change, which stored short
  // abbreviations (EAT/JST/MYT/UTC) instead of IANA names. Lets old
  // data keep working without a database migration.
  const LEGACY_TZ_ABBR = { EAT:'Africa/Nairobi', JST:'Asia/Tokyo', MYT:'Asia/Kuala_Lumpur', ICT:'Asia/Bangkok', UTC:'UTC' };
  function resolveTz(tz) {
    if (!tz) return defaultTripTz();
    return LEGACY_TZ_ABBR[tz] || tz;
  }

  // Real-world UTC offset in minutes for an IANA zone at a given date —
  // DST-aware via the browser's own timezone database. No offset table
  // to maintain: correct today, correct if a future trip ever lands
  // somewhere that observes daylight saving.
  function getUtcOffsetMinutes(timeZone, date = new Date()) {
    try {
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone, hour12: false,
        year:'numeric', month:'2-digit', day:'2-digit',
        hour:'2-digit', minute:'2-digit', second:'2-digit',
      });
      const parts = dtf.formatToParts(date).reduce((acc,p) => { acc[p.type]=p.value; return acc; }, {});
      const hour = parts.hour === '24' ? '0' : parts.hour;
      const asUTC = Date.UTC(+parts.year, +parts.month-1, +parts.day, +hour, +parts.minute, +parts.second);
      return Math.round((asUTC - date.getTime()) / 60000);
    } catch (e) {
      return 0; // unrecognized zone name — treat as UTC rather than crash
    }
  }

  function build() {
    overlay = document.createElement('div');
    Object.assign(overlay.style, { position:'fixed', inset:'0', background:'rgba(28,26,24,0.55)', zIndex:'200', opacity:'0', transition:'opacity 0.25s ease', display:'none' });
    overlay.addEventListener('click', close);

    sheet = document.createElement('div');
    Object.assign(sheet.style, { position:'fixed', left:'0', right:'0', bottom:'0', background:'var(--surface)', borderRadius:'20px 20px 0 0', borderTop:'1.5px solid var(--border)', zIndex:'201', transform:'translateY(100%)', transition:'transform 0.3s cubic-bezier(0.32,0.72,0,1)', maxHeight:'92vh', overflowY:'auto', paddingBottom:'env(safe-area-inset-bottom)' });

    const handle = document.createElement('div');
    Object.assign(handle.style, { width:'44px', height:'4px', background:'var(--border)', borderRadius:'var(--r-pill)', margin:'12px auto 0' });

    body = document.createElement('div');
    sheet.appendChild(handle);
    sheet.appendChild(body);
    document.body.appendChild(overlay);
    document.body.appendChild(sheet);

    // Shared timezone datalist, built once from the browser's real,
    // complete IANA zone database — not a short hand-picked list that
    // falls behind as new trips get added. Falls back to a small
    // curated set only if the browser is old enough to lack
    // Intl.supportedValuesOf (rare, but cheap to guard against).
    if (!document.getElementById('tz-datalist')) {
      const tzList = document.createElement('datalist');
      tzList.id = 'tz-datalist';
      const zones = (typeof Intl.supportedValuesOf === 'function')
        ? Intl.supportedValuesOf('timeZone')
        : ['UTC','Africa/Nairobi','Asia/Kuala_Lumpur','Asia/Tokyo','Asia/Bangkok','Asia/Qatar','Asia/Singapore','Asia/Hong_Kong'];
      zones.forEach(z => {
        const opt = document.createElement('option');
        opt.value = z;
        tzList.appendChild(opt);
      });
      document.body.appendChild(tzList);
    }

    sheet.addEventListener('touchstart', e => {
      startY = e.touches[0].clientY; currentY = startY;
    }, { passive:true });
    sheet.addEventListener('touchmove', e => {
      // Don't interfere if user is focused on an input/textarea/select
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      currentY = e.touches[0].clientY;
      const dy = currentY - startY;
      if (dy > 20) { sheet.style.transition='none'; sheet.style.transform=`translateY(${dy}px)`; e.preventDefault(); }
    }, { passive:false });
    sheet.addEventListener('touchend', () => {
      sheet.style.transition = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)';
      // Require a larger swipe (140px) to close when near inputs
      const tag = document.activeElement?.tagName;
      const hasInput = sheet.querySelector('input,textarea,select');
      const threshold = hasInput ? 140 : 90;
      if ((currentY - startY) > threshold) close(); else sheet.style.transform = 'translateY(0)';
    }, { passive:true });
  }

  /* ─── Time input auto-formatter ─────────────────────────── */
  function wireTimeInput(id) {
    const el = body.querySelector('#' + id);
    if (!el) return;
    el.setAttribute('placeholder', 'HH:MM');
    el.setAttribute('maxlength', '5');
    el.addEventListener('input', () => {
      let v = el.value.replace(/[^0-9]/g, '');
      if (v.length > 4) v = v.slice(0, 4);
      if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2);
      el.value = v;
    });
    el.addEventListener('blur', () => {
      const v = el.value;
      if (v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
        el.style.borderColor = 'var(--danger-text)';
        el.title = 'Use HH:MM format (e.g. 09:30)';
      } else {
        el.style.borderColor = '';
        el.title = '';
      }
    });
  }

  function showSheet() {
    overlay.style.display = 'block';
    requestAnimationFrame(() => requestAnimationFrame(() => { overlay.style.opacity='1'; sheet.style.transform='translateY(0)'; }));
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!sheet) return;
    overlay.style.opacity = '0';
    sheet.style.transform = 'translateY(100%)';
    setTimeout(() => { overlay.style.display='none'; document.body.style.overflow=''; }, 300);
  }

  /* ─── Field builders ─────────────────────────────────────── */
  function field(label, id, value, type='text', placeholder='', step=null) {
    return `<div class="bs-edit-group"><label class="bs-edit-label" for="${id}">${label}</label><input id="${id}" class="bs-input" type="${type}" ${step?`step="${step}"`:''} value="${(value||'').toString().replace(/"/g,'&quot;')}" placeholder="${placeholder}"></div>`;
  }
  function textarea(label, id, value, placeholder='') {
    return `<div class="bs-edit-group"><label class="bs-edit-label" for="${id}">${label}</label><textarea id="${id}" class="bs-textarea" rows="2" placeholder="${placeholder}">${value||''}</textarea></div>`;
  }
  // Short display form of an IANA zone (e.g. "Asia/Tokyo" → "JST" or
  // "GMT+9") — the full IANA name is what's stored and calculated with,
  // but far too long to show inline next to a time.
  function tzAbbr(timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(new Date());
      return parts.find(p => p.type === 'timeZoneName')?.value || timeZone;
    } catch (e) {
      return timeZone;
    }
  }
  // Same date formatting as itinerary.js's formatDayDate — duplicated
  // here rather than shared, same reasoning as tzAbbr above: it's a
  // tiny, fully self-contained function. Turns "2026-12-27" into
  // "Sun, 27 Dec 2026" instead of showing the raw ISO string.
  function formatDayDate(iso) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso;
    const [, y, mo, d] = m;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    const weekday = dt.toLocaleDateString('en-US', { weekday: 'short' });
    const month   = dt.toLocaleDateString('en-US', { month: 'short' });
    return `${weekday}, ${Number(d)} ${month} ${y}`;
  }
  // Compact variant for dropdown option labels — same as itinerary.js's
  // formatShortDate, "9 Aug" with no weekday/year, keeps <select> rows short.
  function formatShortDate(iso) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso;
    const [, y, mo, d] = m;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    const month = dt.toLocaleDateString('en-US', { month: 'short' });
    return `${Number(d)} ${month}`;
  }
  // Full real timezone list, built once and cached — same source as
  // before, just no longer offered as a free-text datalist (which let
  // invalid values like "Asia/hanoi" get typed and silently saved).
  let _tzZonesCache = null;
  function getAllZones() {
    if (_tzZonesCache) return _tzZonesCache;
    _tzZonesCache = (typeof Intl.supportedValuesOf === 'function')
      ? Intl.supportedValuesOf('timeZone')
      : ['UTC','Africa/Nairobi','Asia/Kuala_Lumpur','Asia/Tokyo','Asia/Bangkok','Asia/Qatar','Asia/Singapore','Asia/Hong_Kong','Asia/Ho_Chi_Minh'];
    return _tzZonesCache;
  }

  /* ── Timezone combobox — searchable, but only a real zone from the
     list can ever end up as the saved value. Typing filters a dropdown
     of matches; tapping one selects it. If the field is left with text
     that isn't an exact, valid zone name, it snaps back to the last
     valid value on blur instead of silently saving something wrong. ── */
  function wireTzCombobox(inputOrId) {
    const input = typeof inputOrId === 'string' ? body.querySelector('#'+inputOrId) : inputOrId;
    if (!input || input.dataset.tzWired) return;
    input.dataset.tzWired = '1';

    const listEl = document.createElement('div');
    listEl.className = 'bs-tz-suggestions';
    input.insertAdjacentElement('afterend', listEl);

    let lastValid = input.value;
    const zones = getAllZones();

    function renderSuggestions() {
      const q = input.value.trim().toLowerCase();
      if (!q) { listEl.style.display = 'none'; return; }
      const matches = zones.filter(z => z.toLowerCase().includes(q)).slice(0, 8);
      if (!matches.length) {
        listEl.innerHTML = '<div class="bs-tz-suggestion bs-tz-suggestion--empty">No matching timezone</div>';
      } else {
        listEl.innerHTML = matches.map(z =>
          `<div class="bs-tz-suggestion" data-zone="${z}">${z.replace(/_/g,' ')}</div>`).join('');
      }
      listEl.style.display = 'block';
    }

    input.addEventListener('input', renderSuggestions);
    input.addEventListener('focus', renderSuggestions);

    listEl.addEventListener('mousedown', (e) => {
      const item = e.target.closest('.bs-tz-suggestion[data-zone]');
      if (!item) return;
      input.value = item.dataset.zone;
      lastValid = item.dataset.zone;
      listEl.style.display = 'none';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        listEl.style.display = 'none';
        if (!zones.includes(input.value)) {
          input.value = lastValid; // reject anything that isn't a real, exact zone name
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          lastValid = input.value;
        }
      }, 150); // let a suggestion's mousedown register before blur fires
    });
  }

  // Full real currency list, same approach as getAllZones — built once,
  // sourced from the browser's own Intl data so it's never a hand-
  // maintained list going stale. Paired with a display name so the
  // combobox can match "taiwan" → TWD, not just the 3-letter code.
  let _currencyCache = null;
  function getAllCurrencies() {
    if (_currencyCache) return _currencyCache;
    let codes;
    try {
      codes = (typeof Intl.supportedValuesOf === 'function')
        ? Intl.supportedValuesOf('currency').map(c => c.toUpperCase())
        : ['USD','EUR','GBP','JPY','TWD','THB','MYR','SGD','CNY','HKD','KRW','AUD','CAD'];
    } catch (e) {
      codes = ['USD','EUR','GBP','JPY','TWD','THB','MYR','SGD','CNY','HKD','KRW','AUD','CAD'];
    }
    let names = {};
    try {
      const dn = new Intl.DisplayNames(['en'], { type: 'currency' });
      codes.forEach(c => { names[c] = dn.of(c) || c; });
    } catch (e) { /* DisplayNames not supported — fall back to bare codes */ }
    _currencyCache = codes.map(c => ({ code: c, name: names[c] || c }));
    return _currencyCache;
  }

  /* ── Currency combobox — same searchable/validated pattern as the
     timezone combobox. Only an exact ISO code can ever be saved; typing
     filters by code or name, tapping a suggestion selects it, and
     leaving invalid text snaps back on blur. ── */
  function wireCurrencyCombobox(inputOrId, onChange) {
    const input = typeof inputOrId === 'string' ? body.querySelector('#'+inputOrId) : inputOrId;
    if (!input || input.dataset.curWired) return;
    input.dataset.curWired = '1';

    const listEl = document.createElement('div');
    listEl.className = 'bs-tz-suggestions';
    input.insertAdjacentElement('afterend', listEl);

    let lastValid = input.value;
    const currencies = getAllCurrencies();
    const codes = currencies.map(c => c.code);

    function renderSuggestions() {
      const q = input.value.trim().toLowerCase();
      if (!q) { listEl.style.display = 'none'; return; }
      const matches = currencies.filter(c =>
        c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
      ).slice(0, 8);
      if (!matches.length) {
        listEl.innerHTML = '<div class="bs-tz-suggestion bs-tz-suggestion--empty">No matching currency</div>';
      } else {
        listEl.innerHTML = matches.map(c =>
          `<div class="bs-tz-suggestion" data-code="${c.code}">${c.code} — ${c.name}</div>`).join('');
      }
      listEl.style.display = 'block';
    }

    input.addEventListener('input', renderSuggestions);
    input.addEventListener('focus', renderSuggestions);

    listEl.addEventListener('mousedown', (e) => {
      const item = e.target.closest('.bs-tz-suggestion[data-code]');
      if (!item) return;
      input.value = item.dataset.code;
      lastValid = item.dataset.code;
      listEl.style.display = 'none';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      if (onChange) onChange(item.dataset.code);
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        listEl.style.display = 'none';
        if (!codes.includes(input.value.toUpperCase())) {
          input.value = lastValid;
        } else {
          input.value = input.value.toUpperCase();
          lastValid = input.value;
        }
        input.dispatchEvent(new Event('change', { bubbles: true }));
        if (onChange) onChange(input.value);
      }, 150);
    });
  }

  // Cost + its own currency, side by side — the currency defaults to
  // the trip's currency but can be overridden per stop/overnight, since
  // a single trip routinely mixes currencies (e.g. a flight paid in USD,
  // a homestay paid in local currency on arrival).
  function costWithCurrency(costId, curId, costVal, curVal) {
    const cur = curVal || Data.getTripCurrency?.() || 'USD';
    return `<div class="bs-edit-group">
      <label class="bs-edit-label" for="${costId}">Cost</label>
      <div class="bs-time-row">
        <input id="${costId}" class="bs-input" type="number" step="0.01" value="${costVal||''}" placeholder="e.g. 18000" style="flex:1.4">
        <div style="position:relative;flex:1;min-width:0">
          <input id="${curId}" class="bs-input bs-tz-sel" type="text" autocomplete="off" value="${cur}" placeholder="Currency…">
        </div>
      </div></div>`;
  }

  /* ── Payment status — a separate axis from booking status. Booking
     status answers "is this reserved/confirmed?"; payment status answers
     "has this actually been paid?" A stop can be booked and unpaid, or
     open and already deposited — the two shouldn't be conflated. ── */
  const paymentOpts = [{v:'unpaid',l:'Unpaid'},{v:'partial',l:'Partially paid'},{v:'paid',l:'✓ Paid'}];
  const paymentCls  = {paid:'badge-booked', partial:'badge-pending', unpaid:'badge-open'};
  function paymentLbl(payment, cur) {
    if (!payment || payment.status === 'paid') return payment?.status === 'paid' ? '✓ Paid' : 'Unpaid';
    if (payment.status === 'partial') return `Partial · ${cur} ${(payment.amountPaid||0).toLocaleString()} paid`;
    return 'Unpaid';
  }
  function paymentFieldsHTML(prefix, payment) {
    const p = payment || {};
    return `
      ${select('Payment status', `${prefix}-paystatus`, p.status || 'unpaid', paymentOpts)}
      <div id="${prefix}-paidamt-wrap" style="display:${p.status==='partial'?'block':'none'}">
        ${field('Amount paid so far', `${prefix}-paidamt`, p.amountPaid||'', 'number', 'e.g. 5000', '0.01')}
      </div>`;
  }
  // Toggle the "amount paid" field's visibility as the payment status
  // select changes, same show/hide pattern already used for luggage
  // forwarding's conditional fields.
  function wirePaymentStatusToggle(prefix) {
    const sel = body.querySelector(`#${prefix}-paystatus`);
    const wrap = body.querySelector(`#${prefix}-paidamt-wrap`);
    if (!sel || !wrap || sel.dataset.wired) return;
    sel.dataset.wired = '1';
    sel.addEventListener('change', () => {
      wrap.style.display = sel.value === 'partial' ? 'block' : 'none';
    });
  }

  function timeWithTz(timeId, tzId, timeVal, tzVal) {
    const tVal = /^\d{2}:\d{2}$/.test(timeVal||'') ? timeVal : '';
    const defaultTz = resolveTz(tzVal);
    return `<div class="bs-edit-group">
      <label class="bs-edit-label" for="${timeId}">Time</label>
      <div class="bs-time-row">
        <input id="${timeId}" class="bs-input" type="time" value="${tVal}">
        <div style="position:relative;flex:1;min-width:0">
          <input id="${tzId}" class="bs-input bs-tz-sel" type="text" autocomplete="off" value="${defaultTz}" placeholder="Search city or region…">
        </div>
      </div></div>`;
  }
  function select(label, id, value, options) {
    const opts = options.map(o => `<option value="${o.v}" ${o.v===value?'selected':''}>${o.l}</option>`).join('');
    return `<div class="bs-edit-group"><label class="bs-edit-label" for="${id}">${label}</label><select id="${id}" class="bs-input"><option value="">—</option>${opts}</select></div>`;
  }
  function detailRow(iconFn, text, style='') {
    if (!text) return '';
    return `<div class="bs-row"><span>${iconFn('icon-sm')}</span><span ${style}>${text}</span></div>`;
  }
  const statusOpts = [{v:'open',l:'Open'},{v:'pending',l:'Pending'},{v:'urgent',l:'⚡ Urgent'},{v:'booked',l:'✓ Booked'}];
  const statusCls  = {booked:'badge-booked',pending:'badge-pending',urgent:'badge-urgent',open:'badge-open'};
  const statusLbl  = {booked:'✓ Booked',pending:'Pending',urgent:'⚡ Urgent',open:'Open'};

  /* ─── Transport detail block — differs for plane vs train/boat ──────
     Plane only needs departure/arrival airport + time; seat reservation,
     JR Pass coverage, and platform are rail-only concepts and don't apply. */
  function editTrainDetailHTML(type, td, flightNoFallback) {
    td = td || {};
    const isPlane = type === 'plane';
    return `
      <label class="bs-edit-label">${isPlane ? 'Flight details' : 'Train details (for JR cheat sheet)'}</label>
      ${!isPlane ? `
      <div style="display:flex;align-items:center;gap:var(--s3);margin-bottom:var(--s3)">
        <span style="font-size:var(--text-sm);color:var(--text-secondary)">Seat reservation required?</span>
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-left:auto">
          <input type="checkbox" id="e-seatres" ${td.seatReservation?'checked':''} style="accent-color:var(--accent);width:16px;height:16px">
          <span style="font-size:var(--text-sm)">Yes</span>
        </label>
      </div>
      <div style="display:flex;align-items:center;gap:var(--s3);margin-bottom:var(--s3)">
        <span style="font-size:var(--text-sm);color:var(--text-secondary)">Covered by JR Pass?</span>
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-left:auto">
          <input type="checkbox" id="e-jrpass" ${td.jrPass!==false?'checked':''} style="accent-color:var(--accent);width:16px;height:16px">
          <span style="font-size:var(--text-sm)">Yes</span>
        </label>
      </div>
      ${field('Platform','e-platform',td.platform||'','text','e.g. Platform 2')}
      ` : ''}
      ${field(isPlane?'Departure airport':'Origin','e-origin',td.origin||'','text',isPlane?'e.g. NBO':'e.g. Shin-Osaka')}
      ${isPlane ? field('Departure terminal','e-depterminal',td.depTerminal||'','text','e.g. 1 (shown until AeroDataBox verifies)') : ''}
      ${field(isPlane?'Arrival airport':'Destination','e-destination',td.destination||'','text',isPlane?'e.g. JRO':'e.g. Kii-Tanabe')}
      ${isPlane ? field('Arrival terminal','e-arrterminal',td.arrTerminal||'','text','e.g. 2 (shown until AeroDataBox verifies)') : ''}
      ${field('Arrive time','e-arrive',/^\d{2}:\d{2}$/.test(td.arriveTime||'')?td.arriveTime:'','time')}
      <div class="bs-edit-group" style="position:relative">
        <label class="bs-edit-label" for="e-arrivetz">Arrival timezone</label>
        <input id="e-arrivetz" class="bs-input bs-tz-sel" type="text" autocomplete="off" value="${resolveTz(td.arriveTimeZone)}" placeholder="Search city or region…">
      </div>
      <div class="bs-edit-group" style="display:flex;align-items:center;gap:var(--s3)">
        <label class="bs-edit-label" style="margin-bottom:0">Duration</label>
        <span id="e-duration-display" style="font-size:var(--text-sm);font-weight:500;color:var(--accent)">—</span>
        <input id="e-duration" type="hidden" value="${td.duration||''}">
      </div>
      ${field(isPlane?'Flight number':'Flight/Train #','e-trainno',td.trainNumber||flightNoFallback||'','text',isPlane?'e.g. QR648':'e.g. QR648 or Kuroshio 5')}
      ${isPlane ? field('Airline','e-airline',td.airline||'','text','e.g. Qatar Airways') : ''}
      <p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:-6px;margin-bottom:var(--s2)">${isPlane ? 'Airline code + number, no space (e.g. <strong>QR648</strong>, not "QR 648" or "Qatar 648"). Used to auto-track schedule changes — once verified, the confirmed airline/times override whatever\'s typed here.' : 'For flights: airline code + number, no space (e.g. <strong>QR648</strong>, not "QR 648" or "Qatar 648"). Used to auto-track schedule changes.'}</p>`;
  }
  function addTrainDetailHTML(type, td) {
    td = td || {};
    const isPlane = type === 'plane';
    return `
      <label class="bs-edit-label">${isPlane ? 'Flight details' : 'Train / service details (for JR cheat sheet)'}</label>
      ${!isPlane ? `
      <div style="display:flex;align-items:center;gap:var(--s3);margin-bottom:var(--s3)">
        <span style="font-size:var(--text-sm);color:var(--text-secondary)">Seat reservation required?</span>
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-left:auto">
          <input type="checkbox" id="a-seatres" ${td.seatReservation?'checked':''} style="accent-color:var(--accent);width:16px;height:16px">
          <span style="font-size:var(--text-sm)">Yes</span>
        </label>
      </div>
      ` : ''}
      ${field(isPlane?'Departure airport':'Origin (boarding station)','a-origin',td.origin||'','text',isPlane?'e.g. NBO':'e.g. Shin-Osaka')}
      ${isPlane ? field('Departure terminal','a-depterminal',td.depTerminal||'','text','e.g. 1 (shown until AeroDataBox verifies)') : ''}
      ${field(isPlane?'Arrival airport':'Destination (alighting)','a-destination',td.destination||'','text',isPlane?'e.g. JRO':'e.g. Kii-Tanabe')}
      ${isPlane ? field('Arrival terminal','a-arrterminal',td.arrTerminal||'','text','e.g. 2 (shown until AeroDataBox verifies)') : ''}
      ${field('Arrive time','a-arrive',td.arriveTime||'','time')}
      <div class="bs-edit-group" style="position:relative">
        <label class="bs-edit-label" for="a-arrivetz">Arrival timezone</label>
        <input id="a-arrivetz" class="bs-input bs-tz-sel" type="text" autocomplete="off" value="${resolveTz(td.arriveTimeZone)}" placeholder="Search city or region…">
      </div>
      <div class="bs-edit-group" style="display:flex;align-items:center;gap:var(--s3)">
        <label class="bs-edit-label" style="margin-bottom:0">Duration</label>
        <span id="a-duration-display" style="font-size:var(--text-sm);font-weight:500;color:var(--accent)">—</span>
        <input id="a-duration" type="hidden" value="${td.duration||''}">
      </div>
      ${field(isPlane?'Flight number':'Flight/Train #','a-trainno',td.trainNumber||'','text',isPlane?'e.g. QR648':'e.g. QR648 or TBD')}
      ${isPlane ? field('Airline','a-airline',td.airline||'','text','e.g. Qatar Airways') : ''}
      <p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:-6px;margin-bottom:var(--s2)">${isPlane ? 'Airline code + number, no space (e.g. <strong>QR648</strong>, not "QR 648" or "Qatar 648"). Used to auto-track schedule changes — once verified, the confirmed airline/times override whatever\'s typed here.' : 'For flights: airline code + number, no space (e.g. <strong>QR648</strong>, not "QR 648" or "Qatar 648"). Used to auto-track schedule changes.'}</p>`;
  }

  /* ─── Stop view mode ─────────────────────────────────────── */
  function stopViewHTML(stop, day) {
    const stampCollected = false; // no stamps in Africa PWA
    const tIconKey = {plane:'plane',train:'train',bus:'bus',walk:'walk',boat:'boat',cable:'cable',car:'car',taxi:'taxi'}[stop.transportType] || 'walk';
    let transportBlock = '';
    if (stop.transport || stop.trainDetail) {
      const rows = [];
      if (stop.transport) rows.push(`<div class="bs-transport-row">${Icons[tIconKey]('icon-sm')}<span>${stop.transport}</span></div>`);
      if (stop.trainDetail?.platform) rows.push(`<div class="bs-transport-row">${Icons.info('icon-sm')}<span>Platform ${stop.trainDetail.platform}</span></div>`);
      if (rows.length) transportBlock = `<div class="bs-transport-card"><p class="bs-transport-card-title">Transport</p>${rows.join('')}</div>`;
    }
    return `
      <div class="bs-detail">
        <div class="bs-tags">${day?`<span class="badge badge-open">${day.label}</span><span class="badge badge-open">${formatDayDate(day.date)}</span>`:''}${stop.booking.status?`<span class="badge ${statusCls[stop.booking.status]}">${statusLbl[stop.booking.status]}</span>`:''}${stop.booking?.cost?`<span class="badge ${paymentCls[stop.booking.payment?.status||'unpaid']}">${paymentLbl(stop.booking.payment, stop.booking.costCurrency||Data.getTripCurrency())}</span>`:''}</div>
        <p class="bs-name">${stop.name}</p>
        <p class="bs-activity">${stop.activity||''}</p>
        ${transportBlock}
        <div class="bs-rows">
          ${detailRow(Icons.clock, stop.time ? `${stop.time}${stop.timeZone?' '+tzAbbr(resolveTz(stop.timeZone)):''}` : '')}
          ${detailRow(Icons.card, stop.booking?.ref ? 'Ref: '+stop.booking.ref : '')}
          ${detailRow(Icons.cash, stop.booking?.cost ? (stop.booking.costCurrency||Data.getTripCurrency())+' '+stop.booking.cost.toLocaleString() : '')}
          ${detailRow(Icons.info, stop.notes, 'style="color:var(--accent)"')}
        </div>
        <!-- no stamp section for Africa -->
        <div class="bs-actions">
          ${stop.booking.status!=='booked'?`<button class="btn btn-primary bs-full-btn" id="bs-book-btn">Mark as booked</button>`:`<button class="btn btn-ghost bs-full-btn" id="bs-unbook-btn">✓ Booked — unmark</button>`}
          ${stop.hiddenFromMap
            ? `<button class="btn btn-ghost bs-full-btn" id="bs-hide-btn">🙈 Hidden from map — tap to show</button>`
            : `<button class="btn btn-ghost bs-full-btn" id="bs-feature-btn">${stop.featuredOnMap ? '📍 Featured on map — tap to unfeature' : '📍 Feature this stop on the map'}</button>
               <button class="btn btn-ghost bs-full-btn" id="bs-hide-btn" style="color:var(--text-muted)">🙈 Hide this stop from the map</button>`}
          <div class="bs-action-row"><button class="btn btn-ghost" id="bs-edit-btn">Edit stop</button><button class="btn btn-danger" id="bs-remove-btn">Remove</button></div>
        </div>
      </div>`;
  }

  /* ─── Stop edit mode ─────────────────────────────────────── */
  function stopEditHTML(stop, day) {
    const days = Data.getDays().map(d => ({ v:d.id, l:`${d.label} · ${formatShortDate(d.date)}` }));
    const transTypes = [{v:'plane',l:'Plane'},{v:'train',l:'Train'},{v:'bus',l:'Bus'},{v:'car',l:'Car'},{v:'taxi',l:'Taxi'},{v:'walk',l:'Walk'},{v:'boat',l:'Boat'},{v:'cable',l:'Cable car'}];
    const showTrain = ['train','plane','boat'].includes(stop.transportType||'');
    return `
      <div class="bs-detail">
        <p class="bs-name" style="margin-bottom:var(--s4)">Edit stop</p>
        <p class="bs-section-head">Details</p>
        ${field('Stop name','e-name',stop.name,'text','e.g. Takijiri-oji')}
        ${textarea('Activity','e-activity',stop.activity,'What happens here?')}
        ${timeWithTz('e-time','e-tz',stop.time,stop.timeZone)}
        ${select('Move to day','e-day',stop.dayId,days)}
        <p class="bs-section-head">Transport</p>
        ${textarea('Transport detail','e-transport',stop.transport,'e.g. JR Oito Line · ~40 min · JR Pass \u2713')}
        ${select('Transport type','e-ttype',stop.transportType,transTypes)}
        <div id="e-train-detail-block" class="bs-train-detail-block" style="display:${showTrain?'block':'none'};margin-top:var(--s2)">
          ${editTrainDetailHTML(stop.transportType||'walk', {...(stop.trainDetail||{}), airline: stop.airline}, stop.flightNo)}
        </div>
        <p class="bs-section-head">Reservation</p>
        <div class="bs-edit-group" style="display:flex;align-items:center;gap:var(--s3)">
          <label class="bs-edit-label" style="margin-bottom:0">Needs booking?</label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-left:auto">
            <input type="checkbox" id="e-needsbook" ${stop.needsBooking?'checked':''} style="accent-color:var(--accent);width:16px;height:16px">
            <span style="font-size:var(--text-sm)">Yes</span>
          </label>
        </div>
        ${select('Category','e-category',stop.category||'',[{v:'transport',l:'Transport'},{v:'activity',l:'Activity'}])}
        <p class="bs-section-head">Booking</p>
        ${select('Status','e-status',stop.booking.status,statusOpts)}
        ${field('Reference','e-ref',stop.booking.ref||'','text','e.g. HTL-20270412')}
        ${costWithCurrency('e-cost','e-cost-cur',stop.booking.cost,stop.booking.costCurrency)}
        ${paymentFieldsHTML('e', stop.booking.payment)}
        <div class="bs-edit-group">
          <label class="bs-edit-label">Deadline</label>
          <div style="display:flex;align-items:center;gap:var(--s2)">
            <input id="e-deadline" type="date" value="${stop.booking.deadline||''}" class="bs-input" style="flex:1">
            <button type="button" id="e-deadline-clear" class="btn btn-ghost" style="padding:8px 12px;font-size:var(--text-sm);flex-shrink:0">Clear</button>
          </div>
        </div>
        ${textarea('Notes','e-notes',stop.notes||'','Reminders, tips\u2026')}
        <div class="bs-actions" style="margin-top:var(--s4)">
          <button class="btn btn-primary bs-full-btn" id="bs-save-btn">Save changes</button>
          <button class="btn btn-ghost bs-full-btn" id="bs-cancel-btn">Cancel</button>
        </div>
      </div>`;
  }
  /* Next day (in order) that actually has an overnight set — used to
     default the luggage forwarding "To" field. */
  function nextOvernightName(currentDayId) {
    const days = Data.getDays();
    const idx = days.findIndex(d => d.id === currentDayId);
    if (idx === -1) return '';
    for (let i = idx + 1; i < days.length; i++) {
      const o = Data.getOvernight(days[i].id);
      if (o?.name) return o.name;
    }
    return '';
  }

  function overnightHTML(day) {
    const o = Data.getOvernight(day.id) || {};
    const lf = o.luggage_forwarding || {};
    return `
      <div class="bs-detail">
        <div class="bs-tags"><span class="badge badge-open">${day.label}</span><span class="badge badge-open">${formatDayDate(day.date)}</span></div>
        <p class="bs-name" style="margin-bottom:var(--s4)">${Icons.moon('icon-sm')} Overnight stay</p>
        ${field('Accommodation name','o-name',o.name||'','text','e.g. Kiri-no-Sato Takahara Lodge')}
        ${field('Address','o-address',o.address||'','text','e.g. 15 Takahara, Tanabe, Wakayama')}
        ${select('Booking status','o-status',o.status||'open',statusOpts)}
        ${field('Booking reference','o-ref',o.ref||'','text','e.g. HTL-20270412')}
        ${costWithCurrency('o-cost','o-cost-cur',o.cost,o.cost_currency)}
        ${paymentFieldsHTML('o', { status: o.payment_status, amountPaid: o.amount_paid })}
        ${field('Book by (deadline)','o-deadline',o.deadline||'','date')}

        <label style="display:flex;align-items:center;gap:8px;margin:var(--s4) 0 var(--s2);cursor:pointer">
          <input type="checkbox" id="o-lf-toggle" ${lf.enabled?'checked':''} style="accent-color:var(--accent);width:16px;height:16px">
          <span style="font-size:var(--text-sm);font-weight:500">🧳 Luggage forwarding needed?</span>
        </label>
        <div id="o-lf-fields" style="display:${lf.enabled?'flex':'none'};flex-direction:column;gap:var(--s2);padding:var(--s3);background:var(--surface-raised);border-radius:var(--r-md);margin-bottom:var(--s3)">
          ${field('From (drop-off point)','o-lf-from',lf.from || o.name || '','text','e.g. Hongu Taisha bus terminal counter')}
          ${field('To (pickup point)','o-lf-to',lf.to || nextOvernightName(day.id) || '','text','e.g. Koguchi guesthouse reception')}
          ${field('Drop-off cutoff time','o-lf-cutoff',lf.cutoff||'','text','e.g. 8:00am')}
          ${field('Pickup time','o-lf-pickup',lf.pickup||'','text','e.g. after 4:00pm')}
          ${field('Courier / service','o-lf-courier',lf.courier||'','text','e.g. Yamato Transport (Takkyubin)')}
          ${field(`Cost (${Data.getTripCurrency?.() || 'USD'})`,'o-lf-cost',lf.cost||'','number','e.g. 2000','0.01')}
          ${select('Status','o-lf-status',lf.status||'not_arranged',[{v:'not_arranged',l:'Not yet arranged'},{v:'arranged',l:'✓ Arranged'}])}
          ${field('Notes','o-lf-notes',lf.notes||'','text','optional')}
        </div>

        <div class="bs-actions" style="margin-top:var(--s4)">
          <button class="btn btn-primary bs-full-btn" id="o-save-btn">Save</button>
          <button class="btn btn-ghost bs-full-btn" id="o-cancel-btn">Cancel</button>
          ${o.id ? `<button class="btn btn-ghost bs-full-btn" id="o-delete-btn" style="color:var(--danger-text);border-color:var(--danger-text)">Clear accommodation</button>` : ''}
        </div>
      </div>`;
  }

  /* ─── Add stop form ──────────────────────────────────────── */
  function addHTML(dayId) {
    const day = Data.getDays().find(d => d.id === dayId);
    const days = Data.getDays().map(d => ({ v:d.id, l:`${d.label} · ${formatShortDate(d.date)}` }));
    const transTypes = [{v:'plane',l:'Plane'},{v:'train',l:'Train'},{v:'bus',l:'Bus'},{v:'car',l:'Car'},{v:'taxi',l:'Taxi'},{v:'walk',l:'Walk'},{v:'boat',l:'Boat'},{v:'cable',l:'Cable car'}];
    return `
      <div class="bs-detail">
        <p class="bs-name" style="margin-bottom:4px">Add stop</p>
        <p class="bs-activity" style="margin-bottom:var(--s4)">${day?day.label+' · '+formatDayDate(day.date):''}</p>
        ${select('Day','a-day',dayId,days)}
        ${field('Stop name *','a-name','','text','e.g. Kumano Hongu Taisha')}
        ${textarea('Activity','a-activity','','What happens here?')}
        ${timeWithTz('a-time','a-tz','','')}
        ${textarea('Transport to get here','a-transport','','e.g. On foot · 3.6 km')}
        ${select('Transport type','a-ttype','walk',transTypes)}
        <div id="a-train-detail-block" class="bs-train-detail-block" style="display:none;margin-top:var(--s2)"></div>
        <p class="bs-section-head" style="margin-top:var(--s3)">Reservation</p>
        <div class="bs-edit-group" style="display:flex;align-items:center;gap:var(--s3)">
          <label class="bs-edit-label" style="margin-bottom:0">Needs booking?</label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-left:auto">
            <input type="checkbox" id="a-needsbook" style="accent-color:var(--accent);width:16px;height:16px">
            <span style="font-size:var(--text-sm)">Yes</span>
          </label>
        </div>
        ${select('Category','a-category','',[{v:'transport',l:'Transport'},{v:'activity',l:'Activity'}])}
        <p class="bs-section-head" style="margin-top:var(--s3)">Booking</p>
        ${select('Status','a-status','',statusOpts)}
        ${field('Reference','a-ref','','text','e.g. HTL-20270412')}
        ${costWithCurrency('a-cost','a-cost-cur','','')}
        ${paymentFieldsHTML('a', null)}
        <div class="bs-edit-group">
          <label class="bs-edit-label">Deadline</label>
          <input id="a-deadline" type="date" class="bs-input">
        </div>
        <div class="bs-actions" style="margin-top:var(--s4)">
          <button class="btn btn-primary bs-full-btn" id="bs-add-btn">Add stop</button>
          <button class="btn btn-ghost bs-full-btn" id="bs-addcancel-btn">Cancel</button>
        </div>
      </div>`;
  }

  /* ─── Duration auto-calculator ──────────────────────────── */
  // Converts each leg's local time to a common reference using that
  // leg's own real timezone offset (via getUtcOffsetMinutes), instead
  // of assuming departure and arrival share one zone.
  function calcDuration(depart, arrive, departTz, arriveTz) {
    if (!depart || !arrive) return '';
    const toM = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
    const now = new Date();
    const dOff = getUtcOffsetMinutes(resolveTz(departTz), now);
    const aOff = getUtcOffsetMinutes(resolveTz(arriveTz || departTz), now);
    let d = toM(depart) - dOff;
    let a = toM(arrive) - aOff;
    if (a <= d) a += 1440; // still crosses midnight once both are on a common reference
    const diff = a - d;
    const h = Math.floor(diff/60), m = diff%60;
    return h && m ? h+'h '+m+'min' : h ? h+'h' : m+'min';
  }

  function wireAutoduration(departId, arriveId, displayId, hiddenId, departTzId, arriveTzId) {
    const update = () => {
      const d   = body.querySelector('#'+departId)?.value;
      const a   = body.querySelector('#'+arriveId)?.value;
      const dTz = departTzId ? body.querySelector('#'+departTzId)?.value : defaultTripTz();
      const aTz = arriveTzId ? body.querySelector('#'+arriveTzId)?.value : dTz;
      const calc = calcDuration(d, a, dTz, aTz);
      const disp = body.querySelector('#'+displayId);
      const hid  = body.querySelector('#'+hiddenId);
      if (disp) disp.textContent = calc || '—';
      if (hid)  hid.value = calc;
    };
    [departId, arriveId, departTzId, arriveTzId].filter(Boolean).forEach(id => {
      const el = body.querySelector('#'+id);
      el?.addEventListener('change', update);
      el?.addEventListener('input', update);
    });
    update();
  }

  /* ─── Wire: stop view ────────────────────────────────────── */
  function wireStopView(stop, day) {
    body.querySelector('#bs-book-btn,#bs-unbook-btn')?.addEventListener('click', async () => {
      const s = stop.booking.status !== 'booked' ? 'booked' : 'pending';
      try {
        await Data.updateStop(stop.id, { booking:{...stop.booking, status:s} });
        Toast.show(s==='booked'?`${stop.name} booked`:'Booking unmarked', s==='booked'?'success':'info');
      } catch(e) {
        Toast.show('Could not save — check connection', 'danger');
      }
      App.updateUrgentBadge(); close();
      window.ItineraryScreen?.refresh(); window.BookingsScreen?.refresh?.();
    });
    // Stamp collect button removed — no stamps in Africa PWA
    body.querySelector('#bs-feature-btn')?.addEventListener('click', async () => {
      const next = !stop.featuredOnMap;
      try {
        if (next) {
          // Only one featured stop per day — un-feature any sibling first,
          // so map.js's "show the featured one" pick stays unambiguous.
          const siblings = (Data.getStopsByDay?.(stop.dayId) || []).filter(s => s.id !== stop.id && s.featuredOnMap);
          for (const sib of siblings) await Data.updateStop(sib.id, { featuredOnMap: false });
        }
        await Data.updateStop(stop.id, { featuredOnMap: next });
        Toast.show(next ? `${stop.name} featured on map` : 'Unfeatured', 'info');
      } catch (e) {
        Toast.show('Could not save — check connection', 'danger');
      }
      window.MapScreen?.refresh?.(); close();
    });
    body.querySelector('#bs-hide-btn')?.addEventListener('click', async () => {
      const next = !stop.hiddenFromMap;
      try {
        await Data.updateStop(stop.id, { hiddenFromMap: next });
        Toast.show(next ? `${stop.name} hidden from map` : `${stop.name} shown on map`, 'info');
      } catch (e) {
        Toast.show('Could not save — check connection', 'danger');
      }
      window.MapScreen?.refresh?.(); close();
    });
    body.querySelector('#bs-edit-btn')?.addEventListener('click', () => { body.innerHTML=stopEditHTML(stop,day); wireStopEdit(stop,day); });

    let removeArmed = false;
    let removeResetTimer = null;
    const removeBtn = body.querySelector('#bs-remove-btn');
    removeBtn?.addEventListener('click', async () => {
      if (!removeArmed) {
        removeArmed = true;
        removeBtn.textContent = 'Tap again to confirm';
        removeBtn.style.background = 'var(--danger-text)';
        removeBtn.style.color = '#fff';
        removeResetTimer = setTimeout(() => {
          removeArmed = false;
          removeBtn.textContent = 'Remove';
          removeBtn.style.background = '';
          removeBtn.style.color = '';
        }, 4000);
        return;
      }
      clearTimeout(removeResetTimer);
      await Data.deleteStop(stop.id); Toast.show(`${stop.name} removed`,'warning'); close();
      window.ItineraryScreen?.refresh(); window.BookingsScreen?.refresh?.();
    });
  }

  /* ─── Wire: stop edit ────────────────────────────────────── */
  function wireStopEdit(stop, day) {
    const g = id => body.querySelector('#'+id)?.value?.trim()||'';
    const editTType = body.querySelector('#e-ttype');
    const trainBlock = body.querySelector('.bs-train-detail-block');

    // Reads whatever's currently in the block's fields (not stop.trainDetail)
    // so switching the type dropdown doesn't discard in-progress edits.
    function currentEditValues() {
      return {
        seatReservation: body.querySelector('#e-seatres')?.checked,
        jrPass:          body.querySelector('#e-jrpass')?.checked,
        platform:        body.querySelector('#e-platform')?.value,
        origin:          body.querySelector('#e-origin')?.value,
        destination:     body.querySelector('#e-destination')?.value,
        arriveTime:      body.querySelector('#e-arrive')?.value,
        arriveTimeZone:  body.querySelector('#e-arrivetz')?.value,
        duration:        body.querySelector('#e-duration')?.value,
        trainNumber:     body.querySelector('#e-trainno')?.value,
        airline:         body.querySelector('#e-airline')?.value,
      };
    }
    function rerenderTrainBlock() {
      const type = editTType?.value || stop.transportType;
      const show = ['train','plane','boat'].includes(type);
      if (!trainBlock) return;
      const preserved = trainBlock.style.display !== 'none' ? currentEditValues() : {...(stop.trainDetail || {}), airline: stop.airline};
      trainBlock.style.display = show ? 'block' : 'none';
      if (show) {
        trainBlock.innerHTML = editTrainDetailHTML(type, preserved, stop.flightNo);
        wireAutoduration('e-time', 'e-arrive', 'e-duration-display', 'e-duration', 'e-tz', 'e-arrivetz');
        wireTimeInput('e-arrive');
        wireTzCombobox('e-arrivetz');
      }
    }
    editTType?.addEventListener('change', rerenderTrainBlock);
    wireAutoduration('e-time', 'e-arrive', 'e-duration-display', 'e-duration', 'e-tz', 'e-arrivetz');
    wireTimeInput('e-time');
    wireTimeInput('e-arrive');
    wireTzCombobox('e-tz');
    wireTzCombobox('e-arrivetz');
    wireCurrencyCombobox('e-cost-cur');
    wirePaymentStatusToggle('e');
    body.querySelector('#e-deadline-clear')?.addEventListener('click', () => {
      const input = body.querySelector('#e-deadline');
      if (input) input.value = '';
    });
    body.querySelector('#bs-save-btn')?.addEventListener('click', async () => {
      const ttype = g('e-ttype')||stop.transportType;
      const hasTrain = ['train','plane','boat'].includes(ttype);
      const isPlane = ttype === 'plane';
      const numberField = g('e-trainno');
      const patch = {
        name:          g('e-name')||stop.name,
        activity:      g('e-activity'),
        time:          g('e-time'),
        timeZone:      body.querySelector('#e-tz')?.value || defaultTripTz(),
        dayId:         g('e-day')||stop.dayId,
        transport:     g('e-transport'),
        transportType: ttype,
        notes:         g('e-notes'),
        needsBooking:  body.querySelector('#e-needsbook')?.checked || false,
        category:      g('e-category') || null,
        ...(isPlane ? { flightNo: numberField, airline: g('e-airline') } : {}),
        trainDetail: hasTrain ? {
          ...stop.trainDetail,
          // Seat reservation / JR Pass / platform are rail-only — don't
          // overwrite them with blanks when saving a plane stop, just
          // leave whatever was last stored (they're not shown or used
          // for planes either way).
          ...(isPlane ? {} : {
            platform:        g('e-platform'),
            seatReservation: body.querySelector('#e-seatres')?.checked || false,
            jrPass:          body.querySelector('#e-jrpass')?.checked !== false,
          }),
          ...(isPlane ? {
            depTerminal: g('e-depterminal'),
            arrTerminal: g('e-arrterminal'),
          } : {}),
          origin:         g('e-origin'),
          destination:    g('e-destination'),
          arriveTime:     body.querySelector('#e-arrive')?.value || '',
          arriveTimeZone: body.querySelector('#e-arrivetz')?.value || defaultTripTz(),
          trainNumber:    numberField,
          duration:       body.querySelector('#e-duration')?.value || stop.trainDetail?.duration || '',
        } : stop.trainDetail,
        booking: {
          ...stop.booking,
          status:       g('e-status'),
          ref:          g('e-ref'),
          cost:         parseFloat(g('e-cost'))||null,
          costCurrency: body.querySelector('#e-cost-cur')?.value || Data.getTripCurrency?.() || 'USD',
          deadline:     g('e-deadline')||null,
          payment: {
            status:     g('e-paystatus') || 'unpaid',
            amountPaid: g('e-paystatus') === 'partial' ? (parseFloat(g('e-paidamt'))||0) : null,
          },
        },
      };
      try {
        await Data.updateStop(stop.id, patch);
        Toast.show('Stop updated','success');
      } catch(e) {
        Toast.show('Could not save — check connection', 'danger');
      }
      App.updateUrgentBadge(); close();
      window.ItineraryScreen?.refresh(); window.BookingsScreen?.refresh?.();
    });
    body.querySelector('#bs-cancel-btn')?.addEventListener('click', () => { body.innerHTML=stopViewHTML(stop,day); wireStopView(stop,day); });
  }

  /* ─── Wire: overnight ────────────────────────────────────── */
  /* ── "Show to driver / front desk" card — a large-text, high-contrast
     overlay meant to be held up and read by someone else (a taxi
     driver, a hotel receptionist), not typed into. Deliberately not
     the edit sheet: no inputs, no small labels, just the three things
     someone else actually needs to read from arm's length. ── */
  function showAccommodationCard(o) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:var(--s4)';
    overlay.innerHTML = `
      <div style="background:#fff;color:#111;border-radius:var(--r-xl);padding:28px 24px;width:100%;max-width:400px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4)">
        <p style="font-size:13px;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Please take me here</p>
        <p style="font-size:28px;font-weight:700;line-height:1.25;margin-bottom:${o.address?'14px':'20px'}">${o.name}</p>
        ${o.address ? `<p style="font-size:19px;color:#333;line-height:1.4;margin-bottom:20px">${o.address}</p>` : ''}
        ${o.ref ? `<div style="background:#F3F1EC;border-radius:var(--r-md);padding:10px 14px;margin-bottom:6px"><p style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em">Booking reference</p><p style="font-size:17px;font-weight:600;color:#111">${o.ref}</p></div>` : ''}
        ${!o.address ? `<p style="font-size:12px;color:#B8860B;margin-top:4px">No address saved for this stay yet — add one on the accommodation card.</p>` : ''}
        <button id="show-card-close" style="margin-top:20px;width:100%;padding:12px;border:1.5px solid #ddd;border-radius:var(--r-md);background:#fff;color:#111;font-family:var(--font);font-size:15px;font-weight:500">Close</button>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#show-card-close').addEventListener('click', close);
  }

  function wireOvernight(day) {
    const g = id => body.querySelector('#'+id)?.value?.trim()||'';

    const lfToggle = body.querySelector('#o-lf-toggle');
    const lfFields = body.querySelector('#o-lf-fields');
    lfToggle?.addEventListener('change', () => {
      lfFields.style.display = lfToggle.checked ? 'flex' : 'none';
    });
    wireCurrencyCombobox('o-cost-cur');
    wirePaymentStatusToggle('o');

    body.querySelector('#o-save-btn')?.addEventListener('click', async () => {
      const paystatus = g('o-paystatus') || 'unpaid';
      const patch = {
        name:            g('o-name'),
        address:         g('o-address'),
        status:          g('o-status')||'open',
        ref:             g('o-ref'),
        cost:            parseFloat(g('o-cost'))||null,
        cost_currency:   body.querySelector('#o-cost-cur')?.value || Data.getTripCurrency?.() || 'USD',
        payment_status:  paystatus,
        amount_paid:     paystatus === 'partial' ? (parseFloat(g('o-paidamt'))||0) : null,
        deadline:        g('o-deadline')||null,
      };
      patch.luggage_forwarding = lfToggle?.checked ? {
        enabled:  true,
        from:     g('o-lf-from'),
        to:       g('o-lf-to'),
        cutoff:   g('o-lf-cutoff'),
        pickup:   g('o-lf-pickup'),
        courier:  g('o-lf-courier'),
        cost:     parseFloat(g('o-lf-cost'))||null,
        status:   g('o-lf-status') || 'not_arranged',
        notes:    g('o-lf-notes'),
      } : null;
      await Data.updateOvernight(day.id, patch);
      Toast.show('Accommodation saved','success'); close();
      window.ItineraryScreen?.refresh(); window.BookingsScreen?.refresh?.();
    });
    body.querySelector('#o-cancel-btn')?.addEventListener('click', close);

    let deleteArmed = false;
    let deleteResetTimer = null;
    const deleteBtn = body.querySelector('#o-delete-btn');
    deleteBtn?.addEventListener('click', async () => {
      if (!deleteArmed) {
        deleteArmed = true;
        deleteBtn.textContent = 'Tap again to confirm';
        deleteBtn.style.background = 'var(--danger-text)';
        deleteBtn.style.color = '#fff';
        deleteResetTimer = setTimeout(() => {
          deleteArmed = false;
          deleteBtn.textContent = 'Clear accommodation';
          deleteBtn.style.background = '';
          deleteBtn.style.color = '';
        }, 4000);
        return;
      }
      clearTimeout(deleteResetTimer);
      await Data.deleteOvernight(day.id);
      Toast.show('Accommodation cleared', 'info'); close();
      window.ItineraryScreen?.refresh(); window.BookingsScreen?.refresh?.();
    });
  }

  /* ─── Wire: add stop ─────────────────────────────────────── */
  function wireAdd(dayId) {
    const g = id => body.querySelector('#'+id)?.value?.trim()||'';

    const tTypeSelect = body.querySelector('#a-ttype');
    const trainBlock  = body.querySelector('#a-train-detail-block');

    function currentAddValues() {
      return {
        seatReservation: body.querySelector('#a-seatres')?.checked,
        origin:          body.querySelector('#a-origin')?.value,
        destination:     body.querySelector('#a-destination')?.value,
        arriveTime:      body.querySelector('#a-arrive')?.value,
        arriveTimeZone:  body.querySelector('#a-arrivetz')?.value,
        duration:        body.querySelector('#a-duration')?.value,
        trainNumber:     body.querySelector('#a-trainno')?.value,
        airline:         body.querySelector('#a-airline')?.value,
      };
    }
    function updateTrainBlock() {
      const type = tTypeSelect?.value || 'walk';
      const show = ['train','plane','boat'].includes(type);
      const preserved = currentAddValues();
      if (trainBlock) {
        trainBlock.innerHTML = show ? addTrainDetailHTML(type, preserved) : '';
        trainBlock.style.display = show ? 'block' : 'none';
      }
      if (show) {
        wireAutoduration('a-time', 'a-arrive', 'a-duration-display', 'a-duration', 'a-tz', 'a-arrivetz');
        wireTimeInput('a-arrive');
        wireTzCombobox('a-arrivetz');
      }
    }
    tTypeSelect?.addEventListener('change', updateTrainBlock);
    updateTrainBlock(); // build correct initial content (hidden, since default type is 'walk')
    wireTimeInput('a-time');
    wireTzCombobox('a-tz');
    wireCurrencyCombobox('a-cost-cur');
    wirePaymentStatusToggle('a');

    body.querySelector('#bs-add-btn')?.addEventListener('click', async () => {
      const name = g('a-name');
      if (!name) { Toast.show('Stop name is required','warning'); return; }
      const tType = g('a-ttype') || 'walk';
      const hasTrainDetail = ['train','plane','boat'].includes(tType);
      const isPlane = tType === 'plane';
      const numberField = g('a-trainno');
      const trainDetail = hasTrainDetail ? {
        ...(isPlane ? {} : { seatReservation: body.querySelector('#a-seatres')?.checked || false }),
        ...(isPlane ? {
          depTerminal: g('a-depterminal'),
          arrTerminal: g('a-arrterminal'),
        } : {}),
        origin:      g('a-origin'),
        destination: g('a-destination'),
        arriveTime:  body.querySelector('#a-arrive')?.value || '',
        arriveTimeZone: body.querySelector('#a-arrivetz')?.value || defaultTripTz(),
        trainNumber: numberField,
        duration:    body.querySelector('#a-duration')?.value || '',
      } : null;
      await Data.addStop({
        dayId: g('a-day')||dayId, name,
        activity: g('a-activity'), time: g('a-time'),
        timeZone: body.querySelector('#a-tz')?.value || defaultTripTz(),
        transport: g('a-transport'), transportType: tType,
        trainDetail,
        ...(isPlane ? { flightNo: numberField, airline: g('a-airline') } : {}),
        needsBooking: body.querySelector('#a-needsbook')?.checked || false,
        category: g('a-category') || null,
        booking: {
          status:       g('a-status') || undefined,
          ref:          g('a-ref') || undefined,
          cost:         parseFloat(g('a-cost'))||null,
          costCurrency: body.querySelector('#a-cost-cur')?.value || Data.getTripCurrency?.() || 'USD',
          deadline:     g('a-deadline')||null,
          payment: {
            status:     g('a-paystatus') || 'unpaid',
            amountPaid: g('a-paystatus') === 'partial' ? (parseFloat(g('a-paidamt'))||0) : null,
          },
        },
      });
      Toast.show(`${name} added`,'success'); close();
      window.ItineraryScreen?.refresh(); window.BookingsScreen?.refresh?.();
    });
    body.querySelector('#bs-addcancel-btn')?.addEventListener('click', close);
  }

  /* ─── Edit day form (country + story) ───────────────────────
     Country list comes from the same data/world-countries.geojson
     already used by the World Map tab — genuinely every country,
     zero maintenance needed when a new trip visits somewhere new. */
  let COUNTRY_LIST = null; // cached [{v: iso2, l: '🇹🇭 Thailand'}, ...] once loaded

  function flagEmoji(iso2) {
    if (!iso2 || iso2.length !== 2) return '🏳️';
    return String.fromCodePoint(
      ...iso2.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0))
    );
  }

  async function loadCountryList() {
    if (COUNTRY_LIST) return COUNTRY_LIST;
    try {
      const res = await fetch('data/world-countries.geojson');
      const geo = await res.json();
      const seen = new Set();
      const list = [];
      geo.features.forEach(f => {
        const code = f.properties?.iso2;
        const name = f.properties?.name;
        if (!code || !name || seen.has(code)) return;
        seen.add(code);
        list.push({ v: code, l: `${flagEmoji(code)} ${name}` });
      });
      list.sort((a, b) => a.l.localeCompare(b.l));
      list.unshift({ v: 'transit', l: '✈️ Transit (no specific country)' });
      COUNTRY_LIST = list;
    } catch (e) {
      console.error('[BottomSheet] Failed to load country list:', e);
      COUNTRY_LIST = [{ v: 'transit', l: '✈️ Transit' }];
    }
    return COUNTRY_LIST;
  }
  function dayHTML(day) {
    const story = Data.getStory(day.id);
    const storyText = story?.paragraphs?.join('\n\n') || '';
    return `
      <div class="bs-detail">
        <div class="bs-tags"><span class="badge badge-open">${day.label}</span><span class="badge badge-open">${formatDayDate(day.date)}</span></div>
        <p class="bs-name" style="margin-bottom:var(--s4)">Edit day</p>
        ${field('Title','d-title',day.title||'','text','e.g. Full day Ngorongoro Crater')}
        ${field('Locality','d-locality',day.locality||'','text','e.g. Ngorongoro')}
        ${select('Country','d-segment',day.segment||'transit',COUNTRY_LIST)}
        <p class="bs-section-head" style="margin-top:var(--s3)">Story</p>
        ${field('Story title','d-story-title',story?.title||'','text','e.g. The crater at dawn')}
        ${textarea('Story text','d-story-body',storyText,'Separate paragraphs with a blank line')}
        <div class="bs-actions" style="margin-top:var(--s4)">
          <button class="btn btn-primary bs-full-btn" id="d-save-btn">Save</button>
          <button class="btn btn-ghost bs-full-btn" id="d-cancel-btn">Cancel</button>
          ${story ? `<button class="btn btn-ghost bs-full-btn" id="d-story-delete-btn" style="color:var(--danger-text);border-color:var(--danger-text)">Delete story</button>` : ''}
        </div>

        <p class="bs-section-head" style="margin-top:var(--s5);border-top:1px solid var(--border-subtle);padding-top:var(--s4)">Day management</p>
        <button class="btn btn-ghost bs-full-btn" id="d-delete-day-btn" style="margin-top:var(--s2);color:var(--danger-text);border-color:var(--danger-text)">Delete this day</button>
        <p id="d-delete-warning" style="display:none;font-size:var(--text-xs);color:var(--danger-text);margin-top:var(--s2);padding:var(--s2);background:var(--danger-bg,#FEF2F2);border-radius:var(--r-sm)"></p>
      </div>`;
  }

  function wireDay(day) {
    const g = id => body.querySelector('#'+id)?.value?.trim()||'';
    body.querySelector('#d-save-btn')?.addEventListener('click', async () => {
      try {
        await Data.updateDay(day.id, {
          title: g('d-title'),
          locality: g('d-locality'),
          segment: body.querySelector('#d-segment')?.value || 'transit',
        });
        const bodyText = g('d-story-body');
        const paragraphs = bodyText ? bodyText.split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean) : [];
        const storyTitle = g('d-story-title');
        if (storyTitle || paragraphs.length) {
          await Data.updateStory(day.id, { title: storyTitle, paragraphs });
        }
        Toast.show('Day updated', 'success'); close();
        window.ItineraryScreen?.refresh();
      } catch (e) {
        Toast.show('Could not save — check connection', 'danger');
      }
    });
    body.querySelector('#d-cancel-btn')?.addEventListener('click', close);

    let deleteArmed = false;
    let deleteResetTimer = null;
    const deleteBtn = body.querySelector('#d-story-delete-btn');
    deleteBtn?.addEventListener('click', async () => {
      if (!deleteArmed) {
        deleteArmed = true;
        deleteBtn.textContent = 'Tap again to confirm';
        deleteBtn.style.background = 'var(--danger-text)';
        deleteBtn.style.color = '#fff';
        deleteResetTimer = setTimeout(() => {
          deleteArmed = false;
          deleteBtn.textContent = 'Delete story';
          deleteBtn.style.background = '';
          deleteBtn.style.color = '';
        }, 4000);
        return;
      }
      clearTimeout(deleteResetTimer);
      await Data.deleteStory(day.id);
      Toast.show('Story deleted', 'info'); close();
      window.ItineraryScreen?.refresh();
    });

    /* Delete this day — show content warning before allowing confirm */
    let dayDeleteArmed = false;
    let dayDeleteResetTimer = null;
    const dayDeleteBtn = body.querySelector('#d-delete-day-btn');
    const warningEl = body.querySelector('#d-delete-warning');
    dayDeleteBtn?.addEventListener('click', async () => {
      if (!dayDeleteArmed) {
        dayDeleteBtn.disabled = true;
        try {
          const contents = await Data.getDayContents(day.id);
          const parts = [];
          if (contents.stops > 0) parts.push(`${contents.stops} stop${contents.stops>1?'s':''}`);
          if (contents.hasOvernight) parts.push('an overnight booking');
          if (contents.expenseCount > 0) {
            const total = (contents.expenseTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            parts.push(`${contents.expenseCount} expense${contents.expenseCount>1?'s':''} (${Data.getTripCurrency?.()||'$'} ${total})`);
          }
          if (contents.hasStory) parts.push('a story');
          if (warningEl) {
            warningEl.style.display = 'block';
            warningEl.textContent = parts.length
              ? `This day has ${parts.join(', ')} — all of this will be permanently deleted too.`
              : 'This day has no content — safe to delete.';
          }
        } catch (e) {
          if (warningEl) { warningEl.style.display = 'block'; warningEl.textContent = 'Could not check day contents.'; }
        }
        dayDeleteBtn.disabled = false;
        dayDeleteArmed = true;
        dayDeleteBtn.textContent = 'Tap again to permanently delete';
        dayDeleteBtn.style.background = 'var(--danger-text)';
        dayDeleteBtn.style.color = '#fff';
        dayDeleteResetTimer = setTimeout(() => {
          dayDeleteArmed = false;
          dayDeleteBtn.textContent = 'Delete this day';
          dayDeleteBtn.style.background = '';
          dayDeleteBtn.style.color = '';
          if (warningEl) warningEl.style.display = 'none';
        }, 6000);
        return;
      }
      clearTimeout(dayDeleteResetTimer);
      try {
        await Data.deleteDay(day.id);
        Toast.show('Day deleted', 'info'); close();
        window.ItineraryScreen?.refresh();
      } catch (err) {
        Toast.show('Could not delete day: ' + err.message, 'danger');
      }
    });
  }

  function addDayHTML() {
    return `
      <div class="bs-detail">
        <p class="bs-name" style="margin-bottom:var(--s4)">Add a day</p>
        ${field('Date','ad-date','','date')}
        ${field('Title','ad-title','','text','e.g. Free day in Zanzibar')}
        ${field('Locality','ad-locality','','text','e.g. Zanzibar')}
        ${select('Country','ad-segment','transit',COUNTRY_LIST)}
        <p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:var(--s2)">The day slots into the itinerary automatically based on its date — no need to pick a position.</p>
        <div class="bs-actions" style="margin-top:var(--s4)">
          <button class="btn btn-primary bs-full-btn" id="ad-save-btn">Create day</button>
          <button class="btn btn-ghost bs-full-btn" id="ad-cancel-btn">Cancel</button>
        </div>
      </div>`;
  }

  function wireAddDay() {
    const g = id => body.querySelector('#'+id)?.value?.trim()||'';
    body.querySelector('#ad-cancel-btn')?.addEventListener('click', close);
    body.querySelector('#ad-save-btn')?.addEventListener('click', async (e) => {
      const btn = e.target;
      const date = g('ad-date');
      if (!date) { Toast.show('A date is required', 'warning'); return; }
      btn.disabled = true; btn.textContent = 'Creating…';
      try {
        await Data.addDay(null, {
          date,
          title: g('ad-title'),
          locality: g('ad-locality'),
          segment: body.querySelector('#ad-segment')?.value || 'transit',
        });
        Toast.show('Day added', 'success'); close();
        window.ItineraryScreen?.refresh();
      } catch (err) {
        Toast.show(err.message || 'Could not create day', 'danger');
        btn.disabled = false; btn.textContent = 'Create day';
      }
    });
  }

  /* ─── Public ─────────────────────────────────────────────── */
  function openStop(stop, day) {
    if (!overlay) build();
    body.innerHTML = stopViewHTML(stop, day);
    wireStopView(stop, day);
    showSheet();
  }
  function openOvernight(day) {
    if (!overlay) build();
    body.innerHTML = overnightHTML(day);
    wireOvernight(day);
    showSheet();
  }
  function openAdd(dayId) {
    if (!overlay) build();
    body.innerHTML = addHTML(dayId);
    wireAdd(dayId);
    showSheet();
  }
  async function openDay(day) {
    if (!overlay) build();
    body.innerHTML = '<div class="bs-detail" style="padding:var(--s5) 0;text-align:center;color:var(--text-muted)">Loading…</div>';
    showSheet();
    await loadCountryList();
    body.innerHTML = dayHTML(day);
    wireDay(day);
  }
  async function openAddDay() {
    if (!overlay) build();
    body.innerHTML = '<div class="bs-detail" style="padding:var(--s5) 0;text-align:center;color:var(--text-muted)">Loading…</div>';
    showSheet();
    await loadCountryList();
    body.innerHTML = addDayHTML();
    wireAddDay();
  }

  return {
    openStop, openOvernight, openAdd, openDay, openAddDay, close,
    // Exposed so other screens (e.g. trip creation) can reuse the same
    // searchable, validated comboboxes instead of duplicating this logic.
    wireTzCombobox, wireCurrencyCombobox, getAllZones, getAllCurrencies,
    // Exposed so the compact itinerary overnight card can open the
    // driver/front-desk popup directly, without first opening the edit sheet.
    showAccommodationCard,
  };
})();

window.BottomSheet = BottomSheet;
