import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { AppError } from '../utils/AppError';
import {
  assignTicketSchema,
  bulkTicketSchema,
  createReplySchema,
  createTicketSchema,
  csatSchema,
  listTicketsQuerySchema,
  updateTicketSchema,
} from '../schemas';
import { buildTicketScope, canAccessTicket, isStaff, type Principal } from '../services/access';
import { emitReply, emitTicketCreated, emitTicketDeleted, emitTicketUpdated } from '../realtime/socket';
import { notifyAdmins, notifyDepartment, notifyUsers } from '../services/notifications';
import { withSla } from '../services/sla';
import { audit, getTicketActivity } from '../services/audit';
import { pickLeastLoadedAgent } from '../services/autoAssign';
import { estimateForTicket } from '../services/estimate';
import { enqueueReplyEmail, enqueueCsatRequest } from '../queue';
import { priorityEnum } from '../schemas';

function actorName(user: { fullName?: string | null; email: string }): string {
  return user.fullName || user.email;
}

// Bir talebi (veya diziyi) SLA bilgisi eklenmiş şekilde serileştir.
function serialize<T extends Parameters<typeof withSla>[0]>(t: T) {
  return withSla(t);
}

const userSelect = { select: { id: true, email: true, role: true, fullName: true } };

const attachmentSelect = {
  select: { id: true, filename: true, mimeType: true, size: true, uploaderId: true, createdAt: true },
  orderBy: { createdAt: 'asc' as const },
};

const ticketInclude = {
  user: userSelect,
  department: { select: { id: true, name: true } },
  assignees: { include: { user: userSelect } },
  _count: { select: { replies: true, attachments: true } },
};

const ticketDetailInclude = {
  ...ticketInclude,
  replies: { include: { author: userSelect }, orderBy: { createdAt: 'asc' as const } },
  attachments: attachmentSelect,
};

// Verilen kullanıcıların atanabilir olduğunu ve (bir departman belirtilmişse) ona ait olduğunu doğrula.
async function validateAssignees(assigneeIds: string[], departmentId?: string | null): Promise<void> {
  if (!assigneeIds.length) return;
  const users = await prisma.user.findMany({
    where: { id: { in: assigneeIds } },
    select: { id: true, role: true },
  });
  if (users.length !== assigneeIds.length) {
    throw new AppError(422, 'One or more assignees do not exist');
  }
  const nonStaff = users.filter((u) => !isStaff(u.role as Principal['role']));
  if (nonStaff.length) {
    throw new AppError(422, 'Assignees must be support staff (agent, team lead or admin)');
  }
  if (departmentId) {
    const memberships = await prisma.departmentMember.findMany({
      where: { departmentId, userId: { in: assigneeIds } },
      select: { userId: true },
    });
    const memberIds = new Set(memberships.map((m) => m.userId));
    const outsiders = assigneeIds.filter((id) => !memberIds.has(id));
    if (outsiders.length) {
      throw new AppError(422, 'All assignees must belong to the selected department');
    }
  }
}

