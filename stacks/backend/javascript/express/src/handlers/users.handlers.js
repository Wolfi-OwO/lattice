import * as service from '../services/user-service.js';

/**
 * Handlers only translate HTTP <-> service calls. Any `if` in here that is
 * not about HTTP belongs in the service.
 */

export async function list(req, res) {
  res.json(await service.listUsers(req.query));
}

export async function get(req, res) {
  res.json(await service.getUser(req.params.id));
}

export async function create(req, res) {
  const user = await service.createUser(req.body);
  res.status(201).location(`/api/users/${user.id}`).json(user);
}

export async function update(req, res) {
  res.json(await service.updateUser(req.params.id, req.body));
}

export async function remove(req, res) {
  await service.deleteUser(req.params.id);
  res.status(204).send();
}
