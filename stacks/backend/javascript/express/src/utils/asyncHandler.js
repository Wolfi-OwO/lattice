/**
 * Express 4 does not catch rejections from async handlers, so every async
 * route is wrapped in this. Drop it if you move to Express 5.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
