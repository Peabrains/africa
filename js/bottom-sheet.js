'use strict';

const BottomSheet = (() => {
  let overlay, sheet, body;
  let startY, currentY;

  // Trip-aware default timezone — extend this map as new trips are added,
  // rather than the old binary JPY/else-EAT assumption which silently
  // broke for any third trip currency (e.g. THB).
  const CURRENCY_TZ = { JPY: 'JST', THB: 'ICT' };
  function defaultTripTz() {
    return CURRENCY_TZ[Data.getTripCurrency?.()] || 'EAT';
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
    const defaultTz = tzVal || defaultTripTz();
    const sel = ['EAT','JST','MYT','UTC'].map(z =>
      `<option value="${z}" ${defaultTz===z?'selected':''}>${z}</option>`).join('');
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
      ${field(isPlane?'Arrival airport':'Destination','e-destination',td.destination||'','text',isPlane?'e.g. JRO':'e.g. Kii-Tanabe')}
      ${field('Arrive time','e-arrive',/^\d{2}:\d{2}$/.test(td.arriveTime||'')?td.arriveTime:'','time')}
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
      ${field(isPlane?'Arrival airport':'Destination (alighting)','a-destination',td.destination||'','text',isPlane?'e.g. JRO':'e.g. Kii-Tanabe')}
      ${field('Arrive time','a-arrive',td.arriveTime||'','time')}
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
        ${field('Cost (\u00a5)','e-cost',stop.booking.cost||'','number','e.g. 18000')}
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
        <div class="bs-tags"><span class="badge badge-open">${day.label}</span><span class="badge badge-open">${day.date}</span></div>
        <p class="bs-name" style="margin-bottom:var(--s4)">${Icons.moon('icon-sm')} Overnight stay</p>
        ${field('Accommodation name','o-name',o.name||'','text','e.g. Kiri-no-Sato Takahara Lodge')}
        ${select('Booking status','o-status',o.status||'open',statusOpts)}
        ${field('Booking reference','o-ref',o.ref||'','text','e.g. HTL-20270412')}
        ${field(`Cost (${Data.getTripCurrency?.() || 'USD'})`,'o-cost',o.cost||'','number','e.g. 18000')}
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
          ${field(`Cost (${Data.getTripCurrency?.() || 'USD'})`,'o-lf-cost',lf.cost||'','number','e.g. 2000')}
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
    const days = Data.getDays().map(d => ({ v:d.id, l:`${d.label} · ${d.date}` }));
    const transTypes = [{v:'plane',l:'Plane'},{v:'train',l:'Train'},{v:'bus',l:'Bus'},{v:'walk',l:'Walk'},{v:'boat',l:'Boat'},{v:'cable',l:'Cable car'}];
    return `
      <div class="bs-detail">
        <p class="bs-name" style="margin-bottom:4px">Add stop</p>
        <p class="bs-activity" style="margin-bottom:var(--s4)">${day?day.label+' · '+day.date:''}</p>
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
        wireAutoduration('e-time', 'e-arrive', 'e-duration-display', 'e-duration');
        wireTimeInput('e-arrive');
      }
    }
    editTType?.addEventListener('change', rerenderTrainBlock);
    wireAutoduration('e-time', 'e-arrive', 'e-duration-display', 'e-duration');
    wireTimeInput('e-time');
    wireTimeInput('e-arrive');
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
          origin:         g('e-origin'),
          destination:    g('e-destination'),
          arriveTime:     body.querySelector('#e-arrive')?.value || '',
          trainNumber:    numberField,
          duration:       body.querySelector('#e-duration')?.value || stop.trainDetail?.duration || '',
        } : stop.trainDetail,
        booking: { ...stop.booking, status:g('e-status'), ref:g('e-ref'), cost:parseInt(g('e-cost'))||null, deadline:g('e-deadline')||null },
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
  function wireOvernight(day) {
    const g = id => body.querySelector('#'+id)?.value?.trim()||'';

    const lfToggle = body.querySelector('#o-lf-toggle');
    const lfFields = body.querySelector('#o-lf-fields');
    lfToggle?.addEventListener('change', () => {
      lfFields.style.display = lfToggle.checked ? 'flex' : 'none';
    });

    body.querySelector('#o-save-btn')?.addEventListener('click', async () => {
      const patch = { name:g('o-name'), status:g('o-status')||'open', ref:g('o-ref'), cost:parseInt(g('o-cost'))||null, deadline:g('o-deadline')||null };
      patch.luggage_forwarding = lfToggle?.checked ? {
        enabled:  true,
        from:     g('o-lf-from'),
        to:       g('o-lf-to'),
        cutoff:   g('o-lf-cutoff'),
        pickup:   g('o-lf-pickup'),
        courier:  g('o-lf-courier'),
        cost:     parseInt(g('o-lf-cost'))||null,
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
        wireAutoduration('a-time', 'a-arrive', 'a-duration-display', 'a-duration');
        wireTimeInput('a-arrive');
      }
    }
    tTypeSelect?.addEventListener('change', updateTrainBlock);
    updateTrainBlock(); // build correct initial content (hidden, since default type is 'walk')
    wireTimeInput('a-time');

    body.querySelector('#bs-add-btn')?.addEventListener('click', async () => {
      const name = g('a-name');
      if (!name) { Toast.show('Stop name is required','warning'); return; }
      const tType = g('a-ttype') || 'walk';
      const hasTrainDetail = ['train','plane','boat'].includes(tType);
      const isPlane = tType === 'plane';
      const numberField = g('a-trainno');
      const trainDetail = hasTrainDetail ? {
        ...(isPlane ? {} : { seatReservation: body.querySelector('#a-seatres')?.checked || false }),
        origin:      g('a-origin'),
        destination: g('a-destination'),
        arriveTime:  body.querySelector('#a-arrive')?.value || '',
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
        <div class="bs-tags"><span class="badge badge-open">${day.label}</span><span class="badge badge-open">${day.date}</span></div>
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
          if (contents.expenseCount > 0) parts.push(`${contents.expenseCount} expense${contents.expenseCount>1?'s':''} ($${Math.round(contents.expenseTotal)})`);
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

  return { openStop, openOvernight, openAdd, openDay, openAddDay, close };
})();

window.BottomSheet = BottomSheet;
