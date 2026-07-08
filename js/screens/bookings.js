'use strict';

const BookingsScreen = (() => {
  let root;
  let activeTab = 'reservations';
  const sectionsOpen = { accommodation: true, transport: true, activities: true };
  const EXPENSE_CATS = ['Food','Transport','Accommodation','Activities','Shopping','Other'];

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
    const nights = Data.getDays().map(d=>({day:d,o:Data.getOvernight(d.id)})).filter(({o})=>o?.name);
    const booked = nights.filter(({o})=>o.status==='booked').length;
    const transStops = Data.getTransportReservations();
    const actStops = Data.getActivityReservations();
    frag.appendChild(accordionSection('accommodation',
      '🏨 Accommodation', `${booked}/${nights.length} confirmed`,
      renderAccommodationContent));
    frag.appendChild(accordionSection('transport',
      '✈️ Transport', `${transStops.length} to track`,
      renderTransportContent));
    frag.appendChild(accordionSection('activities',
      '🦁 Activities', `${actStops.length} to book`,
      renderActivitiesContent));
    return frag;
  }

  /* ─── JR Pass Seat Reservations — standalone highlighted card ──
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
        <p style="font-size:var(--text-md);font-weight:600;color:var(--accent)">JR Pass Seat Reservations</p>
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
        <span style="font-size:var(--text-xs);color:var(--text-muted)">${day ? day.date : ''}</span>
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
    const lines = ['JR Pass Seat Reservations', ''];
    legs.forEach(leg => {
      const day = allDays.find(d => d.id === leg.dayId);
      lines.push(`${day ? day.label + ' · ' + day.date : ''}`.trim());
      lines.push(leg.fromStation && leg.toStation ? `${leg.fromStation} → ${leg.toStation}` : (leg.trainName || 'Train'));
      if (leg.trainName) lines.push(leg.trainName);
      if (leg.departTime || leg.arriveTime) lines.push(`Depart: ${leg.departTime || 'TBD'} · Arrive: ${leg.arriveTime || 'TBD'}${leg.duration ? ' · ' + leg.duration : ''}`);
      if (leg.trainNo) lines.push(`Train: ${leg.trainNo}`);
      lines.push(`${leg.jrPass ? 'JR Pass ✓' : 'NOT on JR Pass'} · Seat reservation required`);
      lines.push('');
    });
    const text = lines.join('\n').trim();

    if (navigator.share) {
      try { await navigator.share({ title: 'JR Pass Seat Reservations', text }); return; }
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
              <span style="font-size:var(--text-xs);color:var(--text-muted)">${day.date}</span>
            </div>
            <p style="font-weight:500;font-size:var(--text-sm);color:var(--text-primary)">${o.name}</p>
            ${o.ref?`<p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:1px">Ref: ${o.ref}</p>`:''}
            ${o.cost?`<p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:1px">${Data.getTripCurrency()} ${o.cost.toLocaleString()}</p>`:''}
            ${o.deadline?`<p style="font-size:var(--text-xs);color:var(--danger-text);margin-top:1px">Book by ${new Date(o.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</p>`:''}
          </div>
          ${statusBadge(o.status)}
        </div>`;
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
                <span style="font-size:var(--text-xs);color:var(--text-muted)">${day?.date||''}</span>
              </div>
              <p style="font-weight:500;font-size:var(--text-sm);color:var(--text-primary)">${stop.name}</p>
              ${stop.trainDetail?.service?`<p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:1px">${stop.trainDetail.service}</p>`:''}
              ${stop.trainDetail?.seatReservation?`<p style="font-size:var(--text-xs);color:var(--accent);margin-top:1px">Seat reservation required</p>`:''}
              ${stop.trainDetail?.jrPass===false?`<p style="font-size:var(--text-xs);color:var(--warning-text);margin-top:1px">Not on JR Pass</p>`:''}
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
              <span style="font-size:var(--text-xs);color:var(--text-muted)">${day?.date||''}</span>
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
  function renderBudget() {
    const frag = document.createDocumentFragment();
    const travelers = Data.getTravelers();
    const expenses  = Data.getExpenses();
    const totalUSD  = Data.getTotalSpentJPY(); // field name kept for compat, stores USD
    const budgetUSD = Config.BUDGET_MYR || 0;  // BUDGET_MYR stores total USD budget
    const pct       = Math.min(100, (totalUSD && budgetUSD) ? Math.round(totalUSD/budgetUSD*100) : 0);

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
    const cur = Data.getTripCurrency();
    let summaryHTML = `
      <p style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--s2);text-transform:uppercase;letter-spacing:.04em;font-weight:500">Total spent</p>
      <p style="font-size:22px;font-weight:500;color:var(--text-primary)">${cur} ${totalUSD.toLocaleString()}</p>
      <p style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:6px">Budget: ${cur} ${budgetUSD.toLocaleString()}</p>
      <div class="budget-bar"><div class="budget-fill" style="width:${pct}%;background:${pct>90?'var(--danger-text)':pct>70?'var(--warning-text)':'var(--accent)'}"></div></div>
      <p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:4px">${cur} ${Math.max(0,budgetUSD-totalUSD).toLocaleString()} remaining</p>`;

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
      travelers.forEach(t => {
        summaryHTML += `<div class="settlement-row"><span style="font-weight:500">${t}</span><span style="color:var(--text-muted)">paid ${cur} ${(paid[t]||0).toLocaleString()} · share ${cur} ${Math.round(share[t]||0).toLocaleString()}</span></div>`;
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
            const amt = Math.round(Math.min(Math.abs(balances[debtor]), balances[creditor]));
            if (amt>0) summaryHTML += `<p class="settlement-owed">💸 ${debtor} owes ${creditor} ${cur} ${amt.toLocaleString()}</p>`;
          });
        });
      }
      summaryHTML += `</div>`;
    }
    summary.innerHTML = summaryHTML;
    frag.appendChild(summary);

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary bs-full-btn';
    addBtn.style.marginBottom = 'var(--s3)';
    addBtn.textContent = '+ Log expense';
    frag.appendChild(addBtn);

    const addForm = document.createElement('div');
    addForm.className = 'add-expense-form';
    addForm.style.display = 'none';
    const pax = travelers.length || 1;
    const paidByChips = travelers.map((t,i) =>
      `<button type="button" class="traveler-chip paid-chip ${i===0?'traveler-chip--active':''}" data-name="${t}">${t}</button>`
    ).join('');
    const splitChips = travelers.map(t =>
      `<button type="button" class="traveler-chip split-chip traveler-chip--active" data-name="${t}">${t}</button>`
    ).join('');
    addForm.innerHTML = `
      <p class="form-title">Log expense</p>
      <select id="exp-day" class="bs-input"><option value="">Day…</option>${Data.getDays().map(d=>`<option value="${d.id}">${d.label} · ${d.date}</option>`).join('')}</select>
      <select id="exp-cat" class="bs-input"><option value="">Category…</option>${EXPENSE_CATS.map(c=>`<option>${c}</option>`).join('')}</select>
      <input id="exp-desc" class="bs-input" type="text" placeholder="Description">
      <input id="exp-amt" class="bs-input" type="number" placeholder="Amount (${Data.getTripCurrency()})">
      ${travelers.length?`
        <div class="bs-edit-group"><label class="bs-edit-label">Paid by</label><div class="split-chips" id="paid-by-chips">${paidByChips}</div></div>
        <div class="bs-edit-group"><label class="bs-edit-label">Split between</label><div class="split-chips" id="split-chips">${splitChips}</div></div>`
      :`<input id="exp-paid" class="bs-input" type="text" placeholder="Paid by">`}
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" id="exp-save" style="flex:1">Save</button>
        <button class="btn btn-ghost" id="exp-cancel" style="flex:1">Cancel</button>
      </div>`;
    frag.appendChild(addForm);

    // Wire add form
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
      await Data.addExpense({ dayId:g('exp-day'), category:g('exp-cat'), description:g('exp-desc'), amountJPY:parseInt(g('exp-amt')), paidBy, splitBetween });
      Toast.show('Expense logged','success');
      render();
    });
    addForm.querySelector('#exp-cancel')?.addEventListener('click', () => { addForm.style.display='none'; addBtn.style.display='block'; });

    if (!expenses.length) {
      frag.appendChild(Object.assign(document.createElement('div'),{className:'empty-state',innerHTML:'<p class="empty-title">No expenses yet</p>'}));
    } else {
      const cur = Data.getTripCurrency();
      const byDay = {};
      expenses.forEach(e => { const k=e.dayId||'unknown'; if(!byDay[k])byDay[k]=[]; byDay[k].push(e); });
      Object.entries(byDay).forEach(([dayId,exps]) => {
        const day = Data.getDays().find(d=>d.id===dayId);
        const sec = document.createElement('div');
        sec.className = 'expense-section';
        sec.innerHTML = `<div class="expense-day-header"><span>${day?.label||dayId} · ${day?.date||''}</span><span>${cur} ${exps.reduce((s,e)=>s+e.amountJPY,0).toLocaleString()}</span></div>`;
        exps.forEach(exp => {
          const splitPax = Math.max(1, exp.splitBetween?.length||1);
          const perHead  = Math.round(exp.amountJPY/splitPax);
          const loggedAt = exp.createdAt ? new Date(exp.createdAt).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
          const row = document.createElement('div');
          row.className = 'expense-row';
          row.style.flexWrap = 'wrap';
          row.innerHTML = `
            <span class="expense-cat">${exp.category}</span>
            <div class="expense-info">
              <p class="expense-desc">${exp.description}</p>
              <p class="expense-split-line">${exp.paidBy?exp.paidBy+' paid':''} ${exp.splitBetween?.length?'· '+exp.splitBetween.join('+'):''} · ${cur} ${perHead.toLocaleString()} pp</p>
              ${loggedAt?`<p class="expense-split-line" style="opacity:.7">Logged ${loggedAt}</p>`:''}
            </div>
            <div style="text-align:right;flex-shrink:0">
              <p class="expense-amt">${cur} ${exp.amountJPY.toLocaleString()}</p>
              <p class="expense-per">${cur} ${perHead.toLocaleString()} pp</p>
            </div>
            <button class="expense-edit" style="background:none;border:1.5px solid var(--border);border-radius:var(--r-sm);padding:3px 9px;font-size:var(--text-xs);cursor:pointer;font-family:var(--font);color:var(--text-secondary);flex-shrink:0">Edit</button>
            <button class="expense-del">×</button>`;
          let expDelArmed = false, expDelTimer = null;
          const expDelBtn = row.querySelector('.expense-del');
          expDelBtn.addEventListener('click', async e => {
            e.stopPropagation();
            if (!expDelArmed) {
              expDelArmed = true;
              expDelBtn.textContent = '✓';
              expDelBtn.style.background = 'var(--danger-text)';
              expDelBtn.style.color = '#fff';
              expDelBtn.title = 'Tap again to confirm delete';
              expDelTimer = setTimeout(() => {
                expDelArmed = false;
                expDelBtn.textContent = '×';
                expDelBtn.style.background = '';
                expDelBtn.style.color = '';
              }, 3000);
              return;
            }
            clearTimeout(expDelTimer);
            await Data.deleteExpense(exp.id); Toast.show('Removed','info'); render();
          });

          // Inline edit form
          const editRow = document.createElement('div');
          editRow.style.cssText = 'display:none;flex-direction:column;gap:6px;width:100%;padding:8px 0 4px;border-top:1px solid var(--border-subtle);margin-top:6px';
          const dayOpts = `<option value="">No specific day</option>` + Data.getDays().map(d=>`<option value="${d.id}" ${d.id===exp.dayId?'selected':''}>${d.label} · ${d.date}</option>`).join('');
          const catOpts = EXPENSE_CATS.map(c=>`<option ${c===exp.category?'selected':''}>${c}</option>`).join('');
          const paidChips = travelers.map(t=>`<button type="button" class="traveler-chip ee-paid-chip ${t===exp.paidBy?'traveler-chip--active':''}" data-name="${t}">${t}</button>`).join('');
          const splitChips = travelers.map(t=>`<button type="button" class="traveler-chip ee-split-chip ${exp.splitBetween?.includes(t)?'traveler-chip--active':''}" data-name="${t}">${t}</button>`).join('');
          editRow.innerHTML = `
            <select class="ee-day bs-input">${dayOpts}</select>
            <select class="ee-cat bs-input">${catOpts}</select>
            <input class="ee-desc bs-input" type="text" value="${exp.description.replace(/"/g,'&quot;')}">
            <input class="ee-amt bs-input" type="number" value="${exp.amountJPY}">
            ${travelers.length?`
              <div class="bs-edit-group"><label class="bs-edit-label">Paid by</label><div class="split-chips ee-paid-wrap">${paidChips}</div></div>
              <div class="bs-edit-group"><label class="bs-edit-label">Split between</label><div class="split-chips ee-split-wrap">${splitChips}</div></div>`:''}
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary ee-save" style="flex:1">Save</button>
              <button class="btn btn-ghost ee-cancel" style="flex:1">Cancel</button>
            </div>`;
          row.appendChild(editRow);

          row.querySelector('.expense-edit').addEventListener('click', e => {
            e.stopPropagation();
            editRow.style.display = editRow.style.display === 'none' ? 'flex' : 'none';
          });
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
            const amountJPY = parseInt(editRow.querySelector('.ee-amt').value) || 0;
            const paidBy = travelers.length ? (editRow.querySelector('.ee-paid-chip.traveler-chip--active')?.dataset.name || '') : exp.paidBy;
            const splitBetween = travelers.length ? [...editRow.querySelectorAll('.ee-split-chip.traveler-chip--active')].map(c=>c.dataset.name) : exp.splitBetween;
            await Data.updateExpense(exp.id, { dayId, category, description, amountJPY, paidBy, splitBetween });
            Toast.show('Expense updated','success');
            render();
          });

          sec.appendChild(row);
        });
        frag.appendChild(sec);
      });
    }
    return frag;
  }

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
    progressCard.style.cssText = 'background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r-lg);padding:10px 12px;margin-bottom:var(--s3);display:flex;flex-direction:column;gap:8px';
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
      <div class="bs-edit-group"><label class="bs-edit-label">Total Budget (${Data.getTripCurrency()})</label><input id="cfg-budget" class="bs-input" type="number" value="${Config.BUDGET_MYR}"></div>
      
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
      <div class="bs-edit-group"><label class="bs-edit-label">Currency</label><input id="trip-currency-input" class="bs-input" type="text" value="${ct?.currency || 'USD'}" maxlength="3"></div>
      <button class="btn btn-primary" id="trip-name-save-btn" style="width:100%;margin-top:var(--s2)">Save trip details</button>`;
    frag.appendChild(tripSection);

    const resetSection = document.createElement('div');
    resetSection.className = 'settings-section';
    resetSection.innerHTML = `
      <p class="settings-section-title">Data</p>
      <p style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--s3)">Reload this trip's data fresh from Supabase. Use if something looks out of sync — this does not delete or change anything, it only re-fetches.</p>
      <button class="btn btn-ghost" id="reset-data-btn" style="width:100%;margin-bottom:var(--s2)">↻ Reload from Supabase</button>`;
    frag.appendChild(resetSection);

    frag.appendChild(budgetSection);

    const accountSection = document.createElement('div');
    accountSection.className = 'settings-section';
    accountSection.innerHTML = `
      <p class="settings-section-title">Account</p>
      <p id="account-email" style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--s3)">Loading…</p>
      <button class="btn btn-ghost" id="signout-btn" style="width:100%;color:var(--danger-text);border-color:var(--danger-text)">Sign out</button>`;
    frag.appendChild(accountSection);
    (async () => {
      const { data: { user } } = await SB.auth.getUser();
      const el = accountSection.querySelector('#account-email');
      if (el) el.textContent = user?.email ? `Signed in as ${user.email}` : '';
    })();
    accountSection.querySelector('#signout-btn')?.addEventListener('click', () => Auth.signOut());

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
    budgetSection.querySelector('#cfg-save-btn')?.addEventListener('click', () => {
      Config.BUDGET_MYR        = parseInt(budgetSection.querySelector('#cfg-budget')?.value)||Config.BUDGET_MYR;
      
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
    else if (activeTab==='budget')       content.appendChild(renderBudget());
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
