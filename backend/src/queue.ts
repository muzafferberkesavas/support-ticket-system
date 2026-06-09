import Queue from 'bull';
import { env } from './env';

// A single Bull queue shared between the backend (producer) and the worker
// (consumer) over Redis. Named jobs keep different work types in one queue.
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
  filters: Record<string, string | undefined>;
}

export const JOB_REPLY_EMAIL = 'reply-email';
export const JOB_DAILY_DIGEST = 'daily-digest';
export const JOB_SLA_SWEEP = 'sla-sweep';
export const JOB_CSAT_REQUEST = 'csat-request';
export const JOB_EXPORT = 'export-tickets';

export const mailQueue = new Queue('mail', env.REDIS_URL, {
  // Rate limit to stay well under provider sending limits (Gmail ~500/day).
  limiter: { max: 30, duration: 60_000 },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

// ── Producers (called from the backend) ──────────────────────────────
export function enqueueReplyEmail(data: ReplyEmailJob) {
  return mailQueue.add(JOB_REPLY_EMAIL, data);
}

export function enqueueDigestNow() {
  return mailQueue.add(JOB_DAILY_DIGEST, { manual: true });
}

// Delayed job: CSAT survey email is sent CSAT_DELAY_MS after a ticket closes.
export function enqueueCsatRequest(ticketId: string) {
  return mailQueue.add(JOB_CSAT_REQUEST, { ticketId }, { delay: env.CSAT_DELAY_MS });
}

// Heavy work offloaded from the request: build a CSV export and email it.
export function enqueueExport(data: ExportJob) {
  return mailQueue.add(JOB_EXPORT, data);
}

// Registers the repeatable cron jobs (called by the worker on boot).
export async function scheduleRepeatables(): Promise<void> {
  // Clear prior repeatables so changed cron expressions take effect.
  const existing = await mailQueue.getRepeatableJobs();
  await Promise.all(existing.map((r) => mailQueue.removeRepeatableByKey(r.key)));
  await mailQueue.add(JOB_DAILY_DIGEST, {}, { repeat: { cron: env.DIGEST_CRON } });
  await mailQueue.add(JOB_SLA_SWEEP, {}, { repeat: { cron: env.SLA_SWEEP_CRON } });
}
