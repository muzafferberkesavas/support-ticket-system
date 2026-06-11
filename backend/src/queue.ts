import Queue from 'bull';
import { env } from './env';

// Backend (producer) ile worker (consumer) arasında Redis üzerinden paylaşılan
// tek bir Bull queue. İsimlendirilmiş job'lar farklı iş türlerini tek queue'da tutar.
export interface ReplyEmailJob {
  to: string;
  ticketId: string;
  ticketSubject: string;
  replyMessage: string;
  authorName: string;
}

export interface ExportJob {
  requesterId: string;
  requesterRole: 'user' | 'agent' | 'team_lead' | 'admin';
  email: string;
  requestedByName: string;
  // tickets = talepler, users = kullanıcılar.
  entity: 'tickets' | 'users';
  // csv = worker yerel üretir; excel/pdf = file-service mikroservisinden alınır.
  format: 'csv' | 'excel' | 'pdf';
  filters: Record<string, string | undefined>;
}

export const JOB_REPLY_EMAIL = 'reply-email';
export const JOB_DAILY_DIGEST = 'daily-digest';
export const JOB_SLA_SWEEP = 'sla-sweep';
export const JOB_CSAT_REQUEST = 'csat-request';
export const JOB_EXPORT = 'export-tickets';

export const mailQueue = new Queue('mail', env.REDIS_URL, {
  // Sağlayıcı gönderim limitlerinin (Gmail ~500/gün) altında kalmak için rate limit.
  limiter: { max: 30, duration: 60_000 },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

// ── Producer'lar (backend'den çağrılır) ──────────────────────────────
export function enqueueReplyEmail(data: ReplyEmailJob) {
  return mailQueue.add(JOB_REPLY_EMAIL, data);
}

export function enqueueDigestNow() {
  return mailQueue.add(JOB_DAILY_DIGEST, { manual: true });
}

// Gecikmeli job: CSAT anketi e-postası, talep kapandıktan CSAT_DELAY_MS sonra gönderilir.
export function enqueueCsatRequest(ticketId: string) {
  return mailQueue.add(JOB_CSAT_REQUEST, { ticketId }, { delay: env.CSAT_DELAY_MS });
}

// İstekten ayrılan ağır iş: CSV dışa aktarımı oluşturup e-posta ile gönder.
export function enqueueExport(data: ExportJob) {
  return mailQueue.add(JOB_EXPORT, data);
}

// Tekrarlanan cron job'larını kaydeder (worker açılışta çağırır).
export async function scheduleRepeatables(): Promise<void> {
  // Değişen cron ifadelerinin etkili olması için önceki tekrarlananları temizle.
  const existing = await mailQueue.getRepeatableJobs();
  await Promise.all(existing.map((r) => mailQueue.removeRepeatableByKey(r.key)));
  await mailQueue.add(JOB_DAILY_DIGEST, {}, { repeat: { cron: env.DIGEST_CRON } });
  await mailQueue.add(JOB_SLA_SWEEP, {}, { repeat: { cron: env.SLA_SWEEP_CRON } });
}
