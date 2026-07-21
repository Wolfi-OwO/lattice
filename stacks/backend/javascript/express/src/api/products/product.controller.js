import * as service from './product.service.js';

/**
 * Translates HTTP to a service call and a status code, and nothing else. There
 * is no try/catch here — an error thrown below is handled in exactly one place,
 * the error middleware, which is what keeps the failure shape identical across
 * every route in the API.
 */

export async function list(req, res) {
  res.json(await service.listProducts(req.query));
}

export async function get(req, res) {
  res.json(await service.getProduct(req.params.id));
}

export async function create(req, res) {
  res.status(201).json(await service.createProduct(req.body));
}

export async function update(req, res) {
  res.json(await service.updateProduct(req.params.id, req.body));
}

export async function remove(req, res) {
  await service.deleteProduct(req.params.id);
  res.status(204).end();
}

export async function adjustStock(req, res) {
  res.json(await service.adjustStock(req.params.id, req.body.delta));
}
