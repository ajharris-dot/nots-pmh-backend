// public/employment.js
const AUTH = '/api/auth';
const API  = '/api/candidates';
const TOKEN_KEY = 'authToken';
const PLACEHOLDER = './placeholder-v2.png?v=20250814';

const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
const clearToken = () => localStorage.removeItem(TOKEN_KEY);
const isAuthed = () => !!getToken();
const authFetch = (url, opts = {}) => {
  const headers = new Headers(opts.headers || {});
  const t = getToken();
  if (t) headers.set('Authorization', `Bearer ${t}`);
  return fetch(url, { ...opts, headers });
};

let CURRENT_USER = null;
let ALL = [];

document.addEventListener('DOMContentLoaded', () => {
  const backBtn   = document.getElementById('backToHubBtn');
  const addBtn    = document.getElementById('addCandidateBtn');
  const grid      = document.getElementById('candidatesGrid');
  const search    = document.getElementById('search');

  // Auth UI (optional here, but handy)
  const loginBtn  = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginModal = document.getElementById('loginModal');
  const loginForm  = document.getElementById('loginForm');
  const cancelLogin = document.getElementById('cancelLogin');

  // Candidate modal
  const modal     = document.getElementById('candidateModal');
  const title     = document.getElementById('candidateModalTitle');
  const form      = document.getElementById('candidateForm');
  const cancelBtn = document.getElementById('cancelCandidateModal');

  const idEl      = document.getElementById('candId');
  const nameEl    = document.getElementById('candName');
  const emailEl   = document.getElementById('candEmail');
  const phoneEl   = document.getElementById('candPhone');
  const statusEl  = document.getElementById('candStatus');
  const notesEl   = document.getElementById('candNotes');

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

  /* ---------- Nav ---------- */
  backBtn?.addEventListener('click', () => (window.location.href = '/'));

  /* ---------- Auth helpers ---------- */
  function updateAuthUI() {
    if (isAuthed()) {
      loginBtn?.setAttribute('style','display:none');
      logoutBtn?.setAttribute('style','');
    } else {
      loginBtn?.setAttribute('style','');
      logoutBtn?.setAttribute('style','display:none');
    }
    const role = CURRENT_USER?.role;
    if (role === 'admin' || role === 'employment') {
      addBtn?.setAttribute('style','');
    } else {
      addBtn?.setAttribute('style','display:none');
    }
  }
  function openLoginModal() {
    loginForm?.reset();
    loginModal?.classList.remove('hidden');
    setTimeout(() => document.getElementById('loginEmail')?.focus(), 50);
  }
  function closeLoginModal() {
    loginModal?.classList.add('hidden');
  }

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
    updateAuthUI();
    // Still allow viewing (GET may be guarded; if so you’ll see message)
    load();
  });

  /* ---------- Candidate modal ---------- */
  addBtn?.addEventListener('click', () => {
    if (!isAuthed()) { openLoginModal(); return; }
    const role = CURRENT_USER?.role;
    if (!(role === 'admin' || role === 'employment')) { alert('Access denied.'); return; }
    openModal();
  });
  cancelBtn?.addEventListener('click', closeModal);

  // Close on backdrop click
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  // Close on Esc
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal?.classList.contains('hidden')) closeModal();
    if (e.key === 'Escape' && !loginModal?.classList.contains('hidden')) closeLoginModal();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAuthed()) { openLoginModal(); return; }
    const role = CURRENT_USER?.role;
    if (!(role === 'admin' || role === 'employment')) { alert('Access denied.'); return; }

    const payload = {
      name: nameEl.value?.trim(),
      email: emailEl.value?.trim() || null,
      phone: phoneEl.value?.trim() || null,
      status: statusEl.value,
      notes: notesEl.value?.trim() || null
    };
    const id = idEl.value;

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
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!action) return;

    if (action === 'edit') {
      const c = ALL.find(x => String(x.id) === String(id));
      openModal(c);
      return;
    }

    if (!isAuthed()) { openLoginModal(); return; }
    const role = CURRENT_USER?.role;
    if (!(role === 'admin' || role === 'employment')) { alert('Access denied.'); return; }

    if (action === 'delete') {
      if (!confirm('Delete candidate?')) return;
      const res = await authFetch(`${API}/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        alert(`Delete failed: ${t || res.status}`);
        return;
      }
      load();
    }

    if (action === 'advance' || action === 'revert') {
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
    await load();
  })();

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

  async function load() {
    try {
      const res = await authFetch(API);
      if (!res.ok) {
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
    grid.innerHTML = '';

    const list = ALL.filter(c => {
      const t = `${c.name || ''} ${c.email || ''} ${c.phone || ''}`.toLowerCase();
      return !q || t.includes(q);
    });

    if (!list.length) {
      grid.innerHTML = `<div style="color:#6b7280">No candidates yet.</div>`;
      return;
    }

    list.forEach(c => {
      const card = document.createElement('div');
      card.className = 'job-card'; // reuse card style
      card.innerHTML = `
        <div class="photo-container">
          <img src="${PLACEHOLDER}" alt="Candidate" />
        </div>

        <div class="card-body">
          <div class="card-title">
            <h3>${escapeHtml(c.name || 'Unnamed')}</h3>
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
          <button class="secondary" data-action="revert"  data-id="${c.id}">◀︎ Step Back</button>
          <button class="secondary" data-action="advance" data-id="${c.id}">Step Forward ▶︎</button>
          <button class="secondary" data-action="edit"    data-id="${c.id}">Edit</button>
          <button class="danger"    data-action="delete"  data-id="${c.id}">Delete</button>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  function statusBadge(s) {
    const label = STATUS_LABEL[s] || s;
    // Styling reuse: use open/filled colors loosely
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
      nameEl.value = c.name || '';
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
