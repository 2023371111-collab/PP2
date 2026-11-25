const { test, expect } = require('@playwright/test');
const { ADMIN, apiToken, unique } = require('./helpers');

test.describe('API (Backend) vía Playwright', () => {
  test('health check responde 200 con la BD conectada', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', db: 'ok' });
  });

  test('login correcto devuelve token; incorrecto devuelve 401', async ({ request }) => {
    const ok = await request.post('/api/auth/login', { data: ADMIN });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).token).toBeTruthy();

    const bad = await request.post('/api/auth/login', { data: { email: ADMIN.email, password: 'x' } });
    expect(bad.status()).toBe(401);
  });

  test('endpoints protegidos requieren token', async ({ request }) => {
    expect((await request.get('/api/users')).status()).toBe(401);
    expect((await request.get('/api/products')).status()).toBe(401);
  });

  test('CRUD completo de productos por API', async ({ request }) => {
    const headers = { Authorization: `Bearer ${await apiToken(request)}` };
    const name = unique('Monitor');

    const created = await request.post('/api/products', { headers, data: { name, price: 3500, stock: 4 } });
    expect(created.status()).toBe(201);
    const { id } = await created.json();

    const updated = await request.put(`/api/products/${id}`, { headers, data: { name, price: 3200, stock: 2 } });
    expect(updated.status()).toBe(200);
    expect(await updated.json()).toMatchObject({ price: 3200, stock: 2 });

    expect((await request.delete(`/api/products/${id}`, { headers })).status()).toBe(204);
    expect((await request.get(`/api/products/${id}`, { headers })).status()).toBe(404);
  });

  test('CRUD completo de usuarios por API', async ({ request }) => {
    const headers = { Authorization: `Bearer ${await apiToken(request)}` };
    const email = `${unique('api')}@test.com`;

    const created = await request.post('/api/users', { headers, data: { name: 'API User', email, password: 'secreto1' } });
    expect(created.status()).toBe(201);
    const { id } = await created.json();

    const updated = await request.put(`/api/users/${id}`, { headers, data: { name: 'API User 2', email } });
    expect(updated.status()).toBe(200);

    expect((await request.delete(`/api/users/${id}`, { headers })).status()).toBe(204);
  });
});
