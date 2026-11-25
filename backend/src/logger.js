// Logger estructurado: escribe JSON en stdout y emite LogRecords OTel
// (OpenTelemetry los correlaciona automáticamente con la traza activa: trace_id / span_id).
const { logs, SeverityNumber } = require('@opentelemetry/api');

const otelLogger = logs.getLogger('backend-api');
const SEVERITY = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

function log(level, message, attributes = {}) {
  const clean = {};
  for (const [k, v] of Object.entries(attributes)) {
    if (v !== undefined && v !== null) clean[k] = typeof v === 'object' ? JSON.stringify(v) : v;
  }
  if (process.env.NODE_ENV !== 'test') {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...clean }));
  }
  otelLogger.emit({
    severityNumber: SEVERITY[level] || SeverityNumber.INFO,
    severityText: level.toUpperCase(),
    body: message,
    attributes: { level, ...clean },
  });
}

module.exports = {
  info: (m, a) => log('info', m, a),
  warn: (m, a) => log('warn', m, a),
  error: (m, a) => log('error', m, a),
  debug: (m, a) => log('debug', m, a),
};
