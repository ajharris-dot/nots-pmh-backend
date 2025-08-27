// routes/permissionsRoutes.js
const express = require('express');
const db = require('../models/db'); // <-- correct path to your db.js
const router = express.Router();

/**
 * GET /api/permissions
 * Returns list of roles with their abilities.
 * This version is resilient: it works whether you have a `roles` table or not.
 * If you DO have a `roles` table, uncomment the FIRST query and comment the fallback.
 * If you DON'T have a roles table, the VALUES(...) fallback lists your known roles.
 */
router.get('/', async (_req, res) => {
  try {
    // ---- If you have a `roles` table with a `role` column, prefer this:
    // const { rows } = await db.query(
    //   `
    //   SELECT r.role,
    //          COALESCE(
    //            array_agg(rp.ability_key ORDER BY rp.ability_key)
    //              FILTER (WHERE rp.ability_key IS NOT NULL),
    //            '{}'
    //          ) AS abilities
    //   FROM roles r
    //   LEFT JOIN role_permissions rp ON rp.role = r.role
    //   GROUP BY r.role
    //   ORDER BY r.role
    //   `
    // );

    // ---- Fallback: if you DON'T have a roles table, enumerate known roles here:
    const { rows } = await db.query(
      `
      WITH known_roles(role) AS (
        VALUES ('admin'), ('employment'), ('operations'), ('manager'), ('user')
      )
      SELECT kr.role,
             COALESCE(
               array_agg(rp.ability_key ORDER BY rp.ability_key)
                 FILTER (WHERE rp.ability_key IS NOT NULL),
               '{}'
             ) AS abilities
      FROM known_roles kr
      LEFT JOIN role_permissions rp ON rp.role = kr.role
      GROUP BY kr.role
      ORDER BY kr.role
      `
    );

    res.json(rows);
  } catch (err) {
    console.error('permissions GET error:', err?.message, err?.stack);
    res.status(500).json({ error: 'db error', detail: err?.message });
  }
});

/**
 * GET /api/permissions/abilities
 * Returns the abilities catalog from the `abilities` table.
 */
router.get('/abilities', async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT key AS ability, label FROM abilities ORDER BY key`
    );
    res.json(rows);
  } catch (err) {
    console.error('abilities GET error:', err?.message, err?.stack);
    res.status(500).json({ error: 'db error', detail: err?.message });
  }
});

/**
 * POST /api/permissions
 * Body: { role, ability }
 * Adds ability to role.
 */
router.post('/', async (req, res) => {
  const { role, ability } = req.body || {};
  if (!role || !ability) {
    return res.status(400).json({ error: 'missing role/ability' });
  }
  try {
    await db.query(
      `INSERT INTO role_permissions (role, ability_key)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [role, ability]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('permissions POST error:', err?.message, err?.stack);
    res.status(500).json({ error: 'db error', detail: err?.message });
  }
});

/**
 * DELETE /api/permissions
 * Body: { role, ability }
 * Removes ability from role.
 */
router.delete('/', async (req, res) => {
  const { role, ability } = req.body || {};
  if (!role || !ability) {
    return res.status(400).json({ error: 'missing role/ability' });
  }
  try {
    const result = await db.query(
      `DELETE FROM role_permissions WHERE role = $1 AND ability_key = $2`,
      [role, ability]
    );
    res.json({ ok: true, deleted: result.rowCount });
  } catch (err) {
    console.error('permissions DELETE error:', err?.message, err?.stack);
    res.status(500).json({ error: 'db error', detail: err?.message });
  }
});

module.exports = router;
