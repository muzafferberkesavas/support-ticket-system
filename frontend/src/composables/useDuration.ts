import { useI18n } from 'vue-i18n';

// Localized human duration formatter (minutes → "2 sa 15 dk" / "3.1 gün").
export function useDuration() {
  const { t } = useI18n();
  return (min: number | null | undefined): string => {
    if (min == null) return '—';
    const m = Math.round(Math.abs(min));
    if (m < 60) return t('analytics.minutes', { n: m });
    if (m < 1440) {
      const h = Math.floor(m / 60);
      const r = m % 60;
      return r
        ? `${t('analytics.hours', { n: h })} ${t('analytics.minutes', { n: r })}`
        : t('analytics.hours', { n: h });
    }
    return t('analytics.days', { n: (m / 1440).toFixed(1) });
  };
}
