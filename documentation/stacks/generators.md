# Generators

For everything lattice does not ship a stack for, `--generator` runs the
framework's **own official tool** and then layers lattice's overlay on top.

```bash
lattice web-app --generator vite-react   --enterprise
lattice api     --generator dotnet-webapi --enterprise
lattice svc     --generator go            --enterprise
```

28 of them, across 11 languages. `lattice --list` shows the current set.

| | |
| --- | --- |
| **Vite** | `vite-vanilla` `vite-react` `vite-react-ts` `vite-vue` `vite-svelte` `vite-preact` `vite-lit` `vite-solid` |
| **JS frameworks** | `next` `next-ts-src` `vue` `nuxt` `sveltekit` `astro` `remix` `expo` `angular` |
| **.NET** | `dotnet-webapi` `dotnet-mvc` `dotnet-blazor` |
| **Rust** | `cargo` `cargo-lib` |
| **Dart** | `flutter` `dart` |
| **Other** | `laravel` `rails` `swift` `go` |

## This is opt-in on purpose

A generator gives up three things the built-in stacks guarantee:

1. **It needs the network.** `create-next-app` downloads.
2. **It needs that toolchain installed.** `--generator cargo` without Rust fails,
   and there is nothing lattice can do about it.
3. **Its output is not verified here.** You get whatever the upstream tool ships
   today, not something lattice built and tested.

That third one is the real reason for the split. A built-in stack is held to
[CONVENTIONS.md](../project/conventions.md) and CI builds and tests it on every
push. Nothing of the sort is true — or could be true — of `rails new`.

!!! note "Which means the list can go stale under you"

    The argv in `src/generators.js` are **claims about tools lattice does not
    control**. If `create-next-app` renames a flag, nothing about inspecting this
    repository would reveal it. That is why `generators.yml` exists, and why it
    is the one workflow that does not run on every push: it calls other people's
    CLIs over the network, so an upstream outage would turn the repo red for
    reasons no change here caused.

    It runs weekly, on demand, and on pushes to `main` that touch the generator
    machinery. All 28 delegations are scaffolded with `--enterprise`, installed
    and built — and each is asserted to have received the CI of its own build
    tool.

## What the overlay adds

A generator's output is the framework's, and lattice does not rewrite it. What it
does add — with [`--enterprise`](../guides/enterprise-overlay.md) — is the
scaffolding a repository needs before more than one person works on it: `docs/adr/`,
`todo/`, community-health files, a Trivy scan, a release workflow, and a CI
workflow.

The CI is **chosen from the project's build tool**, not from a template. lattice
looks for `package.json`, `go.mod`, `pom.xml`, `Cargo.toml`, `build.gradle`,
`pyproject.toml` or a `.csproj` and lays down the matching `ci.yml` and
`dependabot.yml`. A Go module gets `go test`; a Maven project gets `mvn -B verify`.
A project whose build tool is unrecognised gets everything **except** the CI —
which is better than a workflow that cannot pass.

That is eleven toolchains, from `npm ci` to `swift test` to `bundle install`.

## Choosing between the two tiers

Ask what you need from the output.

- **You want it to boot, and to match the other services you have.** Use a
  built-in stack. Short list, held to a contract, verified on every push.
- **You want the framework's canonical starting point.** Use a generator. Broad,
  current, and exactly what that community expects to see.

The full comparison is on the [Stacks](index.md#the-two-tiers) page.
