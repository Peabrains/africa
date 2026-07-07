'use strict';

const MapScreen = (() => {
  let root, map, markersLayer;

  /* Auto-generate a consistent color per locality name — same approach
     as itinerary.js, so map and itinerary always agree on colors without
     either needing a maintained per-trip list. */
  const AUTO_PALETTE = ['#C1440E','#2A7A4B','#7B4EA0','#0E7C7B','#E8A23D','#2E86AB','#C1447E','#B8860B','#4C6B8A','#8E6C4A'];
  function colorForKey(key) {
    if (!key || key.toLowerCase() === 'transit') return '#9C9080';
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return AUTO_PALETTE[hash % AUTO_PALETTE.length];
  }

  /* ── Custom Leaflet marker ──────────────────────────────────── */
  function makeIcon(stop) {
    const color = colorForKey(stop.locality || stop.segment);

    // Background tint based on booking or flight status
    const bg = stop.flightExcluded ? '#FFFBEB'   // gold tint — needs to buy
             : stop.flightIncluded ? '#DCFCE7'   // green tint — included flight
             : stop.booking?.status === 'urgent' ? '#FEF2F2'
             : stop.booking?.status === 'booked' ? '#DCFCE7'
             : '#FFFFFF';

    // Inner mark: plane icon for flights, circle for others
    const isPlane = stop.transportType === 'plane';
    const inner = isPlane
      ? `<text x="16" y="15" text-anchor="middle" font-family="system-ui" font-size="11" fill="${color}">✈</text>`
      : `<circle cx="16" cy="13" r="4" fill="${color}"/>`;

    const size = 30;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size+6}" viewBox="0 0 32 38">
        <path d="M16 1C9.4 1 4 6.4 4 13c0 8.5 12 24 12 24S28 21.5 28 13c0-6.6-5.4-12-12-12z"
              fill="${bg}" stroke="${color}" stroke-width="2"/>
        ${inner}
      </svg>`;
    return L.divIcon({ html: svg, iconSize:[size,size+6], iconAnchor:[size/2,size+6], className:'' });
  }

  /* ── Render all markers ─────────────────────────────────────── */
  function renderAll() {
    if (!map) return;
    if (markersLayer) markersLayer.clearLayers();
    markersLayer = L.layerGroup().addTo(map);

    const stops = Data.getStops().filter(s => s.lat && s.lng);
    const groups = {};

    stops.forEach(stop => {
      const key = stop.locality || stop.segment || 'transit';
      if (!groups[key]) groups[key] = [];
      groups[key].push(stop);
    });

    // Draw dashed route lines per locality, sorted by day + order
    Object.entries(groups).forEach(([key, groupStops]) => {
      const dayIds = Data.getDays().map(d => d.id);
      const sorted = groupStops.sort((a,b) => {
        const da = dayIds.indexOf(a.dayId);
        const db = dayIds.indexOf(b.dayId);
        return da !== db ? da - db : (a.order||0) - (b.order||0);
      });

      if (sorted.length > 1) {
        L.polyline(sorted.map(s => [s.lat, s.lng]), {
          color:     colorForKey(key),
          weight:    2,
          opacity:   0.45,
          dashArray: '5, 4',
        }).addTo(markersLayer);
      }

      sorted.forEach(stop => {
        const marker = L.marker([stop.lat, stop.lng], { icon: makeIcon(stop) }).addTo(markersLayer);
        marker.on('click', () => {
          const day = Data.getDays().find(d => d.id === stop.dayId);
          BottomSheet.openStop(stop, day);
        });
        marker.bindTooltip(
          `<strong>${stop.name}</strong><br><small>${stop.time || ''} ${stop.timeZone || ''}</small>`,
          { direction:'top', offset:[0,-36], opacity:0.95 }
        );
      });
    });

    // Fit all stops in view
    const latlngs = stops.map(s => [s.lat, s.lng]);
    if (latlngs.length) {
      map.fitBounds(L.latLngBounds(latlngs), {
        paddingTopLeft:     [24, 24],
        paddingBottomRight: [24, 88],
      });
    }
  }

  /* ── Legend ─────────────────────────────────────────────────── */
  function legend() {
    const div = document.createElement('div');
    div.className = 'map-legend';

    // Distinct localities actually present on this trip, in first-seen order
    const seen = [];
    Data.getStops().forEach(s => {
      const key = s.locality || s.segment;
      if (key && !seen.includes(key)) seen.push(key);
    });

    seen.forEach(key => {
      div.innerHTML += `
        <div class="map-legend-item">
          <span class="map-legend-dot" style="background:${colorForKey(key)}"></span>
          <span>${key}</span>
        </div>`;
    });

    // Flight badge legend
    div.innerHTML += `
      <div class="map-legend-item" style="margin-left:var(--s2)">
        <span style="font-size:9px;background:#DCFCE7;color:#166534;border:1px solid #A7F3C0;border-radius:100px;padding:1px 5px">✓ Incl.</span>
      </div>
      <div class="map-legend-item">
        <span style="font-size:9px;background:#FFFBEB;color:#92400E;border:1px solid #FCD87D;border-radius:100px;padding:1px 5px">Buy sep.</span>
      </div>`;

    return div;
  }

  /* ── Main render ────────────────────────────────────────────── */
  function render() {
    if (!root) return;
    root.innerHTML = '';
    root.style.cssText = 'display:flex;flex-direction:column;height:100%;';

    root.appendChild(legend());

    const mapEl = document.createElement('div');
    mapEl.id = 'map-container';
    root.appendChild(mapEl);

    map = L.map('map-container', { zoomControl:true, attributionControl:true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

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
    destroy() { if (map) { map.remove(); map = null; } markersLayer = null; root = null; },
  };
})();

window.MapScreen = MapScreen;
