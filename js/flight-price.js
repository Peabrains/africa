'use strict';

/* ============================================================
   FLIGHT PRICE WATCH — MH52/53 KUL⇄KIX
   Reads a public, read-only JSON feed from a Google Apps Script
   web app backed by a Sheet that a separate daily process keeps
   updated. This module only fetches + shapes the data — Bookings
   screen owns rendering, same split as Weather does for the
   itinerary weather strips.
   Fetched once per session (module-level cache); the source data
   only changes once a day, so there's no reason to refetch on
   every accordion toggle.
   ============================================================ */
const FlightPrice = (() => {
  const FEED_URL = 'https://script.google.com/macros/s/AKfycbwTM0Fbz7FVLFyu6FRd3MYR6Q3KjMi8dle9Cux_9NR61gWN4kNteBSGthjAd2-_rYMFkA/exec?action=history';

  let cache     = null;    // shaped result, once loaded — { currency, days: [...] }
  let status    = 'idle';  // 'idle' | 'loading' | 'ready' | 'error'
  let lastError = null;
  let inFlight  = null;    // in-progress fetch, so concurrent callers share one request
  let attempted = false;   // only auto-fire once per session; retry() resets this

  /* Raw rows -> per-day buckets, sorted oldest→newest:
     [{ date:'2027-04-09', legs: { MH52:{Economy,Business}, MH53:{Economy,Business} } }] */
  function shape(rows) {
    const byDate = {};
    let currency = 'MYR';
    rows.forEach(r => {
      const date = (r['Checked At (UTC)'] || '').slice(0, 10);
      if (!date) return;
      const flightNo = (r['Flight No'] || '').replace(/\s+/g, '');
      const cabin     = r['Cabin'];
      if (r['Currency']) currency = r['Currency'];
      if (!byDate[date]) byDate[date] = { date, legs: {} };
      if (!byDate[date].legs[flightNo]) byDate[date].legs[flightNo] = {};
      byDate[date].legs[flightNo][cabin] = r['Price'];
    });
    const days = Object.values(byDate).sort((a, b) => (a.date < b.date ? -1 : 1));
    return { currency, days };
  }

  async function fetchHistory() {
    if (cache) return cache;
    if (inFlight) return inFlight;
    status = 'loading';
    inFlight = fetch(FEED_URL)
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(json => {
        if (!json.ok) throw new Error('feed returned ok:false');
        cache = shape(json.data);
        status = 'ready';
        lastError = null;
        return cache;
      })
      .catch(err => {
        status = 'error';
        lastError = err.message || String(err);
        // Left in deliberately — this is the fastest way to tell CORS
        // vs. bad JSON vs. network failure apart from the console.
        console.error('[FlightPrice] fetch failed:', err);
        throw err;
      })
      .finally(() => { inFlight = null; });
    return inFlight;
  }

  /* Fire-and-forget prefetch; calls cb() once resolved either way.
     Only auto-fires once per session — on failure it does NOT keep
     retrying itself on every re-render. Call retry() for that. */
  function prefetch(cb) {
    if (attempted) return;
    attempted = true;
    fetchHistory().then(cb).catch(() => cb && cb());
  }

  function retry(cb) {
    attempted = false;
    cache = null;
    status = 'idle';
    lastError = null;
    prefetch(cb);
  }

  function getCached() { return cache; }
  function getStatus()  { return status; }
  function getError()   { return lastError; }

  /* Series for one leg + cabin across all cached days, e.g. series('MH52','Economy') */
  function series(legNo, cabin) {
    if (!cache) return [];
    return cache.days
      .map(d => ({ date: d.date, price: d.legs[legNo]?.[cabin] }))
      .filter(p => p.price != null);
  }

  /* Per-day round-trip totals for a cabin — only days where both legs were read */
  function totals(cabin) {
    if (!cache) return [];
    return cache.days
      .map(d => {
        const out  = d.legs['MH52']?.[cabin];
        const back = d.legs['MH53']?.[cabin];
        return (out != null && back != null) ? { date: d.date, total: out + back } : null;
      })
      .filter(Boolean);
  }

  /* 'today' / 'yesterday' / 'N days ago', for the subtitle */
  function relDay(dateStr) {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const d = new Date(dateStr + 'T00:00:00Z');
    const diff = Math.round((today - d) / 86400000);
    if (diff <= 0) return 'today';
    if (diff === 1) return 'yesterday';
    return diff + ' days ago';
  }

  return { fetchHistory, prefetch, retry, getCached, getStatus, getError, series, totals, relDay };
})();

window.FlightPrice = FlightPrice;
