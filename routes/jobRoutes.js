const express = require('express');
const router = express.Router();
const db = require('../models/db');

// GET all jobs (optional ?status=Open/Assigned/Filled)
router.get('/', async (req, res) => {
  try {
    const status = req.query.status;
    if (status && String(status).trim().length) {
      const { rows } = await db.query(
        `SELECT *, assigned_to AS employee
           FROM jobs
          WHERE LOWER(status) = LOWER($1)
          ORDER BY created_at DESC`,
        [status]
      );
      return res.json(rows);
    }
    const { rows } = await db.query(`
      SELECT *, assigned_to AS employee
        FROM jobs
       ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST a new job (set assigned_at if assigned_to provided)
router.post('/', async (req, res) => {
  const { title, description, client, due_date, assigned_to, status } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO jobs
         (title, description, client, due_date, assigned_to, status, assigned_at)
       VALUES
         ($1, $2, $3, $4, $5, COALESCE($6, 'Open'),
          CASE WHEN $5 IS NOT NULL AND $5 <> '' THEN NOW() ELSE NULL END)
       RETURNING *`,
      [title, description, client, due_date, assigned_to || null, status]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ASSIGN — sets assignee, marks filled, stamps assigned_at
router.post('/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { employee, assigned_to } = req.body;
  const assignee = (assigned_to ?? employee ?? '').trim();
  if (!assignee) return res.status(400).json({ error: 'Employee required' });

  try {
    const { rows } = await db.query(
      `UPDATE jobs
          SET assigned_to = $1,
              status = 'filled',
              assigned_at = NOW(),
              updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [assignee, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Job not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('ASSIGN error', err);
    res.status(500).json({ error: 'Failed to assign job' });
  }
});

// UNASSIGN — clears assignee, photo, and assigned_at; marks open
router.post('/:id/unassign', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await db.query(
      `UPDATE jobs
          SET assigned_to = NULL,
              employee_photo_url = NULL,
              assigned_at = NULL,
              status = 'open',
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Job not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('UNASSIGN error', err);
    res.status(500).json({ error: 'Failed to unassign job' });
  }
});

module.exports = router;
