'use strict';

/* ============================================================
   CONFIG — Africa Safari PWA
   East Africa Safari & Mountain Gorilla · Vivien · Sep 2026
   ============================================================ */
const Config = {
  INSTANT_APP_ID: 'f217adb6-3cfc-4593-a69f-b25876c7117f',

  TRIP_NAME:    'Africa Safari 2026',
  TRIP_DATE:    '2026-08-31',   // Departure date KUL → Doha
  DATA_VERSION: 1,              // Bump when SEED_STOPS change fundamentally
  APP_VERSION:  'v95',           // Auto-incremented by deploy script — do not edit manually

  BUDGET_MYR:   0,              // Set your total trip budget in MYR
  CURRENCY:     'USD',          // Primary foreign currency for this trip

  // Countries visited (used for SOS screen country headers)
  COUNTRIES: ['Tanzania', 'Kenya', 'Uganda'],

  // Flight badge colours (itinerary legend)
  FLIGHT_INCLUDED_COLOR:  '#2A7A4B',   // green  — included in package
  FLIGHT_EXCLUDED_COLOR:  '#B8860B',   // gold   — not included (buy separately)
};

window.Config = Config;
