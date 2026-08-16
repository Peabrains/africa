'use strict';

const PlannerScreen = (() => {
  let root = null;
  let proposal = null;
  let selected = new Set();
  let busy = false;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function header() {
    const row = el('div');
    row.style.cssText = 'display:flex;align-items:center;gap:var(--s3);padding:var(--s3) var(--s4);border-bottom:1px solid var(--border);';
    const back = el('button', 'btn btn-ghost', '← Itinerary');
    back.style.padding = '7px 10px';
    back.addEventListener('click', () => App.switchTo('itinerary'));
    const copy = el('div');
    copy.append(el('p', '', 'AI trip planner'), el('p', '', 'Suggestions are drafts — you approve every stop.'));
    copy.firstChild.style.cssText = 'font-weight:700;color:var(--text-primary)';
    copy.lastChild.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted);margin-top:2px';
    row.append(back, copy);
    return row;
  }

  function composer() {
    const wrap = el('div');
    wrap.style.cssText = 'padding:var(--s4);';
    const intro = el('div');
    intro.style.cssText = 'padding:var(--s4);background:var(--accent-subtle);border:1px solid var(--border);border-radius:var(--r-lg);margin-bottom:var(--s3)';
    intro.append(
      el('p', '', '✦ What would make this trip better?'),
      el('p', '', 'Try “Plan a relaxed food and culture afternoon under USD 100.”')
    );
    intro.firstChild.style.cssText = 'font-weight:700;color:var(--text-primary)';
    intro.lastChild.style.cssText = 'font-size:var(--text-sm);color:var(--text-secondary);line-height:1.45;margin-top:5px';

    const daySelect = el('select', 'form-input');
    daySelect.id = 'planner-day';
    daySelect.append(new Option('Whole trip / choose for me', ''));
    Data.getDays().forEach(day => daySelect.append(new Option(`${day.label} · ${day.date} · ${day.locality || day.title}`, day.id)));
    daySelect.style.marginBottom = 'var(--s2)';

    const input = el('textarea', 'form-input');
    input.id = 'planner-prompt';
    input.rows = 4;
    input.maxLength = 1200;
    input.placeholder = 'Describe the day, interests, pace and budget…';
    input.style.resize = 'vertical';

    const submit = el('button', 'btn btn-primary bs-full-btn', busy ? 'Planning…' : 'Create suggestions');
    submit.disabled = busy;
    submit.style.marginTop = 'var(--s2)';
    submit.addEventListener('click', async () => {
      busy = true; proposal = null; selected.clear(); render();
      try {
        proposal = await PlannerService.suggest(input.value, daySelect.value);
        selected = new Set((proposal.items || []).map((_, i) => i));
      } catch (e) {
        Toast.show(e.message, 'warning');
      } finally {
        busy = false; render();
      }
    });
    wrap.append(intro, daySelect, input, submit);
    return wrap;
  }

  function proposalView() {
    const wrap = el('div');
    wrap.style.cssText = 'padding:0 var(--s4) var(--s6)';
    const heading = el('div');
    heading.style.cssText = 'margin-bottom:var(--s3)';
    heading.append(el('p', '', proposal.title || 'Suggested itinerary'), el('p', '', proposal.summary || ''));
    heading.firstChild.style.cssText = 'font-size:var(--text-lg);font-weight:700;color:var(--text-primary)';
    heading.lastChild.style.cssText = 'font-size:var(--text-sm);line-height:1.45;color:var(--text-secondary);margin-top:4px';
    wrap.append(heading);

    (proposal.items || []).forEach((item, index) => {
      const card = el('label', 'card');
      card.style.cssText = 'display:flex;align-items:flex-start;gap:var(--s3);padding:var(--s3);margin-bottom:var(--s2);cursor:pointer';
      const check = document.createElement('input');
      check.type = 'checkbox'; check.checked = selected.has(index); check.style.marginTop = '4px';
      check.addEventListener('change', () => check.checked ? selected.add(index) : selected.delete(index));
      const body = el('div'); body.style.flex = '1';
      const time = [item.startTime, item.endTime].filter(Boolean).join('–');
      body.append(el('p', '', `${time ? time + ' · ' : ''}${item.name}`));
      body.firstChild.style.cssText = 'font-weight:700;color:var(--text-primary)';
      if (item.description) {
        const desc = el('p', '', item.description);
        desc.style.cssText = 'font-size:var(--text-sm);color:var(--text-secondary);line-height:1.4;margin-top:4px';
        body.append(desc);
      }
      const metaParts = [item.dayDate, item.estimatedCost != null ? `Est. ${item.estimatedCost} ${proposal.currency || ''}` : '', item.bookingRequired ? 'Booking suggested' : ''];
      const meta = el('p', '', metaParts.filter(Boolean).join(' · '));
      meta.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted);margin-top:6px';
      body.append(meta); card.append(check, body); wrap.append(card);
    });

    if (proposal.caveats?.length) {
      const caveat = el('p', '', `Check before booking: ${proposal.caveats.join(' · ')}`);
      caveat.style.cssText = 'font-size:var(--text-xs);color:var(--warning-text);line-height:1.4;margin:var(--s3) 0';
      wrap.append(caveat);
    }

    const add = el('button', 'btn btn-primary bs-full-btn', 'Add selected to itinerary');
    add.addEventListener('click', addSelected);
    const retry = el('button', 'btn btn-ghost bs-full-btn', 'Start over');
    retry.style.marginTop = 'var(--s2)';
    retry.addEventListener('click', () => { proposal = null; selected.clear(); render(); });
    wrap.append(add, retry);
    return wrap;
  }

  async function addSelected() {
    const days = Data.getDays();
    const chosen = (proposal.items || []).filter((_, i) => selected.has(i));
    if (!chosen.length) return Toast.show('Select at least one suggestion.', 'warning');
    const unmatched = chosen.filter(item => !days.some(day => day.date === item.dayDate));
    if (unmatched.length) return Toast.show('One or more suggestions fall outside this trip. Choose a specific trip day and try again.', 'warning');
    busy = true;
    try {
      for (const item of chosen) {
        const day = days.find(d => d.date === item.dayDate);
        await Data.addStop({
          dayId: day.id,
          name: item.name,
          activity: item.description || '',
          time: item.startTime || '',
          transport: item.transport || '',
          transportType: item.transportType || 'walk',
          notes: item.notes || 'Suggested by AI · verify current details before booking',
          needsBooking: !!item.bookingRequired,
          category: item.category || 'activity',
          booking: { status: item.bookingRequired ? 'open' : null, cost: item.estimatedCost ?? null, costCurrency: proposal.currency || Data.getTripCurrency?.() },
        });
      }
      Toast.show(`Added ${chosen.length} suggestion${chosen.length === 1 ? '' : 's'} ✓`, 'success');
      App.switchTo('itinerary');
    } catch (e) {
      Toast.show(`Could not add suggestions: ${e.message}`, 'warning');
    } finally { busy = false; }
  }

  function render() {
    if (!root) return;
    root.innerHTML = '';
    root.append(header(), composer());
    if (proposal) root.append(proposalView());
  }

  return {
    init(node) { root = node; render(); },
    destroy() { root = null; },
  };
})();

window.PlannerScreen = PlannerScreen;
