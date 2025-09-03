// public/employment.js
// --- early auth gate ---
const TOKEN_KEY = 'authToken';
if (!localStorage.getItem(TOKEN_KEY)) {
  window.location.replace('/login.html');
  throw new Error('redirecting-to-login');
}

const AUTH = '/api/auth';
const API  = '/api/candidates';
const PLACEHOLDER = './placeholder-v2.png?v=20250814';

const VIEW_KEY = 'employmentViewMode';
let VIEW_MODE = localStorage.getItem(VIEW_KEY) || 'list';

// ---- auth helpers ----
const getToken   = () => localStorage.getItem(TOKEN_KEY) || '';
const setToken   = (t) => localStorage.setItem(TOKEN_KEY, t);
const clearToken = () => localStorage.removeItem(TOKEN_KEY);
const isAuthed   = () => !!getToken();
const authFetch  = (url, opts = {}) => {
  const headers = new Headers(opts.headers || {});
  const t = getToken();
  if (t) headers.set('Authorization', `Bearer ${t}`);
  return fetch(url, { ...opts, headers });
};

let CURRENT_USER = null;
let ALL = [];

document.addEventListener('DOMContentLoaded', () => {
  /* ---------- El refs ---------- */
  const backBtn   = document.getElementById('backToHubBtn');
  const addBtn    = document.getElementById('addCandidateBtn');
  const grid      = document.getElementById('candidatesGrid');
  const search    = document.getElementById('search');

  // Hired filter + count
  const hireFilterEl = document.getElementById('hireFilter'); // segmented buttons
  const candCountEl  = document.getElementById('candCount');

  // Pretty sort controls
  const sortFieldEl = document.getElementById('sortField'); // 'name' | 'status'
  const sortDirEl   = document.getElementById('sortDir');   // 'asc' | 'desc'

  // auth UI
  const loginBtn    = document.getElementById('loginBtn');
  const logoutBtn   = document.getElementById('logoutBtn');
  const loginModal  = document.getElementById('loginModal');
  const loginForm   = document.getElementById('loginForm');
  const cancelLogin = document.getElementById('cancelLogin');

  // View toggle
  const candCardViewBtn = document.getElementById('candCardViewBtn');
  const candListViewBtn = document.getElementById('candListViewBtn');

  // Candidate modal
  const modal     = document.getElementById('candidateModal');
  const title     = document.getElementById('candidateModalTitle');
  const form      = document.getElementById('candidateForm');
  const cancelBtn = document.getElementById('cancelCandidateModal');

  const idEl     = document.getElementById('candId');
  const nameEl   = document.getElementById('candName');
  const emailEl  = document.getElementById('candEmail');
  const phoneEl  = document.getElementById('candPhone');
  const statusEl = document.getElementById('candStatus');
  const notesEl  = document.getElementById('candNotes');

  /* ---------- Status model ---------- */
  const STATUS_ORDER = [
    'pending_pre_employment',
    'pending_onboarding',
    'offer_extended',
    'ready_to_start',
    'hired',
    'did_not_start'
  ];
  const STATUS_LABEL = {
    pending_pre_employment: 'Pending pre-employment',
    pending_onboarding:     'Pending onboarding',
    offer_extended:         'Offer extended',
    ready_to_start:         'Ready to start',
    hired:                  'Hired',
    did_not_start:          'Did not start'
  };

  /* ---------- Helpers ---------- */
  const roleLower = () => (CURRENT_USER?.role || '').toString().trim().toLowerCase();

  // Permissions: Admin + Employment can manage candidates; Operations cannot
  function canCand(action) {
    const r = roleLower();
    if (!r) return false;
    if (r === 'admin') return true;
    if (r === 'employment') {
      return new Set([
        'candidate_view',
        'candidate_create',
        'candidate_edit',
        'candidate_delete',
        'candidate_advance',
        'candidate_revert'
      ]).has(action);
    }
    return false;
  }

  const nameKey = (c) => String(c?.full_name || '').trim().toLowerCase();
  const statusIndex = (s) => {
    const idx = STATUS_ORDER.indexOf(String(s || ''));
    return idx >= 0 ? idx : STATUS_ORDER.length + 1;
  };

  /* ---------- Sort state ---------- */
  const SORT_KEY = 'employmentSortState';
  function readSortState() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(SORT_KEY) || 'null'); } catch {}
    const field = saved?.field || sortFieldEl?.value || 'name';
    const dir   = saved?.dir   || sortDirEl?.value   || 'asc';
    return { field, dir };
  }
  function writeSortState(state) {
    localStorage.setItem(SORT_KEY, JSON.stringify(state));
    if (sortFieldEl) sortFieldEl.value = state.field;
    if (sortDirEl)   sortDirEl.value   = state.dir;
  }
  // initialize
  writeSortState(readSortState());

  // listeners
  sortFieldEl?.addEventListener('change', () => { writeSortState(readSortState()); render(); });
  sortDirEl  ?.addEventListener('change', () => { writeSortState(readSortState()); render(); });

  function applySort(list) {
    const { field, dir } = readSortState();
    const mult = dir === 'asc' ? 1 : -1;
    const arr = list.slice();

    if (field === 'status') {
      arr.sort((a,b) => {
        const s = (statusIndex(a.status) - statusIndex(b.status)) * mult;
        if (s !== 0) return s;
        const A = nameKey(a), B = nameKey(b);
        if (A < B) return -1;
        if (A > B) return  1;
        return String(a.id).localeCompare(String(b.id));
      });
    } else { // 'name'
      arr.sort((a,b) => {
        const A = nameKey(a), B = nameKey(b);
        if (A < B) return -1 * mult;
        if (A > B) return  1 * mult;
        const s = statusIndex(a.status) - statusIndex(b.status);
        return s !== 0 ? s : String(a.id).localeCompare(String(b.id));
      });
    }
    return arr;
  }

  /* ---------- Hired filter state ---------- */
  const HIRE_FILTER_KEY = 'employmentHireFilter'; // 'all' | 'hired' | 'not_hired'
  function getHireFilter() {
    return localStorage.getItem(HIRE_FILTER_KEY) || 'all';
  }
  function setHireFilter(val) {
    localStorage.setItem(HIRE_FILTER_KEY, val);
    // update segmented active state + aria
    hireFilterEl?.querySelectorAll('.seg').forEach(btn => {
      const active = btn.dataset.filter === val;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
  }
  // init from storage
  setHireFilter(getHireFilter());

  // clicks on segmented
  hireFilterEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg[data-filter]');
    if (!btn) return;
    setHireFilter(btn.dataset.filter);
    render();
  });

  /* ---------- Nav ---------- */
  backBtn?.addEventListener('click', () => (window.location.href = '/'));

  /* ---------- View toggle ---------- */
  function syncViewToggle() {
    if (VIEW_MODE === 'list') {
      candCardViewBtn?.classList.remove('active');
      candListViewBtn?.classList.add('active');
    } else {
      candListViewBtn?.classList.remove('active');
      candCardViewBtn?.classList.add('active');
    }
  }
  candCardViewBtn?.addEventListener('click', () => {
    VIEW_MODE = 'card';
    localStorage.setItem(VIEW_KEY, VIEW_MODE);
    syncViewToggle();
    render();
  });
  candListViewBtn?.addEventListener('click', () => {
    VIEW_MODE = 'list';
    localStorage.setItem(VIEW_KEY, VIEW_MODE);
    syncViewToggle();
    render();
  });

  /* ---------- Auth helpers ---------- */
  function openLoginModal() {
    loginForm?.reset();
    loginModal?.classList.remove('hidden');
    setTimeout(() => document.getElementById('loginEmail')?.focus(), 50);
  }
  function closeLoginModal() { loginModal?.classList.add('hidden'); }

  async function fetchMe() {
    if (!isAuthed()) { CURRENT_USER = null; return; }
    try {
      const r = await authFetch(`${AUTH}/me`);
      if (r.ok) {
        const d = await r.json();
        CURRENT_USER = d?.authenticated ? d.user : null;
      } else {
        CURRENT_USER = null;
      }
    } catch {
      CURRENT_USER = null;
    }
  }

  function updateAuthUI() {
    if (isAuthed()) {
      loginBtn?.setAttribute('style','display:none');
      logoutBtn?.setAttribute('style','');
    } else {
      loginBtn?.setAttribute('style','');
      logoutBtn?.setAttribute('style','display:none');
    }
    if (canCand('candidate_create')) {
      addBtn?.setAttribute('style','');
    } else {
      addBtn?.setAttribute('style','display:none');
    }
  }

  // Auth events
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
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        alert(`Login failed: ${t || res.status}`);
        return;
      }
      const data = await res.json();
      if (data?.token) {
        setToken(data.token);
        await fetchMe();
        updateAuthUI();
        closeLoginModal();
        await load();
      } else {
        alert('Login failed: no token returned');
      }
    } catch (err) {
      console.error('login error', err);
      alert('Login failed (network).');
    }
  });
  logoutBtn?.addEventListener('click', () => {
    clearToken();
    CURRENT_USER = null;
    window.location.replace('/login.html');
  });

  /* ---------- Candidate modal ---------- */
  addBtn?.addEventListener('click', () => {
    if (!isAuthed()) { openLoginModal(); return; }
    if (!canCand('candidate_create')) { alert('Access denied.'); return; }
    openModal();
  });
  cancelBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal?.classList.contains('hidden')) closeModal();
    if (e.key === 'Escape' && !loginModal?.classList.contains('hidden')) closeLoginModal();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAuthed()) { openLoginModal(); return; }
    const id = idEl.value;
    const creating = !id;

    if (creating && !canCand('candidate_create')) { alert('Access denied.'); return; }
    if (!creating && !canCand('candidate_edit'))  { alert('Access denied.'); return; }

    const full_name = nameEl.value?.trim();
    if (!full_name) { alert('Name is required.'); nameEl.focus(); return; }

    const payload = {
      full_name,
      email: emailEl.value?.trim() || null,
      phone: phoneEl.value?.trim() || null,
      status: statusEl.value,
      notes: notesEl.value?.trim() || null
    };

    try {
      let res;
      if (id) {
        res = await authFetch(`${API}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await authFetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          alert('Please log in with Employment/Admin access.');
          openLoginModal();
          return;
        }
        const t = await res.text().catch(()=> '');
        alert(`Save failed: ${t || res.status}`);
        return;
      }
      closeModal();
      load();
    } catch (err) {
      console.error(err);
      alert('Save failed (network).');
    }
  });

  search?.addEventListener('input', render);

  /* ---------- Grid actions ---------- */
  grid?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!action) return;

    if (action === 'edit') {
      if (!canCand('candidate_edit')) { alert('Access denied.'); return; }
      const c = ALL.find(x => String(x.id) === String(id));
      openModal(c);
      return;
    }

    if (!isAuthed()) { openLoginModal(); return; }

    if (action === 'delete') {
      if (!canCand('candidate_delete')) { alert('Access denied.'); return; }
      if (!confirm('Delete candidate?')) return;
      const res = await authFetch(`${API}/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        alert(`Delete failed: ${t || res.status}`);
        return;
      }
      load();
      return;
    }

    if (action === 'advance' || action === 'revert') {
      if (!(canCand('candidate_advance') || canCand('candidate_revert'))) {
        alert('Access denied.');
        return;
      }
      const c = ALL.find(x => String(x.id) === String(id));
      if (!c) return;
      let idx = STATUS_ORDER.indexOf(c.status);
      if (idx < 0) idx = 0;
      if (action === 'advance' && idx < STATUS_ORDER.length - 1) idx++;
      if (action === 'revert'  && idx > 0) idx--;
      const next = STATUS_ORDER[idx];

      const res = await authFetch(`${API}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ status: next })
      });
      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        alert(`Update failed: ${t || res.status}`);
        return;
      }
      load();
    }
  });

  /* ---------- init ---------- */
  (async () => {
    await fetchMe();
    updateAuthUI();
    syncViewToggle();
    await load();
  })();

  async function load() {
    try {
      const res = await authFetch(API);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          grid.innerHTML = `<div class="muted">Please log in with Employment/Admin to view candidates.</div>`;
          return;
        }
        const t = await res.text().catch(()=> '');
        grid.innerHTML = `<div style="color:#b91c1c">Error loading candidates: ${t || res.status}</div>`;
        return;
      }
      ALL = await res.json();
      render();
    } catch (e) {
      console.error(e);
      grid.innerHTML = `<div style="color:#b91c1c">Error loading candidates (network/JS)</div>`;
    }
  }

  function render() {
    const q = (search?.value || '').toLowerCase().trim();
    const filterMode = getHireFilter(); // 'all' | 'hired' | 'not_hired'
    grid.innerHTML = '';

    grid.classList.toggle('card-grid', VIEW_MODE === 'card');
    grid.classList.toggle('list-grid', VIEW_MODE === 'list');

    // base search
    let list = ALL.filter(c => {
      const t = `${c.full_name || ''} ${c.email || ''} ${c.phone || ''}`.toLowerCase();
      return !q || t.includes(q);
    });

    // hired/not-hired filter
    if (filterMode === 'hired') {
      list = list.filter(c => String(c.status || '').toLowerCase() === 'hired');
    } else if (filterMode === 'not_hired') {
      list = list.filter(c => String(c.status || '').toLowerCase() !== 'hired');
    }

    // update live count pill
    const total = list.length;
    if (candCountEl) {
      candCountEl.textContent = `${total} ${total === 1 ? 'candidate' : 'candidates'}`;
    }

    // sort
    list = applySort(list);

    if (!list.length) {
      grid.innerHTML = `<div style="color:#6b7280">No candidates yet.</div>`;
      return;
    }

    // render
    list.forEach(c => {
      const actionsHtml = (canCand('candidate_edit') || canCand('candidate_delete') || canCand('candidate_advance') || canCand('candidate_revert'))
        ? `
          <button class="secondary" data-action="revert"  data-id="${c.id}">◀︎ Step Back</button>
          <button class="secondary" data-action="advance" data-id="${c.id}">Step Forward ▶︎</button>
          <button class="secondary" data-action="edit"    data-id="${c.id}">Edit</button>
          <button class="danger"    data-action="delete"  data-id="${c.id}">Delete</button>
        ` : '';

      if (VIEW_MODE === 'list') {
        const row = document.createElement('div');
        row.className = 'job-row';
        row.innerHTML = `
          <div class="thumb">
            <img src="${PLACEHOLDER}" alt="Candidate" />
          </div>

          <div class="info">
            <div class="title-line">
              <h3>${escapeHtml(c.full_name || 'Unnamed')}</h3>
              ${statusBadge(c.status)}
            </div>
            <div class="meta">
              ${c.email ? `<div><strong>Email:</strong> ${escapeHtml(c.email)}</div>` : ''}
              ${c.phone ? `<div><strong>Phone:</strong> ${escapeHtml(c.phone)}</div>` : ''}
              ${c.notes ? `<div><strong>Notes:</strong> ${escapeHtml(c.notes)}</div>` : ''}
            </div>
            ${timelineHtml(c.status)}
          </div>

          <div class="actions">
            ${actionsHtml}
          </div>
        `;
        grid.appendChild(row);
      } else {
        const card = document.createElement('div');
        card.className = 'job-card';
        card.innerHTML = `
          <div class="photo-container">
            <img src="${PLACEHOLDER}" alt="Candidate" />
          </div>

          <div class="card-body">
            <div class="card-title">
              <h3>${escapeHtml(c.full_name || 'Unnamed')}</h3>
              ${statusBadge(c.status)}
            </div>

            ${timelineHtml(c.status)}

            <div class="card-meta" style="margin-top:8px;">
              ${c.email ? `<div class="meta-row"><strong>Email:</strong> ${escapeHtml(c.email)}</div>` : ''}
              ${c.phone ? `<div class="meta-row"><strong>Phone:</strong> ${escapeHtml(c.phone)}</div>` : ''}
              ${c.notes ? `<div class="meta-row"><strong>Notes:</strong> ${escapeHtml(c.notes)}</div>` : ''}
            </div>
          </div>

          <div class="card-actions">
            ${actionsHtml}
          </div>
        `;
        grid.appendChild(card);
      }
    });
  }

  function statusBadge(s) {
    const label = STATUS_LABEL[s] || s || 'Unknown';
    const cls =
      s === 'hired' ? 'badge-open' :
      s === 'did_not_start' ? 'badge-filled' : '';
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function timelineHtml(currentStatus) {
    const idx = Math.max(0, STATUS_ORDER.indexOf(currentStatus));
    const steps = STATUS_ORDER.map((key, i) => {
      const active = i <= idx;
      return `
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="
            width:10px;height:10px;border-radius:999px;
            background:${active ? 'var(--accent)' : 'var(--line)'};">
          </div>
          <div style="font-size:12px; color:${active ? 'var(--text)' : 'var(--muted)'};">
            ${STATUS_LABEL[key]}
          </div>
        </div>
      `;
    }).join(`
      <div style="height:8px; border-left:2px solid var(--line); margin:2px 0 2px 4px;"></div>
    `);

    return `
      <div style="
        display:grid; gap:6px; margin:8px 0; padding:10px; border:1px solid var(--line);
        border-radius:8px; background:#fff;">
        ${steps}
      </div>
    `;
  }

  function openModal(c = null) {
    modal.classList.remove('hidden');
    if (c) {
      title.textContent = 'Edit Candidate';
      idEl.value = c.id;
      nameEl.value = c.full_name || '';
      emailEl.value = c.email || '';
      phoneEl.value = c.phone || '';
      statusEl.value = STATUS_ORDER.includes(c.status) ? c.status : 'pending_pre_employment';
      notesEl.value  = c.notes || '';
    } else {
      title.textContent = 'Add Candidate';
      form.reset();
      idEl.value = '';
      statusEl.value = 'pending_pre_employment';
      setTimeout(()=> nameEl.focus(), 50);
    }
  }
  function closeModal(){ modal.classList.add('hidden'); }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
});
