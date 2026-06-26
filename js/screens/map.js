'use strict';

const MapScreen = (() => {
  let root, map, markersLayer;

  const SEG_COLOR  = { transit:'#AAAAAA', kumano:'#C1440E', nagano:'#7B4EA0', alpine:'#2A7A4B', osaka:'#888888' };
  const SEG_LABEL  = { transit:'Transit', kumano:'Kumano Kodo', nagano:'Nagano · Togakushi', alpine:'Alpine Route · Murodo', osaka:'Osaka' };

  /* ─── Custom Leaflet marker ──────────────────────────────── */
  function makeIcon(stop) {
    const color = SEG_COLOR[stop.segment] || '#888';
    const bg    = stop.booking.status === 'urgent'  ? '#FEF2F2'
                : stop.booking.status === 'booked'  ? '#DCFCE7'
                : '#FFFFFF';
    const size  = stop.hasStamp ? 36 : 30;
    const inner = stop.hasStamp
      ? `<text x="16" y="14" text-anchor="middle" font-family="'Plus Jakarta Sans'" font-size="9" font-weight="500" fill="${color}">${stop.stampKanji}</text>`
      : `<circle cx="16" cy="13" r="4" fill="${color}"/>`;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size+6}" viewBox="0 0 32 38">
        <path d="M16 1C9.4 1 4 6.4 4 13c0 8.5 12 24 12 24S28 21.5 28 13c0-6.6-5.4-12-12-12z"
              fill="${bg}" stroke="${color}" stroke-width="2"/>
        ${inner}
      </svg>`;
    return L.divIcon({ html: svg, iconSize:[size,size+6], iconAnchor:[size/2,size+6], className:'' });
  }

  /* ─── Render all markers ─────────────────────────────────── */
  function renderAll() {
    if (!map) return;
    if (markersLayer) markersLayer.clearLayers();
    markersLayer = L.layerGroup().addTo(map);

    const stops = Data.getStops().filter(s => s.lat && s.lng);
    const segments = {};

    stops.forEach(stop => {
      if (!segments[stop.segment]) segments[stop.segment] = [];
      segments[stop.segment].push(stop);
    });

    // Draw route lines per segment
    Object.entries(segments).forEach(([seg, segStops]) => {
      const sorted = segStops.sort((a,b) => {
        const dayOrder = Data.getDays().findIndex(d=>d.id===a.dayId) - Data.getDays().findIndex(d=>d.id===b.dayId);
        return dayOrder || a.order - b.order;
      });
      if (sorted.length > 1) {
        L.polyline(sorted.map(s=>[s.lat,s.lng]), {
          color: SEG_COLOR[seg] || '#888',
          weight: 2,
          opacity: 0.4,
          dashArray: '5, 4',
        }).addTo(markersLayer);
      }

      sorted.forEach(stop => {
        const marker = L.marker([stop.lat, stop.lng], { icon: makeIcon(stop) }).addTo(markersLayer);
        marker.on('click', () => {
          const day = Data.getDays().find(d=>d.id===stop.dayId);
          BottomSheet.openStop(stop, day);
        });

        // Tooltip for desktop hover
        marker.bindTooltip(`<strong>${stop.name}</strong><br><small>${stop.time || ''}</small>`, {
          direction:'top', offset:[0,-36], opacity:0.95,
        });
      });
    });

    // Fit all stops
    const latlngs = stops.map(s=>[s.lat,s.lng]);
    if (latlngs.length) map.fitBounds(L.latLngBounds(latlngs), { paddingTopLeft:[24,24], paddingBottomRight:[24,88] });
  }

  /* ─── Segment legend ─────────────────────────────────────── */
  function legend() {
    const div = document.createElement('div');
    div.className = 'map-legend';
    Object.entries(SEG_LABEL).forEach(([seg, label]) => {
      div.innerHTML += `
        <div class="map-legend-item">
          <span class="map-legend-dot" style="background:${SEG_COLOR[seg]}"></span>
          <span>${label}</span>
        </div>`;
    });
    return div;
  }

  /* ─── Main render ────────────────────────────────────────── */
  function render() {
    if (!root) return;
    root.innerHTML = '';
    root.style.cssText = 'display:flex;flex-direction:column;height:100%;';

    root.appendChild(legend());

    const mapEl = document.createElement('div');
    mapEl.id = 'map-container';
    mapEl.style.cssText = 'flex:1;border-radius:var(--r-lg);overflow:hidden;border:1.5px solid var(--border);min-height:0;';
    root.appendChild(mapEl);

    map = L.map('map-container', { zoomControl:true, attributionControl:true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:'© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom:18,
    }).addTo(map);

    // Wait for layout to settle (fixed nav changes container dimensions)
    // then force Leaflet to recalculate container size and re-render tiles
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (map) {
          map.invalidateSize();
          renderAll();
        }
      });
    });
  }

  return {
    init(el) { root = el; render(); },
    destroy() { if(map){ map.remove(); map=null; } markersLayer=null; root=null; },
  };
})();

window.MapScreen = MapScreen;
