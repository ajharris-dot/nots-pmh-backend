const AUTH = '/api/auth';
const TOKEN_KEY = 'authToken';

document.addEventListener('DOMContentLoaded', () => {
  const form        = document.getElementById('loginForm');
  const email       = document.getElementById('loginEmail');
  const pass        = document.getElementById('loginPassword');
  const errEl       = document.getElementById('loginError');
  const overlay     = document.getElementById('loginTransition');
  const video       = document.getElementById('transitionVideo');

  // Already logged in? go to app
  if (localStorage.getItem(TOKEN_KEY)) {
    window.location.replace('/');
    return;
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = '';

    const emailVal = email?.value?.trim();
    const passVal  = pass?.value || '';
    if (!emailVal || !passVal) {
      errEl.textContent = 'Email and password are required.';
      return;
    }

    try {
      const res = await fetch(`${AUTH}/login`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ email: emailVal, password: passVal })
      });

      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        errEl.textContent = t || `Login failed (${res.status})`;
        return;
      }

      const data = await res.json();
      if (!data?.token) {
        errEl.textContent = 'No token returned.';
        return;
      }

      // Save token
      localStorage.setItem(TOKEN_KEY, data.token);

      // Play the fade-in -> video -> fade-out transition, then redirect
      await playTransitionAndRedirect();

    } catch (err) {
      console.error('login error', err);
      errEl.textContent = 'Network error. Please try again.';
    }
  });

  async function playTransitionAndRedirect() {
    if (!overlay || !video) {
      window.location.replace('/'); // fallback if markup missing
      return;
    }

    // reveal overlay, then fade in (use RAF to ensure transition runs)
    overlay.classList.remove('hidden');
    await nextFrame();
    overlay.classList.add('show');  // CSS handles opacity: 0 -> 1

    // Start video. If autoplay is blocked for any reason, just go in.
    try {
      video.currentTime = 0;
      await video.play();
    } catch (err) {
      console.warn('Video play blocked, skipping transition', err);
      window.location.replace('/');
      return;
    }

    // When video finishes: fade out, then redirect
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      overlay.classList.add('fadeout'); // CSS opacity: 1 -> 0
      setTimeout(() => window.location.replace('/'), 1000); // match CSS transition
    };

    video.onended = done;

    // Safety fallback in case 'ended' never fires (max 15s)
    setTimeout(done, 15000);
  }

  function nextFrame() {
    return new Promise(requestAnimationFrame);
  }
});
