'use strict';

/* ============================================================
   BUCKET LIST — the primary, stable tab across every trip. Owns
   this nav slot; the trip-specific curated collection (Dex for
   Africa, Stamps for Japan, Food for Thailand) lives as a
   sub-tab inside it, not the other way around — Bucket List is
   the one thing that's genuinely identical everywhere, so it's
   the constant label.

   "done" and "has a photo" are deliberately independent — see
   Data.toggleBucketDone / addBucketPhoto / removeBucketPhoto.
   Tapping a row always just toggles done, instantly, no sheet.
   The camera icon is a separate, optional action.
   ============================================================ */

const BucketListScreen = (() => {
  let root;
  let activeTab = 'bucket'; // 'bucket' | 'collection'
  let addFormOpen = false;
  let pendingCategory = '';
  let editingItemId = null;   // id of item currently showing its inline edit form, or null
  let confirmDeleteId = null; // id of item mid tap-twice-to-confirm delete, or null
  let confirmDeleteTimer = null;

  const CATEGORY_ICONS = {
    'Food':       '🍜',
    'Places':     '📍',
    'Experience': '✨',
  };
  function iconFor(cat) { return CATEGORY_ICONS[cat] || '📝'; }

  /* ── Header progress bar — same shape as Dex/Food/Stamps ──── */
  function renderHeader() {
    const p = Data.getBucketProgress();
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:var(--s4);border-bottom:1.5px solid var(--border);background:var(--surface)';

    const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
    wrap.innerHTML = `
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">
        <p style="font-size:var(--text-lg);font-weight:500;color:var(--text-primary)">📝 Bucket List</p>
        <p style="font-size:var(--text-sm);font-weight:500;color:var(--accent)">${p.done}/${p.total} done</p>
      </div>
      <div style="height:8px;background:var(--border);border-radius:var(--r-pill);overflow:hidden">
        <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:var(--r-pill);transition:width .4s"></div>
      </div>`;
    return wrap;
  }

  /* ── Thumb — tick target + photo indicator, states are independent ── */
  function thumb(item) {
    const hasPhoto = !!item.photo_storage_path;
    const el = document.createElement('div');
    el.style.cssText = `
      width:30px;height:30px;border-radius:8px;flex-shrink:0;position:relative;
      display:flex;align-items:center;justify-content:center;font-size:13px;cursor:pointer;
      border:2px solid ${item.done ? 'var(--accent)' : 'var(--border)'};
      background:${item.done ? 'var(--accent)' : 'var(--surface)'};
      color:#fff;
    `;
    if (hasPhoto) {
      el.style.background = 'var(--surface-raised)';
      el.innerHTML = `<div id="bk-thumb-img-${item.id}" style="width:100%;height:100%;border-radius:6px;background-size:cover;background-position:center"></div>`;
      if (item.done) {
        const badge = document.createElement('span');
        badge.style.cssText = 'position:absolute;bottom:-3px;right:-3px;width:14px;height:14px;border-radius:50%;background:var(--accent);color:#fff;font-size:8px;display:flex;align-items:center;justify-content:center;border:1.5px solid var(--surface)';
        badge.textContent = '✓';
        el.appendChild(badge);
      }
      loadThumbImage(item.id);
    } else {
      el.textContent = item.done ? '✓' : '';
      if (!item.done) { el.style.borderStyle = 'dashed'; el.textContent = '＋'; el.style.color = 'var(--text-muted)'; }
    }
    return el;
  }

  async function loadThumbImage(id) {
    const dataUrl = await Data.getBucketPhoto(id);
    const target = root?.querySelector(`#bk-thumb-img-${id}`);
    if (target && dataUrl) target.style.backgroundImage = `url(${dataUrl})`;
  }

  /* ── Item row ─────────────────────────────────────────────── */
  function itemRow(item) {
    if (item.id === editingItemId) return editForm(item);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px var(--s4);border-bottom:1px solid var(--border-subtle)';

    const t = thumb(item);
    t.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.photo_storage_path) { openPhotoView(item); return; }
      handleToggle(item.id);
    });
    row.appendChild(t);

    const mid = document.createElement('div');
    mid.style.cssText = 'flex:1;min-width:0';
    const title = document.createElement('div');
    title.style.cssText = `font-size:13px;font-weight:${item.done ? '400' : '500'};color:${item.done ? 'var(--text-muted)' : 'var(--text-primary)'};${item.done ? 'text-decoration:line-through' : ''}`;
    title.textContent = item.title;
    mid.appendChild(title);

    if (item.location || item.url) {
      const meta = document.createElement('div');
      meta.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:2px;flex-wrap:wrap';
      if (item.location) {
        const loc = document.createElement('span');
        loc.style.cssText = 'font-size:10px;color:var(--text-muted)';
        loc.textContent = `📍 ${item.location}`;
        meta.appendChild(loc);
      }
      if (item.url) {
        const chip = document.createElement('a');
        chip.href = item.url;
        chip.target = '_blank';
        chip.rel = 'noopener';
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:2px;font-size:9px;font-weight:500;color:var(--accent);background:var(--accent-subtle);border:1px solid var(--border);border-radius:var(--r-sm);padding:1px 6px;text-decoration:none';
        chip.textContent = '🔗 Link';
        chip.addEventListener('click', e => e.stopPropagation());
        meta.appendChild(chip);
      }
      mid.appendChild(meta);
    }
    row.appendChild(mid);

    // Subtle camera icon — separate, optional action, never blocks completion
    const cam = document.createElement('button');
    cam.setAttribute('aria-label', 'Add photo');
    cam.style.cssText = 'width:26px;height:26px;border-radius:50%;flex-shrink:0;background:var(--surface-raised);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text-secondary);opacity:.55;cursor:pointer';
    cam.textContent = '📷';
    cam.addEventListener('click', (e) => { e.stopPropagation(); pickPhoto(item.id); });
    row.appendChild(cam);

    // Edit — opens an inline form pre-filled with this item's values
    const edit = document.createElement('button');
    edit.setAttribute('aria-label', 'Edit item');
    edit.style.cssText = 'width:26px;height:26px;border-radius:50%;flex-shrink:0;background:var(--surface-raised);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);opacity:.55;cursor:pointer';
    edit.innerHTML = Icons.pencil('icon-sm');
    edit.addEventListener('click', (e) => {
      e.stopPropagation();
      clearTimeout(confirmDeleteTimer);
      editingItemId = item.id;
      confirmDeleteId = null;
      render();
    });
    row.appendChild(edit);

    // Delete — first tap turns this into a red confirm state (auto-resets
    // after 4s, same as removing a stop or a journal entry elsewhere in
    // the app), second tap actually deletes. Deleting is more destructive
    // than removing a photo (loses title/location/url too), so unlike the
    // photo-remove action this isn't a single tap.
    const isConfirming = item.id === confirmDeleteId;
    const del = document.createElement('button');
    del.setAttribute('aria-label', isConfirming ? 'Confirm delete' : 'Delete item');
    del.style.cssText = `width:26px;height:26px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;cursor:pointer;${
      isConfirming
        ? 'background:var(--danger-bg);border:1px solid var(--danger-border);color:var(--danger-text);opacity:1'
        : 'background:var(--surface-raised);border:1px solid var(--border);color:var(--text-secondary);opacity:.55'
    }`;
    del.innerHTML = isConfirming ? Icons.check('icon-sm') : Icons.trash('icon-sm');
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!isConfirming) {
        editingItemId = null;
        confirmDeleteId = item.id;
        render();
        confirmDeleteTimer = setTimeout(() => {
          confirmDeleteId = null;
          render();
        }, 4000);
        return;
      }
      clearTimeout(confirmDeleteTimer);
      await Data.deleteBucketItem(item.id);
      confirmDeleteId = null;
      Toast.show('Removed from list', 'info');
      render();
    });
    row.appendChild(del);

    row.addEventListener('click', () => handleToggle(item.id));
    return row;
  }

  /* ── Inline edit form — same field set as Add, prefilled ────── */
  function editForm(item) {
    const existingCats = Data.getBucketCategories();
    const allCats = Array.from(new Set([...Object.keys(CATEGORY_ICONS), ...existingCats, item.category].filter(Boolean)));
    let pendingEditCategory = item.category || allCats[0] || '';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin:8px var(--s4);background:var(--accent-subtle);border:1px solid var(--border);border-radius:var(--r-md);padding:var(--s3);display:flex;flex-direction:column;gap:8px';

    wrap.innerHTML = `
      <div style="font-size:10px;color:var(--text-muted);font-weight:500;text-transform:uppercase;letter-spacing:.04em">Edit item</div>
      <div>
        <label style="display:block;font-size:var(--text-xs);font-weight:500;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Title <span style="color:var(--accent)">*</span></label>
        <input id="bke-title" class="bs-input" type="text" value="${(item.title || '').replace(/"/g, '&quot;')}">
      </div>
      <div>
        <label style="display:block;font-size:var(--text-xs);font-weight:500;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Location</label>
        <input id="bke-location" class="bs-input" type="text" value="${(item.location || '').replace(/"/g, '&quot;')}">
      </div>
      <div>
        <label style="display:block;font-size:var(--text-xs);font-weight:500;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Category</label>
        <div id="bke-cat-pills" style="display:flex;gap:6px;flex-wrap:wrap"></div>
      </div>
      <div>
        <label style="display:block;font-size:var(--text-xs);font-weight:500;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Link <span style="text-transform:none;font-weight:400;color:var(--text-muted)">(optional)</span></label>
        <input id="bke-url" class="bs-input" type="url" value="${(item.url || '').replace(/"/g, '&quot;')}">
      </div>
      <div style="display:flex;gap:8px;margin-top:2px">
        <button id="bke-save" class="btn btn-primary" style="flex:1">Save</button>
        <button id="bke-cancel" class="btn btn-ghost" style="flex:1">Cancel</button>
      </div>`;

    const pillWrap = wrap.querySelector('#bke-cat-pills');
    function renderPills() {
      pillWrap.innerHTML = '';
      allCats.forEach(cat => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = `pill ${pendingEditCategory === cat ? 'active' : ''}`;
        pill.textContent = `${iconFor(cat)} ${cat}`;
        pill.addEventListener('click', () => { pendingEditCategory = cat; renderPills(); });
        pillWrap.appendChild(pill);
      });
      const newPill = document.createElement('button');
      newPill.type = 'button';
      newPill.className = 'pill';
      newPill.style.cssText = 'border-style:dashed;color:var(--text-muted)';
      newPill.textContent = '+ New';
      newPill.addEventListener('click', () => {
        const typed = prompt('New category name');
        if (typed && typed.trim()) {
          pendingEditCategory = typed.trim();
          if (!allCats.includes(pendingEditCategory)) allCats.push(pendingEditCategory);
          renderPills();
        }
      });
      pillWrap.appendChild(newPill);
    }
    renderPills();

    wrap.querySelector('#bke-cancel').addEventListener('click', () => { editingItemId = null; render(); });
    wrap.querySelector('#bke-save').addEventListener('click', async () => {
      const title = wrap.querySelector('#bke-title').value.trim();
      if (!title) { Toast.show('Title is required', 'warning'); return; }
      const location = wrap.querySelector('#bke-location').value.trim();
      const url = wrap.querySelector('#bke-url').value.trim();
      await Data.updateBucketItem(item.id, { title, location, category: pendingEditCategory, url });
      Toast.show('Saved', 'success');
      editingItemId = null;
      render();
    });

    return wrap;
  }

  async function handleToggle(id) {
    await Data.toggleBucketDone(id);
    render();
  }

  /* ── Grouped list ─────────────────────────────────────────── */
  function renderList() {
    const wrap = document.createElement('div');
    const items = Data.getBucketItems();

    if (!items.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:var(--s6) var(--s4);text-align:center;color:var(--text-muted)';
      empty.innerHTML = `<span style="font-size:36px">📝</span><p style="margin-top:var(--s2);font-size:var(--text-sm)">Nothing on the list yet — add the first thing to do or try.</p>`;
      wrap.appendChild(empty);
      return wrap;
    }

    const byCategory = {};
    items.forEach(i => {
      const cat = i.category || 'Other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(i);
    });

    Object.keys(byCategory).forEach(cat => {
      const head = document.createElement('p');
      head.style.cssText = 'font-size:10px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:8px var(--s4) 6px';
      head.textContent = `${iconFor(cat)} ${cat}`;
      wrap.appendChild(head);
      byCategory[cat].forEach(item => wrap.appendChild(itemRow(item)));
    });

    return wrap;
  }

  /* ── Add item form ────────────────────────────────────────── */
  function renderAddForm() {
    const existingCats = Data.getBucketCategories();
    const allCats = Array.from(new Set([...Object.keys(CATEGORY_ICONS), ...existingCats]));

    if (!addFormOpen) {
      const btn = document.createElement('button');
      btn.style.cssText = 'margin:14px var(--s4) 4px;padding:10px;border-radius:var(--r-md);border:1.5px dashed var(--border);background:transparent;color:var(--accent);font-size:12px;font-weight:500;text-align:center;width:calc(100% - 32px);cursor:pointer;font-family:var(--font)';
      btn.textContent = '+ Add to list';
      btn.addEventListener('click', () => { addFormOpen = true; pendingCategory = allCats[0] || ''; render(); });
      return btn;
    }

    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin:0 var(--s4) 14px;background:var(--accent-subtle);border:1px solid var(--border);border-radius:var(--r-md);padding:var(--s3);display:flex;flex-direction:column;gap:8px';

    wrap.innerHTML = `
      <div style="font-size:10px;color:var(--text-muted);font-weight:500;text-transform:uppercase;letter-spacing:.04em">Add item</div>
      <div>
        <label style="display:block;font-size:var(--text-xs);font-weight:500;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Title <span style="color:var(--accent)">*</span></label>
        <input id="bk-title" class="bs-input" type="text" placeholder="e.g. Maasai village visit">
      </div>
      <div>
        <label style="display:block;font-size:var(--text-xs);font-weight:500;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Location</label>
        <input id="bk-location" class="bs-input" type="text" placeholder="e.g. Ngorongoro Crater">
      </div>
      <div>
        <label style="display:block;font-size:var(--text-xs);font-weight:500;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Category</label>
        <div id="bk-cat-pills" style="display:flex;gap:6px;flex-wrap:wrap"></div>
      </div>
      <div>
        <label style="display:block;font-size:var(--text-xs);font-weight:500;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Link <span style="text-transform:none;font-weight:400;color:var(--text-muted)">(optional)</span></label>
        <input id="bk-url" class="bs-input" type="url" placeholder="https://... (map, article, booking)">
      </div>
      <div style="display:flex;gap:8px;margin-top:2px">
        <button id="bk-save" class="btn btn-primary" style="flex:1">Save</button>
        <button id="bk-cancel" class="btn btn-ghost" style="flex:1">Cancel</button>
      </div>`;

    const pillWrap = wrap.querySelector('#bk-cat-pills');
    function renderPills() {
      pillWrap.innerHTML = '';
      allCats.forEach(cat => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = `pill ${pendingCategory === cat ? 'active' : ''}`;
        pill.textContent = `${iconFor(cat)} ${cat}`;
        pill.addEventListener('click', () => { pendingCategory = cat; renderPills(); });
        pillWrap.appendChild(pill);
      });
      const newPill = document.createElement('button');
      newPill.type = 'button';
      newPill.className = 'pill';
      newPill.style.cssText = 'border-style:dashed;color:var(--text-muted)';
      newPill.textContent = '+ New';
      newPill.addEventListener('click', () => {
        const typed = prompt('New category name');
        if (typed && typed.trim()) {
          pendingCategory = typed.trim();
          if (!allCats.includes(pendingCategory)) allCats.push(pendingCategory);
          renderPills();
        }
      });
      pillWrap.appendChild(newPill);
    }
    renderPills();

    wrap.querySelector('#bk-cancel').addEventListener('click', () => { addFormOpen = false; render(); });
    wrap.querySelector('#bk-save').addEventListener('click', async () => {
      const title = wrap.querySelector('#bk-title').value.trim();
      if (!title) { Toast.show('Title is required', 'warning'); return; }
      const location = wrap.querySelector('#bk-location').value.trim();
      const url = wrap.querySelector('#bk-url').value.trim();
      await Data.addBucketItem({ title, location, category: pendingCategory, url });
      Toast.show('Added to list', 'success');
      addFormOpen = false;
      render();
    });

    return wrap;
  }

  /* ── Photo capture — identical compress/upload pattern as Dex ── */
  function pickPhoto(itemId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(input); // must be in DOM — iOS Safari blocks click() otherwise

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (file) {
        const dataUrl = await compressImage(file);
        await Data.addBucketPhoto(itemId, dataUrl);
        Toast.show('Photo added', 'success');
        render();
      }
      input.remove();
    });
    input.click();
  }

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

  /* ── Full photo view — "Mark not done" and "Remove photo" are
     separate actions, neither touches the other's state ─────── */
  async function openPhotoView(item) {
    const dataUrl = await Data.getBucketPhoto(item.id);
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:300;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px';
    overlay.innerHTML = `
      <img src="${dataUrl || ''}" style="max-width:100%;max-height:55vh;border-radius:10px;object-fit:contain" />
      <div style="display:flex;gap:8px;width:220px">
        <button id="bk-pv-toggle" style="flex:1;padding:9px;border-radius:8px;font-size:11px;font-weight:500;border:1px solid rgba(255,255,255,.25);color:#fff;background:rgba(255,255,255,.08)">${item.done ? '↺ Mark not done' : '✓ Mark done'}</button>
      </div>
      <div style="display:flex;gap:8px;width:220px">
        <button id="bk-pv-remove" style="flex:1;padding:9px;border-radius:8px;font-size:11px;font-weight:500;border:1px solid rgba(255,155,138,.4);color:#ff9b8a;background:rgba(255,255,255,.08)">🗑 Remove photo</button>
      </div>
      <div style="display:flex;gap:8px;width:220px">
        <button id="bk-pv-close" style="flex:1;padding:9px;border-radius:8px;font-size:11px;font-weight:500;border:1px solid rgba(255,255,255,.25);color:#fff;background:transparent">Close</button>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#bk-pv-toggle').addEventListener('click', async () => {
      await Data.toggleBucketDone(item.id);
      overlay.remove();
      render();
    });
    overlay.querySelector('#bk-pv-remove').addEventListener('click', async () => {
      await Data.removeBucketPhoto(item.id);
      overlay.remove();
      Toast.show('Photo removed', 'info');
      render();
    });
    overlay.querySelector('#bk-pv-close').addEventListener('click', () => overlay.remove());
  }

  /* ── Trip-specific curated collection, embedded as a sub-tab ── */
  const COLLECTION_BY_TRIP = {
    '83891de6-44ee-4ec2-bb95-6726cbd8c370': { screen: () => window.DexScreen,    label: 'Dex',    icon: 'paw' },
    '91a41e0d-f247-4d89-ba15-02f0994a16c8': { screen: () => window.StampsScreen, label: 'Stamps', icon: 'stamp' },
    '2b3c82f2-040f-4f2a-9d01-579129d1203b': { screen: () => window.FoodScreen,   label: 'Food',   icon: 'bowl' },
  };
  function currentCollection() {
    const tripId = Data.getCurrentTrip?.()?.id;
    return COLLECTION_BY_TRIP[tripId] || null;
  }

  function subTabBar() {
    const collection = currentCollection();
    const bar = document.createElement('div');
    bar.className = 'sub-tab-bar';
    const tabs = [['bucket', 'checklist', 'Bucket List']];
    if (collection) tabs.push(['collection', collection.icon, collection.label]);
    tabs.forEach(([id, iconName, label]) => {
      const btn = document.createElement('button');
      btn.className = `sub-tab ${activeTab === id ? 'sub-tab--active' : ''}`;
      btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px">${Icons[iconName]('icon-sm')}<span>${label}</span></span>`;
      btn.addEventListener('click', () => { activeTab = id; render(); });
      bar.appendChild(btn);
    });
    return bar;
  }

  /* ── Main render ──────────────────────────────────────────── */
  function render() {
    if (!root) return;
    root.innerHTML = '';
    root.appendChild(subTabBar());

    if (activeTab === 'collection') {
      const collection = currentCollection();
      const body = document.createElement('div');
      root.appendChild(body);
      if (collection) collection.screen().init(body);
      return;
    }

    root.appendChild(renderHeader());
    root.appendChild(renderList());
    root.appendChild(renderAddForm());
  }

  return {
    init(el) { root = el; activeTab = 'bucket'; addFormOpen = false; render(); },
    destroy() {
      if (activeTab === 'collection') { const c = currentCollection(); c?.screen()?.destroy?.(); }
      root = null;
    },
    refresh() { render(); },
  };
})();

window.BucketListScreen = BucketListScreen;
