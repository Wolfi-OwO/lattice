# Releasing

How a version of {{projectTitle}} gets cut. The rule that keeps it honest: a
release ships only what already passed CI on the exact tagged commit.

## The tag is the source of truth

The version lives in one place, `version.txt`, and the release is triggered by a
tag that must match it. If they disagree, the release fails rather than shipping a
mislabelled build (see `.github/workflows/release.yml`).

## Cutting a release

1. Update `version.txt` to the new version (semver).
2. Move the `[Unreleased]` notes in `CHANGELOG.md` under a dated heading for it.
3. Commit, then tag and push:

   ```bash
   git commit -am "chore(release): v1.2.3"
   git tag v1.2.3
   git push origin main --tags
   ```

4. The Release workflow re-runs CI on the tag, verifies `version.txt`, and
   publishes a GitHub release with generated notes.

## Versioning

[Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`. A breaking change
is a MAJOR bump and must be called out in `CHANGELOG.md` and the release notes.
