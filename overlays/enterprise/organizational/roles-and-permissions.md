# Roles & Permissions

If {{projectTitle}} has accounts, describe the access model here. The common shape
is **role-based access control (RBAC)**: a single role string on each account,
carried in the session, so every request knows who you are and what you may do.

## The roles

| Role | Intended for | Can do |
| --- | --- | --- |
| **admin** | Platform owners | Everything, **plus** manage users and roles |
| **editor** | Regular users (the default) | Create, change, and delete their own data |
| **viewer** | Read-only stakeholders | View only; cannot modify anything |

> A sensible default: new accounts are `editor`, and the **first** account created
> is promoted to `admin` automatically, so the system is never left without an
> administrator.

## Capability matrix

Fill this in for the real capabilities. Being explicit is the point — a role table
that says "admin can do more" without listing what is not enforceable.

| Capability | admin | editor | viewer |
| --- | :---: | :---: | :---: |
| View own data | Yes | Yes | Yes |
| Create / edit / delete own data | Yes | Yes | No |
| Manage users and assign roles | Yes | No | No |

## Where it is enforced

Name the middleware or guard that checks the role on every request. A matrix that
nothing enforces is documentation, not a control.
