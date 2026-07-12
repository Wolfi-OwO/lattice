import os from 'node:os';
import process from 'node:process';
import { color } from '../lib/color.js';

export const info = {
  name: 'info',
  description: 'Print environment information',

  async run(_args, flags) {
    const data = {
      node: process.version,
      platform: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      cwd: process.cwd(),
    };

    if (flags.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    for (const [key, value] of Object.entries(data)) {
      console.log(`  ${color.gray(key.padEnd(10))} ${value}`);
    }
  },
};
