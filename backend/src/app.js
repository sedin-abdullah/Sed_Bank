/** Express application wiring. Kept separate from server.js so tests can import it. */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';

import env from './config/env.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();

  // Render/Vercel sit behind a proxy — required for correct req.ip values.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      // Uploaded documents are rendered inline by the SPA on another origin.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin/tooling requests (curl, Postman, Newman) send no Origin.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin) || env.corsOrigins.includes('*')) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (!env.isTest) {
    app.use(morgan(env.isProd ? 'combined' : 'dev'));
  }

  // Uploaded KYC/income documents.
  app.use('/uploads', express.static(path.resolve(env.uploadDir), { maxAge: '1h' }));

  /** Liveness probe — also the endpoint UptimeRobot pings to keep Render awake. */
  app.get('/api/health', (_req, res) =>
    res.json({
      success: true,
      data: {
        service: 'sedbank-api',
        status: 'ok',
        environment: env.nodeEnv,
        testHooks: env.enableTestHooks,
        time: new Date().toISOString(),
      },
    })
  );

  app.get('/', (_req, res) =>
    res.json({
      success: true,
      data: { service: 'SedBank API', docs: '/api/health', version: '1.0.0' },
    })
  );

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
