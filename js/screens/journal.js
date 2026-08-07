'use strict';

/* ============================================================
   JOURNAL — magazine-style trip journal. Read view: centered trip
   title, each entry opens with a hero photo (sized landscape or
   portrait depending on the photo's own orientation, not one
   fixed box for everything), a pull-quote, quiet body text, and
   any extra photos arranged in a fixed collage template chosen by
   how many there are (1/2/3/4+ each get their own layout, rather
   than an equal-width row that mangles anything non-landscape).

   Compose view handles both new entries and editing existing ones
   — same form either way, pre-filled when editing, with delete
   available via the same tap-twice-to-confirm pattern used for
   deleting a trip on Home.
   ============================================================ */

const JournalScreen = (() => {
  let root;
  let mode = 'read'; // 'read' | 'compose'
  let composePhotos = []; // [{ localKey?, id?, dataUrl, isHero, removed? }] — id present only for existing (already-saved) photos
  let composeNarration = '';
  let composeQuoteIndex = 0;
  let composeDayId = null;
  let editingEntryId = null; // null = new entry, else editing this entry's id

  function splitSentences(text) {
    if (!text) return [];
    return (text.match(/[^.!?]+[.!?]*/g) || []).map(s => s.trim()).filter(Boolean);
  }

  function compressImage(file, maxWidth = 1400, quality = 0.78) {
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

  // Resolves once we know if an (already-loaded, e.g. via URL) image is
  // landscape or portrait — used to pick which fixed-size box to use,
  // rather than one box for every photo regardless of its own shape.
  function getOrientation(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth >= img.naturalHeight ? 'landscape' : 'portrait');
      img.onerror = () => resolve('landscape');
      img.src = url;
    });
  }

  function pickPhotos() {
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
        const noVisiblePhotosYet = composePhotos.filter(p => !p.removed).length === 0;
        composePhotos.push({
          localKey: 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
          dataUrl,
          isHero: noVisiblePhotosYet,
        });
      }
      input.remove();
      renderCompose();
    });
    input.click();
  }

  /* ── READ VIEW ────────────────────────────────────────────── */

  const HERO_H = { landscape: 200, portrait: 340 };

  function dayLabelFor(dayId) {
    if (!dayId) return null;
    const day = (Data.getDays?.() || []).find(d => d.id === dayId);
    return day ? (day.label || day.title || day.date) : null;
  }

  // Fixed collage templates chosen by count — not a naive equal-width
  // row, since a row that assumes every photo is landscape mangles
  // anything portrait down to a thin sliver.
  function renderCollage(container, urls) {
    container.innerHTML = '';
    container.style.cssText = 'margin-top:18px';
    const n = urls.length;
    if (n === 0) return;

    if (n === 1) {
      container.style.cssText += ';display:block';
      const d = document.createElement('div');
      d.style.cssText = `width:100%;height:180px;border-radius:3px;background-size:cover;background-position:center;background-image:url(${urls[0]})`;
      container.appendChild(d);
      return;
    }
    if (n === 2) {
      container.style.cssText += ';display:flex;gap:8px';
      urls.forEach(u => {
        const d = document.createElement('div');
        d.style.cssText = `flex:1;aspect-ratio:1/1;border-radius:3px;background-size:cover;background-position:center;background-image:url(${u})`;
        container.appendChild(d);
      });
      return;
    }
    if (n === 3) {
      container.style.cssText += ';display:flex;gap:8px;height:160px';
      const big = document.createElement('div');
      big.style.cssText = `flex:1.5;border-radius:3px;background-size:cover;background-position:center;background-image:url(${urls[0]})`;
      const col = document.createElement('div');
      col.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:8px';
      [urls[1], urls[2]].forEach(u => {
        const d = document.createElement('div');
        d.style.cssText = `flex:1;border-radius:3px;background-size:cover;background-position:center;background-image:url(${u})`;
        col.appendChild(d);
      });
      container.appendChild(big);
      container.appendChild(col);
      return;
    }
    // 4 or more — 2x2 grid, extras beyond 4 show as a "+N" overlay on the last tile
    container.style.cssText += ';display:grid;grid-template-columns:1fr 1fr;gap:8px';
    urls.slice(0, 4).forEach((u, i) => {
      const d = document.createElement('div');
      d.style.cssText = `aspect-ratio:1/1;border-radius:3px;background-size:cover;background-position:center;background-image:url(${u});position:relative`;
      if (i === 3 && n > 4) {
        d.innerHTML = `<div style="position:absolute;inset:0;background:rgba(0,0,0,.5);border-radius:3px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;font-weight:700">+${n-4}</div>`;
      }
      container.appendChild(d);
    });
  }

  async function renderRead() {
    root.innerHTML = '';
    const trip = Data.getCurrentTrip?.();
    const page = document.createElement('div');
    page.style.cssText = 'background:#FAF8F4;min-height:100%';

    page.innerHTML = `
      <div style="padding:40px 26px 30px;text-align:center">
        <div style="font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#A39A8C">Trip Journal</div>
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;color:#1C1A18;margin-top:10px;line-height:1.15">${trip?.name || ''}</div>
        <div style="font-size:11px;color:#A39A8C;margin-top:8px">${(trip?.countries||[]).join(' · ')}</div>
      </div>`;

    const entries = Data.getJournalEntries();

    if (!entries.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:0 26px 40px;text-align:center;color:#A39A8C';
      empty.innerHTML = `<div style="font-family:Georgia,serif;font-style:italic;font-size:15px">Nothing written yet.</div>
        <div style="font-size:11px;margin-top:6px">Start your first entry below.</div>`;
      page.appendChild(empty);
    }

    for (const entry of entries) {
      const block = document.createElement('div');
      block.style.cssText = 'margin-bottom:8px;position:relative';
      const dayLabel = dayLabelFor(entry.day_id);
      const dateStr = new Date(entry.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' });

      block.innerHTML = `
        <div style="height:1px;background:#1C1A18;opacity:.08;margin:0 26px 30px"></div>
        <div id="hero-${entry.id}" style="width:100%;height:200px;background-size:cover;background-position:center;background-color:#EDE8DE;position:relative;transition:height .15s">
          <div style="position:absolute;bottom:14px;left:26px;right:26px;color:#fff;font-size:10px;letter-spacing:.03em;text-shadow:0 1px 6px rgba(0,0,0,.4)">${dayLabel ? dayLabel : dateStr}</div>
          <button class="j-edit-btn" data-entry="${entry.id}" style="position:absolute;top:14px;right:20px;width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,.4);border:none;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          </button>
        </div>
        <div style="padding:26px 26px 8px">
          ${entry.pull_quote ? `<div style="font-family:Georgia,serif;font-size:20px;line-height:1.4;color:#1C1A18;margin-bottom:14px">"${entry.pull_quote}"</div>` : ''}
          <div style="font-size:13px;line-height:1.75;color:#6B6357">${(entry.narration||'').replace(/</g,'&lt;')}</div>
          <div id="inset-${entry.id}"></div>
        </div>`;
      page.appendChild(block);

      const hero = (entry.journal_photos || []).find(p => p.is_hero) || (entry.journal_photos || [])[0];
      if (hero) {
        Data.getJournalPhotoUrl(hero).then(async (url) => {
          if (!url) return;
          const orientation = await getOrientation(url);
          const el = page.querySelector(`#hero-${entry.id}`);
          if (!el) return;
          el.style.backgroundImage = `url(${url})`;
          el.style.height = HERO_H[orientation] + 'px';
        });
      }

      const others = (entry.journal_photos || []).filter(p => !p.is_hero);
      if (others.length) {
        Promise.all(others.map(p => Data.getJournalPhotoUrl(p))).then(urls => {
          const insetEl = page.querySelector(`#inset-${entry.id}`);
          if (insetEl) renderCollage(insetEl, urls.filter(Boolean));
        });
      }
    }

    const addRow = document.createElement('div');
    addRow.style.cssText = 'padding:20px 26px 40px;text-align:center';
    addRow.innerHTML = `<button id="j-new-btn" style="border:none;background:#C84B35;color:#fff;font-size:13px;font-weight:700;padding:12px 22px;border-radius:100px;cursor:pointer;font-family:var(--font)">+ New Entry</button>`;
    page.appendChild(addRow);

    root.appendChild(page);

    page.querySelector('#j-new-btn')?.addEventListener('click', () => openComposer(null));
    page.querySelectorAll('.j-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openComposer(btn.dataset.entry);
      });
    });
  }

  /* ── Open composer, either blank or pre-filled for editing ──── */
  async function openComposer(entryId) {
    if (!entryId) {
      editingEntryId = null;
      composePhotos = [];
      composeNarration = '';
      composeQuoteIndex = 0;
      composeDayId = null;
      mode = 'compose';
      render();
      return;
    }
    const entry = Data.getJournalEntry(entryId);
    if (!entry) return;
    editingEntryId = entryId;
    composeDayId = entry.day_id || null;
    composeNarration = entry.narration || '';
    const sentences = splitSentences(composeNarration);
    const idx = sentences.findIndex(s => s === entry.pull_quote);
    composeQuoteIndex = idx >= 0 ? idx : 0;

    Toast.show('Loading entry…', 'info');
    const photos = entry.journal_photos || [];
    const urls = await Promise.all(photos.map(p => Data.getJournalPhotoUrl(p)));
    composePhotos = photos.map((p, i) => ({ id: p.id, dataUrl: urls[i], isHero: p.is_hero, removed: false }));

    mode = 'compose';
    render();
  }

  /* ── COMPOSE VIEW ─────────────────────────────────────────── */

  function renderCompose() {
    root.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#FAF8F4;min-height:100%';

    const days = Data.getDays?.() || [];
    const sentences = splitSentences(composeNarration);
    const quoteIdx = Math.min(composeQuoteIndex, Math.max(sentences.length - 1, 0));
    const currentQuote = sentences[quoteIdx] || sentences[0] || '';
    const visiblePhotos = composePhotos.filter(p => !p.removed);

    wrap.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #E4DECE">
        <div id="j-cancel" style="font-size:12px;color:#A39A8C;cursor:pointer">Cancel</div>
        <div style="font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#A39A8C">${editingEntryId ? 'Edit Entry' : 'New Entry'}</div>
        <div id="j-save" style="font-size:12px;font-weight:700;color:#C84B35;cursor:pointer">Save</div>
      </div>

      <div style="padding:18px 20px">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#A39A8C;margin-bottom:10px">Day (optional)</div>
        <div id="j-day-pills" style="display:flex;gap:6px;overflow-x:auto"></div>
      </div>

      <div style="padding:18px 20px">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#A39A8C;margin-bottom:10px">Photos</div>
        <div id="j-photo-row" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:2px"></div>
        <div style="font-size:9.5px;color:#A39A8C;margin-top:8px;line-height:1.4">Tap a photo to make it the hero image · tap × to remove · tap + to add more</div>
      </div>

      <div style="padding:18px 20px">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#A39A8C;margin-bottom:10px">What happened?</div>
        <textarea id="j-narration" rows="6" placeholder="Write whatever you want to remember…" style="width:100%;font-family:Georgia,serif;font-size:15px;line-height:1.7;color:#1C1A18;border:1px solid #E4DECE;border-radius:8px;padding:12px;background:#fff">${composeNarration}</textarea>
        <div id="j-sentence-picker" style="margin-top:14px"></div>
      </div>

      <div style="padding:0 20px 20px">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#A39A8C;margin:8px 0 8px">Preview — pull-quote</div>
        <div id="j-quote-preview" style="font-family:Georgia,serif;font-size:19px;line-height:1.4;color:#1C1A18;padding:14px 16px;border-left:3px solid #C84B35;background:#F1EDE5">${currentQuote ? '"'+currentQuote+'"' : '—'}</div>
      </div>

      ${editingEntryId ? `
      <div style="padding:10px 20px 40px">
        <button id="j-delete-btn" style="width:100%;border:1px solid #E4DECE;background:none;color:#A39A8C;font-size:12px;font-weight:600;padding:12px;border-radius:8px;cursor:pointer;font-family:var(--font)">Delete this entry</button>
      </div>` : ''}`;

    root.appendChild(wrap);

    // Day pills
    const dayPillWrap = wrap.querySelector('#j-day-pills');
    const noneOpt = document.createElement('div');
    noneOpt.textContent = 'No day';
    noneOpt.style.cssText = `flex-shrink:0;padding:6px 12px;border-radius:100px;font-size:11px;font-weight:600;cursor:pointer;background:${!composeDayId?'#C84B35':'#F1EDE5'};color:${!composeDayId?'#fff':'#6B6357'}`;
    noneOpt.addEventListener('click', () => { composeDayId = null; renderCompose(); });
    dayPillWrap.appendChild(noneOpt);
    days.forEach(d => {
      const pill = document.createElement('div');
      pill.textContent = d.label || d.title || d.date;
      const active = composeDayId === d.id;
      pill.style.cssText = `flex-shrink:0;padding:6px 12px;border-radius:100px;font-size:11px;font-weight:600;cursor:pointer;background:${active?'#C84B35':'#F1EDE5'};color:${active?'#fff':'#6B6357'}`;
      pill.addEventListener('click', () => { composeDayId = d.id; renderCompose(); });
      dayPillWrap.appendChild(pill);
    });

    // Photo row
    const photoRow = wrap.querySelector('#j-photo-row');
    visiblePhotos.forEach(p => {
      const thumb = document.createElement('div');
      thumb.style.cssText = `position:relative;flex-shrink:0;width:76px;height:76px;border-radius:6px;background-size:cover;background-position:center;background-image:url(${p.dataUrl});cursor:pointer`;
      if (p.isHero) {
        thumb.innerHTML += `<div style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,.55);color:#fff;font-size:8px;font-weight:700;letter-spacing:.04em;padding:2px 6px;border-radius:4px;text-transform:uppercase">Hero</div>`;
      }
      thumb.innerHTML += `<div class="j-photo-remove" style="position:absolute;top:4px;right:4px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center">×</div>`;
      thumb.addEventListener('click', (e) => {
        if (e.target.closest('.j-photo-remove')) {
          p.removed = true;
          if (p.isHero) {
            const next = composePhotos.find(x => !x.removed && x !== p);
            if (next) next.isHero = true;
          }
          renderCompose();
          return;
        }
        composePhotos.forEach(x => x.isHero = false);
        p.isHero = true;
        renderCompose();
      });
      photoRow.appendChild(thumb);
    });
    const addBtn = document.createElement('div');
    addBtn.textContent = '+';
    addBtn.style.cssText = 'flex-shrink:0;width:76px;height:76px;border-radius:6px;border:1.5px dashed #E4DECE;display:flex;align-items:center;justify-content:center;color:#A39A8C;font-size:22px;cursor:pointer';
    addBtn.addEventListener('click', pickPhotos);
    photoRow.appendChild(addBtn);

    // Narration + sentence picker
    const textarea = wrap.querySelector('#j-narration');
    const pickerEl = wrap.querySelector('#j-sentence-picker');
    function renderPicker() {
      const sents = splitSentences(textarea.value);
      if (!sents.length) { pickerEl.innerHTML = ''; return; }
      pickerEl.innerHTML = `<div style="font-size:9.5px;color:#A39A8C;margin-bottom:8px">Tap a sentence to use it as the pull-quote:</div>` +
        sents.map((s, i) => `<span data-i="${i}" style="cursor:pointer;font-size:12px;line-height:1.7;color:#1C1A18;${i===quoteIdx?'background:#FBEAE7;box-shadow:0 0 0 2px #FBEAE7':''}">${s} </span>`).join('');
      pickerEl.querySelectorAll('[data-i]').forEach(el => {
        el.addEventListener('click', () => {
          composeQuoteIndex = +el.dataset.i;
          composeNarration = textarea.value;
          renderCompose();
        });
      });
    }
    renderPicker();
    textarea.addEventListener('input', () => { composeNarration = textarea.value; renderPicker(); });

    wrap.querySelector('#j-cancel').addEventListener('click', () => { mode = 'read'; render(); });
    wrap.querySelector('#j-save').addEventListener('click', saveEntry);

    // Delete — same tap-twice-to-confirm pattern used for deleting a trip
    const delBtn = wrap.querySelector('#j-delete-btn');
    if (delBtn) {
      let armed = false, timer = null;
      delBtn.addEventListener('click', async () => {
        if (!armed) {
          armed = true;
          delBtn.textContent = 'Tap again to permanently delete';
          delBtn.style.color = 'var(--danger-text)';
          delBtn.style.borderColor = 'var(--danger-text)';
          timer = setTimeout(() => {
            armed = false;
            delBtn.textContent = 'Delete this entry';
            delBtn.style.color = '#A39A8C';
            delBtn.style.borderColor = '#E4DECE';
          }, 4000);
          return;
        }
        clearTimeout(timer);
        await Data.deleteJournalEntry(editingEntryId);
        Toast.show('Entry deleted', 'info');
        mode = 'read';
        render();
      });
    }
  }

  async function saveEntry() {
    const text = composeNarration.trim();
    const visiblePhotos = composePhotos.filter(p => !p.removed);
    if (!text && !visiblePhotos.length) { Toast.show('Write something or add a photo first', 'warning'); return; }
    const sentences = splitSentences(text);
    const quote = sentences[Math.min(composeQuoteIndex, Math.max(sentences.length-1,0))] || sentences[0] || '';

    Toast.show('Saving entry…', 'info');

    let entryId = editingEntryId;
    if (entryId) {
      await Data.updateJournalEntry(entryId, { dayId: composeDayId, narration: text, pullQuote: quote });
    } else {
      const entry = await Data.addJournalEntry({ dayId: composeDayId, narration: text, pullQuote: quote });
      entryId = entry.id;
    }

    // Removed existing photos
    for (const p of composePhotos.filter(p => p.removed && p.id)) {
      await Data.removeJournalPhoto(entryId, p.id);
    }
    // Brand new photos (no id yet)
    for (const p of visiblePhotos.filter(p => !p.id)) {
      await Data.addJournalPhoto(entryId, p.dataUrl, { isHero: p.isHero });
    }
    // If the current hero is an existing (already-saved) photo, make sure that's reflected
    const existingHero = visiblePhotos.find(p => p.id && p.isHero);
    if (existingHero) await Data.setJournalHeroPhoto(entryId, existingHero.id);

    Toast.show(editingEntryId ? 'Entry updated' : 'Entry saved', 'success');
    mode = 'read';
    render();
  }

  /* ── Main render ──────────────────────────────────────────── */
  function render() {
    if (!root) return;
    if (mode === 'compose') renderCompose();
    else renderRead();
  }

  return {
    init(el) { root = el; mode = 'read'; render(); },
    destroy() { root = null; },
    refresh() { render(); },
  };
})();

window.JournalScreen = JournalScreen;
