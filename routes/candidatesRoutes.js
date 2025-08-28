const express = require('express');
const db = require('../models/db');
const router = express.Router();

// GET all candidates
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM candidates ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

// POST new candidate
router.post('/', async (req, res) => {
  const { name, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  try {
    const { rows } = await db.query(
      'INSERT INTO candidates (name, status) VALUES ($1, $2) RETURNING *',
      [name, status || 'pending pre-employment']
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

// PATCH update status
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status required' });

  try {
    const { rows } = await db.query(
      'UPDATE candidates SET status=$1, updated_at=now() WHERE id=$2 RETURNING *',
      [status, id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

// DELETE candidate
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM candidates WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

module.exports = router;
