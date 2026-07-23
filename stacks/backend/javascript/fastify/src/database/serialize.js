/**
 * The one place a stored row becomes an API-visible shape.
 *
 * Every adapter funnels through `toPublicUser`, which is why `passwordHash`
 * cannot leak: it is not omitted by convention at each call site, it simply has
 * no path out. Add a sensitive column tomorrow and it stays invisible unless
 * you list it here.
 */

const PUBLIC_FIELDS = ['id', 'email', 'name', 'role', 'createdAt', 'updatedAt'];

export function toPublicUser(row) {
  if (!row) return null;
  const user = {};
  for (const field of PUBLIC_FIELDS) {
    if (row[field] !== undefined) user[field] = row[field];
  }
  return user;
}

export function toPublicUsers(rows) {
  return rows.map(toPublicUser);
}

/**
 * Products have nothing to hide, so this looks redundant next to toPublicUser.
 * It is here anyway, for the same reason: the conversion is the only path from a
 * stored row to a response, so the day a product grows a cost price or a supplier
 * margin, there is already exactly one place that decides whether it is public.
 */
const PUBLIC_PRODUCT_FIELDS = [
  'id',
  'sku',
  'name',
  'description',
  'priceCents',
  'stock',
  'createdAt',
  'updatedAt',
];

export function toPublicProduct(row) {
  if (!row) return null;
  const product = {};
  for (const field of PUBLIC_PRODUCT_FIELDS) {
    if (row[field] !== undefined) product[field] = row[field];
  }
  return product;
}

export function toPublicProducts(rows) {
  return rows.map(toPublicProduct);
}

/**
 * Case-insensitive "does this row match the ?q= search" — shared by the adapters
 * that filter in memory (file, memory). SQL and Mongo push this into the query.
 *
 * The searchable fields are passed in rather than hardcoded, because what is worth
 * searching differs per domain: a user by name or email, a product by name or SKU.
 * The default keeps every existing users call unchanged.
 */
export function matchesQuery(row, q, fields = ['name', 'email']) {
  if (!q) return true;
  const needle = String(q).toLowerCase();
  return fields.some((field) =>
    String(row[field] ?? '')
      .toLowerCase()
      .includes(needle),
  );
}

/** Newest first, then paginate. Shared by the in-memory-filtering adapters. */
export function paginate(rows, { page, limit }) {
  const sorted = [...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const start = (page - 1) * limit;
  return { items: sorted.slice(start, start + limit), total: sorted.length };
}
