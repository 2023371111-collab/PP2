const { app, request, loginAsAdmin, unique } = require('./helpers');
const { initDb, pool } = require('../src/db');

let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await initDb();
  token = await loginAsAdmin();
});
afterAll(() => pool.end());

describe('CRUD de productos', () => {
  test('crear, leer, actualizar y eliminar un producto', async () => {
    const name = unique('Laptop');

    const created = await request(app).post('/api/products').set(auth())
      .send({ name, description: 'Equipo de prueba', price: 15999.5, stock: 10 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name, price: 15999.5, stock: 10 });
    const id = created.body.id;

    const list = await request(app).get('/api/products').set(auth());
    expect(list.status).toBe(200);
    expect(list.body.find((p) => p.id === id)).toBeDefined();

    const updated = await request(app).put(`/api/products/${id}`).set(auth())
      .send({ name: `${name}-v2`, description: 'Editado', price: 14999, stock: 5 });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ name: `${name}-v2`, price: 14999, stock: 5 });

    const one = await request(app).get(`/api/products/${id}`).set(auth());
    expect(one.body.description).toBe('Editado');

    expect((await request(app).delete(`/api/products/${id}`).set(auth())).status).toBe(204);
    expect((await request(app).get(`/api/products/${id}`).set(auth())).status).toBe(404);
  });

  test('rechaza precio negativo, stock decimal y nombre vacío', async () => {
    const res = await request(app).post('/api/products').set(auth()).send({ name: '', price: -1, stock: 1.5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nombre/);
    expect(res.body.error).toMatch(/precio/);
    expect(res.body.error).toMatch(/stock/);
  });

  test('actualizar o eliminar un producto inexistente devuelve 404', async () => {
    const put = await request(app).put('/api/products/999999').set(auth()).send({ name: 'x', price: 1, stock: 1 });
    expect(put.status).toBe(404);
    expect((await request(app).delete('/api/products/999999').set(auth())).status).toBe(404);
  });
});
