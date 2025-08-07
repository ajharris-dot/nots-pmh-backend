const express = require('express');
const app = express();

app.get('/healthz', (req, res) => res.status(200).json({ ok: true }));
app.get('/', (req, res) => res.send('NOTS PMH API is running!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
