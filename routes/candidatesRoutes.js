// routes/candidatesRoutes.js
const express = require('express');
const db = require('../models/db'); // <-- IMPORTANT: matches your db.js export
const router = express.Router();

/**
 * Allowed pipeline statuses (enforced in DB with CHECK too)
 */
const ALLOWED = new Set([
  'pending pre-employment',
  'pending onboarding',
  'offer extended',
  'ready to start',
  'hired',
  'did not start',
]);

// GET /api/candidates
router.get('/', async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, full_name, email, phone, status, notes, created_at, updated_at
       FROM candidates
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/candidates error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// POST /api/candidates
router.post('/', async (req, res) => {
  try {
    const { full_name, email = null, phone = null, status, notes = null } = req.body || {};

    if (!full_name || !status) {
      return res.status(400).json({ error: 'full_name and status are required' });
    }
    if (!ALLOWED.has(String(status).toLowerCase())) {
      return res.status(400).json({ error: 'invalid status' });
    }

    const { rows } = await db.query(
      `INSERT INTO candidates (full_name, email, phone, status, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, email, phone, status, notes, created_at, updated_at`,
      [full_name, email, phone, status.toLowerCase(), notes]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('POST /api/candidates error:', err); // will show the real PG error in server logs
    res.status(500).json({ error: 'db error' });
  }
});

// PATCH /api/candidates/:id
router.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const fields = [];
    const values = [];
    let i = 1;

    const add = (col, val) => { fields.push(`${col} = $${i++}`); values.push(val); };

    if (req.body.full_name != null) add('full_name', req.body.full_name);
    if (req.body.email != null)     add('email', req.body.email);
    if (req.body.phone != null)     add('phone', req.body.phone);
    if (req.body.notes != null)     add('notes', req.body.notes);

    if (req.body.status != null) {
      const st = String(req.body.status).toLowerCase();
      if (!ALLOWED.has(st)) return res.status(400).json({ error: 'invalid status' });
      add('status', st);
    }

    if (!fields.length) return res.status(400).json({ error: 'no fields' });

    // updated_at auto-updates via trigger, but we can also set it explicitly if you prefer
    const sql = `UPDATE candidates SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`;
    values.push(id);

    const { rows } = await db.query(sql, values);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /api/candidates/:id error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// DELETE /api/candidates/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const { rowCount } = await db.query('DELETE FROM candidates WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/candidates/:id error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

module.exports = router;
