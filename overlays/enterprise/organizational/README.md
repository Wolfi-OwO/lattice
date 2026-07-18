# Organizational & access

How identity, roles, and administration work in **{{projectTitle}}**. Fill this in
when the project grows past a single maintainer — an empty section here is a signal
that access is ad-hoc, which is itself worth knowing.

## Roles

Describe who can do what. The common shape is three tiers:

| Role | Can | Cannot |
| --- | --- | --- |
| `admin` | Everything, including managing other accounts | — |
| `editor` | Create and change content | Manage accounts or settings |
| `viewer` | Read | Change anything |

## Administration

- **Bootstrapping the first admin:** how the very first privileged account is
  created.
- **Adding and removing people:** the day-to-day process.
- **Changing a role:** who can do it and how it takes effect.

## Enforcement

Where access control is actually enforced in the code — the middleware, the guard,
the check that runs on every request. A role table nobody enforces is a document,
not a control.
