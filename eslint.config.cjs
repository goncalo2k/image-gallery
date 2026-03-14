const js = require('@eslint/js');
const ts = require('typescript-eslint');
const hono = require('@hono/eslint-config').default;

module.exports = [
  {
    ignores: ['node_modules/', 'dist/', 'wrangler.toml'],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...hono,
  {
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