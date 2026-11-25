// Métricas por endpoint: latencia, volumen de peticiones y errores HTTP (statusCode, timestamp).
const { metrics } = require('@opentelemetry/api');
const logger = require('../logger');

const meter = metrics.getMeter('backend-api');
const requestCounter = meter.createCounter('http_requests_total', {
  description: 'Total de peticiones HTTP por endpoint',
});
const errorCounter = meter.createCounter('http_errors_total', {
  description: 'Total de respuestas HTTP con error (>=400) por endpoint',
});
const latency = meter.createHistogram('http_request_duration_ms', {
  description: 'Latencia de las peticiones HTTP en milisegundos',
  unit: 'ms',
});

function telemetry(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const rawRoute = req.route ? `${req.baseUrl}${req.route.path}` : req.baseUrl || 'unmatched';
    const route = rawRoute.length > 1 ? rawRoute.replace(/\/$/, '') : rawRoute;
    const attrs = { method: req.method, route, status_code: res.statusCode };

    requestCounter.add(1, attrs);
    latency.record(durationMs, attrs);
    if (res.statusCode >= 400) errorCounter.add(1, attrs);

    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${route} ${res.statusCode} ${durationMs.toFixed(1)}ms`, {
      event: 'http_request',
      method: req.method,
      route,
      path: req.originalUrl,
      status_code: res.statusCode,
      duration_ms: Number(durationMs.toFixed(2)),
      is_error: res.statusCode >= 400,
      user_id: req.user?.id,
      request_timestamp: new Date().toISOString(),
    });
  });
  next();
}

module.exports = telemetry;
