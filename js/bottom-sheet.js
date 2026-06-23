'use strict';

const BottomSheet = (() => {
  let overlay, sheet, body;
  let startY, currentY;

  function build() {
    overlay = document.createElement('div');
    overlay.id = 'bs-overlay';
    Object.assign(overlay.style, {
      position:'fixed', inset:'0',
      background:'rgba(28,26,24,0.55)',
      zIndex:'200', opacity:'0',
      transition:'opacity 0.25s ease', display:'none',
    });
    overlay.addEventListener('click', close);

    sheet = document.createElement('div');
    sheet.id = 'bs-sheet';
    Object.assign(sheet.style, {
      position:'fixed', left:'0', right:'0', bottom:'0',
      background:'var(--surface)',
      borderRadius:'20px 20px 0 0',
      borderTop:'1.5px solid var(--border)',
      zIndex:'201',
      transform:'translateY(100%)',
      transition:'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
      maxHeight:'88vh', overflowY:'auto',
    });

    const handle = document.createElement('div');
    Object.assign(handle.style, {
      width:'44px', height:'4px', background:'var(--border)',
      borderRadius:'var(--r-pill)', margin:'12px auto 0',
    });

    body = document.createElement('div');
    body.id = 'bs-body';
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
      if ((currentY - startY) > 90) close();
      else sheet.style.transform = 'translateY(0)';
    }, { passive:true });
  }

  function showSheet() {
    overlay.style.display = 'block';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      sheet.style.transform = 'translateY(0)';
    }));
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!sheet) return;
    overlay.style.opacity = '0';
    sheet.style.transform = 'translateY(100%)';
    setTimeout(() => { overlay.style.display='none'; document.body.style.overflow=''; }, 300);
  }

  /* ─── Detail row helper ──────────────────────────────────── */
  function detailRow(iconFn, text, accentColor) {
    if (!text) return '';
    const color = accentColor ? `style="color:${accentColor}"` : '';
    return `
      <div class="bs-row">
        <span ${color}>${iconFn('icon-sm')}</span>
        <span ${color}>${text}</span>
      </div>`;
  }

  /* ─── Stop detail view ───────────────────────────────────── */
  function openStop(stop, day, editMode = false) {
    if (!overlay) build();
    body.innerHTML = '';

    const statusCls   = { booked:'badge-booked', pending:'badge-pending', urgent:'badge-urgent', open:'badge-open' };
    const statusLabel = { booked:'✓ Booked', pending:'Pending', urgent:'⚡ Urgent', open:'Open' };
    const stampCollected = stop.hasStamp && Data.isStampCollected(stop.id);

    if (editMode) {
      /* ── EDIT MODE ───────────────────────────────────────── */
      body.innerHTML = `
        <div class="bs-detail">
          <div class="bs-tags">
            ${day ? `<span class="badge badge-open">${day.label}</span>` : ''}
            <span class="badge ${statusCls[stop.booking.status]}">${statusLabel[stop.booking.status]}</span>
          </div>
          <p class="bs-name">${stop.name}</p>
          <div class="bs-edit-group">
            <label class="bs-edit-label">Notes</label>
            <textarea id="bs-notes" class="bs-textarea" rows="3" placeholder="Add notes…">${stop.notes || ''}</textarea>
          </div>
          <div class="bs-edit-group">
            <label class="bs-edit-label">Booking reference</label>
            <input id="bs-ref" class="bs-input" type="text" value="${stop.booking?.ref || ''}" placeholder="e.g. HTL-20270412">
          </div>
          <div class="bs-edit-group">
            <label class="bs-edit-label">Cost (¥)</label>
            <input id="bs-cost" class="bs-input" type="number" value="${stop.booking?.cost || ''}" placeholder="e.g. 18000">
          </div>
          <div class="bs-actions">
            <button class="btn btn-primary bs-full-btn" id="bs-save">Save changes</button>
            <button class="btn btn-ghost bs-full-btn" id="bs-cancel">Cancel</button>
          </div>
        </div>`;

      body.querySelector('#bs-save').addEventListener('click', async () => {
        const notes = body.querySelector('#bs-notes').value.trim();
        const ref   = body.querySelector('#bs-ref').value.trim();
        const cost  = parseInt(body.querySelector('#bs-cost').value) || null;
        await Data.updateStop(stop.id, { notes, booking: { ...stop.booking, ref, cost } });
        Toast.show('Changes saved', 'success');
        close();
        window.ItineraryScreen?.refresh();
        window.BookingsScreen?.refresh?.();
      });
      body.querySelector('#bs-cancel').addEventListener('click', () => openStop(stop, day));

    } else {
      /* ── VIEW MODE ───────────────────────────────────────── */
      const transportIconKey = {
        plane:'plane', train:'train', bus:'bus',
        walk:'walk', boat:'boat', cable:'cable',
      }[stop.transportType] || 'route';

      // Build transport block
      let transportBlock = '';
      if (stop.transport || stop.trainDetail) {
        const rows = [];
        if (stop.transport) {
          rows.push(`<div class="bs-transport-row">${Icons[transportIconKey]('icon-sm')}<span>${stop.transport}</span></div>`);
        }
        if (stop.trainDetail?.platform) {
          rows.push(`<div class="bs-transport-row">${Icons.info('icon-sm')}<span>Platform ${stop.trainDetail.platform}${stop.trainDetail.car ? ` · Car ${stop.trainDetail.car}` : ''}</span></div>`);
        }
        if (stop.trainDetail?.jrPass) {
          rows.push(`<div class="bs-transport-row">${Icons.card('icon-sm')}<span>JR Pass valid ✓</span></div>`);
        }
        if (rows.length) {
          transportBlock = `
            <div class="bs-transport-card">
              <p class="bs-transport-card-title">Transport</p>
              ${rows.join('')}
            </div>`;
        }
      }

      body.innerHTML = `
        <div class="bs-detail">
          <div class="bs-tags">
            ${day ? `<span class="badge badge-open">${day.label}</span>` : ''}
            ${day ? `<span class="badge badge-open">${day.date}</span>` : ''}
            <span class="badge ${statusCls[stop.booking.status]}">${statusLabel[stop.booking.status]}</span>
          </div>
          <p class="bs-name">${stop.name}</p>
          <p class="bs-activity">${stop.activity}</p>

          ${transportBlock}

          <div class="bs-rows">
            ${detailRow(Icons.clock, stop.time ? `${stop.time}${stop.timeZone ? ' ' + stop.timeZone : ''}` : '')}
            ${detailRow(Icons.moon, stop.accommodation)}
            ${detailRow(Icons.card, stop.booking?.ref ? `Ref: ${stop.booking.ref}` : '')}
            ${detailRow(Icons.yen, stop.booking?.cost ? `¥${stop.booking.cost.toLocaleString()}` : '')}
            ${detailRow(Icons.info, stop.notes, 'var(--accent)')}
          </div>

          ${stop.hasStamp ? `
            <div class="bs-stamp-section">
              <div class="bs-stamp-circle ${stampCollected ? 'bs-stamp-circle--on' : ''}">
                <span class="bs-stamp-kanji">${stop.stampKanji}</span>
              </div>
              <div class="bs-stamp-info">
                <p class="bs-stamp-name">${stop.stampRomaji}${stop.isSanzan ? ` · Sanzan ${stop.sanzanNum}/3` : ''}</p>
                <p class="bs-stamp-status">${stampCollected ? '✓ Collected' : 'Not yet collected'}</p>
              </div>
              <button class="btn ${stampCollected ? 'btn-ghost' : 'btn-primary'} bs-stamp-btn" id="bs-collect-btn">
                ${stampCollected ? 'Uncollect' : 'Collect'}
              </button>
            </div>` : ''}

          <div class="bs-actions">
            ${stop.booking.status !== 'booked'
              ? `<button class="btn btn-primary bs-full-btn" id="bs-book-btn">Mark as booked</button>`
              : `<button class="btn btn-ghost bs-full-btn" id="bs-unbook-btn">✓ Booked — unmark</button>`}
            <div class="bs-action-row">
              <button class="btn btn-ghost" id="bs-edit-btn">Edit</button>
              <button class="btn btn-danger" id="bs-remove-btn">Remove</button>
            </div>
          </div>
        </div>`;

      body.querySelector('#bs-book-btn,#bs-unbook-btn')?.addEventListener('click', async () => {
        const newStatus = stop.booking.status !== 'booked' ? 'booked' : 'pending';
        await Data.updateStop(stop.id, { booking: { ...stop.booking, status: newStatus } });
        Toast.show(newStatus === 'booked' ? `${stop.name} booked` : 'Booking unmarked', newStatus === 'booked' ? 'success' : 'info');
        App.updateUrgentBadge();
        close();
        window.ItineraryScreen?.refresh();
        window.BookingsScreen?.refresh?.();
      });

      body.querySelector('#bs-collect-btn')?.addEventListener('click', async () => {
        const now  = await Data.toggleStamp(stop.id);
        const prog = Data.getStampProgress();
        if (prog.sanzanComplete && now && stop.isSanzan && stop.sanzanNum === 3) {
          Toast.show('三山達成 — Kumano Sanzan complete!', 'success');
        } else {
          Toast.show(now ? `${stop.stampRomaji} stamp collected` : 'Stamp uncollected', now ? 'success' : 'info');
        }
        App.renderStampBanner();
        close();
        window.ItineraryScreen?.refresh();
      });

      body.querySelector('#bs-edit-btn')?.addEventListener('click', () => openStop(stop, day, true));
      body.querySelector('#bs-remove-btn')?.addEventListener('click', () => {
        Toast.show(`${stop.name} removed`, 'warning');
        close();
      });
    }

    showSheet();
  }

  return { openStop, close };
})();

window.BottomSheet = BottomSheet;
