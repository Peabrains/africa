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
  let activeView = 'list'; // 'list' | 'map'
  let bucketMap = null;
  let bucketMapMarkers = null;
  let bucketMapRequest = 0;

  let searchQuery = '';
  const collapsedCategories = new Set(); // category names currently collapsed

  const CATEGORY_ICON_KEYS = {
    'Food':       'bowl',
    'Places':     'mapPin',
    'Experience': 'star',
  };
  function iconKeyFor(cat) { return CATEGORY_ICON_KEYS[cat] || 'checklist'; }
  function categoryIconHTML(cat, cls = 'icon-sm') {
    const key = iconKeyFor(cat);
    return Icons[key] ? Icons[key](cls) : Icons.checklist(cls);
  }

  /* ── Header progress bar — same shape as Dex/Food/Stamps ──── */
  function renderHeader() {
    const p = Data.getBucketProgress();
    const wrap = document.createElement('div');
    wrap.id = 'bk-header';
    wrap.style.cssText = 'padding:var(--s4);border-bottom:1.5px solid var(--border);background:var(--surface)';

    const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
    wrap.innerHTML = `
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">
        <p style="display:flex;align-items:center;gap:7px;font-size:var(--text-lg);font-weight:500;color:var(--text-primary)">${Icons.checklist('icon-sm')}Bucket List</p>
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
    el.id = `bk-thumb-${item.id}`;
    el.dataset.hasPhoto = hasPhoto ? '1' : '0';
    el.dataset.done = item.done ? '1' : '0';
    el.style.cssText = `
      width:56px;height:56px;border-radius:12px;flex-shrink:0;position:relative;
      display:flex;align-items:center;justify-content:center;font-size:13px;cursor:pointer;
      border:2px solid ${item.done ? 'var(--accent)' : 'var(--border)'};
      background:${item.done ? 'var(--accent)' : 'var(--surface)'};
      color:#fff;overflow:visible;
    `;
    if (hasPhoto) {
      el.style.background = 'var(--surface-raised)';
      el.style.borderColor = item.done ? 'var(--accent)' : 'var(--border)';
      el.innerHTML = `<div id="bk-thumb-img-${item.id}" style="width:100%;height:100%;border-radius:10px;overflow:hidden;background-size:cover;background-position:center"></div>`;
      if (item.done) el.appendChild(doneStamp(false));
      loadThumbImage(item.id);
    } else {
      if (item.done) el.appendChild(doneStamp(false));
      if (!item.done) { el.style.borderStyle = 'dashed'; el.innerHTML = Icons.plus('icon-sm'); el.querySelector('.icon').style.cssText = 'width:20px;height:20px'; el.style.color = 'var(--text-muted)'; }
    }
    return el;
  }

  // animate=true plays the stamp-slam + ink-ripple; false renders the
  // resting state (used on initial paint, where nothing should animate).
  function doneStamp(animate) {
    const stamp = document.createElement('div');
    stamp.className = 'bk-stamp';
    stamp.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.15);border-radius:10px;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:visible';
    if (animate) {
      const ripple = document.createElement('div');
      ripple.className = 'bk-stamp-ripple';
      stamp.appendChild(ripple);
    }
    const badge = document.createElement('span');
    badge.className = animate ? 'bk-stamp-in' : '';
    badge.style.cssText = 'border:2px solid var(--accent);color:var(--accent);background:rgba(255,255,255,.92);font-size:9px;font-weight:600;letter-spacing:.03em;padding:2px 6px;border-radius:4px;text-transform:uppercase;' + (animate ? '' : 'transform:rotate(-12deg);');
    badge.textContent = 'Done';
    stamp.appendChild(badge);
    return stamp;
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
    row.dataset.itemId = item.id;
    row.dataset.category = item.category || 'Other';
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
    title.id = `bk-title-${item.id}`;
    title.style.cssText = `font-size:13px;font-weight:${item.done ? '400' : '500'};color:${item.done ? 'var(--text-muted)' : 'var(--text-primary)'};${item.done ? 'text-decoration:line-through' : ''}`;
    title.textContent = item.title;
    mid.appendChild(title);

    if (item.location || item.url) {
      const meta = document.createElement('div');
      meta.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:2px;flex-wrap:wrap';
      if (item.location) {
        const loc = document.createElement('span');
        loc.style.cssText = 'display:inline-flex;align-items:center;gap:3px;font-size:10px;color:var(--text-muted)';
        loc.innerHTML = `${Icons.mapPin('icon-sm')}${item.location}`;
        loc.querySelector('.icon').style.cssText = 'width:10px;height:10px';
        meta.appendChild(loc);
      }
      if (item.url) {
        const chip = document.createElement('a');
        chip.href = item.url;
        chip.target = '_blank';
        chip.rel = 'noopener';
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:500;color:var(--accent);background:var(--accent-subtle);border:1px solid var(--border);border-radius:var(--r-sm);padding:1px 6px;text-decoration:none';
        chip.innerHTML = `${Icons.link('icon-sm')}Link`;
        chip.querySelector('.icon').style.cssText = 'width:9px;height:9px';
        chip.addEventListener('click', e => e.stopPropagation());
        meta.appendChild(chip);
      }
      mid.appendChild(meta);
    }
    row.appendChild(mid);

    // Single overflow button — opens a sheet with photo/edit/delete,
    // replacing three always-visible buttons that crowded the row.
    const more = document.createElement('button');
    more.setAttribute('aria-label', 'More actions');
    more.style.cssText = 'width:26px;height:26px;border-radius:50%;flex-shrink:0;background:var(--surface-raised);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);opacity:.7;cursor:pointer';
    more.innerHTML = Icons.dotsV('icon-sm');
    more.addEventListener('click', (e) => { e.stopPropagation(); openRowActions(item); });
    row.appendChild(more);

    row.addEventListener('click', () => handleToggle(item.id));
    return row;
  }

  /* ── Row actions sheet — replaces 3 always-visible buttons with
     one overflow tap. Delete needs a second tap to confirm, same
     intent as the old auto-resetting row button, just inside the
     sheet instead of on the row itself. ─────────────────────── */
  function openRowActions(item) {
    let confirming = false;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:280;background:rgba(0,0,0,.45);display:flex;align-items:flex-end';
    document.body.appendChild(overlay);

    function draw() {
      overlay.innerHTML = `
        <div style="background:var(--bg);width:100%;border-radius:20px 20px 0 0;padding:var(--s2) 0 calc(var(--s4) + env(safe-area-inset-bottom))">
          <div style="display:flex;justify-content:center;padding:6px 0 4px"><div style="width:36px;height:4px;background:var(--border);border-radius:2px"></div></div>
          <p style="padding:var(--s2) var(--s4) var(--s3);font-size:var(--text-sm);font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.title}</p>
          <button id="ra-photo" style="width:100%;display:flex;align-items:center;gap:12px;padding:14px var(--s4);background:none;border:none;font-family:var(--font);font-size:var(--text-sm);color:var(--text-primary);text-align:left">${Icons.camera('icon-sm')}${item.photo_storage_path ? 'Change photo' : 'Add photo'}</button>
          <button id="ra-paste" style="width:100%;display:flex;align-items:center;gap:12px;padding:14px var(--s4);background:none;border:none;font-family:var(--font);font-size:var(--text-sm);color:var(--text-primary);text-align:left">${Icons.clipboard('icon-sm')}Paste photo</button>
          <button id="ra-edit" style="width:100%;display:flex;align-items:center;gap:12px;padding:14px var(--s4);background:none;border:none;font-family:var(--font);font-size:var(--text-sm);color:var(--text-primary);text-align:left">${Icons.pencil('icon-sm')}Edit</button>
          <button id="ra-delete" style="width:100%;display:flex;align-items:center;gap:12px;padding:14px var(--s4);background:none;border:none;font-family:var(--font);font-size:var(--text-sm);text-align:left;color:${confirming ? 'var(--danger-text)' : 'var(--text-primary)'}">${confirming ? Icons.check('icon-sm') : Icons.trash('icon-sm')}${confirming ? 'Tap again to delete' : 'Delete'}</button>
        </div>`;

      overlay.querySelector('#ra-photo').addEventListener('click', () => { overlay.remove(); pickPhoto(item.id); });
      overlay.querySelector('#ra-paste').addEventListener('click', () => { overlay.remove(); pasteFromClipboard(item.id); });
      overlay.querySelector('#ra-edit').addEventListener('click', () => {
        overlay.remove();
        editingItemId = item.id;
        render();
      });
      overlay.querySelector('#ra-delete').addEventListener('click', async () => {
        if (!confirming) { confirming = true; draw(); return; }
        overlay.remove();
        await Data.deleteBucketItem(item.id);
        Toast.show('Removed from list', 'info');
        render();
      });
    }
    draw();

    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }

  /* ── Inline edit form — same field set as Add, prefilled ────── */
  function editForm(item) {
    const existingCats = Data.getBucketCategories();
    const allCats = Array.from(new Set([...Object.keys(CATEGORY_ICON_KEYS), ...existingCats, item.category].filter(Boolean)));
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
        pill.innerHTML = `${categoryIconHTML(cat)}${cat}`;
        pill.style.display = 'inline-flex'; pill.style.alignItems = 'center'; pill.style.gap = '5px';
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

  // Updates the tapped item's thumb + title in place, plus the category
  // badge and overall header — without rebuilding any DOM the photo lives
  // in. Rebuilding the row (even just the tapped one) re-runs thumb(),
  // which re-creates the photo <div> and re-triggers a fetch — that's why
  // the tapped item's own photo used to flash on every tap.
  function applyToggleVisual(item) {
    const thumbEl = root?.querySelector(`#bk-thumb-${item.id}`);
    const titleEl = root?.querySelector(`#bk-title-${item.id}`);
    if (!thumbEl || !titleEl) return false;

    const wasDone = thumbEl.dataset.done === '1';
    const becameDone = !wasDone && item.done;
    thumbEl.dataset.done = item.done ? '1' : '0';

    thumbEl.style.borderColor = item.done ? 'var(--accent)' : 'var(--border)';
    const existingStamp = thumbEl.querySelector('.bk-stamp');
    if (thumbEl.dataset.hasPhoto === '1') {
      if (item.done && !existingStamp) thumbEl.appendChild(doneStamp(becameDone));
      if (!item.done && existingStamp) existingStamp.remove();
    } else {
      thumbEl.style.background = item.done ? 'var(--accent)' : 'var(--surface)';
      thumbEl.style.borderStyle = item.done ? 'solid' : 'dashed';
      if (!item.done) {
        thumbEl.innerHTML = Icons.plus('icon-sm');
        const iconEl = thumbEl.querySelector('.icon');
        iconEl.style.cssText = 'width:20px;height:20px';
        thumbEl.style.color = 'var(--text-muted)';
      } else if (!existingStamp) {
        thumbEl.innerHTML = '';
        thumbEl.appendChild(doneStamp(becameDone));
      }
    }

    titleEl.style.fontWeight = item.done ? '400' : '500';
    titleEl.style.color = item.done ? 'var(--text-muted)' : 'var(--text-primary)';
    titleEl.style.textDecoration = item.done ? 'line-through' : 'none';
    return true;
  }

  function updateCategoryBadge(category) {
    const badge = root?.querySelector(`[data-cat-count="${category}"]`);
    if (!badge) return;
    const [prevDone, prevTotal] = (badge.textContent || '0/0').split('/').map(Number);
    const wasComplete = prevTotal > 0 && prevDone === prevTotal;

    const q = searchQuery.trim().toLowerCase();
    const inCat = Data.getBucketItems().filter(i => matchesQuery(i, q) && (i.category || 'Other') === category);
    const doneCount = inCat.filter(i => i.done).length;
    const total = inCat.length;
    badge.textContent = `${doneCount}/${total}`;

    const justCompleted = total > 0 && doneCount === total && !wasComplete;
    if (justCompleted) celebrateCategoryComplete(category);
  }

  // Generic on purpose — reuses categoryIconHTML (same icon the header
  // already shows) and the category's own name, so this works unmodified
  // for any category on any trip. No trip-specific art.
  function celebrateCategoryComplete(category) {
    const section = root?.querySelector(`[data-cat-section="${category}"]`);
    if (!section) return;

    const fx = document.createElement('div');
    fx.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5';

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(28,26,24,.1);animation:bk-cat-fade .35s ease-in 1.15s forwards';

    const ripple = document.createElement('div');
    ripple.style.cssText = 'position:absolute;left:50%;top:50%;width:70px;height:70px;border-radius:50%;border:2px solid var(--accent);animation:bk-cat-ripple .55s ease-out forwards';

    const medallion = document.createElement('div');
    medallion.style.cssText = 'position:absolute;left:50%;top:50%;width:64px;height:64px;border-radius:16px;background:rgba(255,255,255,.97);border:3px solid var(--accent);color:var(--accent);display:flex;align-items:center;justify-content:center;animation:bk-cat-medallion-in .48s cubic-bezier(.34,1.56,.64,1) forwards';
    medallion.innerHTML = categoryIconHTML(category, 'icon-lg');
    const iconSvg = medallion.querySelector('svg');
    if (iconSvg) iconSvg.style.cssText = 'width:34px;height:34px;display:block';

    const label = document.createElement('div');
    label.style.cssText = 'position:absolute;left:50%;top:calc(50% + 46px);transform:translateX(-50%);text-align:center;opacity:0;animation:bk-cat-text-in .3s ease-out .3s forwards';
    label.innerHTML = `<div style="font-size:14px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.03em">${category}</div><div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-top:1px">Complete</div>`;

    overlay.appendChild(ripple);
    overlay.appendChild(medallion);
    overlay.appendChild(label);
    fx.appendChild(overlay);
    section.appendChild(fx);

    setTimeout(() => fx.remove(), 1600);
  }

  async function handleToggle(id) {
    await Data.toggleBucketDone(id);
    const item = Data.getBucketItems().find(i => i.id === id);
    if (!item) { render(); return; }

    const updated = applyToggleVisual(item);
    if (!updated) { render(); return; } // fallback, e.g. item mid-edit

    updateCategoryBadge(item.category || 'Other');

    const oldHeader = root?.querySelector('#bk-header');
    if (oldHeader) oldHeader.replaceWith(renderHeader());
  }

  /* ── Search bar — filters title, location, and link together ── */
  function renderSearchBar() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:10px var(--s4) 8px;position:relative';
    wrap.innerHTML = `
      <div style="position:relative;display:flex;align-items:center">
        <span style="position:absolute;left:11px;color:var(--text-muted);display:flex;pointer-events:none">${Icons.search('icon-sm')}</span>
        <input id="bk-search" type="text" placeholder="Search name, location, or link" value="${(searchQuery || '').replace(/"/g, '&quot;')}" style="width:100%;box-sizing:border-box;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r-md);height:34px;padding-left:32px;padding-right:${searchQuery ? '32px' : '10px'};font-size:12px;font-family:var(--font);color:var(--text-primary)">
        ${searchQuery ? `<button id="bk-search-clear" aria-label="Clear search" style="position:absolute;right:6px;background:none;border:none;color:var(--text-muted);display:flex;padding:4px">${Icons.x('icon-sm')}</button>` : ''}
      </div>`;
    wrap.querySelectorAll('.icon').forEach(i => { i.style.width = '13px'; i.style.height = '13px'; });

    wrap.querySelector('#bk-search').addEventListener('input', (e) => {
      searchQuery = e.target.value;
      refreshList();
    });
    const clearBtn = wrap.querySelector('#bk-search-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      searchQuery = '';
      refreshList();
      const input = root?.querySelector('#bk-search');
      if (input) input.focus();
    });

    return wrap;
  }

  // Re-renders just the list area (not the search input itself) so
  // typing doesn't lose focus the way a full render() would.
  function refreshList() {
    const area = root?.querySelector('#bk-list-area');
    if (!area) return;
    area.innerHTML = '';
    area.appendChild(renderList());
    // Clear button appears/disappears with query state — swap the
    // whole search bar in place without touching the focused input's
    // own value, since its value already reflects what the user typed.
    const searchWrap = root?.querySelector('#bk-search-wrap');
    if (searchWrap) {
      const clearBtn = searchWrap.querySelector('#bk-search-clear');
      const hasClear = !!clearBtn;
      const shouldHaveClear = !!searchQuery;
      if (hasClear !== shouldHaveClear) {
        const focused = document.activeElement === searchWrap.querySelector('#bk-search');
        const newBar = renderSearchBar();
        searchWrap.replaceWith(newBar);
        newBar.id = 'bk-search-wrap';
        if (focused) {
          const input = newBar.querySelector('#bk-search');
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      }
    }
  }

  function matchesQuery(item, q) {
    if (!q) return true;
    const hay = [item.title, item.location, item.url].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  }

  // Handles the coordinate-bearing Google Maps URLs we can safely pin
  // without guessing a place from free text.
  function coordinatesFromMapsUrl(url) {
    if (!url || !/(?:^|\/)maps\.google\.|google\.(?:com|[a-z.]+)\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url)) return null;
    try {
      const u = new URL(url);
      const candidates = [u.searchParams.get('query'), u.searchParams.get('q'), u.searchParams.get('ll')];
      const path = decodeURIComponent(u.pathname + u.search);
      candidates.push(...path.match(/-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?/g) || []);
      // Google Maps embeds coordinates in several URL formats, including
      // /@lat,lng,zoom and /data=!3dLAT!4dLNG.
      const at = path.match(/@(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
      if (at) candidates.push(`${at[1]},${at[2]}`);
      const dataLat = path.match(/!3d(-?\d{1,3}(?:\.\d+)?)/);
      const dataLng = path.match(/!4d(-?\d{1,3}(?:\.\d+)?)/);
      if (dataLat && dataLng) candidates.push(`${dataLat[1]},${dataLng[1]}`);
      for (const value of candidates) {
        const m = String(value || '').match(/(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
        if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) return { lat:+m[1], lng:+m[2] };
      }
    } catch (_) { /* invalid URL: leave it unpinned */ }
    return null;
  }

  function mapsSearchUrl(item) {
    const query = [item.title, item.location].filter(Boolean).join(', ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  async function geocodeBucketItem(item) {
    const direct = coordinatesFromMapsUrl(item.url);
    if (direct) return { point: direct, source: 'link', mapsUrl: item.url };
    const query = [item.title, item.location].filter(Boolean).join(', ').trim();
    if (!query) return null;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`, { headers:{ Accept:'application/json' } });
      const data = await res.json();
      const hit = data?.[0];
      if (!hit) return { item, mapsUrl: mapsSearchUrl(item), unresolved:true };
      return { item, point:{ lat:+hit.lat, lng:+hit.lon }, source:'search', mapsUrl:mapsSearchUrl(item), label:hit.display_name };
    } catch (_) {
      return { item, mapsUrl: mapsSearchUrl(item), unresolved:true };
    }
  }

  function renderMapView() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:0 var(--s4) var(--s4);flex:1;min-height:0;display:flex;flex-direction:column';
    const mapEl = document.createElement('div');
    mapEl.id = 'bk-map-container';
    mapEl.style.cssText = 'flex:1;min-height:420px;border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;background:var(--surface-raised)';
    wrap.appendChild(mapEl);
    const note = document.createElement('div');
    note.style.cssText = 'font-size:10px;color:var(--text-muted);padding:8px 2px 0';
    note.textContent = 'Loading locations from your bucket list…';
    wrap.appendChild(note);
    const requestId = ++bucketMapRequest;
    requestAnimationFrame(async () => {
      bucketMap = L.map(mapEl, { zoomControl:true }).setView([13.7563, 100.5018], 4);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OpenStreetMap', maxZoom:18 }).addTo(bucketMap);
      bucketMapMarkers = L.layerGroup().addTo(bucketMap);
      const items = (await Promise.all(Data.getBucketItems().map(geocodeBucketItem))).filter(Boolean);
      if (requestId !== bucketMapRequest || !bucketMap) return;
      const pinned = items.filter(x => x.point);
      note.textContent = pinned.length
        ? `${pinned.length} pinned item${pinned.length === 1 ? '' : 's'} · ${items.filter(x => x.unresolved).length ? `${items.filter(x => x.unresolved).length} need a clearer location` : 'Location access is optional'}`
        : 'No locations found yet. Add a location or link to a bucket-list item.';
      const bounds = [];
      pinned.forEach(({ item, point, source, mapsUrl }) => {
        bounds.push([point.lat, point.lng]);
        const marker = L.marker([point.lat, point.lng]).addTo(bucketMapMarkers);
        const popup = document.createElement('div');
        popup.style.cssText = 'min-width:150px';
        popup.innerHTML = `<strong></strong><div style="font-size:10px;color:#777;margin:4px 0 8px">${item.done ? 'Completed' : 'Not completed'} · ${source === 'link' ? 'From saved link' : 'Located from item text'}</div><a target="_blank" rel="noopener" style="font-size:11px;color:var(--accent)">Open in Google Maps ↗</a>`;
        popup.querySelector('strong').textContent = item.title;
        popup.querySelector('a').href = source === 'link' ? `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}` : mapsUrl;
        marker.bindPopup(popup);
      });
      if (navigator.geolocation) navigator.geolocation.getCurrentPosition(pos => {
        const here = [pos.coords.latitude, pos.coords.longitude];
        L.circleMarker(here, { radius:8, color:'#2563EB', fillColor:'#60A5FA', fillOpacity:.95, weight:3 }).addTo(bucketMapMarkers).bindPopup('Your current location');
        bounds.push(here);
        if (bounds.length) bucketMap.fitBounds(bounds, { padding:[24,24] });
      }, () => { if (bounds.length) bucketMap.fitBounds(bounds, { padding:[24,24] }); });
      if (bounds.length) bucketMap.fitBounds(bounds, { padding:[24,24] });
    });
    return wrap;
  }

  /* ── Grouped list ─────────────────────────────────────────── */
  function renderList() {
    const wrap = document.createElement('div');
    const allItems = Data.getBucketItems();

    if (!allItems.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:var(--s6) var(--s4);text-align:center;color:var(--text-muted)';
      empty.innerHTML = `<span style="display:inline-flex;color:var(--text-muted)">${Icons.checklist('icon-lg')}</span><p style="margin-top:var(--s2);font-size:var(--text-sm)">Nothing on the list yet — add the first thing to do or try.</p>`;
      empty.querySelector('.icon').style.cssText = 'width:36px;height:36px';
      wrap.appendChild(empty);
      return wrap;
    }

    const q = searchQuery.trim().toLowerCase();
    const items = allItems.filter(i => matchesQuery(i, q));

    if (q && !items.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:var(--s6) var(--s4);text-align:center;color:var(--text-muted)';
      empty.innerHTML = `<span style="display:inline-flex;color:var(--text-muted)">${Icons.search('icon-lg')}</span><p style="margin-top:var(--s2);font-size:var(--text-sm)">No matches for "${searchQuery}"</p>`;
      empty.querySelector('.icon').style.cssText = 'width:32px;height:32px';
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
      const catItems = byCategory[cat];
      const isCollapsed = collapsedCategories.has(cat);
      const doneCount = catItems.filter(i => i.done).length;

      const head = document.createElement('button');
      head.type = 'button';
      head.style.cssText = 'width:100%;display:flex;align-items:center;gap:6px;background:none;border:none;padding:8px var(--s4) 6px;cursor:pointer;font-family:var(--font)';
      head.innerHTML = `
        <span style="display:flex;align-items:center;gap:6px;font-size:10px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em">${categoryIconHTML(cat)}${cat}</span>
        <span data-cat-count="${cat}" style="font-size:10px;color:var(--text-muted);font-weight:500">${doneCount}/${catItems.length}</span>
        <span style="flex:1"></span>
        <span data-cat-chevron="${cat}" style="display:flex;color:var(--text-muted);transition:transform .2s;transform:rotate(${isCollapsed ? '-90deg' : '0deg'})">${Icons.chevronDown('icon-sm')}</span>
      `;
      head.querySelectorAll('.icon').forEach(i => { i.style.width = '13px'; i.style.height = '13px'; });

      const body = document.createElement('div');
      body.dataset.catBody = cat;
      body.id = `bk-cat-body-${cat}`;
      body.style.display = isCollapsed ? 'none' : '';
      catItems.forEach(item => body.appendChild(itemRow(item)));

      head.addEventListener('click', () => {
        const nowCollapsed = !collapsedCategories.has(cat);
        if (nowCollapsed) collapsedCategories.add(cat); else collapsedCategories.delete(cat);
        body.style.display = nowCollapsed ? 'none' : '';
        const chevron = head.querySelector(`[data-cat-chevron="${cat}"]`);
        if (chevron) chevron.style.transform = `rotate(${nowCollapsed ? '-90deg' : '0deg'})`;
      });

      const section = document.createElement('div');
      section.style.position = 'relative';
      section.dataset.catSection = cat;
      section.appendChild(head);
      section.appendChild(body);
      wrap.appendChild(section);
    });

    return wrap;
  }

  /* ── Add item form ────────────────────────────────────────── */
  function renderAddForm() {
    const existingCats = Data.getBucketCategories();
    const allCats = Array.from(new Set([...Object.keys(CATEGORY_ICON_KEYS), ...existingCats]));

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
        pill.innerHTML = `${categoryIconHTML(cat)}${cat}`;
        pill.style.display = 'inline-flex'; pill.style.alignItems = 'center'; pill.style.gap = '5px';
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

  /* ── Paste photo — Clipboard API. Support for image reads inside an
     installed home-screen PWA on iOS is inconsistent across versions,
     so this is feature-detected and fails with a clear message rather
     than silently. Needs to run directly off the tap that triggers it
     (no awaits before the read) — Safari revokes clipboard permission
     for calls that aren't tied closely enough to the user gesture. ── */
  async function pasteFromClipboard(itemId) {
    if (!navigator.clipboard?.read) {
      Toast.show("Paste isn't supported on this device", 'error');
      return;
    }
    let clipboardItems;
    try {
      clipboardItems = await navigator.clipboard.read();
    } catch {
      Toast.show('Clipboard access denied — check Safari permissions', 'error');
      return;
    }

    let imageBlob = null;
    for (const ci of clipboardItems) {
      const imageType = ci.types.find(t => t.startsWith('image/'));
      if (imageType) { imageBlob = await ci.getType(imageType); break; }
    }
    if (!imageBlob) {
      Toast.show('No image found on clipboard', 'info');
      return;
    }

    const dataUrl = await compressImage(imageBlob);
    await Data.addBucketPhoto(itemId, dataUrl);
    Toast.show('Photo pasted', 'success');
    render();
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
        <button id="bk-pv-toggle" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px;border-radius:8px;font-size:11px;font-weight:500;border:1px solid rgba(255,255,255,.25);color:#fff;background:rgba(255,255,255,.08)">${item.done ? Icons.refresh('icon-sm') : Icons.check('icon-sm')}${item.done ? 'Mark not done' : 'Mark done'}</button>
      </div>
      <div style="display:flex;gap:8px;width:220px">
        <button id="bk-pv-remove" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px;border-radius:8px;font-size:11px;font-weight:500;border:1px solid rgba(255,155,138,.4);color:#ff9b8a;background:rgba(255,255,255,.08)">${Icons.trash('icon-sm')}Remove photo</button>
      </div>
      <div style="display:flex;gap:8px;width:220px">
        <button id="bk-pv-close" style="flex:1;padding:9px;border-radius:8px;font-size:11px;font-weight:500;border:1px solid rgba(255,255,255,.25);color:#fff;background:transparent">Close</button>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#bk-pv-toggle').addEventListener('click', async () => {
      overlay.remove();
      await handleToggle(item.id);
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
    if (bucketMap) { bucketMap.remove(); bucketMap = null; bucketMapMarkers = null; }
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
    const viewBar = document.createElement('div');
    viewBar.style.cssText = 'display:flex;gap:6px;padding:10px var(--s4) 14px';
    [['list','List'],['map','Map']].forEach(([id,label]) => {
      const btn = document.createElement('button'); btn.className = `pill ${activeView === id ? 'active' : ''}`; btn.textContent = label;
      btn.addEventListener('click', () => { activeView = id; render(); }); viewBar.appendChild(btn);
    });
    root.appendChild(viewBar);
    if (activeView === 'map') { root.appendChild(renderMapView()); return; }
    const searchWrap = renderSearchBar();
    searchWrap.id = 'bk-search-wrap';
    root.appendChild(searchWrap);
    root.appendChild(renderAddForm());
    const listArea = document.createElement('div');
    listArea.id = 'bk-list-area';
    listArea.appendChild(renderList());
    root.appendChild(listArea);
  }

  return {
    init(el) { root = el; activeTab = 'bucket'; activeView = 'list'; addFormOpen = false; render(); },
    destroy() {
      if (activeTab === 'collection') { const c = currentCollection(); c?.screen()?.destroy?.(); }
      if (bucketMap) { bucketMap.remove(); bucketMap = null; }
      bucketMapMarkers = null;
      root = null;
    },
    refresh() { render(); },
  };
})();

window.BucketListScreen = BucketListScreen;
