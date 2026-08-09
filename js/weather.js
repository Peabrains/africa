'use strict';

/* ============================================================
   WEATHER — Open-Meteo (free, no API key)
   Shows 3-day forecast for a given lat/lng
   Fixed for Africa: timezone = Africa/Nairobi
   Icons: inline SVG (no Tabler CSS dependency)
   ============================================================ */
const Weather = (() => {
  const CACHE = {};

  /* WMO weather codes → icon key (Icons.*, matches app's line-icon set) */
  const WMO = {
    0:  { label:'Clear',         icon:'sun' },
    1:  { label:'Mainly clear',  icon:'cloudSun' },
    2:  { label:'Partly cloudy', icon:'cloudSun' },
    3:  { label:'Overcast',      icon:'cloud' },
    45: { label:'Fog',           icon:'cloudFog' },
    48: { label:'Freezing fog',  icon:'cloudFog' },
    51: { label:'Light drizzle', icon:'cloudDrizzle' },
    53: { label:'Drizzle',       icon:'cloudDrizzle' },
    61: { label:'Light rain',    icon:'cloudRain' },
    63: { label:'Rain',          icon:'cloudRain' },
    65: { label:'Heavy rain',    icon:'cloudRain' },
    71: { label:'Light snow',    icon:'cloudSnow' },
    73: { label:'Snow',          icon:'cloudSnow' },
    80: { label:'Showers',       icon:'cloudRain' },
    81: { label:'Showers',       icon:'cloudRain' },
    95: { label:'Thunderstorm',  icon:'cloudLightning' },
    99: { label:'Thunderstorm',  icon:'cloudLightning' },
  };

  function wmo(code) {
    return WMO[code] || WMO[Math.floor(code / 10) * 10] || { label:'Mixed', icon:'cloud' };
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

  const REL_LABELS = ['Today', 'Tmrw', '+2d'];

  function dayCard(d, idx) {
    const { label, icon } = wmo(d.code);
    const dateLabel = REL_LABELS[idx] || '+' + idx + 'd';
    const hasRain = d.precipProb != null && d.precipProb > 0;
    const isWet   = hasRain && d.precipProb >= 40;
    const mmPart  = (d.precip != null && d.precip > 0) ? ' · ' + d.precip + 'mm' : '';
    const rainLine = hasRain
      ? `<span class="wx-rain${isWet ? ' wx-rain--wet' : ''}">☂ ${d.precipProb}%${mmPart}</span>`
      : `<span class="wx-rain">—</span>`;
    return `
      <div class="wx-day">
        <span class="wx-icon" title="${label}">${Icons[icon] ? Icons[icon]('icon-md') : ''}</span>
        <div class="wx-text">
          <span class="wx-date">${dateLabel}</span>
          <span class="wx-temp">${d.max}° <span class="wx-temp-min">${d.min}°</span></span>
          ${rainLine}
        </div>
      </div>`;
  }

  /* Single-location 3-day strip */
  async function renderStrip(el, lat, lng, label) {
    if (!navigator.onLine) { el.innerHTML = ''; return; }
    try {
      const days = await fetch3Day(lat, lng);
      el.innerHTML = `
        <div class="wx-strip">
          <div class="wx-location">${label}</div>
          <div class="wx-days-row">${days.map((d, i) => dayCard(d, i)).join('')}</div>
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
          <div class="wx-location">${points[i].label}</div>
          <div class="wx-days-row">${days.map((d, j) => dayCard(d, j)).join('')}</div>
        </div>`).join('');
    } catch(_) { el.innerHTML = ''; }
  }

  return { renderStrip, renderMultiStrip };
})();

window.Weather = Weather;
