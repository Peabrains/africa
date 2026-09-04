'use strict';

const BookingsScreen = (() => {
  let root;
  let activeTab = 'reservations';
  const sectionsOpen = {
    accommodation: true, transport: true, activities: true,
    // Payments (Budget tab) — itinerary/other split, plus per-status
    // sub-groups inside itinerary. Paid starts collapsed (least urgent
    // to look at); unpaid/partial start open (actionable).
    paymentsItinerary: true, paymentsOther: false, paymentsCategories: true,
    payUnpaid: true, payPartial: true, payPaid: false,
  };
  const EXPENSE_CATS = ['Food','Transport','Accommodation','Activities','Shopping','Other'];

  // Same date formatting as itinerary.js/bottom-sheet.js — duplicated
  // rather than shared (tiny, self-contained). Full form for cards,
  // compact form for tight dropdown option labels.
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
  function formatShortDate(iso) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso;
    const [, y, mo, d] = m;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    const month = dt.toLocaleDateString('en-US', { month: 'short' });
    return `${Number(d)} ${month}`;
  }

  // Single shared money formatter — up to 2 decimal places shown only
  // when actually present, no forced rounding. Used everywhere an
  // amount or total is displayed on this screen, so a value like
  // TWD 13,980.5 doesn't quietly become TWD 13,981 in a total further
  // up the page while showing correctly on its own line item.
  function fmtMoney(n) {
    return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  // "Also show in my currency" — quiet secondary line under a total,
  // only rendered when the user has a currency preference set AND a
  // live rate is already cached for the given from-currency. If the
  // rate hasn't resolved yet (or the fetch failed), this renders
  // nothing rather than a stale guess — the Budget tab dispatcher
  // re-renders once the rate comes in, so it appears a beat later.
  function approxCurrencyLine(amount, fromCurrency, size='13px', margin='margin-top:1px') {
    const estimate = userEstimateText(amount, fromCurrency);
    return estimate ? `<p style="font-size:${size};color:var(--text-muted);${margin}">${estimate}</p>` : '';
  }

  function userEstimateText(amount, fromCurrency) {
    const savedRates = Data.getExchangeRates?.() || {};
    const userCur = Data.getUserCurrency?.() || (savedRates.MYR ? 'MYR' : null);
    if (!userCur || userCur === fromCurrency) return '';
    const savedUnitsToTripRate = savedRates[userCur];
    const estimate = savedUnitsToTripRate
      ? window.BudgetSharing?.fromTripCurrency(amount, savedUnitsToTripRate)
      : window.BudgetSharing?.convertEstimate(amount, Data.getCachedLiveRate?.(fromCurrency, userCur));
    return estimate == null ? '' : `≈ ${userCur} ${fmtMoney(estimate)}`;
  }

  // Currency code fixed-width + left-aligned, amount right-aligned with
  // tabular-nums (equal-width digits) — so "TWD" starts at the same X
  // position on every row and the numbers line up on their digits like
  // a ledger, regardless of how many digits each amount has. Shows up
  // to 2 decimal places only when the amount actually has a fraction —
  // whole numbers stay clean without a trailing ".00".
  function formatMoneyAligned(currency, amount) {
    return `<span style="display:inline-flex;width:94px;flex-shrink:0;font-size:var(--text-sm)">
      <span style="color:var(--text-muted);width:36px;flex-shrink:0">${currency}</span>
      <span style="color:var(--text-muted);flex:1;text-align:right;font-variant-numeric:tabular-nums">${fmtMoney(amount)}</span>
    </span>`;
  }

  /* ─── Tab bar ────────────────────────────────────────────── */
  function tabBar() {
    const bar = document.createElement('div');
    bar.className = 'sub-tab-bar';
    [['reservations','Reservations'],['budget','Budget'],['packing','Packing'],['settings','Settings']].forEach(([id,lbl]) => {
      const btn = document.createElement('button');
      btn.className = `sub-tab ${activeTab===id?'sub-tab--active':''}`;
      btn.textContent = lbl;
      btn.addEventListener('click', () => { activeTab=id; render(); });
      bar.appendChild(btn);
    });
    return bar;
  }

  /* ═══ RESERVATIONS TAB ══════════════════════════════════ */
  function renderReservations() {
    const frag = document.createDocumentFragment();
    const spacer = document.createElement('div');
    spacer.style.height = 'var(--s3)';
    frag.appendChild(spacer);
    const nights = Data.getDays().map(d=>({day:d,o:Data.getOvernight(d.id)})).filter(({o})=>o?.name);
    const booked = nights.filter(({o})=>o.status==='booked').length;
    const transStops = Data.getTransportReservations();
    const actStops = Data.getActivityReservations();
    const lfLegs = nights.filter(({o}) => o.luggage_forwarding?.enabled);
    frag.appendChild(accordionSection('accommodation',
      '🏨 Accommodation', `${booked}/${nights.length} confirmed`,
      renderAccommodationContent));
    frag.appendChild(accordionSection('transport',
      '✈️ Transport', `${transStops.length} to track`,
      renderTransportContent));
    frag.appendChild(accordionSection('activities',
      '🦁 Activities', `${actStops.length} to book`,
      renderActivitiesContent));
    frag.appendChild(accordionSection('luggage',
      '🧳 Luggage Forwarding', `${lfLegs.filter(({o})=>o.luggage_forwarding.status==='arranged').length}/${lfLegs.length} arranged`,
      renderLuggageContent));
    return frag;
  }

  /* ─── Luggage Forwarding — read-only summary, edit happens on the
     overnight itself (same pattern as JR Pass) ──────────────────── */
  function renderLuggageContent() {
    const frag = document.createDocumentFragment();
    const nights = Data.getDays().map(d=>({day:d,o:Data.getOvernight(d.id)})).filter(({o})=>o?.name);
    const legs = nights.filter(({o}) => o.luggage_forwarding?.enabled);

    if (!legs.length) {
      const em = document.createElement('p');
      em.style.cssText = 'font-size:var(--text-sm);color:var(--text-muted);padding:var(--s3) var(--s4)';
      em.textContent = 'No luggage forwarding set up yet. Edit any overnight stay and check "Luggage forwarding needed?" — it\'ll show up here automatically.';
      frag.appendChild(em);
      return frag;
    }

    legs.forEach(({day, o}) => {
      const lf = o.luggage_forwarding;
      const route = lf.from && lf.to ? `${lf.from} → ${lf.to}` : (lf.to || lf.from || 'Route not set');
      const times = [lf.cutoff ? `Drop off by ${lf.cutoff}` : null, lf.pickup ? `Pick up ${lf.pickup}` : null].filter(Boolean).join(' · ');
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cssText = 'margin-bottom:var(--s2);cursor:pointer';
      card.innerHTML = `
        <div style="padding:10px var(--s3);display:flex;align-items:flex-start;gap:var(--s2);min-height:44px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
              <span class="badge badge-open" style="font-size:9px;padding:1px 5px">${day.label}</span>
              <span style="font-size:var(--text-xs);color:var(--text-muted)">${formatDayDate(day.date)}</span>
            </div>
            <p style="font-weight:500;font-size:var(--text-sm);color:var(--text-primary)">${route}</p>
            ${times ? `<p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:1px">${times}</p>` : ''}
            ${lf.courier ? `<p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:1px">${lf.courier}</p>` : ''}
            ${lf.notes ? `<p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:1px;font-style:italic">${lf.notes}</p>` : ''}
          </div>
          <span class="badge ${lf.status==='arranged'?'badge-booked':'badge-pending'}">${lf.status==='arranged'?'✓ Arranged':'Not yet arranged'}</span>
        </div>`;
      card.addEventListener('click', () => BottomSheet.openOvernight(day));
      frag.appendChild(card);
    });
    return frag;
  }

  /* ─── JR Train Seat Reservations — standalone highlighted card ──
     Auto-populated: any itinerary stop with transport type "Train" and
     "Seat reservation required" checked (in the stop's own edit sheet)
     shows up here automatically. Nothing to add/manage separately —
     tap a card to open that stop and edit its train details there. ── */
  function renderJrPassSection() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:var(--accent-subtle);border:1.5px solid var(--accent);border-radius:var(--r-lg);padding:var(--s3);margin-bottom:var(--s2)';

    const legs = Data.getJrPassLegs();
    const allDays = Data.getDays();

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:var(--s2);margin-bottom:2px';
    head.innerHTML = `
      <div>
        <p style="font-size:var(--text-md);font-weight:600;color:var(--accent)">JR Train Seat Reservations</p>
        <p style="font-size:var(--text-xs);color:var(--text-muted)">Show this to the officer when booking</p>
      </div>
      <button id="jr-share-btn" style="background:var(--accent);color:#fff;border:none;border-radius:var(--r-md);padding:8px 16px;font-size:var(--text-sm);font-weight:500;cursor:pointer;font-family:var(--font);flex-shrink:0">Share</button>`;
    wrap.appendChild(head);

    head.querySelector('#jr-share-btn').addEventListener('click', () => shareJrPassLegs(legs, allDays));

    const list = document.createElement('div');
    list.style.cssText = 'margin-top:var(--s3);display:flex;flex-direction:column';
    if (!legs.length) {
      const em = document.createElement('p');
      em.style.cssText = 'font-size:var(--text-sm);color:var(--text-muted);padding:var(--s2) 0';
      em.textContent = 'No trains flagged yet. Edit any train stop in the Itinerary and check "Seat reservation required" — it\'ll show up here automatically.';
      list.appendChild(em);
    } else {
      legs.forEach((leg, i) => {
        const day = allDays.find(d => d.id === leg.dayId);
        list.appendChild(jrPassLegCard(leg, day, i === legs.length - 1));
      });
    }
    wrap.appendChild(list);
    return wrap;
  }

  function jrPassLegCard(leg, day, isLast) {
    const card = document.createElement('div');
    card.style.cssText = `padding:var(--s3) 0 var(--s3);cursor:pointer;${isLast ? '' : 'border-bottom:1px solid var(--accent);border-bottom-color:color-mix(in srgb, var(--accent) 25%, transparent);'}`;

    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        ${day ? `<span class="badge badge-open" style="font-size:9px;padding:1px 5px">${day.label}</span>` : ''}
        <span style="font-size:var(--text-xs);color:var(--text-muted)">${day ? formatDayDate(day.date) : ''}</span>
      </div>
      <p style="font-weight:600;font-size:var(--text-md);color:var(--text-primary)">${leg.fromStation && leg.toStation ? leg.fromStation + ' → ' + leg.toStation : (leg.trainName || 'Train')}</p>
      ${leg.trainName ? `<p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:1px">${leg.trainName}</p>` : ''}
      ${(leg.departTime || leg.arriveTime) ? `<p style="font-size:var(--text-sm);color:var(--text-secondary);margin-top:2px">Depart: ${leg.departTime || 'TBD'} · Arrive: ${leg.arriveTime || 'TBD'}${leg.duration ? ' · ' + leg.duration : ''}</p>` : ''}
      ${leg.trainNo ? `<p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:1px">Train: ${leg.trainNo}</p>` : ''}
      <p style="font-size:var(--text-xs);margin-top:3px">${leg.jrPass ? '<span style="color:var(--success-text)">JR Pass ✓</span>' : '<span style="color:var(--warning-text)">NOT on JR Pass — buy separately</span>'} · Seat reservation required</p>`;

    card.addEventListener('click', () => {
      const stop = Data.getStopsByDay(leg.dayId).find(s => s.id === leg.stopId);
      if (stop) BottomSheet.openStop(stop, day);
    });

    return card;
  }

  /* Build a plain-text summary and share it (native share sheet if available, else clipboard) */
  async function shareJrPassLegs(legs, allDays) {
    if (!legs.length) { Toast.show('No reservations to share yet', 'warning'); return; }
    const lines = ['JR Train Seat Reservations', ''];
    legs.forEach(leg => {
      const day = allDays.find(d => d.id === leg.dayId);
      lines.push(`${day ? day.label + ' · ' + formatDayDate(day.date) : ''}`.trim());
      lines.push(leg.fromStation && leg.toStation ? `${leg.fromStation} → ${leg.toStation}` : (leg.trainName || 'Train'));
      if (leg.trainName) lines.push(leg.trainName);
      if (leg.departTime || leg.arriveTime) lines.push(`Depart: ${leg.departTime || 'TBD'} · Arrive: ${leg.arriveTime || 'TBD'}${leg.duration ? ' · ' + leg.duration : ''}`);
      if (leg.trainNo) lines.push(`Train: ${leg.trainNo}`);
      lines.push(`${leg.jrPass ? 'JR Pass ✓' : 'NOT on JR Pass'} · Seat reservation required`);
      lines.push('');
    });
    const text = lines.join('\n').trim();

    if (navigator.share) {
      try { await navigator.share({ title: 'JR Train Seat Reservations', text }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(text);
      Toast.show('Copied to clipboard ✓', 'success');
    } catch (e) {
      Toast.show('Could not share — try again', 'warning');
    }
  }

  /* ─── Accordion section wrapper ──────────────────────────── */
  function accordionSection(key, title, subtitle, renderContentFn) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'border:1.5px solid var(--border);border-radius:var(--r-lg);margin-bottom:var(--s2);overflow:hidden';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px var(--s3);cursor:pointer;background:var(--surface);-webkit-tap-highlight-color:transparent';
    const isOpen = sectionsOpen[key];
    header.innerHTML = `
      <div>
        <p style="font-size:var(--text-sm);font-weight:500;color:var(--text-primary)">${title}</p>
        <p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:1px">${subtitle}</p>
      </div>
      ${isOpen ? Icons.chevronUp('icon-sm') : Icons.chevronDown('icon-sm')}`;
    header.addEventListener('click', () => {
      sectionsOpen[key] = !sectionsOpen[key];
      render();
    });
    wrap.appendChild(header);

    if (isOpen) {
      const body = document.createElement('div');
      body.style.cssText = 'padding:var(--s2) var(--s3) var(--s3);border-top:1px solid var(--border-subtle)';
      body.appendChild(renderContentFn());
      wrap.appendChild(body);
    }
    return wrap;
  }

  function statusBadge(status) {
    if (!status) return ''; // stops that don't need booking tracking show nothing at all
    const cls = {booked:'badge-booked',pending:'badge-pending',urgent:'badge-urgent',open:'badge-open'}[status]||'badge-open';
    const lbl = {booked:'✓ Booked',pending:'Pending',urgent:'⚡',open:'Open'}[status]||'Open';
    return `<span class="badge ${cls}">${lbl}</span>`;
  }

  /* ─── Accommodation ──────────────────────────────────────── */
  function renderAccommodationContent() {
    const frag = document.createDocumentFragment();
    const nights = Data.getDays().map(d=>({day:d,o:Data.getOvernight(d.id)})).filter(({o})=>o?.name);
    const booked = nights.filter(({o})=>o.status==='booked').length;

    if (!nights.length) {
      const em = document.createElement('div');
      em.style.cssText = 'font-size:var(--text-sm);color:var(--text-muted);padding:var(--s3) 0';
      em.textContent = 'Tap the overnight card on any itinerary day to add.';
      frag.appendChild(em);
      return frag;
    }

    nights.forEach(({day,o}) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cssText = 'margin-bottom:var(--s2);cursor:pointer';
      card.innerHTML = `
        <div style="padding:10px var(--s3);display:flex;align-items:flex-start;gap:var(--s2);min-height:44px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
              <span class="badge badge-open" style="font-size:9px;padding:1px 5px">${day.label}</span>
              <span style="font-size:var(--text-xs);color:var(--text-muted)">${formatDayDate(day.date)}</span>
            </div>
            <p style="font-weight:500;font-size:var(--text-sm);color:var(--text-primary)">${o.name}</p>
            ${o.ref?`<p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:1px">Ref: ${o.ref}</p>`:''}
            ${o.cost?`<p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:1px">${o.cost_currency||Data.getTripCurrency()} ${fmtMoney(o.cost)}${o.payment_status?` · <span style="color:${o.payment_status==='paid'?'var(--success-text)':o.payment_status==='partial'?'var(--warning-text)':'var(--text-muted)'}">${o.payment_status==='paid'?'✓ Paid':o.payment_status==='partial'?'Partial':'Unpaid'}</span>`:''}</p>`:''}
            ${o.deadline?`<p style="font-size:var(--text-xs);color:var(--danger-text);margin-top:1px">Book by ${new Date(o.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</p>`:''}
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
            <button class="overnight-show-btn" aria-label="Show to driver or front desk" style="width:28px;height:28px;border-radius:50%;background:var(--surface-raised);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-secondary)">${Icons.card('icon-sm')}</button>
            ${statusBadge(o.status)}
          </div>
        </div>`;
      card.querySelector('.overnight-show-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        window.BottomSheet?.showAccommodationCard?.({ name: o.name, address: o.address, ref: o.ref });
      });
      card.addEventListener('click', () => BottomSheet.openOvernight(day));
      frag.appendChild(card);
    });
    return frag;
  }

  /* ─── Transport + JR Cheat Sheet ────────────────────────── */
  function renderTransportContent() {
    const frag = document.createDocumentFragment();
    const stops = Data.getTransportReservations();
    if (!stops.length) {
      const em = document.createElement('p');
      em.style.cssText = 'font-size:var(--text-sm);color:var(--text-muted);padding:var(--s2) 0';
      em.textContent = 'No transport bookings flagged. Edit any stop to mark "Needs booking."';
      frag.appendChild(em);
    } else {
      stops.forEach(stop => {
        const day = Data.getDays().find(d=>d.id===stop.dayId);
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = 'margin-bottom:var(--s2);cursor:pointer';
        const icon = {plane:'✈',train:'🚆',bus:'🚌',boat:'⛵',cable:'🚠'}[stop.transportType]||'🚌';
        card.innerHTML = `
          <div style="padding:10px var(--s3);display:flex;align-items:flex-start;gap:var(--s2);min-height:44px">
            <span style="font-size:16px;margin-top:1px">${icon}</span>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
                <span class="badge badge-open" style="font-size:9px;padding:1px 5px">${day?.label||''}</span>
                <span style="font-size:var(--text-xs);color:var(--text-muted)">${day?formatShortDate(day.date):''}</span>
              </div>
              <p style="font-weight:500;font-size:var(--text-sm);color:var(--text-primary)">${stop.name}</p>
              ${stop.trainDetail?.service?`<p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:1px">${stop.trainDetail.service}</p>`:''}
              ${stop.trainDetail?.seatReservation?`<p style="font-size:var(--text-xs);color:var(--accent);margin-top:1px">Seat reservation required</p>`:''}
              ${stop.trainDetail?.jrPass===false?`<p style="font-size:var(--text-xs);color:var(--warning-text);margin-top:1px">Not on JR Pass</p>`:''}
              ${stop.booking.deadline?`<p style="font-size:var(--text-xs);color:var(--danger-text);margin-top:1px">Book by ${new Date(stop.booking.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</p>`:''}
            </div>
            ${statusBadge(stop.booking.status)}
          </div>`;
        card.addEventListener('click', () => BottomSheet.openStop(stop, day));
        frag.appendChild(card);
      });
    }

    if (Data.getCurrentTrip?.()?.currency === 'JPY') {
      frag.appendChild(renderJrPassSection());
    }

    return frag;
  }

  /* ─── Activities ─────────────────────────────────────────── */
  function renderActivitiesContent() {
    const frag = document.createDocumentFragment();
    const stops = Data.getActivityReservations();
    if (!stops.length) {
      const em = document.createElement('p');
      em.style.cssText = 'font-size:var(--text-sm);color:var(--text-muted);padding:var(--s2) 0 var(--s4)';
      em.textContent = 'No activities flagged. Edit any stop to mark as Activity.';
      frag.appendChild(em);
      return frag;
    }

    stops.forEach(stop => {
      const day = Data.getDays().find(d=>d.id===stop.dayId);
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cssText = 'margin-bottom:var(--s2);cursor:pointer';
      card.innerHTML = `
        <div style="padding:10px var(--s3);display:flex;align-items:flex-start;gap:var(--s2);min-height:44px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
              <span class="badge badge-open" style="font-size:9px;padding:1px 5px">${day?.label||''}</span>
              <span style="font-size:var(--text-xs);color:var(--text-muted)">${day?formatShortDate(day.date):''}</span>
            </div>
            <p style="font-weight:500;font-size:var(--text-sm);color:var(--text-primary)">${stop.name}</p>
            <p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:1px">${stop.activity||''}</p>
            ${stop.booking.deadline?`<p style="font-size:var(--text-xs);color:var(--danger-text);margin-top:1px">Book by ${new Date(stop.booking.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</p>`:''}
          </div>
          ${statusBadge(stop.booking.status)}
        </div>`;
      card.addEventListener('click', () => BottomSheet.openStop(stop, day));
      frag.appendChild(card);
    });
    return frag;
  }

  /* ═══ BUDGET ════════════════════════════════════════════ */
  /* ── PAYMENTS SUMMARY — separate from the expense/settlement tracker
     above. That one splits shared costs between travelers; this one
     answers "of everything we've booked, what's actually been paid?" ── */
  /* ── ITINERARY PAYMENTS — stop/overnight costs, grouped by paid
     status. Each status group is its own collapsible accordion (same
     helper as Accommodation/Transport/etc.) since a trip with a lot of
     bookings makes one flat list too long to scan. ── */
  function renderItineraryPaymentsGroups() {
    const frag = document.createDocumentFragment();
    const summary = Data.getPaymentsSummary();

    if (!summary.items.length) {
      const em = document.createElement('p');
      em.style.cssText = 'font-size:var(--text-sm);color:var(--text-muted);padding:var(--s2) 0';
      em.textContent = 'No stop or accommodation has a cost set yet — add one on a stop or overnight card to track it here.';
      frag.appendChild(em);
      return frag;
    }

    const cur = summary.tripCurrency;
    const foreignCurrencies = [...new Set(summary.items.map(i => i.currency).filter(c => c !== cur))];
    const rates = Data.getExchangeRates();
    const dayLabel = (dayId) => Data.getDays().find(d => d.id === dayId)?.label || '';

    const groups = { unpaid: [], partial: [], paid: [] };
    summary.items.forEach(it => groups[it.status]?.push(it));

    const groupContent = (items) => () => {
      const g = document.createDocumentFragment();
      if (!items.length) {
        const em = document.createElement('p');
        em.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted);padding:4px 0';
        em.textContent = 'None';
        g.appendChild(em);
        return g;
      }
      items.forEach(it => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;padding:5px 0;cursor:pointer';
        const pct = it.cost ? Math.min(100, Math.max(0, (it.paidAmount/it.cost)*100)) : 0;
        const tripCost = window.BudgetSharing.tripAmount(it, cur, (amount, currency) => Data.convertToTripCurrency(amount, currency));
        const tripPaid = window.BudgetSharing.tripAmount({ cost:it.paidAmount, currency:it.currency }, cur, (amount, currency) => Data.convertToTripCurrency(amount, currency));
        // Partial rows: the main row keeps a single plain amount (no
        // overflow risk, unlike the old paid/total fraction which had a
        // fixed-width box that clipped for large numbers — see note
        // below). Progress goes on its own line where the bar itself
        // can flex/shrink instead of text getting cut off.
        wrap.innerHTML = `
          <div class="settlement-row" style="padding:0">
            <span style="min-width:0;display:flex;align-items:center;gap:6px">
              <span class="badge badge-open" style="font-size:9px">${dayLabel(it.dayId)}</span>
              <span>${it.name}</span>
            </span>
            <span style="display:flex;align-items:center;flex-shrink:0">
              ${formatMoneyAligned(tripCost.currency, tripCost.amount)}
            </span>
          </div>
          ${it.status === 'partial' ? `
          <div style="display:flex;align-items:center;gap:6px;margin:4px 0 0 0">
            <span class="badge badge-open" style="font-size:9px;visibility:hidden" aria-hidden="true">${dayLabel(it.dayId)}</span>
            <span style="font-size:9.5px;color:var(--text-muted);flex-shrink:0">Paid</span>
            <div style="flex:1;min-width:24px;height:4px;background:var(--surface-raised);border-radius:100px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:var(--warning-text)"></div>
            </div>
            <span style="font-size:9.5px;color:var(--text-muted);flex-shrink:0">${Math.round(pct)}%</span>
            <span style="display:flex;align-items:center;flex-shrink:0">
              ${formatMoneyAligned(tripPaid.currency, tripPaid.amount)}
            </span>
          </div>` : ''}`;
        wrap.addEventListener('click', () => {
          if (it.type === 'stop') {
            const stop = Data.getStops().find(s => s.id === it.id);
            const stopDay = Data.getDays().find(d => d.id === stop?.dayId);
            if (stop) window.BottomSheet?.openStop(stop, stopDay);
          } else {
            const oDay = Data.getDays().find(d => d.id === it.dayId);
            if (oDay) window.BottomSheet?.openOvernight(oDay);
          }
        });
        g.appendChild(wrap);
      });
      return g;
    };

    const totals = document.createElement('div');
    totals.style.cssText = 'display:flex;gap:var(--s3);margin-bottom:var(--s3);padding-bottom:var(--s3);border-bottom:1px solid var(--border-subtle)';
    totals.innerHTML = `
      <div style="flex:1">
        <p style="font-size:var(--text-xs);color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Paid</p>
        <p style="font-size:16px;font-weight:500;color:var(--success-text)">${cur} ${fmtMoney(summary.totalPaid)}</p>
      </div>
      <div style="flex:1">
        <p style="font-size:var(--text-xs);color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Outstanding</p>
        <p style="font-size:16px;font-weight:500;color:${summary.totalOutstanding>0?'var(--warning-text)':'var(--text-primary)'}">${cur} ${fmtMoney(summary.totalOutstanding)}</p>
      </div>`;
    frag.appendChild(totals);

    frag.appendChild(accordionSection('payUnpaid', 'Unpaid', `${groups.unpaid.length}`, groupContent(groups.unpaid)));
    frag.appendChild(accordionSection('payPartial', 'Partially paid', `${groups.partial.length}`, groupContent(groups.partial)));
    frag.appendChild(accordionSection('payPaid', '✓ Paid', `${groups.paid.length}`, groupContent(groups.paid)));

    if (foreignCurrencies.length) {
      const fxNote = document.createElement('p');
      fxNote.style.cssText = 'font-size:10px;color:var(--text-muted);margin-top:6px';
      fxNote.innerHTML = `≈ converted to ${cur} using your saved exchange rates${summary.hasUnconvertible ? ' — <span style="color:var(--warning-text)">some currencies below are missing a rate</span>' : ''}`;
      frag.appendChild(fxNote);

      const fxWrap = document.createElement('div');
      fxWrap.style.cssText = 'margin-top:var(--s2)';
      fxWrap.innerHTML = `
        <p class="bs-section-head">Exchange rates</p>
        <p style="font-size:10px;color:var(--text-muted);margin-bottom:var(--s2)">1 unit of the currency = how many ${cur}?</p>
        ${foreignCurrencies.map(fc => `
          <div style="display:flex;align-items:center;gap:var(--s2);margin-bottom:6px">
            <span style="font-size:var(--text-sm);font-weight:500;width:44px;flex-shrink:0">${fc}</span>
            <input class="bs-input fx-rate-input" data-currency="${fc}" type="number" step="0.0001" placeholder="e.g. 0.033" value="${rates[fc]??''}" style="flex:1">
          </div>`).join('')}`;
      frag.appendChild(fxWrap);
    }

    setTimeout(() => {
      document.querySelectorAll('.fx-rate-input').forEach(input => {
        input.addEventListener('change', async () => {
          const val = parseFloat(input.value);
          await Data.setExchangeRate(input.dataset.currency, isNaN(val) ? null : val);
          Toast.show(`${input.dataset.currency} rate saved`, 'success');
          render();
        });
      });
    }, 0);

    return frag;
  }

  async function saveCostAllocation(item, selected) {
    if (item.source === 'itinerary') await Data.updateItinerarySplit(item, selected);
    else await Data.updateExpense(item.id, { splitBetween: selected });
  }

  function renderCategoryPaymentsGroups() {
    const frag = document.createDocumentFragment();
    const summary = Data.getPaymentsSummary();
    const expenses = Data.getExpenses().map(e => ({ ...e, source:'expense', name:e.description, cost:e.amountJPY, currency:Data.getTripCurrency(), category:e.category || 'Other', splitBetween:e.splitBetween || [], categoryCost:e.amountJPY, displayCost:e.amountJPY, displayCurrency:Data.getTripCurrency() }));
    const items = [...summary.items.map(i => {
      const tripValue = window.BudgetSharing.tripAmount(i, summary.tripCurrency, (amount, currency) => Data.convertToTripCurrency(amount, currency));
      return {...i, source:'itinerary', categoryCost:tripValue.amount, displayCost:tripValue.amount, displayCurrency:tripValue.currency};
    }), ...expenses];
    if (!items.length) { const p=document.createElement('p'); p.style.cssText='font-size:var(--text-sm);color:var(--text-muted)'; p.textContent='No costs logged yet.'; frag.appendChild(p); return frag; }
    const order=['Accommodation','Transport','Activities','Food','Shopping','Other'];
    const groups = (window.BudgetSharing ? window.BudgetSharing.groupByCategory(items) : {});
    const allocationFor = it => (it.splitBetween || []).length
      ? [...it.splitBetween]
      : (it.source === 'itinerary' ? [...Data.getTravelers()] : [it.paidBy || Data.getTravelers()[0]].filter(Boolean));
    order.forEach(category => {
      const group=groups[category]; if (!group?.items?.length) return;
      const perTraveller = {};
      Data.getTravelers().forEach(t => { perTraveller[t] = 0; });
      group.items.forEach(it => {
        const selected = allocationFor(it);
        if (selected.length) selected.forEach(t => { if (t in perTraveller) perTraveller[t] += (Number(it.categoryCost ?? it.cost) || 0) / selected.length; });
      });
      const body = () => {
        const section=document.createElement('div');
        const fullEstimate = userEstimateText(group.total, summary.tripCurrency);
        section.innerHTML=`<div style="padding:4px 0 10px;border-bottom:1px solid var(--border-subtle)"><div style="display:flex;justify-content:space-between;align-items:flex-start"><strong>Full total</strong><span style="text-align:right"><strong style="display:block">${summary.tripCurrency} ${fmtMoney(group.total)}</strong>${fullEstimate?`<span style="display:block;font-size:11px;color:var(--text-muted)">${fullEstimate}</span>`:''}</span></div>${Object.keys(perTraveller).length ? `<div style="margin-top:8px;display:grid;gap:4px">${Object.entries(perTraveller).map(([t,v])=>{const estimate=userEstimateText(v,summary.tripCurrency);return `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted)"><span>${t}</span><span style="text-align:right"><span style="display:block">${summary.tripCurrency} ${fmtMoney(v)}</span>${estimate?`<span style="display:block;font-size:10px">${estimate}</span>`:''}</span></div>`;}).join('')}</div>` : ''}</div>`;
        group.items.forEach(it => {
          const row=document.createElement('div'); row.style.cssText='padding:10px 0;border-bottom:1px solid var(--border-subtle);cursor:pointer';
          const selected = allocationFor(it);
          const shareText = selected.length === 1 ? `${it.displayCurrency} ${fmtMoney(Number(it.displayCost)||0)} · ${selected[0]}` : `${it.displayCurrency} ${fmtMoney((Number(it.displayCost)||0)/selected.length)} each`;
          row.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px"><span style="min-width:0"><span style="font-size:11px;color:var(--text-muted)">${it.type==='overnight'?'Accommodation':(it.type==='stop'?'Itinerary':'Manual')}</span><br><span style="font-weight:500">${it.name}</span></span>${formatMoneyAligned(it.displayCurrency,it.displayCost)}</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">${shareText}</div>`;
          const pillRow = document.createElement('div');
          pillRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:7px';
          Data.getTravelers().forEach(name => {
            const checked = selected.includes(name);
            const pill = document.createElement('button');
            const initials = name.slice(0,2).toUpperCase();
            const tColor = travelerColor(name);
            pill.style.cssText = `display:flex;align-items:center;gap:3px;border:1.5px solid ${checked?tColor:'var(--border)'};background:${checked?tColor:'var(--surface)'};color:${checked?'#fff':'var(--text-muted)'};border-radius:var(--r-pill);padding:3px 10px;font-size:10.5px;font-weight:600;cursor:pointer`;
            pill.innerHTML = `${checked?'✓ ':''}${initials}`;
            pill.title = name;
            pill.addEventListener('click', async e => {
              e.stopPropagation();
              const next = window.BudgetSharing.toggleSelection(selected, name);
              if (next.length === selected.length && next.every((n,i)=>n===selected[i])) { Toast.show('At least one traveller must be selected','warning'); return; }
              await saveCostAllocation(it, next);
              render();
            });
            pillRow.appendChild(pill);
          });
          row.appendChild(pillRow);
          row.addEventListener('click', () => { if (it.source==='itinerary') { if (it.type==='stop') { const stop=Data.getStops().find(s=>s.id===it.id); const day=Data.getDays().find(d=>d.id===stop?.dayId); if(stop) window.BottomSheet?.openStop(stop,day); } else { const day=Data.getDays().find(d=>d.id===it.dayId); if(day) window.BottomSheet?.openOvernight(day); } } });
          section.appendChild(row);
        });
        return section;
      };
      const categoryEstimate = userEstimateText(group.total, summary.tripCurrency);
      frag.appendChild(accordionSection(`cost${category}`, category, `${summary.tripCurrency} ${fmtMoney(group.total)} full${categoryEstimate?` · ${categoryEstimate}`:''} · ${group.items.length} item${group.items.length===1?'':'s'}`, body));
    });
    return frag;
  }

  function renderBudget() {
    const frag = document.createDocumentFragment();
    const travelers = Data.getTravelers();
    const expenses  = Data.getExpenses();
    const totalUSD  = Data.getTotalSpentJPY(); // field name kept for compat, stores USD
    const budgetUSD = Data.getBudgetTotal?.() || 0;
    const cur = Data.getTripCurrency();

    /* ── Log expense — button + form, now the first thing on the tab ── */
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary bs-full-btn';
    addBtn.style.marginTop = 'var(--s3)';
    addBtn.style.marginBottom = 'var(--s3)';
    addBtn.textContent = '+ Log expense';
    frag.appendChild(addBtn);

    const addForm = document.createElement('div');
    addForm.className = 'add-expense-form';
    addForm.style.display = 'none';
    const paidByChips = travelers.map((t,i) =>
      `<button type="button" class="traveler-chip paid-chip ${i===0?'traveler-chip--active':''}" data-name="${t}">${t}</button>`
    ).join('');
    const splitChips = travelers.map(t =>
      `<button type="button" class="traveler-chip split-chip traveler-chip--active" data-name="${t}">${t}</button>`
    ).join('');
    addForm.innerHTML = `
      <p class="form-title">Log expense</p>
      <select id="exp-day" class="bs-input"><option value="">Day…</option>${Data.getDays().map(d=>`<option value="${d.id}">${d.label} · ${formatShortDate(d.date)}</option>`).join('')}</select>
      <select id="exp-cat" class="bs-input"><option value="">Category…</option>${EXPENSE_CATS.map(c=>`<option>${c}</option>`).join('')}</select>
      <input id="exp-desc" class="bs-input" type="text" placeholder="Description">
      <input id="exp-amt" class="bs-input" type="number" step="0.01" placeholder="Amount (${cur})">
      ${travelers.length?`
        <div class="bs-edit-group"><label class="bs-edit-label">Paid by</label><div class="split-chips" id="paid-by-chips">${paidByChips}</div></div>
        <div class="bs-edit-group"><label class="bs-edit-label">Split between</label><div class="split-chips" id="split-chips">${splitChips}</div></div>`
      :`<input id="exp-paid" class="bs-input" type="text" placeholder="Paid by">`}
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" id="exp-save" style="flex:1">Save</button>
        <button class="btn btn-ghost" id="exp-cancel" style="flex:1">Cancel</button>
      </div>`;
    frag.appendChild(addForm);

    addBtn.addEventListener('click', () => { addBtn.style.display='none'; addForm.style.display='flex'; });
    addForm.querySelectorAll('.paid-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        addForm.querySelectorAll('.paid-chip').forEach(c=>c.classList.remove('traveler-chip--active'));
        chip.classList.add('traveler-chip--active');
      });
    });
    addForm.querySelectorAll('.split-chip').forEach(chip => {
      chip.addEventListener('click', () => chip.classList.toggle('traveler-chip--active'));
    });
    const g = id => addForm.querySelector('#'+id)?.value?.trim()||'';
    const saveBtn = addForm.querySelector('#exp-save');
    saveBtn?.addEventListener('click', async () => {
      if (!g('exp-day')||!g('exp-cat')||!g('exp-desc')||!g('exp-amt')) { Toast.show('Fill all fields','warning'); return; }
      const paidBy = travelers.length ? addForm.querySelector('.paid-chip.traveler-chip--active')?.dataset.name||'' : g('exp-paid');
      const splitBetween = travelers.length ? [...addForm.querySelectorAll('.split-chip.traveler-chip--active')].map(c=>c.dataset.name) : [];
      saveBtn.disabled = true;
      await Data.addExpense({ dayId:g('exp-day'), category:g('exp-cat'), description:g('exp-desc'), amountJPY:parseFloat(g('exp-amt')), paidBy, splitBetween });
      Toast.show('Expense logged','success');
      render();
    });
    addForm.querySelector('#exp-cancel')?.addEventListener('click', () => { addForm.style.display='none'; addBtn.style.display='block'; });

    /* ── Payments — computed early since the summary card above needs
       it too (itinerary costs are part of "what's actually been paid",
       not just what's logged in the expense tracker). ── */
    const paymentsSummary = Data.getPaymentsSummary();
    // "Total spent" = real money out the door: logged expenses (always
    // already paid) + whatever's been paid on itinerary bookings so far.
    // Outstanding itinerary bookings are shown separately, not counted
    // as "spent" yet since the money hasn't actually moved.
    const totalSpent = totalUSD + paymentsSummary.totalPaid;
    const totalOutstanding = paymentsSummary.totalOutstanding;
    const travellerCount = Math.max(1, travelers.length);
    const currentTraveler = travelers[0] || 'You';
    const manualAllocations = expenses.map(exp => ({
      amount: exp.amountJPY,
      selected: exp.splitBetween?.length ? exp.splitBetween : [exp.paidBy || currentTraveler],
    }));
    const paidAllocations = paymentsSummary.items.map(item => ({
      amount: Data.convertToTripCurrency(item.paidAmount, item.currency) ?? 0,
      selected: item.splitBetween?.length ? item.splitBetween : travelers,
    }));
    const outstandingAllocations = paymentsSummary.items.map(item => ({
      amount: Data.convertToTripCurrency(item.cost - item.paidAmount, item.currency) ?? 0,
      selected: item.splitBetween?.length ? item.splitBetween : travelers,
    }));
    const userSpent = window.BudgetSharing.allocatedTotal([...manualAllocations, ...paidAllocations], currentTraveler);
    const userOutstanding = window.BudgetSharing.allocatedTotal(outstandingAllocations, currentTraveler);
    const userBudget = budgetUSD / travellerCount;
    const pctOfBudget = Math.min(100, (userSpent && userBudget) ? Math.round(userSpent/userBudget*100) : 0);

    if (!travelers.length) {
      const notice = document.createElement('div');
      notice.className = 'settlement-card';
      notice.style.marginTop = 'var(--s3)';
      notice.innerHTML = `<p style="font-size:var(--text-sm);color:var(--text-secondary);text-align:center">Add travelers in <strong>Settings</strong> to split expenses</p>`;
      frag.appendChild(notice);
    }

    const summary = document.createElement('div');
    summary.className = 'settlement-card';
    summary.style.marginTop = 'var(--s3)';
    let summaryHTML = `
      <p style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--s2);text-transform:uppercase;letter-spacing:.04em;font-weight:500">Your share of spending · ${currentTraveler}</p>
      <p style="font-size:22px;font-weight:500;color:var(--text-primary)">${cur} ${fmtMoney(userSpent)}</p>
      <p style="font-size:10px;color:var(--text-muted);margin-bottom:4px">Trip total: ${cur} ${fmtMoney(totalSpent)} · split across ${travellerCount} traveller${travellerCount===1?'':'s'}</p>
      ${approxCurrencyLine(userSpent, cur, '13px', 'margin-bottom:4px')}
      ${userOutstanding>0?`<p style="font-size:var(--text-xs);color:var(--warning-text);margin-bottom:2px">+ ${cur} ${fmtMoney(userOutstanding)} outstanding share</p>`:''}
      <p style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:6px">Your budget share: ${cur} ${fmtMoney(userBudget)}</p>
      <div class="budget-bar"><div class="budget-fill" style="width:${pctOfBudget}%;background:${pctOfBudget>90?'var(--danger-text)':pctOfBudget>70?'var(--warning-text)':'var(--accent)'}"></div></div>
      <p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:4px">${cur} ${fmtMoney(Math.max(0,userBudget-userSpent))} remaining</p>`;

    if (travelers.length && expenses.length) {
      const paid = {}; const share = {};
      travelers.forEach(t => { paid[t]=0; share[t]=0; });
      expenses.forEach(exp => {
        if (exp.paidBy && paid[exp.paidBy]!==undefined) paid[exp.paidBy] += exp.amountJPY;
        if (exp.splitBetween?.length) {
          const perHead = exp.amountJPY / exp.splitBetween.length;
          exp.splitBetween.forEach(t => { if (share[t]!==undefined) share[t] += perHead; });
        }
      });
      summaryHTML += `<div style="margin-top:var(--s3);padding-top:var(--s3);border-top:1px solid var(--border-subtle)">`;
      summaryHTML += `<p style="font-size:10px;color:var(--text-muted);margin-bottom:var(--s2)">Split below covers logged expenses. Use “Cost details” below to share itinerary bookings too.</p>`;
      travelers.forEach(t => {
        summaryHTML += `<div class="settlement-row"><span style="font-weight:500">${t}</span><span style="color:var(--text-muted)">paid ${cur} ${fmtMoney(paid[t]||0)} · share ${cur} ${fmtMoney(share[t]||0)}</span></div>`;
      });
      summaryHTML += `</div>`;
      const balances = Data.calcSettlement();
      const positives = travelers.filter(t=>balances[t]>0.5);
      const negatives = travelers.filter(t=>balances[t]<-0.5);
      summaryHTML += `<div style="margin-top:var(--s3);padding-top:var(--s3);border-top:1px solid var(--border-subtle)">`;
      if (!positives.length && !negatives.length) {
        summaryHTML += `<p class="settlement-settled">✓ All settled</p>`;
      } else {
        negatives.forEach(debtor => {
          positives.forEach(creditor => {
            const amt = Math.min(Math.abs(balances[debtor]), balances[creditor]);
            if (amt>0) summaryHTML += `<p class="settlement-owed">💸 ${debtor} owes ${creditor} ${cur} ${fmtMoney(amt)}</p>`;
          });
        });
      }
      summaryHTML += `</div>`;
    }
    summary.innerHTML = summaryHTML;
    frag.appendChild(summary);

    /* ── Payments — split into itinerary-linked costs (stops/overnights)
       and everything logged separately (the expense tracker above),
       each its own collapsible section, same accordion pattern as
       Reservations. ── */
    frag.appendChild(accordionSection('paymentsItinerary',
      '📋 Itinerary payments',
      `${paymentsSummary.items.filter(i=>i.status==='paid').length}/${paymentsSummary.items.length} paid`,
      renderItineraryPaymentsGroups));
    const costHeading = document.createElement('div');
    costHeading.style.cssText = 'font-size:var(--text-sm);font-weight:600;color:var(--text-primary);margin:var(--s4) 0 var(--s2)';
    costHeading.textContent = 'Cost details';
    frag.appendChild(costHeading);
    const allCostCount = paymentsSummary.items.length + expenses.length;
    frag.appendChild(accordionSection('paymentsCategories',
      'By category',
      `${allCostCount} expense${allCostCount === 1 ? '' : 's'} · full totals and traveller shares`,
      renderCategoryPaymentsGroups));
    frag.appendChild(accordionSection('paymentsOther',
      '🧾 Other expenses',
      `${expenses.length} logged`,
      renderExpenseLogContent));

    return frag;
  }

  /* ── Expense log — day-grouped list with inline edit. Unchanged from
     before, just extracted into its own function so it can live inside
     the "Other expenses" accordion instead of always being visible. ── */
  function renderExpenseLogContent() {
    const frag = document.createDocumentFragment();
    const expenses = Data.getExpenses();
    const travelers = Data.getTravelers();

    if (!expenses.length) {
      frag.appendChild(Object.assign(document.createElement('div'),{className:'empty-state',innerHTML:'<p class="empty-title">No expenses yet</p>'}));
    } else {
      const cur = Data.getTripCurrency();

      // Category breakdown + total — summary at the top, same pattern
      // as Itinerary Payments' totals-at-top layout.
      const byCat = {};
      let grandTotal = 0;
      expenses.forEach(e => {
        byCat[e.category] = (byCat[e.category] || 0) + e.amountJPY;
        grandTotal += e.amountJPY;
      });
      const catSummary = document.createElement('div');
      catSummary.style.cssText = 'padding:10px var(--s4) 12px;border-bottom:1px solid var(--border-subtle)';
      catSummary.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:10px">
          ${Object.entries(byCat).map(([cat, amt]) => {
            const pct = grandTotal ? Math.round(amt / grandTotal * 100) : 0;
            return `
            <div style="display:flex;align-items:center;justify-content:space-between">
              <span style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--text-secondary);min-width:0">
                <span style="width:8px;height:8px;border-radius:50%;background:${EXPENSE_CAT_COLORS[cat]||'var(--text-muted)'};flex-shrink:0"></span>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cat}</span>
              </span>
              <span style="display:flex;align-items:center;gap:10px;flex-shrink:0">
                <span style="font-size:11px;color:var(--text-muted);width:28px;text-align:right">${pct}%</span>
                ${formatMoneyAligned(cur, amt)}
              </span>
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding-top:10px;border-top:1px solid var(--border-subtle)">
          <span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Total</span>
          <span style="text-align:right">
            <span style="display:block;font-size:16px;font-weight:600;color:var(--text-primary)">${cur} ${fmtMoney(grandTotal)}</span>
            ${approxCurrencyLine(grandTotal, cur, '10.5px', 'margin-top:0')}
          </span>
        </div>`;
      frag.appendChild(catSummary);

      const byDay = {};
      expenses.forEach(e => { const k=e.dayId||'unknown'; if(!byDay[k])byDay[k]=[]; byDay[k].push(e); });
      Object.entries(byDay).forEach(([dayId,exps]) => {
        const day = Data.getDays().find(d=>d.id===dayId);
        const sec = document.createElement('div');
        sec.className = 'expense-section';
        sec.innerHTML = `<div class="expense-day-header"><span>${day?.label||dayId} · ${day?formatShortDate(day.date):''}</span><span>${cur} ${fmtMoney(exps.reduce((s,e)=>s+e.amountJPY,0))}</span></div>`;
        exps.forEach(exp => {
          const splitPax = Math.max(1, exp.splitBetween?.length||1);
          const perHead  = exp.amountJPY/splitPax;
          const loggedAt = exp.createdAt ? new Date(exp.createdAt).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
          const catColor = EXPENSE_CAT_COLORS[exp.category] || 'var(--text-muted)';
          const initial = n => (n||'?').trim().charAt(0).toUpperCase();
          const AV = 'width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0';

          const row = document.createElement('div');
          row.className = 'expense-row';
          // NOTE: .expense-row's own CSS class sets display:flex with a
          // row direction — must explicitly override to column here or
          // every child below gets squashed onto one horizontal line.
          row.style.cssText = 'display:flex;flex-direction:column;align-items:stretch;gap:0;padding:8px var(--s4);border-bottom:1px solid var(--border-subtle)';
          row.innerHTML = `
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:var(--s2)">
              <div style="display:flex;align-items:center;gap:7px;min-width:0">
                <span style="width:8px;height:8px;border-radius:50%;background:${catColor};flex-shrink:0"></span>
                <span style="font-size:var(--text-sm);font-weight:500;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${exp.description}</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                <span style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary)">${cur} ${fmtMoney(exp.amountJPY)}</span>
                <button class="expense-more" aria-label="More actions" style="width:26px;height:26px;border-radius:50%;flex-shrink:0;background:var(--surface-raised);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);opacity:.7;cursor:pointer">${Icons.dotsV('icon-sm')}</button>
              </div>
            </div>
            ${(exp.paidBy || exp.splitBetween?.length) ? `
            <div style="display:flex;align-items:center;gap:10px;margin:2px 0 0 15px">
              ${exp.paidBy ? `
                <div style="display:flex;align-items:center;gap:5px">
                  <span style="font-size:10px;color:var(--text-muted)">Paid</span>
                  <div style="${AV};background:${travelerColor(exp.paidBy)}">${initial(exp.paidBy)}</div>
                </div>` : ''}
              ${exp.splitBetween?.length ? `
                <div style="display:flex;align-items:center;gap:5px">
                  <span style="font-size:10px;color:var(--text-muted)">Split</span>
                  <div style="display:flex">
                    ${exp.splitBetween.map((name,i) => `<div style="${AV};background:${travelerColor(name)};${i>0?'margin-left:-5px':''}">${initial(name)}</div>`).join('')}
                  </div>
                  ${splitPax>1?`<span style="font-size:10.5px;color:var(--text-muted);margin-left:2px">${cur} ${fmtMoney(perHead)} pp</span>`:''}
                </div>` : ''}
            </div>` : ''}
            <p style="font-size:10.5px;color:var(--text-muted);margin:2px 0 0 15px">${exp.category}${loggedAt?` · Logged ${loggedAt}`:''}</p>`;

          // Inline edit form — same field set as the Log Expense form,
          // prefilled. Toggled open by the "Edit" option in the actions
          // sheet below (kept inline rather than a separate sheet, since
          // it's already a working self-contained form).
          const editRow = document.createElement('div');
          editRow.style.cssText = 'display:none;flex-direction:column;gap:6px;width:100%;padding:8px 0 4px;border-top:1px solid var(--border-subtle);margin-top:10px';
          const dayOpts = `<option value="">No specific day</option>` + Data.getDays().map(d=>`<option value="${d.id}" ${d.id===exp.dayId?'selected':''}>${d.label} · ${formatShortDate(d.date)}</option>`).join('');
          const catOpts = EXPENSE_CATS.map(c=>`<option ${c===exp.category?'selected':''}>${c}</option>`).join('');
          const paidChips = travelers.map(t=>`<button type="button" class="traveler-chip ee-paid-chip ${t===exp.paidBy?'traveler-chip--active':''}" data-name="${t}">${t}</button>`).join('');
          const splitChips = travelers.map(t=>`<button type="button" class="traveler-chip ee-split-chip ${exp.splitBetween?.includes(t)?'traveler-chip--active':''}" data-name="${t}">${t}</button>`).join('');
          editRow.innerHTML = `
            <select class="ee-day bs-input">${dayOpts}</select>
            <select class="ee-cat bs-input">${catOpts}</select>
            <input class="ee-desc bs-input" type="text" value="${exp.description.replace(/"/g,'&quot;')}">
            <input class="ee-amt bs-input" type="number" step="0.01" value="${exp.amountJPY}">
            ${travelers.length?`
              <div class="bs-edit-group"><label class="bs-edit-label">Paid by</label><div class="split-chips ee-paid-wrap">${paidChips}</div></div>
              <div class="bs-edit-group"><label class="bs-edit-label">Split between</label><div class="split-chips ee-split-wrap">${splitChips}</div></div>`:''}
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary ee-save" style="flex:1">Save</button>
              <button class="btn btn-ghost ee-cancel" style="flex:1">Cancel</button>
            </div>`;
          row.appendChild(editRow);

          editRow.querySelectorAll('.ee-paid-chip').forEach(chip => {
            chip.addEventListener('click', () => {
              editRow.querySelectorAll('.ee-paid-chip').forEach(c=>c.classList.remove('traveler-chip--active'));
              chip.classList.add('traveler-chip--active');
            });
          });
          editRow.querySelectorAll('.ee-split-chip').forEach(chip => {
            chip.addEventListener('click', () => chip.classList.toggle('traveler-chip--active'));
          });
          editRow.querySelector('.ee-cancel').addEventListener('click', () => { editRow.style.display = 'none'; });
          editRow.querySelector('.ee-save').addEventListener('click', async () => {
            const dayId = editRow.querySelector('.ee-day').value || null;
            const category = editRow.querySelector('.ee-cat').value;
            const description = editRow.querySelector('.ee-desc').value.trim();
            const amountJPY = parseFloat(editRow.querySelector('.ee-amt').value) || 0;
            const paidBy = travelers.length ? (editRow.querySelector('.ee-paid-chip.traveler-chip--active')?.dataset.name || '') : exp.paidBy;
            const splitBetween = travelers.length ? [...editRow.querySelectorAll('.ee-split-chip.traveler-chip--active')].map(c=>c.dataset.name) : exp.splitBetween;
            await Data.updateExpense(exp.id, { dayId, category, description, amountJPY, paidBy, splitBetween });
            Toast.show('Expense updated','success');
            render();
          });

          row.querySelector('.expense-more').addEventListener('click', (e) => {
            e.stopPropagation();
            openExpenseActions(exp, () => { editRow.style.display = 'flex'; });
          });

          sec.appendChild(row);
        });
        frag.appendChild(sec);
      });
    }
    return frag;
  }

  /* ── Expense row actions sheet — same overlay pattern as bucket-list's
     openRowActions: one overflow tap opens a bottom sheet with the
     available actions, delete needs a second tap to confirm. Kept
     visually/interaction-wise identical rather than inventing a new
     dropdown pattern. ── */
  function openExpenseActions(exp, onEdit) {
    let confirming = false;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:280;background:rgba(0,0,0,.45);display:flex;align-items:flex-end';
    document.body.appendChild(overlay);

    function draw() {
      overlay.innerHTML = `
        <div style="background:var(--bg);width:100%;border-radius:20px 20px 0 0;padding:var(--s2) 0 calc(var(--s4) + env(safe-area-inset-bottom))">
          <div style="display:flex;justify-content:center;padding:6px 0 4px"><div style="width:36px;height:4px;background:var(--border);border-radius:2px"></div></div>
          <p style="padding:var(--s2) var(--s4) var(--s3);font-size:var(--text-sm);font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${exp.description}</p>
          <button id="ea-edit" style="width:100%;display:flex;align-items:center;gap:12px;padding:14px var(--s4);background:none;border:none;font-family:var(--font);font-size:var(--text-sm);color:var(--text-primary);text-align:left">${Icons.pencil('icon-sm')}Edit</button>
          <button id="ea-delete" style="width:100%;display:flex;align-items:center;gap:12px;padding:14px var(--s4);background:none;border:none;font-family:var(--font);font-size:var(--text-sm);text-align:left;color:${confirming ? 'var(--danger-text)' : 'var(--text-primary)'}">${confirming ? Icons.check('icon-sm') : Icons.trash('icon-sm')}${confirming ? 'Tap again to delete' : 'Delete'}</button>
        </div>`;

      overlay.querySelector('#ea-edit').addEventListener('click', () => { overlay.remove(); onEdit(); });
      overlay.querySelector('#ea-delete').addEventListener('click', async () => {
        if (!confirming) { confirming = true; draw(); return; }
        overlay.remove();
        await Data.deleteExpense(exp.id);
        Toast.show('Removed', 'info');
        render();
      });
    }
    draw();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }

  /* Category dot colors for the expense row — reused nowhere else, kept
     local to this function's neighborhood rather than a new global. */
  const EXPENSE_CAT_COLORS = {
    Food: '#C84B35', Transport: '#2A7A4B', Accommodation: '#7B4EA0',
    Activities: '#0E7C7B', Shopping: '#D9A441', Other: '#9C9690',
  };

  /* ═══ PACKING ════════════════════════════════════════════ */
  const TRAVELER_COLORS = ['#7A5C2E','#2A7A4B','#7B4EA0','#0E7C7B','#C1440E'];
  function travelerColor(name) {
    const idx = Data.getTravelers().indexOf(name);
    return TRAVELER_COLORS[idx % TRAVELER_COLORS.length] || 'var(--accent)';
  }

  function renderPacking() {
    const frag = document.createDocumentFragment();
    const items = Data.getPackingItems();
    const travelers = Data.getTravelers();

    // Compact stacked progress rows, one per traveler, in a single card —
    // consistent colors (by list position) reused on the pills below too.
    const progressCard = document.createElement('div');
    progressCard.style.cssText = 'background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r-lg);padding:10px 12px;margin:var(--s3) 0;display:flex;flex-direction:column;gap:8px';
    Data.getPackingProgressByTraveler().forEach(p => {
      const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
      const fillPct = Math.max(pct ? 4 : 0, pct); // 4% minimum so 1 packed is never visually invisible
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px';
      row.innerHTML = `
        <span style="font-size:var(--text-xs);font-weight:600;color:var(--text-muted);width:26px;flex-shrink:0">${p.name.slice(0,2).toUpperCase()}</span>
        <div style="flex:1;height:6px;background:var(--surface-raised);border-radius:var(--r-pill);overflow:hidden">
          <div style="width:${fillPct}%;height:100%;background:${travelerColor(p.name)};border-radius:var(--r-pill)"></div>
        </div>
        <span style="font-size:var(--text-xs);color:var(--text-muted);width:48px;text-align:right;flex-shrink:0">${p.done}/${p.total}</span>`;
      progressCard.appendChild(row);
    });
    frag.appendChild(progressCard);

    Object.entries(Data.getPackingByCategory()).forEach(([cat,catItems]) => {
      const sec = document.createElement('div');
      sec.className = 'packing-section';
      sec.innerHTML = `<div class="packing-cat-header"><span>${cat}</span></div>`;
      catItems.forEach(item => {
        const row = document.createElement('div');
        row.className = 'packing-row';
        row.style.cssText = 'flex-direction:column;align-items:stretch;gap:6px';

        const topLine = document.createElement('div');
        topLine.style.cssText = 'display:flex;align-items:center;gap:8px';
        topLine.innerHTML = `
          <span class="packing-item packing-item-edit" tabindex="0" style="cursor:pointer;flex:1" title="Tap to edit">${item.item}</span>
          <button class="packing-tag packing-essential-toggle" style="border:none;cursor:pointer;${item.essential?'':'opacity:.35'}">Essential</button>
          <button class="packing-del">×</button>`;
        row.appendChild(topLine);

        // Pill row — one per traveler, tap to mark that person as packed
        const pillRow = document.createElement('div');
        pillRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
        travelers.forEach(name => {
          const checked = !!item.checked_by_names?.[name];
          const pill = document.createElement('button');
          const initials = name.slice(0,2).toUpperCase();
          const tColor = travelerColor(name);
          pill.style.cssText = `display:flex;align-items:center;gap:3px;border:1.5px solid ${checked?tColor:'var(--border)'};background:${checked?tColor:'var(--surface)'};color:${checked?'#fff':'var(--text-muted)'};border-radius:var(--r-pill);padding:3px 10px;font-size:10.5px;font-weight:600;cursor:pointer`;
          pill.innerHTML = `${checked?'✓ ':''}${initials}`;
          pill.title = name;
          pill.addEventListener('click', async () => {
            await Data.togglePackingFor(item.id, name);
            render();
          });
          pillRow.appendChild(pill);
        });
        row.appendChild(pillRow);

        let delArmed = false, delTimer = null;
        const delBtn = topLine.querySelector('.packing-del');
        delBtn.addEventListener('click', async () => {
          if (!delArmed) {
            delArmed = true;
            delBtn.textContent = '✓';
            delBtn.style.background = 'var(--danger-text)';
            delBtn.style.color = '#fff';
            delBtn.title = 'Tap again to confirm delete';
            delTimer = setTimeout(() => {
              delArmed = false;
              delBtn.textContent = '×';
              delBtn.style.background = '';
              delBtn.style.color = '';
            }, 3000);
            return;
          }
          clearTimeout(delTimer);
          await Data.deletePacking(item.id); render();
        });
        topLine.querySelector('.packing-essential-toggle').addEventListener('click', async () => {
          await Data.updatePackingItem(item.id, { essential: !item.essential });
          render();
        });
        const label = topLine.querySelector('.packing-item-edit');
        const startEdit = () => {
          const input = document.createElement('input');
          input.type = 'text';
          input.value = item.item;
          input.className = 'packing-add-input';
          input.style.flex = '1';
          label.replaceWith(input);
          input.focus();
          input.select();
          const save = async () => {
            const val = input.value.trim();
            if (val && val !== item.item) await Data.updatePackingItem(item.id, { item: val });
            render();
          };
          input.addEventListener('blur', save);
          input.addEventListener('keydown', e => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') { input.value = item.item; input.blur(); }
          });
        };
        label.addEventListener('click', startEdit);
        label.addEventListener('keydown', e => { if (e.key === 'Enter') startEdit(); });
        sec.appendChild(row);
      });
      const addRow = document.createElement('div');
      addRow.className = 'packing-add-row';
      addRow.innerHTML = `<input type="text" class="packing-add-input" placeholder="Add to ${cat}…"><button class="packing-add-btn">Add</button>`;
      addRow.querySelector('.packing-add-btn').addEventListener('click', async () => {
        const inp = addRow.querySelector('.packing-add-input');
        if (!inp.value.trim()) return;
        await Data.addPackingItem({cat,item:inp.value.trim(),essential:false});
        inp.value=''; render();
      });
      addRow.querySelector('.packing-add-input').addEventListener('keydown', e => { if(e.key==='Enter') addRow.querySelector('.packing-add-btn').click(); });
      sec.appendChild(addRow);
      frag.appendChild(sec);
    });

    // Always-visible "new category" form — the per-category quick-add
    // rows above only exist once a category already has items, which
    // left brand-new trips with zero items and no way to add the first one.
    const newCatWrap = document.createElement('div');
    newCatWrap.style.cssText = 'background:var(--surface-raised);border:1.5px dashed var(--border);border-radius:var(--r-lg);padding:var(--s3);display:flex;flex-direction:column;gap:8px;margin-top:var(--s2)';
    newCatWrap.innerHTML = `
      <p style="font-size:var(--text-xs);font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Add a new item</p>
      <input type="text" class="packing-add-input" id="new-cat-name" placeholder="Category (e.g. Clothing, Documents)">
      <input type="text" class="packing-add-input" id="new-cat-item" placeholder="Item name">
      <button class="packing-add-btn" id="new-cat-btn" style="align-self:flex-end">Add</button>`;
    newCatWrap.querySelector('#new-cat-btn').addEventListener('click', async () => {
      const catInp  = newCatWrap.querySelector('#new-cat-name');
      const itemInp = newCatWrap.querySelector('#new-cat-item');
      const cat = catInp.value.trim(), item = itemInp.value.trim();
      if (!cat || !item) { Toast.show('Category and item are both required', 'warning'); return; }
      await Data.addPackingItem({ cat, item, essential: false });
      catInp.value = ''; itemInp.value = '';
      render();
    });
    frag.appendChild(newCatWrap);
    return frag;
  }

  /* ═══ SETTINGS ═══════════════════════════════════════════ */
  function renderSettings() {
    const frag = document.createDocumentFragment();
    const travelers = Data.getTravelers();

    const tSection = document.createElement('div');
    tSection.className = 'settings-section';
    tSection.innerHTML = `
      <p class="settings-section-title">Travelers</p>
      <p style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--s3)">Names are used to split and track expenses. Synced across devices.</p>`;
    const chipWrap = document.createElement('div');
    chipWrap.className = 'split-chips';
    if (!travelers.length) {
      chipWrap.innerHTML = '<p style="font-size:var(--text-sm);color:var(--text-muted)">No travelers added yet.</p>';
    } else {
      travelers.forEach((name,i) => {
        const chip = document.createElement('span');
        chip.className = 'traveler-chip traveler-chip--active';
        chip.innerHTML = `${name}<button class="traveler-chip-del" data-idx="${i}">×</button>`;
        chip.querySelector('.traveler-chip-del').addEventListener('click', async () => {
          try {
            await Data.updateTravelers(travelers.filter((_,j)=>j!==i));
            Toast.show(`${name} removed`,'info'); render();
          } catch (e) {
            Toast.show('Could not save — check connection', 'danger');
          }
        });
        chipWrap.appendChild(chip);
      });
    }
    tSection.appendChild(chipWrap);
    const addRow = document.createElement('div');
    addRow.className = 'traveler-add-row';
    addRow.innerHTML = `<input id="traveler-input" class="bs-input" type="text" placeholder="Traveler name (e.g. C or K)" style="flex:1"><button class="btn btn-primary" id="traveler-add-btn">Add</button>`;
    tSection.appendChild(addRow);
    frag.appendChild(tSection);

    /* ── Trip members (invite flow) ──────────────────────────── */
    const membersSection = document.createElement('div');
    membersSection.className = 'settings-section';
    membersSection.innerHTML = `
      <p class="settings-section-title">Trip members</p>
      <p style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--s3)">Invite someone by email. If they don't have an account yet, they'll get an email to sign up — either way, they'll see this trip once added.</p>
      <div id="members-list" style="margin-bottom:var(--s3)"><p style="font-size:var(--text-sm);color:var(--text-muted)">Loading…</p></div>
      <div style="display:flex;gap:var(--s2);flex-wrap:wrap">
        <input id="invite-email" class="bs-input" type="email" placeholder="Email address" style="flex:1;min-width:160px">
        <select id="invite-role" class="bs-input" style="flex:0 0 110px">
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
        </select>
        <button class="btn btn-primary" id="invite-btn" style="flex:0 0 100%">Send invite</button>
      </div>`;
    frag.appendChild(membersSection);

    // Populate member list async (RLS/auth calls can't block the sync render)
    (async () => {
      const listEl = membersSection.querySelector('#members-list');
      try {
        const members = await Data.getTripMembers();
        if (!members.length) {
          listEl.innerHTML = '<p style="font-size:var(--text-sm);color:var(--text-muted)">Just you so far.</p>';
          return;
        }
        listEl.innerHTML = '';
        members.forEach(m => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:var(--s2);padding:8px 0;border-bottom:1px solid var(--border-subtle)';
          row.innerHTML = `
            <div style="flex:1;min-width:0">
              <p style="font-size:var(--text-sm);color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.invited_email || '(unknown)'}</p>
              <p style="font-size:var(--text-xs);color:var(--text-muted)">${m.role} · ${m.status}</p>
            </div>
            <button class="member-remove-btn" style="background:none;border:none;color:var(--text-muted);font-size:16px;cursor:pointer;padding:0 4px">×</button>`;
          row.querySelector('.member-remove-btn').addEventListener('click', async () => {
            await Data.removeMember(m.id);
            Toast.show('Member removed', 'info');
            render();
          });
          listEl.appendChild(row);
        });
      } catch (e) {
        listEl.innerHTML = '<p style="font-size:var(--text-sm);color:var(--text-muted)">Could not load members.</p>';
      }
    })();

    membersSection.querySelector('#invite-btn').addEventListener('click', async (e) => {
      const btn = e.target;
      const emailInput = membersSection.querySelector('#invite-email');
      const email = emailInput.value.trim();
      const role = membersSection.querySelector('#invite-role').value;
      if (!email || !email.includes('@')) { Toast.show('Enter a valid email', 'warning'); return; }
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        const result = await Data.inviteMember(email, role);
        Toast.show(result.inviteSent ? `Invite email sent to ${email}` : `${email} added — they'll see it next login`, 'success');
        emailInput.value = '';
        render();
      } catch (err) {
        Toast.show('Could not invite: ' + err.message, 'warning');
        btn.disabled = false;
        btn.textContent = 'Send invite';
      }
    });

    const budgetSection = document.createElement('div');
    budgetSection.className = 'settings-section';
    budgetSection.innerHTML = `
      <p class="settings-section-title">Budget</p>
      <div class="bs-edit-group"><label class="bs-edit-label">Total Budget (${Data.getTripCurrency()})</label><input id="cfg-budget" class="bs-input" type="number" step="0.01" value="${Data.getBudgetTotal?.() || ''}" placeholder="e.g. 5000"></div>
      
      <button class="btn btn-primary" id="cfg-save-btn" style="width:100%;margin-top:var(--s2)">Save budget settings</button>`;
    const tripSection = document.createElement('div');
    tripSection.className = 'settings-section';
    const ct = Data.getCurrentTrip();
    tripSection.innerHTML = `
      <p class="settings-section-title">Trip</p>
      <div class="bs-edit-group">
        <label class="bs-edit-label">Trip name (shown in header)</label>
        <input id="trip-name-input" class="bs-input" type="text" value="${Data.getTripName?.() || ''}" placeholder="e.g. Japan Trip 2027">
      </div>
      <div class="bs-edit-group"><label class="bs-edit-label">Cover emoji</label><input id="trip-emoji-input" class="bs-input" type="text" value="${ct?.cover_emoji || '🧭'}" maxlength="4"></div>
      <div class="bs-edit-group"><label class="bs-edit-label">Start date</label><input id="trip-start-input" class="bs-input" type="date" value="${ct?.start_date || ''}"></div>
      <div class="bs-edit-group"><label class="bs-edit-label">End date</label><input id="trip-end-input" class="bs-input" type="date" value="${ct?.end_date || ''}"></div>
      <div class="bs-edit-group"><label class="bs-edit-label">Countries (comma-separated)</label><input id="trip-countries-input" class="bs-input" type="text" value="${(ct?.countries || []).join(', ')}"></div>
      <div class="bs-edit-group">
        <label class="bs-edit-label">Default currency</label>
        <div style="position:relative"><input id="trip-currency-input" class="bs-input bs-tz-sel" type="text" autocomplete="off" value="${ct?.currency || 'USD'}" placeholder="Search currency…"></div>
        <p style="font-size:10px;color:var(--text-muted);margin-top:3px">Used for every stop/booking unless overridden on that item</p>
      </div>
      <div class="bs-edit-group">
        <label class="bs-edit-label">Default timezone</label>
        <div style="position:relative"><input id="trip-timezone-input" class="bs-input bs-tz-sel" type="text" autocomplete="off" value="${Data.getDefaultTimezone?.() || ''}" placeholder="Search city or region…"></div>
        <p style="font-size:10px;color:var(--text-muted);margin-top:3px">Used for every new stop's time unless overridden on that stop</p>
      </div>
      <button class="btn btn-primary" id="trip-name-save-btn" style="width:100%;margin-top:var(--s2)">Save trip details</button>`;
    frag.appendChild(tripSection);
    window.BottomSheet?.wireCurrencyCombobox?.(tripSection.querySelector('#trip-currency-input'));
    window.BottomSheet?.wireTzCombobox?.(tripSection.querySelector('#trip-timezone-input'));

    const resetSection = document.createElement('div');
    resetSection.className = 'settings-section';
    resetSection.innerHTML = `
      <p class="settings-section-title">Data</p>
      <p style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--s3)">Reload this trip's data fresh from Supabase. Use if something looks out of sync — this does not delete or change anything, it only re-fetches.</p>
      <button class="btn btn-ghost" id="reset-data-btn" style="width:100%;margin-bottom:var(--s2)">↻ Reload from Supabase</button>`;
    frag.appendChild(resetSection);

    frag.appendChild(budgetSection);

    // Account (name/email/sign-out) now lives in its own screen — see
    // js/screens/account.js, opened from Home's settings gear — rather
    // than duplicated here with no way to actually set a name.

    // Wire directly — no setTimeout to avoid stacking listeners on re-render
    const tInput  = tSection.querySelector('#traveler-input');
    const tAddBtn = tSection.querySelector('#traveler-add-btn');
    const addTraveler = async () => {
      const name = tInput?.value?.trim();
      if (!name) return;
      if (travelers.includes(name)) { Toast.show(`${name} already added`,'warning'); return; }
      try {
        await Data.updateTravelers([...travelers, name]);
        Toast.show(`${name} added`,'success'); render();
      } catch (e) {
        Toast.show('Could not save — check connection', 'danger');
      }
    };
    tAddBtn?.addEventListener('click', addTraveler);
    tInput?.addEventListener('keydown', e => { if (e.key==='Enter') addTraveler(); });

    tripSection.querySelector('#trip-name-save-btn')?.addEventListener('click', async () => {
      const name = tripSection.querySelector('#trip-name-input')?.value?.trim();
      if (!name) return;
      const countries = tripSection.querySelector('#trip-countries-input')?.value
        .split(',').map(s => s.trim()).filter(Boolean);
      try {
        await Data.updateTripDetails({
          name,
          coverEmoji: tripSection.querySelector('#trip-emoji-input')?.value?.trim() || '🧭',
          startDate: tripSection.querySelector('#trip-start-input')?.value,
          endDate: tripSection.querySelector('#trip-end-input')?.value,
          countries,
          currency: tripSection.querySelector('#trip-currency-input')?.value?.trim().toUpperCase() || 'USD',
        });
        const tz = tripSection.querySelector('#trip-timezone-input')?.value?.trim();
        if (tz) await Data.setDefaultTimezone?.(tz);
        Toast.show('Trip details updated','success');
        render();
      } catch (e) {
        Toast.show('Could not save — check connection', 'danger');
      }
    });

    resetSection.querySelector('#reset-data-btn')?.addEventListener('click', async () => {
      Toast.show('Reloading from Supabase…','info');
      try {
        await Data.resetToSeed();
        Toast.show('Done — reloading','success');
        setTimeout(() => location.reload(), 1000);
      } catch(e) {
        Toast.show('Reload failed: ' + e.message,'warning');
      }
    });
    budgetSection.querySelector('#cfg-save-btn')?.addEventListener('click', async () => {
      const raw = budgetSection.querySelector('#cfg-budget')?.value;
      // Empty field means "reset to 0" — previously `parseInt(raw)||oldValue`
      // meant clearing the field and saving just silently kept the old
      // value, since an empty/invalid parse is falsy and fell through to
      // the fallback instead of actually resetting anything.
      const amount = raw === '' ? 0 : (parseFloat(raw) || 0);
      await Data.setBudgetTotal?.(amount);
      Toast.show('Budget settings saved','success'); render();
    });
    return frag;
  }

  /* ─── Main render ───────────────────────────────────────── */
  function render() {
    if (!root) return;
    root.innerHTML = '';
    root.appendChild(tabBar());
    const content = document.createElement('div');
    content.style.padding = '0 var(--s3)';
    if      (activeTab==='reservations') content.appendChild(renderReservations());
    else if (activeTab==='budget') {
      content.appendChild(renderBudget());
      const userCur = Data.getUserCurrency?.();
      const tripCur = Data.getTripCurrency();
      if (userCur && userCur !== tripCur && !Data.hasTriedLiveRate?.(tripCur, userCur)) {
        Data.fetchLiveRate?.(tripCur, userCur).then(rate => { if (rate) render(); });
      }
    }
    else if (activeTab==='packing')      content.appendChild(renderPacking());
    else                                 content.appendChild(renderSettings());
    root.appendChild(content);
  }

  return {
    init(el) { root=el; render(); },
    destroy() { root=null; },
    refresh() { render(); },
  };
})();

window.BookingsScreen = BookingsScreen;
