// routes/jobRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../models/db');
const authMiddleware = require('../middleware/authMiddleware');

/* ---------- Helpers ---------- */
// routes/jobRoutes.js
function authorizeRoles(...roles) {
  const allowed = roles.map(r => String(r).trim().toLowerCase());
  return (req, res, next) => {
    const role = String(req.user?.role || '').trim().toLowerCase();
    if (!role || !allowed.includes(role)) {
      return res.status(403).json({ error: 'forbidden', who: req.user?.email || null, role });
    }
    next();
  };
}

/**
 * GET /api/jobs
 * (index.js currently protects /api/jobs with auth; this handler itself is auth-agnostic)
 * Optional query params:
 *   - status=Open|Filled|...(case-insensitive)
 *   - limit (default 10000, max 20000)
 *   - offset (default 0)
 *
 * Aliases returned to match frontend:
 *   description -> job_number
 *   client      -> department
 *   assigned_to -> employee
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '10000', 10), 20000);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
    const status = req.query.status;

    const params = [];
    let q = `
      SELECT
        id,
        title,
        description AS job_number,
        client      AS department,
        assigned_to AS employee,
        employee_photo_url,
        due_date,
        filled_date,
        status,
        created_at
      FROM jobs
    `;

    if (status && String(status).toLowerCase() !== 'all') {
      q += ` WHERE LOWER(status) = LOWER($1)`;
      params.push(status);
    }

    q += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await db.query(q, params);
    res.json(rows);
  } catch (e) {
    console.error('GET /api/jobs failed:', e);
    res.status(500).json({ error: 'DB error' });
  }
});

/**
 * GET /api/jobs/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `
      SELECT
        id,
        title,
        description AS job_number,
        client      AS department,
        assigned_to AS employee,
        employee_photo_url,
        due_date,
        filled_date,
        status,
        created_at
      FROM jobs
      WHERE id = $1
      `,
      [req.params.id] // keep as string (UUID-safe)
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('GET /api/jobs/:id failed:', e);
    res.status(500).json({ error: 'DB error' });
  }
});

/**
 * POST /api/jobs
 * Create a position
 * Roles: admin, operations
 */
router.post(
  '/',
  authMiddleware,
  authorizeRoles('admin', 'operations'),
  async (req, res) => {
    const { title, job_number, department, due_date, status, filled_date } = req.body || {};
    try {
      const effectiveStatus = status || 'Open';
      const { rows } = await db.query(
        `INSERT INTO jobs (title, description, client, due_date, filled_date, assigned_to, status)
         VALUES ($1, $2, $3, NULLIF($4,'')::date, NULLIF($5,'')::date, NULL, $6)
         RETURNING
           id,
           title,
           description AS job_number,
           client      AS department,
           assigned_to AS employee,
           employee_photo_url,
           due_date,
           filled_date,
           status,
           created_at`,
        [title, job_number || null, department || null, due_date ?? null, filled_date ?? null, effectiveStatus]
      );
      res.status(201).json(rows[0]);
    } catch (e) {
      console.error('POST /api/jobs failed:', e);
      res.status(500).json({ error: 'DB error' });
    }
  }
);

/**
 * PATCH /api/jobs/:id
 * General edits to a job
 * Roles: admin, operations
 */
