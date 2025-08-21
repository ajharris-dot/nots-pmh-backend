const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { publicRouter: jobPublic, protectedRouter: jobProtected } = require('./routes/jobRoutes');
const authRoutes = require('./routes/authRoutes');
const authMiddleware = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Auth endpoints
app.use('/api/auth', authRoutes);

// Public job endpoints (GETs)
app.use('/api/jobs', jobPublic);

// Protected job endpoints (POST, PATCH, DELETE, assign/unassign)
app.use('/api/jobs', authMiddleware, jobProtected);

app.get('/', (req, res) => {
  res.send('NOTS PMH API is running.');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
