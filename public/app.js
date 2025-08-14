/* Minimal frontend to render cards with a FIT photo area (no cropping). */

const API = {
  list: () => fetch('/api/jobs').then(r => r.json()),
  patch: (id, data) =>
    fetch(`/api/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => {
      if (!r.ok) throw new Error('Failed to update job');
      return r.json();
    }),
  upload: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch('/api/upload', { method: 'POST', body: fd })
      .then(r => {
        if (!r.ok) throw new Error('Upload failed');
        return r.json();
      });
  },
};

const state = {
  jobs: [],
  status: 'all',
  query: '',
};

const el = {
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty'),
  tabs: document.getElementById('tabs'),
  search: document.getElementById('search'),
  btnRefresh: document.getElementById('btnRefresh'),
  btnAdd: document.getElementById('btnAdd'),
};

function statusClass(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'filled') return 'filled';
  if (v === 'assigned') return 'assigned';
  return 'open';
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString();
}

function filterJobs() {
  const q = state.query.trim().toLowerCase();
  return state.jobs.filter(j => {
    const statusOk = state.status === 'all' || String(j.status || 'open').toLowerCase() === state.status;
    if (!statusOk) return false;
    if (!q) return true;
    const hay = [
      j.title, j.job_title, j.jobnumber, j.job_number, j.number,
      j.client, j.department, j.employee, j.assigned_to
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

function render() {
  const list = filterJobs();
  el.grid.innerHTML = '';
  el.empty.style.display = list.length ? 'none' : 'block';

  list.forEach(j => {
    const id = j.id;
    const title = j.title || j.job_title || '(Untitled)';
    const jobNo = j.job_number || j.jobnumber || j.number || '';
    const dept = j.department || '';
    const client = j.client || '';
    const due = formatDate(j.due_date);
    const employee = j.employee || j.assigned_to || '';
    const status = (j.status || (employee ? 'filled' : 'open')).toLowerCase();
    const photoUrl = j.employee_photo_url || '';

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="row" style="justify-content: space-between;">
        <span class="chip ${statusClass(status)}">${status.replace(/^\w/, c => c.toUpperCase())}</span>
        <small class="help">${jobNo ? `#${jobNo}` : ''}</small>
      </div>

      <div class="card-photo ${photoUrl ? '' : 'card-photo--empty'}">
        ${photoUrl ? `<img src="${photoUrl}" alt="Employee photo" loading="lazy">` : ''}
      </div>

      <h3>${title}</h3>

      <div class="meta">
        <div title="${client}">Client: ${client || '—'}</div>
        <div title="${dept}">Dept: ${dept || '—'}</div>
        <div>Due: ${due || '—'}</div>
        <div title="${employee}">Employee: ${employee || '—'}</div>
      </div>

      <div class="actions">
        <small class="help">Add/replace photo</small>
        <div class="photo-controls">
          <label class="file">
            <input type="file" accept="image/*" data-id="${id}">
            Upload
          </label>
        </div>
      </div>
    `;

    // hook up upload
    const input = card.querySelector('input[type="file"]');
    input?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        input.disabled = true;
        input.parentElement.style.opacity = 0.6;

        const { url } = await API.upload(file);               // { url: "/uploads/xxx.jpg" }
        await API.patch(id, { employee_photo_url: url });     // persist on the job
        await load();                                         // refresh list
      } catch (err) {
        alert(err.message || 'Upload failed');
      } finally {
        input.disabled = false;
        input.parentElement.style.opacity = 1;
        e.target.value = '';
      }
    });

    el.grid.appendChild(card);
  });
}

async function load() {
  const data = await API.list();
  // Accept either {jobs:[...]} or raw array
  state.jobs = Array.isArray(data) ? data : (data.jobs || []);
  render();
}

/* Events */
el.tabs.addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (!t) return;
  [...el.tabs.children].forEach(c => c.classList.remove('active'));
  t.classList.add('active');
  state.status = t.dataset.status;
  render();
});

el.search.addEventListener('input', (e) => {
  state.query = e.target.value;
  render();
});

el.btnRefresh.addEventListener('click', load);

// (Optional) add handler for "New Job" if desired
el.btnAdd.addEventListener('click', () => {
  alert('Hook up your "New Job" modal/form here.');
});

/* Init */
load().catch(err => {
  console.error(err);
  el.empty.style.display = 'block';
  el.empty.textContent = 'Failed to load jobs.';
});
