# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** {{year}}-01-01

## Context

Decisions that shape a codebase — a database, an auth model, a service boundary —
get made once and lived with for years. The reasoning behind them tends to live in
someone's head, a closed pull request, or a Slack thread nobody can find. The next
person sees only the result, cannot tell a deliberate trade-off from an accident,
and "fixes" things that were decided on purpose.

## Options considered

- **Nothing** — keep the reasoning in commit messages and memory. Free, and it is
  exactly the status quo that produces the problem above.
- **A wiki** — searchable, but it drifts from the code because it lives somewhere
  else and is updated by someone else.
- **ADRs in the repo** — the decisions live beside the code they explain, are
  reviewed in the same pull request, and are versioned with it.

## Decision

Record architecture decisions as numbered Markdown files in `docs/adr/`, using the
format described by Michael Nygard. A decision, once accepted, is not edited — it
is superseded by a later record that links back to it.

## Consequences

Every significant decision now has one obvious home, and the reasoning is reviewed
alongside the change that embodies it. The cost is discipline: an ADR only helps if
it is written when the decision is made, not reconstructed months later. Trivial
decisions must stay out, or the signal drowns in noise.
