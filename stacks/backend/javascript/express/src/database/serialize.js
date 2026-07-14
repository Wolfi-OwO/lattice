/**
 * The one place a stored row becomes an API-visible user.
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

/** Case-insensitive "does this row match the ?q= search" — shared by the adapters
 *  that filter in memory (file, memory). SQL and Mongo push this into the query. */
export function matchesQuery(row, q) {
  if (!q) return true;
  const needle = String(q).toLowerCase();
  return (
    String(row.name ?? '').toLowerCase().includes(needle) ||
    String(row.email ?? '').toLowerCase().includes(needle)
  );
}

/** Newest first, then paginate. Shared by the in-memory-filtering adapters. */
export function paginate(rows, { page, limit }) {
  const sorted = [...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const start = (page - 1) * limit;
  return { items: sorted.slice(start, start + limit), total: sorted.length };
}