// Bir talebin atanan kişilerini verilen kümeyle değiştirir.
async function setAssignees(ticketId: string, assigneeIds: string[]): Promise<void> {
  await prisma.$transaction([
    prisma.ticketAssignee.deleteMany({ where: { ticketId } }),
    ...(assigneeIds.length
      ? [
          prisma.ticketAssignee.createMany({
            data: assigneeIds.map((userId) => ({ ticketId, userId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
}

// Dahili notları son kullanıcılardan (staff olmayanlar) gizler.
function filterReplies<T extends { replies?: { isInternal: boolean }[] }>(ticket: T, user: Principal): T {
  if (isStaff(user.role) || !ticket.replies) return ticket;
  return { ...ticket, replies: ticket.replies.filter((r) => !r.isInternal) };
}

// GET /tickets — role'e göre kapsamlanır; status/priority/departman/atanan kişi filtrelerini destekler.
export async function listTickets(req: Request, res: Response): Promise<void> {
  const { status, priority, departmentId, assigneeId, scope, search, tag } = listTicketsQuerySchema.parse(req.query);
  const user = req.user as Principal;

  const scopeWhere = await buildTicketScope(user);
  const filters: Prisma.TicketWhereInput[] = [];
  if (status) filters.push({ status });
  if (priority) filters.push({ priority });
  if (departmentId) filters.push({ departmentId });
  if (assigneeId) filters.push({ assignees: { some: { userId: assigneeId } } });
  if (tag) filters.push({ tags: { has: tag } });
  if (scope === 'mine') filters.push({ assignees: { some: { userId: user.id } } });
  if (scope === 'created') filters.push({ userId: user.id });
  if (scope === 'unassigned') filters.push({ assignees: { none: {} } });
  if (search) {
    filters.push({
      OR: [
        { subject: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { fullName: { contains: search, mode: 'insensitive' } } },
      ],
    });
  }

  const tickets = await prisma.ticket.findMany({
    where: { AND: [scopeWhere, ...filters] },
    orderBy: { createdAt: 'desc' },
    include: ticketInclude,
  });

  res.json({ tickets: tickets.map((t) => serialize(t)) });
}

// GET /tickets/:id — yalnızca sahip / departman staff'ı / atanan kişi / admin.
export async function getTicket(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    include: ticketDetailInclude,
  });

  if (!ticket) throw new AppError(404, 'Ticket not found');
  if (!(await canAccessTicket(user, ticket))) {
    throw new AppError(403, 'You do not have access to this ticket');
  }

  res.json({ ticket: serialize(filterReplies(ticket, user)) });
}

// POST /tickets — talep sahibi olarak bir talep oluştur, isteğe bağlı olarak bir departman / atanan kişi hedefle.
export async function createTicket(req: Request, res: Response): Promise<void> {
  const data = createTicketSchema.parse(req.body);
  const user = req.user as Principal;

  if (data.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: data.departmentId } });
    if (!dept) throw new AppError(422, 'Selected department does not exist');
  }
  const assigneeIds = data.assigneeIds ?? [];
  await validateAssignees(assigneeIds, data.departmentId);

  let ticket = await prisma.ticket.create({
    data: {
      subject: data.subject,
      message: data.message,
      priority: data.priority,
      category: data.category ?? null,
      tags: data.tags ?? [],
      departmentId: data.departmentId ?? null,
      userId: user.id,
      assignees: assigneeIds.length ? { create: assigneeIds.map((userId) => ({ userId })) } : undefined,
    },
    include: ticketInclude,
  });
  audit('ticket.created', {
    ticketId: ticket.id,
    actorId: user.id,
    actorName: user.email,
    detail: { subject: ticket.subject, priority: ticket.priority },
  });

  // Manuel olarak kimse seçilmediğinde en az yüklü agent'a otomatik ata.
  let autoAssignedId: string | null = null;
  if (!assigneeIds.length && ticket.departmentId) {
    autoAssignedId = await pickLeastLoadedAgent(ticket.departmentId);
    if (autoAssignedId) {
      await prisma.ticketAssignee.create({ data: { ticketId: ticket.id, userId: autoAssignedId } });
      ticket = (await prisma.ticket.findUnique({ where: { id: ticket.id }, include: ticketInclude }))!;
      audit('ticket.assigned', {
        ticketId: ticket.id,
        actorName: 'system',
        detail: { auto: true, assignee: autoAssignedId },
      });
    }
  }

  const finalAssignees = autoAssignedId ? [autoAssignedId] : assigneeIds;

  // Gerçek zamanlı: yeni talebi duyur + staff/atanan kişileri bilgilendir.
  emitTicketCreated(ticket, finalAssignees);
  const notif = { type: 'created' as const, ticketId: ticket.id, ticketSubject: ticket.subject, actor: user.email };
  if (ticket.departmentId) notifyDepartment(ticket.departmentId, notif, user.id);
  else notifyAdmins(notif, user.id);
  if (finalAssignees.length) notifyUsers(finalAssignees, { ...notif, type: 'assigned' as const }, user.id);

  res.status(201).json({ ticket: serialize(ticket) });
}

// PUT /tickets/:id — talep sahibi içeriği düzenler; staff iş akışı + yönlendirmeyi düzenler.
export async function updateTicket(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const data = updateTicketSchema.parse(req.body);

  const existing = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, 'Ticket not found');
  if (!(await canAccessTicket(user, existing))) {
    throw new AppError(403, 'You do not have access to this ticket');
  }

  const staff = isStaff(user.role);
  const isOwner = existing.userId === user.id;

  // Son kullanıcılar yalnızca kendi taleplerinin içeriğini düzenleyebilir.
  if (!staff && !isOwner) {
    throw new AppError(403, 'You do not have access to this ticket');
  }

  const update: Prisma.TicketUpdateInput = {};
  if (data.subject !== undefined) update.subject = data.subject;
  if (data.message !== undefined) update.message = data.message;
  if (data.priority !== undefined) update.priority = data.priority;
  if (data.category !== undefined) update.category = data.category;
  if (data.tags !== undefined) update.tags = data.tags;

  // İş akışı + yönlendirme alanları yalnızca staff'a özeldir.
  if (staff) {
    if (data.status !== undefined) {
      update.status = data.status;
      // Kapatırken çözüm süresini izle (yeniden açılırsa temizle).
      update.resolvedAt = data.status === 'closed' ? new Date() : null;
    }
    if (data.departmentId !== undefined) {
      update.department = data.departmentId ? { connect: { id: data.departmentId } } : { disconnect: true };
    }
  } else if (data.status !== undefined || data.departmentId !== undefined) {
    throw new AppError(403, 'Only staff can change status or department');
  }

  await prisma.ticket.update({ where: { id: existing.id }, data: update });

  // Alan değişikliklerini audit'e kaydet.
  const who = { ticketId: existing.id, actorId: user.id, actorName: actorName(user as never) };
  if (data.status !== undefined && data.status !== existing.status) {
    audit('ticket.status', { ...who, detail: { from: existing.status, to: data.status } });
    // Talep yeni kapandı → worker üzerinden gecikmeli bir CSAT anketi e-postası planla.
    if (data.status === 'closed') void enqueueCsatRequest(existing.id);
  }
  if (data.priority !== undefined && data.priority !== existing.priority)
    audit('ticket.priority', { ...who, detail: { from: existing.priority, to: data.priority } });
  if (data.departmentId !== undefined && data.departmentId !== existing.departmentId)
    audit('ticket.department', { ...who, detail: { to: data.departmentId } });

  // Yeniden atama (yalnızca staff).
  if (data.assigneeIds !== undefined) {
    if (!staff) throw new AppError(403, 'Only staff can assign tickets');
    const deptId = data.departmentId !== undefined ? data.departmentId : existing.departmentId;
    await validateAssignees(data.assigneeIds, deptId);
    await setAssignees(existing.id, data.assigneeIds);
    audit('ticket.assigned', { ...who, detail: { assignees: data.assigneeIds } });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: existing.id },
    include: ticketDetailInclude,
  });
  const assigneeIds = ticket!.assignees.map((a) => a.userId);
  emitTicketUpdated(ticket!, assigneeIds);
  res.json({ ticket: serialize(filterReplies(ticket!, user)) });
}

// PATCH /tickets/:id/assign — staff atanan kişi kümesini değiştirir.
export async function assignTicket(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const { assigneeIds } = assignTicketSchema.parse(req.body);

  const existing = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, 'Ticket not found');
  if (!(await canAccessTicket(user, existing))) {
    throw new AppError(403, 'You do not have access to this ticket');
  }

  const previousAssignees = await prisma.ticketAssignee.findMany({
    where: { ticketId: existing.id },
    select: { userId: true },
  });
  const previousIds = new Set(previousAssignees.map((a) => a.userId));

  await validateAssignees(assigneeIds, existing.departmentId);
  await setAssignees(existing.id, assigneeIds);

  // Atanmamış/açık bir talebin üstlenilmesi onu işleme (in_progress) taşır.
  if (assigneeIds.length && existing.status === 'open') {
    await prisma.ticket.update({ where: { id: existing.id }, data: { status: 'in_progress' } });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: existing.id },
    include: ticketDetailInclude,
  });

  audit('ticket.assigned', {
    ticketId: existing.id,
    actorId: user.id,
    actorName: user.email,
    detail: { assignees: assigneeIds },
  });

  // Gerçek zamanlı: güncellemeyi yayınla + yeni atanan agent'ları bilgilendir.
  emitTicketUpdated(ticket!, assigneeIds);
  const newlyAssigned = assigneeIds.filter((id) => !previousIds.has(id));
  if (newlyAssigned.length) {
    notifyUsers(
      newlyAssigned,
      { type: 'assigned', ticketId: ticket!.id, ticketSubject: ticket!.subject, actor: user.email },
      user.id,
    );
  }

  res.json({ ticket: serialize(filterReplies(ticket!, user)) });
}

