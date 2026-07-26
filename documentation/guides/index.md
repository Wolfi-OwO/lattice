# Guides

Longer pieces on the decisions a generated project has already made for you, and
why.

- **[Choosing a database](choosing-a-database.md)** — the six options, what each
  one costs, and why swapping between them is one file rather than a rewrite.
- **[Health probes and shutdown](health-and-shutdown.md)** — why there are two
  probes, why they disagree during a deploy, and what goes wrong when you merge
  them into one.
- **[The `--enterprise` overlay](enterprise-overlay.md)** — what it adds, and how
  the CI workflow is chosen from the project's build tool rather than templated.
- **[Releasing](releasing.md)** — how a change reaches npm, and why the version
  bump happens before the publish rather than after it.

For the flags themselves, see the [CLI reference](../reference/cli.md).
