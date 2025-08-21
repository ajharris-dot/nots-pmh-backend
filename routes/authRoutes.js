// routes/authRoutes.js
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../models/db'); // <- matches your project structure

const router = express.Router();

/**
 * POST /api/auth/register
 * Body: { email, password, name?, role? }
 * Creates a user and logs them in (session).
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }

    const exists = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length) {
      return res.status(409).json({ error: 'email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, COALESCE($4,'user'))
       RETURNING id, email, name, role`,
      [email, hash, name || null, role || null]
    );

    const user = rows[0];
    // establish session
    req.session.user = user;
    res.status(201).json({ ok: true, user });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Verifies credentials and stores user in session.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }

    const { rows } = await db.query(
      'SELECT id, email, name, role, password_hash FROM users WHERE email = $1',
      [email]
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const user = { id: u.id, email: u.email, name: u.name, role: u.role };
    req.session.user = user;
    res.json({ ok: true, user });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

/**
 * POST /api/auth/logout
 * Destroys the session.
 */
router.post('/logout', (req, res) => {
  req.session?.destroy(() => {
    res.json({ ok: true });
  });
});

/**
 * GET /api/auth/me
 * Returns current session user (if any).
 */
router.get('/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ authenticated: true, user: req.session.user });
  }
  return res.json({ authenticated: false, user: null });
});

module.exports = router;
