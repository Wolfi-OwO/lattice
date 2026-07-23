import { healthRoutes } from './health/health.routes.js';
import { userRoutes } from './users/user.routes.js';
import { productRoutes } from './products/product.routes.js';

/** Everything under /api. Mounted once, in app.js. */
export async function api(app) {
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(userRoutes, { prefix: '/users' });
  await app.register(productRoutes, { prefix: '/products' });
}
