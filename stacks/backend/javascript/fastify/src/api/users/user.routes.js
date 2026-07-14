import { requireAuth } from '../../plugins/auth.js';
import * as controller from './user.controller.js';
import {
  createUserSchema,
  deleteUserSchema,
  getUserSchema,
  listUsersSchema,
  updateUserSchema,
} from './user.schema.js';

/**
 * Every route in one file: method, path, guard, schema, handler. Reading this
 * file tells you the whole HTTP surface of the resource and who can reach it.
 */
export async function userRoutes(app) {
  app.get('/', { schema: listUsersSchema }, controller.list);
  app.get('/:id', { schema: getUserSchema }, controller.get);

  app.post('/', { schema: createUserSchema }, controller.create);

  app.patch('/:id', { schema: updateUserSchema, preHandler: requireAuth }, controller.update);
  app.delete('/:id', { schema: deleteUserSchema, preHandler: requireAuth }, controller.remove);
}
