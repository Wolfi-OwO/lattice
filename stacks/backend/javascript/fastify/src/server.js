import { createTerminus, HealthCheckError } from '@godaddy/terminus';

import { createApp } from './app.js';
import { config } from './config/index.js';
import { connectDatabase, disconnectDatabase, ping } from './database/index.js';
import { logger } from './utils/logger.js';

await connectDatabase();

const app = await createApp();

// `ready()` finishes registering plugins and routes, so Fastify's request handler
// is on app.server by the time terminus goes looking for it — terminus works by
// removing the server's existing 'request' listener and putting its own in front,
// delegating anything that is not a health check. Decorating a server whose
// handler is not attached yet would quietly give you a probe that answers nothing.
await app.ready();

/**
 * Terminus owns readiness and the shutdown sequence — the same arrangement as the
 * Express template, for the same reason. It is worth being explicit about what it
 * buys over the `process.once('SIGTERM')` handler that used to be here.
 *
 * That handler flipped a `draining` flag, and a Fastify route read the flag and
 * returned 503. It worked. What a route *inside* the app cannot do is hold that
 * promise on its own: the ordering between "start failing readiness" and "stop
 * accepting connections" is then something you maintain by hand, in a signal
 * handler, forever — and it is wrong the first time someone adds an `await` above
 * the flag. Terminus puts readiness on the http.Server, underneath Fastify, where
 * it answers 503 from the instant a signal lands while the app above it goes on
 * serving the requests already in flight.
 *
 * Liveness is deliberately NOT registered here. Terminus fails every probe it owns
 * during shutdown — correct for readiness, fatal for liveness, because a failing
 * liveness probe makes the kubelet SIGKILL the pod *mid-drain*, killing the very
 * drain this exists to perform. Liveness stays a Fastify route.
 */
createTerminus(app.server, {
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

    // `verbatim` is intentionally left off. Terminus merges a check's result into
    // a *shared* response object, so with verbatim the fields from one probe leak
    // into every later response. The default { status, info, details } shape does
    // not have that problem.
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

  /**
   * The socket is closed and in-flight requests are drained; release what the
   * process holds. `app.close()` runs Fastify's own onClose hooks — terminus closed
   * the server, but it knows nothing about the framework above it, so a plugin that
   * registered teardown would otherwise never hear that the process is going away.
   */
  onSignal: async () => {
    logger.info('Shutting down — closing storage');
    await app.close();
    await disconnectDatabase();
  },

  onShutdown: async () => {
    logger.info('Shutdown complete');
  },

  logger: (message, error) => logger.error(message, { error: error?.message }),
});

await app.listen({ port: config.port, host: '0.0.0.0' });

logger.info(`{{projectName}} listening on http://localhost:${config.port} [${config.env}]`);
