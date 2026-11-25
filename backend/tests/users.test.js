const { app, request, loginAsAdmin, unique } = require('./helpers');
const { initDb, pool } = require('../src/db');

let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await initDb();
  token = await loginAsAdmin();
});
afterAll(() => pool.end());

describe('CRUD de usuarios', () => {
  test('crear, leer, actualizar y eliminar un usuario', async () => {
    const email = `${unique('user')}@test.com`;

    const created = await request(app).post('/api/users').set(auth())
      .send({ name: 'Usuario Prueba', email, password: 'secreto1', role: 'user' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Usuario Prueba', email, role: 'user' });
    expect(created.body.password_hash).toBeUndefined();
    const id = created.body.id;

    const list = await request(app).get('/api/users').set(auth());
    expect(list.status).toBe(200);
    expect(list.body.some((u) => u.id === id)).toBe(true);

    const one = await request(app).get(`/api/users/${id}`).set(auth());
    expect(one.status).toBe(200);
    expect(one.body.email).toBe(email);

    const updated = await request(app).put(`/api/users/${id}`).set(auth())
      .send({ name: 'Usuario Editado', email, role: 'admin' });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ name: 'Usuario Editado', role: 'admin' });

    // El usuario creado puede iniciar sesión con su contraseña
    const login = await request(app).post('/api/auth/login').send({ email, password: 'secreto1' });
    expect(login.status).toBe(200);

    const del = await request(app).delete(`/api/users/${id}`).set(auth());
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/users/${id}`).set(auth())).status).toBe(404);
  });

  test('valida campos obligatorios', async () => {
    const res = await request(app).post('/api/users').set(auth()).send({ name: '', email: 'no-es-email', password: '1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nombre/i);
  });

  test('no permite emails duplicados', async () => {
    const email = `${unique('dup')}@test.com`;
    const data = { name: 'Dup', email, password: 'secreto1' };
    expect((await request(app).post('/api/users').set(auth()).send(data)).status).toBe(201);
    expect((await request(app).post('/api/users').set(auth()).send(data)).status).toBe(409);
  });

  test('no permite que el administrador se elimine a sí mismo', async () => {
    const me = await request(app).get('/api/auth/me').set(auth());
    const res = await request(app).delete(`/api/users/${me.body.user.id}`).set(auth());
    expect(res.status).toBe(400);
  });

  test('usuario inexistente devuelve 404 e id inválido devuelve 400', async () => {
    expect((await request(app).get('/api/users/999999').set(auth())).status).toBe(404);
    expect((await request(app).get('/api/users/abc').set(auth())).status).toBe(400);
  });
});
