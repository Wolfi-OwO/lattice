/**
 * The products record. See ./user.js for why one description serves every
 * storage.
 */

export const NAME = 'products';

/** SKU is to a product what email is to a user: the key a human already knows. */
export const NATURAL_KEY = 'sku';

export const FIELDS = {
  id: { type: 'id' },
  sku: { type: 'string', required: true, unique: true, uppercase: true, trim: true },
  name: { type: 'string', required: true, trim: true },
  description: { type: 'string', default: '' },
  // Integer cents, never a float. Binary floating point cannot hold 0.10
  // exactly, and money that drifts by a cent is a bug nobody can reproduce.
  // The unit is in the name so no caller has to guess which one it is.
  priceCents: { type: 'integer', required: true, min: 0, column: 'price_cents' },
  stock: { type: 'integer', default: 0, min: 0 },
  createdAt: { type: 'timestamp', column: 'created_at' },
  updatedAt: { type: 'timestamp', column: 'updated_at' },
};
