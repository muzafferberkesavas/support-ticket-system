import http from 'http';
import { createApp } from './app';
import { env } from './env';
import { prisma } from './prisma';
import { initRealtime } from './realtime/socket';
import { startSlaScheduler } from './services/scheduler';
import { refreshSlaTargets } from './services/sla';

const app = createApp();
const server = http.createServer(app);

// Attach Socket.IO (real-time) to the same HTTP server.
initRealtime(server).catch((err) => console.error('Realtime init failed:', err));

// Load admin-configurable SLA targets, then start background checks.
refreshSlaTargets().finally(() => startSlaScheduler());

server.listen(env.PORT, () => {
  console.log(`🚀 Backend listening on http://localhost:${env.PORT}`);
});

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
