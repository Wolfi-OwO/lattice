import { requireAuth, requireRole } from '../../plugins/auth.js';
import * as controller from './product.controller.js';
import {
  adjustStockSchema,
  createProductSchema,
  deleteProductSchema,
  getProductSchema,
  listProductsSchema,
  updateProductSchema,
} from './product.schema.js';

/**
 * Every route in one file: method, path, guard, schema, handler. Reading this
 * file tells you the whole HTTP surface of the resource and who can reach it.
 *
 * Reading a catalogue is public; changing it is not. That split mirrors users,
 * where anyone may register but only an authenticated caller may edit.
 */
export async function productRoutes(app) {
  app.get('/', { schema: listProductsSchema }, controller.list);
  app.get('/:id', { schema: getProductSchema }, controller.get);

  app.post('/', { schema: createProductSchema, preHandler: requireAuth }, controller.create);
  app.patch('/:id', { schema: updateProductSchema, preHandler: requireAuth }, controller.update);

  // Stock is a delta, not an assignment — see product.service.js.
  app.post(
    '/:id/stock',
    { schema: adjustStockSchema, preHandler: requireAuth },
    controller.adjustStock,
  );

  app.delete(
    '/:id',
    { schema: deleteProductSchema, preHandler: [requireAuth, requireRole('admin')] },
    controller.remove,
  );
}
