// routes/permissionsRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../models/db'); // make sure this path matches your project

// GET /api/permissions
// -> { roles: string[], abilities: {ability, description}[], role_abilities: {role, ability}[] }
router.get('/', async (_req, res) => {
  try {
    const rolesQ = await db.query(
      `SELECT role
         FROM roles
        ORDER BY role`
    );

    const abilitiesQ = await db.query(
      `SELECT ability_key AS ability, description
         FROM abilities
        ORDER BY ability_key`
    );

    const mappingQ = await db.query(
      `SELECT role, ability_key AS ability
         FROM role_permissions
        ORDER BY role, ability_key`
    );

    res.json({
      roles: rolesQ.rows.map(r => r.role),
      abilities: abilitiesQ.rows, // [{ability, description}]
      role_abilities: mappingQ.rows // [{role, ability}]
    });
  } catch (err) {
    console.error('GET /api/permissions error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// POST /api/permissions  { role, ability }
router.post('/', async (req, res) => {
  const role = String(req.body?.role || '').trim();
  const ability = String(req.body?.ability || '').trim();
  if (!role || !ability) return res.status(400).json({ error: 'role and ability are required' });

  try {
    // Validate existence (optional but nice)
    const rOk = await db.query(`SELECT 1 FROM roles WHERE role = $1`, [role]);
    const aOk = await db.query(`SELECT 1 FROM abilities WHERE ability_key = $1`, [ability]);
    if (!rOk.rowCount) return res.status(400).json({ error: 'unknown role' });
    if (!aOk.rowCount) return res.status(400).json({ error: 'unknown ability' });

    await db.query(
      `INSERT INTO role_permissions (role, ability_key)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [role, ability]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/permissions error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// DELETE /api/permissions  { role, ability }
router.delete('/', async (req, res) => {
  const role = String(req.body?.role || '').trim();
  const ability = String(req.body?.ability || '').trim();
  if (!role || !ability) return res.status(400).json({ error: 'role and ability are required' });

  try {
    const del = await db.query(
      `DELETE FROM role_permissions
        WHERE role = $1 AND ability_key = $2`,
      [role, ability]
    );

    if (!del.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/permissions error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

module.exports = router;
