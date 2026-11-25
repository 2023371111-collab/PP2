const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const logger = require('../logger');

const router = express.Router();
const FIELDS = 'id, name, email, role, created_at';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['admin', 'user'];

function validate(body, { creating }) {
  const errors = [];
  const { name, email, password, role } = body || {};
  if (!name || !String(name).trim()) errors.push('El nombre es obligatorio');
  if (!email || !EMAIL_RE.test(String(email))) errors.push('Email inválido');
  if ((creating || password) && (!password || String(password).length < 6)) {
    errors.push('La contraseña debe tener al menos 6 caracteres');
  }
  if (role && !ROLES.includes(role)) errors.push('Rol inválido');
  return errors;
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${FIELDS} FROM users ORDER BY id`);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${FIELDS} FROM users WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const errors = validate(req.body, { creating: true });
    if (errors.length) return res.status(400).json({ error: errors.join('. ') });
    const { name, email, password, role = 'user' } = req.body;
    const hash = await bcrypt.hash(String(password), 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING ${FIELDS}`,
      [String(name).trim(), String(email).toLowerCase().trim(), hash, role],
    );
    logger.info('Usuario creado', { event: 'user_created', user_id: rows[0].id, by: req.user.id });
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const errors = validate(req.body, { creating: false });
    if (errors.length) return res.status(400).json({ error: errors.join('. ') });
    const { name, email, password, role } = req.body;
    const hash = password ? await bcrypt.hash(String(password), 10) : null;
    const { rows } = await pool.query(
      `UPDATE users SET name = $1, email = $2, role = COALESCE($3, role),
         password_hash = COALESCE($4, password_hash)
       WHERE id = $5 RETURNING ${FIELDS}`,
      [String(name).trim(), String(email).toLowerCase().trim(), role || null, hash, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    logger.info('Usuario actualizado', { event: 'user_updated', user_id: rows[0].id, by: req.user.id });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    }
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });
    logger.info('Usuario eliminado', { event: 'user_deleted', user_id: Number(req.params.id), by: req.user.id });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
