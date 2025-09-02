const TOKEN_KEY = 'authToken';
const AUTH  = '/api/auth';
const USERS = '/api/users';

const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
const isAuthed = () => !!getToken();
const authFetch = (url, opts = {}) => {
  const headers = new Headers(opts.headers || {});
  const t = getToken();
  if (t) headers.set('Authorization', `Bearer ${t}`);
  return fetch(url, { ...opts, headers });
};

let CURRENT_USER = null;

document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('backBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  const userForm = document.getElementById('userForm');
  const usersList = document.getElementById('usersList');
  const resetUserFormBtn = document.getElementById('resetUserForm');

  const userIdEl = document.getElementById('userId');
  const userEmailEl = document.getElementById('userEmail');
  const userNameEl = document.getElementById('userName');
  const userRoleEl = document.getElementById('userRole');
  const userPasswordEl = document.getElementById('userPassword');

  async function fetchMe() {
    if (!isAuthed()) return (CURRENT_USER = null);
    try {
      const r = await authFetch(`${AUTH}/me`);
      if (!r.ok) return (CURRENT_USER = null);
      const d = await r.json();
      CURRENT_USER = d?.authenticated ? d.user : null;
    } catch {
      CURRENT_USER = null;
    }
  }

  function requireAdminOrBounce() {
    if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
      window.location.replace('/');
      throw new Error('not-admin');
    }
  }

  function resetForm() {
    userForm?.reset();
    userIdEl.value = '';
  }

  async function loadUsers() {
    try {
      const res = await authFetch(USERS);
      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        usersList.innerHTML = `<div style="color:#b91c1c">Error loading users: ${t || res.status}</div>`;
        return;
      }
      const list = await res.json();
      renderUsers(list);
    } catch (e) {
      console.error('loadUsers', e);
      usersList.innerHTML = `<div style="color:#b91c1c">Network error.</div>`;
    }
  }

  function renderUsers(list) {
    if (!Array.isArray(list) || !list.length) {
      usersList.innerHTML = `<div class="muted">No users yet.</div>`;
      return;
    }
    usersList.innerHTML = '';
    list.forEach(u => {
      const row = document.createElement('div');
      row.className = 'users-row';
      row.innerHTML = `
        <div>${u.email}</div>
        <div>${u.name || ''}</div>
        <div><span class="badge">${u.role}</span></div>
        <div style="display:flex; gap:6px; justify-content:flex-end;">
          <button class="secondary" data-action="edit" data-id="${u.id}" data-email="${u.email}" data-name="${u.name || ''}" data-role="${u.role}">Edit</button>
          <button class="danger" data-action="delete" data-id="${u.id}" data-email="${u.email}">Delete</button>
        </div>
      `;
      usersList.appendChild(row);
    });
  }

  usersList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'edit') {
      userIdEl.value = btn.dataset.id || '';
      userEmailEl.value = btn.dataset.email || '';
      userNameEl.value = btn.dataset.name || '';
      userRoleEl.value = btn.dataset.role || 'user';
      userPasswordEl.value = '';
      userEmailEl.focus();
      return;
    }

    if (action === 'delete') {
      const id = btn.dataset.id;
      const email = btn.dataset.email;
      if (!id) return;
      if (!confirm(`Delete user ${email}?`)) return;
      const res = await authFetch(`${USERS}/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        alert(`Delete failed: ${t || res.status}`);
      }
      loadUsers();
    }
  });

  userForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = userIdEl.value || '';
    const payload = {
      email: userEmailEl.value?.trim(),
      name: userNameEl.value?.trim(),
      role: userRoleEl.value,
    };
    const pw = userPasswordEl.value || '';
    if (pw) payload.password = pw;

    try {
      let res;
      if (id) {
        res = await authFetch(`${USERS}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await authFetch(USERS, {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify(payload)
        });
      }
      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        alert(`Save failed: ${t || res.status}`);
        return;
      }
      resetForm();
      loadUsers();
    } catch (err) {
      console.error('save user', err);
      alert('Network error.');
    }
  });

  resetUserFormBtn?.addEventListener('click', resetForm);
  backBtn?.addEventListener('click', () => (window.location.href = '/'));
  logoutBtn?.addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    window.location.replace('/login.html');
  });

  // boot
  (async () => {
    if (!isAuthed()) { window.location.replace('/login.html'); return; }
    await fetchMe();
    requireAdminOrBounce();
    await loadUsers();
  })();
});
