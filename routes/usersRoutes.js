// routes/usersRoutes.js
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../models/db');

const router = express.Router();

const ALLOWED_ROLES = new Set(['admin', 'employment', 'operations', 'manager', 'user']);

// Utility
const pickUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role
});

/**
 * GET /api/users
 * Admin only (enforced by index.js middleware)
 */
router.get('/', async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, email, name, role
       FROM users
       ORDER BY created_at DESC, id DESC`
    );
    res.json(rows.map(pickUser));
  } catch (err) {
    console.error('GET /api/users failed:', err);
    res.status(500).json({ error: 'server error' });
  }
});

/**
 * GET /api/users/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, email, name, role FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(pickUser(rows[0]));
  } catch (err) {
    console.error('GET /api/users/:id failed:', err);
    res.status(500).json({ error: 'server error' });
  }
});

/**
 * POST /api/users
 * body: { email, name?, role, password }
 */
router.post('/', async (req, res) => {
  try {
    let { email, name, role, password } = req.body || {};
    email = String(email || '').trim().toLowerCase();
    name = name ? String(name).trim() : null;
    role = role ? String(role).trim().toLowerCase() : 'user';

    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });
    if (!ALLOWED_ROLES.has(role)) return res.status(400).json({ error: 'invalid role' });

    // Unique email check
    const exists = await db.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'email already exists' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role`,
      [email, hash, name, role]
    );
    res.status(201).json(pickUser(rows[0]));
  } catch (err) {
    console.error('POST /api/users failed:', err);
    res.status(500).json({ error: 'server error' });
  }
});

/**
 * PATCH /api/users/:id
 * body: { email?, name?, role?, password? }
 */
router.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

    let { email, name, role, password } = req.body || {};
    const updates = [];
    const vals = [];
    let i = 1;

    if (email !== undefined) {
      email = String(email || '').trim().toLowerCase();
      if (!email) return res.status(400).json({ error: 'email cannot be empty' });
      // Check unique email (excluding this user)
      const dupe = await db.query(`SELECT 1 FROM users WHERE email = $1 AND id <> $2`, [email, id]);
      if (dupe.rows.length) return res.status(409).json({ error: 'email already in use' });
      updates.push(`email = $${i++}`); vals.push(email);
    }

    if (name !== undefined) {
      name = name ? String(name).trim() : null;
      updates.push(`name = $${i++}`); vals.push(name);
    }

    if (role !== undefined) {
      role = String(role || '').trim().toLowerCase();
      if (!ALLOWED_ROLES.has(role)) return res.status(400).json({ error: 'invalid role' });
      updates.push(`role = $${i++}`); vals.push(role);
    }

    if (password !== undefined) {
      if (password && String(password).length < 8) {
        return res.status(400).json({ error: 'password must be at least 8 characters' });
      }
      const hash = password ? await bcrypt.hash(String(password), 10) : null;
      if (hash) {
        updates.push(`password_hash = $${i++}`); vals.push(hash);
      }
    }

    if (!updates.length) return res.status(400).json({ error: 'no fields to update' });

    vals.push(id);
    const { rows } = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${i}
       RETURNING id, email, name, role`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(pickUser(rows[0]));
  } catch (err) {
    console.error('PATCH /api/users/:id failed:', err);
    res.status(500).json({ error: 'server error' });
  }
});

/**
 * DELETE /api/users/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

    // Optional: prevent deleting yourself
    if (req.user && req.user.id === id) {
      return res.status(400).json({ error: 'cannot delete yourself' });
    }

    const result = await db.query(`DELETE FROM users WHERE id = $1`, [id]);
    if (!result.rowCount) return res.status(404).json({ error: 'not found' });
    res.status(204).send();
  } catch (err) {
    console.error('DELETE /api/users/:id failed:', err);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
