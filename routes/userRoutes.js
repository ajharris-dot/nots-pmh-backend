// routes/userRoutes.js
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../models/db');

const router = express.Router();

// List users (admin)
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, email, name, role FROM users ORDER BY created_at DESC, id DESC'
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/users error:', e);
    res.status(500).json({ error: 'server error' });
  }
});

// Create user (admin)
router.post('/', async (req, res) => {
  try {
    let { email, name, role, password } = req.body || {};
    email = String(email || '').trim().toLowerCase();
    name = name ? String(name).trim() : null;
    role = role ? String(role).trim().toLowerCase() : 'user';

    if (!email) return res.status(400).json({ error: 'email required' });
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    // unique email
    const exists = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role`,
      [email, hash, name, role]
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('POST /api/users error:', e);
    res.status(500).json({ error: 'server error' });
  }
});

// Update user (admin) — optional password change
router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { email, name, role, password } = req.body || {};

    // build dynamic update
    const set = [];
    const vals = [];
    let i = 1;

    if (email !== undefined) {
      set.push(`email = $${i++}`);
      vals.push(String(email).trim().toLowerCase());
    }
    if (name !== undefined) {
      set.push(`name = $${i++}`);
      vals.push(name ? String(name).trim() : null);
    }
    if (role !== undefined) {
      set.push(`role = $${i++}`);
      vals.push(String(role).trim().toLowerCase());
    }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      set.push(`password_hash = $${i++}`);
      vals.push(hash);
    }
    if (!set.length) return res.status(400).json({ error: 'no fields to update' });

    vals.push(id);
    const { rows } = await db.query(
      `UPDATE users SET ${set.join(', ')} WHERE id = $${i}
       RETURNING id, email, name, role`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('PATCH /api/users/:id error:', e);
    res.status(500).json({ error: 'server error' });
  }
});

// Delete user (admin)
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    res.status(204).send();
  } catch (e) {
    console.error('DELETE /api/users/:id error:', e);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
