// Instrumentación OpenTelemetry (OTLP/HTTP -> OpenObserve).
// Se carga ANTES que la app con: node -r ./src/tracing.js src/server.js
// Emite: Trazas (HTTP, Express, consultas PostgreSQL), Métricas y Logs.
if (process.env.OTEL_ENABLED === 'true') {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
  const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
  const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
  const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');

  const base = (process.env.O2_OTLP_ENDPOINT || 'http://openobserve:5080/api/default').replace(/\/$/, '');
  const auth = 'Basic ' + Buffer.from(`${process.env.O2_USER}:${process.env.O2_PASSWORD}`).toString('base64');

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || 'backend-api',
    traceExporter: new OTLPTraceExporter({
      url: `${base}/v1/traces`,
      headers: { Authorization: auth, 'stream-name': 'default' },
    }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics`, headers: { Authorization: auth } }),
        exportIntervalMillis: 10000,
      }),
    ],
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({ url: `${base}/v1/logs`, headers: { Authorization: auth, 'stream-name': 'app_logs' } }),
      }),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
      }),
    ],
  });

  sdk.start();
  console.log(`[otel] OpenTelemetry iniciado -> ${base}`);

  const shutdown = () => sdk.shutdown().finally(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
