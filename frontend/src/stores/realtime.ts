import { defineStore } from 'pinia';
import { socket } from '@/services/socket';
import type { PublicUser } from '@/types';

interface TypingEntry {
  user: PublicUser;
  expires: number;
}

export const useRealtimeStore = defineStore('realtime', {
  state: () => ({
    bound: false,
    viewers: {} as Record<string, PublicUser[]>,
    typing: {} as Record<string, TypingEntry[]>,
  }),

  getters: {
    // Active typists for a ticket (excludes expired entries).
    typistsFor:
      (state) =>
      (ticketId: string): PublicUser[] => {
        const now = Date.now();
        return (state.typing[ticketId] ?? []).filter((e) => e.expires > now).map((e) => e.user);
      },
    viewersFor:
      (state) =>
      (ticketId: string): PublicUser[] =>
        state.viewers[ticketId] ?? [],
  },

  actions: {
    // Register socket listeners once.
    bind() {
      if (this.bound) return;
      this.bound = true;

      socket.on('presence', (p: { ticketId: string; viewers: PublicUser[] }) => {
        this.viewers[p.ticketId] = p.viewers;
      });

      socket.on('typing', (p: { ticketId: string; user: PublicUser; isTyping: boolean }) => {
        const list = (this.typing[p.ticketId] ?? []).filter((e) => e.user.id !== p.user.id);
        if (p.isTyping) {
          list.push({ user: p.user, expires: Date.now() + 4000 });
        }
        this.typing[p.ticketId] = list;
      });
    },

    subscribeTicket(ticketId: string) {
      socket.emit('ticket:subscribe', ticketId);
    },

    unsubscribeTicket(ticketId: string) {
      socket.emit('ticket:unsubscribe', ticketId);
      delete this.viewers[ticketId];
      delete this.typing[ticketId];
    },

    emitTyping(ticketId: string, isTyping: boolean) {
      socket.emit('ticket:typing', { ticketId, isTyping });
    },
  },
});
