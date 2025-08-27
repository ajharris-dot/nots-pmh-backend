// routes/permissionsRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../db'); // <- fix path/quotes

// GET /api/permissions  -> { roles:[...], abilities:[{id,ability}], mapping:{ role:[ability,...] } }
router.get('/', async (_req, res) => {
  try {
    const { rows: abilities } = await db.query(
      'SELECT id, ability FROM abilities ORDER BY ability ASC;'
    );

    // enum roles
    const { rows: roles } = await db.query(
      "SELECT unnest(enum_range(NULL::user_role))::text AS role;"
    );

    const { rows: mappings } = await db.query(
      `SELECT r.role::text AS role, a.ability
         FROM role_abilities r
         JOIN abilities a ON a.id = r.ability_id
         ORDER BY r.role, a.ability;`
    );

    const map = {};
    roles.forEach(r => { map[r.role] = []; });
    mappings.forEach(m => map[m.role].push(m.ability));

    res.json({ roles: roles.map(r => r.role), abilities, mapping: map });
  } catch (err) {
    console.error('GET /api/permissions error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// POST /api/permissions  { role, ability }
router.post('/', async (req, res) => {
  const { role, ability } = req.body || {};
  if (!role || !ability) return res.status(400).json({ error: 'role and ability required' });

  try {
    const { rows } = await db.query('SELECT id FROM abilities WHERE ability=$1;', [ability]);
    if (!rows.length) return res.status(400).json({ error: 'unknown ability' });

    await db.query(
      'INSERT INTO role_abilities (role, ability_id) VALUES ($1::user_role, $2) ON CONFLICT DO NOTHING;',
      [role, rows[0].id]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('POST /api/permissions error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// DELETE /api/permissions  { role, ability }
router.delete('/', async (req, res) => {
  const { role, ability } = req.body || {};
  if (!role || !ability) return res.status(400).json({ error: 'role and ability required' });

  try {
    const { rows } = await db.query('SELECT id FROM abilities WHERE ability=$1;', [ability]);
    if (!rows.length) return res.status(400).json({ error: 'unknown ability' });

    const r = await db.query(
      'DELETE FROM role_abilities WHERE role=$1::user_role AND ability_id=$2;',
      [role, rows[0].id]
    );
    res.json({ ok: true, deleted: r.rowCount });
  } catch (err) {
    console.error('DELETE /api/permissions error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
