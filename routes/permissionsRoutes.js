// routes/permissionsRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../models/db');

// Canonical roles you support in the app UI. Add/remove as needed.
const CANONICAL_ROLES = ['admin', 'operations', 'employment', 'manager', 'user'];

// Canonical permissions used by your client. Edit to match your app.
const CANONICAL_PERMS = [
  // Jobs
  'create_job', 'edit_job', 'delete_job',
  'assign', 'unassign', 'upload_photo',
  // Candidates (employment area)
  'candidate_create', 'candidate_edit', 'candidate_delete',
  'candidate_advance', 'candidate_revert',
  // Admin
  'manage_users', 'manage_permissions'
];

// Build role set without requiring a `roles` table
async function getAllRoles() {
  const roles = new Set(CANONICAL_ROLES);

  try {
    const u = await db.query(`SELECT DISTINCT role FROM users WHERE role IS NOT NULL`);
    u.rows.forEach(r => roles.add(r.role));
  } catch (_) {}

  try {
    const rp = await db.query(`SELECT DISTINCT role FROM role_permissions WHERE role IS NOT NULL`);
    rp.rows.forEach(r => roles.add(r.role));
  } catch (_) {}

  return Array.from(roles).sort();
}

async function getAllPermissions() {
  const perms = new Set(CANONICAL_PERMS);
  try {
    const d = await db.query(`SELECT DISTINCT ability_key FROM role_permissions WHERE ability_key IS NOT NULL`);
    d.rows.forEach(r => perms.add(r.ability_key));
  } catch (_) {}
  return Array.from(perms).sort();
}

// GET -> { roles, permissions, role_permissions:[{role, permission}] }
router.get('/', async (_req, res) => {
  try {
    const [roles, permissions, mappingQ] = await Promise.all([
      getAllRoles(),
      getAllPermissions(),
      db.query(`SELECT role, ability_key AS permission FROM role_permissions ORDER BY role, ability_key`)
    ]);

    res.json({
      roles,
      permissions,
      role_permissions: mappingQ.rows
    });
  } catch (err) {
    console.error('GET /api/permissions error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// POST { role, permission } -> grant
router.post('/', async (req, res) => {
  const role = String(req.body?.role || '').trim();
  const permission = String(req.body?.permission || '').trim();
  if (!role || !permission) return res.status(400).json({ error: 'role and permission are required' });

  try {
    const roles = await getAllRoles();
    if (!roles.includes(role)) {
      // allow creating a brand-new role name by granting it first time
      // comment the next line if you want to allow ANY new role names without warning:
      // return res.status(400).json({ error: 'unknown role' });
    }

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

// DELETE { role, permission } -> revoke
router.delete('/', async (req, res) => {
  const role = String(req.body?.role || '').trim();
  const permission = String(req.body?.permission || '').trim();
  if (!role || !permission) return res.status(400).json({ error: 'role and permission are required' });

  try {
    const del = await db.query(
      `DELETE FROM role_permissions WHERE role = $1 AND ability_key = $2`,
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
