// routes/permissionsRoutes.js
const express = require('express');
const db = require('../models/db');
const router = express.Router();

/**
 * GET /api/permissions
 * Always return the canonical role list with abilities (empty if none yet)
 */
router.get('/', async (_req, res) => {
  try {
    const { rows } = await db.query(`
      WITH roles(role) AS (
        VALUES ('admin'), ('employment'), ('operations'), ('manager'), ('user')
      )
      SELECT
        r.role,
        COALESCE(
          array_agg(rp.ability_key ORDER BY rp.ability_key)
            FILTER (WHERE rp.ability_key IS NOT NULL),
          '{}'
        ) AS abilities
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role = r.role
      GROUP BY r.role
      ORDER BY r.role;
    `);
    res.json(rows);
  } catch (err) {
    console.error('permissions GET error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

/**
 * POST /api/permissions
 * body: { role, ability }
 */
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

/**
 * DELETE /api/permissions
 * body: { role, ability }
 */
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

module.exports = router;
