// public/app.js
console.log('app.js boot');

// --- early auth gate ---
const TOKEN_KEY = 'authToken';
if (!localStorage.getItem(TOKEN_KEY)) {
  window.location.replace('/login.html');
  throw new Error('redirecting-to-login');
}

fetch('/healthz').then(r => console.log('healthz', r.status)).catch(console.error);

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

  // Admin Hub (admin-only)
  const adminHubBtn = document.getElementById('adminHubBtn');

  // Employment Page Button
  const employmentPageBtn = document.getElementById('employmentPageBtn');

  // View toggles
  const cardViewBtn = document.getElementById('cardViewBtn');
  const listViewBtn = document.getElementById('listViewBtn');

  /* ====== Assign modal ====== */
  const assignModal  = document.getElementById('assignModal');
  const assignForm   = document.getElementById('assignForm');
  const cancelAssign = document.getElementById('cancelAssign');
  const assignSelect = document.getElementById('assignCandidate');
  let ASSIGN_JOB_ID = null;

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

  function roleLower() {
    return (CURRENT_USER?.role || '').toString().trim().toLowerCase();
  }

  async function fetchMe() {
    if (!isAuthed()) { CURRENT_USER = null; return; }
    try {
      const res = await authFetch(`${AUTH}/me`);
      if (!res.ok) throw new Error('me failed');
      const data = await res.json();
      CURRENT_USER = data?.authenticated ? data.user : null;
      console.log('[me]', { email: CURRENT_USER?.email, role: CURRENT_USER?.role });
    } catch {
      CURRENT_USER = null;
    }
  }

  /* ------- Ability checks (role-based) ------- */
  // Admin: everything
  // Operations: job_create, job_edit, job_delete, job_unassign, job_assign, photo_upload
  function can(abilityKey) {
    const ROLE = roleLower();
    if (!ROLE) return false;
    if (ROLE === 'admin') return true;
    const OPS = new Set([
      'job_create','job_edit','job_delete','job_unassign','job_assign','photo_upload'
    ]);
    if (ROLE === 'operations') return OPS.has(abilityKey);
    return false; // employment has no job abilities here
  }

  function openLoginModal(){
    loginForm?.reset();
    loginModal?.classList.remove('hidden');
    setTimeout(() => document.getElementById('loginEmail')?.focus(), 50);
  }
  function closeLoginModal(){ loginModal.classList.add('hidden'); }

  function updateUIAuth() {
    const authed = isAuthed();
    const ROLE = roleLower();

    // auth buttons
    if (authed) {
      loginBtn?.setAttribute('style', 'display:none');
      logoutBtn?.setAttribute('style', '');
    } else {
      loginBtn?.setAttribute('style', '');
      logoutBtn?.setAttribute('style', 'display:none');
    }

    // Add Position: admin or operations
    if (authed && (ROLE === 'admin' || ROLE === 'operations')) {
      addJobBtn?.removeAttribute('disabled');
      addJobBtn?.setAttribute('style', '');
    } else {
      addJobBtn?.setAttribute('disabled', 'disabled');
      addJobBtn?.setAttribute('style', 'display:none');
    }

    // Admin Hub button: admin only
    if (authed && ROLE === 'admin') {
      adminHubBtn?.setAttribute('style', '');
    } else {
      adminHubBtn?.setAttribute('style', 'display:none');
    }

    // Employment page button: admin + employment (NOT operations)
    if (authed && (ROLE === 'admin' || ROLE === 'employment')) {
      employmentPageBtn?.setAttribute('style', '');
    } else {
      employmentPageBtn?.setAttribute('style', 'display:none');
    }

    render();
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

  /* ====== Assign modal helpers ====== */
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

  // Candidate list for assign:
  // - only "hired"
  // - not already assigned to ANY job (based on ALL_JOBS employee names)
  async function loadCandidateOptions(){
    if (!assignSelect) return;
    assignSelect.innerHTML = `<option value="" disabled selected>Loading…</option>`;

    try {
      const assignedNames = new Set(
        ALL_JOBS
          .filter(j => String(j.status || '').toLowerCase() === 'filled' && (j.employee || '').trim())
          .map(j => (j.employee || '').trim().toLowerCase())
      );

      // This endpoint MUST be allowed for operations on the server (see backend change above)
      const res = await authFetch('/api/candidates');

      if (res.status === 401 || res.status === 403) {
        assignSelect.innerHTML = `<option value="" disabled selected>Your role cannot list candidates (server)</option>`;
        return;
      }
      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        assignSelect.innerHTML = `<option value="" disabled selected>Failed to load candidates (${res.status})</option>`;
        console.error('loadCandidateOptions:', res.status, t);
        return;
      }

      const list = await res.json();
      const arr = Array.isArray(list) ? list : [];

      const eligible = arr.filter(c =>
        String(c.status || '').toLowerCase() === 'hired' &&
        !assignedNames.has((c.full_name || '').trim().toLowerCase())
      );

      eligible.sort((a,b) => String(a.full_name||'').localeCompare(String(b.full_name||'')));

      assignSelect.innerHTML = eligible.length
        ? `<option value="" disabled selected>Select a candidate…</option>`
        : `<option value="" disabled selected>No eligible candidates</option>`;

      for (const c of eligible) {
        const opt = document.createElement('option');
        opt.value = c.id; // keep the id
        opt.textContent = c.full_name || '(Unnamed)';
        opt.dataset.name = c.full_name || '';
        opt.selected = false;
        assignSelect.appendChild(opt);
      }
    } catch (err) {
      console.error('loadCandidateOptions threw:', err);
      assignSelect.innerHTML = `<option value="" disabled selected>Error loading candidates</option>`;
    }
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

  /* ------- shared actions builder (role-aware) ------- */
  function buildActionsHtml(job) {
    const ROLE = roleLower();
    if (!ROLE) {
      return `<button class="secondary login-gate-btn" data-action="open-login">Log in to manage</button>`;
    }

    // Upload = admin or operations (and only useful when filled)
    const canUpload   = (ROLE === 'admin' || ROLE === 'operations') && isFilled(job);
    // Edit/Delete = admin or operations
    const canEdit     = (ROLE === 'admin' || ROLE === 'operations');
    const canDelete   = (ROLE === 'admin' || ROLE === 'operations');
    // Assign = admin or operations
    const canAssign   = (ROLE === 'admin' || ROLE === 'operations');
    // Unassign = admin or operations
    const canUnassign = (ROLE === 'admin' || ROLE === 'operations');

    const inputId = `file_${job.id}`;
    const parts = [];

    if (isFilled(job)) {
      if (canUpload) parts.push(
        `<button class="upload-btn" data-action="trigger-upload" data-input="${inputId}">Upload Photo</button>`
      );
      if (canUnassign) parts.push(
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

  // ===== Add/Edit Position form submit =====
  jobForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const ROLE = roleLower();
    if (!isAuthed() || (ROLE !== 'admin' && ROLE !== 'operations')) { openLoginModal(); return; }

    const id         = document.getElementById('jobId')?.value?.trim();
    const job_number = document.getElementById('jobNumber')?.value?.trim() || null;
    const title      = document.getElementById('jobTitle')?.value?.trim()  || null;
    const department = document.getElementById('department')?.value?.trim()|| null;
    const due_date   = document.getElementById('dueDate')?.value?.trim()   || null;
    const employee   = document.getElementById('employee')?.value?.trim()  || null;

    const createPayload = {
      title,
      job_number,
      department,
      due_date: due_date || null,
      status: 'Open'
    };

    const editPayload = {
      title,
      job_number,
      department,
      due_date: due_date || null,
      employee: employee || null
    };

    try {
      let res;
      if (id) {
        res = await authFetch(`${API}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editPayload)
        });
      } else {
        res = await authFetch(`${API}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload)
        });
      }

      if (!res.ok) {
        const t = await res.text().catch(()=>'');
        alert(`Save failed: ${t || res.status}`);
        return;
      }

      closeModal();
      loadJobs();
    } catch (err) {
      console.error('job save error:', err);
      alert('Save failed (network).');
    }
  });

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
    window.location.replace('/login.html');
  });

  // Card/List button clicks with guards — use closest() so inner spans/icons work
  const jobGridClick = async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'open-login') { openLoginModal(); return; }

    if (action === 'trigger-upload') {
      // Upload: admin OR operations
      if (!isAuthed() || !can('photo_upload')) { openLoginModal(); return; }
      const input = document.getElementById(btn.dataset.input);
      if (input) input.click();
      return;
    }

    if (!id && action !== 'edit') return;

    if (action === 'edit') {
      if (!isAuthed() || !can('job_edit')) return;
      const job = ALL_JOBS.find(j => String(j.id) === String(id));
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

    const candidateId = Number(opt.value);
    const employeeName = opt.dataset.name || opt.textContent || '';

    const res = await authFetch(`/api/jobs/${ASSIGN_JOB_ID}/assign`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ candidate_id: candidateId, employee: employeeName })
    });

    if (!res.ok) {
      const t = await res.text().catch(()=> '');
      try {
        const j = JSON.parse(t || '{}');
        if (j.error === 'candidate_not_hired') return alert('Only Hired candidates can be assigned.');
        if (j.error === 'candidate_already_assigned') return alert('That candidate is already assigned to a position.');
        if (j.error === 'job_already_filled') return alert('This job is already filled.');
        if (j.error === 'candidate_not_found') return alert('Candidate not found.');
      } catch {}
      alert(`Assign failed: ${t || res.status}`);
      return;
    }

    closeAssignModal();
    loadJobs();
  });
  cancelAssign?.addEventListener('click', closeAssignModal);

  // Upload change -> patch job (admin OR operations)
  const jobGridChange = async (e) => {
    if (!e.target.classList.contains('photo-input')) return;
    if (!isAuthed() || !can('photo_upload')) { openLoginModal(); return; }

    const id = e.target.dataset.id;
    const file = e.target.files?.[0];
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

  // Nav buttons
  adminHubBtn?.addEventListener('click', () => {
    const ROLE = roleLower();
    if (ROLE !== 'admin') return;
    window.location.href = '/admin.html';
  });
  employmentPageBtn?.addEventListener('click', () => {
    const ROLE = roleLower();
    if (ROLE === 'admin' || ROLE === 'employment') {
      window.location.href = '/employment.html';
    }
  });

  /* init */
  (async () => {
    syncViewToggle();
    await fetchMe();
    updateUIAuth();
    loadJobs();
  })();

  setInterval(loadJobs, 60000);
});
