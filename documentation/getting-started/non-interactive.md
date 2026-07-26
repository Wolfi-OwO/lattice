# Non-interactive use

Fully flagged, lattice never prompts — safe to run in a script, in CI, or in a
Dockerfile.

```bash
npm create lattice@latest my-api -- \
  --stack express \
  --database postgres \
  --port 4000 \
  --no-install \
  --no-database-start
```

## It does not guess

The important half of this is what happens when a flag is *missing*. An
underspecified run in a non-interactive environment does not hang waiting for
input nobody can give, and it does not quietly pick the first option:

```console
$ lattice my-api --stack express < /dev/null
✖ "Database:" needs an answer, but stdin is not interactive.
  Pass it as a flag. Options: mongodb, postgres, mysql, sqlite, file, memory
$ echo $?
1
```

Silently taking the first option would build the project against a database
nobody asked for, and the failure would surface days later as "why is this on
Mongo". Exiting non-zero and naming the flag is the only honest option.

The same applies to a typo. Flags are declared rather than free-form, so
`--databse postgres` is an error rather than an ignored argument:

```console
$ lattice my-api --stack express --databse postgres
✖ Unknown option "--databse". Run --help to see the options.
```

An unknown *value* is refused the same way, before anything is written:

```console
$ lattice my-api --stack expres
✖ Unknown stack "expres". Run with --list to see the options.
```

## In CI

```yaml
- run: |
    npx create-lattice@latest demo \
      --stack express --database memory --no-database-start
    cd demo && npm ci && npm test
```

`--database memory` needs no container and persists nothing, which is what you
want in a job that will be thrown away. `--no-database-start` still writes the
compose file and the `.env`, so the project is complete — it just does not try to
reach Docker.

!!! warning "`--force` scaffolds into a non-empty directory"

    By default lattice refuses to write into a directory that already has files
    in it, because the alternative is overwriting someone's work. `--force`
    turns that refusal off. In a script, prefer scaffolding into a fresh path
    over reaching for `--force`.

## Every flag

See the [CLI reference](../reference/cli.md) for the complete list, including
which flags are only meaningful with which stacks.
