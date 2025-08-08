const API = '/api/jobs';

async function loadJobs() {
  const res = await fetch(API);
  const jobs = await res.json();
  const container = document.getElementById('jobs');
  container.innerHTML = '';
  jobs.forEach(job => {
    const div = document.createElement('div');
    div.className = 'job';
    div.innerHTML = `<strong>${job.title}</strong> - ${job.status}<br>${job.description}<br>${job.client} | Due: ${new Date(job.due_date).toLocaleDateString()}<br>Assigned to: ${job.assigned_to}`;
    container.appendChild(div);
  });
}

async function createJob() {
  const job = {
    title: document.getElementById('title').value,
    description: document.getElementById('description').value,
    client: document.getElementById('client').value,
    due_date: document.getElementById('due_date').value,
    assigned_to: document.getElementById('assigned_to').value,
    status: document.getElementById('status').value
  };
  await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job)
  });
  loadJobs();
}

loadJobs();
