'use strict';

const DexScreen = (() => {
  let root;
  let activeFilter = 'all'; // all | big5 | caught | uncaught

  const TIER_COLOR = {
    common:    'var(--seg-kenya)',
    rare:      'var(--accent)',
    legendary: '#B8860B',
  };
  const TIER_LABEL = { common: 'Common', rare: 'Rare', legendary: 'Legendary' };

  /* ── Header progress bar ─────────────────────────────────── */
  function renderHeader() {
    const p = Data.getDexProgress();
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:var(--s4);border-bottom:1.5px solid var(--border);background:var(--surface)';

    const pct = Math.round((p.caught / p.total) * 100);
    wrap.innerHTML = `
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">
        <p style="font-size:var(--text-lg);font-weight:500;color:var(--text-primary)">🦁 Safari Dex</p>
        <p style="font-size:var(--text-sm);font-weight:500;color:var(--accent)">${p.caught}/${p.total} caught</p>
      </div>
      <div style="height:8px;background:var(--border);border-radius:var(--r-pill);overflow:hidden">
        <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:var(--r-pill);transition:width .4s"></div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:10px">
        <span style="font-size:var(--text-xs);color:var(--text-muted)">Big Five:</span>
        <span style="font-size:var(--text-xs);font-weight:500;color:${p.big5Complete ? 'var(--success-text)' : 'var(--text-secondary)'}">${p.big5Caught}/${p.big5Total} ${p.big5Complete ? '🏆 Complete!' : ''}</span>
      </div>`;
    return wrap;
  }

  /* ── Filter pills ─────────────────────────────────────────── */
  function renderFilters() {
    const bar = document.createElement('div');
    bar.className = 'pill-bar';
    bar.style.cssText = 'padding:var(--s3) var(--s4);display:flex;gap:var(--s2);overflow-x:auto';
    [['all','All'],['big5','Big Five'],['caught','Caught'],['uncaught','Not yet']].forEach(([id, label]) => {
      const btn = document.createElement('button');
      btn.className = `pill ${activeFilter === id ? 'active' : ''}`;
      btn.textContent = label;
      btn.addEventListener('click', () => { activeFilter = id; render(); });
      bar.appendChild(btn);
    });
    return bar;
  }

  /* ── Animal card (grid item) ──────────────────────────────── */
  function animalCard(animal) {
    const caught = Data.isCaught(animal.id);
    const tierColor = TIER_COLOR[animal.tier];

    const card = document.createElement('div');
    card.style.cssText = `
      position:relative; aspect-ratio:1; border-radius:var(--r-lg);
      border:2px solid ${caught ? tierColor : 'var(--border)'};
      background:${caught ? 'var(--surface)' : 'var(--surface-raised)'};
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:4px; cursor:pointer; transition:transform .15s; overflow:hidden;
    `;
    card.addEventListener('touchstart', () => card.style.transform = 'scale(0.96)', { passive: true });
    card.addEventListener('touchend',   () => card.style.transform = '', { passive: true });

    const emojiSpan = document.createElement('span');
    emojiSpan.style.cssText = `font-size:32px; ${caught ? '' : 'filter:brightness(0) opacity(0.25);'}`;
    emojiSpan.textContent = animal.emoji;

    const nameP = document.createElement('p');
    nameP.style.cssText = `font-size:10px; font-weight:500; text-align:center; padding:0 4px; color:${caught ? 'var(--text-primary)' : 'var(--text-muted)'}`;
    nameP.textContent = caught ? animal.name : '???';

    card.appendChild(emojiSpan);
    card.appendChild(nameP);

    if (animal.big5) {
      const star = document.createElement('span');
      star.style.cssText = `position:absolute; top:4px; right:4px; font-size:10px;`;
      star.textContent = '⭐';
      card.appendChild(star);
    }

    if (caught) {
      const state = Data.getDexState()[animal.id];
      const count = state?.photoIds?.length || 0;
      if (count > 0) {
        const badge = document.createElement('span');
        badge.style.cssText = `position:absolute; bottom:4px; right:4px; font-size:9px; font-weight:500; background:${tierColor}; color:#fff; border-radius:var(--r-pill); padding:1px 5px;`;
        badge.textContent = `📷 ${count}`;
        card.appendChild(badge);
      }
    }

    card.addEventListener('click', () => openDetail(animal));
    return card;
  }

  /* ── Grid ─────────────────────────────────────────────────── */
  function renderGrid() {
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; padding:0 var(--s4) var(--s6)';

    let animals = Data.getAnimals();
    if (activeFilter === 'big5')      animals = animals.filter(a => a.big5);
    if (activeFilter === 'caught')    animals = animals.filter(a => Data.isCaught(a.id));
    if (activeFilter === 'uncaught')  animals = animals.filter(a => !Data.isCaught(a.id));

    if (!animals.length) {
      const empty = document.createElement('p');
      empty.style.cssText = 'grid-column:1/-1; text-align:center; color:var(--text-muted); font-size:var(--text-sm); padding:var(--s6) 0';
      empty.textContent = 'Nothing here yet.';
      grid.appendChild(empty);
      return grid;
    }

    animals.forEach(a => grid.appendChild(animalCard(a)));
    return grid;
  }

  /* ── Detail sheet — opens on tap ─────────────────────────── */
  function openDetail(animal) {
    const caught = Data.isCaught(animal.id);
    const state = Data.getDexState()[animal.id];

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.5);display:flex;align-items:flex-end';

    const sheet = document.createElement('div');
    sheet.style.cssText = 'background:var(--bg);width:100%;max-height:85vh;border-radius:20px 20px 0 0;overflow-y:auto;padding-bottom:env(safe-area-inset-bottom)';

    const tierColor = TIER_COLOR[animal.tier];

    sheet.innerHTML = `
      <div style="display:flex;justify-content:center;padding:8px 0 0"><div style="width:36px;height:4px;background:var(--border);border-radius:2px"></div></div>
      <div style="padding:var(--s4)">
        <div style="display:flex;align-items:center;gap:var(--s3);margin-bottom:var(--s3)">
          <span style="font-size:48px;${caught ? '' : 'filter:brightness(0) opacity(0.25);'}">${animal.emoji}</span>
          <div>
            <p style="font-size:var(--text-lg);font-weight:500;color:var(--text-primary)">${caught ? animal.name : '???'}</p>
            <span style="display:inline-flex;align-items:center;font-size:10px;font-weight:500;color:#fff;background:${tierColor};border-radius:var(--r-pill);padding:2px 8px;margin-top:4px">${TIER_LABEL[animal.tier]}${animal.big5 ? ' · Big Five ⭐' : ''}</span>
          </div>
        </div>
        ${caught ? `<p style="font-size:var(--text-sm);color:var(--text-secondary);line-height:1.5;margin-bottom:var(--s3)">${animal.fact}</p>` : `<p style="font-size:var(--text-sm);color:var(--text-muted);font-style:italic;margin-bottom:var(--s3)">Not caught yet — spot one in the wild and mark it here!</p>`}
        ${caught && state?.note ? `<p style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--s3)">📍 ${state.note}</p>` : ''}
      </div>
      <div id="dex-photo-section" style="padding:0 var(--s4) var(--s4)"></div>
      <div style="padding:0 var(--s4) var(--s5);display:flex;flex-direction:column;gap:var(--s2)">
        ${caught
          ? `<button id="dex-add-photo-btn" class="btn btn-primary bs-full-btn">📷 Add photo</button>
             <button id="dex-unmark-btn" class="btn btn-ghost bs-full-btn">Unmark as caught</button>`
          : `<button id="dex-catch-btn" class="btn btn-primary bs-full-btn">🎯 Mark as caught</button>`
        }
        <button id="dex-close-btn" class="btn btn-ghost bs-full-btn">Close</button>
      </div>`;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    function close() { overlay.remove(); }

    sheet.querySelector('#dex-close-btn').addEventListener('click', close);

    // Render attached photos
    async function renderPhotos() {
      const section = sheet.querySelector('#dex-photo-section');
      section.innerHTML = '';
      const ids = Data.getDexState()[animal.id]?.photoIds || [];
      if (!ids.length) return;

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px';
      for (const photoId of ids) {
        const dataUrl = await Data.getDexPhoto(photoId);
        if (!dataUrl) continue;
        const img = document.createElement('div');
        img.style.cssText = `aspect-ratio:1;border-radius:var(--r-md);overflow:hidden;position:relative;background:var(--surface-raised)`;
        img.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover" />`;
        const delBtn = document.createElement('button');
        delBtn.textContent = '×';
        delBtn.style.cssText = 'position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;font-size:14px;line-height:1;cursor:pointer';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await Data.removeDexPhoto(animal.id, photoId);
          renderPhotos();
        });
        img.appendChild(delBtn);
        img.addEventListener('click', () => openFullPhoto(dataUrl));
        grid.appendChild(img);
      }
      section.appendChild(grid);
    }
    if (caught) renderPhotos();

    function openFullPhoto(dataUrl) {
      const fullOverlay = document.createElement('div');
      fullOverlay.style.cssText = 'position:fixed;inset:0;z-index:300;background:#000;display:flex;align-items:center;justify-content:center';
      fullOverlay.innerHTML = `<img src="${dataUrl}" style="max-width:100%;max-height:100%;object-fit:contain" />`;
      fullOverlay.addEventListener('click', () => fullOverlay.remove());
      document.body.appendChild(fullOverlay);
    }

    // Mark as caught
    sheet.querySelector('#dex-catch-btn')?.addEventListener('click', async () => {
      await Data.markCaught(animal.id, {});
      Toast.show(`${animal.emoji} ${animal.name} caught!`, 'success');
      celebrateCatch(animal);
      close();
      render();
    });

    // Unmark
    sheet.querySelector('#dex-unmark-btn')?.addEventListener('click', async () => {
      await Data.unmarkCaught(animal.id);
      Toast.show(`${animal.name} unmarked`, 'warning');
      close();
      render();
    });

    // Add photo — opens native file picker (camera roll)
    sheet.querySelector('#dex-add-photo-btn')?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
      document.body.appendChild(input); // must be in DOM — iOS Safari blocks click() otherwise

      input.addEventListener('change', async () => {
        const files = Array.from(input.files || []);
        for (const file of files) {
          const dataUrl = await compressImage(file);
          await Data.addDexPhoto(animal.id, dataUrl);
        }
        if (files.length) Toast.show(`${files.length} photo${files.length>1?'s':''} added`, 'success');
        renderPhotos();
        render();
        input.remove();
      });

      input.click();
    });
  }

  /* ── Compress image before storing (keeps IndexedDB lean) ──── */
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

  /* ── Celebration on catch ─────────────────────────────────── */
  function celebrateCatch(animal) {
    if (navigator.vibrate) navigator.vibrate(animal.tier === 'legendary' ? [50,50,50,50,100] : [50]);

    const burst = document.createElement('div');
    burst.style.cssText = 'position:fixed;inset:0;z-index:400;display:flex;align-items:center;justify-content:center;pointer-events:none';
    burst.innerHTML = `<span style="font-size:80px;animation:dexPop .6s ease-out forwards">${animal.emoji}</span>`;
    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 700);

    const p = Data.getDexProgress();
    if (p.big5Complete && animal.big5) {
      setTimeout(() => {
        Toast.show('🏆 BIG FIVE COMPLETE! Incredible safari.', 'success');
      }, 800);
    }
  }

  /* ── Inject animation keyframes once ─────────────────────── */
  if (!document.getElementById('dex-anim-style')) {
    const style = document.createElement('style');
    style.id = 'dex-anim-style';
    style.textContent = `
      @keyframes dexPop {
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
    root.appendChild(renderFilters());
    root.appendChild(renderGrid());
  }

  return {
    init(el) { root = el; render(); },
    destroy() { root = null; },
    refresh() { render(); },
  };
})();

window.DexScreen = DexScreen;
