# Contributing to {{projectTitle}}

Thanks for taking the time. This document is short on purpose: it covers how to
get set up, what a good change looks like here, and how to get it merged.

## Getting set up

```bash
npm install
npm run dev
```

## Before you open a pull request

- `npm run lint` and `npm run build` pass.
- New behavior is covered by a test.
- Anything you made stale is updated: the README, `docs/`, `.env.example`,
  `CHANGELOG.md`.

## What a good change looks like here

- **One concern per PR.** A bug fix and a refactor in the same diff cannot be
  reviewed — or reverted — independently.
- **Explain the why, not the what.** The diff shows what changed. The PR
  description and the commit message are for the reason it changed.
- **A decision that shapes the code goes in an [ADR](docs/adr/README.md),** not
  only in a commit message where the next person will never find it.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`,
`fix:`, `docs:`, `refactor:`, `test:`, `ci:`, `chore:`. The release tooling reads
these to decide the next version.

## Reporting bugs and requesting features

Open an issue with the matching template. For anything security-related, use the
private channel in [SECURITY.md](SECURITY.md) instead — never a public issue.
