// routes/permissionsRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../models/db');

// ---- Role + Permission model (no roles table required) ----
const CANONICAL_ROLES = ['admin', 'operations', 'employment', 'manager', 'user'];

// Canonical keys used by the client/UI
const CANONICAL_PERMS = [
  // Jobs
  'job_create', 'job_edit', 'job_delete',
  'job_assign', 'job_unassign',
  // Candidates
  'candidate_create', 'candidate_edit', 'candidate_delete',
  'candidate_advance', 'candidate_revert',
  // (optional) Admin
  'manage_users', 'manage_permissions'
];

// Back-compat mapping: legacy -> canonical
const LEGACY_TO_CANON = {
  'create_job':       'job_create',
  'edit_job':         'job_edit',
  'delete_job':       'job_delete',
  'assign':           'job_assign',
  'unassign':         'job_unassign',
  'upload_photo':     'job_assign', // never used as a separate permission in UI; map to assign (or drop)
  'candidate_create': 'candidate_create',
  'candidate_edit':   'candidate_edit',
  'candidate_delete': 'candidate_delete',
  'candidate_advance':'candidate_advance',
  'candidate_revert': 'candidate_revert',
  'manage_users':     'manage_users',
  'manage_permissions':'manage_permissions'
};

const normalizePerm = (p) => {
  if (!p) return null;
  const canon = LEGACY_TO_CANON[p] || p;
  return canon;
};

const isAdmin = (req) => req.user && req.user.role === 'admin';

// Try to insert into abilities table if it exists & schema matches (`"key"` column).
// This avoids FK violations if role_permissions.ability_key references abilities("key").
async function ensureAbilityExistsIfTablePresent(abilityKey) {
  try {
    // Check if abilities table exists and has column "key"
    const check = await db.query(`
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = 'abilities'
         AND column_name  = 'key'
      LIMIT 1
    `);
    if (!check.rowCount) return; // silently skip if table/column not present

    await db.query(
      `INSERT INTO public.abilities ("key")
       VALUES ($1) ON CONFLICT ("key") DO NOTHING`,
      [abilityKey]
    );
  } catch (_) {
    // ignore any errors here; we don't want to break permissions ops
  }
}

async function getAllRoles() {
  const roles = new Set(CANONICAL_ROLES);
  try {
    const u = await db.query(`SELECT DISTINCT role FROM public.users WHERE role IS NOT NULL`);
    u.rows.forEach(r => roles.add(r.role));
  } catch (_) {}

  try {
    const rp = await db.query(`SELECT DISTINCT role FROM public.role_permissions WHERE role IS NOT NULL`);
    rp.rows.forEach(r => roles.add(r.role));
  } catch (_) {}

  return Array.from(roles).sort();
}

async function getAllPermissions() {
  const perms = new Set(CANONICAL_PERMS);
  try {
    const d = await db.query(`SELECT DISTINCT ability_key FROM public.role_permissions WHERE ability_key IS NOT NULL`);
    d.rows.forEach(r => perms.add(normalizePerm(r.ability_key)));
  } catch (_) {}
  return Array.from(perms).filter(Boolean).sort();
}

// ========== ROUTES ==========

// Current user’s effective permissions (for hiding buttons client-side)
router.get('/mine', async (req, res) => {
  // requires authMiddleware at mount; no admin required
  const role = req.user?.role;
  if (!role) return res.json({ permissions: [] });

  try {
    const q = await db.query(
      `SELECT ability_key FROM public.role_permissions WHERE role = $1`,
      [role]
    );
    const perms = q.rows.map(r => normalizePerm(r.ability_key)).filter(Boolean);

    // If nothing in DB, you can optionally fall back to legacy defaults
    // (comment out if you want "no DB rows = no abilities"):
    if (!perms.length) {
      if (role === 'operations') {
        perms.push('job_create','job_edit','job_delete');
      } else if (role === 'employment') {
        perms.push('job_assign','job_unassign','candidate_create','candidate_edit','candidate_delete','candidate_advance','candidate_revert');
      } else if (role === 'admin') {
        perms.push(...CANONICAL_PERMS);
      }
    }

    // unique + sorted
    res.json({ permissions: Array.from(new Set(perms)).sort() });
  } catch (err) {
    console.error('GET /api/permissions/mine error:', err);
    res.status(500).json({ permissions: [] });
  }
});

// Admin view: roles, full permission pool, and mapping
router.get('/', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
  try {
    const [roles, permissions, mappingQ] = await Promise.all([
      getAllRoles(),
      getAllPermissions(),
      db.query(`SELECT role, ability_key FROM public.role_permissions ORDER BY role, ability_key`)
    ]);

    const role_permissions = mappingQ.rows.map(r => ({
      role: r.role,
      permission: normalizePerm(r.ability_key)
    })).filter(rp => !!rp.permission);

    res.json({ roles, permissions, role_permissions });
  } catch (err) {
    console.error('GET /api/permissions error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// Grant a permission to a role
router.post('/', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });

  const role = String(req.body?.role || '').trim();
  const rawPerm = String(req.body?.permission || '').trim();
  const permission = normalizePerm(rawPerm);
  if (!role || !permission) return res.status(400).json({ error: 'role and permission are required' });

  try {
    // Optional: ensure ability exists in abilities table (if present)
    await ensureAbilityExistsIfTablePresent(permission);

    await db.query(
      `INSERT INTO public.role_permissions (role, ability_key)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [role, permission]
    );

    // Return updated mapping for this role (handy for client to refresh quickly)
    const updated = await db.query(
      `SELECT ability_key FROM public.role_permissions WHERE role = $1 ORDER BY ability_key`,
      [role]
    );
    res.json({
      ok: true,
      role,
      permissions: updated.rows.map(r => normalizePerm(r.ability_key)).filter(Boolean)
    });
  } catch (err) {
    console.error('POST /api/permissions error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// Revoke a permission from a role
router.delete('/', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });

  const role = String(req.body?.role || '').trim();
  const rawPerm = String(req.body?.permission || '').trim();
  const permission = normalizePerm(rawPerm);
  if (!role || !permission) return res.status(400).json({ error: 'role and permission are required' });

  try {
    const del = await db.query(
      `DELETE FROM public.role_permissions
        WHERE role = $1 AND ability_key IN ($2, $3)`,
      // Delete both canonical and any legacy spelling that might exist
      [role, permission, Object.keys(LEGACY_TO_CANON).find(k => LEGACY_TO_CANON[k] === permission) || permission]
    );

    if (!del.rowCount) return res.status(404).json({ error: 'not found' });

    const updated = await db.query(
      `SELECT ability_key FROM public.role_permissions WHERE role = $1 ORDER BY ability_key`,
      [role]
    );
    res.json({
      ok: true,
      role,
      permissions: updated.rows.map(r => normalizePerm(r.ability_key)).filter(Boolean)
    });
  } catch (err) {
    console.error('DELETE /api/permissions error:', err);
    res.status(500).json({ error: 'db error' });
  }
});

module.exports = router;
