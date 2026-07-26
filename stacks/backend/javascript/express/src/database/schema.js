/**
 * Turning a model into a CREATE TABLE, once, for every SQL dialect.
 *
 * This lives in the seam rather than in src/models/ on purpose. A model
 * describes what a record *is*; it has no business knowing that MySQL spells a
 * string VARCHAR(255) and SQLite spells it TEXT. The direction of the dependency
 * is the whole design: adapters read models, models never read adapters.
 *
 * Three adapters share this because they otherwise share a bug. The dialects
 * differ in exactly the places that are easy to get subtly wrong — quoting a
 * numeric default, dropping NOT NULL from a defaulted column, indexing an
 * unbounded string — and writing the builder three times means finding each of
 * those three times.
 */

/**
 * @typedef {object} Dialect
 * @property {Record<string, (spec: object) => string>} types  how this driver spells each model type
 * @property {(field: string) => string} timestamp             the full column body for a timestamp
 * @property {string} [tableSuffix]                            appended after the closing paren
 * @property {boolean} [caseInsensitiveUnique]                 unique text compares case-insensitively
 */

/** Widest column name in the model, so the generated DDL lines up like handwritten DDL. */
function pad(model) {
  const names = Object.entries(model.FIELDS).map(([field, spec]) => (spec.column ?? field).length);
  return Math.max(...names);
}

/**
 * A default that reads as the type it is.
 *
 * Quoting a number is the failure worth guarding: Postgres silently coerces
 * `'0'` into an integer column, so the mistake never surfaces there — while
 * SQLite, which has no such coercion for a column it typed as INTEGER, stores
 * the string. One adapter's tolerance becomes another adapter's bug, and the
 * only place that difference can be caught once is here.
 */
function literal(spec) {
  return spec.type === 'integer' ? String(spec.default) : `'${spec.default}'`;
}

/** One model's CREATE TABLE in the given dialect. */
export function createTable(model, dialect) {
  const width = pad(model);

  const columns = Object.entries(model.FIELDS).map(([field, spec]) => {
    const name = (spec.column ?? field).padEnd(width);

    if (spec.type === 'timestamp') return `    ${name} ${dialect.timestamp(field)}`;

    const parts = [dialect.types[spec.type](spec)];

    if (spec.type !== 'id') {
      /*
       * A column carrying a default is never null — the default is what makes
       * that true. Emitting one without NOT NULL leaves a gap an explicit NULL
       * fits through, which puts a row in the table the model says cannot exist.
       */
      if (spec.required || spec.default !== undefined) parts.push('NOT NULL');

      if (spec.unique) {
        parts.push('UNIQUE');
        /*
         * An identifier a human types is one a human will typo the case of.
         * Where the dialect supports it, uniqueness compares case-insensitively
         * so Ada@example.com cannot register beside ada@example.com.
         */
        if (dialect.caseInsensitiveUnique && spec.type === 'string') parts.push('COLLATE NOCASE');
      }

      /*
       * MySQL rejects a DEFAULT on TEXT outright — "BLOB, TEXT, GEOMETRY or JSON
       * column can't have a default value" — so a dialect gets to refuse one.
       * The generated DDL is only useful if it is the DDL that dialect accepts.
       */
      const allowed = dialect.supportsDefault ? dialect.supportsDefault(spec) : true;
      if (spec.default !== undefined && allowed) parts.push(`DEFAULT ${literal(spec)}`);
    }

    return `    ${name} ${parts.join(' ')}`;
  });

  const suffix = dialect.tableSuffix ?? '';
  return `CREATE TABLE IF NOT EXISTS ${model.NAME} (\n${columns.join(',\n')}\n  )${suffix};`;
}

/**
 * Every model's CREATE TABLE, in declaration order.
 *
 * Returned as an array rather than one string because MySQL rejects multiple
 * statements in a single query() unless the connection opts into
 * multipleStatements — which widens the injection surface of every query the
 * pool runs, to buy a convenience needed once at startup. Postgres and SQLite
 * accept the joined script, so returning the joined form would work in two
 * adapters out of three and fail in the one nobody tests locally. It already
 * did, once.
 */
export function createTables(models, dialect) {
  return models.map((model) => createTable(model, dialect));
}

/**
 * The camelCase → column-name map an adapter needs when it writes SQL by hand.
 * Derived from the model so the mapping exists once; a second hand-written copy
 * is how a renamed column starts silently reading the old one.
 */
export function columnsOf(model, { skip = ['id'] } = {}) {
  return Object.fromEntries(
    Object.entries(model.FIELDS)
      .filter(([field, spec]) => !skip.includes(field) && spec.type !== 'timestamp')
      .map(([field, spec]) => [field, spec.column ?? field]),
  );
}
