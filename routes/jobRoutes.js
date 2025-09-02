// routes/jobRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../models/db');
const authMiddleware = require('../middleware/authMiddleware');

// Small helper: gate by role (expects authMiddleware to set req.user)
function authorizeRoles(...roles) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

/**
 * GET /api/jobs
 * Public (kept public so existing UI keeps working).
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
 * Public (kept public so existing UI keeps working)
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
      [req.params.id]
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
      vals.push(req.params.id);

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
      const { rowCount } = await db.query('DELETE FROM jobs WHERE id = $1', [req.params.id]);
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
 * Roles: admin only
 * Rules:
 *   - candidate must exist
 *   - candidate.status = 'hired'
 *   - candidate.full_name must not already be assigned to another job
 */
router.post(
  '/:id/assign',
  authMiddleware,
  authorizeRoles('admin'),
  async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const candidateId = Number(req.body?.candidate_id);

      if (!jobId || !candidateId) {
        return res.status(400).json({ error: 'job id and candidate_id are required' });
      }

      // 1) fetch candidate & validate hired
      const candQ = await db.query(
        `SELECT id, full_name, status
           FROM candidates
          WHERE id = $1`,
        [candidateId]
      );
      if (!candQ.rowCount) return res.status(404).json({ error: 'candidate not found' });

      const cand = candQ.rows[0];
      if ((cand.status || '').toLowerCase() !== 'hired') {
        return res.status(400).json({ error: 'candidate must be hired to assign' });
      }

      // 2) ensure candidate not already assigned to another job
      const dupQ = await db.query(
        `SELECT id
           FROM jobs
          WHERE TRIM(COALESCE(assigned_to,'')) ILIKE TRIM($1)
            AND id <> $2
          LIMIT 1`,
        [cand.full_name, jobId]
      );
      if (dupQ.rowCount) {
        return res.status(409).json({ error: 'candidate is already assigned to another position' });
      }

      // 3) assign -> set assigned_to, set status to 'Filled' and filled_date if needed
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
        [cand.full_name, jobId]
      );

      if (!upd.rowCount) return res.status(404).json({ error: 'Not found' });
      return res.json(upd.rows[0]);
    } catch (e) {
      console.error('POST /api/jobs/:id/assign failed:', e);
      res.status(500).json({ error: 'DB error' });
    }
  }
);

/**
 * POST /api/jobs/:id/unassign
 * Roles: admin, operations, employment (they can clear it if needed)
 */
router.post(
  '/:id/assign',
  authMiddleware,
  authorizeRoles('admin'),
  async (req, res) => {
    try {
      const jobId = req.params.id;
      const { candidate_id, employee } = req.body || {};

      // 1) Job must exist and not already be filled
      const jobQ = await db.query(
        `SELECT id, assigned_to, status, filled_date FROM jobs WHERE id = $1`,
        [jobId]
      );
      if (!jobQ.rows.length) return res.status(404).json({ error: 'job_not_found' });

      const job = jobQ.rows[0];
      if (String(job.status).toLowerCase() === 'filled' && job.assigned_to) {
        return res.status(409).json({ error: 'job_already_filled' });
      }

      // 2) Resolve candidate
      let cand;
      if (candidate_id) {
        const cq = await db.query(
          `SELECT id, full_name, status
             FROM candidates
            WHERE id = $1`,
          [candidate_id]
        );
        cand = cq.rows[0];
      } else if (employee) {
        const cq = await db.query(
          `SELECT id, full_name, status
             FROM candidates
            WHERE LOWER(full_name) = LOWER($1)
            LIMIT 1`,
          [employee]
        );
        cand = cq.rows[0];
      }

      if (!cand) return res.status(400).json({ error: 'candidate_not_found' });

      // 3) Must be hired
      if (String(cand.status).toLowerCase() !== 'hired') {
        return res.status(409).json({ error: 'candidate_not_hired' });
      }

      // 4) Candidate must not already be assigned elsewhere
      const dupQ = await db.query(
        `SELECT 1
           FROM jobs
          WHERE LOWER(assigned_to) = LOWER($1)
            AND LOWER(status) = 'filled'
          LIMIT 1`,
        [cand.full_name]
      );
      if (dupQ.rowCount) {
        return res.status(409).json({ error: 'candidate_already_assigned' });
      }

      // 5) Perform assignment
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
        [cand.full_name, jobId]
      );

      return res.json(upd.rows[0]);
    } catch (e) {
      console.error('POST /api/jobs/:id/assign failed:', e);
      res.status(500).json({ error: 'DB error' });
    }
  }
);

/**
 * POST /api/jobs/:id/unassign
 * Roles: admin, operations
 */
router.post(
  '/:id/assign',
  authMiddleware,
  authorizeRoles('admin'),
  async (req, res) => {
    try {
      const jobId = req.params.id;
      const { candidate_id, employee } = req.body || {};

      if (!jobId) return res.status(400).json({ error: 'job id is required' });
      if (!candidate_id && !employee) {
        return res.status(400).json({ error: 'candidate_id or employee is required' });
      }

      // 1) Resolve candidate
      let candRow;
      if (candidate_id) {
        const q = `
          SELECT id, full_name, status
          FROM candidates
          WHERE id = $1
          LIMIT 1
        `;
        const r = await db.query(q, [candidate_id]);
        candRow = r.rows[0];
        if (!candRow) return res.status(400).json({ error: 'candidate not found' });
      } else {
        // Fallback by name if older UI still sends { employee }
        const q = `
          SELECT id, full_name, status
          FROM candidates
          WHERE LOWER(full_name) = LOWER($1)
          LIMIT 1
        `;
        const r = await db.query(q, [employee]);
        candRow = r.rows[0];
        if (!candRow) return res.status(400).json({ error: 'candidate not found by name' });
      }

      // 2) Must be hired
      if (String(candRow.status || '').toLowerCase() !== 'hired') {
        return res.status(400).json({ error: 'candidate must be hired before assignment' });
      }

      // 3) Must NOT already be assigned to another job
      const checkAssigned = await db.query(
        `SELECT id FROM jobs WHERE LOWER(assigned_to) = LOWER($1) LIMIT 1`,
        [candRow.full_name]
      );
      if (checkAssigned.rowCount) {
        return res.status(409).json({ error: 'candidate is already filling a position' });
      }

      // 4) Update the job
      const { rows } = await db.query(
        `UPDATE jobs
           SET assigned_to = $1,
               status = 'Filled',
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
        [candRow.full_name, jobId]
      );

      if (!rows.length) return res.status(404).json({ error: 'job not found' });
      res.json(rows[0]);
    } catch (e) {
      console.error('POST /api/jobs/:id/assign failed:', e);
      res.status(500).json({ error: 'DB error' });
    }
  }
);
