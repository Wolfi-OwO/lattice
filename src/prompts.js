/**
 * Zero-dependency interactive prompts: a text input and an arrow-key select.
 * Falls back to plain numbered input when stdin is not a TTY (CI, pipes).
 */

import readline from 'node:readline';
import process from 'node:process';

const ESC = '\x1b[';

export const c = {
  reset: (s) => `\x1b[0m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[22m`,
  dim: (s) => `\x1b[2m${s}\x1b[22m`,
  red: (s) => `\x1b[31m${s}\x1b[39m`,
  green: (s) => `\x1b[32m${s}\x1b[39m`,
  yellow: (s) => `\x1b[33m${s}\x1b[39m`,
  cyan: (s) => `\x1b[36m${s}\x1b[39m`,
  gray: (s) => `\x1b[90m${s}\x1b[39m`,
};

export class PromptCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'PromptCancelled';
  }
}

const isTTY = () => process.stdin.isTTY && process.stdout.isTTY;

/**
 * Whether a question can be asked at all.
 *
 * Exported so a caller with a defensible default can use it instead of the
 * prompt — see resolveStyling in bin/lattice.js. Most choices have no such
 * default and must fail loudly instead; that is what `unanswerable` below is for.
 */
export const isInteractive = () => Boolean(isTTY());

/**
 * Latched once stdin reaches EOF with a question still unanswered.
 *
 * This is not bookkeeping — it is the fix for a hang. A readline interface
 * created on an *already-ended* stdin never emits `line` and never emits
 * `close`: it simply waits forever for input that cannot arrive. So the first
 * prompt after EOF fell back to its default correctly, and the second one hung
 * the process — which meant a partially-flagged run in CI (`--stack spring-boot`
 * with no `--package`, needing two text prompts) hung instead of finishing or
 * failing. Once stdin is known to be exhausted, no further interface is created.
 */
let stdinEnded = false;

/**
 * One line of input. Resolves `{ value, eof }`; `eof` means stdin ended without
 * answering and `value` is just the default.
 */
function readLine(message, defaultValue) {
  if (stdinEnded) return Promise.resolve({ value: defaultValue, eof: true });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? c.gray(` (${defaultValue})`) : '';

  return new Promise((resolve) => {
    let answered = false;

    rl.question(`${c.green('?')} ${c.bold(message)}${suffix} `, (value) => {
      answered = true;
      rl.close();
      resolve({ value, eof: false });
    });

    rl.once('close', () => {
      // Closing after an answer is us; closing before one is EOF.
      if (answered) return;
      stdinEnded = true;
      process.stdout.write('\n');
      resolve({ value: defaultValue, eof: true });
    });
  });
}

/**
 * Arrow-key select. `choices` is [{ value, label, hint }].
 */
export async function select(message, choices) {
  if (!isTTY()) return selectFallback(message, choices);

  return new Promise((resolve, reject) => {
    let index = 0;
    let lines = 0;

    const render = () => {
      if (lines > 0) process.stdout.write(`${ESC}${lines}A`);
      let out = `${c.green('?')} ${c.bold(message)}\n`;
      for (const [i, choice] of choices.entries()) {
        const active = i === index;
        const pointer = active ? c.cyan('❯') : ' ';
        const label = active ? c.cyan(choice.label) : choice.label;
        const hint = choice.hint ? ` ${c.gray(choice.hint)}` : '';
        out += `${ESC}2K${pointer} ${label}${hint}\n`;
      }
      lines = choices.length + 1;
      process.stdout.write(out);
    };

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('keypress', onKey);
    };

    const onKey = (_str, key) => {
      if (key.name === 'up' || key.name === 'k') {
        index = (index - 1 + choices.length) % choices.length;
        render();
      } else if (key.name === 'down' || key.name === 'j') {
        index = (index + 1) % choices.length;
        render();
      } else if (key.name === 'return') {
        cleanup();
        // Redraw the answered line only, collapsing the option list.
        process.stdout.write(`${ESC}${lines}A`);
        for (let i = 0; i < lines; i++) process.stdout.write(`${ESC}2K\n`);
        process.stdout.write(`${ESC}${lines}A`);
        process.stdout.write(
          `${c.green('✔')} ${c.bold(message)} ${c.cyan(choices[index].label)}\n`,
        );
        resolve(choices[index].value);
      } else if (key.ctrl && (key.name === 'c' || key.name === 'd')) {
        cleanup();
        process.stdout.write('\n');
        reject(new PromptCancelled());
      }
    };

    process.stdin.on('keypress', onKey);
    render();
  });
}

/**
 * There is no defensible default for a choice.
 *
 * A text prompt can fall back to its default on EOF and still be right. A select
 * cannot: silently taking the first option would hand a scripted run MongoDB
 * because it happens to sort first, and the project would be built against a
 * database nobody asked for. An underspecified non-interactive run has to fail
 * and say what was missing.
 */
function unanswerable(message, choices) {
  const options = choices.map((ch) => ch.value).join(', ');
  return new Error(
    `"${message}" needs an answer, but stdin is not interactive.\n` +
      `  Pass it as a flag. Options: ${options}`,
  );
}

async function selectFallback(message, choices) {
  if (stdinEnded) throw unanswerable(message, choices);

  const listing = choices
    .map((ch, i) => `  ${i + 1}) ${ch.label}${ch.hint ? ` — ${ch.hint}` : ''}`)
    .join('\n');

  const { value, eof } = await readLine(
    `${message}\n${listing}\nSelect [1-${choices.length}]`,
    '',
  );
  if (eof) throw unanswerable(message, choices);

  const i = Number.parseInt(String(value).trim(), 10) - 1;
  if (Number.isNaN(i) || i < 0 || i >= choices.length) {
    throw new Error(`Invalid selection: ${String(value).trim()}`);
  }
  return choices[i].value;
}

/**
 * Free-text input with a default. `validate` returns an error string or null.
 *
 * On EOF (piped stdin, CI, a fully-flagged run) the default answers the prompt,
 * which is what makes a scripted invocation non-interactive rather than a hang.
 */
export async function text(message, defaultValue = '', validate = () => null) {
  for (;;) {
    const { value: raw, eof } = await readLine(message, defaultValue);
    const value = String(raw).trim() || defaultValue;

    const error = validate(value);

    if (!error) {
      // Say so out loud — a default silently chosen is a default nobody noticed.
      if (eof) {
        process.stdout.write(
          `${c.green('✔')} ${c.bold(message)} ${c.cyan(value)} ${c.gray('(default)')}\n`,
        );
      }
      return value;
    }

    // Re-prompting after EOF would spin forever — there is no one left to
    // answer. Fail loudly instead, naming the flag that would have fixed it.
    if (eof) {
      throw new Error(`${message} ${error} (no TTY — pass it as a flag)`);
    }

    process.stdout.write(`${c.red('✖')} ${error}\n`);
  }
}
