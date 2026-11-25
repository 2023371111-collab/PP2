const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const logger = require('./logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://app:app@localhost:5432/app',
});

async function waitForDb(retries = 30) {
  for (let i = 0; ; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i >= retries) throw err;
      logger.warn('Esperando base de datos...', { event: 'db_wait', attempt: i + 1 });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function initDb() {
  await waitForDb();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      password_hash VARCHAR(200) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const email = process.env.ADMIN_EMAIL || 'admin@demo.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin123!';
  const hash = await bcrypt.hash(password, 10);
  const { rowCount } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO NOTHING`,
    ['Administrador', email, hash],
  );
  if (rowCount) logger.info('Usuario administrador creado', { event: 'seed_admin', email });
}

module.exports = { pool, initDb };
