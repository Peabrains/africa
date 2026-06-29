'use strict';

/* ============================================================
   AUTH — Simple PIN gate for Africa Safari PWA
   ─────────────────────────────────────────────────────────────
   HOW IT WORKS:
   • On first load, user sets a 4-digit PIN. It is hashed with
     SHA-256 and stored in localStorage (only the hash — never
     the raw PIN).
   • On every subsequent fresh session (new tab/browser open),
     the user must enter the PIN before the app loads.
   • Verified sessions are flagged in sessionStorage so the
     prompt doesn't appear again within the same browser tab.
   • There is no "forgot PIN" — delete localStorage to reset.

   TO SET YOUR PIN:
   1. Open the app for the first time
   2. Choose a 4-digit PIN
   3. Confirm it
   4. Done — the app unlocks and saves the hash

   TO CHANGE PIN:
   Open browser DevTools → Application → Local Storage →
   delete the 'africa-pin-hash' key → reload → set new PIN.
   ============================================================ */

const Auth = (() => {

  const HASH_KEY    = 'africa-pin-hash';    // localStorage — stores SHA-256 hash only
  const SESSION_KEY = 'africa-authed';      // sessionStorage — cleared when tab closes

  /* ── SHA-256 a string ───────────────────────────────────────── */
  async function sha256(str) {
    const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  /* ── Check if session is already verified ───────────────────── */
  function isSessionAuthed() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch(_) { return false; }
  }

  function markSessionAuthed() {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch(_) {}
  }

  /* ── Get stored PIN hash ────────────────────────────────────── */
  function getStoredHash() {
    try { return localStorage.getItem(HASH_KEY); } catch(_) { return null; }
  }

  async function storeHash(pin) {
    const hash = await sha256(pin);
    try { localStorage.setItem(HASH_KEY, hash); } catch(_) {}
    return hash;
  }

  /* ── Render the PIN overlay ─────────────────────────────────── */
  function renderOverlay(mode) {
    // mode: 'set' (first time) | 'verify' (returning)
    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      background:var(--bg);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:32px 24px;font-family:var(--font);
    `;

    const isSet = mode === 'set';

    overlay.innerHTML = `
      <div style="max-width:320px;width:100%;text-align:center">
        <div style="font-size:40px;margin-bottom:16px">🌍</div>
        <p style="font-size:18px;font-weight:500;color:var(--text-primary);margin-bottom:6px">
          Africa Safari 2026
        </p>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:32px">
          ${isSet ? 'Choose a 4-digit PIN to protect this app' : 'Enter your PIN to continue'}
        </p>

        <div style="display:flex;justify-content:center;gap:12px;margin-bottom:24px" id="pin-dots">
          ${[0,1,2,3].map(i => `<div id="dot-${i}" style="width:14px;height:14px;border-radius:50%;background:var(--border);transition:background .15s"></div>`).join('')}
        </div>

        ${isSet ? `
          <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px" id="pin-step-label">Step 1 of 2 — choose PIN</p>
        ` : ''}

        <p style="font-size:12px;color:var(--danger-text);min-height:18px;margin-bottom:16px" id="pin-error"></p>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-width:240px;margin:0 auto" id="pin-pad">
          ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k => `
            <button data-key="${k}" style="
              height:60px;border-radius:12px;border:1.5px solid var(--border);
              background:var(--surface);color:var(--text-primary);
              font-size:20px;font-weight:500;font-family:var(--font);cursor:pointer;
              transition:background .1s;
              ${k===''?'visibility:hidden':''}
            ">${k}</button>
          `).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  /* ── PIN pad logic ──────────────────────────────────────────── */
  function runPinPad(overlay, mode) {
    return new Promise((resolve) => {
      let entry   = '';
      let confirm = '';
      let step    = 1; // for 'set' mode: 1=choose, 2=confirm

      const dots     = [0,1,2,3].map(i => document.getElementById('dot-'+i));
      const errorEl  = document.getElementById('pin-error');
      const stepLbl  = document.getElementById('pin-step-label');

      function updateDots(len) {
        dots.forEach((d, i) => {
          d.style.background = i < len
            ? 'var(--accent)'
            : 'var(--border)';
        });
      }

      function showError(msg) {
        errorEl.textContent = msg;
        setTimeout(() => { errorEl.textContent = ''; }, 2000);
      }

      function shake() {
        const pad = document.getElementById('pin-dots');
        pad.style.transform = 'translateX(-8px)';
        setTimeout(() => { pad.style.transform = 'translateX(8px)'; }, 80);
        setTimeout(() => { pad.style.transform = ''; }, 160);
      }

      async function handleDigit(key) {
        if (key === '⌫') {
          entry = entry.slice(0,-1);
          updateDots(entry.length);
          return;
        }
        if (entry.length >= 4) return;
        entry += String(key);
        updateDots(entry.length);

        if (entry.length < 4) return;

        // 4 digits entered
        if (mode === 'verify') {
          const hash    = await sha256(entry);
          const stored  = getStoredHash();
          if (hash === stored) {
            resolve(true);
          } else {
            shake();
            showError('Incorrect PIN — try again');
            entry = '';
            updateDots(0);
          }

        } else {
          // set mode
          if (step === 1) {
            confirm = entry;
            entry   = '';
            step    = 2;
            updateDots(0);
            if (stepLbl) stepLbl.textContent = 'Step 2 of 2 — confirm PIN';
          } else {
            if (entry === confirm) {
              await storeHash(entry);
              resolve(true);
            } else {
              shake();
              showError('PINs don\'t match — start again');
              entry   = '';
              confirm = '';
              step    = 1;
              updateDots(0);
              if (stepLbl) stepLbl.textContent = 'Step 1 of 2 — choose PIN';
            }
          }
        }
      }

      document.getElementById('pin-pad').addEventListener('click', e => {
        const btn = e.target.closest('button[data-key]');
        if (!btn) return;
        const key = btn.dataset.key;
        if (key === '') return;
        if (key === '⌫') { handleDigit('⌫'); return; }
        handleDigit(Number(key));
      });

      // Keyboard support
      document.addEventListener('keydown', function onKey(e) {
        if (e.key >= '0' && e.key <= '9') { handleDigit(Number(e.key)); }
        if (e.key === 'Backspace')         { handleDigit('⌫'); }
        if (e.key === 'Escape')            {} // do nothing — can't escape the gate
      });
    });
  }

  /* ── Public: gate the app ───────────────────────────────────── */
  async function gate() {
    // Already verified this session — let straight through
    if (isSessionAuthed()) return;

    const storedHash = getStoredHash();
    const mode       = storedHash ? 'verify' : 'set';

    const overlay = renderOverlay(mode);
    const ok      = await runPinPad(overlay, mode);

    if (ok) {
      markSessionAuthed();
      overlay.style.transition = 'opacity .3s';
      overlay.style.opacity    = '0';
      setTimeout(() => overlay.remove(), 300);
    }
  }

  return { gate };
})();

window.Auth = Auth;
