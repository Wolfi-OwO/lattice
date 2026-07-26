import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      /*
       * The Node globals this template actually uses. Listing them beats pulling in
       * the `globals` package for one object, and beats `no-undef: off`, which would
       * stop catching the typo this rule exists for — `setTimeout` was undeclared
       * here, so every graceful-shutdown timer was an error nobody ever saw.
       */
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      /*
       * ignoreRestSiblings is what makes `const { passwordHash, ...safe } = user`
       * legal. That line is CONVENTIONS.md rule 3 — the single place a user becomes
       * its public shape — and the omitted key is unused *on purpose*. Without this
       * the rule fires on the very idiom that keeps the hash out of responses.
       */
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: { describe: 'readonly', it: 'readonly', before: 'readonly', after: 'readonly' },
    },
  },
];
