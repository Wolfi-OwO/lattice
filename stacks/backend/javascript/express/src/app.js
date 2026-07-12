import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';

import { api } from './api/index.js';
import { config } from './config/index.js';
import { errorHandler, notFound } from './middlewares/error.js';
import { requestLogger } from './middlewares/requestLogger.js';

/**
 * Builds the Express app without binding a port, so tests can drive it through
 * supertest and never touch the network.
 */
export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.cors.origin }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  app.use('/api', api);

  // Order matters: unmatched route first, then the error mapper.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
