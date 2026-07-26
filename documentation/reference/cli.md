# CLI reference

```bash
npm create lattice@latest [name] [options]
lattice [name] [options]                     # if installed globally
```

Anything you do not pass is asked for. Pass everything and it never prompts —
see [Non-interactive use](../getting-started/non-interactive.md).

## Options

| Flag | Value | Notes |
| --- | --- | --- |
| `--stack <id>` | see `--list` | Which template. |
| `--database <id>` | `mongodb` `postgres` `mysql` `sqlite` `file` `memory` | Only for stacks that persist — `express` and `fastify`. |
| `--format <fmt>` | `json` `ndjson` `yaml` | Only with `--database file`. Default `json`. |
| `--styling <id>` | `plain` `scss` `bootstrap` `tailwind` | Frontend stacks only. Default `plain`. |
| `--client <id>` | `react-vite` `react-vite-ts` | Makes it [fullstack](../stacks/fullstack.md): frontend into `client/`. |
| `--package <pkg>` | e.g. `com.example.api` | Java/Kotlin base package. Default `at.htlvillach.<name>`. |
| `--port <n>` | default `3000` | Backend port. The client, if any, takes this plus 2000. |
| `--generator <id>` | see `--list` | [Delegate](../stacks/generators.md) to the framework's own tool. |
| `--enterprise` | | Add the [overlay](../guides/enterprise-overlay.md). |
| `--owner <name>` | default `your-org` | GitHub owner for the overlay's badges. |
| `--no-install` | | Skip dependency installation. |
| `--no-database-start` | | Do not `docker compose up -d database`. The compose file and `.env` are still written. |
| `--force` | | Scaffold into a non-empty directory. |
| `--list` | | Show every stack, database and generator. |
| `--version` | | Print the version. |
| `--help` | | Show the options. |

### Flags are declared, so a typo is an error

```console
$ lattice my-api --stack express --databse postgres
✖ Unknown option "--databse". Run --help to see the options.
```

An argument parser that ignores what it does not recognise turns a typo into a
silently different project. This one exits non-zero.

The same holds for values:

```console
$ lattice my-api --stack expres
✖ Unknown stack "expres". Run with --list to see the options.
```

### …but a flag with a safe default is not demanded

`--styling` is the exception, and deliberately so. A missing `--database` is an
error because there is no safe default: picking one silently builds the project
against storage nobody asked for, and finding out costs a rewrite. `plain` is
exactly what the frontend templates shipped before the choice existed, so a
script that says nothing gets what it got before:

```console
$ lattice shop --stack react-vite < /dev/null
✔ Scaffolded shop
```

A *misspelled* `--styling` is still an error. Defaulting when a flag is absent is
not defaulting when it is wrong.

### A missing answer is not guessed

In a non-interactive environment — a script, a CI job, anything without a TTY —
a flag you left out is an error rather than a hang or a default:

```console
$ lattice my-api --stack express < /dev/null
✖ "Database:" needs an answer, but stdin is not interactive.
  Pass it as a flag. Options: mongodb, postgres, mysql, sqlite, file, memory
$ echo $?
1
```

## `lattice doctor`

```bash
lattice doctor [path]
```

Scores an existing project against the conventions rather than scaffolding a new
one. A subcommand rather than a flag because it is a different verb with a
different output — and because treating `doctor` as a project name would scaffold
a folder called `doctor`, which nobody wants.

`doctor` **scores; it never refuses.** The things that genuinely break a project
are caught by the structural gate during scaffolding, which rejects rather than
warns. Everything that is merely worth knowing lives here.

## Examples

```bash
# A REST API on Postgres, container started, dependencies installed
lattice my-api --stack express --database postgres

# The same thing with no Docker and nothing to install
lattice my-api --stack express --database sqlite --no-install

# A React app styled with Tailwind, mapped onto the same class contract
lattice shop --stack react-vite --styling tailwind

# Persist to newline-delimited JSON instead of running a database
lattice notes --stack express --database file --format ndjson

# Fullstack: Express at the root, typed React in client/, both installed
lattice shop --stack express --database sqlite --client react-vite-ts

# Spring Boot on port 8080 with your own package name
lattice orders --stack spring-boot --port 8080 --package com.example.orders

# Delegate to the real tool, then add the overlay
lattice web --generator sveltekit --enterprise --owner my-org

# Throwaway project for a CI job
lattice demo --stack fastify --database memory --no-database-start
```

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | The project was scaffolded, and everything reported succeeded. |
| `1` | Refused or failed. Nothing was left behind at the destination. |

That second row is the part worth trusting. Generation happens in a staging
directory and is renamed into place atomically, so a failure does not leave a
half-written project that looks real — the worst possible output, because the
only safe thing to do with it is delete it, and nothing tells you that you must.

