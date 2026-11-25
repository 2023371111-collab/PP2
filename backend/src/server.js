const app = require('./app');
const { initDb } = require('./db');
const logger = require('./logger');

const PORT = Number(process.env.PORT || 3000);

process.on('unhandledRejection', (err) =>
  logger.error('unhandledRejection', { event: 'exception', error_message: String(err?.message || err), error_stack: err?.stack }),
);
process.on('uncaughtException', (err) =>
  logger.error('uncaughtException', { event: 'exception', error_message: err.message, error_stack: err.stack }),
);

initDb()
  .then(() => {
    app.listen(PORT, () =>
      logger.info(`API escuchando en puerto ${PORT}`, { event: 'startup', port: PORT, version: process.env.APP_VERSION || 'dev' }),
    );
  })
  .catch((err) => {
    logger.error('No se pudo inicializar la base de datos', { event: 'exception', error_message: err.message });
    process.exit(1);
  });
