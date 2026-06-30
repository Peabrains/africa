'use strict';

/* ── Pre-loaded guide links — Africa ────────────────────────── */
const GUIDE_LINKS = [
  {
    section:'Tanzania — Serengeti & Ngorongoro', icon:'🇹🇿',
    items:[
      {title:'Serengeti National Park',         desc:'Official Tanzania Parks Authority',   url:'https://www.tanzaniaparks.go.tz/parks/serengeti-national-park'},
      {title:'Ngorongoro Conservation Area',    desc:'Official NCA Authority',              url:'https://ncaa.go.tz'},
      {title:'Asilia Africa Camps',             desc:'The Highlands, Dunia & Olakira info', url:'https://www.asiliaafrica.com'},
      {title:'AMREF Flying Doctors (TZ)',       desc:'Emergency evacuation Tanzania',       url:'https://flydoc.org'},
    ]
  },
  {
    section:'Kenya — Amboseli', icon:'🇰🇪',
    items:[
      {title:'Amboseli National Park',          desc:'Kenya Wildlife Service',              url:'https://www.kws.go.ke/parks-reserves/amboseli-national-park'},
      {title:'Tortilis Camp Amboseli',          desc:'Camp details & contacts',             url:'https://www.tortilis.com'},
      {title:'AMREF Flying Doctors (KE)',       desc:'Emergency evacuation Kenya',          url:'https://flydoc.org'},
      {title:'Kenya Airways (KQ 414)',          desc:'Nairobi → Entebbe, D13',             url:'https://www.kenya-airways.com'},
    ]
  },
  {
    section:'Uganda — Bwindi Gorillas', icon:'🇺🇬',
    items:[
      {title:'Uganda Wildlife Authority',      desc:'Gorilla permits & Bwindi info',        url:'https://ugandawildlife.org'},
      {title:'Nkuringo Gorilla Lodge',         desc:'Lodge contact & info',                 url:'https://www.nkuringogorillalodge.com'},
      {title:'Bwindi Community Hospital',      desc:'Nearest hospital to Nkuringo',        url:'https://maps.google.com/?q=-0.9892,29.7833'},
    ]
  },
  {
    section:'Flights — Qatar Airways', icon:'✈️',
    items:[
      {title:'Qatar Airways Manage Booking',   desc:'Check-in, seat selection, status',    url:'https://www.qatarairways.com/en/manage-booking.html'},
      {title:'Doha (DOH) Airport',             desc:'Transit hub — both directions',       url:'https://www.hamadairport.com'},
    ]
  },
];