// DELETE /tickets/:id — talep sahibi (kendi talebi) veya admin.
export async function deleteTicket(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const existing = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, 'Ticket not found');

  const isOwner = existing.userId === user.id;
  if (user.role !== 'admin' && !isOwner) {
    throw new AppError(403, 'Only the requester or an admin can delete this ticket');
  }

  await prisma.ticket.delete({ where: { id: existing.id } });
  audit('ticket.deleted', {
    ticketId: existing.id,
    actorId: user.id,
    actorName: user.email,
    detail: { subject: existing.subject },
  });
  emitTicketDeleted(existing);
  res.status(204).send();
}

// POST /tickets/:id/replies — katılımcılar yanıt verir; staff dahili notlar ekleyebilir.
export async function addReply(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const { message, isInternal } = createReplySchema.parse(req.body);

  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!ticket) throw new AppError(404, 'Ticket not found');
  if (!(await canAccessTicket(user, ticket))) {
    throw new AppError(403, 'You do not have access to this ticket');
  }

  const internal = isInternal && isStaff(user.role); // yalnızca staff dahili not ekleyebilir
  const reply = await prisma.ticketReply.create({
    data: { ticketId: ticket.id, authorId: user.id, message, isInternal: internal },
    include: { author: userSelect },
  });

  audit(internal ? 'ticket.note' : 'ticket.reply', {
    ticketId: ticket.id,
    actorId: user.id,
    actorName: actorName(reply.author as never),
  });

  // Gerçek zamanlı: yanıtı canlı konuşmaya it (dahili → yalnızca staff odası).
  emitReply(ticket.id, reply, internal);

  // Herkese açık bir staff yanıtı ilk yanıt süresini kaydeder ve açık bir talebi ilerletir.
  if (isStaff(user.role) && !internal) {
    const upd: Prisma.TicketUpdateInput = {};
    if (!ticket.firstResponseAt) upd.firstResponseAt = new Date();
    if (ticket.status === 'open') upd.status = 'in_progress';
    if (Object.keys(upd).length) {
      await prisma.ticket.update({ where: { id: ticket.id }, data: upd });
      emitTicketUpdated(ticket);
    }
  }

  // Herkese açık yanıtlar için bildirimler (dahili notlar müşterilere sessiz kalır).
  if (!internal) {
    const author = actorName(reply.author);
    const notif = { type: 'reply' as const, ticketId: ticket.id, ticketSubject: ticket.subject, actor: author };
    if (isStaff(user.role)) {
      // Staff yanıtladı → talep sahibini bilgilendir (uygulama içi + e-posta).
      if (ticket.userId !== user.id) {
        notifyUsers([ticket.userId], notif, user.id);
        const requester = await prisma.user.findUnique({
          where: { id: ticket.userId },
          select: { email: true },
        });
        if (requester) {
          // Redis (Bull) üzerinden worker'a devret — yanıtı bloklamaya gerek yok.
          void enqueueReplyEmail({
            to: requester.email,
            ticketId: ticket.id,
            ticketSubject: ticket.subject,
            replyMessage: message,
            authorName: author,
          });
        }
      }
    } else {
      // Talep sahibi yanıtladı → atanan agent'ları + departmanı + admin'leri bilgilendir.
      const assignees = await prisma.ticketAssignee.findMany({
        where: { ticketId: ticket.id },
        select: { userId: true },
      });
      const assigneeIds = assignees.map((a) => a.userId);
      if (assigneeIds.length) notifyUsers(assigneeIds, notif, user.id);
      else if (ticket.departmentId) notifyDepartment(ticket.departmentId, notif, user.id);
      else notifyAdmins(notif, user.id);
    }
  }

  res.status(201).json({ reply });
}

