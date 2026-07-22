/**
 * JSON Schema, not Joi — see user.schema.js for why.
 *
 * Money is an integer number of cents, never a float. 0.1 + 0.2 is not 0.3 in
 * binary floating point, and a price that drifts by a cent is a bug nobody can
 * reproduce. `type: 'integer'` is what enforces that here: ajv rejects 19.99
 * outright, so a float price cannot reach a handler, let alone a column.
 */

const SKU_PATTERN = '^[A-Za-z0-9-]{3,32}$';

const product = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    sku: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    priceCents: { type: 'integer' },
    stock: { type: 'integer' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
};

export const listProductsSchema = {
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
        items: { type: 'array', items: product },
        total: { type: 'integer' },
        page: { type: 'integer' },
        limit: { type: 'integer' },
        pages: { type: 'integer' },
      },
    },
  },
};

export const getProductSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string' } },
  },
  response: { 200: product },
};

export const createProductSchema = {
  body: {
    type: 'object',
    required: ['sku', 'name', 'priceCents'],
    additionalProperties: false,
    properties: {
      sku: { type: 'string', pattern: SKU_PATTERN },
      name: { type: 'string', minLength: 1, maxLength: 200 },
      description: { type: 'string', maxLength: 2000, default: '' },
      priceCents: { type: 'integer', minimum: 0 },
      stock: { type: 'integer', minimum: 0, default: 0 },
    },
  },
  response: { 201: product },
};

export const updateProductSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string' } },
  },
  body: {
    type: 'object',
    minProperties: 1,
    // `stock` is deliberately absent, and additionalProperties:false is what
    // makes that a rejection rather than a silent drop: it moves through
    // /stock as a delta, so a concurrent sale cannot be overwritten by a
    // stale absolute value.
    additionalProperties: false,
    properties: {
      sku: { type: 'string', pattern: SKU_PATTERN },
      name: { type: 'string', minLength: 1, maxLength: 200 },
      description: { type: 'string', maxLength: 2000 },
      priceCents: { type: 'integer', minimum: 0 },
    },
  },
  response: { 200: product },
};

export const adjustStockSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string' } },
  },
  body: {
    type: 'object',
    required: ['delta'],
    additionalProperties: false,
    properties: {
      // A zero delta is a no-op the caller almost certainly did not mean, so it
      // is rejected rather than quietly accepted. ajv has no "not this value",
      // so it is expressed as the two ranges that exclude it.
      delta: {
        type: 'integer',
        anyOf: [{ maximum: -1 }, { minimum: 1 }],
      },
    },
  },
  response: { 200: product },
};

export const deleteProductSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string' } },
  },
};
