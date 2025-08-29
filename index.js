// index.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const helmet = require('helmet');

const db = require('./db'); // <-- needed for ability checks

const authRoutes = require('./routes/authRoutes');
const jobRoutes = require('./routes/jobRoutes');
const usersRoutes = require('./routes/usersRoutes');
const authMiddleware = require('./middleware/authMiddleware');
const permissionsRoutes = require('./routes/permissionsRoutes');
const candidatesRoutes = require('./routes/candidatesRoutes');

const app = express();

/* ---------- Uploads setup ---------- */
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-z0-9.\-_]+/gi, '_');
    cb(null, `${Date.now()}_${safe}`);
  }
});
const upload = multer({ storage });

/* ---------- Middleware ---------- */
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: true,
  credentials: false, // JWT, not cookies
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
}));
app.options('*', cors());
app.use(express.json({ limit: '1mb' }));

// Static site (login.html, index.html, employment.html, admin.html, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Admin Hub page (static HTML)
app.get('/admin.html', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin.html'))
);

/* ---------- Helpers ---------- */
function authorizeRoles(...roles) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

// Ability-based gate (backs Admin Hub changes)
function authorizeAbility(abilityKey) {
  return async (req, res, next) => {
    try {
      const role = req.user?.role;
      if (!role) return res.status(401).json({ error: 'unauthorized' });

      // Admin bypass (keep if you want admin to be superuser)
      if (role === 'admin') return next();

      const q = `
        SELECT 1
        FROM role_permissions
        WHERE role = $1 AND ability_key = $2
        LIMIT 1
      `;
      const r = await db.query(q, [role, abilityKey]);
      if (r.rowCount) return next();

      return res.status(403).json({ error: 'forbidden' });
    } catch (err) {
      console.error('authorizeAbility error', err);
      return res.status(500).json({ error: 'server_error' });
    }
  };
}

/* ---------- Routes ---------- */
// Auth
app.use('/api/auth', authRoutes);

/* ===== Jobs =====
   All GETs require auth (so the app is private).
   Each write maps to a specific ability key.
*/
app.use('/api/jobs', authMiddleware); // auth for all job routes (GET/POST/etc.)

// Pre-route guards for writes (then pass through to jobRoutes handlers)
app.post('/api/jobs',
  authorizeAbility('job_create'),
  (req, _res, next) => next()
);
app.patch('/api/jobs/:id',
  authorizeAbility('job_edit'),
  (req, _res, next) => next()
);
app.delete('/api/jobs/:id',
  authorizeAbility('job_delete'),
  (req, _res, next) => next()
);
app.post('/api/jobs/:id/assign',
  authorizeAbility('job_assign'),
  (req, _res, next) => next()
);
app.post('/api/jobs/:id/unassign',
  authorizeAbility('job_unassign'),
  (req, _res, next) => next()
);

// Finally mount jobs router
app.use('/api/jobs', jobRoutes);

/* ===== Users (Admin only) ===== */
app.use('/api/users', authMiddleware, authorizeRoles('admin'), usersRoutes);

/* ===== Permissions (Admin only) ===== */
app.use('/api/permissions', authMiddleware, authorizeRoles('admin'), permissionsRoutes);

/* ===== Candidates =====
   Protect with abilities so Admin Hub choices matter:
   - candidate_view
   - candidate_create
   - candidate_edit
   - candidate_delete
*/
app.get('/api/candidates',
  authMiddleware,
  authorizeAbility('candidate_view'),
  (req, _res, next) => next()
);
app.post('/api/candidates',
  authMiddleware,
  authorizeAbility('candidate_create'),
  (req, _res, next) => next()
);
app.patch('/api/candidates/:id',
  authMiddleware,
  authorizeAbility('candidate_edit'),
  (req, _res, next) => next()
);
app.delete('/api/candidates/:id',
  authMiddleware,
  authorizeAbility('candidate_delete'),
  (req, _res, next) => next()
);

// Mount candidates router after guards
app.use('/api/candidates', candidatesRoutes);

/* ===== Upload (Admin + Employment) ===== */
app.post(
  '/api/upload',
  authMiddleware,
  // you can keep roles here or map to a specific ability like 'job_upload_photo'
  authorizeRoles('admin', 'employment'),
  upload.single('photo'),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  }
);

/* ---------- Health + HTML ---------- */
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));

// SPA pages; client JS will redirect to /login.html if no token
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/employment.html', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'employment.html')));
app.get('/login.html', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

/* ---------- Debug (optional) ---------- */
app.get('/debug/env', (_req, res) => {
  res.json({
    DB_USER: !!process.env.DB_USER,
    DB_HOST: !!process.env.DB_HOST,
    DB_NAME: !!process.env.DB_NAME,
    DB_PASSWORD: !!process.env.DB_PASSWORD,
    DB_PORT: process.env.DB_PORT || null,
    SESSION_SECRET: !!process.env.SESSION_SECRET
  });
});

/* ---------- 404 fallback ---------- */
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

/* ---------- Start ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
