import type { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { env } from '../env';
import { verifyToken } from '../utils/jwt';
import { prisma } from '../prisma';
import { canAccessTicket, getUserDepartmentIds, isStaff, type Principal } from '../services/access';

let io: Server | null = null;

// ── Oda yardımcıları ────────────────────────────────────────────────
const userRoom = (id: string) => `user:${id}`;
const deptRoom = (id: string) => `dept:${id}`;
const ticketRoom = (id: string) => `ticket:${id}`;
const ticketStaffRoom = (id: string) => `ticket:${id}:staff`;
const ADMIN_ROOM = 'role:admin';

type SocketUser = Principal;

// ── Başlatma ────────────────────────────────────────────────────────
export async function initRealtime(httpServer: HttpServer): Promise<void> {
  io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
      credentials: true,
    },
  });

  // Çok örnekli (multi-instance) yayın için Redis adapter.
  try {
    const pubClient = new Redis(env.REDIS_URL, { lazyConnect: true });
    const subClient = pubClient.duplicate();
    await pubClient.connect();
    await subClient.connect();
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Socket.IO Redis adapter connected');
  } catch (err) {
    console.warn('⚠️  Redis adapter unavailable, running Socket.IO single-instance:', err);
  }

  // JWT doğrulaması handshake `auth` payload'ı üzerinden yapılır (header değil —
  // tarayıcılar native WebSocket bağlantılarında header ayarlayamaz).
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyToken(token);
      (socket.data as { user: SocketUser }).user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', onConnection);
}

async function onConnection(socket: Socket): Promise<void> {
  const user = (socket.data as { user: SocketUser }).user;

  // Doğrudan bildirimler için kişisel oda.
  socket.join(userRoom(user.id));
  if (user.role === 'admin') socket.join(ADMIN_ROOM);

  // Staff kullanıcılar ayrıca kendi department odalarına katılır.
  if (isStaff(user.role)) {
    const deptIds = await getUserDepartmentIds(user.id);
    deptIds.forEach((id) => socket.join(deptRoom(id)));
  }

  // Belirli bir ticket'ın canlı konuşmasına abone ol (erişim kontrolü yapılır).
  socket.on('ticket:subscribe', async (ticketId: string, ack?: (ok: boolean) => void) => {
    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true, userId: true, departmentId: true },
      });
      if (!ticket || !(await canAccessTicket(user, ticket))) {
        ack?.(false);
        return;
      }
      socket.join(ticketRoom(ticketId));
      if (isStaff(user.role)) socket.join(ticketStaffRoom(ticketId));
      ack?.(true);
      await emitPresence(ticketId);
    } catch {
      ack?.(false);
    }
  });

  socket.on('ticket:unsubscribe', async (ticketId: string) => {
    socket.leave(ticketRoom(ticketId));
    socket.leave(ticketStaffRoom(ticketId));
    await emitPresence(ticketId);
  });

  // Yazıyor göstergesi — aynı ticket'ı görüntüleyen diğerlerine yayınla.
  socket.on('ticket:typing', (payload: { ticketId: string; isTyping: boolean }) => {
    if (!payload?.ticketId) return;
    socket.to(ticketRoom(payload.ticketId)).emit('typing', {
      ticketId: payload.ticketId,
      user: { id: user.id, email: user.email, role: user.role },
      isTyping: !!payload.isTyping,
    });
  });

  socket.on('disconnecting', () => {
    // Bu socket'in bulunduğu tüm ticket odaları için presence bilgisini yeniden hesapla.
    for (const room of socket.rooms) {
      if (room.startsWith('ticket:') && !room.endsWith(':staff')) {
        const ticketId = room.slice('ticket:'.length);
        setTimeout(() => void emitPresence(ticketId), 50);
      }
    }
  });
}

// Bir ticket'ı şu anda görüntüleyen benzersiz kullanıcılar → o odaya yayınla.
async function emitPresence(ticketId: string): Promise<void> {
  if (!io) return;
  const sockets = await io.in(ticketRoom(ticketId)).fetchSockets();
  const byId = new Map<string, { id: string; email: string; role: string }>();
  for (const s of sockets) {
    const u = (s.data as { user?: SocketUser }).user;
    if (u) byId.set(u.id, { id: u.id, email: u.email, role: u.role });
  }
  io.to(ticketRoom(ticketId)).emit('presence', {
    ticketId,
    viewers: Array.from(byId.values()),
  });
}

// ── Emit yardımcıları (controller'lardan çağrılır) ──────────────────
type TicketLike = { id: string; userId: string; departmentId: string | null };

function ticketTargets(ticket: TicketLike, assigneeIds: string[] = []): Set<string> {
  const rooms = new Set<string>([ticketRoom(ticket.id), ADMIN_ROOM, userRoom(ticket.userId)]);
  if (ticket.departmentId) rooms.add(deptRoom(ticket.departmentId));
  assigneeIds.forEach((id) => rooms.add(userRoom(id)));
  return rooms;
}

export function emitTicketCreated(ticket: TicketLike, assigneeIds: string[] = []): void {
  if (!io) return;
  const rooms = new Set<string>([ADMIN_ROOM, userRoom(ticket.userId)]);
  if (ticket.departmentId) rooms.add(deptRoom(ticket.departmentId));
  assigneeIds.forEach((id) => rooms.add(userRoom(id)));
  io.to(Array.from(rooms)).emit('ticket:created', { ticket });
}

export function emitTicketUpdated(ticket: TicketLike, assigneeIds: string[] = []): void {
  if (!io) return;
  io.to(Array.from(ticketTargets(ticket, assigneeIds))).emit('ticket:updated', { ticket });
}

export function emitTicketDeleted(ticket: TicketLike): void {
  if (!io) return;
  io.to(Array.from(ticketTargets(ticket))).emit('ticket:deleted', { id: ticket.id });
}

// Yanıt: dahili notlar yalnızca staff'a ulaşır (ayrı oda); herkese açık yanıtlar tüm görüntüleyenlere ulaşır.
export function emitReply(ticketId: string, reply: unknown, isInternal: boolean): void {
  if (!io) return;
  const room = isInternal ? ticketStaffRoom(ticketId) : ticketRoom(ticketId);
  io.to(room).emit('ticket:reply', { ticketId, reply });
}

// Tek bir kullanıcının kişisel odasına düşük seviyeli emit (notification service tarafından kullanılır).
export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(userRoom(userId)).emit(event, payload);
}
