import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { buildTicketScope, type Principal } from './access';

// Talep dışa aktarımının ortak veri katmanı. Hem worker (e-posta eki) hem de
// senkron indirme endpoint'i bu modülü kullanır; kolon sözleşmesi tek yerde
// tanımlıdır ve file-service'e aynen gönderilir.

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

// file-service'in beklediği kolon sözleşmesi (Excel/PDF için ortak).
export const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Konu', key: 'subject', width: 34 },
  { header: 'Talep Sahibi', key: 'requester', width: 22 },
  { header: 'Departman', key: 'department', width: 18 },
  { header: 'Öncelik', key: 'priority', width: 10 },
  { header: 'Durum', key: 'status', width: 12 },
  { header: 'Etiketler', key: 'tags', width: 22 },
  { header: 'Oluşturulma', key: 'createdAt', width: 18 },
];

export type ExportRow = Record<string, string>;

export interface ExportFilters {
  status?: string;
  priority?: string;
  departmentId?: string;
  tag?: string;
  search?: string;
}

// Tarihi okunabilir TR formatına çevirir (GG.AA.YYYY SS:dd).
function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// İstek sahibinin görme yetkisi + filtreleri uygulayıp dışa aktarım satırlarını
// üretir. Sonuç file-service'e gönderilmeye hazır { columns, rows } şeklindedir.
export async function buildExportData(
  requester: Principal,
  filters: ExportFilters,
): Promise<{ columns: ExportColumn[]; rows: ExportRow[]; count: number }> {
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

  return { columns: EXPORT_COLUMNS, rows, count: rows.length };
}

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
