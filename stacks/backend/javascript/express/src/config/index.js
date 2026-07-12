import 'dotenv/config';

/**
 * All environment access happens here. The rest of the app imports `config`
 * and never touches process.env, so a missing variable fails loudly at boot
 * instead of surfacing as `undefined` deep in a request handler.
 */

function required(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

const env = process.env.NODE_ENV ?? 'development';

/** False for the file and in-memory adapters, which have no connection string. */
const DB_NEEDS_URL = {{dbNeedsUrl}};

function databaseUrl() {
  if (!DB_NEEDS_URL) return null;
  if (env === 'test') return process.env.DATABASE_URL_TEST ?? required('DATABASE_URL');
  return required('DATABASE_URL');
}

export const config = {
  env,
  isProduction: env === 'production',
  isTest: env === 'test',

  port: Number(process.env.PORT ?? {{port}}),

  /**
   * Consumed only by src/db. Each adapter reads the keys it cares about and
   * ignores the rest, so this shape holds whatever the storage turns out to be.
   */
  db: {
    adapter: '{{dbAdapter}}',
    url: databaseUrl(),
    dir: process.env.DATA_DIR ?? './data',
    format: process.env.DATA_FORMAT ?? '{{fileFormat}}',

    // Let the SQL adapters create the database if it does not exist yet. Only
    // under test: `npm test` on a fresh clone should not require someone to
    // remember a CREATE DATABASE first. Never in dev or prod, where a typo'd
    // database name should fail loudly instead of silently making a new one.
    autoCreate: env === 'test',
  },

  jwt: {
    secret: env === 'test' ? 'test-secret' : required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  },

  cors: {
    origin: process.env.CORS_ORIGIN ?? '*',
  },

  logLevel: process.env.LOG_LEVEL ?? (env === 'production' ? 'info' : 'debug'),
};
