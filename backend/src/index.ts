import http from 'http';
import { createApp } from './app';
import { env } from './env';
import { prisma } from './prisma';
import { initRealtime } from './realtime/socket';
import { refreshSlaTargets } from './services/sla';

const app = createApp();
const server = http.createServer(app);

// Socket.IO'yu (gerçek zamanlı) aynı HTTP server'a bağla.
initRealtime(server).catch((err) => console.error('Realtime init failed:', err));

// Admin tarafından ayarlanabilir SLA hedeflerini yükle. (SLA otomatik
// yükseltmesi artık bağımsız worker'da bir Bull cron job olarak çalışır —
// bkz. backend/src/worker.ts.)
void refreshSlaTargets();

server.listen(env.PORT, () => {
  console.log(`🚀 Backend listening on http://localhost:${env.PORT}`);
});

// Düzgün (graceful) kapanış
async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
