console.log('app.js boot');
fetch('/healthz').then(r=>console.log('healthz', r.status)).catch(console.error);
fetch('/api/jobs').then(r=>r.text()).then(t=>console.log('/api/jobs sample:', t.slice(0,120)+'…')).catch(console.error);

const API = '/api/jobs';
const AUTH = '/api/auth';
const USERS = '/api/users';
const PERMS = '/api/permissions';
const PLACEHOLDER = './placeholder-v2.png?v=20250814';
const TOKEN_KEY = 'authToken';

let ALL_JOBS = [];
let CURRENT_FILTER = 'all';
let CURRENT_USER = null; // { id, email, name, role } or null

// ---- View toggle state ----
const VIEW_KEY = 'pmhViewMode';
let VIEW_MODE = (localStorage.getItem(VIEW_KEY) || 'card'); // 'card' | 'list'

// ---- Admin Hub permission state ----
let PERM_STATE = { roles: [], abilities: [], role_abilities: [] };
let CURRENT_ROLE_SEL = null;

document.addEventListener('DOMContentLoaded', () => {
  const jobGrid = document.getElementById('jobGrid');
  const addJobBtn = document.getElementById('addJobBtn');
  const search = document.getElementById('search');

  const jobModal = document.getElementById('jobModal');
  const modalTitle = document.getElementById('modalTitle');
  const jobForm = document.getElementById('jobForm');
  const cancelModal = document.getElementById('cancelModal');

  // Login UI
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginModal = document.getElementById('loginModal');
  const loginForm = document.getElementById('loginForm');
  const cancelLogin = document.getElementById('cancelLogin');

  // ---- Admin Hub (users + permissions) ----
  const adminHubBtn = document.getElementById('adminHubBtn');
  const adminHubModal = document.getElementById('adminHubModal');
  const closeAdminHubBtn = document.getElementById('closeAdminHub');
  const permissionsList = document.getElementById('permissionsList'); // <-- keep only this one

  // Users sub-section
  const userForm = document.getElementById('userForm');
  const resetUserFormBtn = document.getElementById('resetUserForm');
  const usersList = document.getElementById('usersList');
  const userIdEl = document.getElementById('userId');
  const userEmailEl = document.getElementById('userEmail');
  const userNameEl = document.getElementById('userName');
  const userRoleEl = document.getElementById('userRole');
  const userPasswordEl = document.getElementById('userPassword');

  // Employment Page Button (optional on some pages)
  const employmentPageBtn = document.getElementById('employmentPageBtn');

  // View toggle buttons
  const cardViewBtn = document.getElementById('cardViewBtn');
  const listViewBtn = document.getElementById('listViewBtn');

  /* ====== Assign modal ====== */
  const assignModal  = document.getElementById('assignModal');
  const assignForm   = document.getElementById('assignForm');
  const cancelAssign = document.getElementById('cancelAssign');
  const assignInput  = document.getElementById('assignEmployeeName');
  let ASSIGN_JOB_ID = null;

  function openAssignModal(jobId){
    ASSIGN_JOB_ID = jobId;
    assignForm?.reset();
    assignModal?.classList.remove('hidden');
    setTimeout(() => assignInput?.focus(), 50);
  }
  function closeAssignModal(){
    ASSIGN_JOB_ID = null;
    assignModal?.classList.add('hidden');
  }

  /* ------- Auth helpers ------- */
  const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
  const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
  const clearToken = () => localStorage.removeItem(TOKEN_KEY);
  const isAuthed = () => !!getToken();

  async function authFetch(url, options = {}) {
    const token = getToken();
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  }

  async function fetchMe() {
    if (!isAuthed()) { CURRENT_USER = null; return; }
    try {
      const res = await authFetch(`${AUTH}/me`);
      if (!res.ok) throw new Error('me failed');
      const data = await res.json();
      CURRENT_USER = data?.authenticated ? data.user : null;
    } catch {
      CURRENT_USER = null;
    }
  }

  /* ------- Role rules (UI + client guard) ------- */
  function can(action) {
    const role = CURRENT_USER?.role;
    if (!role) return false;
    if (role === 'admin') return true;

    // NOTE: these remain hard-coded on client; Admin Hub changes are stored server-side.
    const EMPLOYMENT = ['assign', 'unassign', 'upload_photo'];
    const OPERATIONS = ['create_job', 'edit_job', 'delete_job'];
    if (role === 'employment') return EMPLOYMENT.includes(action);
    if (role === 'operations') return OPERATIONS.includes(action);
    // managers/users = view-only
    return false;
  }

  function openLoginModal(){
    loginForm?.reset();
    loginModal?.classList.remove('hidden');
    setTimeout(() => document.getElementById('loginEmail')?.focus(), 50);
  }
  function closeLoginModal(){
    loginModal?.classList.add('hidden');
  }

  function updateUIAuth() {
    const authed = isAuthed();

    // auth buttons
    if (authed) {
      loginBtn?.setAttribute('style', 'display:none');
      logoutBtn?.setAttribute('style', '');
    } else {
      loginBtn?.setAttribute('style', '');
      logoutBtn?.setAttribute('style', 'display:none');
    }

    // Add Position button only for roles that can create
    if (authed && can('create_job')) {
      addJobBtn?.removeAttribute('disabled');
      addJobBtn?.setAttribute('style', '');
    } else {
      addJobBtn?.setAttribute('disabled', 'disabled');
      addJobBtn?.setAttribute('style', 'display:none');
    }

    // Admin-only Admin Hub button
    if (authed && CURRENT_USER?.role === 'admin') {
      adminHubBtn?.setAttribute('style', '');
    } else {
      adminHubBtn?.setAttribute('style', 'display:none');
    }

    // Employment page button (admin + employment)
    if (authed && (CURRENT_USER?.role === 'admin' || CURRENT_USER?.role === 'employment')) {
      employmentPageBtn?.setAttribute('style', '');
    } else {
      employmentPageBtn?.setAttribute('style', 'display:none');
    }

    render(); // re-render UI actions per role
  }

  /* ------- View toggle helpers ------- */
  function syncViewToggle() {
    if (VIEW_MODE === 'list') {
      cardViewBtn?.classList.remove('active');
      listViewBtn?.classList.add('active');
    } else {
      listViewBtn?.classList.remove('active');
      cardViewBtn?.classList.add('active');
    }
  }
  cardViewBtn?.addEventListener('click', () => {
    VIEW_MODE = 'card';
    localStorage.setItem(VIEW_KEY, VIEW_MODE);
    syncViewToggle();
    render();
  });
  listViewBtn?.addEventListener('click', () => {
    VIEW_MODE = 'list';
    localStorage.setItem(VIEW_KEY, VIEW_MODE);
    syncViewToggle();
    render();
  });

  /* ------- helpers ------- */
  const fmtDate = (d) => {
    if (!d) return '';
    const s = String(d);
    const only = s.includes('T') ? s.split('T')[0] : s;
    const [y, m, day] = only.split('-');
    return (y && m && day) ? `${y}-${m}-${day}` : only;
  };
  const isFilled = (j) => !!j.employee || (j.status && j.status.toLowerCase() === 'filled');

  function findTab(name) {
    const target = String(name || '').toLowerCase();
    return [...document.querySelectorAll('.filters .tab')]
      .find(t => (t.dataset.filter || '').toLowerCase() === target);
  }

  function updateTabCounts(baseList = ALL_JOBS) {
    const allTab    = findTab('all');
    const openTab   = findTab('open');
    const filledTab = findTab('filled');
    if (!allTab || !openTab || !filledTab) return;

    const allCount    = baseList.length;
    const openCount   = baseList.filter(j => (j.status || '').toLowerCase() === 'open').length;
    const filledCount = baseList.filter(isFilled).length;

    allTab.textContent    = `All (${allCount})`;
    openTab.textContent   = `Open (${openCount})`;
    filledTab.textContent = `Filled (${filledCount})`;
  }

  /* ------- data ------- */
  async function loadJobs() {
    try {
      const params = new URLSearchParams({ limit: '20000', offset: '0' });
      if (String(CURRENT_FILTER || 'all').toLowerCase() !== 'all') {
        params.set('status', String(CURRENT_FILTER).toLowerCase());
      }
      const res = await fetch(`${API}?${params.toString()}`);
      if (!res.ok) {
        const msg = await res.text().catch(()=> '');
        console.error('Failed to fetch jobs:', res.status, msg);
        if (jobGrid) {
          jobGrid.innerHTML = `<div style="color:#b91c1c">
            Error loading jobs (HTTP ${res.status}). ${msg || 'See console for details.'}
          </div>`;
        }
        ALL_JOBS = [];
        updateTabCounts();
        return;
      }
      const data = await res.json();
      ALL_JOBS = Array.isArray(data) ? data : (data.jobs || data.rows || []);
      updateTabCounts();
      render();
    } catch (err) {
      console.error('Fetch /api/jobs threw:', err);
      if (jobGrid) {
        jobGrid.innerHTML = `<div style="color:#b91c1c">
          Error loading jobs (network/JS). See console for details.
        </div>`;
      }
      ALL_JOBS = [];
      updateTabCounts();
    }
  }

  /* ------- shared actions builder (role-aware) ------- */
  function buildActionsHtml(job) {
    const role = CURRENT_USER?.role || null;
    const authed = !!role;

    const canAssign = role === 'admin' || role === 'employment';
    const canEdit   = role === 'admin' || role === 'operations';
    const canDelete = role === 'admin' || role === 'operations';
    const canUpload = (role === 'admin' || role === 'employment') && isFilled(job);

    const inputId = `file_${job.id}`;

    if (!authed) {
      return `<button class="secondary login-gate-btn" data-action="open-login">Log in to manage</button>`;
    }

    const parts = [];
    if (isFilled(job)) {
      if (canUpload) parts.push(
        `<button class="upload-btn" data-action="trigger-upload" data-input="${inputId}">Upload Photo</button>`
      );
      if (canAssign) parts.push(
        `<button class="secondary" data-action="unassign" data-id="${job.id}">Unassign</button>`
      );
    } else {
      if (canAssign) parts.push(
        `<button class="secondary" data-action="assign" data-id="${job.id}">Assign</button>`
      );
    }
    if (canEdit)   parts.push(`<button class="secondary" data-action="edit" data-id="${job.id}">Edit</button>`);
    if (canDelete) parts.push(`<button class="danger" data-action="delete" data-id="${job.id}">Delete</button>`);

    return parts.join('\n');
  }

  /* ------- UI render (Card/List) ------- */
  function render() {
    try {
      const q = (search?.value || '').trim().toLowerCase();
      if (!jobGrid) return;
      jobGrid.innerHTML = '';

      const baseSearch = ALL_JOBS.filter(j => {
        const text = `${j.job_number || ''} ${j.title || ''} ${j.department || ''}`.toLowerCase();
        return !q || text.includes(q);
      });

      const current = String(CURRENT_FILTER || 'all').toLowerCase();
      const filtered = baseSearch.filter(j => {
        const statusOk = current === 'all' || String(j.status || '').toLowerCase() === current;
        return statusOk;
      });

      updateTabCounts(baseSearch);

      if (!filtered.length) {
        jobGrid.innerHTML = `<div style="color:#6b7280">No positions</div>`;
        return;
      }

      // Switch grid class for view
      jobGrid.classList.toggle('card-grid', VIEW_MODE === 'card');
      jobGrid.classList.toggle('list-grid', VIEW_MODE === 'list');

      filtered.forEach(job => {
        const hasEmployee = !!(job.employee && String(job.employee).trim().length);
        const photoUrl = hasEmployee ? (job.employee_photo_url || PLACEHOLDER) : PLACEHOLDER;
        const statusBadge = isFilled(job)
          ? `<span class="badge badge-filled">Filled</span>`
          : `<span class="badge badge-open">Open</span>`;
        const filledDateValue = job.filled_date
          ? (/^\d{4}-\d{2}-\d{2}$/.test(job.filled_date)
              ? job.filled_date
              : String(job.filled_date).split('T')[0])
          : '';
        const inputId = `file_${job.id}`;
        const actionsHtml = buildActionsHtml(job);

        if (VIEW_MODE === 'list') {
          // ---------- LIST ROW ----------
          const row = document.createElement('div');
          row.className = 'job-row';
          row.innerHTML = `
            <div class="thumb">
              <img src="${photoUrl}" alt="Employee Photo" onerror="this.src='${PLACEHOLDER}'">
              <input type="file" id="${inputId}" class="photo-input" data-id="${job.id}" accept="image/*" style="display:none" />
            </div>

            <div class="info">
              <div class="title-line">
                <h3>${job.job_number || 'No Number'}</h3>
                ${statusBadge}
              </div>
              <div class="meta">
                <div><strong>Title:</strong> ${job.title || ''}</div>
                <div><strong>Department:</strong> ${job.department || ''}</div>
                <div><strong>Filled:</strong> ${filledDateValue || '—'}</div>
                <div><strong>Employee:</strong> ${job.employee || 'Unassigned'}</div>
              </div>
            </div>

            <div class="actions">
              ${actionsHtml}
            </div>
          `;
          jobGrid.appendChild(row);
        } else {
          // ---------- CARD ----------
          const card = document.createElement('div');
          card.className = 'job-card';
          card.innerHTML = `
            <div class="photo-container">
              <img class="employee-photo" src="${photoUrl}" alt="Employee Photo" onerror="this.src='${PLACEHOLDER}'" />
              <input type="file" id="${inputId}" class="photo-input" data-id="${job.id}" accept="image/*" style="display:none" />
            </div>

            <div class="card-body">
              <div class="card-title">
                <h3>${job.job_number || 'No Number'}</h3>
                ${statusBadge}
              </div>

              <div class="card-meta">
                <div class="meta-row"><strong>Title:</strong> ${job.title || ''}</div>
                <div class="meta-row"><strong>Department:</strong> ${job.department || ''}</div>
                <div class="meta-row"><strong>Filled Date:</strong> ${filledDateValue || '—'}</div>
                <div class="meta-row"><strong>Employee:</strong> ${job.employee || 'Unassigned'}</div>
              </div>
            </div>

            <div class="card-actions">
              ${actionsHtml}
            </div>
          `;
          jobGrid.appendChild(card);
        }
      });

    } catch (err) {
      console.error('Render error:', err);
      if (jobGrid) jobGrid.innerHTML = `<div style="color:#b91c1c">Error loading jobs. Check console.</div>`;
    }
  }

  /* ------- modal helpers ------- */
  function openModal(job = null) {
    jobModal.classList.remove('hidden');
    if (job) {
      modalTitle.textContent = 'Edit Position';
      document.getElementById('jobId').value = job.id;
      document.getElementById('jobNumber').value = job.job_number || '';
      document.getElementById('jobTitle').value = job.title || '';
      document.getElementById('department').value = job.department || '';
      document.getElementById('dueDate').value = fmtDate(job.filled_date);
      document.getElementById('employee').value = job.employee || '';
    } else {
      modalTitle.textContent = 'Add Position';
      jobForm.reset();
      document.getElementById('jobId').value = '';
      setTimeout(() => document.getElementById('jobNumber')?.focus(), 50);
    }
  }
  function closeModal() { jobModal.classList.add('hidden'); }

  /* ------- events ------- */
  document.querySelectorAll('.filters .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filters .tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      CURRENT_FILTER = String(btn.dataset.filter || 'all').toLowerCase();
      loadJobs();
    });
  });

  addJobBtn?.addEventListener('click', () => {
    if (!isAuthed()) { openLoginModal(); return; }
    if (!can('create_job')) return; // guard
    openModal();
  });
  cancelModal?.addEventListener('click', closeModal);
  search?.addEventListener('input', render);

  /* ------ Login / Logout ------ */
  loginBtn?.addEventListener('click', openLoginModal);
  cancelLogin?.addEventListener('click', closeLoginModal);

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail')?.value?.trim();
    const password = document.getElementById('loginPassword')?.value || '';
    if (!email || !password) return;

    try {
      const res = await fetch(`${AUTH}/login`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const msg = await res.text().catch(()=> '');
        alert(`Login failed: ${msg || res.status}`);
        return;
      }
      const data = await res.json();
      if (data?.token) {
        setToken(data.token);
        await fetchMe();
        closeLoginModal();
        updateUIAuth();
      } else {
        alert('Login failed: no token returned');
      }
    } catch (err) {
      console.error('login error:', err);
      alert('Login failed (network).');
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    clearToken();
    CURRENT_USER = null;
    updateUIAuth();
  });

  // Card/List button clicks with guards
  const jobGridClick = async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    if (action === 'open-login') { openLoginModal(); return; }

    if (action === 'trigger-upload') {
      const role = CURRENT_USER?.role;
      if (!isAuthed() || !(role === 'admin' || role === 'employment')) { openLoginModal(); return; }
      const input = document.getElementById(e.target.dataset.input);
      if (input) input.click();
      return;
    }

    const id = e.target.dataset.id;
    if (!id && action !== 'edit') return;

    if (action === 'edit') {
      if (!isAuthed() || !(CURRENT_USER?.role === 'admin' || CURRENT_USER?.role === 'operations')) return;
      const job = ALL_JOBS.find(j => j.id == id);
      openModal(job);

    } else if (action === 'delete') {
      if (!isAuthed() || !(CURRENT_USER?.role === 'admin' || CURRENT_USER?.role === 'operations')) return;
      await authFetch(`${API}/${id}`, { method: 'DELETE' });
      loadJobs();

    } else if (action === 'assign') {
      if (!isAuthed() || !(CURRENT_USER?.role === 'admin' || CURRENT_USER?.role === 'employment')) { openLoginModal(); return; }
      openAssignModal(id);

    } else if (action === 'unassign') {
      if (!isAuthed() || !(CURRENT_USER?.role === 'admin' || CURRENT_USER?.role === 'employment')) return;
      await authFetch(`${API}/${id}/unassign`, { method: 'POST' });
      loadJobs();
    }
  };
  jobGrid?.addEventListener('click', jobGridClick);

  // Assign modal
  assignForm?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if (!isAuthed() || !(CURRENT_USER?.role === 'admin' || CURRENT_USER?.role === 'employment')) { openLoginModal(); return; }
    const name = assignInput?.value?.trim();
    if (!name || !ASSIGN_JOB_ID) return;

    await authFetch(`${API}/${ASSIGN_JOB_ID}/assign`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ employee: name })
    });

    closeAssignModal();
    loadJobs();
  });
  cancelAssign?.addEventListener('click', closeAssignModal);

  // Create / Update job with guard
  jobForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('jobId').value;
    const role = CURRENT_USER?.role;
    const canCreate = role === 'admin' || role === 'operations';
    const canEdit   = role === 'admin' || role === 'operations';
    if (!isAuthed() || (!id && !canCreate) || (id && !canEdit)) { openLoginModal(); return; }

    const rawDate = document.getElementById('dueDate').value;
    const payload = {
      job_number: document.getElementById('jobNumber').value,
      title: document.getElementById('jobTitle').value,
      department: document.getElementById('department').value,
      filled_date: rawDate ? rawDate : null,
      due_date: null
    };

    if (id) {
      await authFetch(`${API}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      await authFetch(`${API}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    closeModal();
    loadJobs();
  });

  /* =========================
     ADMIN HUB
     ========================= */
  function openAdminHub() {
    adminHubModal?.classList.remove('hidden');
    resetUserForm();
    loadUsers();
    loadPermissions();
  }
  function closeAdminHub() { adminHubModal?.classList.add('hidden'); }
  function resetUserForm() { userForm?.reset(); if (userIdEl) userIdEl.value = ''; }

  // Close admin hub: button, backdrop, Esc
  closeAdminHubBtn?.addEventListener('click', closeAdminHub);
  adminHubModal?.addEventListener('click', (e) => {
    if (e.target === adminHubModal) closeAdminHub();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !adminHubModal?.classList.contains('hidden')) {
      closeAdminHub();
    }
  });

