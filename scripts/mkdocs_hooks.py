"""MkDocs hooks for the lattice documentation site.

One hook, for one problem.

MkDocs computes a page's "edit" link from `edit_uri` plus the page's path inside
`docs_dir`, which is right for every page somebody actually wrote. It is wrong
for the pages under `documentation/project/`: those are copies, mirrored from the
repository root by `scripts/docs-mirror.js` and regenerated on every build. Their
pencil would open a file that is gitignored, and an edit committed to it would
survive until the next build and then vanish — the worst kind of wrong link,
because it works right up until the moment it matters.

Neither MkDocs nor Material reads an `edit_url` out of a page's front matter, so
the mirror script writes one and this puts it where the theme looks.

Wired up by `hooks:` in mkdocs.yml. It lives in scripts/ rather than in
documentation/ because anything inside `docs_dir` is copied into the built site,
and a Python file served alongside the pages would be confusing at best.
"""


def on_page_markdown(markdown, page, config, files):
    """Let a page override its own edit link via `edit_url:` in front matter."""
    override = page.meta.get("edit_url")
    if override:
        page.edit_url = override
    return markdown
