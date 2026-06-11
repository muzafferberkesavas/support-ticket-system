import { mailQueue } from '../queue';
import { emitToRoom, rooms } from './emitter';

// Operasyon dashboard'unun canlı verisi: Bull kuyruğundan job sayaçları ve son
// işlemler. Sayaçlar her zaman MUTLAK snapshot olarak yayınlanır (delta sayılmaz)
// → birden çok worker instance'ında çift sayım olmaz.

export interface JobStats {
  active: number;
  completed: number;
  failed: number;
  waiting: number;
  delayed: number;
}

export interface RecentOp {
  id: string;
  name: string; // ham job adı (frontend i18n ile etiketler)
  status: 'completed' | 'failed';
  finishedAt: number | null;
  summary: string;
}

// Anlık kuyruk sayaçları.
export async function getJobStats(): Promise<JobStats> {
  const c = await mailQueue.getJobCounts();
  return {
    active: c.active ?? 0,
    completed: c.completed ?? 0,
    failed: c.failed ?? 0,
    waiting: c.waiting ?? 0,
    delayed: c.delayed ?? 0,
  };
}

// Bir job'un dönüş değerinden kısa, insan-okur bir özet üretir.
function summarize(job: { name: string; returnvalue?: unknown; failedReason?: string }): string {
  if (job.failedReason) return job.failedReason.slice(0, 120);
  const r = job.returnvalue as Record<string, unknown> | null | undefined;
  if (!r || typeof r !== 'object') return '';
  if (typeof r.count === 'number') return `${r.count} kayıt`;
  if (typeof r.sent === 'number') return `${r.sent} alıcı`;
  if (typeof r.imported === 'number') return `${r.imported} eklendi, ${r.failed ?? 0} hata`;
  if (typeof r.escalated === 'number') return `${r.escalated} eskalasyon`;
  return '';
}

// Son tamamlanan/başarısız job'lar (her tür) — "son işlemler" listesi için.
export async function getRecentOps(limit = 12): Promise<RecentOp[]> {
  const jobs = await mailQueue.getJobs(['completed', 'failed'], 0, limit * 2);
  const ops = jobs
    .filter(Boolean)
    .map((j) => ({
      id: String(j.id),
      name: j.name,
      status: (j.finishedOn && !j.failedReason ? 'completed' : j.failedReason ? 'failed' : 'completed') as
        | 'completed'
        | 'failed',
      finishedAt: j.finishedOn ?? j.processedOn ?? null,
      summary: summarize(j),
    }))
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  return ops.slice(0, limit);
}

// ── Throttle'lı canlı yayın (worker tarafından çağrılır) ─────────────
let lastEmit = 0;
let pending: ReturnType<typeof setTimeout> | null = null;
const THROTTLE_MS = 300;

async function doEmitStats(): Promise<void> {
  lastEmit = Date.now();
  try {
    emitToRoom(rooms.admin, 'job:stats', await getJobStats());
  } catch (err) {
    console.error('job:stats emit failed:', err);
  }
}

// Sayaç snapshot'ını admin odasına yayınla (leading + trailing throttle).
export function emitJobStats(): void {
  const now = Date.now();
  const since = now - lastEmit;
  if (since >= THROTTLE_MS) {
    void doEmitStats();
  } else if (!pending) {
    pending = setTimeout(() => {
      pending = null;
      void doEmitStats();
    }, THROTTLE_MS - since);
  }
}

// Tek bir tamamlanan/başarısız işlemi "son işlemler" akışına yayınla.
export function emitJobEvent(
  job: { id: string | number; name: string; returnvalue?: unknown; failedReason?: string; finishedOn?: number | null },
  status: 'completed' | 'failed',
): void {
  const op: RecentOp = {
    id: String(job.id),
    name: job.name,
    status,
    finishedAt: job.finishedOn ?? Date.now(),
    summary: summarize(job),
  };
  emitToRoom(rooms.admin, 'job:event', op);
}
