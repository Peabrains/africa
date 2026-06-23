'use strict';

/* ============================================================
   ICONS — SVG only, no CDN needed, works fully offline
   Usage: Icons.calendar('icon-md')
          el.innerHTML = Icons.train('icon-sm')
   ============================================================ */

const S = 'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

const Icons = {
  _svg: (path, cls='') =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon ${cls}" aria-hidden="true" fill="none">${path}</svg>`,

  /* Navigation */
  calendar:    (c) => Icons._svg(`<rect x="3" y="4" width="18" height="18" rx="3" ${S}/><path d="M8 2v4M16 2v4M3 10h18" ${S}/>`, c),
  map:         (c) => Icons._svg(`<polygon points="3,5 9,3 15,5 21,3 21,19 15,21 9,19 3,21" ${S}/><path d="M9 3v16M15 5v16" ${S}/>`, c),
  bookmark:    (c) => Icons._svg(`<path d="M5 3h14a1 1 0 0 1 1 1v17l-8-4-8 4V4a1 1 0 0 1 1-1z" ${S}/>`, c),
  shield:      (c) => Icons._svg(`<path d="M12 3 3 7v5c0 5 4 8.5 9 10 5-1.5 9-5 9-10V7z" ${S}/>`, c),

  /* Transport */
  plane:       (c) => Icons._svg(`<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" ${S}/>`, c),
  train:       (c) => Icons._svg(`<rect x="4" y="3" width="16" height="16" rx="4" ${S}/><path d="M8 19l-1 2M16 19l1 2M4 12h16M9 3v9M15 3v9" ${S}/>`, c),
  bus:         (c) => Icons._svg(`<path d="M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" ${S}/><path d="M3 9h18M9 18v2M15 18v2M8 13h.01M16 13h.01" ${S}/>`, c),
  walk:        (c) => Icons._svg(`<circle cx="13" cy="4" r="1" ${S}/><path d="m6 20 4-9 3 3 2-5M13 8l3 2 2-3" ${S}/>`, c),
  boat:        (c) => Icons._svg(`<path d="M2 20a11 11 0 0 0 20 0M12 4v8M5 12l7-8 7 8" ${S}/>`, c),
  cable:       (c) => Icons._svg(`<path d="M3 3h18M7 3v10a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V3" ${S}/><circle cx="12" cy="20" r="2" ${S}/>`, c),
  route:       (c) => Icons._svg(`<circle cx="6" cy="19" r="3" ${S}/><circle cx="18" cy="5" r="3" ${S}/><path d="M12 19h4.5a3.5 3.5 0 0 0 0-7h-8a3.5 3.5 0 0 1 0-7H12" ${S}/>`, c),

  /* Actions */
  pencil:      (c) => Icons._svg(`<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" ${S}/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" ${S}/>`, c),
  trash:       (c) => Icons._svg(`<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" ${S}/><path d="M10 11v6M14 11v6" ${S}/>`, c),
  check:       (c) => Icons._svg(`<path d="M20 6 9 17l-5-5" ${S}/>`, c),
  link:        (c) => Icons._svg(`<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" ${S}/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" ${S}/>`, c),
  calendarAdd: (c) => Icons._svg(`<rect x="3" y="4" width="18" height="18" rx="3" ${S}/><path d="M8 2v4M16 2v4M3 10h18M12 14v4M10 16h4" ${S}/>`, c),
  x:           (c) => Icons._svg(`<path d="M18 6 6 18M6 6l12 12" ${S}/>`, c),
  plus:        (c) => Icons._svg(`<path d="M12 5v14M5 12h14" ${S}/>`, c),
  dotsV:       (c) => Icons._svg(`<circle cx="12" cy="5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="19" r="1.2" fill="currentColor"/>`, c),

  /* UI */
  chevronDown: (c) => Icons._svg(`<path d="m6 9 6 6 6-6" ${S}/>`, c),
  chevronUp:   (c) => Icons._svg(`<path d="m18 15-6-6-6 6" ${S}/>`, c),
  refresh:     (c) => Icons._svg(`<path d="M23 4v6h-6M1 20v-6h6" ${S}/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" ${S}/>`, c),
  download:    (c) => Icons._svg(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" ${S}/>`, c),
  info:        (c) => Icons._svg(`<circle cx="12" cy="12" r="10" ${S}/><path d="M12 16v-4M12 8h.01" ${S}/>`, c),
  clock:       (c) => Icons._svg(`<circle cx="12" cy="12" r="10" ${S}/><path d="M12 6v6l4 2" ${S}/>`, c),
  moon:        (c) => Icons._svg(`<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" ${S}/>`, c),
  star:        (c) => Icons._svg(`<polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" ${S}/>`, c),
  mountain:    (c) => Icons._svg(`<path d="m8 3 4 8 5-5 5 15H2L8 3z" ${S}/>`, c),

  /* SOS / contact */
  phone:       (c) => Icons._svg(`<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12a19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 3.07 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 5.94 5.94l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21 16.92z" ${S}/>`, c),
  globe:       (c) => Icons._svg(`<circle cx="12" cy="12" r="10" ${S}/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" ${S}/>`, c),
  building:    (c) => Icons._svg(`<path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" ${S}/><path d="M14 21v-4h-4v4" ${S}/>`, c),
  card:        (c) => Icons._svg(`<rect x="1" y="4" width="22" height="16" rx="2" ${S}/><path d="M1 10h22" ${S}/>`, c),
  language:    (c) => Icons._svg(`<path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6" ${S}/>`, c),
  heart:       (c) => Icons._svg(`<path d="M22 12h-4l-3 9L9 3l-3 9H2" ${S}/>`, c),

  /* Budget / people */
  users:       (c) => Icons._svg(`<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" ${S}/><circle cx="9" cy="7" r="4" ${S}/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" ${S}/>`, c),
  yen:         (c) => Icons._svg(`<path d="M12 21V11M6 3l6 8 6-8M5 11h14M5 15h14" ${S}/>`, c),
};

window.Icons = Icons;
