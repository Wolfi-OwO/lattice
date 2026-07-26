# The `--enterprise` overlay

```bash
lattice my-api --stack express --database postgres --enterprise --owner my-org
```

Adds the scaffolding a repository needs before more than one person works on it.
It is an **overlay**: it works on top of any stack and on top of any
[generator](../stacks/generators.md), because it describes a repository rather
than a language.

## What it adds

| | |
| --- | --- |
| `docs/adr/` | Decision records — a README, a `template.md`, and ADR-0001 explaining the practice itself |
| `docs/` | `architecture.md` and `releasing.md` |
| `todo/` | `roadmap.md` and `tech-debt.md` — work not yet started, in the repository rather than in someone's head |
| `organizational/` | `roles-and-permissions.md` and the non-code documents a project accumulates |
| Community health | `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, `LICENSE`, `CODEOWNERS`, issue and PR templates |
| `.github/workflows/ci.yml` | Chosen from the project's build tool — see below |
| `.github/workflows/security.yml` | A Trivy filesystem scan, reporting SARIF into the Security tab |
| `.github/workflows/release.yml` | Tag-driven |
| `.editorconfig`, `.gitattributes`, `.vscode/` | So the repository formats the same way for everyone |
| `version.txt`, `CHANGELOG.md` | Seeded at `0.1.0` |

`--owner` fills the badge and URL slots. It defaults to the placeholder
`your-org` rather than to any real account, because a scaffolder that guessed
would put someone else's organisation in your README.

## The CI is derived, not templated

This is the part worth understanding. lattice does not ship one `ci.yml` with
holes in it. It **looks at what is on disk** and lays down the workflow that
matches — detected rather than declared, because by the time the overlay runs the
project exists, and the file that is there is the truth whether it was written by
a lattice template or by `cargo new`.

Eleven toolchains, first match wins, most specific first:

| Marker found at the root | Toolchain |
| --- | --- |
| `*.csproj`, `*.fsproj`, `*.sln` | `dotnet` |
| `pom.xml` | `maven` |
| `build.gradle`, `settings.gradle(.kts)` | `gradle` |
| `Cargo.toml` | `rust` |
| `go.mod` | `go` |
| `Package.swift` | `swift` |
| `pubspec.yaml` | `dart` |
| `composer.json` | `php` |
| `Gemfile` | `ruby` |
| `pyproject.toml`, `requirements.txt`, `setup.py` | `python` |
| `package.json` | `node` |

The order is doing real work at two points.

**PHP and Ruby sit above Node** because a Laravel app ships a `package.json` for
Vite and a Rails app ships one for jsbundling. Detected top-down without that
ordering, both would be handed an `npm ci` pipeline — a CI that builds the
frontend assets of a backend project and calls it a build.

**Only the root is examined**, which is why a lattice fullstack project — `pom.xml`
at the root, `package.json` under `client/` — is correctly a Maven project whose
CI builds the whole thing.

Adding a language needs no entry in any registry: ship its marker and its CI, and
both the stack path and the generator path pick it up.

A project whose build tool is **unrecognised gets everything except the CI**.
That is deliberate and it is the right trade: a workflow that cannot pass is
worse than no workflow. It goes red on the first push, it trains everyone to
ignore a red X, and the next genuine failure is invisible.

!!! note "Which is why generators are tested with `--enterprise`"

    `generators.yml` scaffolds all 28 delegations **with `--enterprise`**,
    installs and builds them, and asserts that each received the CI of its own
    build tool. Without that, "the CI is chosen from the build tool" would be a
    claim about 28 code paths that nobody had run.

## ADRs

The overlay's `docs/adr/` is the same convention this repository uses for its
own decisions — see [Architecture decisions](../project/adr/index.md).

An ADR records a decision, its context, and its consequences at the moment it was
made. The value is not the decision; it is the *context*, which is the thing
nobody can reconstruct a year later when the decision looks arbitrary. Adding one
is adding a numbered file.
