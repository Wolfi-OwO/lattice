/**
 * External generators — delegate the base scaffold to a framework's own official
 * tool (`npm create vite`, `ng new`, `create-next-app`, …), then let lattice layer
 * its value on top (the enterprise overlay, and later the wiring).
 *
 * This is a deliberate departure from lattice's built-in templates, and it gives up
 * three things the templates guarantee: it needs the network, it needs the tool
 * installed, and its output is whatever that tool ships today rather than something
 * lattice verified. So it is strictly opt-in via `--generator <id>`; the built-in
 * templates remain the default and the thing that is promised to boot.
 *
 * These are the real invocations, in one registry, because they are claims about
 * *other people's* CLIs: a renamed flag upstream turns a generator into a scaffold
 * that fails in front of a user, and nothing here can detect that by inspection.
 * .github/workflows/generators.yml runs every one of them on a schedule for exactly
 * that reason, and a test asserts the workflow covers the whole registry.
 *
 *   requires  the binary that must be on PATH, or the run fails with a clear message
 *   argv      argv for that binary, given the project name, in a NON-INTERACTIVE form
 *   ecosystem the id in the architecture engine this produces (for later wiring)
 *   next      the commands that actually run this project, printed after scaffolding
 *
 * `next` is per-generator rather than derived, because the honest answer differs even
 * within one toolchain: `cargo new` leaves a project that runs immediately, while
 * every npm generator here passes --skip-install and needs an install first. Printing
 * "npm install" after scaffolding a Go module — which is what a hardcoded next-step
 * did — is worse than printing nothing.
 */

const NPM_NEXT = ['npm install', 'npm run dev'];

const npx = (build) => ({
  requires: 'npx',
  bin: 'npx',
  argv: (name) => ['-y', ...build(name)],
  next: NPM_NEXT,
});

