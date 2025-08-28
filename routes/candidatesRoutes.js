// routes/candidatesRoutes.js
const express = require('express');
const db = require('../models/db'); // <- your working db.js wrapper
const router = express.Router();

// Allowed statuses (exactly what your UI uses)
const ALLOWED = [
  'pending_pre_employment',
  'pending_onboarding',
  'offer_extended',
  'ready_to_start',
  'hired',
  'did_not_start'
];

// GET all candidates (you can keep this public or gate it at index.js)
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

// CREATE
router.post('/', async (req, res) => {
  try {
    const full_name = (req.body.full_name || req.body.name || '').trim();
    const status = String(req.body.status || '').toLowerCase().trim();
    const email = req.body.email ?? null;
    const phone = req.body.phone ?? null;
    const notes = req.body.notes ?? null;

    if (!full_name) return res.status(400).json({ error: 'full_name is required' });
    if (!ALLOWED.includes(status)) return res.status(400).json({ error: 'invalid status' });

    const { rows } = await db.query(
      `INSERT INTO candidates (full_name, email, phone, status, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, email, phone, status, notes, created_at, updated_at`,
      [full_name, email, phone, status, notes]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('POST /api/candidates error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// UPDATE
router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const fields = [];
    const values = [];
    let i = 1;

    if (typeof req.body.full_name !== 'undefined' || typeof req.body.name !== 'undefined') {
      fields.push(`full_name = $${i++}`);
      values.push((req.body.full_name || req.body.name || '').trim());
    }
    if (typeof req.body.email !== 'undefined') {
      fields.push(`email = $${i++}`);
      values.push(req.body.email);
    }
    if (typeof req.body.phone !== 'undefined') {
      fields.push(`phone = $${i++}`);
      values.push(req.body.phone);
    }
    if (typeof req.body.notes !== 'undefined') {
      fields.push(`notes = $${i++}`);
      values.push(req.body.notes);
    }
    if (typeof req.body.status !== 'undefined') {
      const status = String(req.body.status || '').toLowerCase().trim();
      if (!ALLOWED.includes(status)) return res.status(400).json({ error: 'invalid status' });
      fields.push(`status = $${i++}`);
      values.push(status);
    }

    if (!fields.length) return res.status(400).json({ error: 'no fields to update' });

    values.push(id);
    const { rows } = await db.query(
      `UPDATE candidates
         SET ${fields.join(', ')},
             updated_at = now()
       WHERE id = $${i}
       RETURNING id, full_name, email, phone, status, notes, created_at, updated_at`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(`PATCH /api/candidates/${req.params.id} error:`, err);
    res.status(500).json({ error: 'db error' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM candidates WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(`DELETE /api/candidates/${req.params.id} error:`, err);
    res.status(500).json({ error: 'db error' });
  }
});

module.exports = router;
