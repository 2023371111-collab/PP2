const express = require('express');
const { pool } = require('../db');
const logger = require('../logger');

const router = express.Router();

function parse(body) {
  const errors = [];
  const name = body?.name ? String(body.name).trim() : '';
  const description = body?.description ? String(body.description) : '';
  const price = Number(body?.price);
  const stock = Number(body?.stock ?? 0);
  if (!name) errors.push('El nombre es obligatorio');
  if (body?.price === undefined || body?.price === null || body?.price === '' || Number.isNaN(price) || price < 0) {
    errors.push('El precio debe ser un número mayor o igual a 0');
  }
  if (!Number.isInteger(stock) || stock < 0) errors.push('El stock debe ser un entero mayor o igual a 0');
  return { errors, data: { name, description, price, stock } };
}

const toJson = (p) => ({ ...p, price: Number(p.price) });

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products ORDER BY id');
    res.json(rows.map(toJson));
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(toJson(rows[0]));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { errors, data } = parse(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('. ') });
    const { rows } = await pool.query(
      'INSERT INTO products (name, description, price, stock) VALUES ($1, $2, $3, $4) RETURNING *',
      [data.name, data.description, data.price, data.stock],
    );
    logger.info('Producto creado', { event: 'product_created', product_id: rows[0].id, by: req.user.id });
    res.status(201).json(toJson(rows[0]));
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { errors, data } = parse(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('. ') });
    const { rows } = await pool.query(
      `UPDATE products SET name = $1, description = $2, price = $3, stock = $4, updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [data.name, data.description, data.price, data.stock, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
    logger.info('Producto actualizado', { event: 'product_updated', product_id: rows[0].id, by: req.user.id });
    res.json(toJson(rows[0]));
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Producto no encontrado' });
    logger.info('Producto eliminado', { event: 'product_deleted', product_id: Number(req.params.id), by: req.user.id });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
