const express = require('express');
const router = express.Router();
const db = require('../models/db');

// GET all jobs
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM jobs ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST a new job
router.post('/', async (req, res) => {
  const { title, description, client, due_date, assigned_to, status } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO jobs (title, description, client, due_date, assigned_to, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, description, client, due_date, assigned_to, status || 'Open']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;