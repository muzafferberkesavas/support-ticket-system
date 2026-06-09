import { defineStore } from 'pinia';
import { i18n, persistLocale, type AppLocale } from '@/i18n';

type Theme = 'light' | 'dark';
const THEME_KEY = 'support_theme';
const DARK_CLASS = 'app-dark';

function storedTheme(): Theme {
  const t = localStorage.getItem(THEME_KEY);
  if (t === 'light' || t === 'dark') return t;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Applies the dark class on <html> (reliable target per PrimeVue docs).
function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle(DARK_CLASS, theme === 'dark');
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    theme: storedTheme() as Theme,
    locale: (i18n.global.locale as unknown as { value: AppLocale }).value,
  }),

  getters: {
    isDark: (state): boolean => state.theme === 'dark',
  },

  actions: {
    init() {
      applyTheme(this.theme);
      persistLocale(this.locale);
    },
    toggleTheme() {
      this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
    },
    setTheme(theme: Theme) {
      this.theme = theme;
      localStorage.setItem(THEME_KEY, theme);
      applyTheme(theme);
    },
    setLocale(locale: AppLocale) {
      this.locale = locale;
      (i18n.global.locale as unknown as { value: AppLocale }).value = locale;
      persistLocale(locale);
    },
    toggleLocale() {
      this.setLocale(this.locale === 'tr' ? 'en' : 'tr');
    },
  },
});
