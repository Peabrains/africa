'use strict';

const PlannerScreen = (() => {
  let root = null, proposal = null, trendingResults = null, busy = false, prompt = '', focusDayId = '', errorMessage = '';
  let selected = new Set();
  const DRAFT_KEY = 'africa-ai-planner-draft-v1';
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
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ tripKey: Data.getCurrentTrip?.()?.id || Data.getTripName?.() || 'trip', proposal, prompt, focusDayId, selected: [...selected], savedAt: Date.now() })); } catch (_) {}
  }

  function restoreDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      const tripKey = Data.getCurrentTrip?.()?.id || Data.getTripName?.() || 'trip';
      if (!draft || draft.tripKey !== tripKey || !draft.proposal?.items?.length) return;
      proposal = draft.proposal; prompt = draft.prompt || ''; focusDayId = draft.focusDayId || '';
      selected = new Set(Array.isArray(draft.selected) ? draft.selected : draft.proposal.items.map((_, i) => i));
    } catch (_) {}
  }

  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (_) {} }

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
    textarea.rows = 5; textarea.maxLength = 1200; textarea.value = prompt;
    textarea.placeholder = 'A quiet afternoon, somewhere beautiful for sunset, dinner under USD 80…';
    textarea.setAttribute('aria-label', 'Describe your ideal itinerary');
    const count = el('span', 'planner-count', `${prompt.length}/1200`);
    textarea.addEventListener('input', () => { prompt = textarea.value; count.textContent = `${prompt.length}/1200`; });
    card.append(textarea);
    const quick = el('div', 'planner-quick-rail');
    QUICK_PROMPTS.forEach(([label, value]) => {
      const chip = el('button', 'planner-quick-chip', label);
      chip.type = 'button';
      chip.addEventListener('click', () => { prompt = value; textarea.value = value; count.textContent = `${value.length}/1200`; textarea.focus(); });
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
    return section;
  }

  async function requestTrending() {
    if (!prompt.trim()) { errorMessage = 'Describe the kind of places you want to discover first.'; render(); return; }
    busy = true; trendingResults = null; errorMessage = ''; saveDraft(); render();
    try { trendingResults = await PlannerService.trending(prompt, focusDayId); }
    catch (error) { errorMessage = error.message || 'Live place search failed.'; }
    finally { busy = false; render(); }
  }

  function trendingView() {
    const section = el('section', 'planner-section planner-proposal');
    section.append(el('p', 'planner-label', 'LIVE DISCOVERY'), el('h2', 'planner-proposal-title', 'Places people are talking about'));
    if (trendingResults.summary) section.append(el('p', 'planner-proposal-summary', trendingResults.summary));
    (trendingResults.places || []).forEach(place => {
      const card = el('article', 'planner-trending-card');
      card.append(el('h3', 'planner-stop-name', place.name), el('p', 'planner-stop-description', `${place.location} · ${place.why}`), el('p', 'planner-trending-best', `Best for: ${place.bestFor}`));
      const links = el('div', 'planner-trending-links');
      [['Read source', place.sourceUrl], ['Official info', place.officialUrl], ['Open in Maps', place.mapsUrl]].forEach(([label, href]) => { if (/^https:\/\//i.test(href || '')) { const link = el('a', '', `${label} ↗`); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; links.append(link); } });
      card.append(links, el('p', 'planner-trending-caveat', place.caveat || 'Verify current hours, access, and availability before going.')); section.append(card);
    });
    const back = el('button', 'planner-trending-back', 'Back to planner'); back.type = 'button'; back.addEventListener('click', () => { trendingResults = null; render(); }); section.append(back); return section;
  }

  async function requestProposal() {
    if (!prompt.trim()) { errorMessage = 'Tell me what kind of day you want first.'; render(); return; }
    busy = true; proposal = null; errorMessage = ''; selected.clear(); render();
    try {
      proposal = await PlannerService.suggest(prompt, focusDayId);
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
    const timeline = el('div', 'planner-timeline');
    (proposal.items || []).forEach((item, index) => {
      const chosen = selected.has(index);
      const card = el('div', `planner-stop ${chosen ? 'is-selected' : ''}`);
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      const toggle = () => { chosen ? selected.delete(index) : selected.add(index); saveDraft(); render(); };
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
      const meta = el('div', 'planner-stop-meta');
      if (item.estimatedCost != null) meta.append(el('span', '', `Est. ${item.estimatedCost} ${proposal.currency || ''}`));
      if (item.bookingRequired) meta.append(el('span', '', 'Book ahead'));
      body.append(meta);
      const check = el('span', 'planner-stop-check'); check.innerHTML = chosen ? Icons.check('icon-sm') : '';
      card.append(marker, body, check); timeline.append(card);
    });
    section.append(timeline);
    if (proposal.caveats?.length) {
      const note = el('div', 'planner-caveat'); note.innerHTML = Icons.info('icon-sm');
      note.append(el('p', '', proposal.caveats.join(' · '))); section.append(note);
    }
    const actions = el('div', 'planner-actions');
    const reset = el('button', 'planner-secondary-action', 'Try another idea');
    reset.type = 'button'; reset.addEventListener('click', () => { clearDraft(); proposal = null; selected.clear(); errorMessage = ''; render(); });
    const add = el('button', 'planner-primary-action');
    add.type = 'button'; add.innerHTML = `${Icons.plus('icon-sm')}<span>Add ${selected.size || ''} to itinerary</span>`;
    add.disabled = selected.size === 0; add.addEventListener('click', addSelected);
    actions.append(reset, add); section.append(actions); return section;
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
      clearDraft();
      Toast.show(`Added ${chosen.length} suggestion${chosen.length === 1 ? '' : 's'} ✓`, 'success');
      App.switchTo('itinerary');
    } catch (error) { errorMessage = `Could not add the draft: ${error.message}`; render(); }
    finally { busy = false; }
  }

  function render() {
    if (!root) return;
    root.innerHTML = ''; root.className = 'planner-screen';
    root.append(header(), dayPicker(), composer());
    if (busy) root.append(loadingView());
    else if (errorMessage) root.append(errorView());
    else if (trendingResults) root.append(trendingView());
    else if (proposal) root.append(proposalView());
  }

  return { init(node) { root = node; restoreDraft(); render(); }, destroy() { root = null; } };
})();

window.PlannerScreen = PlannerScreen;
