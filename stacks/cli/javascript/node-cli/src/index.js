import process from 'node:process';
import { parseArgs } from 'node:util';

import { commands } from './commands/index.js';
import { color } from './lib/color.js';

const USAGE = `
  ${color.bold('{{projectName}}')} — {{projectTitle}}

  ${color.bold('Usage')}
    {{projectName}} <command> [options]

  ${color.bold('Commands')}
${Object.values(commands)
  .map((cmd) => `    ${cmd.name.padEnd(12)} ${color.gray(cmd.description)}`)
  .join('\n')}

  ${color.bold('Options')}
    -h, --help       Show this help
    -v, --version    Show the version
    --json           Machine-readable output
`;

export async function run(argv) {
  // node:util's parseArgs is built in — no yargs, no commander, no install.
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      json: { type: 'boolean' },
    },
  });

  const [commandName, ...rest] = positionals;

  if (values.version) {
    const { default: pkg } = await import('../package.json', { with: { type: 'json' } });
    console.log(pkg.version);
    return;
  }

  if (!commandName || values.help) {
    console.log(USAGE);
    return;
  }

  const command = commands[commandName];

  if (!command) {
    console.error(`${color.red('✖')} Unknown command "${commandName}"`);
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }

  await command.run(rest, values);
}
