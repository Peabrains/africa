'use strict';

/* ============================================================
   ACCOUNT — name, email, sign out. Opened as a bottom sheet
   from Home's settings gear. This is where account-level info
   lives now — it used to be split with a duplicate section under
   Bookings → Settings, which only ever showed email + sign out
   with no way to set a name. That duplicate has been removed;
   this is the one place for it.
   ============================================================ */

const AccountScreen = (() => {
  function open(onClose) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.5);display:flex;align-items:flex-end';

    const sheet = document.createElement('div');
    sheet.style.cssText = 'background:var(--bg);width:100%;max-height:85vh;border-radius:20px 20px 0 0;overflow-y:auto;padding-bottom:env(safe-area-inset-bottom)';
    sheet.innerHTML = `
      <div style="display:flex;justify-content:center;padding:8px 0 0"><div style="width:36px;height:4px;background:var(--border);border-radius:2px"></div></div>
      <div style="padding:var(--s4)">
        <p style="font-size:var(--text-lg);font-weight:700;color:var(--text-primary);margin-bottom:var(--s4)">Account</p>

        <div class="bs-edit-group">
          <label class="bs-edit-label">Your name</label>
          <input id="acct-name" class="bs-input" type="text" placeholder="e.g. Cindy">
        </div>

        <div class="bs-edit-group">
          <label class="bs-edit-label">Email</label>
          <p id="acct-email" style="font-size:var(--text-sm);color:var(--text-secondary);padding:8px 0">Loading…</p>
        </div>

        <button id="acct-save-btn" class="btn btn-primary" style="width:100%;margin-top:var(--s2)">Save</button>
        <button id="acct-signout-btn" class="btn btn-ghost" style="width:100%;margin-top:var(--s2);color:var(--danger-text);border-color:var(--danger-text)">Sign out</button>
        <button id="acct-close-btn" class="btn btn-ghost" style="width:100%;margin-top:var(--s2)">Close</button>
      </div>`;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    function close() { overlay.remove(); onClose?.(); }

    sheet.querySelector('#acct-close-btn').addEventListener('click', close);
    sheet.querySelector('#acct-signout-btn').addEventListener('click', () => Auth.signOut());

    (async () => {
      const user = await Auth.getUser();
      const emailEl = sheet.querySelector('#acct-email');
      const nameEl = sheet.querySelector('#acct-name');
      if (emailEl) emailEl.textContent = user?.email || '—';
      if (nameEl) nameEl.value = user?.user_metadata?.full_name || '';
    })();

    sheet.querySelector('#acct-save-btn').addEventListener('click', async () => {
      const name = sheet.querySelector('#acct-name').value.trim();
      const btn = sheet.querySelector('#acct-save-btn');
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        const { error } = await SB.auth.updateUser({ data: { full_name: name } });
        if (error) throw error;
        Toast.show('Saved', 'success');
        close();
      } catch (e) {
        Toast.show('Could not save: ' + e.message, 'danger');
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    });
  }

  return { open };
})();

window.AccountScreen = AccountScreen;
