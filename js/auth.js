'use strict';

/* ============================================================
   AUTH — Supabase email/password authentication
   Replaces the old PIN gate entirely.
   ============================================================ */

const Auth = (() => {

  let _resolveGate;
  const _gatePromise = new Promise(res => { _resolveGate = res; });

  function showError(msg) {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function clearError() {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  }

  /* Supabase persists the last session in localStorage. When the device is
     genuinely offline an expired access token cannot be refreshed, but the
     cached user is still sufficient to unlock data that is already stored on
     this device. It does not grant server access: Supabase still validates the
     token before accepting any request once connectivity returns. */
  function getCachedUser() {
    try {
      // GitHub Pages apps share one origin, so never accept an auth record
      // belonging to a different Supabase project hosted under another path.
      const key = SB?.auth?.storageKey || 'sb-abycrkrfaocttujzhqhq-auth-token';
      const stored = JSON.parse(localStorage.getItem(key) || 'null');
      const session = stored?.currentSession || stored?.session || stored;
      if (session?.user?.id) return session.user;
    } catch (error) {
      console.warn('[Auth] Could not read cached session:', error.message || error);
    }
    return null;
  }

  function renderOfflineScreen() {
    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:var(--s6)';
    overlay.innerHTML = `
      <div style="width:100%;max-width:360px;text-align:center">
        <div style="font-size:48px;margin-bottom:var(--s2)">🧭</div>
        <p style="font-size:22px;font-weight:500;color:var(--text-primary)">You’re offline</p>
        <p style="font-size:var(--text-sm);color:var(--text-muted);margin-top:8px;line-height:1.5">This device has not saved a signed-in session yet. Connect once to sign in, then your cached trips can open without internet.</p>
        <button id="auth-offline-retry" style="background:var(--accent);color:#fff;border:none;border-radius:var(--r-md);padding:12px 20px;font-size:var(--text-sm);font-weight:500;cursor:pointer;font-family:var(--font);margin-top:var(--s4)">Try again</button>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('auth-offline-retry')?.addEventListener('click', () => window.location.reload());
    window.addEventListener?.('online', () => window.location.reload(), { once: true });
  }

  function setLoading(loading, isSignup) {
    const btn = document.getElementById('auth-submit-btn');
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? 'Please wait…' : (isSignup ? 'Create account' : 'Sign in');
    }
  }

  function renderAuthScreen() {
    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:var(--s6)';

    overlay.innerHTML = `
      <div style="width:100%;max-width:360px">
        <div style="text-align:center;margin-bottom:var(--s6)">
          <div style="font-size:48px;margin-bottom:var(--s2)">🧭</div>
          <p style="font-size:22px;font-weight:500;color:var(--text-primary)">Trip Companion</p>
          <p style="font-size:var(--text-sm);color:var(--text-muted);margin-top:4px">Your luxury trip companion</p>
        </div>
        <div id="auth-mode" data-mode="login" style="display:flex;flex-direction:column;gap:var(--s3)">
          <div id="auth-name-field" style="display:none;flex-direction:column;gap:4px">
            <label style="font-size:var(--text-xs);font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Your name</label>
            <input id="auth-name" type="text" placeholder="Traveler"
              style="border:1.5px solid var(--border);border-radius:var(--r-md);padding:12px var(--s3);font-size:var(--text-base);background:var(--surface);color:var(--text-primary);font-family:var(--font);width:100%;box-sizing:border-box">
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:var(--text-xs);font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Email</label>
            <input id="auth-email" type="email" placeholder="you@email.com" autocomplete="email"
              style="border:1.5px solid var(--border);border-radius:var(--r-md);padding:12px var(--s3);font-size:var(--text-base);background:var(--surface);color:var(--text-primary);font-family:var(--font);width:100%;box-sizing:border-box">
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:var(--text-xs);font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Password</label>
            <input id="auth-password" type="password" placeholder="••••••••" autocomplete="current-password"
              style="border:1.5px solid var(--border);border-radius:var(--r-md);padding:12px var(--s3);font-size:var(--text-base);background:var(--surface);color:var(--text-primary);font-family:var(--font);width:100%;box-sizing:border-box">
          </div>
          <p id="auth-error" style="display:none;font-size:var(--text-xs);color:var(--danger-text);background:var(--danger-bg);border:1px solid var(--danger-border);border-radius:var(--r-sm);padding:8px 10px;line-height:1.4"></p>
          <button id="auth-submit-btn"
            style="background:var(--accent);color:#fff;border:none;border-radius:var(--r-md);padding:14px;font-size:var(--text-base);font-weight:500;cursor:pointer;font-family:var(--font);margin-top:var(--s1)">
            Sign in
          </button>
          <p style="text-align:center;font-size:var(--text-sm);color:var(--text-muted)">
            <span id="auth-toggle-text">Don't have an account?</span>
            <button id="auth-toggle-btn"
              style="background:none;border:none;color:var(--accent);font-size:var(--text-sm);font-weight:500;cursor:pointer;font-family:var(--font);padding:0;margin-left:4px">
              Sign up
            </button>
          </p>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    let isSignup = false;
    const submitBtn  = document.getElementById('auth-submit-btn');
    const toggleBtn  = document.getElementById('auth-toggle-btn');
    const toggleText = document.getElementById('auth-toggle-text');
    const nameField  = document.getElementById('auth-name-field');

    toggleBtn.addEventListener('click', () => {
      isSignup = !isSignup;
      submitBtn.textContent  = isSignup ? 'Create account' : 'Sign in';
      toggleBtn.textContent  = isSignup ? 'Sign in' : 'Sign up';
      toggleText.textContent = isSignup ? 'Already have an account?' : "Don't have an account?";
      nameField.style.display = isSignup ? 'flex' : 'none';
      clearError();
    });

    submitBtn.addEventListener('click', async () => {
      const email    = document.getElementById('auth-email')?.value.trim();
      const password = document.getElementById('auth-password')?.value;
      const name     = document.getElementById('auth-name')?.value.trim();

      if (!email || !password) { showError('Please enter your email and password.'); return; }
      if (password.length < 6) { showError('Password must be at least 6 characters.'); return; }

      setLoading(true, isSignup);
      clearError();

      try {
        if (isSignup) {
          const { error } = await SB.auth.signUp({
            email, password,
            options: { data: { full_name: name || email.split('@')[0] } },
          });
          if (error) throw error;
          showError('Account created! Check your email to confirm, or sign in if confirmation is disabled.');
          setLoading(false, isSignup);
        } else {
          const { error } = await SB.auth.signInWithPassword({ email, password });
          if (error) throw error;
        }
      } catch (err) {
        const msg = err.message || '';
        showError(
          msg.includes('Invalid login')          ? 'Incorrect email or password.' :
          msg.includes('Email not confirmed')    ? 'Please confirm your email first.' :
          msg.includes('User already registered')? 'Account exists — sign in instead.' :
          msg || 'Something went wrong. Please try again.'
        );
        setLoading(false, isSignup);
      }
    });

    overlay.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitBtn.click();
    });
  }

  function renderSetPasswordScreen(onComplete) {
    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:var(--s6)';
    overlay.innerHTML = `
      <div style="width:100%;max-width:360px">
        <div style="text-align:center;margin-bottom:var(--s6)">
          <div style="font-size:48px;margin-bottom:var(--s2)">🧭</div>
          <p style="font-size:22px;font-weight:500;color:var(--text-primary)">Welcome!</p>
          <p style="font-size:var(--text-sm);color:var(--text-muted);margin-top:4px">Set a password to finish joining the trip</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:var(--s3)">
          <input id="setpw-input" type="password" placeholder="Choose a password" autocomplete="new-password"
            style="width:100%;border:1.5px solid var(--border);border-radius:var(--r-md);padding:10px 12px;font-size:var(--text-sm);background:var(--surface);color:var(--text-primary);font-family:var(--font);box-sizing:border-box">
          <p id="setpw-error" style="display:none;color:var(--danger-text);font-size:var(--text-xs)"></p>
          <button id="setpw-btn" style="background:var(--accent);color:#fff;border:none;border-radius:var(--r-md);padding:12px;font-size:var(--text-sm);font-weight:500;cursor:pointer;font-family:var(--font)">Set password & continue</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const btn = overlay.querySelector('#setpw-btn');
    const input = overlay.querySelector('#setpw-input');
    const err = overlay.querySelector('#setpw-error');
    btn.addEventListener('click', async () => {
      const pw = input.value;
      if (!pw || pw.length < 6) {
        err.textContent = 'Password must be at least 6 characters';
        err.style.display = 'block';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Saving…';
      const { data, error } = await SB.auth.updateUser({ password: pw });
      if (error) {
        err.textContent = error.message;
        err.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Set password & continue';
        return;
      }
      overlay.style.transition = 'opacity .3s';
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 300);
      onComplete(data.user);
    });
  }

  async function gate() {
    // Detect an invite/recovery link landing — read the hash captured at the
    // very top of index.html, BEFORE Supabase's client stripped it from the
    // URL during its own initialization (it does this almost immediately,
    // well before this code runs).
    const hash = window.__authRedirectHash || window.location.hash || '';
    const isInviteOrRecovery = /type=(invite|recovery)/.test(hash);
    console.log('[Auth] redirect hash:', hash, '| isInviteOrRecovery:', isInviteOrRecovery);

    if (isInviteOrRecovery) {
      renderSetPasswordScreen((user) => _resolveGate(user));
      return _gatePromise;
    }

    const cachedUser = getCachedUser();

    // Do not ask Supabase to refresh a token when there is no network. That
    // refresh failure used to be mistaken for a real sign-out and replaced
    // the locally available trip with the login screen.
    if (!navigator.onLine) {
      if (cachedUser) {
        _resolveGate(cachedUser);
        return _gatePromise;
      }
      renderOfflineScreen();
      return _gatePromise;
    }

    let session = null;
    let sessionError = null;
    try {
      const result = await SB.auth.getSession();
      session = result?.data?.session || null;
      sessionError = result?.error || null;
    } catch (error) {
      sessionError = error;
    }
    if (session) {
      _resolveGate(session.user);
      return _gatePromise;
    }

    // navigator.onLine can remain true during a captive portal or brief
    // outage. Only fall back to the cached identity when session lookup
    // actually failed; a clean null session still means genuinely signed out.
    if (sessionError && cachedUser) {
      console.warn('[Auth] Session refresh unavailable; opening cached trips.');
      _resolveGate(cachedUser);
      return _gatePromise;
    }

    renderAuthScreen();

    SB.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const overlay = document.getElementById('auth-overlay');
        if (overlay) {
          overlay.style.transition = 'opacity .3s';
          overlay.style.opacity = '0';
          setTimeout(() => overlay.remove(), 300);
        }
        _resolveGate(session.user);
      }
    });

    return _gatePromise;
  }

  async function signOut() {
    await SB.auth.signOut();
    window.location.reload();
  }

  async function getUser() {
    const { data: { user } } = await SB.auth.getUser();
    return user;
  }

  return { gate, signOut, getUser };
})();

window.Auth = Auth;
