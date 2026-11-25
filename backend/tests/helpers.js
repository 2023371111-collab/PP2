const request = require('supertest');
const app = require('../src/app');

const ADMIN = {
  email: process.env.ADMIN_EMAIL || 'admin@demo.com',
  password: process.env.ADMIN_PASSWORD || 'Admin123!',
};

async function loginAsAdmin() {
  const res = await request(app).post('/api/auth/login').send(ADMIN);
  if (res.status !== 200) throw new Error(`Login admin falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

const unique = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

module.exports = { app, request, ADMIN, loginAsAdmin, unique };
