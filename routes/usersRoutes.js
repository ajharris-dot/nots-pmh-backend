// routes/usersRoutes.js
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../models/db');

const router = express.Router();

const ALLOWED_ROLES = new Set(['admin', 'employment', 'operations', 'manager', 'user']);
const toUser = (r) => ({ id: r.id, email: r.email, name: r.name, role: r.role });

// GET /api/users  (admin only; auth/role checks are on the mount)
router.get('/', async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, email, name, role
         FROM users
        ORDER BY email ASC`
    );
    res.json(rows.map(toUser));
  } catch (e) {
    console.error('GET /api/users error:', e);
    res.status(500).json({ error: 'server error', detail: e.message });
  }
});

// POST /api/users  { email, name?, role, password }
router.post('/', async (req, res) => {
  try {
    let { email, name, role, password } = req.body || {};
    email = String(email || '').trim().toLowerCase();
    name = name ? String(name).trim() : null;
    role = String(role || 'user').trim().toLowerCase();

    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    if (!ALLOWED_ROLES.has(role)) return res.status(400).json({ error: 'invalid role' });

    const exists = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'email already exists' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role`,
      [email, hash, name, role]
    );
    res.status(201).json(toUser(rows[0]));
  } catch (e) {
    console.error('POST /api/users error:', e);
    res.status(500).json({ error: 'server error', detail: e.message });
  }
});

// PATCH /api/users/:id  { email?, name?, role?, password? }
router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    let { email, name, role, password } = req.body || {};

    const fields = [];
    const vals = [];
    let i = 1;

    if (email !== undefined) {
      const e = String(email || '').trim().toLowerCase();
      if (!e) return res.status(400).json({ error: 'email cannot be empty' });
      const dup = await db.query('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [e, id]);
      if (dup.rows.length) return res.status(409).json({ error: 'email already exists' });
      fields.push(`email = $${i++}`); vals.push(e);
    }
    if (name !== undefined) {
      const n = name ? String(name).trim() : null;
      fields.push(`name = $${i++}`); vals.push(n);
    }
    if (role !== undefined) {
      const r = String(role).trim().toLowerCase();
      if (!ALLOWED_ROLES.has(r)) return res.status(400).json({ error: 'invalid role' });
      fields.push(`role = $${i++}`); vals.push(r);
    }
    if (password !== undefined) {
      if (!password) return res.status(400).json({ error: 'password cannot be empty' });
      const hash = await bcrypt.hash(String(password), 10);
      fields.push(`password_hash = $${i++}`); vals.push(hash);
    }

    if (!fields.length) return res.status(400).json({ error: 'no fields provided' });

    vals.push(id);
    const { rows } = await db.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${i}
       RETURNING id, email, name, role`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(toUser(rows[0]));
  } catch (e) {
    console.error('PATCH /api/users/:id error:', e);
    res.status(500).json({ error: 'server error', detail: e.message });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    res.status(204).send();
  } catch (e) {
    console.error('DELETE /api/users/:id error:', e);
    res.status(500).json({ error: 'server error', detail: e.message });
  }
});

module.exports = router;
