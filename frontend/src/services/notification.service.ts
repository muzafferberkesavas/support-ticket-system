import { api } from './api';
import type { AppNotification } from '@/types';

export const notificationService = {
  async list(): Promise<{ notifications: AppNotification[]; unreadCount: number }> {
    const { data } = await api.get<{ notifications: AppNotification[]; unreadCount: number }>('/notifications');
    return data;
  },
  async unreadCount(): Promise<number> {
    const { data } = await api.get<{ count: number }>('/notifications/unread-count');
    return data.count;
  },
  async markRead(id: string): Promise<void> {
    await api.patch(`/notifications/${id}/read`);
  },
  async markAllRead(): Promise<void> {
    await api.post('/notifications/read-all');
  },
};
