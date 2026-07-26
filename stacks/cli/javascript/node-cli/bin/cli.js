#!/usr/bin/env node
import process from 'node:process';
import { run } from '../src/index.js';

run(process.argv.slice(2)).catch((error) => {
  /*
   * Anything that reaches here is a bug or a user error already formatted by
   * the command; print it plainly and exit non-zero so scripts can branch.
   */
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
