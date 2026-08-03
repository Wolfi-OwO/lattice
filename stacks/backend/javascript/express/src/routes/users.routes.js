import { Router } from 'express';
import * as handlers from '../handlers/users.handlers.js';
import { validate } from '../middlewares/validate.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createUserSchema, listUsersSchema, updateUserSchema } from '../validation/user.validation.js';

export const usersRouter = Router();

usersRouter.get('/', validate(listUsersSchema, 'query'), asyncHandler(handlers.list));
usersRouter.get('/:id', asyncHandler(handlers.get));
usersRouter.post('/', validate(createUserSchema), asyncHandler(handlers.create));

usersRouter.patch('/:id', requireAuth, validate(updateUserSchema), asyncHandler(handlers.update));

usersRouter.delete('/:id', requireAuth, requireRole('admin'), asyncHandler(handlers.remove));
