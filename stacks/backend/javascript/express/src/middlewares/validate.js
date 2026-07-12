import { ApiError } from '../utils/ApiError.js';

/**
 * Validates one part of the request against a Joi schema and replaces it with
 * the coerced value, so handlers receive typed data (numbers, dates) rather
 * than the raw strings Express hands over.
 *
 *   router.post('/', validate(createUserSchema), controller.create)
 */
export const validate =
  (schema, property = 'body') =>
  (req, _res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));
      return next(ApiError.badRequest('Validation failed', details));
    }

    req[property] = value;
    return next();
  };
