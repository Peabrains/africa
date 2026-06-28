'use strict';

/* ── Pre-loaded guide links (from Kumano Kodo Sheet) ────────── */
const GUIDE_LINKS = [
  {
    section: 'Kumano Kodo Trail',
    icon: '🗾',
    items: [
      { title:'Nakahechi Route Map',           desc:'Takijiri → Takahara (PDF)',          url:'https://www2.tb-kumano.jp/en/kumano-kodo/pdf/Kumano-Kodo-Nakahechi-Route-Maps-Takijiri-Takahara.pdf' },
      { title:'Nachisan Travel Guide',          desc:'Nachi Taisha & waterfall area',      url:'https://visitwakayama.jp/en/stories/detail_539.html' },
      { title:'Bus: Kii-Tanabe → Hongu',        desc:'Ryujin bus schedule (PDF)',           url:'http://www2.tb-kumano.jp/en/transport/pdf/Tanabe-Shirahama-to-Hongu-bus.pdf' },
      { title:'Bus: Hongu → Shingu',            desc:'Bus schedule (PDF)',                  url:'http://www2.tb-kumano.jp/en/transport/pdf/Hongu-Koguchi-Shingu-bus.pdf' },
      { title:'Bus: Hongu ↔ Kawayu ↔ Yunomine',desc:'Hot spring shuttle (PDF)',           url:'http://www2.tb-kumano.jp/en/transport/pdf/Hongu-Kawayu-Yunomine-bus.pdf' },
      { title:'Bus: Nachi ↔ Kii-Katsuura',      desc:'Bus schedule (PDF)',                  url:'https://www2.tb-kumano.jp/en/transport/pdf/Nachi-Kii-Katsuura-bus.pdf' },
    ]
  },
  {
    section: 'Alpine Route & Murodo',
    icon: '🏔',
    items: [
      { title:'Murodo Walks Map',               desc:'Official plateau guide (PDF)',        url:'https://www.alpen-route.com/en/assets_v2/file/walks_map.pdf' },
      { title:'Timetable: Nagano → Toyama',     desc:'Alpine Route 2026 (PDF)',             url:'https://www.alpen-route.com/en/wp-content/uploads/2026/04/2026_timetable_nagano-toyamaedit.pdf' },
      { title:'Timetable: Toyama → Nagano',     desc:'Alpine Route 2026 (PDF)',             url:'https://www.alpen-route.com/en/wp-content/uploads/2026/04/2026_timetable_toyama-naganoedit-1.pdf' },
      { title:'Alpine Route Booking Portal',    desc:'Reserve tickets online',              url:'https://tateyama-kurobe-webservice.jp/AlpenTour/html/VW001W0010.html?lang=en' },
    ]
  },
];

