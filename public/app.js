const API = ''; // same-origin
let CURRENT_FILTER = 'all';
let ALL_JOBS = [];

function fmtDate(d) {
  if (!d) return '';
  // d might be "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ssZ"
  const s = String(d);
  const only = s.includes('T') ? s.split('T')[0] : s; // keep pure date
  const [y, m, day] = only.split('-');
  if (y && m && day) return `${m}/${day}/${y}`; // M/D/YYYY
  return only;
}


async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function applyFilterAndRender() {
  const q = document.getElementById('search').value.trim().toLowerCase();
  const tbody = document.querySelector('#jobs tbody');
  const tpl = document.getElementById('row-tpl');
  tbody.innerHTML = '';

  const filtered = ALL_JOBS.filter(j => {
    const matchesFilter = CURRENT_FILTER === 'all' ? true : (j.status === CURRENT_FILTER);
    const s = `${j.title||''} ${j.department||''} ${j.employee||''}`.toLowerCase();
    const matchesSearch = !q || s.includes(q);
    return matchesFilter && matchesSearch;
  });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">No positions</td></tr>';
    return;
  }

  for (const j of filtered) {
    const row = tpl.content.firstElementChild.cloneNode(true);
    row.querySelector('.title').textContent = `${j.job_number ? j.job_number + ' – ' : ''}${j.title || ''}`;
    row.querySelector('.department').textContent = j.department || '';
    row.querySelector('.due').textContent = fmtDate(j.due_date);
    row.querySelector('.employee').textContent = j.employee || '';

    const status = (j.status === 'Filled' || (j.employee && j.status !== 'Open')) ? 'Filled' : 'Open';
    row.querySelector('.status').innerHTML = status === 'Filled'
      ? '<span class="badge badge-filled">Filled</span>'
      : '<span class="badge badge-open">Open</span>';

    const actions = row.querySelector('.actions');
    if (status === 'Open') {
      const btnAssign = document.createElement('button');
      btnAssign.textContent = 'Assign';
      btnAssign.onclick = async () => {
        const name = prompt('Assign to (employee name):');
        if (!name) return;
        await fetchJSON(`${API}/api/jobs/${j.id}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee: name })
        });
        await loadJobs();
      };
      actions.appendChild(btnAssign);
    } else {
      const btnUnassign = document.createElement('button');
      btnUnassign.textContent = 'Unassign';
      btnUnassign.onclick = async () => {
        if (!confirm('Remove current employee?')) return;
        await fetchJSON(`${API}/api/jobs/${j.id}/unassign`, { method: 'POST' });
        await loadJobs();
      };
      actions.appendChild(btnUnassign);
    }

    const btnDelete = document.createElement('button');
    btnDelete.textContent = 'Delete';
    btnDelete.onclick = async () => {
      if (!confirm('Delete this position?')) return;
      await fetch(`${API}/api/jobs/${j.id}`, { method: 'DELETE' });
      await loadJobs();
    };
    actions.appendChild(btnDelete);

    tbody.appendChild(row);
  }
}

async function loadJobs() {
  const qs = CURRENT_FILTER === 'all' ? '' : `?status=${encodeURIComponent(CURRENT_FILTER)}`;
  const jobs = await fetchJSON(`${API}/api/jobs${qs}`);
  ALL_JOBS = jobs;
  applyFilterAndRender();
}

document.getElementById('refresh').addEventListener('click', loadJobs);
document.getElementById('search').addEventListener('input', applyFilterAndRender);

document.querySelectorAll('.filters .tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filters .tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    CURRENT_FILTER = btn.dataset.filter;
    loadJobs();
  });
});

document.getElementById('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('createMsg');
  msg.textContent = 'Saving...';
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  // body has: title, department, due_date, job_number
  try {
    await fetchJSON(`${API}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    e.target.reset();
    msg.textContent = 'Added ✅';
    await loadJobs();
    setTimeout(()=> msg.textContent='', 1500);
  } catch (e2) {
    msg.textContent = 'Error: ' + e2.message;
  }
});

// initial load
loadJobs();
