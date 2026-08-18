'use strict';

const PlannerScreen = (() => {
  let root = null, proposal = null, trendingResults = null, busy = false, plannerPrompt = '', focusDayId = '', errorMessage = '';
  let selected = new Set();
  let trendingSelected = new Set(), workspaceTab = 'itinerary';
  let importReview = null, importEditor = null;
  let mapInstance = null, loadedTripKey = '';
  const DRAFT_KEY = 'africa-ai-planner-draft-v1';
  const TRENDING_KEY = 'africa-ai-planner-trending-v1';
  const QUICK_PROMPTS = [
    ['Slow day', 'Plan a relaxed day with minimal travel and plenty of downtime.'],
    ['Local food', 'Suggest a local food experience that fits naturally around what is already planned.'],
    ['Hidden gems', 'Add one or two memorable, less touristy places without making the day rushed.'],
    ['Fill a gap', 'Find the best use of an open gap without moving confirmed plans.'],
  ];

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function saveDraft() {
    if (!proposal) return;
    try { localStorage.setItem(`${DRAFT_KEY}:${encodeURIComponent(getTripKey())}`, JSON.stringify({ tripKey: getTripKey(), proposal, prompt: plannerPrompt, focusDayId, selected: [...selected], savedAt: Date.now() })); } catch (_) {}
  }

  function getTripKey() {
    const trip = Data.getCurrentTrip?.() || {};
    return trip.id ? String(trip.id) : [trip.name || Data.getTripName?.(), trip.start_date, trip.end_date].filter(Boolean).join('|') || 'trip';
  }

  function restoreDraft() {
    try {
      const tripKey = getTripKey();
      const draft = JSON.parse(localStorage.getItem(`${DRAFT_KEY}:${encodeURIComponent(tripKey)}`) || 'null');
      if (!draft || draft.tripKey !== tripKey || !draft.proposal?.items?.length) return;
      proposal = draft.proposal; plannerPrompt = draft.prompt || ''; focusDayId = draft.focusDayId || '';
      selected = new Set(Array.isArray(draft.selected) ? draft.selected : draft.proposal.items.map((_, i) => i));
    } catch (_) {}
  }

  function tripStorageKey(key) { return `${key}:${encodeURIComponent(getTripKey())}`; }
  function clearDraft() { try { localStorage.removeItem(tripStorageKey(DRAFT_KEY)); } catch (_) {} }
  function saveTrending() { try { localStorage.setItem(tripStorageKey(TRENDING_KEY), JSON.stringify({ tripKey: getTripKey(), results: trendingResults, selected: [...trendingSelected], savedAt: Date.now() })); } catch (_) {} }
  function restoreTrending() { try { const saved = JSON.parse(localStorage.getItem(tripStorageKey(TRENDING_KEY)) || 'null'); if (saved?.tripKey === getTripKey() && saved.results?.places?.length) { trendingResults = saved.results; trendingSelected = new Set(saved.selected || []); } } catch (_) {} }
  function clearTrending() { try { localStorage.removeItem(tripStorageKey(TRENDING_KEY)); } catch (_) {} }

  function syncTripContext() {
    const tripKey = getTripKey();
    if (loadedTripKey === tripKey) return;
    loadedTripKey = tripKey;
    proposal = null; trendingResults = null; selected.clear(); trendingSelected.clear(); plannerPrompt = ''; focusDayId = ''; errorMessage = ''; workspaceTab = 'itinerary';
    restoreDraft(); restoreTrending();
  }

  function header() {
    const row = el('div', 'planner-header');
    const back = el('button', 'planner-icon-btn');
    back.type = 'button'; back.setAttribute('aria-label', 'Back to itinerary');
    back.innerHTML = Icons.chevronDown('icon-sm');
    back.addEventListener('click', () => App.switchTo('itinerary'));
    const copy = el('div', 'planner-header-copy');
    copy.append(el('p', 'planner-eyebrow', 'AI PLANNER'), el('h1', 'planner-title', 'Shape the day around you'));
    row.append(back, copy);
    return row;
  }

  function dayPicker() {
    const section = el('section', 'planner-section');
    section.append(el('p', 'planner-label', 'PLAN FOR'));
    const rail = el('div', 'planner-day-rail');
    const all = el('button', `planner-day-pill ${focusDayId ? '' : 'is-active'}`, 'Whole trip');
    all.type = 'button'; all.addEventListener('click', () => { focusDayId = ''; render(); });
    rail.append(all);
    Data.getDays().forEach(day => {
      const button = el('button', `planner-day-pill ${focusDayId === day.id ? 'is-active' : ''}`);
      button.type = 'button';
      const date = new Date(`${day.date}T00:00:00`);
      const dateLabel = isNaN(date.getTime()) ? day.date : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      button.innerHTML = `<span>${day.label}</span><small>${dateLabel}</small>`;
      button.addEventListener('click', () => { focusDayId = day.id; render(); });
      rail.append(button);
    });
    section.append(rail);
    return section;
  }

  function composer() {
    const section = el('section', 'planner-section planner-compose-section');
    const heading = el('div', 'planner-section-heading');
    heading.append(el('p', 'planner-label', 'YOUR BRIEF'), el('span', 'planner-quota', 'No daily cap'));
    const card = el('div', 'planner-compose-card');
    const textarea = el('textarea', 'planner-textarea');
    textarea.rows = 5; textarea.maxLength = 1200; textarea.value = plannerPrompt;
    textarea.placeholder = 'A quiet afternoon, somewhere beautiful for sunset, dinner under USD 80…';
    textarea.setAttribute('aria-label', 'Describe your ideal itinerary');
    const count = el('span', 'planner-count', `${plannerPrompt.length}/1200`);
    textarea.addEventListener('input', () => { plannerPrompt = textarea.value; count.textContent = `${plannerPrompt.length}/1200`; });
    card.append(textarea);
    const quick = el('div', 'planner-quick-rail');
    QUICK_PROMPTS.forEach(([label, value]) => {
      const chip = el('button', 'planner-quick-chip', label);
      chip.type = 'button';
      chip.addEventListener('click', () => { plannerPrompt = value; textarea.value = value; count.textContent = `${value.length}/1200`; textarea.focus(); });
      quick.append(chip);
    });
    card.append(quick);
    const footer = el('div', 'planner-compose-footer');
    const submit = el('button', 'planner-submit');
    submit.type = 'button'; submit.disabled = busy;
    submit.innerHTML = busy ? '<span class="planner-spinner"></span><span>Shaping your day…</span>' : `<span>${Icons.star('icon-sm')}</span><span>Make a plan</span>`;
    submit.addEventListener('click', requestProposal);
    footer.append(count, submit); card.append(footer); section.append(heading, card);
    const discover = el('button', 'planner-discover-button', '✦ Find trending places'); discover.type = 'button'; discover.addEventListener('click', requestTrending);
    section.append(discover);
    const importButton = el('button', 'planner-import-button', busy ? 'Reading screenshot…' : '＋ Import one booking screenshot'); importButton.type = 'button'; importButton.disabled = busy; importButton.addEventListener('click', () => { const consent = window.confirm('Use this screenshot only for itinerary extraction? Do not upload passports, payment details, or other sensitive documents. The original image is not intended to be stored.'); if (!consent) return; const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg'; input.addEventListener('change', async () => { if (!input.files?.[0]) return; busy = true; errorMessage = ''; render(); try { const extracted = await PlannerService.importScreenshot(input.files[0]); const normalized = normalizeImportedDays(extracted.items.map(item => ({ ...item, selected: true }))); importReview = { fileName: input.files[0].name, ...normalized }; } catch (error) { errorMessage = error.message || 'Screenshot import failed.'; } finally { busy = false; render(); } }); input.click(); }); section.append(importButton);
    return section;
  }

  function buildImportReview(file) {
    const items = [
      { day: 'Day 1 · Osaka', date: '12 Apr 2027', type: 'Flight', name: 'Flight confirmation', detail: 'Arrival time and airport extracted from the document.', selected: true, confidence: 'High confidence' },
      { day: 'Day 1 · Osaka', date: '12 Apr 2027', type: 'Accommodation', name: 'Hotel reservation', detail: 'Check-in and property details found.', selected: true, confidence: 'High confidence' },
      { day: 'Day 2 · Kumano', date: '13 Apr 2027', type: 'Stop', name: 'Transfer to Kii-Tanabe', detail: 'Transport mentioned, but departure time needs confirmation.', selected: true, confidence: 'Needs review' },
      { day: 'Day 3 · Nakahechi Trail', date: '14 Apr 2027', type: 'Stop', name: 'Takijiri-oji trailhead', detail: 'Referenced as the trail start point.', selected: false, confidence: 'Medium confidence' },
    ];
    return { fileName: file.name, ...normalizeImportedDays(items) };
  }

  function normalizeImportedDays(items) {
    const existing = Data.getDays?.() || [];
    const dates = [...new Set(items.map(item => item.date))].filter(Boolean).sort();
    const days = dates.map((date, index) => {
      const match = existing.find(day => day.date === date);
      return { date, id: match?.id || `import-day-${date}`, label: match?.label || `D${index}`, locality: match?.locality || '', existing: !!match };
    });
    const byDate = new Map(days.map(day => [day.date, day]));
    items.forEach(item => {
      const day = byDate.get(item.date) || (existing.length === 1 ? existing[0] : null);
      if (!day) { item.day = 'Choose a day'; return; }
      item.date = day.date;
      item.day = `${day.label}${day.locality ? ` · ${day.locality}` : ''}`;
      item.dayDate = day.date;
      item.dayExisting = existing.some(candidate => candidate.id === day.id);
    });
    return { days, items };
  }

  function editImportedItem(item) {
    const days = Data.getDays?.() || [];
    const targetDay = days.find(day => day.date === item.date)
      || days.find(day => day.label === item.day?.split(' · ')[0])
      || (days.length === 1 ? days[0] : null);
    BottomSheet.openDraftStop(item, targetDay?.id, render);
  }

  function importEditorView(item) {
    const editor = el('div', 'planner-import-editor'); editor.append(el('h3', '', `Edit ${item.type.toLowerCase()}`));
    const fields = [['Name', item.name], ['Location', item.location || ''], ['Start time', item.startTime || ''], ['End time', item.endTime || ''], ['Notes', item.detail || ''], ['Booking reference', item.reference || '']];
    const day = el('select', 'planner-import-input'); const availableDays = Data.getDays?.() || []; const dayOptions = availableDays.length ? availableDays.map(candidate => `${candidate.label}${candidate.locality ? ` · ${candidate.locality}` : ''}`) : [item.day || 'Date needs review']; [...new Set([item.day || 'Date needs review', ...dayOptions])].forEach(value => { const option = el('option', '', value); option.selected = value === item.day; day.append(option); });
    const dayField = el('label', 'planner-import-field'); dayField.append(el('span', '', 'Day'), day); editor.append(dayField);
    fields.forEach(([label, value]) => { const field = el('label', 'planner-import-field'); field.append(el('span', '', label)); const input = el('input', 'planner-import-input'); input.value = value; input.dataset.field = label; field.append(input); editor.append(field); });
    const actions = el('div', 'planner-import-editor-actions'); const cancel = el('button', 'planner-secondary-action', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', () => { importEditor = null; render(); }); const save = el('button', 'planner-primary-action', 'Save changes'); save.type = 'button'; save.addEventListener('click', () => { item.day = day.value; item.name = editor.querySelector('[data-field="Name"]').value; item.location = editor.querySelector('[data-field="Location"]').value; item.startTime = editor.querySelector('[data-field="Start time"]').value; item.endTime = editor.querySelector('[data-field="End time"]').value; item.detail = editor.querySelector('[data-field="Notes"]').value; item.reference = editor.querySelector('[data-field="Booking reference"]').value; importEditor = null; render(); }); actions.append(cancel, save); editor.append(actions); return editor;
  }

  function importView() {
    const section = el('section', 'planner-section planner-import-review');
    section.append(el('p', 'planner-label', 'REVIEW IMPORTED ITINERARY'), el('h2', 'planner-proposal-title', 'Check before adding'), el('div', 'planner-import-status', 'Draft only · nothing has been added to your itinerary'), el('p', 'planner-proposal-summary', `${importReview.items.length} items found in ${importReview.fileName}. Review the classified day, stop, and accommodation records before approving.`));
    // Imported edits use the shared itinerary drawer; no inline importer form.
    section.addEventListener('click', event => { if (!event.target.closest('.planner-import-card')) return; requestAnimationFrame(() => { const button = section.querySelector('.planner-primary-action'); if (button) button.textContent = `Add ${importReview.items.filter(item => item.selected).length} selected to itinerary`; }); });
    const grouped = [...new Set(importReview.items.map(item => item.day))];
    grouped.forEach(day => { const dayWrap = el('div', 'planner-import-day'); dayWrap.append(el('h3', 'planner-import-day-title', day)); importReview.items.filter(item => item.day === day).forEach(item => { const card = el('article', `planner-import-card ${item.selected ? 'is-selected' : ''}`); const check = el('span', 'planner-stop-check'); check.innerHTML = item.selected ? Icons.check('icon-sm') : ''; const body = el('div', 'planner-stop-body'); body.append(el('p', 'planner-import-type', item.type), el('h4', 'planner-stop-name', item.name), el('p', 'planner-stop-description', item.detail || 'No description extracted.')); [['Date', item.date], ['Location', item.location], ['Time', [item.startTime, item.endTime].filter(Boolean).join(' – ')], ['Notes', item.notes], ['Reference', item.reference]].filter(([, value]) => value).forEach(([label, value]) => body.append(el('p', 'planner-import-detail', `${label}: ${value}`))); body.append(el('p', `planner-import-confidence ${item.confidence === 'Needs review' ? 'is-warning' : ''}`, item.confidence || 'Needs review'), el('p', 'planner-import-source', 'Extracted from uploaded screenshot')); const edit = el('button', 'planner-import-edit', 'Edit'); edit.type = 'button'; edit.addEventListener('click', event => { event.stopPropagation(); editImportedItem(item) }); const toggle = () => { item.selected = !item.selected; card.classList.toggle('is-selected', item.selected); check.innerHTML = item.selected ? Icons.check('icon-sm') : ''; }; card.addEventListener('click', toggle); card.append(check, body, edit); dayWrap.append(card); }); section.append(dayWrap); });
    const actions = el('div', 'planner-actions'); const back = el('button', 'planner-secondary-action', 'Back to planner'); back.type = 'button'; back.addEventListener('click', () => { importReview = null; render(); }); const add = el('button', 'planner-primary-action', `Add ${importReview.items.filter(item => item.selected).length} selected to itinerary`); add.type = 'button'; add.addEventListener('click', async () => { add.disabled = true; const days = Data.getDays(); for (const item of importReview.items.filter(entry => entry.selected)) { const day = days.find(candidate => candidate.date === item.date) || days.find(candidate => candidate.label === item.day?.split(' · ')[0]); if (!day) { Toast.show(`Choose a day for  before adding.`, 'warning'); continue; } if (item.type === 'Day') { Toast.show(`Day records are labels only; review the extracted stops before adding.`, 'warning'); continue; } if (item.type === 'Accommodation') await Data.updateOvernight(day.id, { name: item.name, address: item.location || '', checkIn: item.startTime || '', checkOut: item.endTime || '', notes: item.detail || '' }); else await Data.addStop({ dayId: day.id, name: item.name,  activity: [item.detail, item.notes].filter(Boolean).join('\n\n'), time: item.startTime || '', transport: '', transportType: 'walk', notes: [item.notes, item.reference].filter(Boolean).join(' · '), needsBooking: item.type === 'Flight' || item.type === 'Accommodation', category: item.type === 'Flight' ? 'transport' : 'activity', booking: { status: null, cost: null, costCurrency: Data.getTripCurrency?.() } }); } Toast.show('Selected imported items added ✓', 'success'); importReview = null; App.switchTo('itinerary'); }); actions.append(back, add); section.append(actions); return section;
  }

  function workspaceTabs() {
    const tabs = el('div', 'planner-workspace-tabs');
    [['itinerary', 'Suggested itinerary'], ['trending', 'Trending places']].forEach(([key, label]) => {
      const button = el('button', `planner-workspace-tab ${workspaceTab === key ? 'is-active' : ''}`, label); button.type = 'button'; button.disabled = key === 'itinerary' ? !proposal : !trendingResults;
      button.addEventListener('click', () => { workspaceTab = key; errorMessage = ''; render(); }); tabs.append(button);
    });
    return tabs;
  }

  async function requestTrending() {
    if (!plannerPrompt.trim()) { errorMessage = 'Describe the kind of places you want to discover first.'; render(); return; }
    busy = true; workspaceTab = 'trending'; trendingResults = null; errorMessage = ''; saveDraft(); render();
    try { trendingResults = await PlannerService.trending(plannerPrompt, focusDayId); trendingSelected = new Set(); saveTrending(); }
    catch (error) { errorMessage = error.message || 'Live place search failed.'; }
    finally { busy = false; render(); }
  }

  function trendingView() {
    const section = el('section', 'planner-section planner-proposal');
    section.append(el('p', 'planner-label', 'LIVE DISCOVERY'), el('h2', 'planner-proposal-title', 'Places people are talking about'));
    const map = el('div', 'planner-map'); map.setAttribute('aria-label', 'Map of discovered places'); section.append(map);
    if (trendingResults.summary) section.append(el('p', 'planner-proposal-summary', trendingResults.summary));
    (trendingResults.places || []).forEach((place, index) => {
      const chosen = trendingSelected.has(index);
      const card = el('article', `planner-stop planner-trending-card ${chosen ? 'is-selected' : ''} ${place.added ? 'is-added' : ''}`);
      const marker = el('div', 'planner-stop-marker'); marker.innerHTML = '<span></span><i></i>';
      const body = el('div', 'planner-stop-body');
      body.append(el('h3', 'planner-stop-name', place.name), el('p', 'planner-stop-description', `${place.location} · ${place.why}`), el('p', 'planner-trending-best', `Best for: ${place.bestFor}`));
      const links = el('div', 'planner-trending-links');
      [['Read source', place.sourceUrl], ['Official info', place.officialUrl], ['Open in Maps', place.mapsUrl]].forEach(([label, href]) => { if (/^https:\/\//i.test(href || '')) { const link = el('a', '', `${label} ↗`); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; links.append(link); } });
      const check = el('span', 'planner-stop-check'); check.innerHTML = chosen ? Icons.check('icon-sm') : '';
      const toggle = () => { const nowChosen = !trendingSelected.has(index); nowChosen ? trendingSelected.add(index) : trendingSelected.delete(index); card.classList.toggle('is-selected', nowChosen); check.innerHTML = nowChosen ? Icons.check('icon-sm') : ''; saveTrending(); updateAddButtons(); };
      card.addEventListener('click', toggle);
      links.addEventListener('click', event => event.stopPropagation());
      body.append(links, el('p', 'planner-trending-caveat', place.caveat || 'Verify current hours, access, and availability before going.'));
      if (place.added) body.append(el('span', 'planner-stop-added', 'Added to itinerary'));
      card.append(marker, body, check); section.append(card);
    });
    const actions = el('div', 'planner-actions');
    const back = el('button', 'planner-trending-back', 'Back to planner'); back.type = 'button'; back.addEventListener('click', () => { workspaceTab = 'itinerary'; render(); });
    const add = el('button', 'planner-primary-action'); add.type = 'button'; add.innerHTML = `${Icons.plus('icon-sm')}<span>Add ${trendingSelected.size} to itinerary</span>`; add.disabled = trendingSelected.size === 0; add.addEventListener('click', addTrendingSelected);
    actions.append(back, add); section.append(actions);
    const clear = el('button', 'planner-trending-clear', 'Clear discoveries'); clear.type = 'button'; clear.addEventListener('click', () => { clearTrending(); trendingResults = null; trendingSelected.clear(); render(); }); section.append(clear);
    setTimeout(() => plotPlaces(map, trendingResults.places || []), 0);
    return section;
  }

  function updateAddButtons() {
    const buttons = document.querySelectorAll('.planner-primary-action');
    buttons.forEach(button => { const count = proposal ? selected.size : trendingSelected.size; const label = button.querySelector('span:last-child'); if (label) label.textContent = `Add ${count} to itinerary`; else button.textContent = `Add ${count} to itinerary`; button.disabled = count === 0; });
  }

  async function addTrendingSelected() {
    const days = Data.getDays();
    const day = days.find(candidate => candidate.id === focusDayId) || days[0];
    const chosen = (trendingResults?.places || []).filter((_, index) => trendingSelected.has(index));
    if (!day || !chosen.length) return;
    busy = true; render();
    try {
      for (const place of chosen) await Data.addStop({ dayId: day.id, name: place.name, activity: place.why || '', time: '', transport: '', transportType: 'walk', notes: `${place.caveat || 'Verify current details before booking'} · Source: ${place.sourceUrl || place.officialUrl || ''}`, needsBooking: false, category: 'activity', booking: { status: null, cost: null, costCurrency: Data.getTripCurrency?.() } });
      chosen.forEach(place => { place.added = true; });
      trendingSelected.clear(); saveTrending(); workspaceTab = 'itinerary'; Toast.show(`Added ${chosen.length} place${chosen.length === 1 ? '' : 's'} ✓`, 'success'); App.switchTo('itinerary');
    } catch (error) { errorMessage = `Could not add places: ${error.message}`; }
    finally { busy = false; render(); }
  }

  async function plotPlaces(node, places, onMarkerClick) {
    if (!window.L || !node || !places.length) return;
    const points = [];
    for (const place of places) {
      try {
        const search = async query => { const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&namedetails=1&addressdetails=1&limit=1&q=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json', 'User-Agent': 'AfricaTripCompanion/1.0' } }); return (await response.json())[0]; };
        let hit = await search(`${place.name}, ${place.location}`);
        if (!hit && place.location) hit = await search(place.location);
        if (hit) {
          const overlap = points.filter(point => Math.abs(point.lat - Number(hit.lat)) < 0.0005 && Math.abs(point.lon - Number(hit.lon)) < 0.0005).length;
          points.push({ place, lat: Number(hit.lat) + overlap * 0.0012, lon: Number(hit.lon) + overlap * 0.0012, approximate: !isVerifiedVenue(place, hit) });
        }
        await new Promise(resolve => setTimeout(resolve, 1100));
      } catch (_) {}
    }
    if (!points.length || !document.body.contains(node)) return;
    mapInstance?.remove();
    mapInstance = L.map(node, { zoomControl: false, attributionControl: true }).setView([points[0].lat, points[0].lon], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(mapInstance);
    const bounds = [];
    points.forEach((point, index) => { const marker = point.approximate ? L.circle([point.lat, point.lon], { radius: 650, color: '#c75a45', fillColor: '#c75a45', fillOpacity: 0.16, weight: 2 }).addTo(mapInstance) : L.marker([point.lat, point.lon]).addTo(mapInstance); marker.bindPopup(`<strong>${index + 1}. ${escapeHtml(point.place.name)}</strong><br>${escapeHtml(point.place.location)}${point.approximate ? '<br><em>Area recommendation — not an exact venue</em>' : ''}`); marker.on('click', () => onMarkerClick?.(point)); bounds.push([point.lat, point.lon]); });
    if (bounds.length > 1) mapInstance.fitBounds(bounds, { padding: [18, 18] });
  }

  function isVerifiedVenue(place, hit) {
    const venueClasses = new Set(['amenity', 'shop', 'tourism', 'leisure', 'office', 'craft']);
    if (!venueClasses.has(hit.class)) return false;
    const wanted = String(place.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const returned = String(hit.display_name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
    const words = wanted.split(' ').filter(word => word.length > 2);
    return words.length > 0 && words.filter(word => returned.includes(word)).length >= Math.max(1, Math.ceil(words.length * 0.55));
  }

  function escapeHtml(value) { return String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }

  function inferLocationPrecision(item) {
    if (item.locationPrecision) return item.locationPrecision;
    const name = String(item.name || '').toLowerCase();
    return /roaster|cafe|coffee|restaurant|market|museum|gallery|hotel|bakery|bar|temple|shop|store/.test(name) ? 'exact' : 'area';
  }

  async function requestProposal() {
    if (!plannerPrompt.trim()) { errorMessage = 'Tell me what kind of day you want first.'; render(); return; }
    busy = true; proposal = null; errorMessage = ''; selected.clear(); render();
    try {
      proposal = await PlannerService.suggest(plannerPrompt, focusDayId);
      selected = new Set((proposal.items || []).map((_, index) => index));
      saveDraft();
    } catch (error) {
      errorMessage = error.message || 'The planner hit a problem. Your daily allowance was not charged.';
    } finally { busy = false; render(); }
  }

  function loadingView() {
    const wrap = el('section', 'planner-section planner-loading');
    wrap.append(el('p', 'planner-label', 'BUILDING YOUR DRAFT'));
    for (let i = 0; i < 2; i++) {
      const card = el('div', 'planner-skeleton-card');
      card.innerHTML = '<span></span><div><i></i><i></i><i></i></div>';
      wrap.append(card);
    }
    wrap.append(el('p', 'planner-loading-note', 'Checking the timing against your existing plans…'));
    return wrap;
  }

  function errorView() {
    const card = el('section', 'planner-error-card');
    const icon = el('div', 'planner-error-icon'); icon.innerHTML = Icons.refresh('icon-md');
    const body = el('div');
    body.append(el('p', 'planner-error-title', 'That plan didn’t come together'), el('p', 'planner-error-copy', errorMessage));
    const retry = el('button', 'planner-error-retry', 'Try again');
    retry.type = 'button'; retry.addEventListener('click', requestProposal); body.append(retry);
    card.append(icon, body); return card;
  }

  function proposalView() {
    const section = el('section', 'planner-section planner-proposal');
    const intro = el('div', 'planner-proposal-intro');
    intro.append(el('p', 'planner-label', 'YOUR DRAFT'), el('h2', 'planner-proposal-title', proposal.title || 'A plan for your day'));
    if (proposal.summary) intro.append(el('p', 'planner-proposal-summary', proposal.summary));
    const saved = el('div', 'planner-draft-saved');
    saved.append(el('span', '', 'Saved on this device'));
    const discard = el('button', 'planner-draft-discard', 'Discard draft'); discard.type = 'button';
    discard.addEventListener('click', () => { clearDraft(); proposal = null; selected.clear(); render(); });
    saved.append(discard); intro.append(saved);
    section.append(intro);
    const routeMap = el('div', 'planner-map'); routeMap.setAttribute('aria-label', 'Map of itinerary suggestions'); section.append(routeMap);
    const timeline = el('div', 'planner-timeline');
    (proposal.items || []).forEach((item, index) => {
      const chosen = selected.has(index);
      const card = el('div', `planner-stop ${chosen ? 'is-selected' : ''} ${item.added ? 'is-added' : ''}`);
      card.id = `planner-stop-${index}`;
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      const toggle = () => { const nowChosen = !selected.has(index); nowChosen ? selected.add(index) : selected.delete(index); saveDraft(); card.classList.toggle('is-selected', nowChosen); check.innerHTML = nowChosen ? Icons.check('icon-sm') : ''; updateAddButtons(); };
      card.addEventListener('click', toggle);
      card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } });
      const time = [item.startTime, item.endTime].filter(Boolean).join(' – ') || 'Flexible';
      const marker = el('div', 'planner-stop-marker'); marker.innerHTML = '<span></span><i></i>';
      const body = el('div', 'planner-stop-body');
      body.append(el('p', 'planner-stop-time', time), el('h3', 'planner-stop-name', item.name));
      if (item.description) body.append(el('p', 'planner-stop-description', item.description));
      const referenceUrl = getReferenceUrl(item);
      const reference = el('a', 'planner-stop-reference', 'More information ↗');
      reference.href = referenceUrl;
      reference.target = '_blank';
      reference.rel = 'noopener noreferrer';
      reference.addEventListener('click', event => event.stopPropagation());
      body.append(reference);
      if (item.added) body.append(el('span', 'planner-stop-added', 'Added to itinerary'));
      const meta = el('div', 'planner-stop-meta');
      if (item.estimatedCost != null) meta.append(el('span', '', `Est. ${item.estimatedCost} ${proposal.currency || ''}`));
      if (item.bookingRequired) meta.append(el('span', '', 'Book ahead'));
      body.append(meta);
      const check = el('span', 'planner-stop-check'); check.innerHTML = chosen ? Icons.check('icon-sm') : '';
      card.append(marker, body, check); timeline.append(card);
    });
    section.append(timeline);
    setTimeout(() => plotPlaces(routeMap, (proposal.items || []).map((item, index) => ({ name: item.name, location: Data.getDays().find(day => day.date === item.dayDate)?.locality || '', why: item.description || '', index, locationPrecision: inferLocationPrecision(item) })), point => { const card = document.getElementById(`planner-stop-${point.place.index}`); if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('is-map-focused'); setTimeout(() => card.classList.remove('is-map-focused'), 1200); } }), 0);
    if (proposal.caveats?.length) {
      const note = el('div', 'planner-caveat'); note.innerHTML = Icons.info('icon-sm');
      note.append(el('p', '', proposal.caveats.join(' · '))); section.append(note);
    }
    const actions = el('div', 'planner-actions');
    const reset = el('button', 'planner-secondary-action', 'Try another idea');
    reset.type = 'button'; reset.addEventListener('click', () => { clearDraft(); proposal = null; selected.clear(); errorMessage = ''; render(); });
    const add = el('button', 'planner-primary-action');
    add.type = 'button'; add.innerHTML = `${Icons.plus('icon-sm')}<span>Add ${selected.size} to itinerary</span>`;
    add.disabled = selected.size === 0; add.addEventListener('click', addSelected);
    actions.append(reset, add); section.append(actions); updateAddButtons(); return section;
  }

  function getReferenceUrl(item) {
    if (typeof item.referenceUrl === 'string' && /^https:\/\//i.test(item.referenceUrl)) return item.referenceUrl;
    const day = Data.getDays().find(candidate => candidate.date === item.dayDate);
    const locality = day?.locality || Data.getCurrentTrip?.()?.name || '';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.name}${locality ? `, ${locality}` : ''}`)}`;
  }

  async function addSelected() {
    const days = Data.getDays();
    const chosen = (proposal.items || []).filter((_, index) => selected.has(index));
    if (chosen.some(item => !days.some(day => day.date === item.dayDate))) {
      errorMessage = 'A suggestion falls outside this trip. Choose a specific day and generate it again.';
      proposal = null; render(); return;
    }
    busy = true;
    try {
      for (const item of chosen) {
        const day = days.find(d => d.date === item.dayDate);
        await Data.addStop({
          dayId: day.id, name: item.name, activity: item.description || '', time: item.startTime || '',
          transport: item.transport || '', transportType: item.transportType || 'walk',
          notes: item.notes || 'Suggested by AI · verify current details before booking',
          needsBooking: !!item.bookingRequired, category: item.category || 'activity',
          booking: { status: item.bookingRequired ? 'open' : null, cost: item.estimatedCost ?? null, costCurrency: proposal.currency || Data.getTripCurrency?.() },
        });
      }
      chosen.forEach(item => { item.added = true; });
      selected = new Set([...selected].filter(index => !chosen.includes(proposal.items[index])));
      saveDraft();
      Toast.show(`Added ${chosen.length} suggestion${chosen.length === 1 ? '' : 's'} ✓`, 'success');
      App.switchTo('itinerary');
    } catch (error) { errorMessage = `Could not add the draft: ${error.message}`; render(); }
    finally { busy = false; }
  }

  function render() {
    syncTripContext();
    if (!root) return;
    root.innerHTML = ''; root.className = 'planner-screen';
    root.append(header(), dayPicker(), composer());
    if (importReview) { root.append(importView()); return; }
    if (proposal || trendingResults) root.append(workspaceTabs());
    if (busy) root.append(loadingView());
    else if (errorMessage) root.append(errorView());
    else if (workspaceTab === 'trending' && trendingResults) root.append(trendingView());
    else if (proposal) root.append(proposalView());
    else if (trendingResults) root.append(trendingView());
  }

  return { init(node) { root = node; loadedTripKey = ''; render(); }, destroy() { root = null; } };
})();

window.PlannerScreen = PlannerScreen;
