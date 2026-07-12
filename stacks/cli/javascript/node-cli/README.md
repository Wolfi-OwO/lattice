# {{projectName}}

{{projectTitle}} — a Node.js CLI with **zero runtime dependencies**.

```bash
npm install
npm link              # puts `{{projectName}}` on your PATH
{{projectName}} --help
{{projectName}} greet Ada
{{projectName}} info --json
npm test
```

## Layout

```
bin/cli.js            Shebang + top-level error handling. Nothing else.
src/
├── index.js          Arg parsing, help text, command dispatch
├── commands/
│   ├── index.js      The registry — add a command here and it shows in --help
│   ├── greet.js      Each command: { name, description, run(args, flags) }
│   └── info.js
└── lib/color.js      ANSI colours that respect NO_COLOR and pipes
tests/                node:test — no framework needed
```

## Adding a command

Create `src/commands/thing.js` exporting `{ name, description, run }`, then add
it to `src/commands/index.js`. Help text and dispatch update themselves.

## Why no dependencies

`node:util`'s `parseArgs` covers flags and positionals, and `node:test` covers
testing. For a CLI, that means no install step for users, no supply-chain
surface, and a startup time measured in milliseconds. Reach for a library only
when you actually need something these don't do.

## Two conventions worth keeping

**`--json` on every command.** Anything a human reads, a script should be able
to parse. When `--json` is set, print *only* JSON — no spinner, no colour, no
"Done!".

**Colours off when piped.** `lib/color.js` checks `isTTY` and `NO_COLOR`, so
escape codes never corrupt output that something else is reading.
