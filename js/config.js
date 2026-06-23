'use strict';

/* ============================================================
   CONFIG
   ─────────────────────────────────────────────────────────────
   INSTANT_APP_ID → get yours by visiting in your browser:
   https://www.getadb.com/provision/<any-uuid>
   Copy the "appId" from the JSON response and paste below.
   ============================================================ */
const Config = {
  INSTANT_APP_ID: '6b3ba6ba-b131-445f-9369-d84324863dc7',        // ← paste appId from getadb.com/provision/<uuid>
  GAS_URL:        '',        // (legacy — leave empty, InstantDB replaces this)

  TRIP_NAME:         'Japan Trip 2026',
  TRIP_DATE:         '2027-04-10',
  BUDGET_MYR:        8000,
  EXCHANGE_RATE_JPY: 33,
};

window.Config = Config;
