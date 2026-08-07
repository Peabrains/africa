'use strict';

/* ============================================================
   TRIP SWITCHER — tapping the trip name in the header jumps to
   the Home tab, where trip switching actually lives now (it's
   in the bottom nav — this is just a convenience shortcut).
   ============================================================ */

const TripSwitcher = (() => {
  function init() {
    const nameEl = document.getElementById('header-trip-name');
    const go = () => window.App?.switchTo('home');
    if (nameEl) { nameEl.style.cursor = 'pointer'; nameEl.addEventListener('click', go); }
  }

  return { init };
})();

window.TripSwitcher = TripSwitcher;
