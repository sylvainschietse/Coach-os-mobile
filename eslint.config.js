// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // TypeScript vérifie déjà les imports ; cette règle se trompe sur expo-notifications et PGlite.
    rules: { 'import/namespace': 'off' },
  },
]);
