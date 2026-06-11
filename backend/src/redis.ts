import { Redis } from 'ioredis';
import { env } from './env';

// Genel amaçlı Redis istemcisi (Bull/Socket.IO adapter'larından bağımsız).
// Import önizleme veri setini geçici saklamak gibi kısa-ömürlü durumlar için.
export const redis = new Redis(env.REDIS_URL);

redis.on('error', (err) => console.error('Redis client error:', err.message));
