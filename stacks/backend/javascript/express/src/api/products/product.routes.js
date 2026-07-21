import { Router } from 'express';
import * as controller from './product.controller.js';
import { validate } from '../../middlewares/validate.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  adjustStockSchema,
  createProductSchema,
  listProductsSchema,
  updateProductSchema,
} from './product.validation.js';

export const productRoutes = Router();

// Reading a catalogue is public; changing it is not. That split mirrors users,
// where anyone may register but only an authenticated caller may edit.
productRoutes.get('/', validate(listProductsSchema, 'query'), asyncHandler(controller.list));
productRoutes.get('/:id', asyncHandler(controller.get));

productRoutes.post('/', requireAuth, validate(createProductSchema), asyncHandler(controller.create));
productRoutes.patch('/:id', requireAuth, validate(updateProductSchema), asyncHandler(controller.update));

// Stock is a delta, not an assignment — see product.service.js.
productRoutes.post(
  '/:id/stock',
  requireAuth,
  validate(adjustStockSchema),
  asyncHandler(controller.adjustStock),
);

productRoutes.delete('/:id', requireAuth, requireRole('admin'), asyncHandler(controller.remove));
