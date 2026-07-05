'use strict';

/* ============================================================
   COUNTRIES SCREEN — personal "showcase" page.
   World map shaded by visited country + flag grid, both driven
   by the same bundled GeoJSON (data/world-countries.geojson) so
   they can never drift out of sync with each other.
   Reached via the "My Trips" sheet, not a permanent bottom-nav tab.
   ============================================================ */

const CountriesScreen = (() => {
  let root = null;
  let worldGeoJson = null;
  let visitedSet = new Set();
  let leafletMap = null;

  function flagEmoji(iso2) {
    if (!iso2 || iso2.length !== 2) return '🏳️';
    return String.fromCodePoint(
      ...iso2.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0))
    );
  }

  async function loadGeoJson() {
    if (worldGeoJson) return worldGeoJson;
    const res = await fetch('data/world-countries.geojson');
    worldGeoJson = await res.json();
    return worldGeoJson;
  }

  function countryStyle(feature) {
    const code = feature.properties.iso2;
    const visited = code && visitedSet.has(code);
    return {
      fillColor: visited ? '#C49A5A' : '#5A5448',
      fillOpacity: visited ? 0.85 : 0.3,
      color: '#7A5C2E',
      weight: 0.6,
    };
  }

  async function toggleCountry(code, name) {
    if (!code) { Toast.show(`${name} doesn't have an assignable country code`, 'info'); return; }
    await Data.toggleVisitedCountry(code);
    visitedSet = new Set(await Data.getVisitedCountries());
    render();
  }

  function renderMap(container) {
    const mapEl = document.createElement('div');
    mapEl.style.cssText = 'width:100%;height:300px;border-radius:var(--r-md);overflow:hidden;background:#1A1712';
    container.appendChild(mapEl);

    // Leaflet needs the element in the DOM with real dimensions before init
    requestAnimationFrame(() => {
      leafletMap = L.map(mapEl, {
        zoomControl: false,
        attributionControl: false,
        worldCopyJump: false,
        maxBounds: [[-85, -180], [85, 180]],
        minZoom: 1,
        maxZoom: 4,
      }).setView([12, 12], 1);

      L.geoJSON(worldGeoJson, {
        style: countryStyle,
        onEachFeature: (feature, layer) => {
          layer.on('click', () => toggleCountry(feature.properties.iso2, feature.properties.name));
        },
      }).addTo(leafletMap);
    });
  }

  function renderFlagGrid(container) {
    const sorted = [...worldGeoJson.features]
      .filter(f => f.properties.iso2)
      .sort((a, b) => a.properties.name.localeCompare(b.properties.name));

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(68px,1fr));gap:8px;margin-top:var(--s3)';

    sorted.forEach(f => {
      const code = f.properties.iso2;
      const name = f.properties.name;
      const visited = visitedSet.has(code);
      const cell = document.createElement('button');
      cell.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:2px;background:none;border:none;cursor:pointer;padding:6px 2px;border-radius:var(--r-md);opacity:${visited ? '1' : '.32'};transition:opacity .15s`;
      cell.innerHTML = `<span style="font-size:26px;line-height:1">${flagEmoji(code)}</span><span style="font-size:9px;color:var(--text-muted);text-align:center;line-height:1.15">${name}</span>`;
      cell.addEventListener('click', () => toggleCountry(code, name));
      grid.appendChild(cell);
    });
    container.appendChild(grid);
  }

  async function render() {
    if (!root) return;
    root.innerHTML = '';

    await loadGeoJson();
    visitedSet = new Set(await Data.getVisitedCountries());

    const totalCodes = new Set(worldGeoJson.features.map(f => f.properties.iso2).filter(Boolean));
    const visitedCount = [...visitedSet].filter(c => totalCodes.has(c)).length;
    const pct = totalCodes.size ? Math.round((visitedCount / totalCodes.size) * 100) : 0;

    // Header with back button
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:var(--s3);padding:var(--s4) var(--s4) 0';
    header.innerHTML = `
      <button id="countries-back-btn" style="background:none;border:none;color:var(--text-primary);font-size:22px;cursor:pointer;padding:4px">←</button>
      <div>
        <p style="font-size:28px;font-weight:600;color:var(--text-primary);line-height:1.1">${visitedCount}<span style="font-size:15px;font-weight:400;color:var(--text-muted)"> of ${totalCodes.size} countries</span></p>
        <p style="font-size:var(--text-sm);color:var(--text-muted)">${pct}% of the world visited</p>
      </div>`;
    root.appendChild(header);
    header.querySelector('#countries-back-btn').addEventListener('click', () => App.switchTo('itinerary'));

    const mapWrap = document.createElement('div');
    mapWrap.style.cssText = 'padding:var(--s4)';
    root.appendChild(mapWrap);
    renderMap(mapWrap);

    const hint = document.createElement('p');
    hint.style.cssText = 'font-size:var(--text-xs);color:var(--text-muted);padding:0 var(--s4);text-align:center';
    hint.textContent = 'Tap a country on the map or flag to mark it visited';
    root.appendChild(hint);

    const gridWrap = document.createElement('div');
    gridWrap.style.cssText = 'padding:0 var(--s4) var(--s6)';
    renderFlagGrid(gridWrap);
    root.appendChild(gridWrap);
  }

  function init(rootEl) {
    root = rootEl;
    render();
  }

  function destroy() {
    if (leafletMap) { leafletMap.remove(); leafletMap = null; }
    root = null;
  }

  return { init, destroy, refresh: render };
})();

window.CountriesScreen = CountriesScreen;
