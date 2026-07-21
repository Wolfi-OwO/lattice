/**
 * Every record this application stores.
 *
 * Adapters read MODELS rather than importing each file, so adding a domain is
 * one import and one array entry here — and no adapter changes at all, in any
 * storage. That is the property CONVENTIONS rule 4 is trying to buy.
 *
 * Order is dependency order, not alphabetical. It does not matter yet; it will
 * the first time a table gains a foreign key, and by then the list is the
 * migration.
 */

import * as user from './user.js';
import * as product from './product.js';

export { user, product };

export const MODELS = [user, product];
