# Getting started

Three pages, in the order you need them.

1. **[Installation](installation.md)** — what you need on the machine first, and
   why there is nothing to install for lattice itself.
2. **[Your first project](first-project.md)** — scaffold something, run it, and
   read what the CLI actually did.
3. **[Non-interactive use](non-interactive.md)** — the same thing from a script
   or from CI, where nothing may prompt.

## The short version

```bash
npm create lattice@latest my-api -- --stack express --database postgres
cd my-api
npm run dev
```

That is a running REST API with JWT auth, Joi validation, Winston logging, a
Postgres container that is already up, a `.env` that already matches it, and a
test suite that already passes.

!!! tip "The `--` matters"

    `npm create` passes everything after `--` to the package rather than
    interpreting it itself. Without it, `npm` swallows `--stack` and lattice
    starts prompting as though you had given it nothing.
