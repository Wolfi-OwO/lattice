import process from 'node:process';

// Respect NO_COLOR and non-TTY output — a CLI that emits escape codes into a
// pipe is a CLI whose output cannot be parsed.
const enabled = process.stdout.isTTY && !process.env.NO_COLOR;

const wrap = (open, close) => (text) => (enabled ? `\x1b[${open}m${text}\x1b[${close}m` : text);

export const color = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
};
