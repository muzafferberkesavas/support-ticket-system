import { defineStore } from 'pinia';
import { notificationService } from '@/services/notification.service';
import type { AppNotification } from '@/types';

export const useNotificationStore = defineStore('notifications', {
  state: () => ({
    items: [] as AppNotification[],
    unreadCount: 0,
    loaded: false,
  }),

  actions: {
    async load() {
      const { notifications, unreadCount } = await notificationService.list();
      this.items = notifications;
      this.unreadCount = unreadCount;
      this.loaded = true;
    },

    // Canlı bir 'notification' olayı geldiğinde çağrılır.
    prepend(n: AppNotification) {
      this.items = [n, ...this.items].slice(0, 50);
      if (!n.read) this.unreadCount += 1;
    },

    async markRead(id: string) {
      const item = this.items.find((n) => n.id === id);
      if (!item || item.read) return;
      item.read = true;
      this.unreadCount = Math.max(0, this.unreadCount - 1);
      try {
        await notificationService.markRead(id);
      } catch {
        /* iyimser (optimistic) durumu koru */
      }
    },

    async markAllRead() {
      this.items.forEach((n) => (n.read = true));
      this.unreadCount = 0;
      try {
        await notificationService.markAllRead();
      } catch {
        /* yoksay */
      }
    },

    reset() {
      this.items = [];
      this.unreadCount = 0;
      this.loaded = false;
    },
  },
});
