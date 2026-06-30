'use strict';

const BottomSheet = (() => {
  let overlay, sheet, body;
  let startY, currentY;

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
  function field(label, id, value, type='text', placeholder='') {
    return `<div class="bs-edit-group"><label class="bs-edit-label" for="${id}">${label}</label><input id="${id}" class="bs-input" type="${type}" value="${(value||'').toString().replace(/"/g,'&quot;')}" placeholder="${placeholder}"></div>`;
  }
  function textarea(label, id, value, placeholder='') {
    return `<div class="bs-edit-group"><label class="bs-edit-label" for="${id}">${label}</label><textarea id="${id}" class="bs-textarea" rows="2" placeholder="${placeholder}">${value||''}</textarea></div>`;
  }
  function timeWithTz(timeId, tzId, timeVal, tzVal) {
    const tVal = /^\d{2}:\d{2}$/.test(timeVal||'') ? timeVal : '';
    const sel = ['EAT','MYT','UTC'].map(z =>
      `<option value="${z}" ${(tzVal||'EAT')===z?'selected':''}>${z}</option>`).join('');
    return `<div class="bs-edit-group">
      <label class="bs-edit-label" for="${timeId}">Time</label>
      <div class="bs-time-row">
        <input id="${timeId}" class="bs-input" type="time" value="${tVal}">
        <select id="${tzId}" class="bs-input bs-tz-sel">${sel}</select>
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

  /* ─── Stop view mode ─────────────────────────────────────── */
  function stopViewHTML(stop, day) {
    const stampCollected = false; // no stamps in Africa PWA
    const tIconKey = {plane:'plane',train:'train',bus:'bus',walk:'walk',boat:'boat',cable:'cable'}[stop.transportType] || 'walk';
    let transportBlock = '';
    if (stop.transport || stop.trainDetail) {
      const rows = [];
      if (stop.transport) rows.push(`<div class="bs-transport-row">${Icons[tIconKey]('icon-sm')}<span>${stop.transport}</span></div>`);
      if (stop.trainDetail?.platform) rows.push(`<div class="bs-transport-row">${Icons.info('icon-sm')}<span>Platform ${stop.trainDetail.platform}</span></div>`);
      if (rows.length) transportBlock = `<div class="bs-transport-card"><p class="bs-transport-card-title">Transport</p>${rows.join('')}</div>`;
    }
    return `
      <div class="bs-detail">
        <div class="bs-tags">${day?`<span class="badge badge-open">${day.label}</span><span class="badge badge-open">${day.date}</span>`:''}<span class="badge ${statusCls[stop.booking.status]}">${statusLbl[stop.booking.status]}</span></div>
        <p class="bs-name">${stop.name}</p>
        <p class="bs-activity">${stop.activity||''}</p>
        ${transportBlock}
        <div class="bs-rows">
          ${detailRow(Icons.clock, stop.time ? `${stop.time}${stop.timeZone?' '+stop.timeZone:''}` : '')}
          ${detailRow(Icons.card, stop.booking?.ref ? 'Ref: '+stop.booking.ref : '')}
          ${detailRow(Icons.yen, stop.booking?.cost ? 'USD '+stop.booking.cost.toLocaleString() : '')}
          ${detailRow(Icons.info, stop.notes, 'style="color:var(--accent)"')}
        </div>
        <!-- no stamp section for Africa -->
        <div class="bs-actions">
          ${stop.booking.status!=='booked'?`<button class="btn btn-primary bs-full-btn" id="bs-book-btn">Mark as booked</button>`:`<button class="btn btn-ghost bs-full-btn" id="bs-unbook-btn">✓ Booked — unmark</button>`}
          <div class="bs-action-row"><button class="btn btn-ghost" id="bs-edit-btn">Edit stop</button><button class="btn btn-danger" id="bs-remove-btn">Remove</button></div>
        </div>
      </div>`;
  }

  /* ─── Stop edit mode ─────────────────────────────────────── */
  function stopEditHTML(stop, day) {
    const days = Data.getDays().map(d => ({ v:d.id, l:`${d.label} · ${d.date}` }));
    const transTypes = [{v:'plane',l:'Plane'},{v:'train',l:'Train'},{v:'bus',l:'Bus'},{v:'walk',l:'Walk'},{v:'boat',l:'Boat'},{v:'cable',l:'Cable car'}];
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
        ${field('Platform','e-platform',stop.trainDetail?.platform||'','text','e.g. Platform 2')}
        <div id="e-train-detail-block" class="bs-train-detail-block" style="display:${showTrain?'block':'none'};margin-top:var(--s2)">
          <label class="bs-edit-label">Train details (for JR cheat sheet)</label>
          <div style="display:flex;align-items:center;gap:var(--s3);margin-bottom:var(--s3)">
            <span style="font-size:var(--text-sm);color:var(--text-secondary)">Seat reservation required?</span>
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-left:auto">
              <input type="checkbox" id="e-seatres" ${stop.trainDetail?.seatReservation?'checked':''} style="accent-color:var(--accent);width:16px;height:16px">
              <span style="font-size:var(--text-sm)">Yes</span>
            </label>
          </div>
          ${field('Origin','e-origin',stop.trainDetail?.origin||'','text','e.g. Shin-Osaka')}
          ${field('Destination','e-destination',stop.trainDetail?.destination||'','text','e.g. Kii-Tanabe')}
          ${field('Arrive time','e-arrive',/^\d{2}:\d{2}$/.test(stop.trainDetail?.arriveTime||'')?stop.trainDetail.arriveTime:'','time')}
          <div class="bs-edit-group" style="display:flex;align-items:center;gap:var(--s3)">
            <label class="bs-edit-label" style="margin-bottom:0">Duration</label>
            <span id="e-duration-display" style="font-size:var(--text-sm);font-weight:500;color:var(--accent)">—</span>
            <input id="e-duration" type="hidden" value="${stop.trainDetail?.duration||''}">
          </div>
          ${field('Train number','e-trainno',stop.trainDetail?.trainNumber||'','text','e.g. Kuroshio 5')}
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
        ${field('Cost (\u00a5)','e-cost',stop.booking.cost||'','number','e.g. 18000')}
        ${field('Deadline','e-deadline',stop.booking.deadline||'','date')}
        ${textarea('Notes','e-notes',stop.notes||'','Reminders, tips\u2026')}
        <div class="bs-actions" style="margin-top:var(--s4)">
          <button class="btn btn-primary bs-full-btn" id="bs-save-btn">Save changes</button>
          <button class="btn btn-ghost bs-full-btn" id="bs-cancel-btn">Cancel</button>
        </div>
      </div>`;
  }
  function overnightHTML(day) {
    const o = Data.getOvernight(day.id) || {};
    return `
      <div class="bs-detail">
        <div class="bs-tags"><span class="badge badge-open">${day.label}</span><span class="badge badge-open">${day.date}</span></div>
        <p class="bs-name" style="margin-bottom:var(--s4)">${Icons.moon('icon-sm')} Overnight stay</p>
        ${field('Accommodation name','o-name',o.name||'','text','e.g. Kiri-no-Sato Takahara Lodge')}
        ${select('Booking status','o-status',o.status||'open',statusOpts)}
        ${field('Booking reference','o-ref',o.ref||'','text','e.g. HTL-20270412')}
        ${field('Cost (USD)','o-cost',o.cost||'','number','e.g. 18000')}
        ${field('Book by (deadline)','o-deadline',o.deadline||'','date')}
        <div class="bs-actions" style="margin-top:var(--s4)">
          <button class="btn btn-primary bs-full-btn" id="o-save-btn">Save</button>
          <button class="btn btn-ghost bs-full-btn" id="o-cancel-btn">Cancel</button>
        </div>
      </div>`;
  }

  /* ─── Add stop form ──────────────────────────────────────── */
  function addHTML(dayId) {
    const day = Data.getDays().find(d => d.id === dayId);
    const days = Data.getDays().map(d => ({ v:d.id, l:`${d.label} · ${d.date}` }));
    const transTypes = [{v:'plane',l:'Plane'},{v:'train',l:'Train'},{v:'bus',l:'Bus'},{v:'walk',l:'Walk'},{v:'boat',l:'Boat'},{v:'cable',l:'Cable car'}];
    return `
      <div class="bs-detail">
        <p class="bs-name" style="margin-bottom:4px">Add stop</p>
        <p class="bs-activity" style="margin-bottom:var(--s4)">${day?day.label+' · '+day.date:''}</p>
        ${select('Day','a-day',dayId,days)}
        ${field('Stop name *','a-name','','text','e.g. Kumano Hongu Taisha')}
        ${textarea('Activity','a-activity','','What happens here?')}
        ${timeWithTz('a-time','a-tz','','EAT')}
        ${textarea('Transport to get here','a-transport','','e.g. On foot · 3.6 km')}
        ${select('Transport type','a-ttype','walk',transTypes)}
        <div id="a-train-detail-block" class="bs-train-detail-block" style="display:none;margin-top:var(--s2)">
          <label class="bs-edit-label">Train / service details (for JR cheat sheet)</label>
          <div style="display:flex;align-items:center;gap:var(--s3);margin-bottom:var(--s3)">
            <span style="font-size:var(--text-sm);color:var(--text-secondary)">Seat reservation required?</span>
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-left:auto">
              <input type="checkbox" id="a-seatres" style="accent-color:var(--accent);width:16px;height:16px">
              <span style="font-size:var(--text-sm)">Yes</span>
            </label>
          </div>
          ${field('Origin (boarding station)','a-origin','','text','e.g. Shin-Osaka')}
          ${field('Destination (alighting)','a-destination','','text','e.g. Kii-Tanabe')}
          ${field('Arrive time','a-arrive','','time')}
          <div class="bs-edit-group" style="display:flex;align-items:center;gap:var(--s3)">
            <label class="bs-edit-label" style="margin-bottom:0">Duration</label>
            <span id="a-duration-display" style="font-size:var(--text-sm);font-weight:500;color:var(--accent)">—</span>
            <input id="a-duration" type="hidden" value="">
          </div>
          ${field('Train number','a-trainno','','text','e.g. Kuroshio 5 or TBD')}
        </div>
        <p class="bs-section-head" style="margin-top:var(--s3)">Reservation</p>
        <div class="bs-edit-group" style="display:flex;align-items:center;gap:var(--s3)">
          <label class="bs-edit-label" style="margin-bottom:0">Needs booking?</label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-left:auto">
            <input type="checkbox" id="a-needsbook" style="accent-color:var(--accent);width:16px;height:16px">
            <span style="font-size:var(--text-sm)">Yes</span>
          </label>
        </div>
        ${select('Category','a-category','',[{v:'transport',l:'Transport'},{v:'activity',l:'Activity'}])}
        <div class="bs-actions" style="margin-top:var(--s4)">
          <button class="btn btn-primary bs-full-btn" id="bs-add-btn">Add stop</button>
          <button class="btn btn-ghost bs-full-btn" id="bs-addcancel-btn">Cancel</button>
        </div>
      </div>`;
  }

  /* ─── Duration auto-calculator ──────────────────────────── */
  function calcDuration(depart, arrive) {
    if (!depart || !arrive) return '';
    const toM = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
    let d = toM(depart), a = toM(arrive);
    if (a <= d) a += 1440; // overnight
    const diff = a - d;
    const h = Math.floor(diff/60), m = diff%60;
    return h && m ? h+'h '+m+'min' : h ? h+'h' : m+'min';
  }

  function wireAutoduration(departId, arriveId, displayId, hiddenId) {
    const update = () => {
      const d = body.querySelector('#'+departId)?.value;
      const a = body.querySelector('#'+arriveId)?.value;
      const calc = calcDuration(d, a);
      const disp = body.querySelector('#'+displayId);
      const hid  = body.querySelector('#'+hiddenId);
      if (disp) disp.textContent = calc || '—';
      if (hid)  hid.value = calc;
    };
    body.querySelector('#'+departId)?.addEventListener('change', update);
    body.querySelector('#'+arriveId)?.addEventListener('change', update);
    update();
  }

  /* ─── Wire: stop view ────────────────────────────────────── */
  function wireStopView(stop, day) {
    body.querySelector('#bs-book-btn,#bs-unbook-btn')?.addEventListener('click', async () => {
      const s = stop.booking.status !== 'booked' ? 'booked' : 'pending';
      await Data.updateStop(stop.id, { booking:{...stop.booking, status:s} });
      Toast.show(s==='booked'?`${stop.name} booked`:'Booking unmarked', s==='booked'?'success':'info');
      App.updateUrgentBadge(); close();
      window.ItineraryScreen?.refresh(); window.BookingsScreen?.refresh?.();
    });
    // Stamp collect button removed — no stamps in Africa PWA
    body.querySelector('#bs-edit-btn')?.addEventListener('click', () => { body.innerHTML=stopEditHTML(stop,day); wireStopEdit(stop,day); });
    body.querySelector('#bs-remove-btn')?.addEventListener('click', async () => {
      await Data.deleteStop(stop.id); Toast.show(`${stop.name} removed`,'warning'); close();
      window.ItineraryScreen?.refresh(); window.BookingsScreen?.refresh?.();
    });
  }

  /* ─── Wire: stop edit ────────────────────────────────────── */
  function wireStopEdit(stop, day) {
    const g = id => body.querySelector('#'+id)?.value?.trim()||'';
    // Dynamic show/hide of train detail block on type change (fix #5 for edit too)
    const editTType = body.querySelector('#e-ttype');
    function updateEditTrainBlock() {
      const type = editTType?.value || stop.transportType;
      const block = body.querySelector('.bs-train-detail-block');
      if (block) block.style.display = ['train','plane','boat'].includes(type) ? 'block' : 'none';
    }
    editTType?.addEventListener('change', updateEditTrainBlock);
    wireAutoduration('e-time', 'e-arrive', 'e-duration-display', 'e-duration');
    wireTimeInput('e-time');
    wireTimeInput('e-arrive');
    body.querySelector('#bs-save-btn')?.addEventListener('click', async () => {
      const hasTrain = ['train','plane','boat'].includes(g('e-ttype')||stop.transportType);
      const patch = {
        name:          g('e-name')||stop.name,
        activity:      g('e-activity'),
        time:          g('e-time'),
        timeZone:      body.querySelector('#e-tz')?.value || 'EAT',
        dayId:         g('e-day')||stop.dayId,
        transport:     g('e-transport'),
        transportType: g('e-ttype')||stop.transportType,
        notes:         g('e-notes'),
        needsBooking:  body.querySelector('#e-needsbook')?.checked || false,
        category:      g('e-category') || null,
        trainDetail: hasTrain ? {
          ...stop.trainDetail,
          platform:       g('e-platform'),
          seatReservation: body.querySelector('#e-seatres')?.checked || false,
          origin:         g('e-origin'),
          destination:    g('e-destination'),
          arriveTime:     body.querySelector('#e-arrive')?.value || '',
          trainNumber:    g('e-trainno'),
          duration:       body.querySelector('#e-duration')?.value || stop.trainDetail?.duration || '',
        } : stop.trainDetail,
        booking: { ...stop.booking, status:g('e-status')||stop.booking.status, ref:g('e-ref'), cost:parseInt(g('e-cost'))||null, deadline:g('e-deadline')||null },
      };
      await Data.updateStop(stop.id, patch);
      Toast.show('Stop updated','success'); App.updateUrgentBadge(); close();
      window.ItineraryScreen?.refresh(); window.BookingsScreen?.refresh?.();
    });
    body.querySelector('#bs-cancel-btn')?.addEventListener('click', () => { body.innerHTML=stopViewHTML(stop,day); wireStopView(stop,day); });
  }

  /* ─── Wire: overnight ────────────────────────────────────── */
  function wireOvernight(day) {
    const g = id => body.querySelector('#'+id)?.value?.trim()||'';
    body.querySelector('#o-save-btn')?.addEventListener('click', async () => {
      const patch = { name:g('o-name'), status:g('o-status')||'open', ref:g('o-ref'), cost:parseInt(g('o-cost'))||null, deadline:g('o-deadline')||null };
      await Data.updateOvernight(day.id, patch);
      Toast.show('Accommodation saved','success'); close();
      window.ItineraryScreen?.refresh(); window.BookingsScreen?.refresh?.();
    });
    body.querySelector('#o-cancel-btn')?.addEventListener('click', close);
  }

  /* ─── Wire: add stop ─────────────────────────────────────── */
  function wireAdd(dayId) {
    const g = id => body.querySelector('#'+id)?.value?.trim()||'';

    // Show/hide train detail block based on transport type (fix #5)
    const tTypeSelect = body.querySelector('#a-ttype');
    const trainBlock  = body.querySelector('#a-train-detail-block');
    function updateTrainBlock() {
      const type = tTypeSelect?.value;
      if (trainBlock) trainBlock.style.display = ['train','plane','boat'].includes(type) ? 'block' : 'none';
    }
    tTypeSelect?.addEventListener('change', updateTrainBlock);
    updateTrainBlock(); // run on open too
    wireAutoduration('a-time', 'a-arrive', 'a-duration-display', 'a-duration');
    wireTimeInput('a-time');
    wireTimeInput('a-arrive');

    body.querySelector('#bs-add-btn')?.addEventListener('click', async () => {
      const name = g('a-name');
      if (!name) { Toast.show('Stop name is required','warning'); return; }
      const tType = g('a-ttype') || 'walk';
      const hasTrainDetail = ['train','plane','boat'].includes(tType);
      const trainDetail = hasTrainDetail ? {
        seatReservation: body.querySelector('#a-seatres')?.checked || false,
        origin:      g('a-origin'),
        destination: g('a-destination'),
        arriveTime:  body.querySelector('#a-arrive')?.value || '',
        trainNumber: g('a-trainno'),
        duration:    body.querySelector('#a-duration')?.value || '',
      } : null;
      await Data.addStop({
        dayId: g('a-day')||dayId, name,
        activity: g('a-activity'), time: g('a-time'),
        timeZone: body.querySelector('#a-tz')?.value || 'EAT',
        transport: g('a-transport'), transportType: tType,
        trainDetail,
        needsBooking: body.querySelector('#a-needsbook')?.checked || false,
        category: g('a-category') || null,
      });
      Toast.show(`${name} added`,'success'); close();
      window.ItineraryScreen?.refresh(); window.BookingsScreen?.refresh?.();
    });
    body.querySelector('#bs-addcancel-btn')?.addEventListener('click', close);
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

  return { openStop, openOvernight, openAdd, close };
})();

window.BottomSheet = BottomSheet;
