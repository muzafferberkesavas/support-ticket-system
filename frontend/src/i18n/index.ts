import { createI18n } from 'vue-i18n';
import tr from './locales/tr';
import en from './locales/en';

export type AppLocale = 'tr' | 'en';

const STORAGE_KEY = 'support_locale';

export function getStoredLocale(): AppLocale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'tr' || stored === 'en') return stored;
  // Fall back to browser language, default Turkish.
  return navigator.language?.startsWith('en') ? 'en' : 'tr';
}

export function persistLocale(locale: AppLocale): void {
  localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.setAttribute('lang', locale);
}

export const i18n = createI18n({
  legacy: false,
  locale: getStoredLocale(),
  fallbackLocale: 'en',
  messages: { tr, en },
  // Locale-aware date/number formatting
  datetimeFormats: {
    tr: {
      short: { day: '2-digit', month: 'short', year: 'numeric' },
      long: { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
    },
    en: {
      short: { day: '2-digit', month: 'short', year: 'numeric' },
      long: { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
    },
  },
});

export default i18n;
