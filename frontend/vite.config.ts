import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  define: {
    // vue-i18n feature flags (silence prod warnings, disable legacy API)
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Use the full build that bundles the message compiler so runtime
      // translation (interpolation) works in the production build.
      'vue-i18n': 'vue-i18n/dist/vue-i18n.esm-bundler.js',
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
