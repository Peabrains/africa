'use strict';

/* ============================================================
   PILGRIM STAMPS — Kumano Kodo 御朱印 stamp collection.
   Occupies the same bottom-nav slot Dex uses on Africa; the app
   shows whichever screen matches the active trip.
   Mirrors Dex's exact working pattern (local-first photo save,
   Storage upload, compression) — same proven approach, different
   content: stamps attach to specific itinerary stops, not a
   separate reference list.
   ============================================================ */

const StampsScreen = (() => {
  let root;

  /* ── Header progress bar ─────────────────────────────────── */
  function renderHeader() {
    const p = Data.getStampProgress();
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:var(--s4);border-bottom:1.5px solid var(--border);background:var(--surface)';

    const pct = p.total ? Math.round((p.collected / p.total) * 100) : 0;
    wrap.innerHTML = `
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">
        <p style="font-size:var(--text-lg);font-weight:500;color:var(--text-primary)">⛩️ Pilgrim Stamps</p>
        <p style="font-size:var(--text-sm);font-weight:500;color:var(--accent)">${p.collected}/${p.total} collected</p>
      </div>
      <div style="height:8px;background:var(--border);border-radius:var(--r-pill);overflow:hidden">
        <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:var(--r-pill);transition:width .4s"></div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:10px">
        <span style="font-size:var(--text-xs);color:var(--text-muted)">Kumano Sanzan:</span>
        <span style="font-size:var(--text-xs);font-weight:500;color:${p.sanzanComplete ? 'var(--success-text)' : 'var(--text-secondary)'}">${p.sanzanCollected}/${p.sanzanTotal} ${p.sanzanComplete ? '⛩️ Complete!' : ''}</span>
      </div>`;
    return wrap;
  }

  /* ── Stamp card (grid item) ───────────────────────────────── */
  function stampCard(stop) {
    const collected = Data.isStampCollected(stop.id);
    const day = Data.getDays().find(d => d.id === stop.dayId);

    const card = document.createElement('div');
    card.style.cssText = `
      position:relative; aspect-ratio:1; border-radius:var(--r-lg);
      border:2px solid ${collected ? 'var(--accent)' : 'var(--border)'};
      background:${collected ? 'var(--surface)' : 'var(--surface-raised)'};
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:4px; cursor:pointer; transition:transform .15s; overflow:hidden; padding:6px;
    `;
    card.addEventListener('touchstart', () => card.style.transform = 'scale(0.96)', { passive: true });
    card.addEventListener('touchend',   () => card.style.transform = '', { passive: true });

    const kanjiSpan = document.createElement('span');
    kanjiSpan.style.cssText = `font-size:26px; font-weight:600; ${collected ? 'color:var(--accent)' : 'color:var(--text-muted);opacity:.35'}`;
    kanjiSpan.textContent = stop.kanji || '⛩️';

    const nameP = document.createElement('p');
    nameP.style.cssText = `font-size:9px; font-weight:500; text-align:center; padding:0 2px; color:${collected ? 'var(--text-primary)' : 'var(--text-muted)'}`;
    nameP.textContent = stop.name;

    if (day) {
      const dayP = document.createElement('p');
      dayP.style.cssText = 'font-size:8px;color:var(--text-muted)';
      dayP.textContent = day.label;
      card.appendChild(dayP);
    }

    card.appendChild(kanjiSpan);
    card.appendChild(nameP);

    if (stop.isSanzan) {
      const star = document.createElement('span');
      star.style.cssText = `position:absolute; top:4px; right:4px; font-size:10px;`;
      star.textContent = '⭐';
      card.appendChild(star);
    }

    if (collected) {
      const state = Data.getStampState()[stop.id];
      const count = state?.photoIds?.length || 0;
      if (count > 0) {
        const badge = document.createElement('span');
        badge.style.cssText = `position:absolute; bottom:4px; right:4px; font-size:9px; font-weight:500; background:var(--accent); color:#fff; border-radius:var(--r-pill); padding:1px 5px;`;
        badge.textContent = `📷 ${count}`;
        card.appendChild(badge);
      }
    }

    card.addEventListener('click', () => openDetail(stop));
    return card;
  }

  /* ── Grid ─────────────────────────────────────────────────── */
  function renderGrid() {
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; padding:var(--s4) var(--s4) var(--s6)';

    const stops = Data.getStampStops();
    if (!stops.length) {
      const empty = document.createElement('p');
      empty.style.cssText = 'grid-column:1/-1; text-align:center; color:var(--text-muted); font-size:var(--text-sm); padding:var(--s6) 0';
      empty.textContent = 'No stamp stops on this trip yet.';
      grid.appendChild(empty);
      return grid;
    }

    stops.forEach(s => grid.appendChild(stampCard(s)));
    return grid;
  }

  /* ── Detail sheet — opens on tap ─────────────────────────── */
  function openDetail(stop) {
    const collected = Data.isStampCollected(stop.id);
    const state = Data.getStampState()[stop.id];

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.5);display:flex;align-items:flex-end';

    const sheet = document.createElement('div');
    sheet.style.cssText = 'background:var(--bg);width:100%;max-height:85vh;border-radius:20px 20px 0 0;overflow-y:auto;padding-bottom:env(safe-area-inset-bottom)';

    sheet.innerHTML = `
      <div style="display:flex;justify-content:center;padding:8px 0 0"><div style="width:36px;height:4px;background:var(--border);border-radius:2px"></div></div>
      <div style="padding:var(--s4)">
        <div style="display:flex;align-items:center;gap:var(--s3);margin-bottom:var(--s3)">
          <span style="font-size:40px;font-weight:600;${collected ? 'color:var(--accent)' : 'color:var(--text-muted);opacity:.35'}">${stop.kanji || '⛩️'}</span>
          <div>
            <p style="font-size:var(--text-lg);font-weight:500;color:var(--text-primary)">${stop.name}</p>
            ${stop.isSanzan ? `<span style="display:inline-flex;align-items:center;font-size:10px;font-weight:500;color:#fff;background:var(--accent);border-radius:var(--r-pill);padding:2px 8px;margin-top:4px">Kumano Sanzan ⭐</span>` : ''}
          </div>
        </div>
        ${collected ? `<p style="font-size:var(--text-sm);color:var(--text-secondary);line-height:1.5;margin-bottom:var(--s3)">Stamp collected.</p>` : `<p style="font-size:var(--text-sm);color:var(--text-muted);font-style:italic;margin-bottom:var(--s3)">Not collected yet — mark it here once you've got the ink stamp in your book.</p>`}
      </div>
      <div id="stamp-photo-section" style="padding:0 var(--s4) var(--s4)"></div>
      <div style="padding:0 var(--s4) var(--s5);display:flex;flex-direction:column;gap:var(--s2)">
        ${collected
          ? `<button id="stamp-add-photo-btn" class="btn btn-primary bs-full-btn">📷 Add photo</button>
             <button id="stamp-unmark-btn" class="btn btn-ghost bs-full-btn">Unmark as collected</button>`
          : `<button id="stamp-catch-btn" class="btn btn-primary bs-full-btn">⛩️ Mark as collected</button>`
        }
        <button id="stamp-close-btn" class="btn btn-ghost bs-full-btn">Close</button>
      </div>`;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    function close() { overlay.remove(); }

    sheet.querySelector('#stamp-close-btn').addEventListener('click', close);

    async function renderPhotos() {
      const section = sheet.querySelector('#stamp-photo-section');
      section.innerHTML = '';
      const ids = Data.getStampState()[stop.id]?.photoIds || [];
      if (!ids.length) return;

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px';
      for (const photoId of ids) {
        const dataUrl = await Data.getStampPhoto(photoId);
        if (!dataUrl) continue;
        const img = document.createElement('div');
        img.style.cssText = `aspect-ratio:1;border-radius:var(--r-md);overflow:hidden;position:relative;background:var(--surface-raised)`;
        img.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover" />`;
        const delBtn = document.createElement('button');
        delBtn.textContent = '×';
        delBtn.style.cssText = 'position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;font-size:14px;line-height:1;cursor:pointer';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await Data.removeStampPhoto(stop.id, photoId);
          renderPhotos();
        });
        img.appendChild(delBtn);
        img.addEventListener('click', () => openFullPhoto(dataUrl));
        grid.appendChild(img);
      }
      section.appendChild(grid);
    }
    if (collected) renderPhotos();

    function openFullPhoto(dataUrl) {
      const fullOverlay = document.createElement('div');
      fullOverlay.style.cssText = 'position:fixed;inset:0;z-index:300;background:#000;display:flex;align-items:center;justify-content:center';
      fullOverlay.innerHTML = `<img src="${dataUrl}" style="max-width:100%;max-height:100%;object-fit:contain" />`;
      fullOverlay.addEventListener('click', () => fullOverlay.remove());
      document.body.appendChild(fullOverlay);
    }

    sheet.querySelector('#stamp-catch-btn')?.addEventListener('click', async () => {
      await Data.markStampCollected(stop.id);
      Toast.show(`${stop.kanji || ''} ${stop.name} collected!`, 'success');
      celebrateCatch(stop);
      close();
      render();
    });

    sheet.querySelector('#stamp-unmark-btn')?.addEventListener('click', async () => {
      await Data.unmarkStampCollected(stop.id);
      Toast.show(`${stop.name} unmarked`, 'warning');
      close();
      render();
    });

    sheet.querySelector('#stamp-add-photo-btn')?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
      document.body.appendChild(input);

      input.addEventListener('change', async () => {
        const files = Array.from(input.files || []);
        for (const file of files) {
          const dataUrl = await compressImage(file);
          await Data.addStampPhoto(stop.id, dataUrl);
        }
        if (files.length) Toast.show(`${files.length} photo${files.length>1?'s':''} added`, 'success');
        renderPhotos();
        render();
        input.remove();
      });

      input.click();
    });
  }

  /* ── Compress image before storing ───────────────────────── */
  function compressImage(file, maxWidth = 1200, quality = 0.75) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ── Celebration on collect ───────────────────────────────── */
  function celebrateCatch(stop) {
    if (navigator.vibrate) navigator.vibrate(stop.isSanzan ? [50,50,50,50,100] : [50]);

    const burst = document.createElement('div');
    burst.style.cssText = 'position:fixed;inset:0;z-index:400;display:flex;align-items:center;justify-content:center;pointer-events:none';
    burst.innerHTML = `<span style="font-size:80px;font-weight:600;color:var(--accent);animation:stampPop .6s ease-out forwards">${stop.kanji || '⛩️'}</span>`;
    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 700);

    const p = Data.getStampProgress();
    if (p.sanzanComplete && stop.isSanzan) {
      setTimeout(() => {
        Toast.show('⛩️ KUMANO SANZAN COMPLETE! All three grand shrines.', 'success');
      }, 800);
    }
  }

  if (!document.getElementById('stamp-anim-style')) {
    const style = document.createElement('style');
    style.id = 'stamp-anim-style';
    style.textContent = `
      @keyframes stampPop {
        0%   { transform: scale(0.3); opacity: 0; }
        50%  { transform: scale(1.3); opacity: 1; }
        100% { transform: scale(1);   opacity: 0; }
      }`;
    document.head.appendChild(style);
  }

  /* ── Main render ──────────────────────────────────────────── */
  function render() {
    if (!root) return;
    root.innerHTML = '';
    root.appendChild(renderHeader());
    root.appendChild(renderGrid());
  }

  return {
    init(el) { root = el; render(); },
    destroy() { root = null; },
    refresh() { render(); },
  };
})();

window.StampsScreen = StampsScreen;