const SOSScreen = (() => {
  let root;

  /* ── Standard SOS info section ───────────────────────────── */
  function section(title, rows, iconName) {
    const div = document.createElement('div');
    div.className = 'sos-section';
    const h = document.createElement('p');
    h.className = 'sos-section-title';
    h.textContent = title;
    div.appendChild(h);

    rows.forEach(row => {
      const item = document.createElement('div');
      item.className = 'card sos-item';
      const iconSpan = document.createElement('span');
      iconSpan.innerHTML = Icons[iconName]?.('icon-md') || '';
      iconSpan.style.color = 'var(--accent)';
      iconSpan.style.flexShrink = '0';
      const textDiv = document.createElement('div');
      textDiv.style.flex = '1';
      const label = document.createElement('p');
      label.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted)';
      label.textContent = row.label;
      const value = document.createElement('p');
      value.style.cssText = 'font-size:var(--text-sm);font-weight:500;color:var(--text-primary);margin-top:2px';
      value.textContent = row.value || row.jp || '';
      textDiv.appendChild(label);
      textDiv.appendChild(value);
      if (row.jp && row.value) {
        const jp = document.createElement('p');
        jp.style.cssText = 'font-size:var(--text-xs);color:var(--text-secondary);margin-top:2px';
        jp.textContent = row.jp;
        textDiv.appendChild(jp);
      }
      item.appendChild(iconSpan);
      item.appendChild(textDiv);
      const copyText = row.value || row.jp || '';
      if (copyText && copyText !== 'Confirm when collected') {
        const copyBtn = document.createElement('button');
        copyBtn.style.cssText = 'background:var(--surface-raised);border:1px solid var(--border);border-radius:var(--r-sm);padding:3px 8px;font-size:var(--text-xs);color:var(--text-secondary);flex-shrink:0;cursor:pointer;font-family:var(--font)';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', () => {
          const full = row.jp ? `${row.value||''}\n${row.jp}` : copyText;
          navigator.clipboard?.writeText(full).then(() => {
            copyBtn.textContent = '✓';
            setTimeout(() => copyBtn.textContent = 'Copy', 1500);
            Toast.show(`Copied: ${row.label}`, 'success');
          }).catch(() => Toast.show('Copy failed', 'warning'));
        });
        item.appendChild(copyBtn);
      }
      div.appendChild(item);
    });
    return div;
  }

  /* ── Link card ────────────────────────────────────────────── */
  function linkCard(title, desc, url, onDelete) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'margin-bottom:var(--s2);display:flex;align-items:center;gap:var(--s2);padding:10px var(--s3);min-height:44px';

    const text = document.createElement('div');
    text.style.flex = '1';
    const t = document.createElement('p');
    t.style.cssText = 'font-size:var(--text-sm);font-weight:500;color:var(--text-primary)';
    t.textContent = title;
    const d = document.createElement('p');
    d.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px';
    d.textContent = desc || url;
    text.appendChild(t);
    text.appendChild(d);
    card.appendChild(text);

    const openBtn = document.createElement('button');
    openBtn.style.cssText = 'background:var(--accent);color:#fff;border:none;border-radius:var(--r-sm);padding:4px 10px;font-size:var(--text-xs);cursor:pointer;flex-shrink:0;font-family:var(--font)';
    openBtn.textContent = 'Open ↗';
    openBtn.addEventListener('click', () => window.open(url, '_blank'));
    card.appendChild(openBtn);

    if (onDelete) {
      const del = document.createElement('button');
      del.style.cssText = 'background:none;border:none;color:var(--text-muted);font-size:16px;cursor:pointer;padding:0 2px;flex-shrink:0;line-height:1';
      del.textContent = '×';
      del.addEventListener('click', onDelete);
      card.appendChild(del);
    }
    return card;
  }

  /* ── References & Guides section ─────────────────────────── */
  function renderGuides() {
    const wrap = document.createElement('div');
    wrap.className = 'sos-section';

    const h = document.createElement('p');
    h.className = 'sos-section-title';
    h.textContent = 'References & Guides';
    wrap.appendChild(h);

    // Pre-loaded guides grouped by section
    GUIDE_LINKS.forEach(group => {
      const groupHead = document.createElement('p');
      groupHead.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted);font-weight:500;text-transform:uppercase;letter-spacing:.04em;padding:var(--s3) 0 var(--s2)';
      groupHead.textContent = `${group.icon} ${group.section}`;
      wrap.appendChild(groupHead);
      group.items.forEach(item => wrap.appendChild(linkCard(item.title, item.desc, item.url)));
    });

    // Custom links
    const customLinks = Data.getCustomLinks?.() || [];
    const myHead = document.createElement('p');
    myHead.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted);font-weight:500;text-transform:uppercase;letter-spacing:.04em;padding:var(--s3) 0 var(--s2);display:flex;align-items:center;justify-content:space-between';
    myHead.innerHTML = '<span>🔖 My links</span>';
    wrap.appendChild(myHead);

    if (!customLinks.length) {
      const em = document.createElement('p');
      em.style.cssText = 'font-size:var(--text-sm);color:var(--text-muted);font-style:italic;margin-bottom:var(--s3)';
      em.textContent = 'No custom links yet.';
      wrap.appendChild(em);
    } else {
      customLinks.forEach(link => {
        wrap.appendChild(linkCard(link.title, link.url, link.url, async () => {
          await Data.deleteCustomLink(link.id);
          Toast.show('Link removed', 'info');
          render();
        }));
      });
    }

    // Add link form
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-ghost';
    addBtn.style.cssText = 'width:100%;margin-top:var(--s2)';
    addBtn.textContent = '+ Add custom link';
    wrap.appendChild(addBtn);

    const addForm = document.createElement('div');
    addForm.style.cssText = 'display:none;flex-direction:column;gap:var(--s2);margin-top:var(--s2)';
    const dayOpts = Data.getDays().map(d =>
      `<option value="${d.id}">${d.label} · ${d.date}</option>`).join('');
    addForm.innerHTML = `
      <input id="cl-title" class="bs-input" type="text" placeholder="Title (e.g. Hotel confirmation)">
      <input id="cl-url"   class="bs-input" type="url"  placeholder="https://...">
      <div class="bs-edit-group">
        <label class="bs-edit-label" for="cl-day">Show on day (optional)</label>
        <select id="cl-day" class="bs-input">
          <option value="">SOS only</option>
          ${dayOpts}
        </select>
      </div>
      <div style="display:flex;gap:var(--s2)">
        <button class="btn btn-primary" id="cl-save" style="flex:1">Save</button>
        <button class="btn btn-ghost"   id="cl-cancel" style="flex:1">Cancel</button>
      </div>`;
    wrap.appendChild(addForm);

    addBtn.addEventListener('click', () => {
      addBtn.style.display = 'none';
      addForm.style.display = 'flex';
      addForm.querySelector('#cl-title')?.focus();
    });

    addForm.querySelector('#cl-save')?.addEventListener('click', async () => {
      const title = addForm.querySelector('#cl-title')?.value?.trim();
      const url   = addForm.querySelector('#cl-url')?.value?.trim();
      if (!title || !url) { Toast.show('Title and URL required', 'warning'); return; }
      const dayId = addForm.querySelector('#cl-day')?.value || null;
      await Data.addCustomLink({ title, url, dayId: dayId || null });
      Toast.show('Link saved', 'success');
      render();
    });

    addForm.querySelector('#cl-cancel')?.addEventListener('click', () => {
      addForm.style.display = 'none';
      addBtn.style.display = 'block';
    });

    return wrap;
  }

  /* ── Print content ────────────────────────────────────────── */
  function buildPrintContent(sos) {
    let el = document.getElementById('sos-print-content');
    if (!el) { el = document.createElement('div'); el.id = 'sos-print-content'; document.body.appendChild(el); }
    el.innerHTML = `
      <div class="print-header">
        <p class="print-title">🇲🇾 Japan Trip — SOS Card</p>
        <p class="print-sub">Apr 9–23 · 2 pax · Kumano Kodo → Togakushi → Alpine Route → Osaka</p>
      </div>
      <div class="print-section print-emergency">
        <p class="print-section-title">Emergency numbers</p>
        ${sos.emergency.map(e=>`<div class="print-row"><span class="print-label">${e.label}</span><span class="print-value">${e.value}</span></div>`).join('')}
      </div>
      <div class="print-section">
        <p class="print-section-title">Lodging</p>
        ${sos.lodging.map(l=>`<div class="print-row"><span class="print-label">${l.label}</span><div><span class="print-value">${l.value}</span>${l.jp?`<span class="print-jp"> · ${l.jp}</span>`:''}</div></div>`).join('')}
      </div>
      <div class="print-section">
        <p class="print-section-title">Passes</p>
        ${sos.passes.map(p=>`<div class="print-row"><span class="print-label">${p.label}</span><span class="print-value">${p.value}</span></div>`).join('')}
      </div>
      <div class="print-section">
        <p class="print-section-title">Addresses in Japanese</p>
        ${sos.addresses.map(a=>`<div class="print-row"><span class="print-label">${a.label}</span><span class="print-value print-jp">${a.jp}</span></div>`).join('')}
      </div>
      <div class="print-footer">Printed from Japan Trip PWA · Keep this card accessible offline</div>`;
  }

  /* ── Main render ─────────────────────────────────────────── */
  function render() {
    if (!root) return;
    root.innerHTML = '';
    const sos = Data.getSOS();

    const banner = document.createElement('div');
    banner.className = 'sos-banner';
    banner.innerHTML = `${Icons.shield('icon-md')}<div><p style="font-weight:500;font-size:var(--text-sm);color:var(--danger-text)">Offline SOS card</p><p style="font-size:var(--text-xs);color:var(--danger-text);opacity:.8;margin-top:2px">Cached · works without data</p></div>`;
    root.appendChild(banner);

    root.appendChild(section('Emergency numbers',       sos.emergency, 'phone'));
    root.appendChild(section('Lodging',                 sos.lodging,   'building'));
    root.appendChild(section('Passes & documents',      sos.passes,    'card'));
    root.appendChild(section('Addresses in Japanese',   sos.addresses.map(a=>({label:a.label,value:a.jp})), 'language'));
    root.appendChild(renderGuides());

    buildPrintContent(sos);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-ghost';
    exportBtn.style.cssText = 'width:calc(100% - 2*var(--s3));margin:var(--s4) var(--s3)';
    exportBtn.innerHTML = `${Icons.download('icon-sm')} Save as PDF`;
    exportBtn.addEventListener('click', () => { Toast.show('Opening print dialog…','info'); setTimeout(() => window.print(), 300); });
    root.appendChild(exportBtn);
  }

  return {
    init(el) { root = el; render(); },
    destroy() { root = null; },
    refresh() { render(); },
  };
})();

window.SOSScreen = SOSScreen;
