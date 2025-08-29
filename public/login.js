// public/login.js
const AUTH = '/api/auth';
const TOKEN_KEY = 'authToken';

document.addEventListener('DOMContentLoaded', () => {
  const form   = document.getElementById('loginForm');
  const email  = document.getElementById('loginEmail');
  const pass   = document.getElementById('loginPassword');
  const cancel = document.getElementById('cancelLogin');
  const errEl  = document.getElementById('loginError');

  // If already logged in, go home
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
      localStorage.setItem(TOKEN_KEY, data.token);
      // go to main dashboard
      window.location.replace('/');
    } catch (err) {
      console.error('login error', err);
      errEl.textContent = 'Network error. Please try again.';
    }
  });

  cancel?.addEventListener('click', () => {
    // optional: clear fields
    form?.reset();
  });
});