// PATCH /tickets/:id/escalate — staff yükseltir (priority'yi artır + işaretle + bilgilendir).
export async function escalateTicket(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'manual';

  const existing = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, 'Ticket not found');
  if (!(await canAccessTicket(user, existing))) {
    throw new AppError(403, 'You do not have access to this ticket');
  }

  const data: Prisma.TicketUpdateInput = { escalated: true, escalatedAt: new Date() };
  if (existing.priority !== 'high') data.priority = 'high';
  await prisma.ticket.update({ where: { id: existing.id }, data });
  audit('ticket.escalated', { ticketId: existing.id, actorId: user.id, actorName: user.email, detail: { reason } });

  const ticket = await prisma.ticket.findUnique({ where: { id: existing.id }, include: ticketDetailInclude });
  emitTicketUpdated(
    ticket!,
    ticket!.assignees.map((a) => a.userId),
  );
  const notif = { type: 'status' as const, ticketId: existing.id, ticketSubject: existing.subject, actor: user.email };
  if (existing.departmentId) notifyDepartment(existing.departmentId, notif, user.id);
  notifyAdmins(notif, user.id);

  res.json({ ticket: serialize(filterReplies(ticket!, user)) });
}

// POST /tickets/:id/reopen — talep sahibi veya staff kapalı bir talebi yeniden açar.
export async function reopenTicket(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const existing = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, 'Ticket not found');
  if (!(await canAccessTicket(user, existing))) {
    throw new AppError(403, 'You do not have access to this ticket');
  }
  if (existing.status !== 'closed') {
    throw new AppError(422, 'Only a closed ticket can be reopened');
  }

  await prisma.ticket.update({ where: { id: existing.id }, data: { status: 'open', resolvedAt: null } });
  audit('ticket.reopened', { ticketId: existing.id, actorId: user.id, actorName: user.email });

  const ticket = await prisma.ticket.findUnique({ where: { id: existing.id }, include: ticketDetailInclude });
  emitTicketUpdated(
    ticket!,
    ticket!.assignees.map((a) => a.userId),
  );
  const notif = { type: 'status' as const, ticketId: existing.id, ticketSubject: existing.subject, actor: user.email };
  if (existing.departmentId) notifyDepartment(existing.departmentId, notif, user.id);
  notifyAdmins(notif, user.id);

  res.json({ ticket: serialize(filterReplies(ticket!, user)) });
}

