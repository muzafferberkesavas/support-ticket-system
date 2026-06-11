import { Emitter } from '@socket.io/redis-emitter';
import { Redis } from 'ioredis';
import { env } from '../env';

// Socket.IO olmayan bir process'in (worker) bağlı istemcilere, backend'in Socket.IO
// adapter'ının kullandığı aynı Redis üzerinden event göndermesini sağlar. Worker, canlı
// güncellemeleri (escalation'lar, bildirimler) bir HTTP çağrısı olmadan böyle iletir.
let emitter: Emitter | null = null;

function getEmitter(): Emitter {
  if (!emitter) emitter = new Emitter(new Redis(env.REDIS_URL));
  return emitter;
}

export function emitToRoom(room: string, event: string, payload: unknown): void {
  try {
    getEmitter().to(room).emit(event, payload);
  } catch (err) {
    console.error('emitToRoom failed:', err);
  }
}

export const rooms = {
  user: (id: string) => `user:${id}`,
  dept: (id: string) => `dept:${id}`,
  ticket: (id: string) => `ticket:${id}`,
  admin: 'role:admin',
};
