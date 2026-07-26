# Editing these docs

This site is built from the `documentation/` folder in the repository. Adding a
page is adding a markdown file; adding a section is adding a directory.

## From the browser

Every page has a **pencil** in its top right. It opens that exact file in
GitHub's editor, where you can change it, write a commit message, and commit
straight to a branch — which GitHub then offers to turn into a pull request.

When the pull request merges to `main`, the site rebuilds and redeploys on its
own. Nothing to run.

The **eye** next to the pencil opens the same file read-only, which is the faster
one when you only want to see what the source looks like.

!!! note "Pages under *About the project* point somewhere else"

    Those pages are mirrored from markdown at the repository root —
    `ARCHITECTURE.md`, `CONVENTIONS.md`, the ADRs. Their pencil points at the
    **real file**, not at the copy on the site, because the copy is regenerated
    on every build and an edit to it would survive about a minute. Each of those
    pages says so at the top.

## From a clone

```bash
pip install -r mkdocs-requirements.txt   # once
npm run docs:serve
```

`http://localhost:8000`, with live reload — save a file and the browser updates.

```bash
npm run docs:build     # build into site/, exactly as CI does
```

Both commands run `scripts/docs-mirror.js` first, which is what puts the *About
the project* section there. Running `mkdocs serve` directly skips that step and
the section will be missing; nothing else breaks.

MkDocs is not an npm dependency and never will be — lattice's CLI
[ships nothing](project/adr/0001-zero-dependency-core.md), and a docs toolchain
in `devDependencies` would be the same mistake with a different label. The pinned
versions live in `mkdocs-requirements.txt`.

## Adding a page

Drop a `.md` file into a folder under `documentation/`. It appears in the
navigation, titled by its first `#` heading.

```
documentation/
  guides/
    caching.md          ← appears under "Guides"
```

## Adding a section

Make a directory. It becomes a section, and every markdown file inside it becomes
a page:

```
documentation/
  deployment/
    index.md            ← the section's landing page
    docker.md
    kubernetes.md
```

`index.md` is what you land on when you click the section itself. Without one,
the section is a heading you cannot click.

## Controlling the order

Files are sorted alphabetically, which is right about half the time. When it is
wrong, drop a `.nav.yml` into the folder:

```yaml
title: Deployment          # what the section is called, if not the folder name
nav:
  - index.md
  - docker.md
  - kubernetes.md
```

Anything you leave out of `nav` does not appear. To list a few things first and
let the rest follow alphabetically, end with a `'*'`:

```yaml
nav:
  - index.md
  - docker.md
  - '*'
```

That is what `documentation/.nav.yml` does at the top level.

## Things worth knowing

**Links are checked.** The build runs with `strict: true`, so a link to a page
that does not exist fails CI rather than shipping a 404. Link to files the way
you would from that file's own directory:

```markdown
[Choosing a database](../guides/choosing-a-database.md)
```

Write the `.md` extension. MkDocs rewrites it to the final URL, and writing the
URL yourself is how a link survives a build but breaks in an editor's preview.

**Admonitions** are the boxed callouts on these pages:

```markdown
!!! note "An optional title"

    Indented four spaces.

!!! warning
!!! tip
!!! question
```

**Code blocks** get a copy button and syntax highlighting from the language tag.
Use `console` for shell sessions where you want to show output alongside the
command.

**A picture of the site before you push it** is what `npm run docs:serve` is for.
The pull request also builds it, so a broken link is caught before merge either
way.
