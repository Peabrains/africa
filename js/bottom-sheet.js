'use strict';

const BottomSheet = (() => {
  let overlay, sheet, body;
  let startY, currentY;

  function build() {
    overlay = document.createElement('div');
    Object.assign(overlay.style, { position:'fixed', inset:'0', background:'rgba(28,26,24,0.55)', zIndex:'200', opacity:'0', transition:'opacity 0.25s ease', display:'none' });
    overlay.addEventListener('click', close);

    sheet = document.createElement('div');
    Object.assign(sheet.style, { position:'fixed', left:'0', right:'0', bottom:'0', background:'var(--surface)', borderRadius:'20px 20px 0 0', borderTop:'1.5px solid var(--border)', zIndex:'201', transform:'translateY(100%)', transition:'transform 0.3s cubic-bezier(0.32,0.72,0,1)', maxHeight:'92vh', overflowY:'auto' });

    const handle = document.createElement('div');
    Object.assign(handle.style, { width:'44px', height:'4px', background:'var(--border)', borderRadius:'var(--r-pill)', margin:'12px auto 0' });

    body = document.createElement('div');
    sheet.appendChild(handle);
    sheet.appendChild(body);
    document.body.appendChild(overlay);
    document.body.appendChild(sheet);

    sheet.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive:true });
    sheet.addEventListener('touchmove', e => {
      currentY = e.touches[0].clientY;
      const dy = currentY - startY;
      if (dy > 0) { sheet.style.transition='none'; sheet.style.transform=`translateY(${dy}px)`; e.preventDefault(); }
    }, { passive:false });
    sheet.addEventListener('touchend', () => {
      sheet.style.transition = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)';
      if ((currentY - startY) > 90) close(); else sheet.style.transform = 'translateY(0)';
    }, { passive:true });
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
    const stampCollected = stop.hasStamp && Data.isStampCollected(stop.id);
    const tIconKey = {plane:'plane',train:'train',bus:'bus',walk:'walk',boat:'boat',cable:'cable'}[stop.transportType] || 'walk';
    let transportBlock = '';
    if (stop.transport || stop.trainDetail) {
      const rows = [];
      if (stop.transport) rows.push(`<div class="bs-transport-row">${Icons[tIconKey]('icon-sm')}<span>${stop.transport}</span></div>`);
      if (stop.trainDetail?.platform) rows.push(`<div class="bs-transport-row">${Icons.info('icon-sm')}<span>Platform ${stop.trainDetail.platform}</span></div>`);
      if (stop.trainDetail?.jrPass === false && stop.transportType === 'train') rows.push(`<div class="bs-transport-row">${Icons.card('icon-sm')}<span style="color:var(--warning-text)">NOT on JR Pass · buy separately</span></div>`);
      else if (stop.trainDetail?.jrPass && stop.transportType === 'train') rows.push(`<div class="bs-transport-row">${Icons.card('icon-sm')}<span>JR Pass ✓</span></div>`);
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
          ${detailRow(Icons.yen, stop.booking?.cost ? '¥'+stop.booking.cost.toLocaleString() : '')}
          ${detailRow(Icons.info, stop.notes, 'style="color:var(--accent)"')}
        </div>
        ${stop.hasStamp ? `<div class="bs-stamp-section"><div class="bs-stamp-circle ${stampCollected?'bs-stamp-circle--on':''}"><span class="bs-stamp-kanji">${stop.stampKanji}</span></div><div class="bs-stamp-info"><p class="bs-stamp-name">${stop.stampRomaji}${stop.isSanzan?` · Sanzan ${stop.sanzanNum}/3`:''}</p><p class="bs-stamp-status">${stampCollected?'✓ Collected':'Not yet collected'}</p></div><button class="btn ${stampCollected?'btn-ghost':'btn-primary'} bs-stamp-btn" id="bs-collect-btn">${stampCollected?'Uncollect':'Collect'}</button></div>` : ''}
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
    return `
      <div class="bs-detail">
        <p class="bs-name" style="margin-bottom:var(--s4)">Edit stop</p>
        <p class="bs-section-head">Details</p>
        ${field('Stop name','e-name',stop.name,'text','e.g. Takijiri-oji')}
        ${textarea('Activity','e-activity',stop.activity,'What happens here?')}
        ${field('Time','e-time',stop.time,'text','e.g. ~09:00')}
        ${select('Move to day','e-day',stop.dayId,days)}
        <p class="bs-section-head">Transport</p>
        ${textarea('Transport detail','e-transport',stop.transport,'e.g. JR Oito Line · ~40 min · JR Pass ✓')}
        ${select('Transport type','e-ttype',stop.transportType,transTypes)}
        ${field('Platform','e-platform',stop.trainDetail?.platform||'','text','e.g. Platform 2')}
        <p class="bs-section-head">Booking</p>
        ${select('Status','e-status',stop.booking.status,statusOpts)}
        ${field('Reference','e-ref',stop.booking.ref||'','text','e.g. HTL-20270412')}
        ${field('Cost (¥)','e-cost',stop.booking.cost||'','number','e.g. 18000')}
        ${field('Deadline','e-deadline',stop.booking.deadline||'','date')}
        ${textarea('Notes','e-notes',stop.notes||'','Reminders, tips…')}
        <div class="bs-actions" style="margin-top:var(--s4)">
          <button class="btn btn-primary bs-full-btn" id="bs-save-btn">Save changes</button>
          <button class="btn btn-ghost bs-full-btn" id="bs-cancel-btn">Cancel</button>
        </div>
      </div>`;
  }

  /* ─── Overnight view/edit mode ───────────────────────────── */
  function overnightHTML(day) {
    const o = Data.getOvernight(day.id) || {};
    return `
      <div class="bs-detail">
        <div class="bs-tags"><span class="badge badge-open">${day.label}</span><span class="badge badge-open">${day.date}</span></div>
        <p class="bs-name" style="margin-bottom:var(--s4)">${Icons.moon('icon-sm')} Overnight stay</p>
        ${field('Accommodation name','o-name',o.name||'','text','e.g. Kiri-no-Sato Takahara Lodge')}
        ${select('Booking status','o-status',o.status||'open',statusOpts)}
        ${field('Booking reference','o-ref',o.ref||'','text','e.g. HTL-20270412')}
        ${field('Cost per night (¥)','o-cost',o.cost||'','number','e.g. 18000')}
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
        ${field('Time','a-time','','text','e.g. ~10:00')}
        ${textarea('Transport to get here','a-transport','','e.g. On foot · 3.6 km')}
        ${select('Transport type','a-ttype','walk',transTypes)}
        <div class="bs-actions" style="margin-top:var(--s4)">
          <button class="btn btn-primary bs-full-btn" id="bs-add-btn">Add stop</button>
          <button class="btn btn-ghost bs-full-btn" id="bs-addcancel-btn">Cancel</button>
        </div>
      </div>`;
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
    body.querySelector('#bs-collect-btn')?.addEventListener('click', async () => {
      const now = await Data.toggleStamp(stop.id);
      const prog = Data.getStampProgress();
      if (prog.sanzanComplete && now && stop.isSanzan && stop.sanzanNum===3) Toast.show('三山達成 — Kumano Sanzan complete!','success');
      else Toast.show(now?`${stop.stampRomaji} collected`:'Stamp uncollected', now?'success':'info');
      App.renderStampBanner(); close(); window.ItineraryScreen?.refresh();
    });
    body.querySelector('#bs-edit-btn')?.addEventListener('click', () => { body.innerHTML=stopEditHTML(stop,day); wireStopEdit(stop,day); });
    body.querySelector('#bs-remove-btn')?.addEventListener('click', async () => {
      await Data.deleteStop(stop.id); Toast.show(`${stop.name} removed`,'warning'); close();
      window.ItineraryScreen?.refresh(); window.BookingsScreen?.refresh?.();
    });
  }

  /* ─── Wire: stop edit ────────────────────────────────────── */
  function wireStopEdit(stop, day) {
    const g = id => body.querySelector('#'+id)?.value?.trim()||'';
    body.querySelector('#bs-save-btn')?.addEventListener('click', async () => {
      const patch = {
        name:          g('e-name')||stop.name,
        activity:      g('e-activity'),
        time:          g('e-time'),
        dayId:         g('e-day')||stop.dayId,
        transport:     g('e-transport'),
        transportType: g('e-ttype')||stop.transportType,
        notes:         g('e-notes'),
        trainDetail:   {...stop.trainDetail, platform:g('e-platform')},
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
    body.querySelector('#bs-add-btn')?.addEventListener('click', async () => {
      const name = g('a-name');
      if (!name) { Toast.show('Stop name is required','warning'); return; }
      await Data.addStop({ dayId:g('a-day')||dayId, name, activity:g('a-activity'), time:g('a-time'), transport:g('a-transport'), transportType:g('a-ttype')||'walk' });
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
