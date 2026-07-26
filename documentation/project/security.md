---
title: 'Security policy'
edit_url: https://github.com/Wolfi-OwO/lattice/edit/main/SECURITY.md
---

!!! info "Mirrored from the repository"

    This page is [`SECURITY.md`](https://github.com/Wolfi-OwO/lattice/blob/main/SECURITY.md), rendered here. It is generated
    on every build, so edit the source rather than this copy — the pencil above
    already points there.

# Security Policy

## Reporting a vulnerability

Please report security issues **privately**, not in a public issue.

Use GitHub's [private vulnerability reporting](https://github.com/Wolfi-OwO/lattice/security/advisories/new)
(Security → Advisories → Report a vulnerability), or email **koflerphillip@gmail.com**
with `create-lattice security` in the subject.

You will get an acknowledgement within a few days. Please give a reasonable window
to release a fix before any public disclosure.

## What is in scope

lattice is a scaffolder — it runs on a developer's machine and generates projects.
The security surface worth reporting:

- **Command execution.** The CLI shells out to `npm`, `docker`, `mvn` and friends.
  A path or flag that lets crafted input execute an unintended command is in scope.
- **Path traversal.** Template rendering writes files derived from a project name
  and package name. Input that writes outside the target directory is in scope.
- **Generated defaults.** The templates ship secure-by-default settings (JWT
  secrets generated at scaffold time, `ddl-auto: validate`, `passwordHash` never
  serialized). A default that leaks a secret or weakens a generated app is in scope.

## What is not

- Vulnerabilities in the *dependencies of a generated project* — those belong to
  the upstream package. lattice itself has **no runtime dependencies**.
- Findings that require the attacker to already control the machine running the CLI.

## Supported versions

The latest published version of `create-lattice` receives security fixes. Because
the tool is versioned continuously from `main`, the fix ships as the next release.
