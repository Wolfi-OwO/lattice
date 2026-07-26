/**
 * The styling catalogue.
 *
 * One entry per look a frontend can be scaffolded with. This is the single
 * source of truth for: which stylesheet survives scaffolding, what it is called
 * once it lands, which dependencies go into package.json, and whether Vite needs
 * a plugin to compile it.
 *
 * WHY THE COMPONENTS DO NOT CHANGE BETWEEN THESE
 * The obvious way to offer four looks is four copies of every component, each
 * wearing a different framework's class names — `className="d-flex"` for
 * Bootstrap, `className="flex items-center"` for Tailwind. That is four times the
 * markup to keep in step, and the day a page changes it changes in four places or
 * silently diverges in three.
 *
 * So the templates keep a *class-name contract* instead — `.app__header`,
 * `.app__nav`, `.app__main`, `.table`, `.pager`, `.muted`, `.error` — and each
 * entry here is one implementation of it. The components never learn which one
 * they got, exactly as the API layer never learns which database it got. Swapping
 * the look is swapping one file.
 *
 * That constraint is also what keeps the choice honest: a variant that cannot
 * express the contract is a variant that does not belong in the list.
 */

/**
 * @typedef {object} Styling
 * @property {string} label      shown in the picker
 * @property {string} hint       one-line description
 * @property {string} source     basename in src/styles/ inside the template
 * @property {string} entry      what it is renamed to in the generated project
 * @property {object} [deps]     npm dependencies merged into package.json
 * @property {object} [devDeps]  npm devDependencies merged into package.json
 * @property {string} [vitePlugin] named import added to the Vite config
 * @property {string} [vitePluginFrom] module the plugin is imported from
 */

/** @type {Record<string, Styling>} */
export const STYLING = {
  plain: {
    label: 'Plain CSS',
    hint: 'One stylesheet, custom properties, dark mode — no dependencies, no build step',
    source: 'plain.css',
    entry: 'styles.css',
    deps: {},
    devDeps: {},
  },

  scss: {
    label: 'SCSS',
    hint: 'The same styles with variables, nesting and maths · adds sass',
    source: 'scss.scss',
    entry: 'styles.scss',
    deps: {},
    // Sass is a compile-time tool: Vite compiles .scss during dev and build, and
    // nothing imports it at runtime. A dependency here would ship a compiler to
    // production for no reason.
    devDeps: { sass: '^1.83.0' },
  },

  bootstrap: {
    label: 'Bootstrap 5',
    hint: "Bootstrap's grid, forms and tables, themed through its own SCSS variables",
    source: 'bootstrap.scss',
    entry: 'styles.scss',
    // Bootstrap is imported by the stylesheet, which Sass resolves out of
    // node_modules at build time — but it is a real package the project depends
    // on, not a tool, so it belongs in dependencies.
    deps: { bootstrap: '^5.3.3' },
    devDeps: { sass: '^1.83.0' },
  },

  tailwind: {
    label: 'Tailwind CSS',
    hint: 'Utility-first, mapped onto the same class names with @apply',
    source: 'tailwind.css',
    entry: 'styles.css',
    deps: {},
    // Tailwind v4 needs no tailwind.config.js and no PostCSS config: the Vite
    // plugin is the whole integration, and the theme is declared in CSS. That is
    // why this variant adds no config files to the generated project.
    devDeps: { tailwindcss: '^4.1.14', '@tailwindcss/vite': '^4.1.14' },
    vitePlugin: 'tailwindcss',
    vitePluginFrom: '@tailwindcss/vite',
  },
};

/** Picker order — cheapest first, then the two that pull in a framework. */
export const STYLING_ORDER = ['plain', 'scss', 'bootstrap', 'tailwind'];

/** The default when nobody says otherwise: no dependencies, nothing to learn. */
export const DEFAULT_STYLING = 'plain';

export function stylingChoices() {
  return STYLING_ORDER.map((id) => ({
    value: id,
    label: STYLING[id].label,
    hint: STYLING[id].hint,
  }));
}

/**
 * The Vite config is one file for every variant, with two slots. Only Tailwind
 * fills them; everything else collapses to the empty string, so the generated
 * config reads exactly as if the feature did not exist.
 */
export function viteBits(stylingId) {
  const spec = STYLING[stylingId];
  if (!spec?.vitePlugin) return { viteStyleImport: '', viteStylePlugin: '' };

  return {
    viteStyleImport: `\nimport ${spec.vitePlugin} from '${spec.vitePluginFrom}';`,
    viteStylePlugin: `, ${spec.vitePlugin}()`,
  };
}
