import Joi from 'joi';

/**
 * Money is an integer number of cents, never a float. 0.1 + 0.2 is not 0.3 in
 * binary floating point, and a price that drifts by a cent is a bug nobody can
 * reproduce. The API takes and returns `priceCents`, so the unit is in the name
 * and no caller has to guess.
 */
const sku = Joi.string()
  .pattern(/^[A-Za-z0-9-]{3,32}$/)
  .message('sku must be 3-32 characters of letters, digits or hyphens');

export const listProductsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().allow('').default(''),
});

export const createProductSchema = Joi.object({
  sku: sku.required(),
  name: Joi.string().min(1).max(200).required(),
  description: Joi.string().allow('').max(2000).default(''),
  priceCents: Joi.number().integer().min(0).required(),
  stock: Joi.number().integer().min(0).default(0),
});

export const updateProductSchema = Joi.object({
  sku,
  name: Joi.string().min(1).max(200),
  description: Joi.string().allow('').max(2000),
  priceCents: Joi.number().integer().min(0),
  /*
   * `stock` is deliberately absent: it moves through /stock, as a delta, so a
   * concurrent sale cannot be overwritten by a stale absolute value.
   */
}).min(1);

export const adjustStockSchema = Joi.object({
  delta: Joi.number().integer().invalid(0).required().messages({
    'any.invalid': 'delta must be a non-zero integer — use a negative number to remove stock',
  }),
});
