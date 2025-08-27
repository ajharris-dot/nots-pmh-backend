// routes/permissionsRoutes.js
const express = require('express');
const router = express.Router();

// Pick ONE of these depending on where your db helper lives:
// const db = require('../db');            // if you created /src/db.js
const db = require('../models/db');       // if your helper is /src/models/db.js

// GET all permissions grouped by role + list of roles + abilities
router.get('/', async (_req, res) => {
  try {
    const rolesRes = await db.query(
      'SELECT role FROM roles ORDER BY role'
    );
    const abRes = await db.query(
      'SELECT ability_key AS ability FROM abilities ORDER BY ability_key'
    );
    const mapRes = await db.query(
      `SELECT role, array_agg(ability_key ORDER BY ability_key) AS abilities
         FROM role_permissions
        GROUP BY role
        ORDER BY role`
    );

    const roles = rolesRes.rows.map(r => r.role);
    const abilities = abRes.rows.map(r => ({ ability: r.ability }));
    const mapping = {};
    for (const r of mapRes.rows) mapping[r.role] = r.abilities || [];

    res.json({ roles, abilities, mapping });
  } catch (err) {
    console.error('permissions GET error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// POST /api/permissions  { role, ability }  -> grant
router.post('/', async (req, res) => {
  const { role, ability } = req.body || {};
  if (!role || !ability) return res.status(400).json({ error: 'missing role/ability' });
  try {
    await db.query(
      `INSERT INTO role_permissions (role, ability_key)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [role, ability]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('permissions POST error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// DELETE /api/permissions  { role, ability } -> revoke
router.delete('/', async (req, res) => {
  const { role, ability } = req.body || {};
  if (!role || !ability) return res.status(400).json({ error: 'missing role/ability' });
  try {
    await db.query(
      `DELETE FROM role_permissions
        WHERE role = $1 AND ability_key = $2`,
      [role, ability]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('permissions DELETE error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// OPTIONAL aliases: POST /grant and POST /revoke
router.post('/grant', async (req, res) => {
  req.body && (req.method = 'POST'); // noop, just forward
  return router.handle(req, res);
});
router.post('/revoke', async (req, res) => {
  // Simulate DELETE with body
  req.method = 'DELETE';
  return router.handle(req, res);
});

module.exports = router;
