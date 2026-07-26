# Installation

There is nothing to install.

```bash
npm create lattice@latest
```

`npm create` downloads the package, runs it, and throws it away. Pinning
`@latest` means you get the current version every time without ever having a
stale global copy — which is the failure mode of `npm i -g` scaffolders, where
the tool people actually run is whichever version they installed once.

## What you need on the machine

| | Needed for | Notes |
| --- | --- | --- |
| **Node ≥ 20** | lattice itself | Enforced by `engines`. npm will warn on older. |
| **Docker** | `--database mongodb\|postgres\|mysql` | Only to *start* the container. Skip with `--no-database-start`. |
| **Java ≥ 17** | `spring-boot`, `javafx` | Maven itself is *not* needed — the templates ship a wrapper, so `./mvnw` fetches it. |
| **Python ≥ 3.12** | `fastapi`, `ml-project` | Used to build a `.venv` inside the project. |
| **Android SDK** | `android-compose` | The one stack not auto-installed — see below. |
| **The framework's own CLI** | `--generator <id>` | `dotnet`, `cargo`, `go`, `flutter`… whichever you asked for. |

Nothing on that list is needed for a stack you are not using. Scaffolding
`node-cli` needs Node and nothing else.

Those two version floors are not lattice's opinion — they are read out of the
project it is about to create, from `<java.version>` in the `pom.xml` and
`requires-python` in the `pyproject.toml`. If a template raises its floor, the
check raises with it.

!!! note "lattice installs dependencies, never runtimes"

    If the JDK or Python a project needs is already there and new enough, lattice
    installs that project's dependencies and it runs on the first command. If it
    is missing or too old, lattice says so — naming both the version found and
    the version needed — and leaves the project complete:

    ```
    · Skipped dependency install — Java 11.0.22 is installed, but this project
      needs 17 or newer.
      The project is complete; run the steps below once that is sorted.
    ```

    It will not download a JDK or a Python for you. That changes the machine
    rather than the directory, and it needs a system package manager lattice
    would have to guess at — where guessing wrong leaves a second Python nobody
    wanted.

    Python goes into a **`.venv` inside the project**, built with the standard
    library's own `venv` module. Nothing outside the project is touched, which is
    exactly why this is safe to do and `pip install --user` would not be. An
    existing `.venv` is **reused, not rebuilt**: someone who already made one with
    `uv` or a different interpreter has expressed a preference.

    Android is the one stack still left alone. Its build needs the Android SDK
    and accepted licences, and arranging those is not a scaffolder's business.

## Installing it globally anyway

If you scaffold often enough that the download is annoying:

```bash
npm i -g create-lattice
lattice my-api --stack express --database sqlite
```

Both `lattice` and `create-lattice` are provided. The trade is the usual one —
you now have a version to remember to update.

## Verifying what you downloaded

Every release is published to npm with
[provenance](https://docs.npmjs.com/generating-provenance-statements), which is a
signed statement of the repository, workflow and commit the tarball was built
from:

```bash
npm view create-lattice dist.integrity
npm audit signatures
```

There is no publish token anywhere in this project to leak or rotate —
publishing goes over OpenID Connect via
[trusted publishing](https://docs.npmjs.com/trusted-publishers). The full path a
release takes is in [Releasing](../guides/releasing.md).
