'use strict';

/* ============================================================
   TRIP SWITCHER — now just wires the header tap to navigate to
   the full Landing screen (Trips + World Map), which replaced
   the old bottom-sheet "My Trips" popup.
   ============================================================ */

const TripSwitcher = (() => {
  function init() {
    const nameEl = document.getElementById('header-trip-name');
    const iconEl = document.getElementById('header-switch-icon');
    const go = () => window.App?.switchTo('landing');
    if (nameEl) { nameEl.style.cursor = 'pointer'; nameEl.addEventListener('click', go); }
    if (iconEl) { iconEl.style.cursor = 'pointer'; iconEl.addEventListener('click', go); }
  }

  return { init };
})();

window.TripSwitcher = TripSwitcher;
