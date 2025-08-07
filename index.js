// index.js
const express = require('express');
const cors = require('cors');
const db = require('./models/db'); // <-- make sure this file exists (see note below)

const app = express();
app.use(cors());
app.use(express.json());

// Health check (Render points its health check here)
app.get('/healthz', (req, res) => res.status(200).json({ ok: true }));

// Root
app.get('/', (req, res) => {
  res.send('NOTS PMH API is running!');
});

// GET /api/jobs  -> returns all jobs
app.get('/api/jobs', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM jobs ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/jobs failed:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// (Optional) POST /api/jobs -> create a job
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
    console.error('POST /api/jobs failed:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
