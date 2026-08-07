'use strict';

/* ============================================================
   JOURNAL — magazine-style trip journal.

   Photos render as real <img loading="lazy"> elements, not CSS
   background-image on a separately-probed Image() — that used to
   mean every photo loaded twice (once to check orientation, once
   to actually display). One load now does both: orientation comes
   from the same <img>'s onload event, and loading="lazy" means
   photos below the fold don't fetch until they're scrolled near,
   which is the main real fix for lag on a journal with many entries.

   Each photo also carries its own focal_position (a 3x3-grid CSS
   object-position choice, set via the composer) so cropping isn't
   always dead-center regardless of what's actually in the photo.

   Compose view handles new + edit, with delete via the same
   tap-twice-to-confirm pattern used for deleting a trip on Home.
   Read view also offers a PDF export via the browser's native
   print-to-PDF, same technique already staged (but never wired up)
   for the Kit screen's print.css.
   ============================================================ */

const JournalScreen = (() => {
  let root;
  let mode = 'read'; // 'read' | 'compose'
  let composePhotos = []; // [{ localKey?, id?, dataUrl, isHero, focalPosition, removed? }]
  let composeNarration = '';
  let composeQuoteIndex = 0;
  let composeDayId = null;
  let editingEntryId = null;
  let focalPickerPhoto = null; // photo object currently open in the focal-point picker overlay

  function splitSentences(text) {
    if (!text) return [];
    return (text.match(/[^.!?]+[.!?]*/g) || []).map(s => s.trim()).filter(Boolean);
  }

  // Resized smaller than before (was 1400/0.78) — trades a little sharpness
  // for meaningfully smaller files and faster loads, on request.
  function compressImage(file, maxWidth = 1000, quality = 0.7) {
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
        const noVisiblePhotosYet = composePhotos.filter(p => !p.removed).length === 0;
        composePhotos.push({
          localKey: 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
          dataUrl,
          isHero: noVisiblePhotosYet,
          focalPosition: JSON.stringify({ x: 50, y: 50, zoom: 100 }),
        });
      }
      input.remove();
      renderCompose();
    });
    input.click();
  }

  /* ── READ VIEW ────────────────────────────────────────────── */

  const HERO_H = { landscape: 170, portrait: 260 };

  function dayLabelFor(dayId) {
    if (!dayId) return null;
    const day = (Data.getDays?.() || []).find(d => d.id === dayId);
    return day ? (day.label || day.title || day.date) : null;
  }

  // "09 Apr 2027" — the real calendar date of the tagged day if there is
  // one, otherwise the date the entry was actually written.
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr.length <= 10 ? dateStr + 'T00:00:00' : dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function dateLabelFor(entry) {
    if (entry.day_id) {
      const day = (Data.getDays?.() || []).find(d => d.id === entry.day_id);
      if (day?.date) return formatDate(day.date);
    }
    return formatDate(entry.created_at);
  }

  // Lightweight markdown — **bold** and *italic* only, no toolbar,
  // just a typed convention with a hint shown in the composer. Order
  // matters: bold's ** pattern must be matched before italic's single
  // *, or the italic regex would partially consume a bold marker first.
  function renderMarkdownLite(text) {
    if (!text) return '';
    let out = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    out = out.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
    return out;
  }
  // Same markers stripped to plain text — used for the canvas export,
  // which draws plain characters rather than HTML, so bold/italic
  // styling doesn't carry over there, but the raw ** / * markers are
  // removed rather than showing up literally in the exported image.
  function stripMarkdown(text) {
    if (!text) return '';
    return text.replace(/\*\*([^\*]+)\*\*/g, '$1').replace(/\*([^\*]+)\*/g, '$1');
  }

  // Numeric {x,y,zoom} pan/zoom focal point (current format) — legacy
  // 3x3 keyword strings from before map to a matching x/y at zoom 100
  // so old entries still render sensibly with no data migration needed.
  function parseFocal(raw) {
    if (!raw) return { x: 50, y: 50, zoom: 100 };
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.x === 'number') return { x: parsed.x, y: parsed.y, zoom: parsed.zoom || 100 };
    } catch (e) { /* fall through to legacy keyword handling */ }
    const LEGACY = {
      'top left': [0,0], 'top center': [50,0], 'top right': [100,0],
      'center left': [0,50], 'center': [50,50], 'center right': [100,50],
      'bottom left': [0,100], 'bottom center': [50,100], 'bottom right': [100,100],
    };
    const [x, y] = LEGACY[raw] || [50, 50];
    return { x, y, zoom: 100 };
  }
  // CSS for an <img> respecting a parsed focal point — object-position
  // handles the pan, transform:scale handles the zoom, transform-origin
  // keeps the zoom centered on the same point being panned to.
  function focalStyle(focal) {
    const f = focal || { x: 50, y: 50, zoom: 100 };
    return `object-position:${f.x}% ${f.y}%;transform:scale(${(f.zoom||100)/100});transform-origin:${f.x}% ${f.y}%`;
  }

  function makePhotoImg({ url, focalPosition, boxHeight, onOrientation }) {
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = '';
    const focal = parseFocal(focalPosition);
    img.style.cssText = `width:100%;display:block;object-fit:cover;background:#EDE8DE;border-radius:inherit;${focalStyle(focal)}`;
    if (boxHeight) img.style.height = boxHeight + 'px';
    img.addEventListener('load', () => {
      if (onOrientation) onOrientation(img.naturalWidth >= img.naturalHeight ? 'landscape' : 'portrait', img);
    });
    img.src = url;
    return img;
  }

  // Fixed collage templates chosen by count — not a naive equal-width
  // row, since a row that assumes every photo is landscape mangles
  // anything portrait down to a thin sliver.
  function renderCollage(container, photosWithUrls) {
    container.innerHTML = '';
    container.style.cssText = 'margin-top:18px';
    const n = photosWithUrls.length;
    if (n === 0) return;

    if (n === 1) {
      container.style.cssText += ';display:block;border-radius:3px;overflow:hidden';
      const { url, focal_position } = photosWithUrls[0];
      const img = makePhotoImg({
        url, focalPosition: focal_position, boxHeight: 150,
        onOrientation: (orientation) => { img.style.height = (orientation === 'portrait' ? 280 : 150) + 'px'; },
      });
      container.appendChild(img);
      return;
    }
    if (n === 2) {
      container.style.cssText += ';display:flex;gap:8px';
      photosWithUrls.forEach(({ url, focal_position }) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'flex:1;aspect-ratio:1/1;border-radius:3px;overflow:hidden';
        wrap.appendChild(makePhotoImg({ url, focalPosition: focal_position }));
        wrap.querySelector('img').style.height = '100%';
        container.appendChild(wrap);
      });
      return;
    }
    if (n === 3) {
      container.style.cssText += ';display:flex;gap:8px;height:160px';
      const bigWrap = document.createElement('div');
      bigWrap.style.cssText = 'flex:1.5;border-radius:3px;overflow:hidden;height:100%';
      const bigImg = makePhotoImg({ url: photosWithUrls[0].url, focalPosition: photosWithUrls[0].focal_position });
      bigImg.style.height = '100%';
      bigWrap.appendChild(bigImg);
      const col = document.createElement('div');
      col.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:8px';
      [photosWithUrls[1], photosWithUrls[2]].forEach(({ url, focal_position }) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'flex:1;border-radius:3px;overflow:hidden';
        const img = makePhotoImg({ url, focalPosition: focal_position });
        img.style.height = '100%';
        wrap.appendChild(img);
        col.appendChild(wrap);
      });
      container.appendChild(bigWrap);
      container.appendChild(col);
      return;
    }
    // 4 or more — 2x2 grid, extras beyond 4 show as a "+N" overlay on the last tile
    container.style.cssText += ';display:grid;grid-template-columns:1fr 1fr;gap:8px';
    photosWithUrls.slice(0, 4).forEach(({ url, focal_position }, i) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'aspect-ratio:1/1;border-radius:3px;overflow:hidden;position:relative';
      const img = makePhotoImg({ url, focalPosition: focal_position });
      img.style.height = '100%';
      wrap.appendChild(img);
      if (i === 3 && n > 4) {
        wrap.innerHTML += `<div style="position:absolute;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;font-weight:700">+${n-4}</div>`;
      }
      container.appendChild(wrap);
    });
  }

  async function renderRead() {
    root.innerHTML = '';
    const trip = Data.getCurrentTrip?.();
    const page = document.createElement('div');
    page.style.cssText = 'background:#FAF8F4;min-height:100%';

    page.innerHTML = `
      <div style="padding:40px 26px 14px;text-align:center">
        <div style="font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#A39A8C">Trip Journal</div>
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;color:#1C1A18;margin-top:10px;line-height:1.15">${trip?.name || ''}</div>
        <div style="font-size:11px;color:#A39A8C;margin-top:8px">${(trip?.countries||[]).join(' · ')}</div>
      </div>
      <div style="text-align:center;padding-bottom:26px">
        <button id="j-export-btn" style="border:1px solid #E4DECE;background:#fff;color:#6B6357;font-size:11px;font-weight:600;padding:8px 16px;border-radius:100px;cursor:pointer;font-family:var(--font)">Export as Image</button>
      </div>`;

    const entries = Data.getJournalEntries();

    if (!entries.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:0 26px 40px;text-align:center;color:#A39A8C';
      empty.innerHTML = `<div style="font-family:Georgia,serif;font-style:italic;font-size:15px">Nothing written yet.</div>
        <div style="font-size:11px;margin-top:6px">Start your first entry below.</div>`;
      page.appendChild(empty);
    }

    // Byline — only shown once there's genuinely more than one
    // contributor on this trip's journal, so a solo traveler never
    // sees a redundant "written by you" on every entry.
    const distinctAuthors = [...new Set(entries.map(e => e.created_by).filter(Boolean))];
    const showByline = distinctAuthors.length > 1;
    const authorNames = showByline ? await Data.getProfilesByIds(distinctAuthors) : {};

    for (const entry of entries) {
      const block = document.createElement('div');
      block.style.cssText = 'margin-bottom:8px;position:relative';

      const heroWrap = document.createElement('div');
      heroWrap.style.cssText = 'width:100%;height:170px;background-color:#EDE8DE;position:relative;overflow:hidden';

      const byline = showByline && entry.created_by ? `<div style="text-align:center;font-size:10px;color:#A39A8C;margin-top:-12px;margin-bottom:18px">— ${authorNames[entry.created_by] || 'Traveler'}</div>` : '';
      block.innerHTML = `
        <div style="height:1px;background:#1C1A18;opacity:.08;margin:0 26px 18px"></div>
        <div style="text-align:center;font-size:11px;font-weight:700;letter-spacing:.06em;color:#6B6357;margin-bottom:${showByline ? '4px' : '18px'}">${dateLabelFor(entry)}</div>
        ${byline}`;
      block.appendChild(heroWrap);
      heroWrap.innerHTML = `
        <button class="j-edit-btn" data-entry="${entry.id}" style="position:absolute;top:14px;right:20px;width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,.4);border:none;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
        </button>`;

      const bodyBlock = document.createElement('div');
      bodyBlock.style.cssText = 'padding:26px 26px 8px';
      bodyBlock.innerHTML = `
        ${entry.pull_quote ? `<div style="font-family:Georgia,serif;font-size:20px;line-height:1.4;color:#1C1A18;margin-bottom:14px">"${entry.pull_quote}"</div>` : ''}
        <div style="font-size:13px;line-height:1.75;color:#6B6357;white-space:pre-wrap">${renderMarkdownLite(entry.narration)}</div>
        <div id="inset-${entry.id}"></div>`;
      block.appendChild(bodyBlock);
      page.appendChild(block);

      const hero = (entry.journal_photos || []).find(p => p.is_hero) || (entry.journal_photos || [])[0];
      if (hero) {
        Data.getJournalPhotoUrl(hero).then((url) => {
          if (!url) return;
          const img = makePhotoImg({
            url, focalPosition: hero.focal_position, boxHeight: 170,
            onOrientation: (orientation) => { heroWrap.style.height = HERO_H[orientation] + 'px'; img.style.height = HERO_H[orientation] + 'px'; },
          });
          img.style.position = 'absolute'; img.style.inset = '0'; img.style.zIndex = '1'; img.style.height = '100%';
          heroWrap.insertBefore(img, heroWrap.firstChild);
        });
      }

      const others = (entry.journal_photos || []).filter(p => !p.is_hero);
      if (others.length) {
        Promise.all(others.map(p => Data.getJournalPhotoUrl(p).then(url => ({ url, focal_position: p.focal_position })))).then(list => {
          const insetEl = page.querySelector(`#inset-${entry.id}`);
          if (insetEl) renderCollage(insetEl, list.filter(x => x.url));
        });
      }
    }

    const addRow = document.createElement('div');
    addRow.style.cssText = 'padding:20px 26px 40px;text-align:center';
    addRow.innerHTML = `<button id="j-new-btn" style="border:none;background:var(--accent);color:#fff;font-size:13px;font-weight:700;padding:12px 22px;border-radius:100px;cursor:pointer;font-family:var(--font)">+ New Entry</button>`;
    page.appendChild(addRow);

    root.appendChild(page);

    page.querySelector('#j-new-btn')?.addEventListener('click', () => openComposer(null));
    page.querySelector('#j-export-btn')?.addEventListener('click', openExportOptions);
    page.querySelectorAll('.j-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openComposer(btn.dataset.entry);
      });
    });
  }

  /* ── Export as one long JPG — more reliable than fighting the
     browser's native print-to-PDF pipeline, which behaved
     inconsistently (especially on mobile). Everything is drawn
     manually onto a canvas at a fixed width, with height computed
     from the actual content, then saved as a single tall image —
     genuinely scrollable and continuous, since there's no such
     thing as a "page break" on a plain image the way there
     inherently is on a PDF. ── */

  function loadImageForCanvas(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous'; // needed so the canvas isn't "tainted" by a cross-origin (Supabase Storage) image
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // Draws an image into a fixed w×h box, cropped to fill it exactly
  // (same "cover" behavior as the CSS elsewhere), respecting the
  // photo's own saved pan/zoom focal point rather than always
  // cropping dead-center.
  function drawCover(ctx, img, x, y, w, h, focal) {
    const f = focal || { x: 50, y: 50, zoom: 100 };
    const zoom = Math.max(1, (f.zoom || 100) / 100);
    const boxRatio = w / h;
    const imgRatio = img.width / img.height;
    let sw, sh;
    if (imgRatio > boxRatio) { sh = img.height / zoom; sw = sh * boxRatio; }
    else { sw = img.width / zoom; sh = sw / boxRatio; }
    const maxSx = img.width - sw, maxSy = img.height - sh;
    const sx = Math.min(Math.max(0, (img.width - sw) * (f.x / 100)), Math.max(0, maxSx));
    const sy = Math.min(Math.max(0, (img.height - sh) * (f.y / 100)), Math.max(0, maxSy));
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  function wrapLines(ctx, text, maxWidth) {
    const out = [];
    text.split('\n').forEach(paragraph => {
      if (!paragraph) { out.push(''); return; }
      const words = paragraph.split(/\s+/);
      let line = '';
      words.forEach(word => {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          out.push(line);
          line = word;
        } else {
          line = test;
        }
      });
      if (line) out.push(line);
    });
    return out;
  }

  // One point per day-locality (not per stop) — averages that day's
  // stops' coordinates as a representative position. Takes an explicit
  // list of day ids chosen in the export options step, rather than
  // auto-deriving from which entries happen to be tagged — so an
  // untagged journal doesn't mean an empty map, the traveler just
  // picks whichever days they want illustrated directly.
  function getDayPointsForIds(dayIds) {
    if (!dayIds || !dayIds.length) return [];
    const days = (Data.getDays?.() || [])
      .filter(d => dayIds.includes(d.id))
      .sort((a, b) => (a.day_index ?? 0) - (b.day_index ?? 0));
    const points = [];
    for (const day of days) {
      const stops = (Data.getStopsByDay?.(day.id) || []).filter(s => typeof s.lat === 'number' && typeof s.lng === 'number');
      if (!stops.length) continue;
      const lat = stops.reduce((sum, s) => sum + s.lat, 0) / stops.length;
      const lng = stops.reduce((sum, s) => sum + s.lng, 0) / stops.length;
      points.push({ lat, lng, label: day.locality || day.label || '' });
    }
    return points;
  }

  // Plain linear scaling of the real lat/lng into drawing-area pixels —
  // no map projection library needed at this scale (one trip within one
  // region). Latitude increases northward but canvas Y increases
  // downward, so that axis has to be flipped or north would end up
  // at the bottom.
  function projectPoints(points, w, h, pad = 24) {
    if (points.length < 2) return [];
    const lats = points.map(p => p.lat), lngs = points.map(p => p.lng);
    const latRange = Math.max(Math.max(...lats) - Math.min(...lats), 0.0005);
    const lngRange = Math.max(Math.max(...lngs) - Math.min(...lngs), 0.0005);
    const minLat = Math.min(...lats), minLng = Math.min(...lngs);
    return points.map(p => ({
      x: pad + ((p.lng - minLng) / lngRange) * (w - pad * 2),
      y: pad + (1 - (p.lat - minLat) / latRange) * (h - pad * 2), // flipped: higher latitude = smaller y
      label: p.label,
    }));
  }

  function currentAccentColor() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return v || '#C84B35';
  }

  /* ── Export options — choose whether the route map appears at all,
     which specific days it plots (independent of which entries are
     day-tagged, so an untagged journal is never just empty), and
     whose entries to include if there's more than one contributor. ── */
  async function openExportOptions() {
    const entries = Data.getJournalEntries();
    if (!entries.length) { Toast.show('Nothing to export yet', 'warning'); return; }

    const distinctAuthors = [...new Set(entries.map(e => e.created_by).filter(Boolean))];
    const showAuthorFilter = distinctAuthors.length > 1;
    const authorNames = showAuthorFilter ? await Data.getProfilesByIds(distinctAuthors) : {};

    const days = Data.getDays?.() || [];
    const taggedDayIds = new Set(entries.map(e => e.day_id).filter(Boolean));

    let includeMap = true;
    let authorId = 'all';
    const selectedDayIds = new Set(days.filter(d => taggedDayIds.has(d.id)).map(d => d.id));

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.4);display:flex;align-items:flex-end';
    const sheet = document.createElement('div');
    sheet.style.cssText = 'background:#FAF8F4;width:100%;max-height:82vh;border-radius:20px 20px 0 0;overflow-y:auto;padding-bottom:env(safe-area-inset-bottom)';
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    function renderSheet() {
      sheet.innerHTML = `
        <div style="display:flex;justify-content:center;padding:8px 0 0"><div style="width:36px;height:4px;background:#E4DECE;border-radius:2px"></div></div>
        <div style="padding:20px">
          <p style="font-size:16px;font-weight:700;color:#1C1A18;margin-bottom:18px">Export options</p>

          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #E4DECE">
            <span style="font-size:13px;font-weight:600;color:#1C1A18">Include route map</span>
            <button id="opt-map-toggle" style="width:44px;height:26px;border-radius:100px;border:none;background:${includeMap ? 'var(--accent)' : '#E4DECE'};position:relative;cursor:pointer">
              <span style="position:absolute;top:3px;left:${includeMap ? '21px' : '3px'};width:20px;height:20px;border-radius:50%;background:#fff;transition:left .15s"></span>
            </button>
          </div>

          ${includeMap ? `
          <div style="padding-top:14px">
            <p style="font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#A39A8C;margin-bottom:10px">Days to show on the map</p>
            <div id="opt-day-list" style="display:flex;flex-direction:column;gap:2px;max-height:260px;overflow-y:auto"></div>
          </div>` : ''}

          ${showAuthorFilter ? `
          <div style="padding-top:18px">
            <p style="font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#A39A8C;margin-bottom:10px">Whose entries</p>
            <div id="opt-author-pills" style="display:flex;gap:6px;flex-wrap:wrap"></div>
          </div>` : ''}

          <button id="opt-export-btn" style="width:100%;margin-top:26px;border:none;background:var(--accent);color:#fff;font-size:13px;font-weight:700;padding:14px;border-radius:100px;cursor:pointer;font-family:var(--font)">Export as Image</button>
          <button id="opt-cancel-btn" style="width:100%;margin-top:8px;border:none;background:none;color:#A39A8C;font-size:12px;padding:10px;cursor:pointer;font-family:var(--font)">Cancel</button>
        </div>`;

      sheet.querySelector('#opt-map-toggle').addEventListener('click', () => { includeMap = !includeMap; renderSheet(); });

      if (includeMap) {
        const listEl = sheet.querySelector('#opt-day-list');
        if (!days.length) {
          listEl.innerHTML = `<div style="font-size:12px;color:#A39A8C;padding:8px 0">No days set up in this trip's itinerary yet.</div>`;
        }
        days.forEach(d => {
          const row = document.createElement('label');
          row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 4px;cursor:pointer';
          const checked = selectedDayIds.has(d.id);
          row.innerHTML = `
            <input type="checkbox" ${checked ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--accent)">
            <span style="font-size:13px;color:#1C1A18">${d.locality || d.label || d.date}</span>
            ${taggedDayIds.has(d.id) ? '<span style="font-size:9px;color:var(--accent);margin-left:auto">has entry</span>' : ''}`;
          row.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) selectedDayIds.add(d.id); else selectedDayIds.delete(d.id);
          });
          listEl.appendChild(row);
        });
      }

      if (showAuthorFilter) {
        const pillWrap = sheet.querySelector('#opt-author-pills');
        const allPill = document.createElement('div');
        allPill.textContent = 'Everyone';
        allPill.style.cssText = `padding:7px 14px;border-radius:100px;font-size:12px;font-weight:600;cursor:pointer;background:${authorId==='all'?'var(--accent)':'#F1EDE5'};color:${authorId==='all'?'#fff':'#6B6357'}`;
        allPill.addEventListener('click', () => { authorId = 'all'; renderSheet(); });
        pillWrap.appendChild(allPill);
        distinctAuthors.forEach(id => {
          const pill = document.createElement('div');
          pill.textContent = authorNames[id] || 'Traveler';
          const active = authorId === id;
          pill.style.cssText = `padding:7px 14px;border-radius:100px;font-size:12px;font-weight:600;cursor:pointer;background:${active?'var(--accent)':'#F1EDE5'};color:${active?'#fff':'#6B6357'}`;
          pill.addEventListener('click', () => { authorId = id; renderSheet(); });
          pillWrap.appendChild(pill);
        });
      }

      sheet.querySelector('#opt-cancel-btn').addEventListener('click', () => overlay.remove());
      sheet.querySelector('#opt-export-btn').addEventListener('click', () => {
        overlay.remove();
        exportJournalImage({ includeMap, selectedDayIds: [...selectedDayIds], authorId });
      });
    }

    renderSheet();
  }

  async function exportJournalImage(options) {
    const opts = options || { includeMap: true, selectedDayIds: [], authorId: 'all' };
    Toast.show('Preparing image…', 'info');
    const trip = Data.getCurrentTrip?.();
    let entries = Data.getJournalEntries();
    if (opts.authorId && opts.authorId !== 'all') {
      entries = entries.filter(e => e.created_by === opts.authorId);
    }
    if (!entries.length) { Toast.show('Nothing to export yet', 'warning'); return; }

    const W = 900, PAD = 56, CW = W - PAD * 2;

    // Preload every photo as a fully-decoded Image object up front —
    // canvas drawing itself is synchronous, so nothing can be loading
    // partway through.
    const entryData = [];
    for (const entry of entries) {
      const hero = (entry.journal_photos || []).find(p => p.is_hero) || (entry.journal_photos || [])[0];
      const others = (entry.journal_photos || []).filter(p => !p.is_hero);
      const heroUrl = hero ? await Data.getJournalPhotoUrl(hero) : null;
      const heroImg = await loadImageForCanvas(heroUrl);
      const otherImgs = [];
      for (const p of others) {
        const u = await Data.getJournalPhotoUrl(p);
        const im = await loadImageForCanvas(u);
        if (im) otherImgs.push({ img: im, focal: parseFocal(p.focal_position) });
      }
      entryData.push({ entry, heroImg, heroFocal: hero ? parseFocal(hero.focal_position) : null, otherImgs });
    }

    // Measure pass — figure out the total height needed before creating
    // the real canvas, using a scratch context purely for text metrics.
    // This has to mirror the real draw pass's cy progression exactly,
    // line for line, or the header and the first entry drift apart.
    const scratch = document.createElement('canvas').getContext('2d');
    let y = 130; // top margin, matches draw pass's initial cy
    y += 40; // after kicker
    y += 30; // after trip title
    y += 40; // after countries subline

    const dayPoints = opts.includeMap ? getDayPointsForIds(opts.selectedDayIds) : [];
    const routeProjected = projectPoints(dayPoints, CW, 190);
    const ROUTE_H = 190;
    if (routeProjected.length) {
      y += ROUTE_H + 30; // illustration + breathing room
    }
    y += 20; // gap before first entry

    const blocks = []; // { type, ...layout info, yStart }
    for (const { entry, heroImg, heroFocal, otherImgs } of entryData) {
      const startY = y;
      y += 1 + 22; // divider + gap
      y += 22; // date label
      let heroH = 0;
      if (heroImg) {
        const portrait = heroImg.naturalHeight > heroImg.naturalWidth;
        heroH = portrait ? 620 : 380;
        y += heroH + 26;
      }
      let quoteLines = [];
      if (entry.pull_quote) {
        scratch.font = '400 26px Georgia, serif';
        quoteLines = wrapLines(scratch, `"${entry.pull_quote}"`, CW);
        y += quoteLines.length * 36 + 20;
      }
      let bodyLines = [];
      if (entry.narration) {
        scratch.font = '400 18px Georgia, serif';
        bodyLines = wrapLines(scratch, stripMarkdown(entry.narration), CW);
        y += bodyLines.length * 29 + 10;
      }
      let insetH = 0;
      if (otherImgs.length) {
        insetH = 200;
        y += insetH + 10;
      }
      y += 30; // bottom gap
      blocks.push({ entry, heroImg, heroFocal, heroH, quoteLines, bodyLines, otherImgs, insetH, startY });
    }
    y += 50; // bottom margin

    // Real canvas, sized exactly to what was just measured.
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = Math.ceil(y);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FAF8F4';
    ctx.fillRect(0, 0, W, canvas.height);
    ctx.textBaseline = 'alphabetic';

    let cy = 130;
    ctx.fillStyle = '#A39A8C';
    ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TRIP JOURNAL', W / 2, cy);
    cy += 40;
    ctx.fillStyle = '#1C1A18';
    ctx.font = '400 40px Georgia, serif';
    ctx.fillText(trip?.name || '', W / 2, cy);
    cy += 30;
    ctx.fillStyle = '#A39A8C';
    ctx.font = '400 14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText((trip?.countries || []).join(' · '), W / 2, cy);
    cy += 40;

    if (routeProjected.length) {
      const accentColor = currentAccentColor();
      ctx.save();
      ctx.translate(PAD, cy);
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([1, 7]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      routeProjected.forEach((p, i) => { i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
      ctx.stroke();
      ctx.setLineDash([]);
      routeProjected.forEach(p => {
        ctx.fillStyle = accentColor;
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
      });
      ctx.fillStyle = '#1C1A18';
      ctx.font = '400 13px Georgia, serif';
      ctx.textAlign = 'center';
      routeProjected.forEach(p => {
        const labelY = p.y < ROUTE_H / 2 ? p.y - 14 : p.y + 22;
        ctx.fillText(p.label, p.x, labelY);
      });
      ctx.restore();
      cy += ROUTE_H + 30;
    }

    for (const b of blocks) {
      let by = b.startY;
      ctx.strokeStyle = 'rgba(28,26,24,.08)';
      ctx.beginPath(); ctx.moveTo(PAD, by); ctx.lineTo(W - PAD, by); ctx.stroke();
      by += 22 + 16;
      ctx.fillStyle = '#6B6357';
      ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(dateLabelFor(b.entry), W / 2, by);
      by += 8;

      if (b.heroImg) {
        drawCover(ctx, b.heroImg, PAD, by, CW, b.heroH, b.heroFocal);
        by += b.heroH + 26;
      }

      ctx.textAlign = 'left';
      if (b.quoteLines.length) {
        ctx.fillStyle = '#1C1A18';
        ctx.font = '400 26px Georgia, serif';
        b.quoteLines.forEach(line => { by += 36; ctx.fillText(line, PAD, by); });
        by += 20;
      }
      if (b.bodyLines.length) {
        ctx.fillStyle = '#6B6357';
        ctx.font = '400 18px Georgia, serif';
        b.bodyLines.forEach(line => { by += 29; ctx.fillText(line, PAD, by); });
        by += 10;
      }
      if (b.otherImgs.length) {
        const gap = 10;
        const cellW = (CW - gap * (b.otherImgs.length - 1)) / b.otherImgs.length;
        b.otherImgs.forEach((o, i) => {
          drawCover(ctx, o.img, PAD + i * (cellW + gap), by, cellW, b.insetH, o.focal);
        });
      }
    }

    canvas.toBlob((blob) => {
      if (!blob) { Toast.show('Export failed — could not render the image', 'danger'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(trip?.name || 'journal').replace(/[^a-z0-9]+/gi, '-')}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      Toast.show('Journal exported', 'success');
    }, 'image/jpeg', 0.88);
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
    composePhotos = photos.map((p, i) => ({ id: p.id, dataUrl: urls[i], isHero: p.is_hero, focalPosition: p.focal_position || 'center', removed: false }));

    mode = 'compose';
    render();
  }

  /* ── Focal-point picker — 3x3 grid over a preview of the photo ── */
  /* ── Photo positioning — drag to pan, slider to zoom, frame stays
     the same fixed size throughout. Replaces the earlier 3x3-grid
     version, which only offered 9 discrete anchor points. ── */
  function openFocalPicker(photo) {
    focalPickerPhoto = photo;
    const focal = parseFocal(photo.focalPosition);
    let x = focal.x, y = focal.y, zoom = focal.zoom;

    const BOX = 300;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:300;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:24px';
    overlay.innerHTML = `
      <div style="font-size:12px;color:rgba(255,255,255,.7)">Drag to reposition · slider to zoom</div>
      <div id="focal-frame" style="position:relative;width:${BOX}px;height:${BOX}px;border-radius:8px;overflow:hidden;touch-action:none;cursor:grab">
        <img id="focal-img" src="${photo.dataUrl}" draggable="false" style="width:100%;height:100%;object-fit:cover;object-position:${x}% ${y}%;transform:scale(${zoom/100});transform-origin:${x}% ${y}%;user-select:none;pointer-events:none">
      </div>
      <div style="display:flex;align-items:center;gap:10px;width:${BOX}px">
        <span style="color:rgba(255,255,255,.6);font-size:14px">−</span>
        <input id="focal-zoom" type="range" min="100" max="250" value="${zoom}" style="flex:1">
        <span style="color:rgba(255,255,255,.6);font-size:14px">+</span>
      </div>
      <div style="display:flex;gap:10px">
        <button id="focal-reset" style="padding:10px 18px;border-radius:100px;border:1px solid rgba(255,255,255,.3);background:none;color:rgba(255,255,255,.7);font-size:12px;font-family:var(--font)">Reset</button>
        <button id="focal-done" style="padding:10px 22px;border-radius:100px;border:none;background:var(--accent);color:#fff;font-size:12px;font-weight:700;font-family:var(--font)">Done</button>
      </div>`;
    document.body.appendChild(overlay);

    const frame = overlay.querySelector('#focal-frame');
    const img = overlay.querySelector('#focal-img');
    const zoomSlider = overlay.querySelector('#focal-zoom');

    function apply() {
      x = Math.min(100, Math.max(0, x));
      y = Math.min(100, Math.max(0, y));
      zoom = Math.min(250, Math.max(100, zoom));
      img.style.objectPosition = `${x}% ${y}%`;
      img.style.transform = `scale(${zoom/100})`;
      img.style.transformOrigin = `${x}% ${y}%`;
    }

    // Drag-to-pan — dragging the photo itself, like sliding a physical
    // print under a fixed viewing window: drag right reveals more of
    // what's currently hidden on the left.
    let dragging = false, startPx = 0, startPy = 0, startX = 0, startY = 0;
    function pointerDown(e) {
      dragging = true;
      frame.style.cursor = 'grabbing';
      const p = e.touches ? e.touches[0] : e;
      startPx = p.clientX; startPy = p.clientY; startX = x; startY = y;
    }
    function pointerMove(e) {
      if (!dragging) return;
      const p = e.touches ? e.touches[0] : e;
      const dx = p.clientX - startPx, dy = p.clientY - startPy;
      x = startX - (dx / BOX) * 100;
      y = startY - (dy / BOX) * 100;
      apply();
      e.preventDefault();
    }
    function pointerUp() { dragging = false; frame.style.cursor = 'grab'; }

    frame.addEventListener('mousedown', pointerDown);
    window.addEventListener('mousemove', pointerMove);
    window.addEventListener('mouseup', pointerUp);
    frame.addEventListener('touchstart', pointerDown, { passive: true });
    frame.addEventListener('touchmove', pointerMove, { passive: false });
    frame.addEventListener('touchend', pointerUp);

    zoomSlider.addEventListener('input', () => { zoom = +zoomSlider.value; apply(); });

    overlay.querySelector('#focal-reset').addEventListener('click', () => {
      x = 50; y = 50; zoom = 100;
      zoomSlider.value = 100;
      apply();
    });

    function cleanup() {
      window.removeEventListener('mousemove', pointerMove);
      window.removeEventListener('mouseup', pointerUp);
      overlay.remove();
    }
    overlay.querySelector('#focal-done').addEventListener('click', () => {
      photo.focalPosition = JSON.stringify({ x, y, zoom });
      cleanup();
      renderCompose();
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
    const visiblePhotos = composePhotos.filter(p => !p.removed);

    wrap.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #E4DECE">
        <div id="j-cancel" style="font-size:12px;color:#A39A8C;cursor:pointer">Cancel</div>
        <div style="font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#A39A8C">${editingEntryId ? 'Edit Entry' : 'New Entry'}</div>
        <div id="j-save" style="font-size:12px;font-weight:700;color:var(--accent);cursor:pointer">Save</div>
      </div>

      <div style="padding:18px 20px">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#A39A8C;margin-bottom:10px">Day (optional)</div>
        <div id="j-day-pills" style="display:flex;gap:6px;overflow-x:auto"></div>
      </div>

      <div style="padding:18px 20px">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#A39A8C;margin-bottom:10px">Photos</div>
        <div id="j-photo-row" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:2px"></div>
        <div style="font-size:9.5px;color:#A39A8C;margin-top:8px;line-height:1.4">Tap a photo to make it the hero image · ⤢ to reposition how it crops · × to remove · + to add more</div>
      </div>

      <div style="padding:18px 20px">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#A39A8C;margin-bottom:10px">What happened?</div>
        <textarea id="j-narration" rows="6" placeholder="Write whatever you want to remember…" style="width:100%;font-family:Georgia,serif;font-size:15px;line-height:1.7;color:#1C1A18;border:1px solid #E4DECE;border-radius:8px;padding:12px;background:#fff">${composeNarration}</textarea>
        <div style="font-size:9.5px;color:#A39A8C;margin-top:6px;line-height:1.5">Type <code style="background:#F1EDE5;padding:1px 4px;border-radius:3px;font-family:monospace">**text**</code> for <strong>bold</strong>, <code style="background:#F1EDE5;padding:1px 4px;border-radius:3px;font-family:monospace">*text*</code> for <em>italic</em></div>
        <div id="j-sentence-picker" style="margin-top:14px"></div>
      </div>

      <div style="padding:0 20px 20px">
        <div style="font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#A39A8C;margin:8px 0 8px">Preview — pull-quote</div>
        <div id="j-quote-preview" style="font-family:Georgia,serif;font-size:19px;line-height:1.4;color:#1C1A18;padding:14px 16px;border-left:3px solid var(--accent);background:#F1EDE5">${currentQuote ? '"'+currentQuote+'"' : '—'}</div>
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
    noneOpt.style.cssText = `flex-shrink:0;padding:6px 12px;border-radius:100px;font-size:11px;font-weight:600;cursor:pointer;background:${!composeDayId?'var(--accent)':'#F1EDE5'};color:${!composeDayId?'#fff':'#6B6357'}`;
    noneOpt.addEventListener('click', () => { composeDayId = null; renderCompose(); });
    dayPillWrap.appendChild(noneOpt);
    days.forEach(d => {
      const pill = document.createElement('div');
      pill.textContent = d.label || d.title || d.date;
      const active = composeDayId === d.id;
      pill.style.cssText = `flex-shrink:0;padding:6px 12px;border-radius:100px;font-size:11px;font-weight:600;cursor:pointer;background:${active?'var(--accent)':'#F1EDE5'};color:${active?'#fff':'#6B6357'}`;
      pill.addEventListener('click', () => { composeDayId = d.id; renderCompose(); });
      dayPillWrap.appendChild(pill);
    });

    // Photo row
    const photoRow = wrap.querySelector('#j-photo-row');
    visiblePhotos.forEach(p => {
      const thumb = document.createElement('div');
      thumb.style.cssText = `position:relative;flex-shrink:0;width:104px;height:104px;border-radius:8px;overflow:hidden;cursor:pointer`;
      thumb.innerHTML = `<img src="${p.dataUrl}" style="width:100%;height:100%;object-fit:cover;pointer-events:none;${focalStyle(parseFocal(p.focalPosition))}">`;
      if (p.isHero) {
        thumb.innerHTML += `<div style="position:absolute;top:5px;left:5px;background:rgba(0,0,0,.55);color:#fff;font-size:8px;font-weight:700;letter-spacing:.04em;padding:2px 6px;border-radius:4px;text-transform:uppercase;pointer-events:none">Hero</div>`;
      }
      thumb.innerHTML += `<button class="j-photo-focal" type="button" style="position:absolute;bottom:5px;left:5px;width:32px;height:32px;border-radius:50%;background:rgba(0,0,0,.6);border:none;color:#fff;font-size:15px;display:flex;align-items:center;justify-content:center;padding:0">⤢</button>`;
      thumb.innerHTML += `<button class="j-photo-remove" type="button" style="position:absolute;top:5px;right:5px;width:32px;height:32px;border-radius:50%;background:rgba(0,0,0,.6);border:none;color:#fff;font-size:16px;display:flex;align-items:center;justify-content:center;padding:0">×</button>`;
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
        if (e.target.closest('.j-photo-focal')) {
          openFocalPicker(p);
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
    addBtn.style.cssText = 'flex-shrink:0;width:104px;height:104px;border-radius:8px;border:1.5px dashed #E4DECE;display:flex;align-items:center;justify-content:center;color:#A39A8C;font-size:26px;cursor:pointer';
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

    for (const p of composePhotos.filter(p => p.removed && p.id)) {
      await Data.removeJournalPhoto(entryId, p.id);
    }
    for (const p of visiblePhotos.filter(p => !p.id)) {
      await Data.addJournalPhoto(entryId, p.dataUrl, { isHero: p.isHero, focalPosition: p.focalPosition });
    }
    // Existing photos — persist any focal-position change, and make sure
    // hero status is correct even if no new photo was added this session.
    for (const p of visiblePhotos.filter(p => p.id)) {
      await Data.setJournalPhotoFocal(entryId, p.id, p.focalPosition || JSON.stringify({ x: 50, y: 50, zoom: 100 }));
    }
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
