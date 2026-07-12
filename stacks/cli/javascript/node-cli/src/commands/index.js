import { greet } from './greet.js';
import { info } from './info.js';

/** The command registry. Add a file here and it appears in --help for free. */
export const commands = {
  [greet.name]: greet,
  [info.name]: info,
};
