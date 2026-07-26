# Releasing

This page is about releasing **lattice itself**. If you are looking for the
release workflow the `--enterprise` overlay puts into *your* project, that is
[the enterprise overlay](enterprise-overlay.md).

Two steps, both of which a human drives. You write down what changed; the version
bump is prepared for your review; and only then does anything reach npm.

## The steps

1. **As you work**, add entries under `## [Unreleased]` in
   [CHANGELOG.md](../project/changelog.md).

    This is the only writing you do, and it is deliberate. Notes written at
    release time are notes nobody can write, because by then nobody remembers
    what changed. The **Prepare release** workflow refuses outright if
    `[Unreleased]` is empty.

2. **Run the Prepare release workflow** with the version (`1.4.0`, no leading
   `v`). It refuses early if that version is already on npm, then stamps
   `package.json`, cuts `[Unreleased]` into `## [1.4.0] - <today>`, pushes a
   `release/v1.4.0` branch, and prints a link to open the pull request.

3. **Open that pull request, review it, and merge it.**

4. **Publish a GitHub Release tagged `v1.4.0`, from `main`'s HEAD.**

Publishing the Release is what triggers `release.yml`.

!!! question "Why doesn't the workflow open the PR itself?"

    That would need *"Allow GitHub Actions to create and approve pull requests"* —
    one toggle that also grants **approval**, and approval is exactly what the
    `main-protection` ruleset requires a human for. So the workflow pushes the
    branch and gives you the link.

## What the release workflow does

- **Re-runs the full unit matrix** on the code being shipped. It reuses
  `unit.yml` rather than restating the matrix, so the suite that guards a publish
  is the same suite that guards a pull request — by construction, not by
  discipline.
- **Refuses** if the tag is not `main`'s HEAD, if `package.json` disagrees with
  the tag, if the changelog has no section for that version, or if the version is
  already on npm. All of that happens *before* anything is published, because
  `npm publish` cannot be undone.
- **Waits for a human** to approve the `production` environment. This is the last
  point at which a release can be stopped.
- **Publishes to npm with provenance**, so anyone can verify the tarball was built
  from this repository.
- **Sets the Release body** from the notes already in the changelog — the same
  text you reviewed, so the two agree by construction rather than by careful
  pasting.

No secret is involved. Publishing uses
[trusted publishing](https://docs.npmjs.com/trusted-publishers) over OpenID
Connect, so npm trusts this workflow directly: there is no `NPM_TOKEN` to store,
leak, or rotate.

## Why the version bump comes first

It used to happen inside the release, *after* `npm publish`, and land on `main`
with a direct push. Both halves of that were wrong.

**`main` cannot be pushed to.** It is governed by the `main-protection` ruleset,
and CI cannot push through it: GitHub does not allow the Actions app to bypass a
ruleset on a user-owned repository, and no repository-role bypass exempts
`github-actions[bot]` either. Both were tested; both fail with `GH013`.

**The ordering was the deeper problem.** A version commit landing after an
irreversible publish means any failure in that last step leaves a version on a
registry that never forgets, and no record of it on `main`. Preparing the bump in
a reviewed pull request removes that window rather than working around it: by the
time anything is published, the version and its notes are already on `main`.
Nothing is written to the repository during a release.

What was a mutation became an assertion. Rather than *setting* `package.json`
from the tag, the release now **refuses to publish if the two disagree** — which
catches a Release cut from the wrong commit, the case the old stamping quietly
hid.

The cost is honest: releasing is two steps instead of one. That is the price of
`main` being genuinely protected.

!!! note "No bot writes to this repository"

    The release pull request is authored by a person — the token only authorises
    the push — so `github-actions[bot]` never lands in the contributor list.

    That is also why there is no `release-please` or `semantic-release` here.
    Both work by having a bot open *and merge* a release PR, and the merge is the
    part this setup deliberately keeps human.

## What CI actually proves

Every push and pull request runs these. They do not merely test the scaffolder —
**a scaffolder cannot be tested by testing the scaffolder** — they scaffold real
projects and run their suites.

| Workflow | What it proves |
| --- | --- |
| `unit.yml` | The CLI's own suite, on Node 20/22/24 × Linux/macOS/Windows. |
| `storages.yml` | `express` **and** `fastify`, each scaffolded against **all six databases**, installed, and the generated suite run — with Postgres, MySQL and Mongo as real containers the CLI starts itself. Twelve jobs. |
| `templates-javascript.yml` | Both React frontends, `node-cli`, and the fullstack composition — each run through **every check its own `package.json` declares** — plus each styling variant scaffolded, built, and its compiled CSS checked for the class contract. |
| `templates-python.yml` | `fastapi` and `ml-project` install and pass pytest. |
| `templates-java.yml` | `spring-boot` runs `mvn test`; `javafx` packages; the Android template builds a debug APK on a runner with no Gradle installed. |
| `generators.yml` | All **28** `--generator` delegations, scaffolded with `--enterprise`, installed and built — and each asserted to have received the CI of its own build tool. |
| `template-drift.yml` | That the templates have not drifted apart from the conventions they claim to share. |
| `docs.yml` | This site builds with no broken links. A pull request builds it; only `main` deploys it. |

`generators.yml` is the one exception to "every push and pull request". It calls
other people's CLIs over the network, so an upstream outage would turn the repo
red for reasons no change here caused. It runs weekly, on demand, and on pushes
to `main` that touch the generator machinery.

That is also the only thing that can catch `create-next-app` renaming a flag. The
argv in `src/generators.js` are **claims about tools lattice does not control**,
and no amount of inspecting this repository can verify them.
