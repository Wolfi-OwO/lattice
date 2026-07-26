---
title: 'Architecture decisions'
edit_url: https://github.com/Wolfi-OwO/lattice/edit/main/docs/adr/README.md
---

!!! info "Mirrored from the repository"

    This page is [`docs/adr/README.md`](https://github.com/Wolfi-OwO/lattice/blob/main/docs/adr/README.md), rendered here. It is generated
    on every build, so edit the source rather than this copy — the pencil above
    already points there.

# Architecture Decision Records

An ADR captures **one decision**, the context that forced it, and the consequences
we accepted — so a year from now the reasoning survives, not just the outcome. A
reversed decision is not deleted; it is superseded by a new ADR that says why.

Format: [Michael Nygard's](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

| # | Decision | Status |
| --- | --- | --- |
| [0001](./0001-zero-dependency-core.md) | The scaffolder core ships zero runtime dependencies | Accepted |
| [0002](./0002-not-an-enterprise-layered-app.md) | lattice is a library, not an enterprise-layered application | Accepted |
| [0003](./0003-external-generators-are-opt-in.md) | External generators are opt-in, and the overlay is layered by toolchain | Accepted |

## Writing a new one

Copy the shape of an existing record:

```markdown
# ADR-NNNN — <short title in the present tense>

## Status
Proposed | Accepted | Superseded by ADR-XXXX

## Context
The forces at play. What is true that makes this a decision rather than an obvious call.

## Decision
What we will do, stated plainly.

## Consequences
What becomes easier, what becomes harder, and what we are explicitly accepting.
```
