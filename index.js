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
const candidatesRoutes = require('./routes/candidatesRoutes');
const authMiddleware = require('./middleware/authMiddleware');

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
  credentials: false,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
}));
app.options('*', cors());
app.use(express.json({ limit: '1mb' }));

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

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

/* ---------- Auth ---------- */
app.use('/api/auth', authRoutes);

/* ---------- Jobs ---------- */
// All job endpoints require auth
app.use('/api/jobs', authMiddleware);

// Writes: only certain roles
app.post('/api/jobs',
  authorizeRoles('admin', 'operations'),
  (req, _res, next) => next()
);
app.patch('/api/jobs/:id',
  authorizeRoles('admin', 'operations'),
  (req, _res, next) => next()
);
app.delete('/api/jobs/:id',
  authorizeRoles('admin', 'operations'),
  (req, _res, next) => next()
);

// Assign = admin only
app.post('/api/jobs/:id/assign',
  authorizeRoles('admin'),
  (req, _res, next) => next()
);

// Unassign = admin or operations
app.post('/api/jobs/:id/unassign',
  authorizeRoles('admin', 'operations'),
  (req, _res, next) => next()
);

// Mount router last
app.use('/api/jobs', jobRoutes);

/* ---------- Users (Admin only) ---------- */
app.use('/api/users', authMiddleware, authorizeRoles('admin'), usersRoutes);

/* ---------- Candidates (Admin + Employment) ---------- */
app.use('/api/candidates',
  authMiddleware,
  authorizeRoles('admin', 'employment'),
  candidatesRoutes
);

/* ---------- Upload (Admin only) ---------- */
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

// Protect Admin Hub page at server-level too
app.get('/admin.html',
  authMiddleware,
  authorizeRoles('admin'),
  (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html'))
);

// Public pages (client JS will redirect to /login.html if no token)
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/employment.html', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'employment.html')));
app.get('/login.html', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

/* ---------- 404 ---------- */
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

/* ---------- Start ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
