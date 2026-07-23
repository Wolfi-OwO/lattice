import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import cors from '@fastify/cors';

import { api } from './api/index.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { ApiError } from './utils/ApiError.js';

/**
 * Builds the app without binding a port, so tests drive it through
 * `app.inject()` and never touch the network — Fastify's own answer to
 * supertest, and the reason this template needs no HTTP test client.
 */
export async function createApp() {
  const app = Fastify({
    // Fastify logs through pino; the rest of the project logs through winston.
    // Two loggers means two formats in one stream, so Fastify's is turned off
    // and request logging is one hook below.
    logger: false,
    trustProxy: true,
    bodyLimit: 1_048_576,

    // Fastify defaults ajv to `removeAdditional: true`, which turns
    // `additionalProperties: false` into "quietly delete them" rather than
    // "refuse them". That is the wrong half of the choice for an API: a client
    // that PATCHes a field we do not accept gets 200 and believes it was
    // applied. The products template makes that concrete — `stock` is excluded
    // from PATCH on purpose, and under the default a caller setting it is told
    // the write succeeded while the value is dropped on the floor.
    //
    // Rejecting instead makes a typo'd or unsupported field a 400 that names it.
    ajv: { customOptions: { removeAdditional: false } },
  });

  // These two go FIRST, before any route is registered, and the order is not
  // cosmetic. `await app.register(...)` boots that plugin immediately, and a
  // plugin is an encapsulated child context that inherits whatever error handler
  // its parent had *at the moment it was created*. Register the routes first and
  // they capture Fastify's default handler — so validation failures come back in
  // Fastify's shape (`{ statusCode, code, error, message }`) while thrown errors
  // come back in ours, and the API quietly has two error envelopes.
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((request) => {
    throw ApiError.notFound(`Route ${request.method} ${request.url} does not exist`);
  });

  await app.register(helmet);
  await app.register(cors, { origin: config.cors.origin });
  await app.register(compress);

  app.addHook('onResponse', (request, reply, done) => {
    logger.http?.(
      `${request.method} ${request.url} ${reply.statusCode} ${Math.round(reply.elapsedTime)}ms`,
    );
    done();
  });

  await app.register(api, { prefix: '/api' });

  return app;
}

/**
 * One error envelope, the same one the other lattice backends return:
 *
 *   { "error": { "status": 400, "message": "...", "details": [...] } }
 *
 * Fastify's schema validation rejects a bad body *before* the handler runs and
 * throws its own error shape, so it is translated here rather than duplicated
 * into every route. A client needs one branch for any failure from any backend.
 */
function errorHandler(error, request, reply) {
  if (error.validation) {
    return reply.status(400).send({
      error: {
        status: 400,
        message: 'Validation failed',
        details: error.validation.map((issue) => ({
          // instancePath is "/email"; the leading slash is not a field name.
          field: issue.instancePath.replace(/^\//, '') || issue.params?.missingProperty || 'body',
          message: issue.message,
        })),
      },
    });
  }

  const isKnown = error instanceof ApiError;
  const status = isKnown ? error.status : (error.statusCode ?? 500);

  if (status >= 500) {
    logger.error(error.message, { stack: error.stack });
  }

  return reply.status(status).send({
    error: {
      status,
      message: isKnown || !config.isProduction ? error.message : 'Internal server error',
      ...(error.details ? { details: error.details } : {}),
    },
  });
}
