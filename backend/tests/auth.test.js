const { app, request, ADMIN } = require('./helpers');
const { initDb, pool } = require('../src/db');

beforeAll(() => initDb());
afterAll(() => pool.end());

describe('Health', () => {
  test('GET /api/health responde ok con la base de datos conectada', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
  });

  test('una ruta inexistente responde 404', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
  });
});

describe('Login', () => {
  test('credenciales correctas devuelven token y usuario', async () => {
    const res = await request(app).post('/api/auth/login').send(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: ADMIN.email, role: 'admin' });
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('contraseña incorrecta devuelve 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: 'incorrecta' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Credenciales inválidas');
  });

  test('campos vacíos devuelven 400', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  test('GET /api/auth/me devuelve el usuario del token', async () => {
    const { body } = await request(app).post('/api/auth/login').send(ADMIN);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(ADMIN.email);
  });

  test('rutas protegidas sin token devuelven 401', async () => {
    expect((await request(app).get('/api/users')).status).toBe(401);
    expect((await request(app).get('/api/products')).status).toBe(401);
    const bad = await request(app).get('/api/products').set('Authorization', 'Bearer token-falso');
    expect(bad.status).toBe(401);
  });
});
