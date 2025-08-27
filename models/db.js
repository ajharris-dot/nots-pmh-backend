// models/db.js
const { Pool } = require('pg');

const hasUrl = !!process.env.DATABASE_URL;
const ssl =
  process.env.PGSSLMODE === 'disable'
    ? false
    : { rejectUnauthorized: false }; // Render usually needs this

const pool = hasUrl
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl,
      max: parseInt(process.env.PGPOOL_MAX || '10', 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    })
  : new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      ssl,
      max: parseInt(process.env.PGPOOL_MAX || '10', 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

pool.on('error', (err) => {
  console.error('Unexpected PG pool error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool, // <-- export this too
};
