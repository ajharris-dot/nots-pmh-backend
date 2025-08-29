// routes/permissionsRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../models/db');

// A canonical set of permissions you actually use in the app.
// Add/remove here to control what's available in the Admin Hub UI.
const CANONICAL_PERMS = [
  // Jobs
  'create_job', 'edit_job', 'delete_job',
  'assign', 'unassign', 'upload_photo',
  // Candidates (employment area)
  'candidate_create', 'candidate_edit', 'candidate_delete',
  'candidate_advance', 'candidate_revert',
  // Admin areas
  'manage_users', 'manage_permissions'
];

// GET /api/permissions
// -> { roles: string[], permissions: string[], role_permissions: [{role, permission}] }
router.get('/', async (_req, res) => {
  try {
    // roles
    const rolesQ = await db.query(`SELECT role FROM roles ORDER BY role`);

    // union of canonical + anything already in DB
    const distinctQ = await db.query(
      `SELECT DISTINCT ability_key FROM role_permissions ORDER BY ability_key`
    );
    const fromDb = distinctQ.rows.map(r => r.ability_key);
    const permissions = Array.from(new Set([...CANONICAL_PERMS, ...fromDb])).sort();

    // mapping
    const mappingQ = await db.query(
      `SELECT role, ability_key AS permission
         FROM role_permissions
        ORDER BY role, ability_key`
    );

    res.json({
      roles: rolesQ.rows.map(r => r.role),
      permissions,
      role_permissions: mappingQ.rows
    });
  } catch (err) {
    console.error('GET /api/permissions error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// POST /api/permissions  { role, permission } -> grant
router.post('/', async (req, res) => {
  const role = String(req.body?.role || '').trim();
  const permission = String(req.body?.permission || '').trim();
  if (!role || !permission) return res.status(400).json({ error: 'role and permission are required' });

  try {
    // validate role exists
    const rOk = await db.query(`SELECT 1 FROM roles WHERE role = $1`, [role]);
    if (!rOk.rowCount) return res.status(400).json({ error: 'unknown role' });

    await db.query(
      `INSERT INTO role_permissions (role, ability_key)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [role, permission]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/permissions error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// DELETE /api/permissions  { role, permission } -> revoke
router.delete('/', async (req, res) => {
  const role = String(req.body?.role || '').trim();
  const permission = String(req.body?.permission || '').trim();
  if (!role || !permission) return res.status(400).json({ error: 'role and permission are required' });

  try {
    const del = await db.query(
      `DELETE FROM role_permissions
        WHERE role = $1
          AND ability_key = $2`,
      [role, permission]
    );
    if (!del.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/permissions error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

module.exports = router;
