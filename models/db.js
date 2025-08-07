// models/db.js
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,           // e.g. dpg-xxxxx.ohio-postgres.render.com
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false },  // required for Render Postgres
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
