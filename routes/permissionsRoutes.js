const express = require('express');
const pool = require('../db'); // adjust if your db client is in another file
const router = express.Router();

// GET all permissions grouped by role
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT role, array_agg(ability_key ORDER BY ability_key) AS abilities FROM role_permissions GROUP BY role ORDER BY role'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

// POST add ability
router.post('/', async (req, res) => {
  const { role, ability } = req.body;
  if (!role || !ability) return res.status(400).json({ error: 'missing role/ability' });
  try {
    await pool.query(
      'INSERT INTO role_permissions (role, ability_key) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [role, ability]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

// DELETE ability
router.delete('/', async (req, res) => {
  const { role, ability } = req.body;
  if (!role || !ability) return res.status(400).json({ error: 'missing role/ability' });
  try {
    await pool.query(
      'DELETE FROM role_permissions WHERE role=$1 AND ability_key=$2',
      [role, ability]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db error' });
  }
});

module.exports = router;
