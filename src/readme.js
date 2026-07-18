/**
 * The generated project's README.
 *
 * Two jobs, and the first one is a correction. The enterprise overlay used to
 * *overwrite* README.md with a badge wall whose layout section said, in full,
 * "src/ — Application source". Every template ships a README that explains its
 * actual layout and the dependency rules that hold it together (CONVENTIONS.md
 * rule 10 requires it), so `--enterprise` was trading real documentation for a
 * placeholder. It now composes: the badge header goes on top, and the template's
 * own README is kept underneath.
 *
 * The second job is the annotated tree. A directory listing tells you what exists;
 * it does not tell you what belongs there, which is the thing a new contributor
 * actually needs and the thing that decays first. The descriptions live in one
 * table here rather than in twenty template READMEs, so `services/` means the same
 * thing in the Express project and the Spring one.
 */

/**
 * What each directory is for, and — the half that stops a layout from rotting —
 * what must never go in it.
 *
 * The vocabulary is CONVENTIONS.md's: these are the same directory names the
 * templates use across every language, which is why one table can describe them
 * all. A directory not listed here is still shown in the tree, with a prompt for
 * the author to describe it; silently omitting it would make the tree a lie.
 */
export const DIRECTORY_DOCS = {
  // ---------------------------------------------------------------- source
  src: {
    what: 'All application source. Nothing that is not shipped.',
    never: 'Build output, dependencies, or anything generated.',
  },
  api: {
    what: 'HTTP surface, one directory per resource.',
    never: 'Business logic — that belongs in a service.',
  },
  controllers: {
    what: 'Translate HTTP to a service call and a status code.',
    never: 'Branching that is not about status codes, and never a try/catch.',
  },
  routes: { what: 'URL to controller mapping.', never: 'Any logic at all.' },
  services: {
    what: 'Business logic. Testable without booting a server.',
    never: 'HTTP types. No request, no response, no HttpServletRequest.',
  },
  repositories: {
    what: 'Persistence access, one per aggregate.',
    never: 'Business rules, or a driver import outside the adapter layer.',
  },
  database: {
    what: 'The storage seam: adapters, migrations, demo data.',
    never: 'Domain logic. A driver import anywhere but adapters/.',
  },
  middlewares: {
    what: 'Cross-cutting request concerns: auth, logging, validation, errors.',
    never: 'Anything a single route needs — that is the route/controller.',
  },
  models: { what: 'Persistence entities.', never: 'API shapes. Entities never leave the service layer.' },
  dto: { what: 'The API contract: what actually crosses the wire.', never: 'Persistence concerns or ORM annotations.' },
  common: { what: 'Errors, envelopes, and helpers shared across domains.', never: 'Anything domain-specific.' },
  security: { what: 'Authentication and authorization mechanics.', never: 'Business rules that merely happen to check a role.' },
  config: {
    what: 'Reads the environment once, validates it, exports the result.',
    never: 'Direct environment access from anywhere else in the app.',
  },
  configuration: {
    what: 'Reads the environment once, validates it, exports the result.',
    never: 'Direct environment access from anywhere else in the app.',
  },
  utils: { what: 'Small pure helpers with no domain meaning.', never: 'A dumping ground. If it knows the domain, it is a service.' },
  utilities: { what: 'Small pure helpers with no domain meaning.', never: 'A dumping ground. If it knows the domain, it is a service.' },

  // ---------------------------------------------------------------- frontend
  components: { what: 'Reusable components.', never: 'Page-specific markup — that lives with its page.' },
  layouts: { what: 'The app frame: navigation, shells, error pages.', never: 'Imports from pages/. Layouts never depend on pages.' },
  pages: { what: 'The views the app renders, one directory per page.', never: 'Imports from layouts/. A page does not choose its frame.' },
  hooks: { what: 'App-specific hooks, composables, or stores.', never: 'Component markup.' },
  lib: { what: 'Non-component functionality — the API client lives here.', never: 'Anything that renders.' },
  assets: { what: 'Images, fonts, and static files the build processes.', never: 'Anything referenced only by its URL — that is public/.' },
  public: { what: 'Files served verbatim at the site root.', never: 'Anything that should be hashed or bundled.' },
  styles: { what: 'Global styles and design tokens.', never: 'Component-scoped styles that belong beside their component.' },

  // ---------------------------------------------------------------- project
  tests: { what: 'Automated tests, mirroring the source layout.', never: 'Fixtures so large they belong in their own data directory.' },
  test: { what: 'Automated tests, mirroring the source layout.', never: 'Fixtures so large they belong in their own data directory.' },
  docs: { what: 'Documentation, including the decision record in docs/adr/.', never: 'Anything generated — regenerate it instead of committing it.' },
  todo: { what: 'The backlog: roadmap, accepted tech debt, deliberate non-goals.', never: 'Issues that belong in the tracker.' },
  organizational: { what: 'Roles, access, and how the project is administered.', never: 'Anything about the code itself.' },
  scripts: { what: 'Developer and operational scripts.', never: 'Application code the app imports at runtime.' },
  deployment: { what: 'How this is deployed: manifests, infrastructure, runbooks.', never: 'Secrets, in any form.' },
  docker: { what: 'Container build context and compose files.', never: 'Secrets or environment-specific values.' },
  '.github': { what: 'CI, issue and PR templates, dependency updates.', never: 'Secrets — use repository or environment secrets.' },
  migration: { what: 'Versioned schema migrations. The schema is owned here.', never: 'Edits to an already-applied migration.' },
  resources: { what: 'Non-code resources the build packages.', never: 'Environment-specific configuration.' },
  adr: { what: 'One file per architectural decision, never deleted.', never: 'Edits to an accepted record — supersede it with a new one.' },
  data: { what: 'Demo data, one file per domain.', never: 'One big seed file, or anything resembling production data.' },
  requests: { what: 'Example HTTP requests, runnable from the editor.', never: 'Real credentials or tokens.' },
};

