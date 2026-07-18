import { Router } from 'express';
import * as controller from './user.controller.js';
import { validate } from '../../middlewares/validate.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { createUserSchema, listUsersSchema, updateUserSchema } from './user.validation.js';

export const userRoutes = Router();

userRoutes.get('/', validate(listUsersSchema, 'query'), asyncHandler(controller.list));
userRoutes.get('/:id', asyncHandler(controller.get));
userRoutes.post('/', validate(createUserSchema), asyncHandler(controller.create));

userRoutes.patch('/:id', requireAuth, validate(updateUserSchema), asyncHandler(controller.update));

userRoutes.delete('/:id', requireAuth, requireRole('admin'), asyncHandler(controller.remove));
