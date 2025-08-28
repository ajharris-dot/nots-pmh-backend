// routes/candidatesRoutes.js
const express = require('express');
const db = require('../models/db');
const router = express.Router();

// Acceptable statuses (DB has a CHECK for these)
const ALLOWED = new Set([
  'pending_pre_employment',
  'pending_onboarding',
  'offer_extended',
  'ready_to_start',
  'hired',
  'did_not_start'
]);

const normStatus = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[-\s]+/g, '_') // spaces & hyphens -> underscore
    .trim();

// GET all candidates (newest first)
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
    const full_name = (req.body.full_name || '').trim();
    const status = normStatus(req.body.status);

    if (!full_name) return res.status(400).json({ error: 'full_name is required' });
    if (!ALLOWED.has(status)) return res.status(400).json({ error: 'invalid status' });

    const email = req.body.email ?? null;
    const phone = req.body.phone ?? null;
    const notes = req.body.notes ?? null;

    const { rows } = await db.query(
      `INSERT INTO candidates (full_name, email, phone, status, notes)
       VALUES ($1,$2,$3,$4,$5)
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

    // Build dynamic update list
    const fields = [];
    const values = [];
    let idx = 1;

    if (req.body.full_name !== undefined) {
      fields.push(`full_name = $${idx++}`);
      values.push((req.body.full_name || '').trim());
    }
    if (req.body.email !== undefined) {
      fields.push(`email = $${idx++}`);
      values.push(req.body.email || null);
    }
    if (req.body.phone !== undefined) {
      fields.push(`phone = $${idx++}`);
      values.push(req.body.phone || null);
    }
    if (req.body.status !== undefined) {
      const s = normStatus(req.body.status);
      if (!ALLOWED.has(s)) return res.status(400).json({ error: 'invalid status' });
      fields.push(`status = $${idx++}`);
      values.push(s);
    }
    if (req.body.notes !== undefined) {
      fields.push(`notes = $${idx++}`);
      values.push(req.body.notes || null);
    }

    if (!fields.length) return res.status(400).json({ error: 'no fields to update' });

    values.push(id);
    const { rows } = await db.query(
      `UPDATE candidates
         SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${idx}
       RETURNING id, full_name, email, phone, status, notes, created_at, updated_at`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /api/candidates/:id error:', err);
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
    console.error('DELETE /api/candidates/:id error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

module.exports = router;
