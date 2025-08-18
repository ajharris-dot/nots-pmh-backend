const API = '/api/jobs';
const PLACEHOLDER = './placeholder-v2.png?v=20250814'; // cache-busted placeholder

let ALL_JOBS = [];
let CURRENT_FILTER = 'all';

document.addEventListener('DOMContentLoaded', () => {
  const jobGrid = document.getElementById('jobGrid');
  const addJobBtn = document.getElementById('addJobBtn');
  const refreshBtn = document.getElementById('refresh');
  const search = document.getElementById('search');

  const jobModal = document.getElementById('jobModal');
  const modalTitle = document.getElementById('modalTitle');
  const jobForm = document.getElementById('jobForm');
  const cancelModal = document.getElementById('cancelModal');

  /* ====== STEP 2: Assign modal elements & helpers ====== */
  const assignModal  = document.getElementById('assignModal');
  const assignForm   = document.getElementById('assignForm');
  const cancelAssign = document.getElementById('cancelAssign');
  const assignInput  = document.getElementById('assignEmployeeName');

  let ASSIGN_JOB_ID = null;

  function openAssignModal(jobId){
    ASSIGN_JOB_ID = jobId;
    assignForm?.reset();
    assignModal?.classList.remove('hidden');
    setTimeout(() => assignInput?.focus(), 50);
  }
  function closeAssignModal(){
    ASSIGN_JOB_ID = null;
    assignModal?.classList.add('hidden');
  }
  /* ================================================ */

  /* Rename the modal label from "Due Date" -> "Filled Date" (UI only) */
  {
    const dueInput = document.getElementById('dueDate');
    if (dueInput) {
      const labelEl = dueInput.closest('label');
      if (labelEl) {
        const firstNode = labelEl.childNodes[0];
        if (firstNode && firstNode.nodeType === Node.TEXT_NODE) {
          firstNode.textContent = 'Filled Date ';
        } else {
          labelEl.insertBefore(document.createTextNode('Filled Date '), labelEl.firstChild);
        }
        dueInput.setAttribute('aria-label', 'Filled Date');
      }
    }
  }

  /* ------------ helpers ------------ */
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

  function updateTabCounts() {
    const allTab    = findTab('all');
    const openTab   = findTab('open');
    const filledTab = findTab('filled');
    if (!allTab || !openTab || !filledTab) return;

    const allCount    = ALL_JOBS.length;
    const openCount   = ALL_JOBS.filter(j => (j.status || '').toLowerCase() === 'open').length;
    const filledCount = ALL_JOBS.filter(isFilled).length;

    allTab.textContent    = `All (${allCount})`;
    openTab.textContent   = `Open (${openCount})`;
    filledTab.textContent = `Filled (${filledCount})`;
  }

  /* ------------ data ------------ */
  async function loadJobs() {
    const qs = CURRENT_FILTER === 'all' ? '' : `?status=${encodeURIComponent(CURRENT_FILTER)}`;
    try {
      const res = await fetch(`${API}${qs}`);
      if (!res.ok) {
        const msg = await res.text().catch(()=>'');
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
      console.log(`[debug] Loaded ${ALL_JOBS.length} jobs`, ALL_JOBS[0] || {});
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

  /* ------------ UI render ------------ */
  function render() {
    try {
      const q = (search?.value || '').trim().toLowerCase();
      if (!jobGrid) return;
      jobGrid.innerHTML = '';

      const current = String(CURRENT_FILTER || 'all').toLowerCase();
      const filtered = ALL_JOBS.filter(j => {
        const text = `${j.job_number || ''} ${j.title || ''} ${j.department || ''}`.toLowerCase();
        const statusOk = current === 'all' || String(j.status || '').toLowerCase() === current;
        return statusOk && (!q || text.includes(q));
      });

      if (!filtered.length) {
        jobGrid.innerHTML = `<div style="color:#6b7280">No positions</div>`;
        updateTabCounts();
        return;
      }

      filtered.forEach(job => {
        const card = document.createElement('div');
        card.className = 'job-card';

        const statusBadge = isFilled(job)
          ? `<span class="badge badge-filled">Filled</span>`
          : `<span class="badge badge-open">Open</span>`;

        const filledDateValue = job.filled_date
          ? (/^\d{4}-\d{2}-\d{2}$/.test(job.filled_date)
              ? job.filled_date
              : String(job.filled_date).split('T')[0])
          : '';

        const assignedAt = job.assigned_at
          ? (/^\d{4}-\d{2}-\d{2}$/.test(job.assigned_at) ? job.assigned_at : new Date(job.assigned_at).toLocaleDateString())
          : '';

        const inputId = `file_${job.id}`;
        const hasEmployee = !!(job.employee && String(job.employee).trim().length);

        card.innerHTML = `
          <div class="photo-container">
            <img
              class="employee-photo"
              src="${hasEmployee ? (job.employee_photo_url || PLACEHOLDER) : PLACEHOLDER}"
              alt="Employee Photo"
            />
            <input 
              type="file" 
              id="${inputId}" 
              class="photo-input" 
              data-id="${job.id}" 
              accept="image/*" 
              style="display:none" 
            />
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
            ${job.assigned_at ? `<div class="meta-row"><strong>Assigned:</strong> ${assignedAt || job.assigned_at}</div>` : ''}
            <div class="meta-row"><strong>Employee:</strong> ${job.employee || 'Unassigned'}</div>
          </div>


          <div class="card-actions">
            ${isFilled(job)
              ? `<button class="upload-btn" data-action="trigger-upload" data-input="${inputId}">Upload Photo</button>
                 <button class="secondary" data-action="unassign" data-id="${job.id}">Unassign</button>`
              : `<button class="secondary" data-action="assign" data-id="${job.id}">Assign</button>`
            }
            <button class="secondary" data-action="edit" data-id="${job.id}">Edit</button>
            <button class="danger" data-action="delete" data-id="${job.id}">Delete</button>
          </div>
        `;

        const img = card.querySelector('.photo-container img');
        if (img) {
          img.addEventListener('error', () => { img.src = PLACEHOLDER; });
        }

        jobGrid.appendChild(card);
      });

      updateTabCounts();
    } catch (err) {
      console.error('Render error:', err);
      if (jobGrid) jobGrid.innerHTML = `<div style="color:#b91c1c">Error loading jobs. Check console.</div>`;
    }
  }

  /* ------------ modal helpers ------------ */
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
    }
  }
  function closeModal() { jobModal.classList.add('hidden'); }

  /* ------------ events ------------ */
  document.querySelectorAll('.filters .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filters .tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      CURRENT_FILTER = String(btn.dataset.filter || 'all').toLowerCase();
      loadJobs();
    });
  });

  addJobBtn?.addEventListener('click', () => {
    openModal();
    setTimeout(() => {
      document.getElementById('jobNumber')?.focus();
    }, 50);
  });
  cancelModal?.addEventListener('click', closeModal);
  refreshBtn?.addEventListener('click', loadJobs);
  search?.addEventListener('input', render);

  // ====== STEP 3: Assign modal listeners ======
  assignForm?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = assignInput?.value?.trim();
    if (!name || !ASSIGN_JOB_ID) return;

    await fetch(`${API}/${ASSIGN_JOB_ID}/assign`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ employee: name })
    });

    closeAssignModal();
    loadJobs();
  });
  cancelAssign?.addEventListener('click', closeAssignModal);
  // ===========================================

  // Create / Update
  jobForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('jobId').value;
    const rawDate = document.getElementById('dueDate').value;
    const payload = {
      job_number: document.getElementById('jobNumber').value,
      title: document.getElementById('jobTitle').value,
      department: document.getElementById('department').value,
      filled_date: rawDate ? rawDate : null,
      due_date: null
    };

    if (id) {
      await fetch(`${API}/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      await fetch(`${API}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    closeModal();
    loadJobs();
  });

  // Card button clicks
  const jobGridClick = async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    if (action === 'trigger-upload') {
      const input = document.getElementById(e.target.dataset.input);
      if (input) input.click();
      return;
    }

    const id = e.target.dataset.id;
    if (!id) return;

    if (action === 'edit') {
      const job = ALL_JOBS.find(j => j.id == id);
      openModal(job);

    } else if (action === 'delete') {
      await fetch(`${API}/${id}`, { method: 'DELETE' });
      loadJobs();

    } else if (action === 'assign') {
      /* ====== STEP 4: open the clean Assign modal instead of prompt() ====== */
      openAssignModal(id);
      /* ===================================================================== */

    } else if (action === 'unassign') {
      await fetch(`${API}/${id}/unassign`, { method: 'POST' });
      loadJobs();
    }
  };
  jobGrid?.addEventListener('click', jobGridClick);

  // File input change → upload → patch job
  const jobGridChange = async (e) => {
    if (!e.target.classList.contains('photo-input')) return;
    const id = e.target.dataset.id;
    const file = e.target.files[0];
    if (!file) return;

    const fd = new FormData();
    fd.append('photo', file);
    const up = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!up.ok) { alert('Upload failed'); return; }
    const { url } = await up.json();

    await fetch(`${API}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_photo_url: url })
    });
    loadJobs();
  };
  jobGrid?.addEventListener('change', jobGridChange);

  /* init */
  loadJobs();
});
