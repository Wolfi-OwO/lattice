import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

// Express identifies error middleware by arity — `next` must stay in the
// signature even though it is unused.
export function errorHandler(error, _req, res, _next) {
  const isKnown = error instanceof ApiError;
  const status = isKnown ? error.status : 500;

  if (!isKnown) {
    logger.error(error.message, { stack: error.stack });
  }

  res.status(status).json({
    error: {
      status,
      message: isKnown || config.isProduction === false ? error.message : 'Internal server error',
      ...(error.details ? { details: error.details } : {}),
    },
  });
}
