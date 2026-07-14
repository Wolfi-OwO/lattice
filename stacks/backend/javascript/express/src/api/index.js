import { Router } from 'express';
import { healthRoutes } from './health/health.routes.js';
import { userRoutes } from './users/user.routes.js';

/**
 * One place that knows every resource. Add a folder under api/, then mount it
 * here — nothing else in the app needs to change.
 *
 * The health probes are split on purpose:
 *   /api/health/liveness   here, in Express      — must stay 200 while draining
 *   /api/health/readiness  in server.js, terminus — must turn 503 while draining
 * The reasoning is in health.routes.js.
 */
export const api = Router();

api.use('/health', healthRoutes);
api.use('/users', userRoutes);
