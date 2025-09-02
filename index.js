// index.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const helmet = require('helmet');

const authRoutes = require('./routes/authRoutes');
const jobRoutes = require('./routes/jobRoutes');
const usersRoutes = require('./routes/usersRoutes');
const authMiddleware = require('./middleware/authMiddleware');
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

// Static site
app.use(express.static(path.join(__dirname, 'public')));

// Admin Hub page
app.get('/admin.html', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin.html'))
);

/* ---------- Helpers ---------- */
function authorizeRoles(...roles) {
  const normalized = roles.map(r => String(r).toLowerCase());
  return (req, res, next) => {
    const role = String(req.user?.role || '').toLowerCase();
    if (!role || !normalized.includes(role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

/* ---------- Routes ---------- */
// Auth
app.use('/api/auth', authRoutes);

/* ===== Jobs =====
   All GETs require auth (so the app is private).
   Role gates:
   - admin, operations: create/edit/delete/unassign
   - admin: assign
*/
app.use('/api/jobs', authMiddleware); // auth for all job routes (GET/POST/etc.)

// Create
app.post('/api/jobs',
  authorizeRoles('admin', 'operations'),
  (req, _res, next) => next()
);

// Edit
app.patch('/api/jobs/:id',
  authorizeRoles('admin', 'operations'),
  (req, _res, next) => next()
);

// Delete  <-- this is the one blocking you right now; give ops access here
app.delete('/api/jobs/:id',
  authorizeRoles('admin', 'operations'),
  (req, _res, next) => next()
);

// Assign (admin only)
app.post('/api/jobs/:id/assign',
  authorizeRoles('admin'),
  (req, _res, next) => next()
);

// Unassign (admin + operations)
app.post('/api/jobs/:id/unassign',
  authorizeRoles('admin', 'operations'),
  (req, _res, next) => next()
);

// Finally mount jobs router
app.use('/api/jobs', jobRoutes);


/* ===== Users (Admin only) ===== */
app.use('/api/users', authMiddleware, authorizeRoles('admin'), usersRoutes);

/* ===== Candidates =====
   Admin + Employment only (Operations excluded)
*/
app.use('/api/candidates',
  authMiddleware,
  authorizeRoles('admin', 'employment'),
  candidatesRoutes
);

/* ===== Upload (Admin only on main page) =====
   If you later want employment to upload, add 'employment' here too,
   but your current spec is admin-only on the main page.
*/
app.post(
  '/api/upload',
  authMiddleware,
  authorizeRoles('admin'),
  upload.single('photo'),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  }
);

/* ---------- Health + HTML ---------- */
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));

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
