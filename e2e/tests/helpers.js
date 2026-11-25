const { expect } = require('@playwright/test');

const ADMIN = {
  email: process.env.ADMIN_EMAIL || 'admin@demo.com',
  password: process.env.ADMIN_PASSWORD || 'Admin123!',
};

const unique = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

async function login(page, { email, password } = ADMIN) {
  await page.goto('/');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('logout')).toBeVisible();
}

async function apiToken(request) {
  const res = await request.post('/api/auth/login', { data: ADMIN });
  expect(res.status()).toBe(200);
  return (await res.json()).token;
}

module.exports = { ADMIN, unique, login, apiToken };
