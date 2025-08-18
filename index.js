// index.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();

/* ---------- Uploads setup (kept local for now) ---------- */
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-z0-9.\-_]+/gi, '_');
    cb(null, `${Date.now()}_${safe}`);
  }
});
const upload = multer({ storage });

/* ---------- App middleware ---------- */
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- Health + root ---------- */
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ---------- Debug ---------- */
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
    const db = require('./models/db');
    const now = await db.query('SELECT NOW()');
    const exists = await db.query(`SELECT to_regclass('public.jobs') AS jobs_table`);
    res.json({ ok: true, now: now.rows[0]?.now, jobs_table: exists.rows[0]?.jobs_table });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

/* ---------- Upload endpoint (returns { url }) ---------- */
// multipart/form-data; field name: "photo"
app.post('/api/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

/* =========================
   Jobs API (new terminology)
   ========================= */

// GET /api/jobs?status=Open|Filled|...&limit=100&offset=0
// Returns aliased fields: department, employee, job_number, employee_photo_url
app.get('/api/jobs', async (req, res) => {
  try {
    const db = require('./models/db');
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 200);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
    const status = req.query.status;

    const params = [];
    let q = `
      SELECT
        id,
        title,
        description AS job_number,
        client AS department,
        assigned_to AS employee,
        employee_photo_url,
        due_date,
        filled_date,            -- ensure this is included
        status,
        created_at
      FROM jobs
    `;
    if (status && status !== 'all') {
      q += ` WHERE LOWER(status) = LOWER($1)`;
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

// GET single (aliased)
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const db = require('./models/db');
    const { rows } = await db.query(`
      SELECT
        id,
        title,
        description AS job_number,
        client AS department,
        assigned_to AS employee,
        employee_photo_url,
        due_date,
        filled_date,            -- ensure this is included
        status,
        created_at
      FROM jobs
      WHERE id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('GET /api/jobs/:id failed:', e.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// CREATE (no assignment at create; starts Open unless provided)
// Make date optional: accept blank/absent date; if provided, initialize filled_date to same date.
app.post('/api/jobs', async (req, res) => {
  const { title, job_number, department, due_date, status, filled_date } = req.body || {};
  try {
    const db = require('./models/db');
    const effectiveStatus = status || 'Open';
    const { rows } = await db.query(
      `INSERT INTO jobs (title, description, client, due_date, filled_date, assigned_to, status)
       VALUES ($1, $2, $3, NULLIF($4,'')::date, NULLIF($5,'')::date, NULL, $6)
       RETURNING
         id, title, description AS job_number, client AS department,
         assigned_to AS employee, employee_photo_url, due_date, filled_date, status, created_at`,
      [title, job_number || null, department || null, due_date ?? null, filled_date ?? null, effectiveStatus]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('POST /api/jobs failed:', e.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// UPDATE (partial) — maps new names to DB columns
app.patch('/api/jobs/:id', async (req, res) => {
  try {
    const db = require('./models/db');
    const {
      title,
      job_number,
      department,
      due_date,
      filled_date,             // <-- keep this
      employee,
      status,
      employee_photo_url
    } = req.body || {};

    const fields = {
      title,
      description: job_number,       // job_number -> description
      client: department,            // department -> client
      due_date,                      // accepts null to clear (independent)
      filled_date,                   // <-- allow direct updates (no mirroring)
      assigned_to: employee,         // employee -> assigned_to
      status,
      employee_photo_url             // allow updating photo URL
    };

    const set = [], vals = [];
    let i = 1;
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) { set.push(`${k} = $${i++}`); vals.push(v); }
    }
    if (!set.length) return res.status(400).json({ error: 'No fields provided' });
    vals.push(req.params.id);

    const { rows } = await db.query(
      `UPDATE jobs SET ${set.join(', ')} WHERE id = $${i}
       RETURNING
         id, title, description AS job_number, client AS department,
         assigned_to AS employee, employee_photo_url, due_date, filled_date, status, created_at`,
      vals
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

// ASSIGN (expects { employee }, sets status = Filled)
app.post('/api/jobs/:id/assign', async (req, res) => {
  try {
    const db = require('./models/db');
    const { employee } = req.body || {};
    if (!employee) return res.status(400).json({ error: 'employee required' });

     const { rows } = await db.query(
       `UPDATE jobs
        SET assigned_to = $1,
            status = 'Filled',
            filled_date = COALESCE(filled_date, CURRENT_DATE)
        WHERE id = $2
        RETURNING
          id, title, description AS job_number, client AS department,
          assigned_to AS employee, employee_photo_url, due_date, filled_date, status, created_at`,
       [employee, req.params.id]
     );

    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('POST /api/jobs/:id/assign failed:', e.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// UNASSIGN (sets employee NULL, status = Open)
app.post('/api/jobs/:id/unassign', async (req, res) => {
  try {
    const db = require('./models/db');
    const { rows } = await db.query(
      `UPDATE jobs
       SET assigned_to = NULL,
           status = 'Open',
           filled_date = NULL
       WHERE id = $1
       RETURNING
         id, title, description AS job_number, client AS department,
         assigned_to AS employee, employee_photo_url, due_date, filled_date, status, created_at`,
      [req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('POST /api/jobs/:id/unassign failed:', e.message);
    res.status(500).json({ error: 'DB error' });
  }
});

/* ---------- 404 fallback ---------- */
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

/* ---------- Start server ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