/**
 * Directories worth one row but not worth descending into. `.github/` is CI
 * plumbing: `workflows/` and `ISSUE_TEMPLATE/` under it are self-explanatory, and
 * listing them pushes the rows that matter off the reader's screen.
 */
const NOT_DESCENDED = new Set(['.github']);

/** What a directory tree should never show, because it is noise or not source. */
const IGNORED = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target', 'bin', 'obj',
  '.next', '.nuxt', '.svelte-kit', '.astro', '.vite', 'coverage', '.venv',
  'venv', '__pycache__', '.gradle', '.idea', '.vscode', '.expo', 'vendor',
]);

/** The commands that actually run a project, keyed by the build tool it uses. */
const QUICK_START = {
  node: ['npm install', 'npm run dev'],
  go: ['go run .'],
  rust: ['cargo run'],
  dotnet: ['dotnet restore', 'dotnet run'],
  python: ['pip install -e ".[dev]"', 'pytest'],
  maven: ['mvn spring-boot:run'],
  gradle: ['./gradlew bootRun'],
  swift: ['swift run'],
  dart: ['dart pub get', 'dart run'],
  php: ['composer install', 'php artisan serve'],
  ruby: ['bundle install', 'bin/rails server'],
};

export function quickStartFor(toolchain) {
  return QUICK_START[toolchain] ?? [];
}

/**
 * Walk the project and describe what is there.
 *
 * Depth 2, because depth 1 is uselessly coarse for a `src/`-shaped project and
 * depth 3 is a wall nobody reads. Directories only: listing files would make the
 * table churn on every commit, and the question being answered is "where does this
 * go", which is a directory question.
 */
export function buildDirectoryTable(target, fs, path) {
  const rows = [];

  const walk = (dir, prefix, depth) => {
    if (depth > 2) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || IGNORED.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;

      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const doc = DIRECTORY_DOCS[entry.name];
      rows.push({
        path: `${rel}/`,
        what: doc?.what ?? '_Describe what belongs here._',
        never: doc?.never ?? '_Describe what must never go here._',
      });
      if (!NOT_DESCENDED.has(entry.name)) walk(path.join(dir, entry.name), rel, depth + 1);
    }
  };

  walk(target, '', 1);
  if (rows.length === 0) return '';

  const lines = [
    '| Path | What lives there | What must never go here |',
    '| --- | --- | --- |',
    ...rows.map((r) => `| \`${r.path}\` | ${r.what} | ${r.never} |`),
  ];
  return lines.join('\n');
}

/**
 * Compose the final README: the overlay's badge header, the generated tree, then
 * whatever README the project already had.
 *
 * The existing README keeps everything below its title — that title is dropped
 * because the header already supplies one, and two H1s in a row reads as a mistake.
 * If there was no README, the composition is just the header.
 */
export function composeReadme(headerMarkdown, existingReadme) {
  if (!existingReadme) return headerMarkdown;

  const body = existingReadme.replace(/^\s*#\s+.*\n+/, '').trimEnd();
  if (!body) return headerMarkdown;

  return `${headerMarkdown.trimEnd()}\n\n---\n\n${body}\n`;
}