// GET /tickets/:id/activity — audit zaman çizelgesi (dahili notlar son kullanıcılardan gizli).
export async function getActivity(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    select: { id: true, userId: true, departmentId: true },
  });
  if (!ticket) throw new AppError(404, 'Ticket not found');
  if (!(await canAccessTicket(user, ticket))) {
    throw new AppError(403, 'You do not have access to this ticket');
  }
  const activity = await getTicketActivity(ticket.id);
  const visible = isStaff(user.role) ? activity : activity.filter((a) => a.action !== 'ticket.note');
  res.json({ activity: visible });
}

// POST /tickets/:id/csat — talep sahibi kapalı bir talebi puanlar (bir kez).
export async function submitCsat(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const { rating, comment } = csatSchema.parse(req.body);

  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!ticket) throw new AppError(404, 'Ticket not found');
  if (ticket.userId !== user.id) throw new AppError(403, 'Only the requester can rate this ticket');
  if (ticket.status !== 'closed') throw new AppError(422, 'You can only rate a closed ticket');
  if (ticket.csatRating != null) throw new AppError(422, 'This ticket has already been rated');

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { csatRating: rating, csatComment: comment ?? null, csatAt: new Date() },
  });
  audit('ticket.csat', { ticketId: ticket.id, actorId: user.id, actorName: user.email, detail: { rating } });

  const full = await prisma.ticket.findUnique({ where: { id: ticket.id }, include: ticketDetailInclude });
  res.json({ ticket: serialize(filterReplies(full!, user)) });
}

