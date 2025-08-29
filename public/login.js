const AUTH = '/api/auth';
const TOKEN_KEY = 'authToken';

document.addEventListener('DOMContentLoaded', () => {
  const form   = document.getElementById('loginForm');
  const email  = document.getElementById('loginEmail');
  const pass   = document.getElementById('loginPassword');
  const errEl  = document.getElementById('loginError');
  const transition = document.getElementById('loginTransition');
  const video = document.getElementById('transitionVideo');

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

      // Show transition
      transition.classList.remove('hidden');
      video.currentTime = 0;
      video.play();

      // Redirect after video ends (or fallback timeout)
      video.onended = () => window.location.replace('/');
      setTimeout(() => window.location.replace('/'), 4000); // fallback 4s

    } catch (err) {
      console.error('login error', err);
      errEl.textContent = 'Network error. Please try again.';
    }
  });
});
