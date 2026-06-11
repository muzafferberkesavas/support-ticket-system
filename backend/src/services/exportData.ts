import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { buildTicketScope, type Principal } from './access';

// Dışa aktarımın ortak veri katmanı. Hem worker (e-posta eki) hem de senkron
// indirme endpoint'i bunu kullanır. Varlığa göre (tickets | users) kolon
// sözleşmesi ve satırlar üretilir; sonuç file-service'e aynen gönderilir.

export type ExportEntity = 'tickets' | 'users';

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

export type ExportRow = Record<string, string>;

export interface ExportFilters {
  status?: string;
  priority?: string;
  departmentId?: string;
  tag?: string;
  search?: string;
  role?: string; // yalnızca users dışa aktarımı için
}

// file-service'in beklediği kolon sözleşmeleri (Excel/PDF için ortak).
const TICKET_COLUMNS: ExportColumn[] = [
  { header: 'Konu', key: 'subject', width: 34 },
  { header: 'Talep Sahibi', key: 'requester', width: 22 },
  { header: 'Departman', key: 'department', width: 18 },
  { header: 'Öncelik', key: 'priority', width: 10 },
  { header: 'Durum', key: 'status', width: 12 },
  { header: 'Etiketler', key: 'tags', width: 22 },
  { header: 'Oluşturulma', key: 'createdAt', width: 18 },
];

const USER_COLUMNS: ExportColumn[] = [
  { header: 'E-posta', key: 'email', width: 28 },
  { header: 'Ad Soyad', key: 'fullName', width: 24 },
  { header: 'Rol', key: 'role', width: 14 },
  { header: 'Departmanlar', key: 'departments', width: 28 },
  { header: 'Oluşturulma', key: 'createdAt', width: 18 },
];

// Tarihi okunabilir TR formatına çevirir (GG.AA.YYYY SS:dd).
function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export interface ExportResult {
  columns: ExportColumn[];
  rows: ExportRow[];
  count: number;
}

// ── Talepler ─────────────────────────────────────────────────────────
async function buildTicketExport(requester: Principal, filters: ExportFilters): Promise<ExportResult> {
  const scope = await buildTicketScope(requester);

  const f: Prisma.TicketWhereInput[] = [];
  if (filters.status) f.push({ status: filters.status as never });
  if (filters.priority) f.push({ priority: filters.priority as never });
  if (filters.departmentId) f.push({ departmentId: filters.departmentId });
  if (filters.tag) f.push({ tags: { has: filters.tag } });
  if (filters.search) {
    f.push({
      OR: [
        { subject: { contains: filters.search, mode: 'insensitive' } },
        { message: { contains: filters.search, mode: 'insensitive' } },
      ],
    });
  }
  const where: Prisma.TicketWhereInput = f.length ? { AND: [scope, ...f] } : scope;

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 5000,
    include: {
      user: { select: { fullName: true, email: true } },
      department: { select: { name: true } },
    },
  });

  const rows: ExportRow[] = tickets.map((t) => ({
    subject: t.subject,
    requester: t.user?.fullName || t.user?.email || '',
    department: t.department?.name || '',
    priority: t.priority,
    status: t.status,
    tags: (t.tags || []).join('; '),
    createdAt: formatDate(t.createdAt),
  }));

  return { columns: TICKET_COLUMNS, rows, count: rows.length };
}

// ── Kullanıcılar (yalnızca admin; yetki controller'da denetlenir) ────
async function buildUserExport(filters: ExportFilters): Promise<ExportResult> {
  const where: Prisma.UserWhereInput = {};
  if (filters.role) where.role = filters.role as never;
  if (filters.departmentId) where.memberships = { some: { departmentId: filters.departmentId } };
  if (filters.search) {
    where.OR = [
      { email: { contains: filters.search, mode: 'insensitive' } },
      { fullName: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 5000,
    include: { memberships: { include: { department: { select: { name: true } } } } },
  });

  const rows: ExportRow[] = users.map((u) => ({
    email: u.email,
    fullName: u.fullName || '',
    role: u.role,
    departments: u.memberships.map((m) => m.department.name).join('; '),
    createdAt: formatDate(u.createdAt),
  }));

  return { columns: USER_COLUMNS, rows, count: rows.length };
}

// Varlığa göre dışa aktarım verisini üretir.
export function buildExportData(
  entity: ExportEntity,
  requester: Principal,
  filters: ExportFilters,
): Promise<ExportResult> {
  return entity === 'users' ? buildUserExport(filters) : buildTicketExport(requester, filters);
}

// İndirilen dosyaların ad/başlık metası (varlığa göre).
export const EXPORT_META: Record<ExportEntity, { baseName: string; title: string; sheet: string }> = {
  tickets: { baseName: 'talepler-export', title: 'Talep Dışa Aktarımı', sheet: 'Talepler' },
  users: { baseName: 'kullanicilar-export', title: 'Kullanıcı Dışa Aktarımı', sheet: 'Kullanıcılar' },
};

// Kolon + satırlardan UTF-8 CSV üretir (file-service gerektirmeyen yerel format).
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function buildCsv(columns: ExportColumn[], rows: ExportRow[]): string {
  const head = columns.map((c) => c.header);
  const body = rows.map((r) => columns.map((c) => r[c.key] ?? ''));
  return [head, ...body].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
