'use strict';

/* ============================================================
   JOURNAL — magazine-style trip journal. Read view: centered trip
   title, each entry opens with a centered day heading, full-bleed
   hero photo, a large pull-quote pulled from the narration, quiet
   body text underneath, extra photos as a small inset row.

   Compose view: day tag (optional), multiple photos (first one
   added is the hero by default, tap another to promote it), plain
   narration textarea, tap a sentence below to set it as the
   pull-quote — defaults to the first sentence if none is picked.
   ============================================================ */

const JournalScreen = (() => {
  let root;
  let mode = 'read'; // 'read' | 'compose'
  let composePhotos = []; // [{ localKey, dataUrl, isHero }]
  let composeNarration = '';
  let composeQuoteIndex = 0; // index into split sentences
  let composeDayId = null;

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
        composePhotos.push({
          localKey: 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
          dataUrl,
          isHero: composePhotos.length === 0, // first photo added becomes hero by default
        });
      }
      input.remove();
      renderCompose();
    });
    input.click();
  }

  /* ── READ VIEW ────────────────────────────────────────────── */

  async function loadHeroUrl(entry) {
    const hero = (entry.journal_photos || []).find(p => p.is_hero) || (entry.journal_photos || [])[0];
    if (!hero) return null;
    return Data.getJournalPhotoUrl(hero);
  }

  function dayLabelFor(dayId) {
    if (!dayId) return null;
    const day = (Data.getDays?.() || []).find(d => d.id === dayId);
    return day ? (day.label || day.title || day.date) : null;
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
      block.style.cssText = 'margin-bottom:8px';
      const dayLabel = dayLabelFor(entry.day_id);
      const dateStr = new Date(entry.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' });

      block.innerHTML = `
        <div style="height:1px;background:#1C1A18;opacity:.08;margin:0 26px 30px"></div>
        <div id="hero-${entry.id}" style="width:100%;height:230px;background-size:cover;background-position:center;background-color:#EDE8DE;position:relative">
          <div style="position:absolute;bottom:14px;left:26px;right:26px;color:#fff;font-size:10px;letter-spacing:.03em;text-shadow:0 1px 6px rgba(0,0,0,.4)">${dayLabel ? dayLabel : dateStr}</div>
        </div>
        <div style="padding:26px 26px 8px">
          ${entry.pull_quote ? `<div style="font-family:Georgia,serif;font-size:20px;line-height:1.4;color:#1C1A18;margin-bottom:14px">"${entry.pull_quote}"</div>` : ''}
          <div style="font-size:13px;line-height:1.75;color:#6B6357">${(entry.narration||'').replace(/</g,'&lt;')}</div>
          <div id="inset-${entry.id}" style="display:flex;gap:8px;margin-top:18px"></div>
        </div>`;
      page.appendChild(block);

      loadHeroUrl(entry).then(url => {
        const el = page.querySelector(`#hero-${entry.id}`);
        if (el && url) el.style.backgroundImage = `url(${url})`;
      });

      const others = (entry.journal_photos || []).filter(p => !p.is_hero);
      if (others.length) {
        Promise.all(others.map(p => Data.getJournalPhotoUrl(p))).then(urls => {
          const insetEl = page.querySelector(`#inset-${entry.id}`);
          if (!insetEl) return;
          urls.forEach(u => {
            if (!u) return;
            const d = document.createElement('div');
            d.style.cssText = `flex:1;height:100px;border-radius:2px;background-size:cover;background-position:center;background-image:url(${u})`;
            insetEl.appendChild(d);
          });
        });
      }

      // Tap the block (outside the text) to open entry for editing? Keep v1 simple — no edit yet, just read.
    }

    const addRow = document.createElement('div');
    addRow.style.cssText = 'padding:20px 26px 40px;text-align:center';
    addRow.innerHTML = `<button id="j-new-btn" style="border:none;background:#C84B35;color:#fff;font-size:13px;font-weight:700;padding:12px 22px;border-radius:100px;cursor:pointer;font-family:var(--font)">+ New Entry</button>`;
    page.appendChild(addRow);

    root.appendChild(page);
    page.querySelector('#j-new-btn')?.addEventListener('click', () => {
      composePhotos = [];
      composeNarration = '';
      composeQuoteIndex = 0;
      composeDayId = null;
      mode = 'compose';
      render();
    });
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

    wrap.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #E4DECE">
        <div id="j-cancel" style="font-size:12px;color:#A39A8C;cursor:pointer">Cancel</div>
        <div style="font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#A39A8C">New Entry</div>
        <div id="j-save" style="font-size:12px;font-weight:700;color:#C84B35;cursor:pointer">Save</div>
      </div>

      <div style="padding:18px 20px">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#A39A8C;margin-bottom:10px">Day (optional)</div>
        <div id="j-day-pills" style="display:flex;gap:6px;overflow-x:auto"></div>
      </div>

      <div style="padding:18px 20px">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#A39A8C;margin-bottom:10px">Photos</div>
        <div id="j-photo-row" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:2px"></div>
        <div style="font-size:9.5px;color:#A39A8C;margin-top:8px;line-height:1.4">Tap a photo to make it the hero image · tap + to add more</div>
      </div>

      <div style="padding:18px 20px">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#A39A8C;margin-bottom:10px">What happened?</div>
        <textarea id="j-narration" rows="6" placeholder="Write whatever you want to remember…" style="width:100%;font-family:Georgia,serif;font-size:15px;line-height:1.7;color:#1C1A18;border:1px solid #E4DECE;border-radius:8px;padding:12px;background:#fff">${composeNarration}</textarea>
        <div id="j-sentence-picker" style="margin-top:14px"></div>
      </div>

      <div style="padding:0 20px 30px">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#A39A8C;margin:8px 0 8px">Preview — pull-quote</div>
        <div id="j-quote-preview" style="font-family:Georgia,serif;font-size:19px;line-height:1.4;color:#1C1A18;padding:14px 16px;border-left:3px solid #C84B35;background:#F1EDE5">${currentQuote ? '"'+currentQuote+'"' : '—'}</div>
      </div>`;

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
    composePhotos.forEach(p => {
      const thumb = document.createElement('div');
      thumb.style.cssText = `position:relative;flex-shrink:0;width:76px;height:76px;border-radius:6px;background-size:cover;background-position:center;background-image:url(${p.dataUrl});cursor:pointer`;
      if (p.isHero) {
        thumb.innerHTML = `<div style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,.55);color:#fff;font-size:8px;font-weight:700;letter-spacing:.04em;padding:2px 6px;border-radius:4px;text-transform:uppercase">Hero</div>`;
      }
      thumb.addEventListener('click', () => {
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
  }

  async function saveEntry() {
    const text = composeNarration.trim();
    if (!text && !composePhotos.length) { Toast.show('Write something or add a photo first', 'warning'); return; }
    const sentences = splitSentences(text);
    const quote = sentences[Math.min(composeQuoteIndex, Math.max(sentences.length-1,0))] || sentences[0] || '';

    Toast.show('Saving entry…', 'info');
    const entry = await Data.addJournalEntry({ dayId: composeDayId, narration: text, pullQuote: quote });
    for (const p of composePhotos) {
      await Data.addJournalPhoto(entry.id, p.dataUrl, { isHero: p.isHero });
    }
    Toast.show('Entry saved', 'success');
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
