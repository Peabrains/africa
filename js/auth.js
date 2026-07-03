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
          <div style="font-size:48px;margin-bottom:var(--s2)">🌍</div>
          <p style="font-size:22px;font-weight:500;color:var(--text-primary)">Safari App</p>
          <p style="font-size:var(--text-sm);color:var(--text-muted);margin-top:4px">Your luxury trip companion</p>
        </div>
        <div id="auth-mode" data-mode="login" style="display:flex;flex-direction:column;gap:var(--s3)">
          <div id="auth-name-field" style="display:none;flex-direction:column;gap:4px">
            <label style="font-size:var(--text-xs);font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Your name</label>
            <input id="auth-name" type="text" placeholder="Vivien"
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

  async function gate() {
    const { data: { session } } = await SB.auth.getSession();
    if (session) {
      _resolveGate(session.user);
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
