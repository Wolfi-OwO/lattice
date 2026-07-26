/**
 * Command-line argument parsing.
 *
 * Flags are declared, not guessed. The parser this replaced treated "the next
 * token does not start with --" as "this flag takes a value", which quietly ate
 * the project name: `lattice --force myapp` set force="myapp", left no
 * positional argument, and scaffolded a project named from the prompt default
 * instead. Knowing which flags take a value is the only way a switch can sit in
 * front of the name.
 *
 * It also lets an unrecognised flag be an error rather than a silent no-op —
 * `--stak express` should not drop you into an interactive picker as though you
 * had asked for one.
 */

/** Switches. Present or absent; they never consume the following token. */
export const BOOLEAN_FLAGS = new Set([
  'help',
  'list',
  'version',
  'force',
  'verbose', // turn on debug-level diagnostics (src/logger.js)
  'strict', // `doctor --strict` exits non-zero on a failing grade, to gate CI
  'enterprise', // overlay the enterprise skeleton (docs/adr, todo, CI, community health)
  'no-install',
  'no-database-start',
  'no-db-start', // alias for --no-database-start
]);

/** Flags that take a value, either `--key value` or `--key=value`. */
export const VALUE_FLAGS = new Set([
  'stack',
  'template', // alias for --stack
  'database',
  'db', // alias for --database
  'format',
  'styling', // frontend look: plain | scss | bootstrap | tailwind
  'client',
  'package',
  'port',
  'owner', // GitHub owner/org for the enterprise overlay's badges and links
  'generator', // delegate the base scaffold to an external tool (create-vite, ng, …)
]);

/**
 * @param {string[]} argv
 * @returns {{ _: string[], flags: Record<string, string | true> }}
 * @throws on an unknown flag, or a value flag with no value
 */
export function parseArgs(argv) {
  const args = { _: [], flags: {} };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }

    const body = token.slice(2);
    const eq = body.indexOf('=');
    const key = eq === -1 ? body : body.slice(0, eq);
    const inline = eq === -1 ? null : body.slice(eq + 1);

    if (VALUE_FLAGS.has(key)) {
      const value = inline ?? argv[++i];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`--${key} needs a value. Run --help to see the options.`);
      }
      args.flags[key] = value;
    } else if (BOOLEAN_FLAGS.has(key)) {
      if (inline !== null) throw new Error(`--${key} is a switch and takes no value.`);
      args.flags[key] = true;
    } else {
      throw new Error(`Unknown option "--${key}". Run --help to see the options.`);
    }
  }

  return args;
}