router.patch(
  '/:id',
  authMiddleware,
  authorizeRoles('admin', 'operations'),
  async (req, res) => {
    try {
      const {
        title,
        job_number,
        department,
        due_date,
        filled_date,
        employee,
        status,
        employee_photo_url,
      } = req.body || {};

      const fields = {
        title,
        description: job_number,  // job_number -> description
        client: department,       // department -> client
        due_date,
        filled_date,
        assigned_to: employee,    // employee -> assigned_to
        status,
        employee_photo_url,
      };

      const set = [];
      const vals = [];
      let i = 1;
      for (const [col, val] of Object.entries(fields)) {
        if (val !== undefined) {
          set.push(`${col} = $${i++}`);
          vals.push(val);
        }
      }

      if (!set.length) return res.status(400).json({ error: 'No fields provided' });
      vals.push(req.params.id); // UUID-safe

      const { rows } = await db.query(
        `UPDATE jobs SET ${set.join(', ')} WHERE id = $${i}
         RETURNING
           id,
           title,
           description AS job_number,
           client      AS department,
           assigned_to AS employee,
           employee_photo_url,
           due_date,
           filled_date,
           status,
           created_at`,
        vals
      );

      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch (e) {
      console.error('PATCH /api/jobs/:id failed:', e);
      res.status(500).json({ error: 'DB error' });
    }
  }
);

/**
 * DELETE /api/jobs/:id
 * Roles: admin, operations
 */
router.delete(
  '/:id',
  authMiddleware,
  authorizeRoles('admin', 'operations'),
  async (req, res) => {
    try {
      const { rowCount } = await db.query('DELETE FROM jobs WHERE id = $1', [req.params.id]); // UUID-safe
      if (!rowCount) return res.status(404).json({ error: 'Not found' });
      res.status(204).send();
    } catch (e) {
      console.error('DELETE /api/jobs/:id failed:', e);
      res.status(500).json({ error: 'DB error' });
    }
  }
);

/**
 * POST /api/jobs/:id/assign
 * Body: { candidate_id }
 * Roles (via index.js): admin only
 * Rules:
 *   - job exists and is not already filled with a person
 *   - candidate exists & status = 'hired'
 *   - candidate.full_name is not already assigned to another job
 */
router.post(
  '/:id/assign',
  authMiddleware,
  authorizeRoles('admin', 'operations'),
  async (req, res) => {
    try {
      const jobId = req.params.id; // keep as string (UUID-safe)
      const candidateIdRaw = req.body?.candidate_id;

      if (!jobId || candidateIdRaw == null) {
        return res.status(400).json({ error: 'job id and candidate_id are required' });
      }
      const candidateId = parseInt(candidateIdRaw, 10);
      if (Number.isNaN(candidateId)) {
        return res.status(400).json({ error: 'candidate_id must be an integer' });
      }

      // 1) Job must exist & not already filled with someone
      const jobQ = await db.query(
        `SELECT id, assigned_to, status, filled_date FROM jobs WHERE id = $1`,
        [jobId]
      );
      if (!jobQ.rows.length) return res.status(404).json({ error: 'job_not_found' });

      const job = jobQ.rows[0];
      if (String(job.status || '').toLowerCase() === 'filled' && (job.assigned_to || '').trim()) {
        return res.status(409).json({ error: 'job_already_filled' });
      }

      // 2) Candidate must exist & be hired
      const candQ = await db.query(
        `SELECT id, full_name, status FROM candidates WHERE id = $1`,
        [candidateId]
      );
      if (!candQ.rows.length) return res.status(404).json({ error: 'candidate_not_found' });

      const cand = candQ.rows[0];
      if (String(cand.status || '').toLowerCase() !== 'hired') {
        return res.status(409).json({ error: 'candidate_not_hired' });
      }

      // 3) Candidate must not already be assigned elsewhere (by name)
      const dupQ = await db.query(
        `SELECT 1 FROM jobs
          WHERE TRIM(COALESCE(assigned_to, '')) <> ''
            AND LOWER(assigned_to) = LOWER($1)
          LIMIT 1`,
        [cand.full_name || '']
      );
      if (dupQ.rowCount) {
        return res.status(409).json({ error: 'candidate_already_assigned' });
      }

      // 4) Assign to this job
      const upd = await db.query(
        `UPDATE jobs
            SET assigned_to = $1,
                status      = 'Filled',
                filled_date = COALESCE(filled_date, CURRENT_DATE)
          WHERE id = $2
          RETURNING
            id,
            title,
            description AS job_number,
            client      AS department,
            assigned_to AS employee,
            employee_photo_url,
            due_date,
            filled_date,
            status,
            created_at`,
        [cand.full_name || '', jobId]
      );

      if (!upd.rows.length) return res.status(404).json({ error: 'job_not_found_after_update' });
      return res.json(upd.rows[0]);
    } catch (e) {
      console.error('POST /api/jobs/:id/assign failed:', e);
      res.status(500).json({ error: 'DB error' });
    }
  }
);

/**
 * POST /api/jobs/:id/unassign
 * Roles (via index.js): admin, operations
 */
router.post(
  '/:id/unassign',
  authMiddleware,
  authorizeRoles('admin', 'operations'),
  async (req, res) => {
    try {
      const jobId = req.params.id; // UUID-safe
      const { rows } = await db.query(
        `UPDATE jobs
            SET assigned_to = NULL,
                status      = 'Open',
                filled_date = NULL
          WHERE id = $1
          RETURNING
            id,
            title,
            description AS job_number,
            client      AS department,
            assigned_to AS employee,
            employee_photo_url,
            due_date,
            filled_date,
            status,
            created_at`,
        [jobId]
      );

      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch (e) {
      console.error('POST /api/jobs/:id/unassign failed:', e);
      res.status(500).json({ error: 'DB error' });
    }
  }
);

// routes/jobRoutes.js
router.get('/eligible-candidates',
  authMiddleware,
  authorizeRoles('admin', 'operations'),
  async (req, res) => {
    // return just hired, unassigned names/ids
    // (use the same query rules you enforce in /assign)
  }
);


module.exports = router;
