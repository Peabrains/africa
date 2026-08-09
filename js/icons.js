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
  home:        (c) => Icons._svg(`<path d="M3 11l9-8 9 8" ${S}/><path d="M5 10v10h14V10" ${S}/>`, c),
  checklist:   (c) => Icons._svg(`<path d="M9 6h11M9 12h11M9 18h11" ${S}/><path d="M4 6l1.2 1.2L7.5 4.7" ${S}/><path d="M4 12l1.2 1.2L7.5 10.7" ${S}/><path d="M4 18l1.2 1.2L7.5 16.7" ${S}/>`, c),
  paw:         (c) => Icons._svg(`<circle cx="12" cy="15" r="5" ${S}/><circle cx="6" cy="8" r="2" ${S}/><circle cx="10" cy="5" r="2" ${S}/><circle cx="14" cy="5" r="2" ${S}/><circle cx="18" cy="8" r="2" ${S}/>`, c),
  stamp:       (c) => Icons._svg(`<rect x="4" y="4" width="16" height="16" rx="3" ${S}/><circle cx="12" cy="12" r="3" ${S}/>`, c),
  bowl:        (c) => Icons._svg(`<path d="M3 12h18a9 6 0 0 1-18 0z" ${S}/><path d="M12 3v3M9 4.5v2M15 4.5v2" ${S}/>`, c),

  /* Transport */
  plane:       (c) => Icons._svg(`<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" ${S}/>`, c),
  train:       (c) => Icons._svg(`<rect x="4" y="3" width="16" height="16" rx="4" ${S}/><path d="M8 19l-1 2M16 19l1 2M4 12h16M9 3v9M15 3v9" ${S}/>`, c),
  bus:         (c) => Icons._svg(`<rect x="3" y="4" width="18" height="13" rx="3" ${S}/><path d="M3 10h18" ${S}/><circle cx="7.5" cy="19" r="2" ${S}/><circle cx="16.5" cy="19" r="2" ${S}/>`, c),
  walk:        (c) => Icons._svg(`<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z" ${S}/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z" ${S}/><path d="M16 17h4M4 13h4" ${S}/>`, c),
  boat:        (c) => Icons._svg(`<path d="M22 18H2a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4Z" ${S}/><path d="M21 14 10 2 3 14h18Z" ${S}/><path d="M10 2v14" ${S}/>`, c),
  taxi:        (c) => Icons._svg(`<rect x="3" y="11" width="18" height="6" rx="2" ${S}/><path d="M5 11l1.5-4a2 2 0 0 1 2-1.5h7a2 2 0 0 1 2 1.5L19 11" ${S}/><circle cx="7.5" cy="17" r="1.5" ${S}/><circle cx="16.5" cy="17" r="1.5" ${S}/><rect x="9" y="3" width="6" height="2.5" rx=".5" ${S}/>`, c),
  car:         (c) => Icons._svg(`<path d="M5 17h14M5 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm14 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5 17v-4l2-5a2 2 0 0 1 1.9-1.4h6.2A2 2 0 0 1 17 7.6l2 5.4v4" ${S}/><path d="M3 13h18" ${S}/>`, c),
  cable:       (c) => Icons._svg(`<path d="M3 4h18" ${S}/><path d="M12 4v3" ${S}/><rect x="7" y="9" width="10" height="9" rx="2" ${S}/><path d="M7 13.5h10" ${S}/>`, c),
  route:       (c) => Icons._svg(`<circle cx="6" cy="19" r="3" ${S}/><circle cx="18" cy="5" r="3" ${S}/><path d="M12 19h4.5a3.5 3.5 0 0 0 0-7h-8a3.5 3.5 0 0 1 0-7H12" ${S}/>`, c),
  mapPin:      (c) => Icons._svg(`<path d="M12 22s7-7.58 7-12a7 7 0 1 0-14 0c0 4.42 7 12 7 12z" ${S}/><circle cx="12" cy="10" r="2.5" ${S}/>`, c),

  /* Weather condition icons — used by weather.js in place of emoji */
  sun:            (c) => Icons._svg(`<circle cx="12" cy="12" r="4" ${S}/><path d="M12 2v2M12 20v2M4 12H2m20 0h-2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" ${S}/>`, c),
  cloudSun:       (c) => Icons._svg(`<path d="M12 2v2m-7.07.93 1.41 1.41M2 12h2m14.66-4.66 1.41-1.41M15.95 12.65a4 4 0 0 0-5.925-4.128" ${S}/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6z" ${S}/>`, c),
  cloud:          (c) => Icons._svg(`<path d="M17.5 19H9a5 5 0 1 1 1.05-9.9A6 6 0 0 1 21 12.5 3.5 3.5 0 0 1 17.5 19z" ${S}/>`, c),
  cloudFog:       (c) => Icons._svg(`<path d="M16 17H6a4 4 0 1 1 .9-7.9A5.5 5.5 0 0 1 17 9.5 3.5 3.5 0 0 1 16 17z" ${S}/><path d="M4 20h16M6 23h12" ${S}/>`, c),
  cloudDrizzle:   (c) => Icons._svg(`<path d="M17.5 15H9a5 5 0 1 1 1.05-9.9A6 6 0 0 1 21 8.5 3.5 3.5 0 0 1 17.5 15z" ${S}/><path d="M8 19v1M8 15v1M12 21v1M12 17v1M16 19v1M16 15v1" ${S}/>`, c),
  cloudRain:      (c) => Icons._svg(`<path d="M17.5 15H9a5 5 0 1 1 1.05-9.9A6 6 0 0 1 21 8.5 3.5 3.5 0 0 1 17.5 15z" ${S}/><path d="M8 19l-1 3M12 19l-1 3M16 19l-1 3" ${S}/>`, c),
  cloudSnow:      (c) => Icons._svg(`<path d="M17.5 15H9a5 5 0 1 1 1.05-9.9A6 6 0 0 1 21 8.5 3.5 3.5 0 0 1 17.5 15z" ${S}/><path d="M8 19v.01M12 21v.01M16 19v.01M8 22v.01M16 22v.01" ${S}/>`, c),
  cloudLightning: (c) => Icons._svg(`<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973" ${S}/><path d="m13 12-3 5h4l-3 5" ${S}/>`, c),

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
  kit:         (c) => Icons._svg(`<rect x="2" y="7" width="20" height="14" rx="2" ry="2" ${S}/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" ${S}/>`, c),
  chevronDown: (c) => Icons._svg(`<path d="m6 9 6 6 6-6" ${S}/>`, c),
  chevronUp:   (c) => Icons._svg(`<path d="m18 15-6-6-6 6" ${S}/>`, c),
  refresh:     (c) => Icons._svg(`<path d="M23 4v6h-6M1 20v-6h6" ${S}/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" ${S}/>`, c),
  download:    (c) => Icons._svg(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" ${S}/>`, c),
  info:        (c) => Icons._svg(`<circle cx="12" cy="12" r="10" ${S}/><path d="M12 16v-4M12 8h.01" ${S}/>`, c),
  clock:       (c) => Icons._svg(`<circle cx="12" cy="12" r="10" ${S}/><path d="M12 6v6l4 2" ${S}/>`, c),
  moon:        (c) => Icons._svg(`<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" ${S}/>`, c),
  star:        (c) => Icons._svg(`<polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" ${S}/>`, c),
  mountain:    (c) => Icons._svg(`<path d="m8 3 4 8 5-5 5 15H2L8 3z" ${S}/>`, c),
  settings:    (c) => Icons._svg(`<circle cx="12" cy="12" r="3" ${S}/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09c0 .63.38 1.2 1 1.51.62.28 1.34.17 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06c-.5.48-.61 1.2-.33 1.82.28.62.85 1 1.51 1H21a2 2 0 0 1 0 4h-.09c-.66 0-1.23.38-1.51 1z" ${S}/>`, c),
  badgeCheck:  (c) => Icons._svg(`<circle cx="12" cy="12" r="9" ${S}/><path d="M8 12.5l2.5 2.5L16 9.5" ${S}/>`, c),
  camera:      (c) => Icons._svg(`<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" ${S}/><circle cx="12" cy="13" r="3" ${S}/>`, c),
  search:      (c) => Icons._svg(`<circle cx="11" cy="11" r="8" ${S}/><path d="m21 21-4.3-4.3" ${S}/>`, c),

  /* SOS / contact */
  phone:       (c) => Icons._svg(`<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12a19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 3.07 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 5.94 5.94l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21 16.92z" ${S}/>`, c),
  globe:       (c) => Icons._svg(`<circle cx="12" cy="12" r="10" ${S}/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" ${S}/>`, c),
  building:    (c) => Icons._svg(`<path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" ${S}/><path d="M14 21v-4h-4v4" ${S}/>`, c),
  card:        (c) => Icons._svg(`<rect x="1" y="4" width="22" height="16" rx="2" ${S}/><path d="M1 10h22" ${S}/>`, c),
  language:    (c) => Icons._svg(`<path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6" ${S}/>`, c),
  heart:       (c) => Icons._svg(`<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" ${S}/>`, c),

  /* Budget / people */
  users:       (c) => Icons._svg(`<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" ${S}/><circle cx="9" cy="7" r="4" ${S}/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" ${S}/>`, c),
  yen:         (c) => Icons._svg(`<path d="M12 21V11M6 3l6 8 6-8M5 11h14M5 15h14" ${S}/>`, c),
  // Currency-neutral banknote — used anywhere a cost is shown, since the
  // amount's currency can now differ per stop/overnight rather than
  // always being the trip's default (see cost_currency).
  cash:        (c) => Icons._svg(`<rect x="2" y="6" width="20" height="12" rx="2" ${S}/><circle cx="12" cy="12" r="3" ${S}/><path d="M6 9v.01M18 15v.01" ${S}/>`, c),
};

window.Icons = Icons;
