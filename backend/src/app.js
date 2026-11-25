const express = require('express');
const { trace, SpanStatusCode } = require('@opentelemetry/api');
const { pool } = require('./db');
const telemetry = require('./middleware/telemetry');
const { requireAuth } = require('./middleware/auth');
const logger = require('./logger');

const app = express();
app.disable('x-powered-by');
app.use(express.json());
app.use(telemetry);

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok', version: process.env.APP_VERSION || 'dev', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'down' });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', requireAuth, require('./routes/users'));
app.use('/api/products', requireAuth, require('./routes/products'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Manejo centralizado de errores: registra la excepción en logs y en la traza activa.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
  if (err.code === '23505') return res.status(409).json({ error: 'El registro ya existe (valor duplicado)' });
  if (err.code === '22P02') return res.status(400).json({ error: 'Identificador inválido' });

  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
  }
  logger.error('Excepción no controlada', {
    event: 'exception',
    error_message: err.message,
    error_stack: err.stack,
    path: req.originalUrl,
    method: req.method,
  });
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
