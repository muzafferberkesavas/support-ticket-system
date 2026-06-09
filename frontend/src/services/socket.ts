import { io, type Socket } from 'socket.io-client';
import { ref } from 'vue';
import { getStoredToken } from './api';

const URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const socketConnected = ref(false);

// Single shared client. Token is read lazily so reconnects use the latest one.
export const socket: Socket = io(URL, {
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
