const express = require('express');
const router = express.Router();

// Make sure this matches how your other routes import the db:
// const db = require('../db');  // or const pool = require('../db');
const db = require('../models/db');

/**
 * GET /api/permissions
 * Returns:
 *   { roles: string[], abilities: string[], role_abilities: {role, ability}[] }
 */
router.get('/', async (_req, res) => {
  try {
    // If you don't have a 'roles' table, keep this static list, or build it from your app’s known roles.
    const roles = ['admin', 'operations', 'employment', 'manager', 'user'];

    const abilRes = await db.query(`SELECT ability_key FROM abilities ORDER BY ability_key`);
    const abilities = abilRes.rows.map(r => r.ability_key);

    const rpRes = await db.query(`SELECT role, ability_key FROM role_permissions`);
    const role_abilities = rpRes.rows.map(r => ({
      role: r.role,
      ability: r.ability_key
    }));

    res.json({ roles, abilities, role_abilities });
  } catch (e) {
    console.error('GET /api/permissions error:', e);
    res.status(500).json({ error: 'server error' });
  }
});

/**
 * POST /api/permissions
 * Body: { role, ability }
 */
router.post('/', async (req, res) => {
  const { role, ability } = req.body || {};
  if (!role || !ability) return res.status(400).json({ error: 'role and ability required' });
  try {
    await db.query(
      `INSERT INTO role_permissions(role, ability_key)
       VALUES ($1, $2)
       ON CONFLICT (role, ability_key) DO NOTHING`,
      [role, ability]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/permissions error:', e);
    res.status(500).json({ error: 'server error' });
  }
});

/**
 * DELETE /api/permissions
 * Body: { role, ability }
 */
router.delete('/', async (req, res) => {
  const { role, ability } = req.body || {};
  if (!role || !ability) return res.status(400).json({ error: 'role and ability required' });
  try {
    await db.query(
      `DELETE FROM role_permissions WHERE role = $1 AND ability_key = $2`,
      [role, ability]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/permissions error:', e);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
