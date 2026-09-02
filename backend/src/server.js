/** Process entry point: database, HTTP server, Socket.IO and the ageing job. */
import http from 'node:http';
import env from './config/env.js';
import logger from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { createApp } from './app.js';
import { initSocket } from './realtime/socket.js';
import { refreshAllDelinquency } from './services/loanService.js';
import { bootstrapDemoData } from './config/bootstrap.js';
import Config from './models/Config.js';

let server;
let sweepTimer;

async function start() {
  await connectDatabase();

  // Materialise the config singleton so the very first request is not a write.
  await Config.getSingleton();

  // Provision demo logins when the database is ephemeral (see bootstrap.js).
  await bootstrapDemoData();

  const app = createApp();
  server = http.createServer(app);
  initSocket(server);

  server.listen(env.port, () => {
    logger.info(`SedBank API listening on http://localhost:${env.port} (${env.nodeEnv})`);
    if (env.enableTestHooks) logger.warn('Test hooks are ENABLED — do not run this way in production.');
  });

  // Age overdue accounts on boot, then on a timer.
  try {
    const result = await refreshAllDelinquency();
    logger.info(`Delinquency sweep on boot: ${result.scanned} loan(s) scanned, ${result.updated} updated.`);
  } catch (error) {
    logger.error(`Boot delinquency sweep failed: ${error.message}`);
  }

  if (env.delinquencySweepMinutes > 0) {
    sweepTimer = setInterval(async () => {
      try {
        await refreshAllDelinquency();
      } catch (error) {
        logger.error(`Scheduled delinquency sweep failed: ${error.message}`);
      }
    }, env.delinquencySweepMinutes * 60 * 1000);
    sweepTimer.unref?.();
  }
}

async function shutdown(signal) {
  logger.info(`${signal} received — shutting down.`);
  clearInterval(sweepTimer);

  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await disconnectDatabase().catch(() => {});
  process.exit(0);
}

['SIGINT', 'SIGTERM'].forEach((signal) => process.on(signal, () => shutdown(signal)));

process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection:', reason));
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

start().catch((error) => {
  logger.error('Failed to start SedBank API:', error);
  process.exit(1);
});
