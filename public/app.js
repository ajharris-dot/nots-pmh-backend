// public/app.js
console.log('app.js boot');

// --- early auth gate ---
const TOKEN_KEY = 'authToken';
if (!localStorage.getItem(TOKEN_KEY)) {
  window.location.replace('/login.html');
  // stop executing the rest of this file on the protected page
  throw new Error('redirecting-to-login');
}

// (keep these after the gate)
fetch('/healthz')
  .then(r => console.log('healthz', r.status))
  .catch(console.error);

const API = '/api/jobs';
const AUTH = '/api/auth';
const USERS = '/api/users';
const PLACEHOLDER = './placeholder-v2.png?v=20250814';

let ALL_JOBS = [];
let CURRENT_FILTER = 'all';
let CURRENT_USER = null;

// ---- View toggle state ----
const VIEW_KEY = 'pmhViewMode';
let VIEW_MODE = (localStorage.getItem(VIEW_KEY) || 'card');

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
  const permissionsList = document.getElementById('permissionsList');

  // Users sub-section
  const userForm = document.getElementById('userForm');
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
  const assignSelect = document.getElementById('assignCandidate');
  let ASSIGN_JOB_ID = null;

  function openAssignModal(jobId){
    ASSIGN_JOB_ID = jobId;
    assignForm?.reset();
    assignModal?.classList.remove('hidden');
    loadCandidateOptions().then(() => assignSelect?.focus());
  }
  function closeAssignModal(){
    ASSIGN_JOB_ID = null;
    assignModal?.classList.add('hidden');
  }

  /** Populate the Assign dropdown from /api/candidates (admin/employment only) */
  async function loadCandidateOptions(){
    if (!assignSelect) return;
    assignSelect.innerHTML = `<option value="" disabled selected>Loading…</option>`;
    try {
      const res = await authFetch('/api/candidates');
      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        assignSelect.innerHTML = `<option value="" disabled selected>Failed to load candidates</option>`;
        console.error('loadCandidateOptions failed:', res.status, t);
        return;
      }
      const list = await res.json();
      const filtered = Array.isArray(list) ? [...list] : [];
      filtered.sort((a,b) => String(a.full_name||'').localeCompare(String(b.full_name||'')));

      assignSelect.innerHTML = filtered.length
        ? `<option value="" disabled selected>Select a candidate…</option>`
        : `<option value="" disabled selected>No candidates found</option>`;

      for (const c of filtered) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.full_name || '(Unnamed)';
        opt.dataset.name = c.full_name || '';
        assignSelect.appendChild(opt);
      }
    } catch (err) {
      console.error('loadCandidateOptions threw:', err);
      assignSelect.innerHTML = `<option value="" disabled selected>Error loading candidates</option>`;
    }
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

  // Pull user ability keys so UI reflects Admin Hub changes
  async function fetchMyPermissions() {
    MY_PERMS = new Set();
    if (!isAuthed()) return;
    try {
      const r = await authFetch(`/api/permissions/mine`);
      if (r.ok) {
        const j = await r.json();
        const list = Array.isArray(j?.permissions) ? j.permissions : [];
        list.forEach(p => MY_PERMS.add(String(p)));
      }
    } catch { /* ignore; server still enforces */ }
  }

  function can(abilityKey) {
    const role = CURRENT_USER?.role;
    if (!role) return false;
    if (role === 'admin') return true;

    const MAP = {
      operations: new Set(['job_create','job_edit','job_delete']),
      employment: new Set(['job_assign','job_unassign']) // upload handled by role check below
    };
    return MAP[role]?.has(abilityKey) || false;
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

    // Add Position button only for roles/abilities that can create
    if (authed && can('job_create')) {
      addJobBtn?.removeAttribute('disabled');
      addJobBtn?.setAttribute('style', '');
    } else {
      addJobBtn?.setAttribute('disabled', 'disabled');
      addJobBtn?.setAttribute('style', 'display:none');
    }

    // Admin-only Admin Hub button (still admin-gated)
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

    render(); // re-render UI actions per role/abilities
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
      const res = await authFetch(`${API}?${params.toString()}`);
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

  /* ------- shared actions builder (ability-aware) ------- */
  function buildActionsHtml(job) {
    const authed = !!CURRENT_USER;
    if (!authed) {
      return `<button class="secondary login-gate-btn" data-action="open-login">Log in to manage</button>`;
    }

    const canAssign = can('job_assign');
    const canEdit   = can('job_edit');
    const canDelete = can('job_delete');
    // Upload photo still gated by role server-side; keep same UI rule:
    const canUpload = (CURRENT_USER?.role === 'admin' || CURRENT_USER?.role === 'employment') && isFilled(job);

    const inputId = `file_${job.id}`;
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
    if (!can('job_create')) return;
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
        await fetchMyPermissions(); // <- pick up abilities for UI
        closeLoginModal();
        updateUIAuth();
        loadJobs();
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
    MY_PERMS = new Set();
    window.location.replace('/login.html');
  });

  // Card/List button clicks with guards
  const jobGridClick = async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    if (action === 'open-login') { openLoginModal(); return; }

    if (action === 'trigger-upload') {
      // upload still role-guarded on server; keep legacy client check
      const role = CURRENT_USER?.role;
      if (!isAuthed() || !(role === 'admin' || role === 'employment')) { openLoginModal(); return; }
      const input = document.getElementById(e.target.dataset.input);
      if (input) input.click();
      return;
    }

    const id = e.target.dataset.id;
    if (!id && action !== 'edit') return;

    if (action === 'edit') {
      if (!isAuthed() || !can('job_edit')) return;
      const job = ALL_JOBS.find(j => j.id == id);
      openModal(job);

    } else if (action === 'delete') {
      if (!isAuthed() || !can('job_delete')) return;
      await authFetch(`${API}/${id}`, { method: 'DELETE' });
      loadJobs();

    } else if (action === 'assign') {
      if (!isAuthed() || !can('job_assign')) { openLoginModal(); return; }
      openAssignModal(id);

    } else if (action === 'unassign') {
      if (!isAuthed() || !can('job_unassign')) return;
      await authFetch(`${API}/${id}/unassign`, { method: 'POST' });
      loadJobs();
    }
  };
  jobGrid?.addEventListener('click', jobGridClick);

  // Assign modal
  assignForm?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if (!isAuthed() || !can('job_assign')) { openLoginModal(); return; }
    if (!ASSIGN_JOB_ID) return;

    const opt = assignSelect?.selectedOptions?.[0];
    if (!opt || !opt.value) return;

    const employeeName = opt.dataset.name || opt.textContent || '';

    await authFetch(`/api/jobs/${ASSIGN_JOB_ID}/assign`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ employee: employeeName })
    });

    closeAssignModal();
    loadJobs();
  });
  cancelAssign?.addEventListener('click', closeAssignModal);

  // Create / Update job with guard
  jobForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('jobId').value;
    const canCreate = can('job_create');
    const canEdit   = can('job_edit');
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
     ADMIN HUB (modal entry still present; real page is /admin.html)
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
  adminHubBtn?.addEventListener('click', () => {
    if (!CURRENT_USER || CURRENT_USER.role !== 'admin') { alert('Admins only.'); return; }
    window.location.href = '/admin.html';
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
      userForm?.reset(); if (userIdEl) userIdEl.value = '';
      loadUsers();
    } catch (err) {
      console.error('save user error:', err);
      alert('Save failed (network).');
    }
  });

  // Employment Button Listener
  employmentPageBtn?.addEventListener('click', () => {
    window.location.href = '/employment.html';
  });

  // ---- Permissions (Roles -> Permissions) ----
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

      // expected: { roles: string[], permissions: string[], role_permissions: [{role, permission}] }
      const roles = raw.roles || [];
      const permissions = raw.permissions || [];
      const role_permissions = raw.role_permissions || [];

      PERM_STATE = { roles, permissions, role_permissions };
      if (!CURRENT_ROLE_SEL && roles.length) CURRENT_ROLE_SEL = roles[0];
      renderPermissionsUI();
    } catch (e) {
      console.error('loadPermissions error:', e);
      permissionsList.innerHTML = `<div style="color:#b91c1c">Error loading permissions (network/JS)</div>`;
    }
  }

  function renderPermissionsUI() {
    const { roles, permissions, role_permissions } = PERM_STATE;

    if (!roles.length) {
      permissionsList.innerHTML = `<div style="color:#6b7280">No roles found.</div>`;
      return;
    }
    if (!permissions.length) {
      permissionsList.innerHTML = `<div style="color:#6b7280">No permissions defined.</div>`;
      return;
    }
    if (!CURRENT_ROLE_SEL) CURRENT_ROLE_SEL = roles[0];

    // fast lookup: which permissions are enabled for current role
    const enabledSet = new Set(
      role_permissions
        .filter(x => x.role === CURRENT_ROLE_SEL)
        .map(x => x.permission)
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
      btn.textContent = role.charAt(0).toUpperCase() + role.slice(1);
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

    // Permissions column (as checkboxes)
    const permCol = document.createElement('div');
    permCol.style.display = 'grid';
    permCol.style.gridTemplateColumns = '1fr';
    permCol.style.gap = '8px';

    const title = document.createElement('div');
    title.innerHTML = `<strong>${CURRENT_ROLE_SEL}</strong> permissions`;
    title.style.marginBottom = '4px';
    permCol.appendChild(title);

    permissions.forEach(permission => {
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
      box.checked = enabledSet.has(permission);
      box.dataset.role = CURRENT_ROLE_SEL;
      box.dataset.permission = permission;

      box.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        e.target.disabled = true;
        try {
          const method = enabled ? 'POST' : 'DELETE';
          const res = await authFetch(PERMS, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: CURRENT_ROLE_SEL, permission })
          });
          if (!res.ok) {
            const t = await res.text().catch(()=> '');
            alert(`Update failed: ${t || res.status}`);
            e.target.checked = !enabled;
            return;
          }
          // update local state
          if (enabled) {
            PERM_STATE.role_permissions.push({ role: CURRENT_ROLE_SEL, permission });
          } else {
            PERM_STATE.role_permissions = PERM_STATE.role_permissions.filter(
              rp => !(rp.role === CURRENT_ROLE_SEL && rp.permission === permission)
            );
          }
        } catch (err) {
          console.error('toggle permission error:', err);
          alert('Update failed (network).');
          e.target.checked = !enabled;
        } finally {
          e.target.disabled = false;
        }
      });

      const labelText = document.createElement('span'); // <-- fixed: added const
      labelText.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
      labelText.textContent = permission;

      row.appendChild(box);
      row.appendChild(labelText);
      permCol.appendChild(row);
    });

    wrap.appendChild(rolesCol);
    wrap.appendChild(permCol);
    permissionsList.innerHTML = '';
    permissionsList.appendChild(wrap);
  }

  // Upload change -> patch job (guarded)
  const jobGridChange = async (e) => {
    if (!e.target.classList.contains('photo-input')) return;
    // upload still role-guarded on server; keep legacy client check
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
    await fetchMyPermissions(); // pull ability keys so UI reflects Admin Hub changes
    updateUIAuth();
    loadJobs();
  })();

  setInterval(loadJobs, 60000);
});
