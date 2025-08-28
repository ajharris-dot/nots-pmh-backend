// public/employment.js
const AUTH = '/api/auth';
const API  = '/api/candidates';
const TOKEN_KEY = 'authToken';
const PLACEHOLDER = './placeholder-v2.png?v=20250814';

const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
const isAuthed = () => !!getToken();
const authFetch = (url, opts={}) => {
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

  // Modal
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

  backBtn?.addEventListener('click', () => (window.location.href = '/'));

  addBtn?.addEventListener('click', () => {
    if (!isAuthed()) { alert('Please log in.'); return; }
    openModal();
  });
  cancelBtn?.addEventListener('click', closeModal);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAuthed()) { alert('Please log in.'); return; }

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

  grid?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!action) return;

    if (action === 'edit') {
      const c = ALL.find(x => String(x.id) === String(id));
      openModal(c);
    }
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

      const order = [
        'pending_pre_employment',
        'pending_onboarding',
        'offer_extended',
        'ready_to_start',
        'hired',
        'did_not_start'
      ];
      let idx = order.indexOf(c.status);
      if (action === 'advance' && idx < order.length - 1) idx++;
      if (action === 'revert' && idx > 0) idx--;
      const next = order[idx];

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

  (async () => {
    await fetchMe();
    ensureAccess();
    load();
  })();

  async function fetchMe() {
    if (!isAuthed()) return;
    try {
      const r = await authFetch(`${AUTH}/me`);
      if (r.ok) {
        const d = await r.json();
        CURRENT_USER = d?.authenticated ? d.user : null;
      }
    } catch {}
  }

  function ensureAccess() {
    const role = CURRENT_USER?.role;
    if (!(role === 'admin' || role === 'employment')) {
      alert('Access denied.');
      window.location.href = '/';
    }
  }

  async function load() {
    try {
      const res = await authFetch(API);
      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        document.getElementById('candidatesGrid').innerHTML =
          `<div style="color:#b91c1c">Error loading candidates: ${t || res.status}</div>`;
        return;
      }
      ALL = await res.json();
      render();
    } catch (e) {
      console.error(e);
      document.getElementById('candidatesGrid').innerHTML =
        `<div style="color:#b91c1c">Error loading candidates (network/JS)</div>`;
    }
  }

  function render() {
    const grid = document.getElementById('candidatesGrid');
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
      card.className = 'job-card'; // reuse styling
      card.innerHTML = `
        <div class="photo-container">
          <img src="${PLACEHOLDER}" alt="Candidate" />
        </div>
        <div class="card-body">
          <div class="card-title">
            <h3>${c.name}</h3>
            ${statusBadge(c.status)}
          </div>
          <div class="card-meta">
            ${c.email ? `<div class="meta-row"><strong>Email:</strong> ${c.email}</div>` : ''}
            ${c.phone ? `<div class="meta-row"><strong>Phone:</strong> ${c.phone}</div>` : ''}
            ${c.notes ? `<div class="meta-row"><strong>Notes:</strong> ${c.notes}</div>` : ''}
          </div>
        </div>
        <div class="card-actions">
          <button class="secondary" data-action="revert" data-id="${c.id}">◀︎ Step Back</button>
          <button class="secondary" data-action="advance" data-id="${c.id}">Step Forward ▶︎</button>
          <button class="secondary" data-action="edit" data-id="${c.id}">Edit</button>
          <button class="danger" data-action="delete" data-id="${c.id}">Delete</button>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  function statusBadge(s) {
    const map = {
      pending_pre_employment: 'Pending pre-employment',
      pending_onboarding: 'Pending onboarding',
      offer_extended: 'Offer extended',
      ready_to_start: 'Ready to start',
      hired: 'Hired',
      did_not_start: 'Did not start'
    };
    const label = map[s] || s;
    const cls =
      s === 'hired' ? 'badge-open' :
      s === 'did_not_start' ? 'badge-filled' : '';
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function openModal(c=null) {
    modal.classList.remove('hidden');
    if (c) {
      title.textContent = 'Edit Candidate';
      idEl.value = c.id;
      nameEl.value = c.name || '';
      emailEl.value = c.email || '';
      phoneEl.value = c.phone || '';
      statusEl.value = c.status || 'pending_pre_employment';
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
});
