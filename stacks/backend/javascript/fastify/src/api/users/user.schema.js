/**
 * JSON Schema, not Joi.
 *
 * Fastify compiles these with ajv and validates *before* the handler runs, so a
 * bad request never reaches a controller — and the same schema serialises the
 * response, which is a second reason `passwordHash` cannot leak: a field absent
 * from the response schema is dropped on the way out even if a bug puts it there.
 */

const user = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
};

export const listUsersSchema = {
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      q: { type: 'string', default: '' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        items: { type: 'array', items: user },
        total: { type: 'integer' },
        page: { type: 'integer' },
        limit: { type: 'integer' },
        pages: { type: 'integer' },
      },
    },
  },
};

export const getUserSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string' } },
  },
  response: { 200: user },
};

export const createUserSchema = {
  body: {
    type: 'object',
    required: ['email', 'name', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
      name: { type: 'string', minLength: 2, maxLength: 80 },
      password: { type: 'string', minLength: 8, maxLength: 128 },
      role: { type: 'string', enum: ['user', 'admin'], default: 'user' },
    },
  },
  response: { 201: user },
};

export const updateUserSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string' } },
  },
  body: {
    type: 'object',
    minProperties: 1,
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
      name: { type: 'string', minLength: 2, maxLength: 80 },
      role: { type: 'string', enum: ['user', 'admin'] },
    },
  },
  response: { 200: user },
};

export const deleteUserSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string' } },
  },
};
