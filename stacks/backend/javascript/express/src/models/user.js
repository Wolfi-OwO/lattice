/**
 * The users record.
 *
 * One description, whichever storage was selected. The adapter turns this into
 * whatever its driver needs — a CREATE TABLE for Postgres, MySQL and SQLite, a
 * Mongoose schema for Mongo, nothing at all for memory and file, which have no
 * schema to declare. That is the point of describing the record here instead of
 * inside six adapters: there is one place that says what a user *is*, and six
 * places that know how to store one.
 *
 * `column` exists because SQL is snake_case and JavaScript is camelCase, and
 * somebody has to own that mapping. Putting it beside the field keeps the two
 * from drifting the way a separate translation table always eventually does.
 */

export const NAME = 'users';

/**
 * The field the demo-data loader matches on, which is what makes seeding
 * idempotent — see CONVENTIONS rule 5. Email is the key a human already knows,
 * so a second seed run updates the row rather than creating a twin.
 */
export const NATURAL_KEY = 'email';

export const FIELDS = {
  id: { type: 'id' },
  email: { type: 'string', required: true, unique: true, lowercase: true, trim: true },
  name: { type: 'string', required: true, trim: true },
  // `select: false` in Mongo, and never in toPublicUser anywhere else. A hash is
  // not a secret the way a password is, but it is a thing to attack offline.
  passwordHash: { type: 'string', required: true, column: 'password_hash', secret: true },
  role: { type: 'enum', values: ['user', 'admin'], default: 'user' },
  createdAt: { type: 'timestamp', column: 'created_at' },
  updatedAt: { type: 'timestamp', column: 'updated_at' },
};
