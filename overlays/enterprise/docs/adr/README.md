# Architecture Decision Records

An ADR captures **one decision that shaped the code**, the options that were
genuinely on the table, and what the choice cost — not just what it bought.

The point is the next person. Someone reading this in two years should understand
why the code is the way it is without reconstructing the argument from the diff.

## When to write one

Write an ADR when a decision is expensive to reverse and non-obvious in hindsight:
a database, an auth model, a boundary between two services, a framework you will
be married to. Do **not** write one for a decision the code already makes obvious.

## How

1. Copy [`template.md`](template.md) to `NNNN-short-title.md`, next number up.
2. Fill it in. Be honest about the options that were close — an ADR that lists one
   real option and two strawmen is not worth writing.
3. A decision, once accepted, is not edited. It is **superseded** by a new ADR that
   links back to it.

## Records

| # | Title | Status |
| --- | --- | --- |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
