const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jobRoutes = require('./routes/jobRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/api/jobs', jobRoutes);

app.get('/', (req, res) => {
  res.send('NOTS PMH API is running.');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});