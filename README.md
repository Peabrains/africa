# Africa Safari 2026 — PWA

East Africa Safari & Mountain Gorilla 
Tanzania → Kenya → Uganda · 31 Aug – 17 Sep · 15 Nights

**Live:** https://peabrains.github.io/africa/

---

## What's in this build

| Screen | What it does |
|--------|-------------|
| **Itinerary** | Day-by-day timeline with country dividers (Tanzania / Kenya / Uganda), green/gold flight badges, collapsible cards, "What's included" tab |
| **Map** | Leaflet map with all stops across 3 countries, colour-coded by country segment |
| **Bookings** | Booking tracker — accommodations, flights, gorilla permit, balloon |
| **Kit (SOS)** | Offline emergency contacts, hospitals in TZ/KE/UG, Swahili phrases, Wildsenses operator card, first aid protocols |

**Security:** PIN gate on every fresh session · InstantDB sync · Security headers

---

## File structure

```
africa/
├── index.html            ← App shell + all styles
├── manifest.json         ← PWA install config
├── sw.js                 ← Service worker (offline)
├── _headers              ← GitHub Pages security headers
├── css/
│   ├── tokens.css        ← Safari earth-tone design system
│   └── print.css
├── js/
│   ├── config.js         ← Trip config + InstantDB App ID
│   ├── auth.js           ← PIN gate (SHA-256 hash, sessionStorage)
│   ├── data.js           ← All trip data — 47 stops, 18 days
│   ├── db.js             ← IndexedDB (africa-safari store)
│   ├── sync.js           ← InstantDB real-time sync
│   ├── app.js            ← Router + lifecycle
│   ├── icons.js          ← SVG icon library
│   ├── toast.js          ← Toast notifications
│   ├── bottom-sheet.js   ← Action sheet
│   ├── weather.js        ← Open-Meteo weather strip
│   └── screens/
│       ├── itinerary.js  ← Day timeline + inclusions screen
│       ├── map.js        ← Leaflet map (Africa segments)
│       ├── bookings.js   ← Booking tracker
│       └── sos.js        ← Emergency kit
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    └── icon-maskable.png
```

---

## PIN setup

First time you open the app, you'll be prompted to choose a 4-digit PIN.  
To reset: Browser DevTools → Application → Local Storage → delete `africa-pin-hash` → reload.

## InstantDB sync

App ID is set in `js/config.js`. Data syncs across devices in real time.  
Manage your database at https://instantdb.com

## AI itinerary planner (Design Lab)

The itinerary screen includes an authenticated AI planner that creates a reviewable draft and only saves selected suggestions. The browser sends compact trip context to the `ai-planner` Supabase Edge Function; the Vercel AI Gateway key is never exposed to the PWA.

One-time setup:

1. Run `migrate_ai_planner.sql` in the Supabase SQL editor.
2. Add `AI_GATEWAY_API_KEY` as a Supabase Edge Function secret. Optionally set `AI_PLANNER_MODEL`; the default is `openai/gpt-5.6-luna`.
3. Deploy `supabase/functions/ai-planner` with JWT verification enabled.

The server enforces five planner requests per signed-in user per UTC day and records input/output token usage in `ai_daily_usage`.

## Install on iPhone (Safari)

1. Open https://peabrains.github.io/africa/ in Safari
2. Tap Share → **Add to Home Screen**
3. Tap **Add**

Works fully offline once installed — critical for bush connectivity.

---

## Itinerary overview

| Days | Location | Camp |
|------|----------|------|
| D0 | KUL → Doha (overnight flight) | — |
| D1–2 | Ngorongoro Crater, Tanzania | Asilia The Highlands |
| D3–4 | Central Serengeti, Tanzania | Asilia Dunia Camp |
| D5–8 | Northern Serengeti + Hot Air Balloon, Tanzania | Asilia Olakira Camp |
| D9 | Transit: Serengeti → Kilimanjaro → Nairobi | Radisson Blu Nairobi |
| D10–12 | Amboseli National Park, Kenya | Tortilis Camp |
| D13 | Transit: Amboseli → Nairobi → Entebbe | No.5 Boutique Hotel |
| D14–15 | Bwindi + Gorilla Habituation, Uganda | Nkuringo Gorilla Lodge |
| D16–17 | Entebbe → Doha → KUL | — |

Operator: Wildsenses Holidays · +60 28138778 · www.wildsensesholidays.com
