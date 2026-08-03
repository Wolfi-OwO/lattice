import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { createTerminus, HealthCheckError } from '@godaddy/terminus';

import { apiRouter } from './routes/index.js';
import { config } from './config/index.js';
import { connectDatabase, disconnectDatabase, ping } from './database/index.js';
import { errorHandler, notFound } from './middlewares/error.js';
import { requestLogger } from './middlewares/requestLogger.js';
import { logger } from './utils/logger.js';

/**
 * The Express app, built and exported at module scope — not behind a
 * createApp() factory. Tests import `app` directly and drive it with
 * supertest; the guard at the bottom decides whether this file is also the
 * process entry point, so importing it alone never binds a port or touches
 * the database.
 */
export const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.cors.origin }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

app.use('/api', apiRouter);

// Order matters: unmatched route first, then the error mapper.
app.use(notFound);
app.use(errorHandler);

/**
 * True only for `node src/server.js` — false when a test imports `app`
 * above, which is what lets supertest drive the app without a real database
 * connection or a real listening socket.
 */
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  await connectDatabase();

  const server = http.createServer(app);

  /**
   * Terminus owns readiness and the shutdown sequence.
   *
   * The single thing it buys that a hand-rolled `server.close()` cannot: once a
   * signal arrives, it answers /readiness with 503 *while still serving traffic*. A
   * readiness route served by Express keeps returning 200 all the way through the
   * drain, so the load balancer happily routes new requests at a process that is
   * seconds from closing the socket. That is the bug this prevents.
   *
   * Liveness is deliberately NOT registered here — terminus fails every probe it
   * owns during shutdown, and a failing liveness probe makes Kubernetes SIGKILL
   * the pod mid-drain. It lives in routes/health.routes.js instead.
   */
  createTerminus(server, {
    signals: ['SIGTERM', 'SIGINT'],

    // Hard cap on draining in-flight requests before the process is torn down.
    timeout: 10_000,

    healthChecks: {
      '/api/health/readiness': async () => {
        const up = await ping();
        // Throwing is how terminus is told to answer 503.
        if (!up) throw new HealthCheckError('storage unreachable', { storage: 'down' });
        return { storage: 'up' };
      },

      /*
       * `verbatim` is intentionally left off. Terminus merges a check's result
       * into a *shared* response object, so with verbatim the fields from one
       * probe leak into every later response. The default { status, info, details }
       * shape does not have that problem.
       */
      __unsafeExposeStackTraces: !config.isProduction,
    },

    /**
     * Readiness is already failing by the time this runs. The pause gives the load
     * balancer time to notice and take this instance out of rotation *before* we
     * stop accepting connections — endpoint propagation is eventually consistent,
     * so closing immediately still drops live requests.
     */
    beforeShutdown: async () => {
      if (!config.isProduction) return;
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    },

    /** Connections are drained; release what the process holds. */
    onSignal: async () => {
      logger.info('Shutting down — closing storage');
      await disconnectDatabase();
    },

    onShutdown: async () => {
      logger.info('Shutdown complete');
    },

    logger: (message, error) => logger.error(message, { error: error?.message }),
  });

  server.listen(config.port, () => {
    logger.info(`{{projectName}} listening on http://localhost:${config.port} [${config.env}]`);
  });
}
