import assert from 'node:assert/strict';
import test from 'node:test';
import { greet } from '../src/commands/greet.js';

/** Capture console.log for the duration of `fn`. */
async function capture(fn) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));

  try {
    await fn();
  } finally {
    console.log = original;
  }

  return lines.join('\n');
}

test('greet defaults to world', async () => {
  const output = await capture(() => greet.run([], {}));
  assert.match(output, /Hello, world!/);
});

test('greet --json emits parseable output and nothing else', async () => {
  const output = await capture(() => greet.run(['Ada'], { json: true }));
  assert.deepEqual(JSON.parse(output), { greeting: 'hello', name: 'Ada' });
});
