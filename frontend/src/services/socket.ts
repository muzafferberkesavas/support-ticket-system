import { io, type Socket } from 'socket.io-client';
import { ref } from 'vue';
import { getStoredToken } from './api';

// VITE_API_URL bir yol öneki içerebilir (ör. https://support.local/api).
// Socket.IO'da bu öneki path olarak vermezsek namespace sanılır; bu yüzden
// origin ile öneki ayırıp Socket.IO path'ini "<önek>/socket.io" yapıyoruz.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const parsed = new globalThis.URL(API_URL, globalThis.location?.origin ?? 'http://localhost');
const SOCKET_ORIGIN = parsed.origin;
const SOCKET_PATH = `${parsed.pathname.replace(/\/$/, '')}/socket.io`;

export const socketConnected = ref(false);

// Tek paylaşılan istemci. Token tembel (lazy) okunur; böylece yeniden bağlanmalar en günceli kullanır.
export const socket: Socket = io(SOCKET_ORIGIN, {
  path: SOCKET_PATH,
  autoConnect: false,
  transports: ['websocket', 'polling'],
  auth: (cb) => cb({ token: getStoredToken() }),
});

socket.on('connect', () => {
  socketConnected.value = true;
});
socket.on('disconnect', () => {
  socketConnected.value = false;
});

export function connectSocket(): void {
  if (!socket.connected) socket.connect();
}

export function disconnectSocket(): void {
  if (socket.connected) socket.disconnect();
  socketConnected.value = false;
}