// Open Admin Hub (guarded)
adminHubBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  if (!isAuthed()) { openLoginModal(); return; }
  if (CURRENT_USER?.role !== 'admin') { alert('Admin only.'); return; }
  openAdminHub();
});

  // ---- Users ----
  async function loadUsers() {
    if (!isAuthed() || CURRENT_USER?.role !== 'admin') return;
    try {
      const res = await authFetch(USERS, { method: 'GET' });
      if (!res.ok) {
        const t = await res.text().catch(()=> '');
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
      usersList.innerHTML = `<div style="color:#6b7280">No users yet.</div>`;
      return;
    }
    usersList.innerHTML = '';
    list.forEach(u => {
      const row = document.createElement('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '2fr 1.5fr 1fr auto';
      row.style.gap = '8px';
      row.style.alignItems = 'center';
      row.style.padding = '8px';
      row.style.borderBottom = '1px solid var(--line)';

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

  userForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (CURRENT_USER?.role !== 'admin') return;

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

  // Employment Button Listener (show only on pages that include the button)
  employmentPageBtn?.addEventListener('click', () => {
    window.location.href = '/employment.html';
  });

  // ---- Permissions (Roles -> Abilities) ----
  async function loadPermissions() {
    if (!isAuthed() || CURRENT_USER?.role !== 'admin') return;
    try {
      const res = await authFetch(PERMS, { method: 'GET' });
      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        permissionsList.innerHTML = `<div style="color:#b91c1c">Error loading permissions: ${t || res.status}</div>`;
        return;
      }
      const raw = await res.json();

      // Normalize both possible API shapes
      let roles = [];
      let abilities = [];
      let role_abilities = [];

      if (Array.isArray(raw)) {
        // Old shape: [{ role, abilities: [...] }, ...]
        roles = raw.map(r => r.role);
        const set = new Set();
        raw.forEach(r => (r.abilities || []).forEach(a => set.add(a)));
        abilities = [...set];
        raw.forEach(r => (r.abilities || []).forEach(a => role_abilities.push({ role: r.role, ability: a })));
      } else {
        // New shape
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
      permissionsList.innerHTML = `<div style="color:#6b7280">No roles/abilities found.</div>`;
      return;
    }
    if (!CURRENT_ROLE_SEL) CURRENT_ROLE_SEL = roles[0];

    // Fast lookup for current role
    const enabledSet = new Set(
      role_abilities.filter(x => x.role === CURRENT_ROLE_SEL).map(x => x.ability)
    );

    // Layout: two columns (roles on the left, abilities on the right)
    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = '220px 1fr';
    wrap.style.gap = '14px';

    // --- Roles column ---
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
        renderPermissionsUI(); // re-render to show abilities for the selected role
      });
      rolesCol.appendChild(btn);
    });

    // --- Abilities column ---
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
          // POST to add, DELETE to remove (matches your routes)
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
          e.target.checked = !enabled; // revert
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

  // Upload change -> patch job (guarded)
  const jobGridChange = async (e) => {
    if (!e.target.classList.contains('photo-input')) return;
    const role = CURRENT_USER?.role;
    const canUpload = role === 'admin' || role === 'employment';
    if (!isAuthed() || !canUpload) { openLoginModal(); return; }

    const id = e.target.dataset.id;
    const file = e.target.files[0];
    if (!file) return;

    const fd = new FormData();
    fd.append('photo', file);
    const up = await authFetch('/api/upload', { method: 'POST', body: fd });
    if (!up.ok) { alert('Upload failed'); return; }
    const { url } = await up.json();

    await authFetch(`${API}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_photo_url: url })
    });
    loadJobs();
  };
  jobGrid?.addEventListener('change', jobGridChange);

  /* init */
  (async () => {
    syncViewToggle();
    await fetchMe();
    updateUIAuth();
    loadJobs();
  })();

  /* Optional auto-refresh every 60 seconds */
  setInterval(loadJobs, 60000);
});
