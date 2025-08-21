const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Expect "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  jwt.verify(token, process.env.SESSION_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Unauthorized: Invalid token' });
    req.user = user; // Attach user info (id, role)
    next();
  });
}

module.exports = authMiddleware;
