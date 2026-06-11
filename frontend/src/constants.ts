import type { Priority, Role, Status } from '@/types';

type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

export const PRIORITY_VALUES: Priority[] = ['low', 'medium', 'high'];
export const STATUS_VALUES: Status[] = ['open', 'in_progress', 'closed'];
export const ROLE_VALUES: Role[] = ['user', 'agent', 'team_lead', 'admin'];

// Tablolar alfabetik değil, önem/iş akışı sırasına göre sıralansın diye sayısal sıra değerleri.
export const PRIORITY_RANK: Record<Priority, number> = { low: 1, medium: 2, high: 3 };
export const STATUS_RANK: Record<Status, number> = { open: 1, in_progress: 2, closed: 3 };

export const PRIORITY_META: Record<Priority, { severity: Severity; icon: string }> = {
  low: { severity: 'success', icon: 'pi pi-arrow-down' },
  medium: { severity: 'info', icon: 'pi pi-minus' },
  high: { severity: 'danger', icon: 'pi pi-exclamation-triangle' },
};

export const STATUS_META: Record<Status, { severity: Severity; icon: string }> = {
  open: { severity: 'warn', icon: 'pi pi-inbox' },
  in_progress: { severity: 'info', icon: 'pi pi-spin pi-spinner' },
  closed: { severity: 'secondary', icon: 'pi pi-check-circle' },
};

export const ROLE_META: Record<Role, { severity: Severity; icon: string }> = {
  user: { severity: 'secondary', icon: 'pi pi-user' },
  agent: { severity: 'info', icon: 'pi pi-headphones' },
  team_lead: { severity: 'warn', icon: 'pi pi-star' },
  admin: { severity: 'contrast', icon: 'pi pi-shield' },
};

// Dile (locale) duyarlı tarih-saat biçimlendirici.
export function formatDateTime(value?: string | null, locale = 'tr'): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(locale === 'en' ? 'en-GB' : 'tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Avatarlar için baş harfler.
export function initials(name?: string | null, email?: string | null): string {
  const source = (name || email || '?').trim();
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}
