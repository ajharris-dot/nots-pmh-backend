// index.js
const express = require('express');
const cors = require('cors');
const app = express();

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));
app.get('/', (_req, res) => res.send('NOTS PMH API is running!'));

// ✅ No-DB env check
app.get('/debug/env', (_req, res) => {
  res.json({
    DB_USER: !!process.env.DB_USER,
    DB_HOST: !!process.env.DB_HOST,
    DB_NAME: !!process.env.DB_NAME,
    DB_PASSWORD: !!process.env.DB_PASSWORD,
    DB_PORT: process.env.DB_PORT || null
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
