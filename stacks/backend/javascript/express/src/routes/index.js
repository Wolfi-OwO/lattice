import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { usersRouter } from './users.routes.js';
import { productsRouter } from './products.routes.js';

/**
 * One place that knows every resource. Add a file under routes/, then mount
 * it here — nothing else in the app needs to change.
 *
 * The health probes are split on purpose:
 *   /api/health/liveness   here, in Express      — must stay 200 while draining
 *   /api/health/readiness  in server.js, terminus — must turn 503 while draining
 * The reasoning is in health.routes.js.
 */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/products', productsRouter);
