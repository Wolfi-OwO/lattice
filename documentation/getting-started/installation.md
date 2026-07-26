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
| **Java 21 + Maven** | `spring-boot`, `javafx` | The templates ship a Maven wrapper, so `./mvnw` works without Maven installed. |
| **Python ≥ 3.10** | `fastapi`, `ml-project` | lattice does not create the venv for you — see below. |
| **The framework's own CLI** | `--generator <id>` | `dotnet`, `cargo`, `go`, `flutter`… whichever you asked for. |

Nothing on that list is needed for a stack you are not using. Scaffolding
`node-cli` needs Node and nothing else.

!!! note "Python projects are not auto-installed"

    Every other stack has one obvious package manager, so lattice runs it.
    Python does not: `pip`, `pipx`, `poetry`, `uv`, `conda` and a bare venv are
    all normal, and guessing wrong leaves packages somewhere you did not want
    them. So the Python templates print the three commands instead of running
    them, and the commands they print create the venv rather than assuming one:

    ```bash
    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements-dev.txt
    uvicorn app.main:app --reload
    ```

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
