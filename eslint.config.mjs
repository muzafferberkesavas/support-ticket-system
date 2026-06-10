// Kök ESLint flat config — üç paketi (backend, file-service, frontend) kapsar.
// Biçimlendirme (format) Prettier'a bırakılır; ESLint yalnızca kod kalitesi
// kurallarıyla ilgilenir. Gürültülü kurallar "warn" seviyesinde tutulur ki
// CI'da hata vermesin, ama editörde görünür kalsın.
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.config.*'] },

  // TypeScript (backend + file-service + frontend .ts)
  ...tseslint.configs.recommended,

  // Vue SFC'ler (frontend)
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['frontend/**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' },
    },
  },

  // Proje geneli kural ayarları
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      // Kozmetik / Prettier'a komşu kurallar (PrimeVue camelCase prop ağırlıklı) — kapalı.
      'vue/attribute-hyphenation': 'off',
      'vue/attributes-order': 'off',
    },
  },

  // Prettier ile çakışan biçim kurallarını kapat (en sonda)
  prettier,
);
