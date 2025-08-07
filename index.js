// index.js
const express = require('express');
const cors = require('cors');
const db = require('./models/db'); // make sure models/db.js exists as shown earlier

const app = express();

// Basic hardening + parsing
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ---- Health & root ----
app.get('/healthz', (req, res) => res.status(200).json({ ok: true }));
app.get('/', (_req, res) => res.send('NOTS PMH API is running!'));

// ---- Debug helpers (safe to keep during setup) ----
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
    const now = await db.query('SELECT NOW()');
    const exists = await db.query(`SELECT to_regclass('public.jobs') AS jobs_table`);
    res.json({
      ok: true,
      now: now.rows[0]?.now,
      jobs_table: exists.rows[0]?.jobs_table
    });
  } catch (e) {
    console.error('DEBUG /debug/db error:', e.message);
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ---- Jobs API ----

// GET /api/jobs -> list jobs
app.get('/api/jobs', async (_req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM jobs ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('GET /api/jobs failed:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// POST /api/jobs -> create job
app.post('/api/jobs', async (req, res) => {
  const { title, description, client, due_date, assigned_to, status } = req.body || {};
  try {
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

// 404 for anything else
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler (last)
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
