'use strict';

/* ============================================================
   WEATHER — Open-Meteo (free, no API key)
   Shows 3-day forecast for a given lat/lng
   Fixed for Africa: timezone = Africa/Nairobi
   Icons: inline SVG (no Tabler CSS dependency)
   ============================================================ */
const Weather = (() => {
  const CACHE = {};

  /* WMO weather codes → emoji (no icon font needed, works offline) */
  const WMO = {
    0:  { label:'Clear',         emoji:'☀️' },
    1:  { label:'Mainly clear',  emoji:'🌤️' },
    2:  { label:'Partly cloudy', emoji:'⛅' },
    3:  { label:'Overcast',      emoji:'☁️' },
    45: { label:'Fog',           emoji:'🌫️' },
    48: { label:'Freezing fog',  emoji:'🌫️' },
    51: { label:'Light drizzle', emoji:'🌦️' },
    53: { label:'Drizzle',       emoji:'🌦️' },
    61: { label:'Light rain',    emoji:'🌧️' },
    63: { label:'Rain',          emoji:'🌧️' },
    65: { label:'Heavy rain',    emoji:'🌧️' },
    71: { label:'Light snow',    emoji:'🌨️' },
    73: { label:'Snow',          emoji:'❄️'  },
    80: { label:'Showers',       emoji:'🌦️' },
    81: { label:'Showers',       emoji:'🌧️' },
    95: { label:'Thunderstorm',  emoji:'⛈️' },
    99: { label:'Thunderstorm',  emoji:'⛈️' },
  };

  function wmo(code) {
    return WMO[code] || WMO[Math.floor(code / 10) * 10] || { label:'Mixed', emoji:'🌡️' };
  }

  async function fetch3Day(lat, lng) {
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    if (CACHE[key]) return CACHE[key];

    // Africa/Nairobi = EAT (UTC+3) — covers TZ, KE, UG all on same offset
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}`
      + `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,precipitation_sum`
      + `&timezone=Africa%2FNairobi&forecast_days=3`;

    const res  = await fetch(url);
    const json = await res.json();

    const days = json.daily.time.map((date, i) => ({
      date,
      max:        Math.round(json.daily.temperature_2m_max[i]),
      min:        Math.round(json.daily.temperature_2m_min[i]),
      code:       json.daily.weathercode[i],
      precipProb: json.daily.precipitation_probability_max?.[i] ?? null,
      precip:     json.daily.precipitation_sum?.[i] != null
                    ? Math.round(json.daily.precipitation_sum[i] * 10) / 10
                    : null,
    }));

    CACHE[key] = days;
    return days;
  }

  const REL_LABELS = ['Today', 'Tomorrow', '+2 days'];

  function dayCard(d, idx) {
    const { label, emoji } = wmo(d.code);
    const dateLabel = REL_LABELS[idx] || '+' + idx + ' days';
    const hasRain = d.precipProb != null && d.precipProb > 0;
    const isWet   = hasRain && d.precipProb >= 50;
    const rainLine = hasRain
      ? `<span class="wx-rain${isWet ? ' wx-rain--wet' : ''}">☂ ${d.precipProb}%${d.precip > 0 ? ' · ' + d.precip + 'mm' : ''}</span>`
      : '';
    return `
      <div class="wx-day">
        <span class="wx-date">${dateLabel}</span>
        <span class="wx-icon" title="${label}">${emoji}</span>
        <span class="wx-temp">${d.max}° / ${d.min}°</span>
        ${rainLine}
      </div>`;
  }

  /* Single-location 3-day strip */
  async function renderStrip(el, lat, lng, label) {
    if (!navigator.onLine) { el.innerHTML = ''; return; }
    try {
      const days = await fetch3Day(lat, lng);
      el.innerHTML = `
        <div class="wx-strip">
          <span class="wx-location">${label}</span>
          ${days.map((d, i) => dayCard(d, i)).join('')}
        </div>`;
    } catch(_) { el.innerHTML = ''; }
  }

  /* Multi-location: renders one strip per point */
  async function renderMultiStrip(el, points) {
    if (!navigator.onLine) { el.innerHTML = ''; return; }
    try {
      const allDays = await Promise.all(points.map(p => fetch3Day(p.lat, p.lng)));
      el.innerHTML = allDays.map((days, i) => `
        <div class="wx-strip">
          <span class="wx-location">${points[i].label}</span>
          ${days.map((d, j) => dayCard(d, j)).join('')}
        </div>`).join('');
    } catch(_) { el.innerHTML = ''; }
  }

  return { renderStrip, renderMultiStrip };
})();

window.Weather = Weather;
