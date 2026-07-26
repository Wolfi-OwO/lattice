#!/usr/bin/env node
/**
 * The differences from the official generators that are meant to be there.
 *
 * The drift job compares each built-in template against a fresh `create-vite` and
 * reports what is missing. Run raw, it warns every single week about the same eight
 * files — none of which are gaps. lattice does not ship create-vite's demo counter
 * because it ships a router, pages and layouts instead (CONVENTIONS.md rule 6); it
 * does not ship upstream's logo artwork because it is not upstream.
 *
 * A report that always warns is a report nobody reads, and the whole point of that
 * job is to be believed on the week it finds something real. So the intended
 * differences are written down here, with the reason each one is intended, and the
 * job only warns about what is *not* on this list.
 *
 * The reason is the load-bearing part. An entry without one is how this list turns
 * from "these are our decisions" into "these are the warnings we got tired of",
 * which is the same failure in slower motion — so a test requires every entry to
 * carry one.
 */

/** Files upstream ships that a template deliberately does not. */
export const EXPECTED_MISSING_FILES = {
  'react-vite': {
    'src/App.jsx': 'the demo counter; this template ships router.jsx, pages/ and layouts/ instead',
    'src/App.css': 'styles for that counter — styles.css covers the real layout',
    'src/index.css': 'merged into styles.css, which is the one stylesheet this template has',
    'src/assets/react.svg': "upstream's logo artwork",
    'src/assets/vite.svg': "upstream's logo artwork",
    'src/assets/hero.png': "upstream's demo hero image",
    'public/icons.svg': "upstream's demo icon sheet; this template ships its own favicon.svg",
    '.oxlintrc.json': 'create-vite moved to oxlint; these templates use ESLint, configured in eslint.config.js',
  },
  'react-vite-ts': {
    'src/App.tsx': 'the demo counter; this template ships router.tsx, pages/ and layouts/ instead',
    'src/App.css': 'styles for that counter — styles.css covers the real layout',
    'src/index.css': 'merged into styles.css, which is the one stylesheet this template has',
    'src/assets/react.svg': "upstream's logo artwork",
    'src/assets/vite.svg': "upstream's logo artwork",
    'src/assets/hero.png': "upstream's demo hero image",
    'public/icons.svg': "upstream's demo icon sheet; this template ships its own favicon.svg",
    '.oxlintrc.json': 'create-vite moved to oxlint; these templates use ESLint, configured in eslint.config.js',
  },
};

/**
 * Dependencies deliberately held below what upstream pins.
 *
 * Both of these are "the latest that actually works", not "the latest number" —
 * which is the only version claim worth making about a template someone has to be
 * able to `npm install`.
 */
export const EXPECTED_BEHIND = {
  typescript:
    'create-vite pins ~6 and the official generator is what decides here; 7.0 has no upstream adoption yet',
  eslint:
    'eslint-plugin-react caps its peer range at ^9.7, so ESLint 10 fails npm install with ERESOLVE',
  '@eslint/js': 'tracks the eslint major, which is held at 9 for the reason above',
};

const argv = process.argv.slice(2);
const valueOf = (flag) => {
  const at = argv.indexOf(flag);
  return at === -1 ? null : argv[at + 1];
};

/*
 * `--files <stack>` prints one expected-missing path per line, for the workflow to
 * filter against. Anything not printed here is drift the job should shout about.
 */
if (argv.includes('--files')) {
  console.log(Object.keys(EXPECTED_MISSING_FILES[valueOf('--files')] ?? {}).join('\n'));
} else if (argv.includes('--dependencies')) {
  console.log(Object.keys(EXPECTED_BEHIND).join('\n'));
}
