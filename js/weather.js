'use strict';

/* ============================================================
   WEATHER — Open-Meteo (free, no API key)
   Shows 3-day forecast for a given lat/lng
   ============================================================ */
const Weather = (() => {
  const CACHE = {};

  const WMO = {
    0:  { label:'Clear',         icon:'ti-sun'               },
    1:  { label:'Mainly clear',  icon:'ti-sun'               },
    2:  { label:'Partly cloudy', icon:'ti-cloud'             },
    3:  { label:'Overcast',      icon:'ti-cloud-filled'      },
    45: { label:'Fog',           icon:'ti-cloud-fog'         },
    48: { label:'Freezing fog',  icon:'ti-cloud-fog'         },
    51: { label:'Light drizzle', icon:'ti-cloud-drizzle'     },
    53: { label:'Drizzle',       icon:'ti-cloud-drizzle'     },
    61: { label:'Light rain',    icon:'ti-cloud-rain'        },
    63: { label:'Rain',          icon:'ti-cloud-rain'        },
    65: { label:'Heavy rain',    icon:'ti-cloud-rain'        },
    71: { label:'Light snow',    icon:'ti-snowflake'         },
    73: { label:'Snow',          icon:'ti-snowflake'         },
    80: { label:'Showers',       icon:'ti-cloud-rain'        },
    81: { label:'Showers',       icon:'ti-cloud-rain'        },
    95: { label:'Thunderstorm',  icon:'ti-cloud-storm'       },
    99: { label:'Thunderstorm',  icon:'ti-cloud-storm'       },
  };

  function wmo(code) {
    return WMO[code] || WMO[Math.floor(code/10)*10] || { label:'Mixed', icon:'ti-cloud' };
  }

  async function fetch3Day(lat, lng) {
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    if (CACHE[key]) return CACHE[key];

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}`
      + `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,precipitation_sum`
      + `&timezone=Asia/Tokyo&forecast_days=3`;

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

  function dayCard(d) {
    const { label, icon } = wmo(d.code);
    const dateLabel = new Date(d.date).toLocaleDateString('en-GB', {
      weekday:'short', day:'numeric', month:'short'
    });
    const hasRain = d.precipProb != null && d.precipProb > 0;
    const isWet   = hasRain && d.precipProb >= 50;
    const rainLine = hasRain
      ? `<span class="wx-rain${isWet ? ' wx-rain--wet' : ''}">☂ ${d.precipProb}%${d.precip > 0 ? ' · ' + d.precip + 'mm' : ''}</span>`
      : '';
    return `
      <div class="wx-day">
        <span class="wx-date">${dateLabel}</span>
        <i class="ti ${icon} wx-icon" title="${label}"></i>
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
          ${days.map(dayCard).join('')}
        </div>`;
    } catch(_) { el.innerHTML = ''; }
  }

  /* Multi-location: renders two stacked strips */
  async function renderMultiStrip(el, points) {
    if (!navigator.onLine) { el.innerHTML = ''; return; }
    try {
      const allDays = await Promise.all(points.map(p => fetch3Day(p.lat, p.lng)));
      el.innerHTML = allDays.map((days, i) => `
        <div class="wx-strip">
          <span class="wx-location">${points[i].label}</span>
          ${days.map(dayCard).join('')}
        </div>`).join('');
    } catch(_) { el.innerHTML = ''; }
  }

  return { renderStrip, renderMultiStrip };
})();

window.Weather = Weather;
