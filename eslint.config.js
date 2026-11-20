// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Les fonctions Supabase tournent sous Deno (imports npm:), hors de l'app.
    ignores: ['dist/*', 'supabase/functions/*'],
  },
  {
    // TypeScript vérifie déjà les imports ; cette règle se trompe sur expo-notifications et PGlite.
    rules: { 'import/namespace': 'off' },
  },
  {
    // Version web légère : les icônes passent par src/ui/icones.ts (une à une), jamais par toute la bibliothèque.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/ui/icones.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: [{ name: 'lucide-react-native', message: 'Importer les icônes depuis @/ui/icones.' }] }],
    },
  },
]);
