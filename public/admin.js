// public/admin.js
const TOKEN_KEY = 'authToken';
const AUTH  = '/api/auth';
const USERS = '/api/users';
const PERMS = '/api/permissions';

const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
const authFetch = (url, opts = {}) => {
  const h = new Headers(opts.headers || {});
  const t = getToken();
  if (t) h.set('Authorization', `Bearer ${t}`);
  return fetch(url, { ...opts, headers: h });
};

let CURRENT_USER = null;
let PERM_STATE = { roles: [], permissions: [], role_permissions: [] };
let CURRENT_ROLE = null;

document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('backToHubBtn');
  const employmentBtn = document.getElementById('employmentPageBtn');
  const adminHubBtn = document.getElementById('adminHubBtn'); // just visual, we're here already
  const logoutBtn = document.getElementById('logoutBtn');

  // Users section
  const userForm = document.getElementById('userForm');
  const resetUserFormBtn = document.getElementById('resetUserForm');
  const usersList = document.getElementById('usersList');
  const userIdEl = document.getElementById('userId');
  const userEmailEl = document.getElementById('userEmail');
  const userNameEl = document.getElementById('userName');
  const userRoleEl = document.getElementById('userRole');
  const userPasswordEl = document.getElementById('userPassword');

  // Roles & permissions editor
  const rolesList = document.getElementById('rolesList');
  const permRoleTitle = document.getElementById('permRoleTitle');
  const permPool = document.getElementById('permPool');

  // nav
  backBtn?.addEventListener('click', () => (window.location.href = '/'));
  employmentBtn?.addEventListener('click', () => (window.location.href = '/employment.html'));
  adminHubBtn?.addEventListener('click', (e) => e.preventDefault());
  logoutBtn?.addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    window.location.replace('/login.html');
  });

  // init
  (async () => {
    if (!getToken()) { window.location.replace('/login.html'); return; }
    await fetchMe();
    if (CURRENT_USER?.role !== 'admin') {
      alert('Admin only'); window.location.replace('/'); return;
    }
    await Promise.all([loadUsers(), loadPerms()]);
  })();

  /* -------- users -------- */
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
    } catch (err) {
      console.error('loadUsers error', err);
      usersList.innerHTML = `<div style="color:#b91c1c">Error loading users (network)</div>`;
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
          <button class="secondary" data-action="edit-user" data-id="${u.id}" data-email="${u.email}" data-name="${u.name || ''}" data-role="${u.role}">Edit</button>
          <button class="danger" data-action="delete-user" data-id="${u.id}" data-email="${u.email}">Delete</button>
        </div>
      `;
      usersList.appendChild(row);
    });
  }

  usersList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'edit-user') {
      userIdEl.value = btn.dataset.id || '';
      userEmailEl.value = btn.dataset.email || '';
      userNameEl.value = btn.dataset.name || '';
      userRoleEl.value = btn.dataset.role || 'user';
      userPasswordEl.value = '';
      userEmailEl.focus();
      return;
    }

    if (action === 'delete-user') {
      const id = btn.dataset.id, email = btn.dataset.email;
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
      name:  userNameEl.value?.trim(),
      role:  userRoleEl.value,
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
      resetUserForm();
      loadUsers();
    } catch (err) {
      console.error('save user error', err);
      alert('Save failed (network).');
    }
  });

  function resetUserForm() { userForm?.reset(); userIdEl.value = ''; }
  resetUserFormBtn?.addEventListener('click', resetUserForm);

  /* -------- roles & permissions (new UI) -------- */
  async function loadPerms() {
    try {
      const res = await authFetch(PERMS);
      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        rolesList.innerHTML = `<div style="color:#b91c1c">Error loading permissions: ${t || res.status}</div>`;
        return;
      }
      const data = await res.json();
      PERM_STATE = {
        roles: data.roles || [],
        permissions: data.permissions || [],
        role_permissions: data.role_permissions || []
      };
      renderRoles();
      // pick first role by default
      if (PERM_STATE.roles.length) selectRole(PERM_STATE.roles[0]);
    } catch (err) {
      console.error('loadPerms error', err);
      rolesList.innerHTML = `<div style="color:#b91c1c">Error loading permissions (network)</div>`;
    }
  }

  function renderRoles() {
    rolesList.innerHTML = '';
    if (!PERM_STATE.roles.length) {
      rolesList.innerHTML = `<div class="muted">No roles found.</div>`;
      return;
    }
    PERM_STATE.roles.forEach(role => {
      const btn = document.createElement('button');
      btn.className = 'secondary role-btn';
      btn.textContent = role;
      if (role === CURRENT_ROLE) btn.classList.add('active');
      btn.addEventListener('click', () => selectRole(role));
      rolesList.appendChild(btn);
    });
  }

  function selectRole(role) {
    CURRENT_ROLE = role;
    // refresh active style
    [...rolesList.querySelectorAll('.role-btn')].forEach(b => {
      b.classList.toggle('active', b.textContent === role);
    });
    permRoleTitle.textContent = `Editing: ${role}`;
    renderPermissionPool();
  }

  function renderPermissionPool() {
    const current = new Set(
      PERM_STATE.role_permissions
        .filter(rp => rp.role === CURRENT_ROLE)
        .map(rp => rp.permission)
    );

    permPool.innerHTML = '';
    if (!PERM_STATE.permissions.length) {
      permPool.innerHTML = `<div class="muted">No permissions defined.</div>`;
      return;
    }

    PERM_STATE.permissions.forEach(p => {
      const row = document.createElement('label');
      row.className = 'perm-row';

      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = current.has(p);
      box.addEventListener('change', () => togglePermission(p, box.checked, box));

      const span = document.createElement('span');
      span.className = 'perm-code';
      span.textContent = p;

      row.appendChild(box);
      row.appendChild(span);
      permPool.appendChild(row);
    });
  }

  async function togglePermission(permission, enable, el) {
    el.disabled = true;
    try {
      const method = enable ? 'POST' : 'DELETE';
      const res = await authFetch(PERMS, {
        method,
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ role: CURRENT_ROLE, permission })
      });
      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        alert(`Update failed: ${t || res.status}`);
        el.checked = !enable; // revert
        return;
      }
      // keep local mapping in sync
      if (enable) {
        PERM_STATE.role_permissions.push({ role: CURRENT_ROLE, permission });
      } else {
        PERM_STATE.role_permissions = PERM_STATE.role_permissions.filter(
          rp => !(rp.role === CURRENT_ROLE && rp.permission === permission)
        );
      }
    } catch (err) {
      console.error('togglePermission error', err);
      alert('Update failed (network).');
      el.checked = !enable; // revert
    } finally {
      el.disabled = false;
    }
  }

  /* -------- auth -------- */
  async function fetchMe() {
    try {
      const r = await authFetch(`${AUTH}/me`);
      CURRENT_USER = r.ok ? (await r.json()).user : null;
    } catch { CURRENT_USER = null; }
  }
});
