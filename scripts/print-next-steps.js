#!/usr/bin/env node
/**
 * Print a template's next steps, exactly as the CLI prints them to the user.
 *
 * This exists so CI can run those steps *verbatim* rather than re-typing a
 * sequence that works. The distinction is not academic: templates-python.yml
 * claimed in its own header to run them verbatim, but hardcoded its own working
 * sequence — it created the virtualenv the CLI never told anyone to create. So CI
 * passed while `lattice demo --stack ml-project` sent people straight into
 *
 *   source: no such file or directory: .venv/bin/activate
 *
 * A test that writes its own instructions cannot discover that the shipped ones
 * are wrong. Reading them from the registry is what makes the check real.
 *
 *   --stack <id>    the steps for one template, one per line
 *   --list          every template that declares steps, for a CI matrix
 */

import { TEMPLATES } from '../src/registry.js';

const argv = process.argv.slice(2);
const valueOf = (flag) => {
  const at = argv.indexOf(flag);
  return at === -1 ? null : argv[at + 1];
};

if (argv.includes('--list')) {
  console.log(TEMPLATES.filter((t) => t.post?.length).map((t) => t.framework).join('\n'));
  process.exit(0);
}

const stack = valueOf('--stack');
if (!stack) {
  console.error('usage: print-next-steps.js --stack <id>  |  --list');
  process.exit(2);
}

const template = TEMPLATES.find((t) => t.framework === stack);
if (!template) {
  console.error(`No template "${stack}". Known: ${TEMPLATES.map((t) => t.framework).join(', ')}`);
  process.exit(1);
}

console.log((template.post ?? []).join('\n'));
