// index.js
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// basic hardening + parsing
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// (optional) serve static files if you add a /public folder later
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- health & root ---------- */
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));
app.get('/', (_req, res) => res.send('NOTS PMH API is running!'));

/* ---------- debug (no DB in env; lazy DB in /debug/db) ---------- */
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
    const db = require('./models/db');    // lazy import
    const now = await db.query('SELECT NOW()');
    const exists = await db.query(`SELECT to_regclass('public.jobs') AS jobs_table`);
    res.json({ ok: true, now: now.rows[0]?.now, jobs_table: exists.rows[0]?.jobs_table });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

/* ---------- Jobs API (lazy-load DB so startup is safe) ---------- */

// GET /api/jobs?limit=50&offset=0
app.get('/api/jobs', async (req, res) => {
  try {
    const db = require('./models/db');
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
    const { rows } = await db.query(
      'SELECT * FROM jobs ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/jobs failed:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// GET /api/jobs/:id
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const db = require('./models/db');
    const { rows } = await db.query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/jobs/:id failed:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// POST /api/jobs
app.post('/api/jobs', async (req, res) => {
  const { title, description, client, due_date, assigned_to, status } = req.body || {};
  try {
    const db = require('./models/db');
    const { rows } = await db.query(
      `INSERT INTO jobs (title, description, client, due_date, assigned_to, status)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6,'Open'))
       RETURNING *`,
      [title, description, client, due_date, assigned_to, status]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/jobs failed:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// PATCH /api/jobs/:id (partial update)
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
  } catch (err) {
    console.error('PATCH /api/jobs/:id failed:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// DELETE /api/jobs/:id
app.delete('/api/jobs/:id', async (req, res) => {
  try {
    const db = require('./models/db');
    const { rowCount } = await db.query('DELETE FROM jobs WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    console.error('DELETE /api/jobs/:id failed:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

/* ---------- fallbacks ---------- */
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
