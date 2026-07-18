/**
 * The storage catalogue.
 *
 * One entry per persistence choice a user can make. This is the single source
 * of truth for: which adapter file survives scaffolding, which dependencies get
 * added to package.json, what goes in .env, and which docker service (if any)
 * has to be running before the app boots.
 *
 * The templates themselves are storage-agnostic — every backend talks to a
 * repository interface (src/database/index.js), never to a driver. Adding a database
 * here plus one adapter file in the stack is the whole job; no service, route or
 * controller changes.
 */

/**
 * @typedef {object} Storage
 * @property {string}  label       shown in the picker
 * @property {string}  hint        one-line description
 * @property {string}  adapter     basename of the adapter in src/database/adapters/
 * @property {boolean} needsUrl    has a connection string (vs. a dir, or nothing at all)
 * @property {object}  deps        npm deps merged into package.json
 * @property {boolean} [durable]   survives a process restart
 * @property {boolean} [server]    needs a running database server
 * @property {number}  [defaultPort] conventional host port; probed for a free one at scaffold time
 * @property {object}  [compose]   docker compose service definition
 * @property {(vars: object) => object} [env]  env vars written to .env
 */

/** @type {Record<string, Storage>} */
export const STORAGE = {
  // ------------------------------------------------------------ real servers
  mongodb: {
    label: 'MongoDB',
    hint: 'Document store · mongoose — what most of your projects already use',
    adapter: 'mongo',
    needsUrl: true,
    // v9 requires Node >= 20.19, which every supported runtime here satisfies. The
    // adapter uses only Schema/connect/model/isValidObjectId, stable across the 8->9
    // boundary — and the mongodb job scaffolds and tests against a real container,
    // so this is verified rather than assumed.
    deps: { mongoose: '^9.7.4' },
    durable: true,
    server: true,
    defaultPort: 27017,
    env: (v) => ({
      DATABASE_URL: `mongodb://127.0.0.1:${v.databasePort}/${v.projectName}`,
      DATABASE_URL_TEST: `mongodb://127.0.0.1:${v.databasePort}/${v.projectName}-test`,
    }),
    compose: (v) => ({
      image: 'mongo:7',
      ports: [`${v.databasePort}:27017`],
      volumes: [`${v.projectName}-database:/data/db`],
      healthcheck: {
        test: ['CMD', 'mongosh', '--eval', "db.adminCommand('ping')"],
        interval: '10s',
        timeout: '5s',
        retries: 5,
      },
    }),
    composeUrl: (v) => `mongodb://database:27017/${v.projectName}`,
  },

  postgres: {
    label: 'PostgreSQL',
    hint: 'Relational · pg — the default for anything with real relations',
    adapter: 'postgres',
    needsUrl: true,
    deps: { pg: '^8.12.0' },
    durable: true,
    server: true,
    defaultPort: 5432,
    env: (v) => ({
      DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${v.databasePort}/${v.projectName}`,
      DATABASE_URL_TEST: `postgres://postgres:postgres@127.0.0.1:${v.databasePort}/${v.projectName}_test`,
    }),
    compose: (v) => ({
      image: 'postgres:16-alpine',
      ports: [`${v.databasePort}:5432`],
      environment: {
        POSTGRES_USER: 'postgres',
        POSTGRES_PASSWORD: 'postgres',
        POSTGRES_DB: v.projectName,
      },
      volumes: [`${v.projectName}-database:/var/lib/postgresql/data`],
      healthcheck: {
        test: ['CMD-SHELL', 'pg_isready -U postgres'],
        interval: '10s',
        timeout: '5s',
        retries: 5,
      },
    }),
    composeUrl: (v) => `postgres://postgres:postgres@database:5432/${v.projectName}`,
  },

  mysql: {
    label: 'MySQL / MariaDB',
    hint: 'Relational · mysql2 — the DB your HTL Java work runs against',
    adapter: 'mysql',
    needsUrl: true,
    deps: { mysql2: '^3.11.0' },
    durable: true,
    server: true,
    defaultPort: 3306,
    env: (v) => ({
      DATABASE_URL: `mysql://root:root@127.0.0.1:${v.databasePort}/${v.projectName}`,
      DATABASE_URL_TEST: `mysql://root:root@127.0.0.1:${v.databasePort}/${v.projectName}_test`,
    }),
    compose: (v) => ({
      image: 'mysql:8',
      ports: [`${v.databasePort}:3306`],
      environment: {
        MYSQL_ROOT_PASSWORD: 'root',
        MYSQL_DATABASE: v.projectName,
      },
      volumes: [`${v.projectName}-database:/var/lib/mysql`],
      healthcheck: {
        test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost', '-proot'],
        interval: '10s',
        timeout: '5s',
        retries: 10,
      },
    }),
    composeUrl: (v) => `mysql://root:root@database:3306/${v.projectName}`,
  },

  // -------------------------------------------------------------- no server
  sqlite: {
    label: 'SQLite',
    hint: 'Relational, zero-config · a single file on disk, no server',
    adapter: 'sqlite',
    needsUrl: true,
    // v12, not v11: v11 ships no prebuilt binary for Node 24's ABI, so `npm install`
    // falls back to a node-gyp source build and fails on any machine without a C++
    // toolchain. CI runs Node 20 and never saw it; anyone on current Node hit it
    // immediately. v12 declares support through Node 26.
    deps: { 'better-sqlite3': '^12.11.1' },
    durable: true,
    server: false,
    env: (v) => ({ DATABASE_URL: `file:./data/${v.projectName}.db` }),
  },

  file: {
    label: 'Plain files',
    hint: 'No database — rows persisted to disk as JSON / NDJSON / YAML',
    adapter: 'file',
    needsUrl: false,
    deps: {},
    durable: true,
    server: false,
    // `fileFormat` is asked for separately and lands in .env.
    formats: [
      { value: 'json', label: 'JSON', hint: 'One .json file, human-readable, rewritten on change' },
      { value: 'ndjson', label: 'NDJSON', hint: 'One row per line — appends cheaply, survives partial writes' },
      { value: 'yaml', label: 'YAML', hint: 'Same as JSON but hand-editable; adds a yaml dependency' },
    ],
    env: (v) => ({
      DATA_DIR: './data',
      DATA_FORMAT: v.fileFormat ?? 'json',
    }),
    depsFor: (format) => (format === 'yaml' ? { yaml: '^2.5.0' } : {}),
  },

  memory: {
    label: 'In-memory',
    hint: 'Nothing persisted — wiped on restart. Good for demos and tests',
    adapter: 'memory',
    needsUrl: false,
    deps: {},
    durable: false,
    server: false,
    env: () => ({}),
  },
};

/** Picker order — most-used first, then the no-server options. */
export const STORAGE_ORDER = ['mongodb', 'postgres', 'mysql', 'sqlite', 'file', 'memory'];

export function storageChoices() {
  return STORAGE_ORDER.map((id) => ({
    value: id,
    label: STORAGE[id].label,
    hint: STORAGE[id].hint,
  }));
}

/** Every npm dep a storage choice pulls in, including format-conditional ones. */
export function depsFor(storageId, fileFormat) {
  const storage = STORAGE[storageId];
  if (!storage) return {};
  return {
    ...storage.deps,
    ...(storage.depsFor ? storage.depsFor(fileFormat) : {}),
  };
}
