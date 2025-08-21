// routes/authRoutes.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../models/db'); // <-- match the rest of your app

const router = express.Router();

/**
 * POST /api/auth/register
 * body: { email, password, name?, role? }
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }

    // ensure unique email
    const exists = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length) {
      return res.status(409).json({ error: 'email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);

    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, COALESCE($4, 'user'))
       RETURNING id, email, name, role`,
      [email, hash, name || null, role || null]
    );

    const user = rows[0];

    // Sign a JWT so the client can be logged in right away
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.SESSION_SECRET,
      { expiresIn: '8h' }
    );

    res.status(201).json({ message: 'User registered successfully', user, token });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

/**
 * POST /api/auth/login
 * body: { email, password }
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
    if (!rows.length) return res.status(401).json({ error: 'invalid credentials' });

    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    const user = { id: u.id, email: u.email, name: u.name, role: u.role };
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.SESSION_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ message: 'Logged in', user, token });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
