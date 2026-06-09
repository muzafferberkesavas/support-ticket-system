import { Emitter } from '@socket.io/redis-emitter';
import { Redis } from 'ioredis';
import { env } from '../env';

// Lets a non-Socket.IO process (the worker) push events to connected clients
// through the same Redis the backend's Socket.IO adapter uses. This is how the
// worker delivers live updates (escalations, notifications) without an HTTP call.
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
