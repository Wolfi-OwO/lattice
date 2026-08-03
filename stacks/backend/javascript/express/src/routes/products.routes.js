import { Router } from 'express';
import * as handlers from '../handlers/products.handlers.js';
import { validate } from '../middlewares/validate.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  adjustStockSchema,
  createProductSchema,
  listProductsSchema,
  updateProductSchema,
} from '../validation/product.validation.js';

export const productsRouter = Router();

/*
 * Reading a catalogue is public; changing it is not. That split mirrors users,
 * where anyone may register but only an authenticated caller may edit.
 */
productsRouter.get('/', validate(listProductsSchema, 'query'), asyncHandler(handlers.list));
productsRouter.get('/:id', asyncHandler(handlers.get));

productsRouter.post('/', requireAuth, validate(createProductSchema), asyncHandler(handlers.create));
productsRouter.patch(
  '/:id',
  requireAuth,
  validate(updateProductSchema),
  asyncHandler(handlers.update),
);

// Stock is a delta, not an assignment — see services/product-service.js.
productsRouter.post(
  '/:id/stock',
  requireAuth,
  validate(adjustStockSchema),
  asyncHandler(handlers.adjustStock),
);

productsRouter.delete('/:id', requireAuth, requireRole('admin'), asyncHandler(handlers.remove));
