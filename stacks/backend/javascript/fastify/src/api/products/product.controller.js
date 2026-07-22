import * as service from './product.service.js';

/**
 * Controllers translate HTTP into a service call and back. They hold no logic:
 * no branching that is not about a status code, no database access, no rules.
 *
 * A thrown ApiError is caught by Fastify's error handler (app.js) — which is
 * why there is not a single try/catch in this file.
 */

export async function list(request) {
  return service.listProducts(request.query);
}

export async function get(request) {
  return service.getProduct(request.params.id);
}

export async function create(request, reply) {
  const product = await service.createProduct(request.body);
  return reply.status(201).send(product);
}

export async function update(request) {
  return service.updateProduct(request.params.id, request.body);
}

export async function adjustStock(request) {
  return service.adjustStock(request.params.id, request.body.delta);
}

export async function remove(request, reply) {
  await service.deleteProduct(request.params.id);
  return reply.status(204).send();
}
