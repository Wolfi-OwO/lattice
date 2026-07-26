# Stacks

A **stack** is a template lattice ships and verifies. There are ten.

```bash
lattice --list
```

| Category | Stacks |
| --- | --- |
| [Backend / API](backend.md) | `express` · `fastify` · `spring-boot` · `fastapi` |
| [Frontend / Web](frontend.md) | `react-vite` · `react-vite-ts` |
| Desktop GUI | `javafx` |
| Mobile | `android-compose` |
| CLI tool | `node-cli` |
| Data science / ML | `ml-project` |

[Fullstack](fullstack.md) is not a stack. It is composed at scaffold time from a
backend at the root plus a frontend dropped into `client/`.

## The two tiers

Everything above is a **built-in stack**. Everything reachable through
[`--generator`](generators.md) is not, and the two are not held to the same
standard:

| | Built-in stack | `--generator` |
| --- | --- | --- |
| Held to [CONVENTIONS.md](../project/conventions.md) | yes | no |
| Same `users` resource, same error envelope | yes | no |
| Built and tested in CI on every push | yes | weekly |
| Needs the network to scaffold | no | yes |
| Needs that toolchain installed | no | yes |
| Output verified by lattice | yes | no |

Holding a stack to conventions is expensive per language, which is why the list
is short and **stays short**. A generator delegates to the framework's own
official tool: broad, current, and not verified here.

## Language coverage

| Language | Built-in stack | Generator |
| --- | --- | --- |
| JavaScript / TypeScript | `express`, `fastify`, `node-cli`, `react-vite`, `react-vite-ts` | Vite ×8, Next ×2, Nuxt, SvelteKit, Astro, React Router, Vue, Expo, Angular |
| Java | `spring-boot`, `javafx` | — |
| Kotlin / Android | `android-compose` | — |
| Python | `fastapi`, `ml-project` | — |
| C# / .NET | — | `dotnet-webapi`, `dotnet-mvc`, `dotnet-blazor` |
| Go | — | `go` |
| Rust | — | `cargo`, `cargo-lib` |
| PHP | — | `laravel` |
| Ruby | — | `rails` |
| Dart / Flutter | — | `dart`, `flutter` |
| Swift | — | `swift` |
| C / C++ | — | — |

C and C++ are empty on purpose. There is no official scaffolding tool to
delegate to — no `cargo new` for CMake — so lattice claims neither tier rather
than inventing a layout and calling it standard.

## What every stack has in common

Whatever the language, a generated project:

- **boots on the first command** printed in `Next steps`;
- has its dependencies **already installed**, with its own package manager;
- has a real `.env`, not an `.env.example`;
- passes its own test suite before you touch it;
- can take [`--enterprise`](../guides/enterprise-overlay.md), which adds ADRs,
  community-health files, and the CI of its own build tool.

The backends go further and share a written contract — the same `users` resource,
the same error envelope, the same shutdown behaviour — so that moving between
Express and Spring Boot is a change of language rather than a change of shape.
That contract is [CONVENTIONS.md](../project/conventions.md), and the reasoning
behind the layout is [STRUCTURE.md](../project/structure.md).
