---
title: 'ADR-0002 — Not an enterprise layered app'
edit_url: https://github.com/Wolfi-OwO/lattice/edit/main/docs/adr/0002-not-an-enterprise-layered-app.md
---

!!! info "Mirrored from the repository"

    This page is [`docs/adr/0002-not-an-enterprise-layered-app.md`](https://github.com/Wolfi-OwO/lattice/blob/main/docs/adr/0002-not-an-enterprise-layered-app.md), rendered here. It is generated
    on every build, so edit the source rather than this copy — the pencil above
    already points there.

# ADR-0002 — lattice is a library, not an enterprise-layered application

## Status

Accepted.

## Context

There is steady pressure — from checklists, from "enterprise-grade" templates, and
from the author's own deployed services — to restructure the scaffolder into a
layered/DDD/hexagonal application: `application/` + `organizational/`, domain
boundaries, RBAC, feature flags, a plugin system, observability stacks.

Those patterns are *correct* — for the projects they came from. The author's
`portfolio-webpage` and `network-visualizer` are long-lived, multi-service apps
deployed to Azure Container Apps; `application/` (client + server + jobs) beside
`organizational/` (deploy runbooks) is exactly right there.

lattice is a different kind of program: a single-purpose **CLI library** published
to npm, ~800 lines, that runs for two seconds and exits. Applying a deployed-app
architecture to it would add domain layers with one domain, boundaries between
modules that all change together, and abstractions with a single implementation.

## Decision

lattice keeps a **flat, library-idiomatic layout**: `bin/` (entry), `src/` (the
code, one file per concern), `stacks/` (templates), `tests/`, `scripts/`, `docs/`.
No `application/`/`organizational/` split, no layered/DDD scaffolding, no RBAC or
feature-flag machinery in the CLI.

The "enterprise" qualities we *do* adopt are the ones that fit a serious library:
- rigorous CI (real projects built and tested, not just the scaffolder),
- provenance-signed, tokenless (OIDC) releases,
- conventions enforced as tests,
- ADRs, a security policy, contribution docs,
- a leveled logger.

Where enterprise *application* patterns belong is in what lattice **generates** —
the templates already ship layering, health probes, graceful shutdown, and Winston
logging, and can grow Azure Application Insights wiring. The advice lives in the
output, not in the tool.

## Consequences

- **Easier:** the codebase stays legible; a change touches one obvious file;
  `npm create` stays instant; new contributors are not taxed by ceremony.
- **Harder:** it will *look* less "enterprise" to a checklist that scores folder
  count. That is the correct trade — YAGNI and KISS over cargo-culting a structure
  that solves problems this program does not have.
- **Boundary:** if lattice ever grows a genuinely separate concern (e.g. an
  AI-backed advisor that needs network and a model), that is a *separate package*
  — not a layer bolted into this one. Keeping the core pure is the whole point.
