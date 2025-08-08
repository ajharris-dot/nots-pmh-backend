const API = ''; // same origin (served by Express)

async function fetchJobs() {
  const res = await fetch(`${API}/api/jobs`);
  const jobs = await res.json();
  const tbody = document.querySelector('#jobs tbody');
  tbody.innerHTML = '';
  jobs.forEach(j => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${j.title ?? ''}</td>
      <td>${j.client ?? ''}</td>
      <td>${j.due_date ? new Date(j.due_date).toLocaleDateString() : ''}</td>
      <td>${j.assigned_to ?? ''}</td>
      <td>${j.status ?? ''}</td>
      <td>
        <button data-id="${j.id}" class="mark-progress">In Progress</button>
        <button data-id="${j.id}" class="mark-closed">Close</button>
        <button data-id="${j.id}" class="delete">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('refresh').addEventListener('click', fetchJobs);

document.getElementById('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  if (body.due_date === '') delete body.due_date;
  const res = await fetch(`${API}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) alert('Create failed');
  e.target.reset();
  fetchJobs();
});

document.addEventListener('click', async (e) => {
  if (e.target.matches('.mark-progress')) {
    await fetch(`${API}/api/jobs/${e.target.dataset.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'In Progress' })
    });
    fetchJobs();
  }
  if (e.target.matches('.mark-closed')) {
    await fetch(`${API}/api/jobs/${e.target.dataset.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Closed' })
    });
    fetchJobs();
  }
  if (e.target.matches('.delete')) {
    if (!confirm('Delete this job?')) return;
    await fetch(`${API}/api/jobs/${e.target.dataset.id}`, { method: 'DELETE' });
    fetchJobs();
  }
});
fetchJobs();
