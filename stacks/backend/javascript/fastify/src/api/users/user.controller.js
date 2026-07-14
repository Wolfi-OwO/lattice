import * as service from './user.service.js';

/**
 * Controllers translate HTTP into a service call and back. They hold no logic:
 * no branching that is not about a status code, no database access, no rules.
 *
 * A thrown ApiError is caught by Fastify's error handler (app.js) — which is
 * why there is not a single try/catch in this file.
 */

export async function list(request) {
  return service.listUsers(request.query);
}

export async function get(request) {
  return service.getUser(request.params.id);
}

export async function create(request, reply) {
  const user = await service.createUser(request.body);
  return reply.status(201).send(user);
}

export async function update(request) {
  return service.updateUser(request.params.id, request.body);
}

export async function remove(request, reply) {
  await service.deleteUser(request.params.id);
  return reply.status(204).send();
}
