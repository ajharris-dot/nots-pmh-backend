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

    // Show overlay and fade IN to black+video
    overlay.classList.remove('hidden');
    await new Promise(requestAnimationFrame);
    overlay.classList.add('show'); // stays opaque

    // Try to play; if blocked, just go in
    try {
      video.currentTime = 0;
      await video.play();
    } catch (err) {
      console.warn('Video play blocked, skipping transition', err);
      window.location.replace('/');
      return;
    }

  // When video finishes, redirect immediately while overlay is still covering page
  const go = () => window.location.replace('/');
  video.onended = go;

  // Safety fallback in case 'ended' never fires (e.g., stalled media)
  setTimeout(go, 15000);
}


  function nextFrame() {
    return new Promise(requestAnimationFrame);
  }
});