const SOSScreen = (() => {
  let root;
  let activeTab = 'help';

  /* ── Shared: section with copy-card rows ────────────────────── */
  function infoSection(title, rows, iconName) {
    const div = document.createElement('div');
    div.className = 'sos-section';
    const h = document.createElement('p');
    h.className = 'sos-section-title';
    h.textContent = title;
    div.appendChild(h);
    rows.forEach(row => {
      const item = document.createElement('div');
      item.className = 'card sos-item';
      const icon = document.createElement('span');
      icon.innerHTML = Icons[iconName]?.('icon-md') || '';
      icon.style.cssText = 'color:var(--accent);flex-shrink:0';
      const text = document.createElement('div');
      text.style.flex = '1';
      const lbl = document.createElement('p');
      lbl.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted)';
      lbl.textContent = row.label;
      const val = document.createElement('p');
      val.style.cssText = 'font-size:var(--text-sm);font-weight:500;color:var(--text-primary);margin-top:2px';
      val.textContent = row.value || row.address || '';
      text.appendChild(lbl);
      text.appendChild(val);
      if (row.note) {
        const note = document.createElement('p');
        note.style.cssText = 'font-size:var(--text-xs);color:var(--text-secondary);margin-top:2px;font-style:italic';
        note.textContent = row.note;
        text.appendChild(note);
      }
      if (row.address && row.value) {
        const addr = document.createElement('p');
        addr.style.cssText = 'font-size:var(--text-xs);color:var(--text-secondary);margin-top:2px';
        addr.textContent = row.address;
        text.appendChild(addr);
      }
      item.appendChild(icon);
      item.appendChild(text);
      const copyText = row.value || row.address || '';
      if (copyText) {
        const btn = document.createElement('button');
        btn.className = 'kit-copy-btn';
        btn.textContent = 'Copy';
        btn.addEventListener('click', () => {
          navigator.clipboard?.writeText(copyText).then(() => {
            btn.textContent = '✓';
            setTimeout(() => btn.textContent = 'Copy', 1500);
            Toast.show(`Copied: ${row.label}`, 'success');
          }).catch(() => Toast.show('Copy failed', 'warning'));
        });
        item.appendChild(btn);
      }
      div.appendChild(item);
    });
    return div;
  }

  /* ── Link card ──────────────────────────────────────────────── */
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

  /* ── Tab bar ────────────────────────────────────────────────── */
  function tabBar() {
    const bar = document.createElement('div');
    bar.className = 'sub-tab-bar';
    [
      ['help',   'Help'],
      ['stay',   'Stay'],
      ['places', 'Places'],
      ['guides', 'Guides'],
    ].forEach(([id, label]) => {
      const btn = document.createElement('button');
      btn.className = `sub-tab ${activeTab===id?'sub-tab--active':''}`;
      btn.textContent = label;
      btn.addEventListener('click', () => { activeTab = id; render(); });
      bar.appendChild(btn);
    });
    return bar;
  }

  /* ══ HELP TAB ══════════════════════════════════════════════ */
  function renderHelp(sos) {
    const wrap = document.createElement('div');

    // Offline banner
    const banner = document.createElement('div');
    banner.className = 'sos-banner';
    banner.innerHTML = `${Icons.shield('icon-md')}<div>
      <p style="font-weight:500;font-size:var(--text-sm);color:var(--danger-text)">Offline Kit</p>
      <p style="font-size:var(--text-xs);color:var(--danger-text);opacity:.8;margin-top:2px">Cached · works without data in the bush</p>
    </div>`;
    wrap.appendChild(banner);

    // Operator first — most useful contact
    const opSection = document.createElement('div');
    opSection.className = 'sos-section';
    const opTitle = document.createElement('p');
    opTitle.className = 'sos-section-title';
    opTitle.textContent = '🏕 Tour operator — call first';
    opSection.appendChild(opTitle);
    const opCard = document.createElement('div');
    opCard.className = 'card';
    opCard.style.cssText = 'display:flex;align-items:center;gap:var(--s3);padding:var(--s3);margin-bottom:var(--s2)';
    opCard.innerHTML = `
      <div style="flex:1">
        <p style="font-size:var(--text-sm);font-weight:500;color:var(--text-primary)">Wildsenses Holidays</p>
        <p style="font-size:var(--text-xs);color:var(--text-muted);margin-top:2px">24hr trip support</p>
      </div>
      <a href="tel:+6028138778" style="background:var(--accent);color:#fff;border:none;border-radius:var(--r-sm);padding:6px 12px;font-size:var(--text-sm);font-weight:500;text-decoration:none;font-family:var(--font)">📞 +60 28138778</a>`;
    opSection.appendChild(opCard);
    wrap.appendChild(opSection);

    wrap.appendChild(infoSection('Emergency numbers', sos.emergency, 'phone'));
    wrap.appendChild(renderHospitals());
    wrap.appendChild(renderPhrases());
    wrap.appendChild(renderFirstAid());
    return wrap;
  }

  function renderHospitals() {
    const div = document.createElement('div');
    div.className = 'sos-section';
    const h = document.createElement('p');
    h.className = 'sos-section-title';
    h.textContent = 'Nearest hospitals';
    div.appendChild(h);
    (Data.getHospitals?.() || []).forEach(hosp => {
      const card = document.createElement('div');
      card.className = 'card kit-hosp-card';
      card.innerHTML = `
        <p class="kit-hosp-region">${hosp.region}</p>
        <p class="kit-hosp-name">${hosp.name}</p>
        ${hosp.note ? `<p class="kit-hosp-note">${hosp.note}</p>` : ''}`;
      const btns = document.createElement('div');
      btns.className = 'kit-hosp-btns';
      const tel = document.createElement('a');
      tel.href = `tel:${hosp.tel}`;
      tel.className = 'kit-copy-btn';
      tel.textContent = hosp.tel;
      btns.appendChild(tel);
      if (hosp.maps) {
        const maps = document.createElement('a');
        maps.href = hosp.maps;
        maps.target = '_blank';
        maps.rel = 'noopener';
        maps.className = 'kit-maps-btn';
        maps.textContent = 'Maps ↗';
        btns.appendChild(maps);
      }
      card.appendChild(btns);
      div.appendChild(card);
    });
    return div;
  }

  function renderFirstAid() {
    const div = document.createElement('div');
    div.className = 'sos-section';
    const h = document.createElement('p');
    h.className = 'sos-section-title';
    h.textContent = 'First aid — safari protocols';
    div.appendChild(h);
    (Data.getFirstAid?.() || []).forEach(item => {
      const card = document.createElement('div');
      card.className = 'card kit-fa-card';
      const header = document.createElement('div');
      header.className = 'kit-fa-header';
      header.innerHTML = `<span class="kit-fa-title">${item.title}</span><span class="kit-fa-arrow">▸</span>`;
      const body = document.createElement('p');
      body.className = 'kit-fa-body';
      body.textContent = item.content;
      header.addEventListener('click', () => {
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        header.querySelector('.kit-fa-arrow').style.transform = open ? '' : 'rotate(90deg)';
      });
      card.appendChild(header);
      card.appendChild(body);
      div.appendChild(card);
    });
    return div;
  }

  /* ══ STAY TAB ══════════════════════════════════════════════ */
  function renderStay(sos) {
    const wrap = document.createElement('div');
    wrap.appendChild(infoSection('Accommodation', sos.lodging, 'building'));
    wrap.appendChild(infoSection('Permits & documents', sos.passes, 'card'));
    return wrap;
  }

  /* ══ PLACES TAB ════════════════════════════════════════════ */
  function renderPlaces(sos) {
    const wrap = document.createElement('div');

    // Camp addresses (useful for drivers/emergencies)
    const addrRows = (sos.addresses || []).map(a => ({
      label: a.label,
      value: a.address,
    }));
    wrap.appendChild(infoSection('Camp & hotel addresses', addrRows, 'language'));

    return wrap;
  }

  /* ══ PHRASES — Swahili audio (Google Translate TTS, real voice) ══ */
  const PHRASES = [
    {en:'Please call an ambulance', sw:'Tafadhali piga simu gari la wagonjwa', rom:'Swahili (Tanzania & Kenya)'},
    {en:'I need a doctor',          sw:'Ninahitaji daktari',                    rom:''},
    {en:'Help me please',           sw:'Nisaidie tafadhali',                    rom:''},
    {en:'Where is the hospital?',   sw:'Hospitali iko wapi?',                   rom:''},
    {en:'I am in pain',             sw:'Ninauma',                               rom:''},
    {en:'I am allergic to ___',     sw:'Nina mzio wa ___',                      rom:''},
    {en:'Thank you',                sw:'Asante',                                rom:'Very useful — say often!'},
    {en:'Good morning',             sw:'Habari ya asubuhi',                     rom:'Greeting for guides & camp staff'},
  ];

  let _currentUtterance = null;
  let _voicesReady = false;
  let _bestVoice = null;

  /* ── Pick the best available voice for Swahili text ──────────
     Browsers rarely ship a dedicated Swahili voice, so we search
     in priority order: exact sw match → other East African /
     Bantu-adjacent languages → any multilingual-sounding voice →
     fall back to default. Letting the browser auto-pick like this
     (instead of forcing a hardcoded 'sw-TZ' that often doesn't
     exist) avoids the silent garbled fallback we saw before. ── */
  function pickBestVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    const swExact   = voices.find(v => v.lang?.toLowerCase().startsWith('sw'));
    if (swExact) return swExact;

    // Some Android/Chrome installs label Swahili oddly — check by name too
    const swByName  = voices.find(v => /swahili/i.test(v.name));
    if (swByName) return swByName;

    // No Swahili voice on this device — fall back to a clear, neutral
    // English voice. Listed in approximate quality order (Google >
    // Apple enhanced > default).
    const preferred = voices.find(v => /Google/i.test(v.name) && /en/i.test(v.lang))
                    || voices.find(v => /Samantha|Daniel|Karen/i.test(v.name))
                    || voices.find(v => v.lang?.toLowerCase().startsWith('en'))
                    || voices[0];
    return preferred || null;
  }

  function ensureVoicesLoaded() {
    return new Promise(resolve => {
      if (_voicesReady) { resolve(); return; }
      const voices = window.speechSynthesis.getVoices();
      if (voices.length) {
        _voicesReady = true;
        resolve();
        return;
      }
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        _voicesReady = true;
        resolve();
      }, { once: true });
      // Safety timeout in case voiceschanged never fires
      setTimeout(() => { _voicesReady = true; resolve(); }, 1000);
    });
  }

  async function playSwahili(text, btn) {
    if (!('speechSynthesis' in window)) {
      Toast.show('Voice playback is not supported on this device', 'warning');
      return;
    }

    window.speechSynthesis.cancel();
    if (_currentUtterance) _currentUtterance = null;

    await ensureVoicesLoaded();
    if (!_bestVoice) _bestVoice = pickBestVoice();

    const utt = new SpeechSynthesisUtterance(text);
    if (_bestVoice) {
      utt.voice = _bestVoice;
      utt.lang  = _bestVoice.lang;
    } else {
      utt.lang = 'sw-TZ';
    }
    utt.rate  = 0.8;   // slower = clearer for an unfamiliar language
    utt.pitch = 1;

    btn.textContent = '🔊 Playing…';
    _currentUtterance = utt;

    utt.onend   = () => { btn.textContent = '🔊 Listen'; _currentUtterance = null; };
    utt.onerror = () => { btn.textContent = '🔊 Listen'; _currentUtterance = null; };

    window.speechSynthesis.speak(utt);
  }

  function renderPhrases() {
    const phraseDiv = document.createElement('div');
    phraseDiv.className = 'sos-section';
    const phraseTitle = document.createElement('p');
    phraseTitle.className = 'sos-section-title';
    phraseTitle.textContent = 'Useful Swahili phrases — tap to hear';
    phraseDiv.appendChild(phraseTitle);

    const hint = document.createElement('p');
    hint.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted);padding:0 0 var(--s2);line-height:1.4';
    hint.textContent = 'Tap to hear it spoken aloud. Works fully offline — voice quality depends on your phone\'s available languages.';
    phraseDiv.appendChild(hint);

    PHRASES.forEach(p => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cssText = 'margin-bottom:var(--s2);padding:10px var(--s3);display:flex;flex-direction:column;gap:3px';
      card.innerHTML = `
        <p style="font-size:var(--text-xs);color:var(--text-muted)">${p.en}</p>
        <p style="font-size:var(--text-base);font-weight:500;color:var(--text-primary);margin:2px 0 1px">${p.sw}</p>
        ${p.rom ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);font-style:italic">${p.rom}</p>` : ''}`;
      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:6px;align-self:flex-end;margin-top:6px';

      const audioBtn = document.createElement('button');
      audioBtn.className = 'kit-copy-btn';
      audioBtn.textContent = '🔊 Listen';
      audioBtn.addEventListener('click', () => playSwahili(p.sw, audioBtn));
      btnRow.appendChild(audioBtn);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'kit-copy-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(p.sw).then(() => {
          copyBtn.textContent = '✓';
          setTimeout(() => copyBtn.textContent = 'Copy', 1500);
        });
      });
      btnRow.appendChild(copyBtn);

      card.appendChild(btnRow);
      phraseDiv.appendChild(card);
    });

    return phraseDiv;
  }

  /* ══ GUIDES TAB ════════════════════════════════════════════ */
  function renderGuides() {
    const wrap = document.createElement('div');
    wrap.className = 'sos-section';
    const h = document.createElement('p');
    h.className = 'sos-section-title';
    h.textContent = 'References & Guides';
    wrap.appendChild(h);

    GUIDE_LINKS.forEach(group => {
      const gHead = document.createElement('p');
      gHead.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted);font-weight:500;text-transform:uppercase;letter-spacing:.04em;padding:var(--s3) 0 var(--s2)';
      gHead.textContent = `${group.icon} ${group.section}`;
      wrap.appendChild(gHead);
      group.items.forEach(item => wrap.appendChild(linkCard(item.title, item.desc, item.url)));
    });

    // Custom links
    const customLinks = Data.getCustomLinks?.() || [];
    const myHead = document.createElement('p');
    myHead.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted);font-weight:500;text-transform:uppercase;letter-spacing:.04em;padding:var(--s3) 0 var(--s2)';
    myHead.textContent = '🔖 My links';
    wrap.appendChild(myHead);

    if (!customLinks.length) {
      const em = document.createElement('p');
      em.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted);font-style:italic;padding:var(--s2) 0';
      em.textContent = 'No custom links yet.';
      wrap.appendChild(em);
    } else {
      customLinks.forEach(link => {
        wrap.appendChild(linkCard(link.title, link.desc || link.url, link.url, async () => {
          await Data.deleteCustomLink(link.id);
          render();
        }));
      });
    }

    // Add custom link form — right here in Kit/Guides tab
    const addForm = document.createElement('div');
    addForm.style.cssText = 'margin-top:var(--s3);background:var(--surface-raised);border:1.5px solid var(--border);border-radius:var(--r-lg);padding:var(--s3);display:flex;flex-direction:column;gap:var(--s2)';
    addForm.innerHTML = `
      <p style="font-size:var(--text-xs);font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Add link</p>
      <input id="cl-title" placeholder="Title (e.g. Asilia Camps)" style="width:100%;border:1.5px solid var(--border);border-radius:var(--r-md);padding:8px 10px;font-size:var(--text-sm);background:var(--surface);color:var(--text-primary);font-family:var(--font);box-sizing:border-box">
      <input id="cl-url" placeholder="URL (https://...)" type="url" style="width:100%;border:1.5px solid var(--border);border-radius:var(--r-md);padding:8px 10px;font-size:var(--text-sm);background:var(--surface);color:var(--text-primary);font-family:var(--font);box-sizing:border-box">
      <button id="cl-add-btn" style="background:var(--accent);color:#fff;border:none;border-radius:var(--r-md);padding:8px 16px;font-size:var(--text-sm);font-weight:500;cursor:pointer;font-family:var(--font);align-self:flex-end">Add link</button>`;
    addForm.querySelector('#cl-add-btn').addEventListener('click', async () => {
      const title = addForm.querySelector('#cl-title').value.trim();
      const url   = addForm.querySelector('#cl-url').value.trim();
      if (!title || !url) { Toast.show('Title and URL are required', 'warning'); return; }
      if (!url.startsWith('http')) { Toast.show('URL must start with https://', 'warning'); return; }
      await Data.addCustomLink({ title, url });
      addForm.querySelector('#cl-title').value = '';
      addForm.querySelector('#cl-url').value = '';
      Toast.show('Link added ✓', 'success');
      render();
    });
    wrap.appendChild(addForm);

    return wrap;
  }

  /* ── Main render ────────────────────────────────────────────── */
  function render() {
    if (!root) return;
    root.innerHTML = '';

    root.appendChild(tabBar());

    const sos = Data.getSOS();
    const scrollWrap = document.createElement('div');
    scrollWrap.style.cssText = 'overflow-y:auto;flex:1;padding-bottom:var(--s6)';

    switch (activeTab) {
      case 'help':   scrollWrap.appendChild(renderHelp(sos));   break;
      case 'stay':   scrollWrap.appendChild(renderStay(sos));   break;
      case 'places': scrollWrap.appendChild(renderPlaces(sos)); break;
      case 'guides': scrollWrap.appendChild(renderGuides());    break;
    }

    root.appendChild(scrollWrap);
  }

  return {
    init(el) {
      root = el;
      root.style.cssText = 'display:flex;flex-direction:column;height:100%';
      render();
    },
    destroy() { root = null; },
    refresh()  { render(); },
  };
})();

window.SOSScreen = SOSScreen;
