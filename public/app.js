const API_BASE = '/api/jobs';

document.addEventListener('DOMContentLoaded', () => {
  const jobGrid = document.getElementById('jobGrid');
  const addJobBtn = document.getElementById('addJobBtn');
  const jobModal = document.getElementById('jobModal');
  const jobForm = document.getElementById('jobForm');
  const modalTitle = document.getElementById('modalTitle');
  const cancelModal = document.getElementById('cancelModal');

  let jobs = [];

  /* ---------- data ---------- */

  const fetchJobs = async () => {
    const res = await fetch(API_BASE);
    jobs = await res.json();
    renderJobs();
  };

  /* ---------- ui ---------- */

  const renderJobs = () => {
    jobGrid.innerHTML = '';

    jobs.forEach(job => {
      const card = document.createElement('div');
      card.className = 'job-card';

      // consider a job "Filled" if it has an employee or reports Filled
      const isFilled = !!job.employee || (job.status && job.status.toLowerCase() === 'filled');
      const due = job.due_date ? job.due_date.split('T')[0] : '';

      // hidden file input per card (we trigger it from a button when filled)
      const inputId = `photo-input-${job.id}`;

      card.innerHTML = `
        <div class="photo-container">
          <img src="${job.employee_photo_url || '/placeholder.png'}" alt="Employee Photo"/>
          <input type="file" id="${inputId}" class="photo-upload" data-id="${job.id}" accept="image/*" style="display:none"/>
        </div>

        <h3>${job.job_number || 'No Number'}</h3>
        <p><strong>Title:</strong> ${job.title || ''}</p>
        <p><strong>Dept:</strong> ${job.department || ''}</p>
        <p><strong>Due:</strong> ${due}</p>
        <p><strong>Employee:</strong> ${job.employee || 'Unassigned'}</p>

        <div class="card-actions">
          ${isFilled
            ? `<button class="upload-btn" data-action="trigger-upload" data-input="${inputId}">Upload Photo</button>
               <button data-action="unassign" data-id="${job.id}">Unassign</button>`
            : `<button data-action="assign" data-id="${job.id}">Assign</button>`
          }
          <button data-action="edit" data-id="${job.id}">Edit</button>
          <button data-action="delete" data-id="${job.id}">Delete</button>
        </div>
      `;

      jobGrid.appendChild(card);
    });
  };

  const openModal = (job = null) => {
    jobModal.classList.remove('hidden');
    if (job) {
      modalTitle.textContent = 'Edit Position';
      document.getElementById('jobId').value = job.id;
      document.getElementById('jobNumber').value = job.job_number || '';
      document.getElementById('jobTitle').value = job.title || '';
      document.getElementById('department').value = job.department || '';
      document.getElementById('dueDate').value = job.due_date ? job.due_date.split('T')[0] : '';
      document.getElementById('employee').value = job.employee || '';
    } else {
      modalTitle.textContent = 'Add Position';
      jobForm.reset();
      document.getElementById('jobId').value = '';
    }
  };

  const closeModal = () => jobModal.classList.add('hidden');

  /* ---------- events ---------- */

  addJobBtn.addEventListener('click', () => openModal());
  cancelModal.addEventListener('click', closeModal);

  jobForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('jobId').value;
    const payload = {
      job_number: document.getElementById('jobNumber').value,
      title: document.getElementById('jobTitle').value,
      department: document.getElementById('department').value,
      due_date: document.getElementById('dueDate').value
    };

    if (id) {
      await fetch(`${API_BASE}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    closeModal();
    fetchJobs();
  });

  // card action buttons
  jobGrid.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    // open hidden file input when user clicks Upload Photo (only shows when Filled)
    if (action === 'trigger-upload') {
      const inputId = e.target.dataset.input;
      const input = document.getElementById(inputId);
      if (input) input.click();
      return;
    }

    const id = e.target.dataset.id;
    if (!id) return;

    if (action === 'edit') {
      const job = jobs.find(j => j.id == id);
      openModal(job);

    } else if (action === 'delete') {
      await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
      fetchJobs();

    } else if (action === 'assign') {
      const name = prompt('Enter employee name:');
      if (name) {
        await fetch(`${API_BASE}/${id}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee: name })
        });
        fetchJobs();
      }

    } else if (action === 'unassign') {
      await fetch(`${API_BASE}/${id}/unassign`, { method: 'POST' });
      fetchJobs();
    }
  });

  // handle actual file selection → upload → patch job with new photo URL
  jobGrid.addEventListener('change', async (e) => {
    if (!e.target.classList.contains('photo-upload')) return;

    const id = e.target.dataset.id;
    const file = e.target.files[0];
    if (!file) return;

    // send file to /api/upload
    const formData = new FormData();
    formData.append('photo', file);

    const uploadRes = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    if (!uploadRes.ok) {
      alert('Upload failed');
      return;
    }

    const { url } = await uploadRes.json();

    // save URL to job
    await fetch(`${API_BASE}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_photo_url: url })
    });

    fetchJobs();
  });

  /* ---------- init ---------- */
  fetchJobs();
});
