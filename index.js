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

const permissionsRoutes = require('./routes/permissionsRoutes');

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
  credentials: false, // using JWT, not cookies
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
}));
app.options('*', cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- Role helper ---------- */
function authorizeRoles(...roles) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

/* ---------- Routes ---------- */
// Auth
app.use('/api/auth', authRoutes);

// Role gates in front of jobRoutes:
// - GETs remain public
// - POST /api/jobs -> admin, operations
app.post('/api/jobs',
  authMiddleware,
  authorizeRoles('admin', 'operations'),
  (req, _res, next) => next()
);

// - PATCH /api/jobs/:id -> admin
app.patch('/api/jobs/:id',
  authMiddleware,
  authorizeRoles('admin'),
  (req, _res, next) => next()
);

// - DELETE /api/jobs/:id -> admin
app.delete('/api/jobs/:id',
  authMiddleware,
  authorizeRoles('admin'),
  (req, _res, next) => next()
);

// - POST /api/jobs/:id/assign|unassign -> admin, employment
app.post('/api/jobs/:id/assign',
  authMiddleware,
  authorizeRoles('admin', 'employment'),
  (req, _res, next) => next()
);
app.post('/api/jobs/:id/unassign',
  authMiddleware,
  authorizeRoles('admin', 'employment'),
  (req, _res, next) => next()
);

// Jobs router (public GETs, protected writes pass-through due to gates above)
app.use('/api/jobs', jobRoutes);

// Admin-only Users portal
app.use('/api/users', authMiddleware, authorizeRoles('admin'), usersRoutes);

app.use('/api/permissions', authMiddleware, authorizeRoles('admin'), permissionsRoutes);

// Protected upload (admins + employment can upload photos)
app.post(
  '/api/upload',
  authMiddleware,
  authorizeRoles('admin', 'employment'),
  upload.single('photo'),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  }
);

/* ---------- Health + root ---------- */
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

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

/* ---------- Profile Permissions ---------- */

const permissionsRoutes = require('./routes/permissionsRoutes');

app.use('/api/permissions', authMiddleware, authorizeRoles('admin'), permissionsRoutes);

