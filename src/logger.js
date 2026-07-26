/**
 * A small leveled logger — zero-dependency by necessity (lattice ships none), but
 * modeled deliberately on the Winston setup used across the services this is built
 * by the same hand as (network-visualizer, portfolio-webpage): a level taken from
 * the environment, a console sink, and a `timestamp level: message` line with the
 * level colorized. Errors print their stack, exactly like those services do.
 *
 * It is for DIAGNOSTICS — `debug` for the machinery, `warn`/`error` for trouble —
 * NOT for the user-facing progress the CLI prints itself (the "✔ Scaffolded …"
 * lines). Those are UX and stay on stdout. Logs go to **stderr**, so enabling
 * `--verbose` can never contaminate anything a script parses from stdout.
 *
 * Why not just import Winston like the services do: those are long-lived servers
 * on Azure where structured transports and Application Insights earn their weight.
 * This is a process that runs for two seconds and exits. A dependency here would
 * cost every `npm create lattice` a slower cold start to serve a debug flag almost
 * nobody sets. The format is the part worth keeping; the framework is not.
 */
import process from 'node:process';

import { c } from './prompts.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

/**
 * `LATTICE_LOG_LEVEL` wins; `LOG_LEVEL` is honored as a fallback because that is
 * the variable the generated templates and the author's own services already read,
 * so one mental model covers all of them. `--verbose` (wired in bin/) sets
 * `LATTICE_LOG_LEVEL=debug`.
 */
export function currentLevel() {
  const raw = (process.env.LATTICE_LOG_LEVEL || process.env.LOG_LEVEL || 'info').toLowerCase();
  return raw in LEVELS ? raw : 'info';
}

const PAINT = { error: c.red, warn: c.yellow, info: c.cyan, debug: c.gray };

function line(level, message) {
  const timestamp = new Date().toISOString();
  return `${c.gray(timestamp)} ${PAINT[level](level)}: ${message}`;
}

function emit(level, value) {
  if (LEVELS[level] > LEVELS[currentLevel()]) return;

  /*
   * An Error logs its message and, at debug level, its stack — the services print
   * `${message} - ${stack}`; this keeps that shape.
   */
  const message =
    value instanceof Error
      ? currentLevel() === 'debug' && value.stack
        ? `${value.message} - ${value.stack}`
        : value.message
      : String(value);

  process.stderr.write(`${line(level, message)}\n`);
}

export const logger = {
  error: (value) => emit('error', value),
  warn: (value) => emit('warn', value),
  info: (value) => emit('info', value),
  debug: (value) => emit('debug', value),
  currentLevel,
};
