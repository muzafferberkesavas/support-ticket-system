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

    // Called when a live 'notification' event arrives.
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
        /* keep optimistic state */
      }
    },

    async markAllRead() {
      this.items.forEach((n) => (n.read = true));
      this.unreadCount = 0;
      try {
        await notificationService.markAllRead();
      } catch {
        /* ignore */
      }
    },

    reset() {
      this.items = [];
      this.unreadCount = 0;
      this.loaded = false;
    },
  },
});
