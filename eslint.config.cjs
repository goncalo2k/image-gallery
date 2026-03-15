const js = require('@eslint/js');
const hono = require('@hono/eslint-config').default;
const ts = require('typescript-eslint');

module.exports = [
  {
    ignores: ['node_modules/', 'dist/', 'wrangler.jsonc', '.wrangler/**', 'eslint.config.cjs'],
  },
  js.configs.recommended,
  ...hono,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  }
];