export const GENERATORS = [
  // --------------------------------------------------------- create-vite (npm)
  // Every template create-vite offers. The `-ts` variants only swap file contents,
  // not layout, so the JS variant stands in for each pair here; pass --template
  // directly for the TypeScript one.
  ...[
    ['vite-vanilla', 'Vite · Vanilla JS', 'vanilla', 'static'],
    ['vite-react', 'Vite · React', 'react', 'react'],
    ['vite-react-ts', 'Vite · React + TypeScript', 'react-ts', 'react'],
    ['vite-vue', 'Vite · Vue', 'vue', 'vue'],
    ['vite-svelte', 'Vite · Svelte', 'svelte', 'svelte'],
    ['vite-preact', 'Vite · Preact', 'preact', 'preact'],
    ['vite-lit', 'Vite · Lit', 'lit', 'lit'],
    ['vite-solid', 'Vite · Solid', 'solid', 'solid'],
    ['vite-qwik', 'Vite · Qwik', 'qwik', 'qwik'],
  ].map(([id, label, template, ecosystem]) => ({
    id,
    label,
    ecosystem,
    ...npx((name) => ['create-vite@latest', name, '--template', template]),
  })),

  // ----------------------------------------------- framework-native tools (npm)
  {
    id: 'next',
    label: 'Next.js (App Router)',
    ecosystem: 'nextjs',
    ...npx((name) => [
      'create-next-app@latest', name, '--js', '--app', '--no-tailwind', '--no-eslint',
      '--no-src-dir', '--no-turbopack', '--import-alias', '@/*', '--skip-install',
    ]),
  },
  {
    id: 'next-ts-src',
    label: 'Next.js (TypeScript, src/)',
    ecosystem: 'nextjs',
    ...npx((name) => [
      'create-next-app@latest', name, '--ts', '--app', '--no-tailwind', '--no-eslint',
      '--src-dir', '--no-turbopack', '--import-alias', '@/*', '--skip-install',
    ]),
  },
  {
    id: 'vue',
    label: 'Vue (create-vue, router + pinia)',
    ecosystem: 'vue',
    ...npx((name) => ['create-vue@latest', name, '--router', '--pinia', '--eslint']),
  },
  {
    id: 'nuxt',
    label: 'Nuxt',
    ecosystem: 'nuxt',
    ...npx((name) => [
      'nuxi@latest', 'init', name, '--template', 'v3', '--packageManager', 'npm',
      '--no-install', '--gitInit', 'false',
    ]),
  },
  {
    id: 'sveltekit',
    label: 'SvelteKit',
    ecosystem: 'sveltekit',
    ...npx((name) => [
      'sv@latest', 'create', '--template', 'minimal', '--no-types', '--no-add-ons',
      '--no-install', '--no-dir-check', '--no-download-check', name,
    ]),
  },
  {
    id: 'astro',
    label: 'Astro',
    ecosystem: 'static',
    ...npx((name) => [
      'create-astro@latest', name, '--template', 'minimal', '--no-install', '--no-git',
      '--skip-houston', '--yes',
    ]),
  },
  {
    id: 'remix',
    label: 'React Router (Remix)',
    ecosystem: 'react',
    ...npx((name) => ['create-remix@latest', name, '--no-install', '--no-git-init', '--yes']),
  },
  {
    id: 'expo',
    label: 'Expo (React Native)',
    ecosystem: 'react',
    ...npx((name) => ['create-expo-app@latest', name, '--no-install', '--template', 'blank']),
  },

  // ------------------------------------------------ other toolchains (gated)
  {
    id: 'angular',
    label: 'Angular',
    ecosystem: 'angular',
    requires: 'ng',
    bin: 'ng',
    argv: (name) => ['new', name, '--skip-install', '--skip-git', '--defaults'],
    next: ['npm install', 'ng serve'],
  },
  {
    id: 'dotnet-webapi',
    label: '.NET · Minimal API',
    ecosystem: 'dotnet',
    requires: 'dotnet',
    bin: 'dotnet',
    argv: (name) => ['new', 'webapi', '-o', name, '--no-restore'],
    next: ['dotnet restore', 'dotnet run'],
  },
  {
    id: 'dotnet-mvc',
    label: '.NET · MVC',
    ecosystem: 'dotnet',
    requires: 'dotnet',
    bin: 'dotnet',
    argv: (name) => ['new', 'mvc', '-o', name, '--no-restore'],
    next: ['dotnet restore', 'dotnet run'],
  },
  {
    id: 'dotnet-blazor',
    label: '.NET · Blazor',
    ecosystem: 'dotnet',
    requires: 'dotnet',
    bin: 'dotnet',
    argv: (name) => ['new', 'blazor', '-o', name, '--no-restore'],
    next: ['dotnet restore', 'dotnet run'],
  },
  {
    id: 'cargo',
    label: 'Rust · binary crate',
    ecosystem: 'rust',
    requires: 'cargo',
    bin: 'cargo',
    argv: (name) => ['new', name],
    next: ['cargo run'],
  },
  {
    id: 'cargo-lib',
    label: 'Rust · library crate',
    ecosystem: 'rust',
    requires: 'cargo',
    bin: 'cargo',
    argv: (name) => ['new', '--lib', name],
    next: ['cargo test'],
  },
  {
    id: 'go',
    label: 'Go · module',
    ecosystem: 'go',
    requires: 'go',
    bin: 'go',
    // go mod init needs the dir to exist first; runGenerator handles the mkdir + cwd.
    argv: (name) => ['mod', 'init', name],
    inProjectDir: true,
    // `go mod init` writes go.mod and nothing else — there is no main package yet,
    // so the honest next step is to write one, not to try to run an empty module.
    next: ['# write main.go, then:', 'go run .'],
  },
];

export function findGenerator(id) {
  return GENERATORS.find((g) => g.id === id) ?? null;
}

/** Group the catalogue by ecosystem for a readable `--list`. */
export function generatorChoices() {
  return GENERATORS.map((g) => ({ id: g.id, label: g.label, ecosystem: g.ecosystem }));
}