// GET /tickets/tags — kullanıcının kapsamı içindeki benzersiz tag'ler (filtreleme için).
export async function listTags(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const scopeWhere = await buildTicketScope(user);
  const rows = await prisma.ticket.findMany({ where: scopeWhere, select: { tags: true }, take: 5000 });
  const set = new Set<string>();
  rows.forEach((r) => r.tags.forEach((t) => set.add(t)));
  res.json({ tags: [...set].sort((a, b) => a.localeCompare(b, 'tr')) });
}

// POST /tickets/bulk — birden fazla talebe bir eylem uygula (staff).
export async function bulkUpdate(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const { ids, action, status, assigneeIds } = bulkTicketSchema.parse(req.body);
  let updated = 0;
  let skipped = 0;

  for (const id of ids) {
    const t = await prisma.ticket.findUnique({
      where: { id },
      select: { id: true, userId: true, departmentId: true, status: true },
    });
    if (!t || !(await canAccessTicket(user, t))) {
      skipped += 1;
      continue;
    }

    if (action === 'status') {
      if (!status) {
        skipped += 1;
        continue;
      }
      await prisma.ticket.update({
        where: { id },
        data: { status, resolvedAt: status === 'closed' ? new Date() : null },
      });
      audit('ticket.status', {
        ticketId: id,
        actorId: user.id,
        actorName: user.email,
        detail: { to: status, bulk: true },
      });
      if (status === 'closed' && t.status !== 'closed') void enqueueCsatRequest(id);
      emitTicketUpdated(t, []);
      updated += 1;
    } else if (action === 'assign') {
      if (!assigneeIds) {
        skipped += 1;
        continue;
      }
      try {
        await validateAssignees(assigneeIds, t.departmentId);
      } catch {
        skipped += 1;
        continue;
      }
      await setAssignees(id, assigneeIds);
      audit('ticket.assigned', {
        ticketId: id,
        actorId: user.id,
        actorName: user.email,
        detail: { assignees: assigneeIds, bulk: true },
      });
      emitTicketUpdated(t, assigneeIds);
      updated += 1;
    } else if (action === 'delete') {
      if (user.role !== 'admin' && t.userId !== user.id) {
        skipped += 1;
        continue;
      }
      await prisma.ticket.delete({ where: { id } });
      audit('ticket.deleted', { ticketId: id, actorId: user.id, actorName: user.email, detail: { bulk: true } });
      emitTicketDeleted(t);
      updated += 1;
    }
  }

  res.json({ updated, skipped });
}

// GET /tickets/estimate?priority=&departmentId= — tahmini yanıt/çözüm süresi.
export async function getEstimate(req: Request, res: Response): Promise<void> {
  const parsedPriority = priorityEnum.safeParse(req.query.priority);
  const priority = parsedPriority.success ? parsedPriority.data : 'medium';
  const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : null;
  const est = await estimateForTicket(priority, departmentId);
  res.json(est);
}
