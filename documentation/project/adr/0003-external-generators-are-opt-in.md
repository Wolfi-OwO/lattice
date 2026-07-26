---
title: 'ADR-0003 — External generators are opt in'
edit_url: https://github.com/Wolfi-OwO/lattice/edit/main/docs/adr/0003-external-generators-are-opt-in.md
---

!!! info "Mirrored from the repository"

    This page is [`docs/adr/0003-external-generators-are-opt-in.md`](https://github.com/Wolfi-OwO/lattice/blob/main/docs/adr/0003-external-generators-are-opt-in.md), rendered here. It is generated
    on every build, so edit the source rather than this copy — the pencil above
    already points there.

# ADR-0003 — External generators are opt-in, and the overlay is layered by toolchain

## Status

Accepted.

## Context

lattice ships hand-written templates in `stacks/`. Every one of them is held to
CONVENTIONS.md — the same `users` resource, the same error envelope, the same drain
behaviour — and CI builds and tests each on every push. That is the product: a
scaffold that is *promised* to boot.

That promise is also the ceiling on breadth. Meeting it for a new language is weeks
of work, so the catalogue grows slowly, and it will never cover Rust, .NET, Astro,
Expo and the long tail of frontend frameworks. Meanwhile every one of those
ecosystems already ships an excellent official generator — `create-vite`, `ng new`,
`cargo new`, `dotnet new` — that is better maintained than any template lattice
could carry, because it is maintained by the framework team.

Re-implementing those by hand would be worse than useless: permanently behind
upstream, and wrong in ways users discover at build time.

## Decision

Two tiers, and they are not equal.

**Built-in stacks** (`--stack`) stay the default and the promise. Verified by CI,
held to CONVENTIONS.md, no network required.

**External generators** (`--generator`) delegate the base scaffold to the
framework's own tool, then apply lattice's overlay on top. Strictly opt-in, because
delegating gives up exactly three things the built-in stacks guarantee:

1. it needs the network,
2. it needs that toolchain installed,
3. its output is whatever upstream ships today, not something lattice verified.

Each generator is registered in `src/generators.js` with the real non-interactive
invocation, the binary it requires, and the commands that actually run what it
produced.

**The `--enterprise` overlay is applied in two layers.** `overlays/enterprise/` is
what is true of any project in any language: LICENSE, SECURITY.md, the ADR
directory, `todo/`, the Trivy scan, the release workflow.
`overlays/toolchain/<id>/` carries the two files that are emphatically not
language-neutral — `ci.yml` and `dependabot.yml`.

The toolchain is **detected from the project on disk** (`package.json`, `go.mod`,
`pom.xml`, `Cargo.toml`, `build.gradle`, `pyproject.toml`, `*.csproj`), not declared
in a registry. By the time the overlay runs the project exists, so the file that is
there is the truth — whether it was written by a lattice template or by `cargo new`.

## Consequences

- **Easier:** breadth arrives without diluting the promise. The two tiers are
  distinguishable by the user (one flag), so nobody mistakes a delegated scaffold
  for a verified one. Adding a language's CI is adding a directory under
  `overlays/toolchain/` — no existing code changes.
- **Harder:** upstream tools change their flags. A generator whose argv goes stale
  fails at scaffold time, which is why the invocations live in one registry and why
  they must be exercised by a scheduled workflow rather than trusted.
- **Why detection over declaration:** the alternative was a `toolchain` field on
  every generator *and* every template, kept in sync by hand. Detection covers both
  paths with one mechanism and cannot drift from reality.
- **The bug this fixed:** before the split, one npm-flavoured `ci.yml` and
  `dependabot.yml` went to every project. `--enterprise` on a Go module produced a
  pipeline whose first step was `npm ci`, and a Dependabot config GitHub rejects —
  a red repository on the first push. It affected the built-in Java and Python
  stacks too, not only the delegated ones.
- **Unrecognised toolchain:** the universal layer still lands; no CI is written.
  A missing workflow is a better outcome than one that cannot pass.
