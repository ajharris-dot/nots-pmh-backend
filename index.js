// index.js
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// basic hardening + parsing
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// serve static frontend (public/)
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- health & root ---------- */
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ---------- debug ---------- */
app.get('/debug/env', (_req, res) => {
  res.json({
    DB_USER: !!process.env.DB_USER,
    DB_HOST: !!process.env.DB_HOST,
    DB_NAME: !!process.env.DB_NAME,
    DB_PASSWORD: !!process.env.DB_PASSWORD,
    DB_PORT: process.env.DB_PORT || null
  });
});

app.get('/debug/db', async (_req, res) => {
  try {
    const db = require('./models/db'); // lazy import
    const now = await db.query('SELECT NOW()');
    const exists = await db.query(`SELECT to_regclass('public.jobs') AS jobs_table`);
    res.json({ ok: true, now: now.rows[0]?.now, jobs_table: exists.rows[0]?.jobs_table });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

/* ---------- Jobs API ---------- */

// GET /api/jobs?status=Open|Filled|Closed|In%20Progress&limit=100&offset=0
app.get('/api/jobs', async (req, res) => {
  try {
    const db = require('./models/db');
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 200);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
    const status = req.query.status;

    const params = [];
    let q = 'SELECT * FROM jobs';
    if (status && status !== 'all') {
      q += ` WHERE status = $1`;
      params.push(status);
    }
    q += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await db.query(q, params);
    res.json(rows);
  } catch (e) {
    console.error('GET /api/jobs failed:', e.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// GET single
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const db = require('./models/db');
    const { rows } = await db.query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('GET /api/jobs/:id failed:', e.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// CREATE
app.post('/api/jobs', async (req, res) => {
  const { title, description, client, due_date, assigned_to, status } = req.body || {};
  try {
    const db = require('./models/db');
    const effectiveStatus = status || (assigned_to ? 'Filled' : 'Open');
    const { rows } = await db.query(
      `INSERT INTO jobs (title, description, client, due_date, assigned_to, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [title, description, client, due_date || null, assigned_to || null, effectiveStatus]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('POST /api/jobs failed:', e.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// UPDATE (partial)
app.patch('/api/jobs/:id', async (req, res) => {
  try {
    const db = require('./models/db');
    const { title, description, client, due_date, assigned_to, status } = req.body || {};
    const fields = { title, description, client, due_date, assigned_to, status };
    const set = [], vals = [];
    let i = 1;
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) { set.push(`${k} = $${i++}`); vals.push(v); }
    }
    if (!set.length) return res.status(400).json({ error: 'No fields provided' });
    vals.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE jobs SET ${set.join(', ')} WHERE id = $${i} RETURNING *`, vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('PATCH /api/jobs/:id failed:', e.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// DELETE
app.delete('/api/jobs/:id', async (req, res) => {
  try {
    const db = require('./models/db');
    const { rowCount } = await db.query('DELETE FROM jobs WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (e) {
    console.error('DELETE /api/jobs/:id failed:', e.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ASSIGN (marks Filled)
app.post('/api/jobs/:id/assign', async (req, res) => {
  try {
    const db = require('./models/db');
    const { assigned_to } = req.body || {};
    if (!assigned_to) return res.status(400).json({ error: 'assigned_to required' });
    const { rows } = await db.query(
      `UPDATE jobs SET assigned_to = $1, status = 'Filled' WHERE id = $2 RETURNING *`,
      [assigned_to, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('POST /api/jobs/:id/assign failed:', e.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// UNASSIGN (marks Open)
app.post('/api/jobs/:id/unassign', async (req, res) => {
  try {
    const db = require('./models/db');
    const { rows } = await db.query(
      `UPDATE jobs SET assigned_to = NULL, status = 'Open' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('POST /api/jobs/:id/unassign failed:', e.message);
    res.status(500).json({ error: 'DB error' });
  }
});

/* ---------- fallbacks ---------- */
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
