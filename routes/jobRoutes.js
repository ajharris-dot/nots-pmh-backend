// routes/jobRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../models/db');
const authMiddleware = require('../middleware/authMiddleware'); // ✅ add this

/**
 * GET /api/jobs
 * Optional query params:
 *   - status=Open|Filled|...(case-insensitive)
 *   - limit (default 10000, max 20000)
 *   - offset (default 0)
 *
 * NOTE: We return aliased fields to match the frontend:
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
 * Body: { title, job_number, department, filled_date?, status? }
 * (We still accept due_date for compatibility; your UI sends null.)
 * 🔒 Protected
 */
router.post('/', authMiddleware, async (req, res) => {
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
});

/**
 * PATCH /api/jobs/:id
 * Partial update; same aliases as above.
 * 🔒 Protected
 */
router.patch('/:id', authMiddleware, async (req, res) => {
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
      filled_date,              // user-controlled
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
});

/**
 * DELETE /api/jobs/:id
 * 🔒 Protected
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM jobs WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (e) {
    console.error('DELETE /api/jobs/:id failed:', e);
    res.status(500).json({ error: 'DB error' });
  }
});

/**
 * POST /api/jobs/:id/assign
 * Body: { employee }
 * Sets status = 'Filled' and sets filled_date only if currently NULL.
 * 🔒 Protected
 */
router.post('/:id/assign', authMiddleware, async (req, res) => {
  try {
    const { employee } = req.body || {};
    if (!employee) return res.status(400).json({ error: 'employee required' });

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
      [employee, req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('POST /api/jobs/:id/assign failed:', e);
    res.status(500).json({ error: 'DB error' });
  }
});

/**
 * POST /api/jobs/:id/unassign
 * Clears employee and filled_date; sets status Open.
 * 🔒 Protected
 */
router.post('/:id/unassign', authMiddleware, async (req, res) => {
  try {
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
      [req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('POST /api/jobs/:id/unassign failed:', e);
    res.status(500).json({ error: 'DB error' });
  }
});

module.exports = router;
