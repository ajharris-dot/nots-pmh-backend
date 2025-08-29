const express = require('express');
const pool = require('../db'); // your pg pool
const router = express.Router();

/**
 * GET /api/permissions
 * Returns:
 * {
 *   roles: [ 'admin', 'operations', ... ],
 *   abilities: [ 'create_job', ... ],
 *   role_abilities: [ { role, ability }, ... ]
 * }
 *
 * Note: We DO NOT require a "roles" table.
 * Roles are derived from:
 *  - Distinct roles from users table
 *  - Distinct roles in role_permissions
 *  - A default set to ensure admin/operations/employment exist
 */
router.get('/', async (req, res) => {
  try {
    // abilities
    const ab = await pool.query('SELECT ability FROM public.abilities ORDER BY ability');
    const abilities = ab.rows.map(r => r.ability);

    // role_abilities from role_permissions
    const ra = await pool.query(
      'SELECT role, ability FROM public.role_permissions ORDER BY role, ability'
    );
    const role_abilities = ra.rows;

    // roles: union of defaults + users.role + role_permissions.role
    const defaults = ['admin', 'operations', 'employment', 'manager', 'user'];

    // users.role may not exist or may be nullable; handle gracefully
    let userRoles = [];
    try {
      const ur = await pool.query('SELECT DISTINCT role FROM public.users WHERE role IS NOT NULL');
      userRoles = ur.rows.map(r => r.role);
    } catch (_) {
      userRoles = [];
    }

    const permRoles = [...new Set(role_abilities.map(x => x.role))];

    const roles = [...new Set([...defaults, ...userRoles, ...permRoles])].sort();

    res.json({ roles, abilities, role_abilities });
  } catch (e) {
    console.error('GET /api/permissions error:', e);
    res.status(500).json({ error: 'server error' });
  }
});

/**
 * POST /api/permissions
 * body: { role, ability }
 * Adds a mapping in role_permissions
 */
router.post('/', async (req, res) => {
  const { role, ability } = req.body || {};
  if (!role || !ability) return res.status(400).json({ error: 'role and ability are required' });
  try {
    await pool.query(
      'INSERT INTO public.role_permissions(role, ability) VALUES ($1, $2) ON CONFLICT DO NOTHING',
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
 * body: { role, ability }
 * Removes a mapping from role_permissions
 */
router.delete('/', async (req, res) => {
  const { role, ability } = req.body || {};
  if (!role || !ability) return res.status(400).json({ error: 'role and ability are required' });
  try {
    const r = await pool.query(
      'DELETE FROM public.role_permissions WHERE role=$1 AND ability=$2',
      [role, ability]
    );
    res.json({ ok: true, deleted: r.rowCount });
  } catch (e) {
    console.error('DELETE /api/permissions error:', e);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
