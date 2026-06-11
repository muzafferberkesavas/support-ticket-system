import { prisma } from '../../prisma';
import type { ImportAdapter, ImportContext } from './types';

const PRIORITIES = ['low', 'medium', 'high'];
const STATUSES = ['open', 'in_progress', 'closed'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function pick(raw: Record<string, string>, aliases: string[]): string {
  const lower: Record<string, string> = {};
  for (const k of Object.keys(raw)) lower[k.trim().toLowerCase()] = raw[k];
  for (const a of aliases) {
    const v = lower[a];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

interface TicketCtx extends ImportContext {
  deptByName: Map<string, string>;
  userByEmail: Map<string, string>;
}

// Talepler doğal bir benzersiz anahtara sahip değildir → dedupStrategy 'none'.
// Her satır yeni talep olarak oluşturulur; yalnızca dosya-içi tam-satır tekrarı
// (buildPreview tarafından) uyarılır. Mevcut kayıt güncelleme/atlama uygulanmaz.
export const ticketImportAdapter: ImportAdapter = {
  entity: 'tickets',
  dedupStrategy: 'none',
  displayColumns: ['subject', 'requester', 'department', 'priority', 'status'],

  async buildContext(): Promise<TicketCtx> {
    const [depts, users] = await Promise.all([
      prisma.department.findMany({ select: { id: true, name: true } }),
      prisma.user.findMany({ select: { id: true, email: true } }),
    ]);
    return {
      deptByName: new Map(depts.map((d) => [d.name.trim().toLowerCase(), d.id])),
      userByEmail: new Map(users.map((u) => [u.email.trim().toLowerCase(), u.id])),
    };
  },

  parseRow(raw, ctx) {
    const c = ctx as TicketCtx;
    const errors: string[] = [];

    const subject = pick(raw, ['subject', 'konu', 'başlık', 'baslik']);
    const message = pick(raw, ['message', 'mesaj', 'açıklama', 'aciklama', 'description']);
    const requesterEmail = pick(raw, ['requester', 'talep sahibi', 'email', 'e-posta', 'user']).toLowerCase();
    const priorityRaw = pick(raw, ['priority', 'öncelik', 'oncelik']).toLowerCase();
    const statusRaw = pick(raw, ['status', 'durum']).toLowerCase();
    const deptRaw = pick(raw, ['department', 'departman']);
    const category = pick(raw, ['category', 'kategori']);
    const tagsRaw = pick(raw, ['tags', 'etiketler', 'etiket']);

    if (!subject) errors.push('Konu zorunludur.');
    else if (subject.length < 3) errors.push('Konu en az 3 karakter olmalıdır.');
    if (!message) errors.push('Açıklama zorunludur.');
    else if (message.length < 5) errors.push('Açıklama en az 5 karakter olmalıdır.');

    let requesterId = '';
    if (!requesterEmail) errors.push('Talep sahibi e-postası zorunludur.');
    else if (!EMAIL_RE.test(requesterEmail)) errors.push('Geçersiz talep sahibi e-postası.');
    else {
      const id = c.userByEmail.get(requesterEmail);
      if (!id) errors.push(`Talep sahibi bulunamadı: "${requesterEmail}".`);
      else requesterId = id;
    }

    let priority = 'medium';
    if (priorityRaw) {
      if (!PRIORITIES.includes(priorityRaw)) errors.push(`Geçersiz öncelik: "${priorityRaw}" (low/medium/high).`);
      else priority = priorityRaw;
    }

    let status = 'open';
    if (statusRaw) {
      if (!STATUSES.includes(statusRaw)) errors.push(`Geçersiz durum: "${statusRaw}" (open/in_progress/closed).`);
      else status = statusRaw;
    }

    let departmentId: string | null = null;
    if (deptRaw) {
      const id = c.deptByName.get(deptRaw.toLowerCase());
      if (!id) errors.push(`Departman bulunamadı: "${deptRaw}".`);
      else departmentId = id;
    }

    const tags = tagsRaw
      ? tagsRaw
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 15)
      : [];

    return {
      data: { subject, message, requesterId, priority, status, departmentId, category: category || null, tags },
      display: { subject, requester: requesterEmail, department: deptRaw, priority, status },
      errors,
    };
  },

  keyOf() {
    return null; // doğal anahtar yok
  },

  async findExistingKeys() {
    return new Set(); // mevcut tespiti yapılmaz
  },

  async create(data) {
    await prisma.ticket.create({
      data: {
        subject: data.subject as string,
        message: data.message as string,
        priority: data.priority as never,
        status: data.status as never,
        category: (data.category as string | null) ?? null,
        tags: (data.tags as string[]) ?? [],
        departmentId: (data.departmentId as string | null) ?? null,
        userId: data.requesterId as string,
      },
    });
  },

  async update() {
    // Talepler için güncelleme uygulanmaz (dedupStrategy 'none'); çağrılmaz.
  },
};
