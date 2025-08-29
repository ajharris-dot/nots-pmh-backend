// public/admin.js
const AUTH = '/api/auth';
const USERS = '/api/users';
const PERMS = '/api/permissions';
const TOKEN_KEY = 'authToken';

const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
const isAuthed = () => !!getToken();
const authFetch = (url, opts = {}) => {
  const h = new Headers(opts.headers || {});
  const t = getToken();
  if (t) h.set('Authorization', `Bearer ${t}`);
  return fetch(url, { ...opts, headers: h });
};

let CURRENT_USER = null;
let PERM_STATE = { roles: [], abilities: [], role_abilities: [] };
let CURRENT_ROLE_SEL = null;

document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('backToHubBtn');
  const usersList = document.getElementById('usersList');
  const permissionsList = document.getElementById('permissionsList');

  const userForm = document.getElementById('userForm');
  const resetUserFormBtn = document.getElementById('resetUserForm');
  const userIdEl = document.getElementById('userId');
  const userEmailEl = document.getElementById('userEmail');
  const userNameEl = document.getElementById('userName');
  const userRoleEl = document.getElementById('userRole');
  const userPasswordEl = document.getElementById('userPassword');

  // Early gate: must have token
  if (!isAuthed()) {
    window.location.replace('/login.html');
    return;
  }

  backBtn?.addEventListener('click', () => (window.location.href = '/'));

  (async () => {
    await fetchMe();
    if (CURRENT_USER?.role !== 'admin') {
      alert('Admins only.');
      window.location.replace('/');
      return;
    }
    await loadUsers();
    await loadPermissions();
  })();

  async function fetchMe() {
    try {
      const r = await authFetch(`${AUTH}/me`);
      if (r.ok) {
        const d = await r.json();
        CURRENT_USER = d?.authenticated ? d.user : null;
      }
    } catch {
      CURRENT_USER = null;
    }
  }

  // ---------- Users ----------
  async function loadUsers() {
    try {
      const res = await authFetch(USERS, { method: 'GET' });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        usersList.innerHTML = `<div style="color:#b91c1c">Error loading users: ${t || res.status}</div>`;
        return;
      }
      const list = await res.json();
      renderUsers(list);
    } catch (e) {
      console.error('loadUsers error:', e);
      usersList.innerHTML = `<div style="color:#b91c1c">Error loading users (network/JS)</div>`;
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
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'edit-user') {
      userIdEl.value = btn.dataset.id || '';
      userEmailEl.value = btn.dataset.email || '';
      userNameEl.value = btn.dataset.name || '';
      userRoleEl.value = btn.dataset.role || 'user';
      userPasswordEl.value = '';
      userEmailEl.focus();
    } else if (action === 'delete-user') {
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

  function resetUserForm() {
    userForm?.reset();
    if (userIdEl) userIdEl.value = '';
  }
  resetUserFormBtn?.addEventListener('click', resetUserForm);

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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await authFetch(USERS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
      console.error('save user error:', err);
      alert('Save failed (network).');
    }
  });

  // ---------- Permissions ----------
  async function loadPermissions() {
    try {
      const res = await authFetch(PERMS, { method: 'GET' });
      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        permissionsList.innerHTML = `<div style="color:#b91c1c">Error loading permissions: ${t || res.status}</div>`;
        return;
      }
      const raw = await res.json();

      let roles = [];
      let abilities = [];
      let role_abilities = [];

      if (Array.isArray(raw)) {
        roles = raw.map(r => r.role);
        const set = new Set();
        raw.forEach(r => (r.abilities || []).forEach(a => set.add(a)));
        abilities = [...set];
        raw.forEach(r => (r.abilities || []).forEach(a => role_abilities.push({ role: r.role, ability: a })));
      } else {
        roles = raw.roles || [];
        abilities = raw.abilities || [];
        role_abilities = raw.role_abilities || [];
      }

      PERM_STATE = { roles, abilities, role_abilities };
      if (!CURRENT_ROLE_SEL && roles.length) CURRENT_ROLE_SEL = roles[0];
      renderPermissionsUI();
    } catch (e) {
      console.error('loadPermissions error:', e);
      permissionsList.innerHTML = `<div style="color:#b91c1c">Error loading permissions (network/JS)</div>`;
    }
  }

  function renderPermissionsUI() {
    const { roles, abilities, role_abilities } = PERM_STATE;

    if (!roles.length || !abilities.length) {
      permissionsList.innerHTML = `<div class="muted">No roles/abilities found.</div>`;
      return;
    }
    if (!CURRENT_ROLE_SEL) CURRENT_ROLE_SEL = roles[0];

    const enabledSet = new Set(
      role_abilities.filter(x => x.role === CURRENT_ROLE_SEL).map(x => x.ability)
    );

    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = '220px 1fr';
    wrap.style.gap = '14px';

    // Roles column
    const rolesCol = document.createElement('div');
    rolesCol.style.display = 'grid';
    rolesCol.style.gridTemplateColumns = '1fr';
    rolesCol.style.gap = '8px';

    roles.forEach(role => {
      const btn = document.createElement('button');
      btn.className = 'secondary';
      btn.textContent = cap(role);
      btn.dataset.role = role;
      btn.style.textAlign = 'left';
      btn.style.width = '100%';
      if (role === CURRENT_ROLE_SEL) {
        btn.style.background = '#555';
        btn.style.color = '#fff';
        btn.style.borderColor = '#444';
      }
      btn.addEventListener('click', () => {
        CURRENT_ROLE_SEL = role;
        renderPermissionsUI();
      });
      rolesCol.appendChild(btn);
    });

    // Abilities column
    const abilCol = document.createElement('div');
    abilCol.style.display = 'grid';
    abilCol.style.gridTemplateColumns = '1fr';
    abilCol.style.gap = '8px';

    const title = document.createElement('div');
    title.innerHTML = `<strong>${cap(CURRENT_ROLE_SEL)}</strong> abilities`;
    title.style.marginBottom = '4px';
    abilCol.appendChild(title);

    abilities.forEach(ability => {
      const row = document.createElement('label');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '24px 1fr';
      row.style.alignItems = 'center';
      row.style.gap = '10px';
      row.style.padding = '6px 8px';
      row.style.border = '1px solid var(--line)';
      row.style.borderRadius = '8px';
      row.style.background = '#fff';

      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = enabledSet.has(ability);
      box.dataset.role = CURRENT_ROLE_SEL;
      box.dataset.ability = ability;

      box.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        e.target.disabled = true;
        try {
          const method = enabled ? 'POST' : 'DELETE';
          const res = await authFetch(PERMS, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: CURRENT_ROLE_SEL, ability })
          });
          if (!res.ok) {
            const t = await res.text().catch(()=> '');
            alert(`Update failed: ${t || res.status}`);
            e.target.checked = !enabled; // revert
            return;
          }
          // Update local state
          if (enabled) {
            PERM_STATE.role_abilities.push({ role: CURRENT_ROLE_SEL, ability });
          } else {
            PERM_STATE.role_abilities = PERM_STATE.role_abilities.filter(
              ra => !(ra.role === CURRENT_ROLE_SEL && ra.ability === ability)
            );
          }
        } catch (err) {
          console.error('toggle ability error:', err);
          alert('Update failed (network).');
          e.target.checked = !enabled;
        } finally {
          e.target.disabled = false;
        }
      });

      const labelText = document.createElement('span');
      labelText.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
      labelText.textContent = ability;

      row.appendChild(box);
      row.appendChild(labelText);
      abilCol.appendChild(row);
    });

    wrap.appendChild(rolesCol);
    wrap.appendChild(abilCol);
    permissionsList.innerHTML = '';
    permissionsList.appendChild(wrap);
  }

  function cap(s){ return String(s || '').replace(/^\w/, c => c.toUpperCase()); }
});
