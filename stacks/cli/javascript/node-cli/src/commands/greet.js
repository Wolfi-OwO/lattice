import { color } from '../lib/color.js';

export const greet = {
  name: 'greet',
  description: 'Greet someone by name',

  /**
   * @param {string[]} args   positionals after the command name
   * @param {object}   flags  parsed flags
   */
  async run(args, flags) {
    const name = args[0] ?? 'world';

    if (flags.json) {
      console.log(JSON.stringify({ greeting: 'hello', name }));
      return;
    }

    console.log(`${color.green('✔')} Hello, ${color.bold(name)}!`);
  },
};
