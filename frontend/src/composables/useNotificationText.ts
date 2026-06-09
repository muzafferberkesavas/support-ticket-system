import { useI18n } from 'vue-i18n';
import type { AppNotification, NotificationType } from '@/types';

const TEXT: Record<NotificationType, [string, string]> = {
  reply: ['notif.replyTitle', 'notif.replyBody'],
  created: ['notif.createdTitle', 'notif.createdBody'],
  assigned: ['notif.assignedTitle', 'notif.assignedBody'],
  status: ['notif.statusTitle', 'notif.statusBody'],
};

const ICON: Record<NotificationType, string> = {
  reply: 'pi pi-comment',
  created: 'pi pi-ticket',
  assigned: 'pi pi-user-plus',
  status: 'pi pi-sync',
};

export function useNotificationText() {
  const { t } = useI18n();
  return {
    title: (n: AppNotification) => t(TEXT[n.type]?.[0] ?? 'notif.replyTitle'),
    body: (n: AppNotification) =>
      t(TEXT[n.type]?.[1] ?? 'notif.replyBody', { actor: n.actor ?? '', subject: n.ticketSubject }),
    icon: (n: AppNotification) => ICON[n.type] ?? 'pi pi-bell',
  };
}
