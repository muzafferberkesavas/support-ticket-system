import { defineStore } from 'pinia';
import { socket } from '@/services/socket';
import { operationsService, type JobStats, type RecentOp } from '@/services/operations.service';

// Operasyon dashboard'unun canlı durumu: job sayaçları + son işlemler.
// Sayaçlar socket 'job:stats' (mutlak snapshot) ile, son işlemler 'job:event' ile gelir.
export const useOperationsStore = defineStore('operations', {
  state: () => ({
    bound: false,
    loaded: false,
    stats: { active: 0, completed: 0, failed: 0, waiting: 0, delayed: 0 } as JobStats,
    recent: [] as RecentOp[],
  }),

  actions: {
    // İlk yükü (ve reconnect sonrası tazelemeyi) HTTP ile çek.
    async fetch() {
      const { stats, recent } = await operationsService.getStats();
      this.stats = stats;
      this.recent = recent;
      this.loaded = true;
    },

    // socket dinleyicilerini bir kez kaydet.
    bind() {
      if (this.bound) return;
      this.bound = true;

      socket.on('job:stats', (s: JobStats) => {
        this.stats = s;
      });

      socket.on('job:event', (op: RecentOp) => {
        // Aynı job tekrar gelirse güncelle; en yeni başta, son 15 kayıt.
        this.recent = [op, ...this.recent.filter((o) => o.id !== op.id)].slice(0, 15);
      });

      // Bağlantı (yeniden) kurulduğunda güncel snapshot'ı yeniden çek — socket
      // koptuğu sürede kaçan güncellemeleri telafi eder.
      socket.on('connect', () => {
        void this.fetch();
      });
    },
  },
});
