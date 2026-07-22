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

  let cache    = null;   // shaped result, once loaded — { currency, days: [...] }
  let inFlight = null;   // in-progress fetch, so concurrent callers share one request

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
    inFlight = fetch(FEED_URL)
      .then(res => res.json())
      .then(json => {
        if (!json.ok) throw new Error('feed returned ok:false');
        cache = shape(json.data);
        return cache;
      })
      .finally(() => { inFlight = null; });
    return inFlight;
  }

  function getCached() { return cache; }

  /* Fire-and-forget prefetch; calls cb() once resolved, whether it
     succeeded or failed (caller just re-renders — getCached() will
     reflect whatever happened, including staying null on failure). */
  function prefetch(cb) {
    if (cache) return;
    fetchHistory().then(cb).catch(() => cb && cb());
  }

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

  return { fetchHistory, prefetch, getCached, series, totals, relDay };
})();

window.FlightPrice = FlightPrice;
