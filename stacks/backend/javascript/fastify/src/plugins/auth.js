import jwt from 'jsonwebtoken';

import { config } from '../config/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * A preHandler, not a global hook: authentication is declared per route, next to
 * the route it guards (see user.routes.js). A global hook with an exemption list
 * is the shape that eventually leaks — someone adds a route, forgets the list,
 * and it is public. Here, a route is either declared with `requireAuth` or it is
 * deliberately open, and you can see which by reading one file.
 */
export async function requireAuth(request) {
  const header = request.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw ApiError.unauthorized('Missing or malformed Authorization header');
  }

  try {
    request.user = jwt.verify(token, config.jwt.secret);
  } catch {
    // Never echo the library's reason back to the caller: "jwt expired" versus
    // "invalid signature" tells an attacker which half of the guess was right.
    throw ApiError.unauthorized('Invalid or expired token');
  }
}

/**
 * Use after requireAuth: `preHandler: [requireAuth, requireRole('admin')]`.
 *
 * Kept separate from requireAuth rather than folded in as an option, so that a
 * route missing the role check reads as missing — an argument that defaults to
 * "any role" is the shape where a forgotten parameter silently means public.
 */
export const requireRole =
  (...roles) =>
  async (request) => {
    if (!request.user || !roles.includes(request.user.role)) {
      throw ApiError.forbidden();
    }
  };

/** Issued on login. The payload is the minimum a request needs to be authorised. */
export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}
