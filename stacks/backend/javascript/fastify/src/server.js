import { createApp } from './app.js';
import { config } from './config/index.js';
import { connectDatabase, disconnectDatabase } from './database/index.js';
import { setDraining } from './api/health/health.routes.js';
import { logger } from './utils/logger.js';

await connectDatabase();

const app = await createApp();
await app.listen({ port: config.port, host: '0.0.0.0' });

logger.info(`{{projectName}} listening on http://localhost:${config.port} [${config.env}]`);

/**
 * Graceful shutdown, in the order that matters.
 *
 * `setDraining()` flips /api/health/ready to 503 *first*, while the server is
 * still accepting and serving requests. Only then do we stop accepting. Closing
 * the socket first — which is all `app.close()` on its own does — drops the
 * requests that were already in flight toward this instance, because a load
 * balancer's endpoint list is eventually consistent and keeps routing here for
 * a beat after the process decides to die.
 *
 * Liveness deliberately keeps answering 200 throughout: a failing liveness probe
 * makes Kubernetes SIGKILL the pod, which would kill the very drain this exists
 * to perform.
 */
const GRACE_MS = config.isProduction ? 5_000 : 0;

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    logger.info(`${signal} received — draining`);
    setDraining();

    // Let the load balancer see the 503 and take this instance out of rotation.
    await new Promise((resolve) => setTimeout(resolve, GRACE_MS));

    await app.close();
    await disconnectDatabase();

    logger.info('Shutdown complete');
    process.exit(0);
  });
}
