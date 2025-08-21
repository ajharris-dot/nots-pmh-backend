// routes/authRoutes.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../models/db'); // keep consistent with the rest of the app

const router = express.Router();

// --- helpers ---
function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase();
}
function signToken(payload) {
  return jwt.sign(payload, process.env.SESSION_SECRET, { expiresIn: '8h' });
}
function pickUserRow(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}
const ALLOWED_ROLES = new Set(['admin', 'user']);

/**
 * TEMP DEBUG: GET /api/auth/debug
 * Confirms DB connectivity and shows users table columns.
 * Remove after debugging.
 */
router.get('/debug', async (_req, res) => {
  try {
    const ping = await db.query('SELECT NOW() AS now');
    const cols = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
      ORDER BY ordinal_position
    `);
    res.json({ ok: true, now: ping.rows[0]?.now, users_columns: cols.rows });
  } catch (e) {
    console.error('auth debug error:', e);
    res.status(500).json({ ok: false, detail: String(e?.message || e) });
  }
});

/**
 * POST /api/auth/register
 * Body: { email, password, name?, role? }
 */
router.post('/register', async (req, res) => {
  try {
    let { email, password, name, role } = req.body || {};
    email = normalizeEmail(email);
    name = name ? String(name).trim() : null;
    role = role ? String(role).trim().toLowerCase() : 'user';

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }
    if (!ALLOWED_ROLES.has(role)) {
      return res.status(400).json({ error: 'invalid role' });
    }

    // ensure unique email
    const exists = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length) {
      return res.status(409).json({ error: 'email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);

    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role`,
      [email, hash, name, role]
    );

    const user = pickUserRow(rows[0]);
    const token = signToken({ id: user.id, role: user.role });

    res.status(201).json({ message: 'User registered successfully', user, token });
  } catch (err) {
    console.error('register error:', err);
    // TEMP: include detail for debugging
    res.status(500).json({ error: 'server error', detail: String(err?.message || err) });
  }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }

    const { rows } = await db.query(
      'SELECT id, email, name, role, password_hash FROM users WHERE email = $1',
      [email]
    );
    if (!rows.length) return res.status(401).json({ error: 'invalid credentials' });

    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    const user = pickUserRow(u);
    const token = signToken({ id: user.id, role: user.role });

    res.json({ message: 'Logged in', user, token });
  } catch (err) {
    console.error('login error:', err);
    // TEMP: include detail for debugging
    res.status(500).json({ error: 'server error', detail: String(err?.message || err) });
  }
});

/**
 * GET /api/auth/me
 * Reads Bearer token, returns current user (id/email/name/role) if valid.
 */
router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.json({ authenticated: false, user: null });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.SESSION_SECRET);
    } catch {
      return res.json({ authenticated: false, user: null });
    }

    const { rows } = await db.query(
      'SELECT id, email, name, role FROM users WHERE id = $1',
      [decoded.id]
    );
    if (!rows.length) return res.json({ authenticated: false, user: null });

    res.json({ authenticated: true, user: pickUserRow(rows[0]) });
  } catch (err) {
    console.error('me error:', err);
    // TEMP: include detail for debugging
    res.status(500).json({ error: 'server error', detail: String(err?.message || err) });
  }
});

module.exports = router;
